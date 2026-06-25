import { NextResponse } from "next/server";
import { redis } from "../../../../lib/store";
import { roomKey } from "../route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROOM_TTL = 60 * 60 * 24;

// ---- helpers ----------------------------------------------------------------

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function addLog(room, msg, type = "action") {
  room.log = [{ ts: Date.now(), msg, type }, ...(room.log || [])].slice(0, 200);
}

function playerSlot(room, playerId) {
  if (room.players.p1?.id === playerId) return "p1";
  if (room.players.p2?.id === playerId) return "p2";
  return null;
}

function opponent(slot) { return slot === "p1" ? "p2" : "p1"; }

function makePlayCard(card) {
  return { ...card, playId: uid() };
}

function makeBFSlot(card, position = "Frontline") {
  return {
    card: makePlayCard(card),
    position,
    exhausted: false,
    damage: 0,
    atkBonus: 0,
    hpBonus: 0,
    markers: [],
  };
}

function makePlayerState(processedDeck) {
  const { companion, mainDeck } = processedDeck;
  const shuffled = shuffle(mainDeck.map(makePlayCard));
  const hand = shuffled.slice(0, 6);
  const deck = shuffled.slice(6);
  return {
    deck,
    hand,
    battlefield: [null, null, null, null],
    legendZone: companion ? makeBFSlot(companion, companion.position || "Frontline") : null,
    graveyard: [],
    exile: [],
    health: 30,
    provisions: 0,
    mana: 0,
    hasMulliganed: false,
    mulliganDone: false,
    hasTakenFirstTurn: false,
  };
}

// Called when both players are ready — initialises game state
function startGame(room) {
  const p1State = makePlayerState(room.players.p1.processedDeck);
  const p2State = makePlayerState(room.players.p2.processedDeck);
  room.gs = { p1: p1State, p2: p2State };
  room.status = "mulligan";
  room.currentTurn = null;
  room.turnNumber = 0;
  addLog(room, "Game started! Both players may now mulligan.", "system");
}

// Called when both mulligans are done — activate game
function activateGame(room) {
  room.status = "active";
  room.currentTurn = "p1";
  room.turnNumber = 1;
  // p1 starts with 2P / 2M
  room.gs.p1.provisions = 2;
  room.gs.p1.mana = 2;
  room.gs.p2.provisions = 0;
  room.gs.p2.mana = 0;
  addLog(room, `Turn 1 begins — ${room.players.p1.name}'s turn.`, "system");
}

// ---- action handlers --------------------------------------------------------

function handleJoin(room, { playerId, playerName }) {
  if (room.status === "closed") return { error: "Room is closed." };
  // Existing player rejoin — clear left flag
  if (room.players.p1?.id === playerId) { room.players.p1.left = false; return { ok: true }; }
  if (room.players.p2?.id === playerId) { room.players.p2.left = false; return { ok: true }; }
  // New player joining
  if (room.status !== "lobby") return { error: "Game already in progress." };
  if (room.players.p2)          return { error: "Room is full." };
  room.players.p2 = { id: playerId, name: playerName, deckId: null, ready: false, processedDeck: null };
  addLog(room, `${playerName} joined the room.`, "system");
  return { ok: true };
}

function handleSelectDeck(room, { playerId, deckId, deckName, processedDeck }) {
  const slot = playerSlot(room, playerId);
  if (!slot) return { error: "Not in room" };
  room.players[slot].deckId = deckId;
  room.players[slot].deckName = deckName;
  room.players[slot].processedDeck = processedDeck;
  room.players[slot].ready = false;
  const pname = room.players[slot].name;
  addLog(room, `${pname} selected deck: ${deckName || "unnamed"}.`, "system");
  return { ok: true };
}

function handleSetReady(room, { playerId }) {
  const slot = playerSlot(room, playerId);
  if (!slot) return { error: "Not in room" };
  if (!room.players[slot].processedDeck) return { error: "Select a deck first" };
  room.players[slot].ready = true;
  addLog(room, `${room.players[slot].name} is ready!`, "system");
  if (room.players.p1?.ready && room.players.p2?.ready) startGame(room);
  return { ok: true };
}

function handleMulligan(room, { playerId, indices }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  const ps = room.gs[slot];
  if (ps.mulliganDone) return { error: "Already mulliganed" };

  if (indices.length > 0) {
    const toReturn = indices.map(i => ps.hand[i]).filter(Boolean);
    const kept = ps.hand.filter((_, i) => !indices.includes(i));
    ps.deck = shuffle([...ps.deck, ...toReturn]);
    const drawn = ps.deck.splice(0, toReturn.length);
    ps.hand = [...kept, ...drawn];
    addLog(room, `${room.players[slot].name} mulliganed ${indices.length} card(s).`, "action");
  } else {
    addLog(room, `${room.players[slot].name} kept their hand.`, "action");
  }
  ps.hasMulliganed = true;
  ps.mulliganDone = true;

  if (room.gs.p1.mulliganDone && room.gs.p2.mulliganDone) activateGame(room);
  return { ok: true };
}

function handlePlayCard(room, { playerId, handIndex, slotIndex, position }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  const ps = room.gs[slot];
  const card = ps.hand[handIndex];
  if (!card) return { error: "No card at that hand index" };
  if (ps.battlefield[slotIndex] !== null) return { error: "Slot occupied" };

  ps.hand.splice(handIndex, 1);
  ps.battlefield[slotIndex] = makeBFSlot(card, position || card.position || "Frontline");
  addLog(room, `${room.players[slot].name} played ${card.name}.`, "action");
  return { ok: true };
}

function handleExileFromHand(room, { playerId, handIndex }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  const ps = room.gs[slot];
  const card = ps.hand[handIndex];
  if (!card) return { error: "No card" };
  ps.hand.splice(handIndex, 1);
  ps.exile.push(card);
  addLog(room, `${room.players[slot].name} played event: ${card.name}.`, "action");
  return { ok: true };
}

function handleMoveCard(room, { playerId, fromSlot, toSlot }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  const ps = room.gs[slot];
  if (ps.battlefield[fromSlot] === null) return { error: "No card at fromSlot" };
  if (ps.battlefield[toSlot] !== null) return { error: "Destination occupied" };
  ps.battlefield[toSlot] = ps.battlefield[fromSlot];
  ps.battlefield[fromSlot] = null;
  return { ok: true };
}

function handleSendToGraveyard(room, { playerId, slotIndex }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  const ps = room.gs[slot];
  const bfSlot = ps.battlefield[slotIndex];
  if (!bfSlot) return { error: "No card" };
  ps.graveyard.push(bfSlot.card);
  ps.battlefield[slotIndex] = null;
  addLog(room, `${room.players[slot].name} sent ${bfSlot.card.name} to the Graveyard.`, "action");
  return { ok: true };
}

function handleSendToExile(room, { playerId, slotIndex }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  const ps = room.gs[slot];
  const bfSlot = ps.battlefield[slotIndex];
  if (!bfSlot) return { error: "No card" };
  ps.exile.push(bfSlot.card);
  ps.battlefield[slotIndex] = null;
  addLog(room, `${room.players[slot].name} exiled ${bfSlot.card.name}.`, "action");
  return { ok: true };
}

function handleGraveyardToExile(room, { playerId, gyIndex }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  const ps = room.gs[slot];
  const card = ps.graveyard[gyIndex];
  if (!card) return { error: "No card" };
  ps.graveyard.splice(gyIndex, 1);
  ps.exile.push(card);
  addLog(room, `${room.players[slot].name} moved ${card.name} from Graveyard to Exile.`, "action");
  return { ok: true };
}

function handleDraw(room, { playerId }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  const ps = room.gs[slot];
  if (ps.deck.length === 0) return { error: "Deck empty" };
  ps.hand.push(ps.deck.shift());
  addLog(room, `${room.players[slot].name} drew a card. (${ps.deck.length} left)`, "action");
  return { ok: true };
}

function handleShuffle(room, { playerId }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  room.gs[slot].deck = shuffle(room.gs[slot].deck);
  addLog(room, `${room.players[slot].name} shuffled their deck.`, "action");
  return { ok: true };
}

function handlePassTurn(room, { playerId }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  if (room.currentTurn !== slot) return { error: "Not your turn" };

  const ps = room.gs[slot];
  ps.hasTakenFirstTurn = true;
  // Unexhaust all units on this player's side
  ps.battlefield = ps.battlefield.map(s => s ? { ...s, exhausted: false } : null);

  const next = opponent(slot);
  const nextPs = room.gs[next];
  room.currentTurn = next;
  room.turnNumber += 1;

  // Resource regen for next player
  const maxRes = 10;
  const bonus = !nextPs.hasTakenFirstTurn && next === "p2" ? 1 : 0;
  nextPs.provisions = Math.min(maxRes, nextPs.provisions + 2 + bonus);
  nextPs.mana       = Math.min(maxRes, nextPs.mana + 2);

  addLog(room, `${room.players[slot].name} passed the turn. Now ${room.players[next].name}'s turn (T${room.turnNumber}).`, "system");
  return { ok: true };
}

function handleUpdateResource(room, { playerId, resource, delta }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  if (!["health", "provisions", "mana"].includes(resource)) return { error: "Invalid resource" };
  room.gs[slot][resource] = Math.max(0, (room.gs[slot][resource] || 0) + delta);
  return { ok: true };
}

function handleExhaust(room, { playerId, slotIndex }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  const bfSlot = room.gs[slot].battlefield[slotIndex];
  if (!bfSlot) return { error: "No card" };
  bfSlot.exhausted = !bfSlot.exhausted;
  addLog(room, `${room.players[slot].name} ${bfSlot.exhausted ? "exhausted" : "unexhausted"} ${bfSlot.card.name}.`, "action");
  return { ok: true };
}

function handleModifyCounter(room, { playerId, slotIndex, counterType, delta }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  const bfSlot = room.gs[slot].battlefield[slotIndex];
  if (!bfSlot) return { error: "No card" };
  if (counterType === "damage") bfSlot.damage = Math.max(0, (bfSlot.damage || 0) + delta);
  else if (counterType === "atk") bfSlot.atkBonus = (bfSlot.atkBonus || 0) + delta;
  else if (counterType === "hp") bfSlot.hpBonus = (bfSlot.hpBonus || 0) + delta;
  return { ok: true };
}

function handleToggleMarker(room, { playerId, slotIndex, marker }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  const bfSlot = room.gs[slot].battlefield[slotIndex];
  if (!bfSlot) return { error: "No card" };
  bfSlot.markers = bfSlot.markers || [];
  if (bfSlot.markers.includes(marker)) {
    bfSlot.markers = bfSlot.markers.filter(m => m !== marker);
  } else {
    bfSlot.markers.push(marker);
  }
  return { ok: true };
}

function handleModifyLegendCounter(room, { playerId, counterType, delta }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  const lz = room.gs[slot].legendZone;
  if (!lz) return { error: "No legend" };
  if (counterType === "damage") lz.damage = Math.max(0, (lz.damage || 0) + delta);
  else if (counterType === "atk") lz.atkBonus = (lz.atkBonus || 0) + delta;
  else if (counterType === "hp") lz.hpBonus = (lz.hpBonus || 0) + delta;
  return { ok: true };
}

function handleAddToken(room, { playerId, slotIndex, tokenName, position }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  if (room.gs[slot].battlefield[slotIndex] !== null) return { error: "Slot occupied" };
  const token = {
    id: "token-" + uid(), playId: uid(), type: "Unit",
    name: tokenName || "Token", race: "Token", klass: "",
    attack: 1, health: 1, provisions: 0, mana: 0,
    rarity: "Common", keywords: [], tribes: [], abilities: [],
  };
  room.gs[slot].battlefield[slotIndex] = { card: token, position: position || "Frontline", exhausted: false, damage: 0, atkBonus: 0, hpBonus: 0, markers: [] };
  addLog(room, `${room.players[slot].name} created token: ${token.name}.`, "action");
  return { ok: true };
}

function handleStartSolo(room, { playerId }) {
  const slot = playerSlot(room, playerId);
  if (!slot) return { error: "Not in room" };
  if (room.status !== "lobby") return { error: "Game already started" };
  if (!room.players[slot]?.processedDeck) return { error: "Select a deck first" };
  if (room.players.p2 && !room.players.p2.isBot) return { error: "Room already has two players" };
  const botId = "bot-" + room.roomId;
  room.players.p2 = {
    id: botId, name: "Test Bot", deckId: "solo-test", ready: true, isBot: true,
    processedDeck: room.players[slot].processedDeck,
  };
  room.players[slot].ready = true;
  startGame(room);
  addLog(room, "Solo test mode — controlling both sides.", "system");
  return { ok: true };
}

function handleChat(room, { playerId, message }) {
  const slot = playerSlot(room, playerId);
  if (!slot) return { error: "Not in room" };
  if (!message?.trim()) return { ok: true };
  addLog(room, `${room.players[slot]?.name || "?"}: ${message.trim()}`, "chat");
  return { ok: true };
}

function handleLeaveRoom(room, { playerId }) {
  const slot = playerSlot(room, playerId);
  if (!slot) return { ok: true };
  room.players[slot].left = true;
  if (room.status === "lobby") {
    const opp = opponent(slot);
    if (!room.players[opp] || room.players[opp]?.left) {
      room.status = "closed";
      addLog(room, "Room closed — all players left.", "system");
    }
  }
  return { ok: true };
}

function handleRequestRematch(room, { playerId }) {
  const slot = playerSlot(room, playerId);
  if (!slot) return { error: "Not in room" };
  if (room.status !== "ended") return { error: "Game is not over yet." };
  room.players[slot].rematchReady = true;
  addLog(room, `${room.players[slot].name} wants a rematch!`, "system");
  if (room.players.p1?.rematchReady && room.players.p2?.rematchReady) {
    room.players.p1.rematchReady = false;
    room.players.p2.rematchReady = false;
    room.winner = null;
    room.turnNumber = 0;
    startGame(room);
    addLog(room, "Rematch! New game starting…", "system");
  }
  return { ok: true };
}

function handleConcede(room, { playerId }) {
  const slot = playerSlot(room, playerId);
  if (!slot) return { error: "Not in room" };
  room.status = "ended";
  room.winner = opponent(slot);
  addLog(room, `${room.players[slot].name} conceded. ${room.players[room.winner].name} wins!`, "system");
  return { ok: true };
}

function handleHandToGraveyard(room, { playerId, handIndex }) {
  const slot = playerSlot(room, playerId);
  if (!slot || !room.gs) return { error: "Invalid" };
  const ps = room.gs[slot];
  const card = ps.hand[handIndex];
  if (!card) return { error: "No card" };
  ps.hand.splice(handIndex, 1);
  ps.graveyard.push(card);
  addLog(room, `${room.players[slot].name} discarded ${card.name}.`, "action");
  return { ok: true };
}

const ACTION_MAP = {
  join:                handleJoin,
  select_deck:         handleSelectDeck,
  set_ready:           handleSetReady,
  mulligan:            handleMulligan,
  play_card:           handlePlayCard,
  exile_from_hand:     handleExileFromHand,
  move_card:           handleMoveCard,
  send_to_graveyard:   handleSendToGraveyard,
  send_to_exile:       handleSendToExile,
  graveyard_to_exile:  handleGraveyardToExile,
  hand_to_graveyard:   handleHandToGraveyard,
  draw:                handleDraw,
  shuffle:             handleShuffle,
  pass_turn:           handlePassTurn,
  update_resource:     handleUpdateResource,
  exhaust:             handleExhaust,
  modify_counter:      handleModifyCounter,
  modify_legend_counter: handleModifyLegendCounter,
  toggle_marker:       handleToggleMarker,
  add_token:           handleAddToken,
  concede:             handleConcede,
  start_solo:          handleStartSolo,
  chat:                handleChat,
  leave_room:          handleLeaveRoom,
  request_rematch:     handleRequestRematch,
};

// ---- state sanitiser — hide opponent hand/deck order -------------------------

function sanitiseForPlayer(room, mySlot) {
  if (!room.gs || !mySlot) return room;
  const r = JSON.parse(JSON.stringify(room));
  const oppSlot = opponent(mySlot);
  const opp = r.gs[oppSlot];
  opp.hand = opp.hand.map(() => ({ hidden: true }));
  opp.deck = opp.deck.map(() => ({ hidden: true }));
  return r;
}

// ---- route handlers ----------------------------------------------------------

export async function GET(req, { params }) {
  const { roomId } = await params;
  const pid = new URL(req.url).searchParams.get("pid");
  try {
    const raw = await redis.get(roomKey(roomId));
    if (!raw) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    const room = typeof raw === "string" ? JSON.parse(raw) : raw;
    const mySlot = pid ? playerSlot(room, pid) : null;
    return NextResponse.json(sanitiseForPlayer(room, mySlot));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  const { roomId } = await params;
  try {
    const body = await req.json();
    const { action, ...payload } = body;

    const handler = ACTION_MAP[action];
    if (!handler) return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

    const raw = await redis.get(roomKey(roomId));
    if (!raw) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    const room = typeof raw === "string" ? JSON.parse(raw) : raw;

    const result = handler(room, payload);
    if (result?.error) return NextResponse.json({ error: result.error }, { status: 400 });

    room.updatedAt = Date.now();
    await redis.set(roomKey(roomId), JSON.stringify(room), { ex: ROOM_TTL });

    const mySlot = payload.playerId ? playerSlot(room, payload.playerId) : null;
    return NextResponse.json({ ok: true, room: sanitiseForPlayer(room, mySlot) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
