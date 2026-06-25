"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================================
   Partyfall — Multiplayer Live Play  /play
   Alt + hover → zoom card. Alt + scroll → scale zoom.
   Chat via right panel. Reconnect by entering same room code.
============================================================================ */

// ---- constants --------------------------------------------------------------
const COMPANION_TYPES = ["Ancient Legend", "Ancient Relic"];
const UNIT_LIKE = ["Unit", "Ancient Legend"];
const STATUS_MARKERS = ["Guard","Reach","Aerial","Ward","Stealth","Poisoned","Burned","Stunned","Empowered","Silenced"];
const MARKER_COLORS = { Guard:"#f59e0b",Reach:"#10b981",Aerial:"#3b82f6",Ward:"#8b5cf6",Stealth:"#6b7280",Poisoned:"#84cc16",Burned:"#ef4444",Stunned:"#6366f1",Empowered:"#f97316",Silenced:"#94a3b8" };
const TYPE_COLORS = { "Unit":"#8b5cf6","Ancient Relic":"#f59e0b","Event":"#10b981","Artifact":"#3b82f6","Ancient Legend":"#a78bfa" };

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);

function getOrCreatePlayer() {
  if (typeof window === "undefined") return { id: "", name: "" };
  let id = localStorage.getItem("pf_player_id");
  if (!id) { id = uid(); localStorage.setItem("pf_player_id", id); }
  return { id, name: localStorage.getItem("pf_player_name") || "" };
}

// ---- legality ---------------------------------------------------------------
function checkLegality(deck) {
  const cards = deck.cards || [];
  const companions = cards.filter(e => COMPANION_TYPES.includes(e.card.type));
  const mainCards  = cards.filter(e => !COMPANION_TYPES.includes(e.card.type));
  const total = mainCards.reduce((s, e) => s + e.count, 0);
  const errors = [];
  if (companions.length === 0) errors.push("Missing a Companion (Ancient Legend or Ancient Relic).");
  if (companions.length > 1)   errors.push("Only 1 Companion allowed.");
  if (total < 30)  errors.push(`Main deck too small (${total}/30 min).`);
  if (total > 40)  errors.push(`Main deck too large (${total}/40 max).`);
  for (const e of mainCards) {
    const limit = e.card.type === "Unit" ? 2 : 3;
    if (e.count > limit) errors.push(`${e.card.name}: max ${limit} copies.`);
  }
  return { legal: errors.length === 0, errors, companion: companions[0]?.card || null, mainCards };
}

function buildProcessedDeck(deck) {
  const { companion, mainCards } = checkLegality(deck);
  const flat = [];
  for (const { card, count } of mainCards) for (let i = 0; i < count; i++) flat.push({ ...card });
  return { companion, mainDeck: flat };
}

// ---- api --------------------------------------------------------------------
async function apiPost(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}
async function roomAction(roomId, body) { return apiPost(`/api/play/${roomId}`, body); }
async function fetchRoom(roomId, pid) {
  const r = await fetch(`/api/play/${roomId}?pid=${encodeURIComponent(pid)}`);
  if (!r.ok) return null;
  return r.json();
}

// ============================================================================
// CardZoom — fixed overlay shown when Alt is held over a card
// ============================================================================
function CardZoom({ card, bfSlot, pos, scale }) {
  if (!card || typeof window === "undefined") return null;
  const isUnit = UNIT_LIKE.includes(card.type);
  const typeColor = TYPE_COLORS[card.type] || "#888";
  const curAtk = bfSlot ? (parseInt(card.attack) || 0) + (bfSlot.atkBonus || 0) : (parseInt(card.attack) || 0);
  const curHp  = bfSlot ? Math.max(0, (parseInt(card.health) || 0) + (bfSlot.hpBonus || 0) - (bfSlot.damage || 0)) : (parseInt(card.health) || 0);
  const W = Math.round(208 * scale);
  const x = Math.max(8, Math.min(pos.x + 20, window.innerWidth  - W - 8));
  const y = Math.max(8, Math.min(pos.y - 60,  window.innerHeight - Math.round(420 * scale) - 8));
  return (
    <div className="fixed z-[600] pointer-events-none select-none" style={{ left: x, top: y, transformOrigin: "top left", transform: `scale(${scale})` }}>
      <div className="w-52 bg-neutral-900 border border-neutral-600 rounded-xl shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full" style={{ background: typeColor }} />
        <div className="px-3 py-2 border-b border-neutral-800/60" style={{ background: "#1c1917" }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: typeColor }}>{card.type}</div>
          <p className="font-bold text-amber-200 text-sm leading-tight">{card.name}</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">{[card.race, card.klass, card.rarity].filter(Boolean).join(" · ")}</p>
        </div>
        {card.keywords?.length > 0 && (
          <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b border-neutral-800/60">
            {card.keywords.map(k => <span key={k} className="text-[9px] text-amber-300 border border-amber-500/40 rounded px-1 py-0.5">{k}</span>)}
          </div>
        )}
        {isUnit && (
          <div className="flex border-b border-neutral-700/60 text-center">
            <div className="flex-1 py-1.5 text-rose-300 font-bold text-sm">ATK {curAtk}</div>
            <div className="flex-1 py-1.5 text-emerald-300 font-bold text-sm border-l border-neutral-700/60">HP {curHp}</div>
          </div>
        )}
        {card.text && <p className="text-[10px] text-neutral-300 px-3 pt-2">{card.text}</p>}
        {card.passive && <p className="text-[10px] text-neutral-300 px-3 pt-1.5"><span className="text-amber-400 font-semibold">Passive: </span>{card.passive}</p>}
        {(card.abilities||[]).filter(Boolean).length > 0 && (
          <div className="px-3 pt-1.5 space-y-1">
            {card.abilities.map((ab, i) => {
              const cost = [ab.prov ? `${ab.prov}P` : "", ab.mana ? `${ab.mana}M` : ""].filter(Boolean).join(" ");
              return <p key={i} className="text-[10px] text-neutral-300">{cost ? <span className="text-amber-400 font-semibold">({cost}) </span> : null}{ab.text}</p>;
            })}
          </div>
        )}
        {card.flavor && <p className="text-[9px] italic text-neutral-600 px-3 pt-1">&ldquo;{card.flavor}&rdquo;</p>}
        <div className="px-3 py-1.5 mt-1 text-[8px] text-neutral-700 border-t border-neutral-800/40">
          P{card.provisions||0} · M{card.mana||0}{bfSlot?.damage ? ` · ${bfSlot.damage} dmg` : ""}
          {bfSlot?.markers?.length ? " · " + bfSlot.markers.join(", ") : ""}
        </div>
        <div className="px-3 pb-1.5 text-[8px] text-neutral-800">Alt+Scroll to resize</div>
      </div>
    </div>
  );
}

// ============================================================================
// Small card components
// ============================================================================
function CardBack({ className = "" }) {
  return (
    <div className={"rounded-lg border border-neutral-700 bg-neutral-800 flex items-center justify-center shrink-0 " + className}>
      <div className="w-8 h-12 rounded border border-amber-900/30 bg-gradient-to-br from-amber-950/50 to-neutral-900 flex items-center justify-center text-amber-900/40 text-sm select-none">✦</div>
    </div>
  );
}

function BFCard({ slot, isOwn, isSelected, onClick, onDragStart, onDragEnd, onMouseEnter, onMouseLeave }) {
  if (!slot) return null;
  const { card, position, exhausted, damage, atkBonus, hpBonus, markers } = slot;
  const isUnit = UNIT_LIKE.includes(card.type);
  const typeColor = TYPE_COLORS[card.type] || "#888";
  const curAtk = (parseInt(card.attack)||0) + (atkBonus||0);
  const curHp  = Math.max(0, (parseInt(card.health)||0) + (hpBonus||0) - (damage||0));
  return (
    <div
      className={"relative w-full h-full rounded-lg border overflow-hidden select-none transition-all cursor-pointer " +
        (exhausted ? "opacity-55 " : "") +
        (isSelected ? "border-amber-400 ring-2 ring-amber-400/40 " : "border-neutral-600 hover:border-amber-500/50 ")}
      style={{ background: "linear-gradient(160deg,#1c1917 0%,#0f0f0f 100%)" }}
      draggable={isOwn} onDragStart={onDragStart} onDragEnd={onDragEnd}
      onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
    >
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: typeColor }} />
      <div className="absolute top-1.5 right-1 text-[7px] font-bold text-neutral-600">{position === "Frontline" ? "FL" : "BL"}</div>
      {exhausted && <div className="absolute top-1.5 left-1 text-[8px] text-yellow-500 font-bold">⟳</div>}
      <div className="p-1 pt-2.5">
        <p className="text-[10px] font-semibold text-amber-200 leading-tight line-clamp-2">{card.name||"(token)"}</p>
        <p className="text-[8px] text-neutral-500 truncate">{card.race||card.klass||card.type}</p>
      </div>
      {markers?.length > 0 && (
        <div className="flex flex-wrap gap-0.5 px-1">
          {markers.slice(0,6).map(m => <div key={m} className="w-2 h-2 rounded-full" style={{ background: MARKER_COLORS[m]||"#888" }} title={m} />)}
        </div>
      )}
      {damage > 0 && (
        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-700 text-white text-[8px] flex items-center justify-center font-bold z-10">{damage}</div>
      )}
      {isUnit && (
        <div className="absolute bottom-0 left-0 right-0 flex border-t border-neutral-700/60 text-[10px] font-bold text-center bg-neutral-900/80">
          <div className="flex-1 py-0.5 text-rose-300">{curAtk}</div>
          <div className="flex-1 py-0.5 text-emerald-300 border-l border-neutral-700/60">{curHp}</div>
        </div>
      )}
    </div>
  );
}

function HandCard({ card, isSelected, onClick, onDragStart, onMouseEnter, onMouseLeave }) {
  const isUnit = UNIT_LIKE.includes(card.type);
  const typeColor = TYPE_COLORS[card.type] || "#888";
  return (
    <div
      className={"relative rounded-lg border overflow-hidden select-none transition-all cursor-pointer shrink-0 flex flex-col w-[72px] " +
        (isSelected ? "border-amber-400 -translate-y-2 shadow-amber-400/20 shadow-xl " : "border-neutral-600 hover:border-amber-500/50 hover:-translate-y-1 ")}
      style={{ background: "linear-gradient(160deg,#1c1917 0%,#0f0f0f 100%)" }}
      draggable onDragStart={onDragStart} onClick={onClick}
      onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
    >
      <div className="h-1 w-full shrink-0" style={{ background: typeColor }} />
      <div className="p-1 flex-grow">
        <p className="text-[9px] font-semibold text-amber-200 leading-tight line-clamp-2">{card.name}</p>
        <p className="text-[7px] text-neutral-500 truncate mt-0.5">{card.race||card.type}</p>
        {card.keywords?.length > 0 && <p className="text-[7px] text-amber-600/80 truncate mt-0.5">{card.keywords.slice(0,2).join(", ")}</p>}
      </div>
      <div className="flex border-t border-neutral-700/50 shrink-0">
        <div className="flex-1 text-center py-0.5 text-[7px] text-amber-600/70">P{card.provisions||0}</div>
        <div className="flex-1 text-center py-0.5 text-[7px] text-violet-500/70 border-l border-neutral-700/50">M{card.mana||0}</div>
      </div>
      {isUnit && (
        <div className="flex border-t border-neutral-700/50 shrink-0">
          <div className="flex-1 text-center py-0.5 text-[9px] font-bold text-rose-300">{card.attack||0}</div>
          <div className="flex-1 text-center py-0.5 text-[9px] font-bold text-emerald-300 border-l border-neutral-700/50">{card.health||0}</div>
        </div>
      )}
    </div>
  );
}

// ---- Card detail modal (full controls) --------------------------------------
function CardDetailModal({ card, slot, isOwn, onClose, onExhaust, onDamage, onAtkBonus, onHpBonus, onToggleMarker, onSendToGraveyard, onSendToExile, onChangePosition }) {
  if (!card) return null;
  const isUnit = UNIT_LIKE.includes(card.type);
  const curAtk = slot ? (parseInt(card.attack)||0) + (slot.atkBonus||0) : (parseInt(card.attack)||0);
  const curHp  = slot ? Math.max(0, (parseInt(card.health)||0) + (slot.hpBonus||0) - (slot.damage||0)) : (parseInt(card.health)||0);
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl max-w-md w-full p-5 flex flex-col gap-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: TYPE_COLORS[card.type]||"#888" }}>{card.type}</div>
            <h2 className="text-lg font-bold text-amber-200">{card.name}</h2>
            <p className="text-xs text-neutral-400">{[card.race,card.klass,card.rarity].filter(Boolean).join(" · ")}</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-xl leading-none mt-0.5">✕</button>
        </div>
        {card.keywords?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {card.keywords.map(k => <span key={k} className="text-[10px] font-semibold text-amber-300 border border-amber-500/40 rounded px-1.5 py-0.5">{k}</span>)}
          </div>
        )}
        {isUnit && (
          <div className="grid grid-cols-2 text-center border border-neutral-700 rounded-lg overflow-hidden">
            <div className="py-2 text-rose-300 font-bold text-lg">ATK {curAtk}</div>
            <div className="py-2 text-emerald-300 font-bold text-lg border-l border-neutral-700">HP {curHp}</div>
          </div>
        )}
        {card.text && <p className="text-xs text-neutral-300 bg-neutral-800/50 rounded-lg p-3">{card.text}</p>}
        {card.passive && <p className="text-xs text-neutral-300 bg-neutral-800/50 rounded-lg p-3"><span className="text-amber-400 font-semibold">Passive: </span>{card.passive}</p>}
        {(card.abilities||[]).filter(Boolean).length > 0 && (
          <div className="space-y-1">
            {card.abilities.map((ab,i) => {
              const cost = [ab.prov?`${ab.prov}P`:"",ab.mana?`${ab.mana}M`:""].filter(Boolean).join(" ");
              return <p key={i} className="text-xs text-neutral-300 bg-neutral-800/50 rounded-lg p-2">{cost?<span className="text-amber-400 font-semibold">({cost}) </span>:null}{ab.text}</p>;
            })}
          </div>
        )}
        {slot && isOwn && (
          <div className="border-t border-neutral-700 pt-3 flex flex-col gap-2">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold">Controls</p>
            <div className="flex gap-2">
              {["Frontline","Backline"].map(pos => (
                <button key={pos} onClick={() => onChangePosition(pos)} className={"flex-1 py-1.5 rounded-lg text-xs font-medium transition " + (slot.position===pos ? (pos==="Frontline"?"bg-amber-600 text-white":"bg-violet-700 text-white") : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700")}>{pos}</button>
              ))}
            </div>
            <button onClick={onExhaust} className={"w-full py-1.5 rounded-lg text-xs font-medium transition " + (slot.exhausted?"bg-yellow-700/60 text-yellow-200":"bg-neutral-800 text-neutral-400 hover:bg-neutral-700")}>
              {slot.exhausted ? "⟳ Unexhaust" : "⟲ Exhaust"}
            </button>
            {isUnit && (
              <>
                <div className="flex gap-1 items-center">
                  <span className="text-xs text-neutral-400 w-24">Damage ({slot.damage||0})</span>
                  <button onClick={() => onDamage(-1)} className="w-8 h-7 rounded bg-neutral-800 hover:bg-neutral-700 text-sm font-bold transition">−</button>
                  <button onClick={() => onDamage(1)} className="w-8 h-7 rounded bg-rose-900/60 hover:bg-rose-800/60 text-rose-200 text-sm font-bold transition">+</button>
                </div>
                <div className="flex gap-3">
                  <div className="flex gap-1 items-center">
                    <span className="text-[10px] text-rose-300">+ATK ({slot.atkBonus||0})</span>
                    <button onClick={() => onAtkBonus(-1)} className="w-7 h-6 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-bold">−</button>
                    <button onClick={() => onAtkBonus(1)} className="w-7 h-6 rounded bg-rose-900/40 hover:bg-rose-800/50 text-xs font-bold text-rose-300">+</button>
                  </div>
                  <div className="flex gap-1 items-center">
                    <span className="text-[10px] text-emerald-300">+HP ({slot.hpBonus||0})</span>
                    <button onClick={() => onHpBonus(-1)} className="w-7 h-6 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-bold">−</button>
                    <button onClick={() => onHpBonus(1)} className="w-7 h-6 rounded bg-emerald-900/40 hover:bg-emerald-800/50 text-xs font-bold text-emerald-300">+</button>
                  </div>
                </div>
              </>
            )}
            <div>
              <p className="text-[10px] text-neutral-500 mb-1">Status Markers</p>
              <div className="flex flex-wrap gap-1">
                {STATUS_MARKERS.map(m => (
                  <button key={m} onClick={() => onToggleMarker(m)}
                    className={"text-[9px] font-medium px-1.5 py-0.5 rounded transition border " +
                      (slot.markers?.includes(m) ? "border-current" : "border-neutral-700 text-neutral-500 hover:text-neutral-300")}
                    style={slot.markers?.includes(m) ? { color: MARKER_COLORS[m]||"#888", borderColor: MARKER_COLORS[m]||"#888" } : {}}
                  >{m}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={onSendToGraveyard} className="flex-1 py-1.5 rounded-lg text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition">→ Graveyard</button>
              <button onClick={onSendToExile}     className="flex-1 py-1.5 rounded-lg text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition">→ Exile</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PileModal({ title, cards, isOwn, onClose, onCardToExile }) {
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl max-w-sm w-full p-4 flex flex-col gap-3 max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-amber-200">{title} ({cards.length})</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-xl">✕</button>
        </div>
        <div className="overflow-y-auto flex-grow space-y-1">
          {cards.length === 0 && <p className="text-neutral-600 text-sm text-center py-8">Empty</p>}
          {cards.map((c, i) => (
            <div key={c.playId||i} className="flex items-center gap-2 bg-neutral-800/50 rounded-lg px-3 py-2">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: TYPE_COLORS[c.type]||"#888" }} />
              <span className="text-sm text-neutral-200 flex-grow truncate">{c.name}</span>
              <span className="text-xs text-neutral-500">{c.type}</span>
              {isOwn && onCardToExile && <button onClick={() => onCardToExile(i)} className="text-[10px] text-neutral-500 hover:text-amber-300 ml-1 shrink-0">→ Exile</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResourceRow({ health, provisions, mana, isOwn, onH, onP, onM }) {
  const btn = "w-6 h-6 rounded font-bold text-sm flex items-center justify-center transition";
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex items-center gap-1">
        <span className="text-rose-400 text-xs font-bold w-4">❤</span>
        {isOwn && <button onClick={() => onH(-1)} className={btn + " bg-neutral-800 hover:bg-rose-900/50 text-rose-300"}>−</button>}
        <span className="text-rose-300 font-bold w-8 text-center">{health}</span>
        {isOwn && <button onClick={() => onH(1)} className={btn + " bg-neutral-800 hover:bg-rose-700/40 text-rose-300"}>+</button>}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-amber-400 text-xs font-bold">P</span>
        {isOwn && <button onClick={() => onP(-1)} className={btn + " bg-neutral-800 hover:bg-amber-900/50 text-amber-300"}>−</button>}
        <span className="text-amber-300 font-bold w-8 text-center">{provisions}</span>
        {isOwn && <button onClick={() => onP(1)} className={btn + " bg-neutral-800 hover:bg-amber-700/40 text-amber-300"}>+</button>}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-violet-400 text-xs font-bold">M</span>
        {isOwn && <button onClick={() => onM(-1)} className={btn + " bg-neutral-800 hover:bg-violet-900/50 text-violet-300"}>−</button>}
        <span className="text-violet-300 font-bold w-8 text-center">{mana}</span>
        {isOwn && <button onClick={() => onM(1)} className={btn + " bg-neutral-800 hover:bg-violet-700/40 text-violet-300"}>+</button>}
      </div>
    </div>
  );
}

// ============================================================================
// JoinScreen
// ============================================================================
function JoinScreen({ onJoined }) {
  const [name, setName] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("pf_player_name") || "" : ""));
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function createRoom() {
    if (!name.trim()) { setError("Enter your name first."); return; }
    setBusy(true); setError("");
    localStorage.setItem("pf_player_name", name.trim());
    const pid = getOrCreatePlayer().id;
    const res = await apiPost("/api/play", { playerName: name.trim(), playerId: pid });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    localStorage.setItem("pf_current_room", res.roomId);
    localStorage.setItem("pf_current_slot", "p1");
    onJoined(res.roomId, res.room, pid, "p1");
  }

  async function joinRoom() {
    if (!name.trim()) { setError("Enter your name first."); return; }
    if (!code.trim()) { setError("Enter a room code."); return; }
    setBusy(true); setError("");
    localStorage.setItem("pf_player_name", name.trim());
    const pid = getOrCreatePlayer().id;
    const roomId = code.trim().toUpperCase();
    const res = await apiPost(`/api/play/${roomId}`, { action: "join", playerId: pid, playerName: name.trim() });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    const slot = res.room?.players?.p1?.id === pid ? "p1" : "p2";
    localStorage.setItem("pf_current_room", roomId);
    localStorage.setItem("pf_current_slot", slot);
    onJoined(roomId, res.room, pid, slot);
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl p-8 w-full max-w-md space-y-6">
        <div className="text-center">
          <a href="/" className="inline-block text-xs text-neutral-600 hover:text-neutral-400 transition mb-4">← Card Builder</a>
          <div className="text-4xl mb-3">🃏</div>
          <h1 className="text-2xl font-bold text-amber-200">Partyfall Live Play</h1>
          <p className="text-sm text-neutral-400 mt-1">1v1 online tabletop · anonymous session</p>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-neutral-400 mb-1">Your Name</label>
          <input className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
            value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name…"
            onKeyDown={e => e.key === "Enter" && createRoom()} />
        </div>
        {error && <p className="text-rose-400 text-xs">{error}</p>}
        <button onClick={createRoom} disabled={busy}
          className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold transition text-sm">
          {busy ? "…" : "Create Room"}
        </button>
        <div className="relative flex items-center gap-2">
          <div className="flex-grow border-t border-neutral-700" /><span className="text-xs text-neutral-600">or join / reconnect</span><div className="flex-grow border-t border-neutral-700" />
        </div>
        <div className="flex gap-2">
          <input className="flex-grow rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 uppercase placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
            value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ROOM CODE" maxLength={6}
            onKeyDown={e => e.key === "Enter" && joinRoom()} />
          <button onClick={joinRoom} disabled={busy}
            className="px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white font-semibold transition text-sm">
            {busy ? "…" : "Join"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LobbyScreen
// ============================================================================
function LobbyScreen({ room, mySlot, playerId, roomId, onRoomUpdate, onLeft }) {
  const [decks, setDecks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [legality, setLegality] = useState(null);
  const [loading, setLoading] = useState(true);
  const [readying, setReadying] = useState(false);

  useEffect(() => {
    fetch("/api/data").then(r => r.json()).then(d => { setDecks(d.decks || []); setLoading(false); });
  }, []);

  async function selectDeck(deckId) {
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;
    const check = checkLegality(deck);
    setLegality(check); setSelectedId(deckId);
    if (!check.legal) return;
    const res = await roomAction(roomId, { action: "select_deck", playerId, deckId, deckName: deck.name, processedDeck: buildProcessedDeck(deck) });
    if (res.room) onRoomUpdate(res.room);
  }

  async function setReady() {
    setReadying(true);
    const res = await roomAction(roomId, { action: "set_ready", playerId });
    setReadying(false);
    if (res.room) onRoomUpdate(res.room);
  }

  async function leaveRoom() {
    await roomAction(roomId, { action: "leave_room", playerId });
    localStorage.removeItem("pf_current_room"); localStorage.removeItem("pf_current_slot");
    onLeft();
  }

  const me = room.players[mySlot];
  const oppSlot = mySlot === "p1" ? "p2" : "p1";
  const opp = room.players[oppSlot];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6 gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-amber-200">Room: <span className="font-mono tracking-widest text-white">{roomId}</span></h1>
        <p className="text-sm text-neutral-400 mt-1">Share this code with your opponent to reconnect anytime</p>
      </div>
      <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
        {[{ slot: "p1", label: "Player 1" }, { slot: "p2", label: "Player 2" }].map(({ slot, label }) => {
          const p = room.players[slot];
          return (
            <div key={slot} className={"border rounded-xl p-4 " + (slot === mySlot ? "border-amber-500/50 bg-amber-950/20" : "border-neutral-700 bg-neutral-900")}>
              <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1">{label}</p>
              {p ? <>
                <p className="font-semibold text-amber-200">{p.name}</p>
                <p className="text-xs text-neutral-400 mt-0.5 truncate">{p.deckName || "No deck selected"}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <div className={"w-2 h-2 rounded-full " + (p.ready ? "bg-emerald-400" : "bg-neutral-600")} />
                  <span className="text-xs text-neutral-400">{p.ready ? "Ready" : "Not ready"}</span>
                </div>
              </> : <p className="text-neutral-600 text-sm italic">Waiting for player…</p>}
            </div>
          );
        })}
      </div>
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-700 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-amber-200">Select Your Deck</h2>
        {loading ? <p className="text-neutral-500 text-sm">Loading decks…</p> : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {decks.length === 0 && <p className="text-neutral-600 text-sm">No decks found — build one in the Deckbuilder first.</p>}
            {decks.map(d => {
              const check = checkLegality(d);
              return (
                <button key={d.id} onClick={() => selectDeck(d.id)}
                  className={"w-full text-left rounded-lg px-3 py-2.5 flex items-center gap-3 transition border " +
                    (d.id === selectedId ? "border-amber-500/60 bg-amber-950/30" : "border-neutral-700 bg-neutral-800/50 hover:border-neutral-500")}>
                  <div className={"w-2 h-2 rounded-full shrink-0 " + (check.legal ? "bg-emerald-400" : "bg-rose-500")} />
                  <div className="flex-grow min-w-0">
                    <p className="text-sm font-medium text-neutral-100 truncate">{d.name || "(untitled)"}</p>
                    <p className="text-xs text-neutral-500 truncate">{d.author ? `by ${d.author} · ` : ""}{(d.cards||[]).filter(e => !COMPANION_TYPES.includes(e.card.type)).reduce((s,e)=>s+e.count,0)} cards</p>
                  </div>
                  <span className={"text-[10px] shrink-0 " + (check.legal ? "text-emerald-400" : "text-rose-400")}>{check.legal ? "✓ Legal" : "⚠ Illegal"}</span>
                </button>
              );
            })}
          </div>
        )}
        {legality && !legality.legal && <div className="text-xs text-rose-400 space-y-0.5">{legality.errors.map((e,i) => <p key={i}>• {e}</p>)}</div>}
        {legality?.legal && !me?.ready && (
          <button onClick={setReady} disabled={readying} className="w-full py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white font-semibold transition text-sm">
            {readying ? "…" : "Ready!"}
          </button>
        )}
        {me?.ready && <p className="text-emerald-400 text-sm font-semibold text-center">✓ Waiting for opponent…</p>}
        <button onClick={leaveRoom} className="w-full py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-500 hover:text-neutral-300 transition text-xs">Leave Room</button>
      </div>
    </div>
  );
}

// ============================================================================
// MulliganScreen
// ============================================================================
function MulliganScreen({ room, mySlot, playerId, roomId, onRoomUpdate }) {
  const ps = room.gs?.[mySlot];
  const [selected, setSelected] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);

  if (!ps || ps.mulliganDone) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
        <div className="text-center space-y-2">
          <p className="text-amber-200 font-semibold text-lg">Mulligan submitted!</p>
          <p className="text-sm">Waiting for opponent…</p>
          <div className="w-4 h-4 border-2 border-amber-500/40 border-t-amber-400 rounded-full animate-spin mx-auto mt-3" />
        </div>
      </div>
    );
  }

  const toggle = (i) => setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  async function submit(indices) {
    setSubmitting(true);
    const res = await roomAction(roomId, { action: "mulligan", playerId, indices });
    if (res.room) onRoomUpdate(res.room);
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 gap-6 text-neutral-100">
      <div className="text-center">
        <h1 className="text-xl font-bold text-amber-200">Mulligan</h1>
        <p className="text-sm text-neutral-400 mt-1">Click cards to select them to shuffle back. Draw replacements.</p>
        {selected.size > 0 && <p className="text-amber-300 text-sm mt-1">Returning {selected.size} card(s)</p>}
      </div>
      <div className="flex gap-3 flex-wrap justify-center">
        {ps.hand.map((card, i) => (
          <HandCard key={card.playId||i} card={card} isSelected={selected.has(i)}
            onClick={() => toggle(i)} onDragStart={() => {}} />
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={() => submit([])} disabled={submitting} className="px-5 py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium transition text-sm disabled:opacity-40">Keep All</button>
        <button onClick={() => submit([...selected])} disabled={submitting} className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition text-sm disabled:opacity-40">
          {submitting ? "…" : selected.size > 0 ? `Shuffle ${selected.size} & Draw` : "Keep Hand"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Playmat
// ============================================================================
function Playmat({ room, mySlot, playerId, roomId, onRoomUpdate }) {
  const [selectedHand, setSelectedHand] = useState(null);
  const [detailCard, setDetailCard] = useState(null);
  const [pile, setPile] = useState(null);
  const [tokenSlot, setTokenSlot] = useState(null);
  const [tokenName, setTokenName] = useState("Token");
  const [dragSrc, setDragSrc] = useState(null);
  const [chatInput, setChatInput] = useState("");

  // Alt-zoom state
  const altHeldRef = useRef(false);
  const zoomInfoRef = useRef(null);
  const [altHeld, setAltHeld] = useState(false);
  const [zoomInfo, setZoomInfo] = useState(null);
  const [zoomPos, setZoomPos] = useState({ x: 0, y: 0 });
  const [zoomScale, setZoomScale] = useState(1);

  useEffect(() => {
    const onKeyDown = e => { if (e.key === "Alt") { e.preventDefault(); altHeldRef.current = true; setAltHeld(true); } };
    const onKeyUp   = e => { if (e.key === "Alt") { altHeldRef.current = false; zoomInfoRef.current = null; setAltHeld(false); setZoomInfo(null); } };
    const onMove    = e => { if (altHeldRef.current && zoomInfoRef.current) setZoomPos({ x: e.clientX, y: e.clientY }); };
    const onWheel   = e => {
      if (!altHeldRef.current || !zoomInfoRef.current) return;
      e.preventDefault();
      setZoomScale(prev => Math.max(0.4, Math.min(3, prev + (e.deltaY < 0 ? 0.1 : -0.1))));
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  function enterZoom(card, bfSlot, e) {
    if (!altHeldRef.current) return;
    const info = { card, bfSlot };
    zoomInfoRef.current = info;
    setZoomInfo(info);
    if (e) setZoomPos({ x: e.clientX, y: e.clientY });
  }
  function leaveZoom() { zoomInfoRef.current = null; setZoomInfo(null); }

  const gs   = room.gs;
  const ps   = gs?.[mySlot];
  const oppSlot = mySlot === "p1" ? "p2" : "p1";
  const ops  = gs?.[oppSlot];
  const me   = room.players[mySlot];
  const opp  = room.players[oppSlot];
  const isMyTurn = room.currentTurn === mySlot;
  const isEnded  = room.status === "ended";
  const myWon    = room.winner === mySlot;
  const oppWon   = room.winner === oppSlot;

  const dispatch = useCallback(async body => {
    const res = await roomAction(roomId, { ...body, playerId });
    if (res.room) onRoomUpdate(res.room);
    return res;
  }, [roomId, playerId, onRoomUpdate]);

  // ---- drag & drop ----------------------------------------------------------
  const onBFDragStart = (e, i) => { setDragSrc({ type: "bf", index: i }); e.dataTransfer.effectAllowed = "move"; };
  const onHandDragStart = (e, i) => { setDragSrc({ type: "hand", index: i }); e.dataTransfer.effectAllowed = "move"; };
  const onBFDragOver = (e, i) => { if (!dragSrc || ps?.battlefield[i]) return; e.preventDefault(); };
  const onGYDragOver  = e => { if (dragSrc?.type === "bf") e.preventDefault(); };
  const onExDragOver  = e => { if (dragSrc) e.preventDefault(); };

  async function onBFDrop(e, slotIndex) {
    e.preventDefault();
    if (!dragSrc) return;
    if (dragSrc.type === "hand") {
      const card = ps.hand[dragSrc.index];
      await dispatch({ action: "play_card", handIndex: dragSrc.index, slotIndex, position: card?.position || "Frontline" });
      setSelectedHand(null);
    } else if (dragSrc.type === "bf" && dragSrc.index !== slotIndex) {
      await dispatch({ action: "move_card", fromSlot: dragSrc.index, toSlot: slotIndex });
    }
    setDragSrc(null);
  }
  async function onGYDrop(e) {
    e.preventDefault();
    if (dragSrc?.type === "bf") await dispatch({ action: "send_to_graveyard", slotIndex: dragSrc.index });
    setDragSrc(null);
  }
  async function onExDrop(e) {
    e.preventDefault();
    if (dragSrc?.type === "bf")   await dispatch({ action: "send_to_exile", slotIndex: dragSrc.index });
    if (dragSrc?.type === "hand") { await dispatch({ action: "exile_from_hand", handIndex: dragSrc.index }); setSelectedHand(null); }
    setDragSrc(null);
  }

  async function onSlotClick(slotIndex) {
    if (!selectedHand) return;
    if (ps.battlefield[slotIndex]) { setSelectedHand(null); return; }
    const card = ps.hand[selectedHand.index];
    await dispatch({ action: "play_card", handIndex: selectedHand.index, slotIndex, position: card?.position || "Frontline" });
    setSelectedHand(null);
  }

  // ---- chat -----------------------------------------------------------------
  async function sendChat() {
    if (!chatInput.trim()) return;
    await dispatch({ action: "chat", message: chatInput.trim() });
    setChatInput("");
  }

  // ---- sub-components -------------------------------------------------------
  function LegendZoneCard({ slot, isOwn }) {
    if (!slot) return (
      <div className="w-14 h-20 rounded-lg border border-dashed border-neutral-700/50 flex items-center justify-center text-neutral-700 text-[8px] text-center leading-tight px-1">Legend Zone</div>
    );
    const { card, damage, atkBonus, hpBonus, exhausted, markers } = slot;
    const curHp = Math.max(0, (parseInt(card.health)||0)+(hpBonus||0)-(damage||0));
    return (
      <div className={"relative w-14 h-20 rounded-lg border overflow-hidden cursor-pointer transition " + (isOwn ? "border-amber-600/60 hover:border-amber-400" : "border-amber-800/40")}
        style={{ background: "linear-gradient(160deg,#1c1917 0%,#0f0f0f 100%)" }}
        onClick={isOwn ? () => setDetailCard({ card, slot, slotIndex: -1, isLegend: true }) : undefined}
        onMouseEnter={e => enterZoom(card, slot, e)} onMouseLeave={leaveZoom}
      >
        <div className="h-1 w-full bg-amber-500" />
        <p className="text-[7px] font-bold text-amber-300 px-1 pt-0.5 line-clamp-3 leading-tight">{card.name}</p>
        {damage > 0 && <div className="absolute top-1 right-0.5 w-3.5 h-3.5 rounded-full bg-red-700 text-white text-[7px] flex items-center justify-center font-bold">{damage}</div>}
        <div className="absolute bottom-0 left-0 right-0 flex border-t border-neutral-700/60 text-[8px] font-bold text-center bg-neutral-900/80">
          <div className="flex-1 py-0.5 text-rose-300">{(parseInt(card.attack)||0)+(atkBonus||0)}</div>
          <div className="flex-1 py-0.5 text-emerald-300 border-l border-neutral-700">{curHp}</div>
        </div>
        {markers?.length > 0 && (
          <div className="flex flex-wrap gap-0.5 px-0.5 mt-0.5 absolute bottom-4 left-0">{markers.slice(0,3).map(m => <div key={m} className="w-1.5 h-1.5 rounded-full" style={{ background: MARKER_COLORS[m]||"#888" }} />)}</div>
        )}
      </div>
    );
  }

  function ZonePile({ label, count, cards, isOwn, zone, onDragOver, onDrop }) {
    return (
      <button className="flex flex-col items-center gap-0.5 w-12 text-center group shrink-0"
        onClick={() => zone !== "deck" && setPile({ title: `${isOwn?"Your":"Opp"} ${label}`, cards, isOwn, zone })}
        onDragOver={onDragOver} onDrop={onDrop}
      >
        <div className={"w-12 h-16 rounded border flex items-center justify-center text-base transition " +
          (zone==="graveyard" ? "border-neutral-600 bg-neutral-800/60 group-hover:border-neutral-400" :
           zone==="exile" ? "border-violet-800/60 bg-violet-950/40 group-hover:border-violet-500" :
           "border-neutral-700 bg-neutral-800/40 group-hover:border-neutral-500")}>
          {zone==="deck" ? "🂠" : zone==="graveyard" ? "💀" : "✦"}
        </div>
        <span className="text-[8px] text-neutral-600">{label}</span>
        <span className="text-[9px] font-bold text-neutral-400">{count}</span>
      </button>
    );
  }

  function renderBF(slots, isOwn) {
    return (
      <div className="flex gap-1.5 px-2 py-2 flex-grow">
        {slots.map((slot, i) => (
          <div key={i}
            className={"rounded-lg transition h-28 flex-1 border-2 border-dashed " +
              (!slot ? (isOwn && selectedHand ? "border-amber-600/50 hover:border-amber-400/70 cursor-pointer" : "border-neutral-800/30") : "border-transparent")}
            onDragOver={isOwn ? e => onBFDragOver(e, i) : undefined}
            onDrop={isOwn ? e => onBFDrop(e, i) : undefined}
            onClick={isOwn && !slot ? () => onSlotClick(i) : undefined}
          >
            {slot && (
              <BFCard slot={slot} isOwn={isOwn}
                isSelected={detailCard?.slotIndex === i && !detailCard?.isLegend}
                onClick={() => isOwn && setDetailCard({ card: slot.card, slot, slotIndex: i, isLegend: false })}
                onDragStart={isOwn ? e => onBFDragStart(e, i) : undefined}
                onDragEnd={() => setDragSrc(null)}
                onMouseEnter={e => enterZoom(slot.card, slot, e)}
                onMouseLeave={leaveZoom}
              />
            )}
            {!slot && isOwn && selectedHand && (
              <div className="h-full flex items-center justify-center text-amber-700/50 text-[10px]">Drop</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (!gs || !ps) return <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">Loading…</div>;

  return (
    <div className="h-screen bg-neutral-950 text-neutral-100 flex overflow-hidden">

      {/* ---- main playmat ------------------------------------------------- */}
      <div className="flex-grow flex flex-col overflow-hidden min-w-0">

        {/* OPPONENT top bar */}
        <div className={"flex items-center gap-3 px-3 py-1.5 border-b border-neutral-800/50 bg-neutral-950/70 shrink-0 " +
          (isEnded && oppWon ? "border-l-2 border-l-emerald-500" : isEnded && myWon ? "border-l-2 border-l-rose-600" : "")}>
          <span className="text-xs font-semibold text-neutral-400 truncate max-w-[80px]">{opp?.name || "Opponent"}</span>
          <ResourceRow health={ops.health} provisions={ops.provisions} mana={ops.mana}
            isOwn={false} onH={() => {}} onP={() => {}} onM={() => {}} />
          <span className="text-[10px] text-neutral-700 ml-auto">✋{ops.hand.length} 🂠{ops.deck.length}</span>
        </div>

        {/* OPPONENT board */}
        <div className="flex items-end gap-2 px-3 py-1.5 border-b border-neutral-800/30 shrink-0 bg-neutral-900/20">
          <LegendZoneCard slot={ops.legendZone} isOwn={false} />
          <ZonePile label="Deck" count={ops.deck.length} cards={[]} isOwn={false} zone="deck" />
          <ZonePile label="GY" count={ops.graveyard.length} cards={ops.graveyard} isOwn={false} zone="graveyard" />
          <ZonePile label="Exile" count={ops.exile.length} cards={ops.exile} isOwn={false} zone="exile" />
          <div className="flex-grow flex gap-1 justify-end flex-wrap overflow-hidden max-h-20 items-start content-start pt-1">
            {ops.hand.map((_, i) => <CardBack key={i} className="w-9 h-14" />)}
          </div>
        </div>
        {renderBF(ops.battlefield, false)}

        {/* CENTER bar */}
        <div className="flex items-center justify-center gap-4 py-1 bg-neutral-950 border-y border-neutral-800 shrink-0 text-xs">
          <div className={"px-3 py-1 rounded-full font-semibold " + (isMyTurn && !isEnded ? "bg-amber-600/80 text-white" : "bg-neutral-800 text-neutral-500")}>
            {isEnded ? (myWon ? "You Win!" : "You Lose.") : isMyTurn ? "Your Turn" : `${opp?.name||"Opponent"}'s Turn`}
          </div>
          <span className="text-neutral-700">Turn {room.turnNumber||1}</span>
          {isMyTurn && !isEnded && (
            <button onClick={() => dispatch({ action: "pass_turn" })}
              className="px-3 py-1 rounded-full bg-violet-700 hover:bg-violet-600 text-white font-semibold transition">
              Pass Turn
            </button>
          )}
        </div>

        {/* PLAYER battlefield */}
        {renderBF(ps.battlefield, true)}

        {/* PLAYER back row */}
        <div className="flex items-end gap-2 px-3 py-1.5 border-t border-neutral-800/30 shrink-0 bg-neutral-900/20">
          <LegendZoneCard slot={ps.legendZone} isOwn={true} />
          <ZonePile label="Deck" count={ps.deck.length} cards={[]} isOwn={true} zone="deck"
            onDragOver={e => e.preventDefault()} onDrop={() => {}} />
          <ZonePile label="GY" count={ps.graveyard.length} cards={ps.graveyard} isOwn={true} zone="graveyard"
            onDragOver={onGYDragOver} onDrop={onGYDrop} />
          <ZonePile label="Exile" count={ps.exile.length} cards={ps.exile} isOwn={true} zone="exile"
            onDragOver={onExDragOver} onDrop={onExDrop} />
          <div className="flex gap-1.5 ml-auto flex-wrap justify-end items-center">
            <button onClick={() => dispatch({ action: "draw" })} className="px-2.5 py-1 rounded text-xs bg-neutral-800 hover:bg-neutral-700 transition text-neutral-300">Draw</button>
            <button onClick={() => dispatch({ action: "shuffle" })} className="px-2.5 py-1 rounded text-xs bg-neutral-800 hover:bg-neutral-700 transition text-neutral-300">Shuffle</button>
            <button onClick={() => { const s = ps.battlefield.findIndex(x => x===null); if (s >= 0) setTokenSlot(s); }}
              className="px-2.5 py-1 rounded text-xs bg-neutral-800 hover:bg-neutral-700 transition text-neutral-300">+ Token</button>
            {!isEnded && <button onClick={() => dispatch({ action: "concede" })} className="px-2.5 py-1 rounded text-xs bg-rose-900/60 hover:bg-rose-800/60 transition text-rose-300">Concede</button>}
          </div>
        </div>

        {/* PLAYER resources */}
        <div className={"flex items-center gap-3 px-3 py-1.5 border-t border-neutral-800 bg-neutral-950/70 shrink-0 " +
          (isEnded && myWon ? "border-l-2 border-l-emerald-500" : isEnded && oppWon ? "border-l-2 border-l-rose-600" : "")}>
          <span className="text-xs font-semibold text-amber-200 truncate max-w-[80px]">{me?.name||"You"}</span>
          <ResourceRow health={ps.health} provisions={ps.provisions} mana={ps.mana} isOwn={true}
            onH={d => dispatch({ action:"update_resource", resource:"health", delta:d })}
            onP={d => dispatch({ action:"update_resource", resource:"provisions", delta:d })}
            onM={d => dispatch({ action:"update_resource", resource:"mana", delta:d })}
          />
        </div>

        {/* End-game button row */}
        {isEnded && (
          <div className="flex items-center gap-2 px-3 py-2 border-t border-neutral-800 bg-neutral-950 shrink-0">
            <button onClick={() => { localStorage.removeItem("pf_current_room"); localStorage.removeItem("pf_current_slot"); window.location.href = "/"; }}
              className="px-3 py-1.5 rounded text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition">Close Lobby</button>
            <button onClick={() => { localStorage.removeItem("pf_current_room"); localStorage.removeItem("pf_current_slot"); window.location.href = "/play"; }}
              className="px-3 py-1.5 rounded text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition">New Game</button>
            <button onClick={() => dispatch({ action: "request_rematch" })} disabled={room.players[mySlot]?.rematchReady}
              className="px-3 py-1.5 rounded text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white font-medium transition">
              {room.players[mySlot]?.rematchReady ? "Waiting for opponent…" : "Rematch"}
            </button>
            {room.players[oppSlot]?.rematchReady && !room.players[mySlot]?.rematchReady && (
              <span className="text-xs text-amber-400 ml-1">Opponent wants a rematch!</span>
            )}
          </div>
        )}

        {/* PLAYER hand */}
        <div className="shrink-0 border-t border-neutral-800 bg-neutral-950 px-3 py-2">
          <div className="flex gap-2 overflow-x-auto pb-1 min-h-[88px] items-end">
            {ps.hand.length === 0 && <p className="text-neutral-700 text-xs self-center">No cards in hand</p>}
            {ps.hand.map((card, i) => (
              <HandCard key={card.playId||i} card={card}
                isSelected={selectedHand?.index === i}
                onClick={() => setSelectedHand(selectedHand?.index === i ? null : { index: i, card })}
                onDragStart={e => onHandDragStart(e, i)}
                onMouseEnter={e => enterZoom(card, null, e)}
                onMouseLeave={leaveZoom}
              />
            ))}
          </div>
          {selectedHand && (
            <div className="flex gap-2 mt-1 text-xs text-neutral-500 items-center">
              <span className="text-amber-400">▸ Click slot or drag to play</span>
              {selectedHand.card.type === "Event" && (
                <button onClick={() => { dispatch({ action:"exile_from_hand", handIndex:selectedHand.index }); setSelectedHand(null); }}
                  className="text-emerald-400 hover:text-emerald-300">Play Event (→ Exile)</button>
              )}
              <button onClick={() => { dispatch({ action:"hand_to_graveyard", handIndex:selectedHand.index }); setSelectedHand(null); }}
                className="ml-auto text-neutral-600 hover:text-neutral-400">Discard</button>
              <button onClick={() => setSelectedHand(null)} className="text-neutral-700 hover:text-neutral-500">Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* ---- right: action log + chat ----------------------------------- */}
      <div className="w-48 shrink-0 flex flex-col border-l border-neutral-800 bg-neutral-900/60 overflow-hidden">
        <div className="px-2 py-1.5 border-b border-neutral-800 flex items-center gap-1">
          <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider flex-grow">Log</span>
          <span className="text-[9px] text-neutral-700 font-mono">{roomId}</span>
        </div>
        <div className="flex-grow overflow-y-auto flex flex-col-reverse gap-0.5 px-1.5 py-1.5">
          {(room.log||[]).map((entry, i) => (
            <div key={i} className={"text-[9px] leading-snug px-1.5 py-1 rounded " +
              (entry.type==="system" ? "text-amber-300/80 bg-amber-950/20" :
               entry.type==="chat"   ? "text-sky-300/90 bg-sky-950/20" :
               "text-neutral-400/90")}>
              {entry.msg}
            </div>
          ))}
        </div>
        <div className="border-t border-neutral-800 p-1.5">
          <input
            className="w-full rounded bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-[10px] text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendChat()}
            placeholder="Chat… (Enter to send)"
          />
        </div>
      </div>

      {/* ---- modals ------------------------------------------------------- */}

      {detailCard && (
        <CardDetailModal
          card={detailCard.card} slot={detailCard.slot} isOwn={true}
          onClose={() => setDetailCard(null)}
          onExhaust={async () => { if (!detailCard.isLegend) await dispatch({ action:"exhaust", slotIndex:detailCard.slotIndex }); setDetailCard(null); }}
          onDamage={d => dispatch({ action: detailCard.isLegend?"modify_legend_counter":"modify_counter", slotIndex:detailCard.slotIndex, counterType:"damage", delta:d })}
          onAtkBonus={d => dispatch({ action: detailCard.isLegend?"modify_legend_counter":"modify_counter", slotIndex:detailCard.slotIndex, counterType:"atk", delta:d })}
          onHpBonus={d => dispatch({ action: detailCard.isLegend?"modify_legend_counter":"modify_counter", slotIndex:detailCard.slotIndex, counterType:"hp", delta:d })}
          onToggleMarker={m => dispatch({ action:"toggle_marker", slotIndex:detailCard.slotIndex, marker:m })}
          onSendToGraveyard={async () => { await dispatch({ action:"send_to_graveyard", slotIndex:detailCard.slotIndex }); setDetailCard(null); }}
          onSendToExile={async () => { await dispatch({ action:"send_to_exile", slotIndex:detailCard.slotIndex }); setDetailCard(null); }}
          onChangePosition={pos => setDetailCard(prev => prev ? { ...prev, slot: { ...prev.slot, position: pos } } : null)}
        />
      )}

      {pile && (
        <PileModal title={pile.title} cards={pile.cards} isOwn={pile.isOwn} onClose={() => setPile(null)}
          onCardToExile={pile.zone==="graveyard" && pile.isOwn ? i => { dispatch({ action:"graveyard_to_exile", gyIndex:i }); setPile(null); } : null} />
      )}

      {tokenSlot !== null && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70" onClick={() => setTokenSlot(null)}>
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-5 w-64 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-amber-200">Create Token</h3>
            <input className="w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
              value={tokenName} onChange={e => setTokenName(e.target.value)} placeholder="Token name…" />
            <div className="flex gap-2">
              {["Frontline","Backline"].map(pos => (
                <button key={pos} onClick={async () => {
                  await dispatch({ action:"add_token", slotIndex:tokenSlot, tokenName, position:pos });
                  setTokenSlot(null);
                }} className="flex-1 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-sm transition text-neutral-200">{pos}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Alt-zoom overlay */}
      {altHeld && zoomInfo && (
        <CardZoom card={zoomInfo.card} bfSlot={zoomInfo.bfSlot} pos={zoomPos} scale={zoomScale} />
      )}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================
export default function PlayPage() {
  const [playerId, setPlayerId] = useState("");
  const [mySlot, setMySlot]   = useState(null);
  const [roomId, setRoomId]   = useState(null);
  const [room, setRoom]       = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    const p = getOrCreatePlayer();
    setPlayerId(p.id);
    const savedRoom = localStorage.getItem("pf_current_room");
    const savedSlot = localStorage.getItem("pf_current_slot");
    if (savedRoom && savedSlot) { setRoomId(savedRoom); setMySlot(savedSlot); }
  }, []);

  useEffect(() => {
    if (!roomId || !playerId) return;
    fetchRoom(roomId, playerId).then(r => {
      if (!r || r.error) return;
      if (r.status === "closed") {
        // Room concluded — clear and show join screen
        localStorage.removeItem("pf_current_room"); localStorage.removeItem("pf_current_slot");
        setRoomId(null); setRoom(null); return;
      }
      setRoom(r);
    });
  }, [roomId, playerId]);

  useEffect(() => {
    if (!roomId || !playerId) return;
    pollRef.current = setInterval(async () => {
      const r = await fetchRoom(roomId, playerId);
      if (!r || r.error) return;
      if (r.status === "closed") {
        clearInterval(pollRef.current);
        localStorage.removeItem("pf_current_room"); localStorage.removeItem("pf_current_slot");
        setRoomId(null); setRoom(null); return;
      }
      setRoom(r);
    }, 1500);
    return () => clearInterval(pollRef.current);
  }, [roomId, playerId]);

  function handleJoined(rid, r, pid, slot) {
    setRoomId(rid); setRoom(r); setPlayerId(pid); setMySlot(slot);
  }

  function handleLeft() { setRoomId(null); setRoom(null); setMySlot(null); }

  if (!roomId || !room) return <JoinScreen onJoined={handleJoined} />;

  if (room.status === "lobby") {
    return <LobbyScreen room={room} mySlot={mySlot} playerId={playerId} roomId={roomId}
      onRoomUpdate={setRoom} onLeft={handleLeft} />;
  }

  if (room.status === "mulligan") {
    const myPs = room.gs?.[mySlot];
    if (myPs && !myPs.mulliganDone) {
      return <MulliganScreen room={room} mySlot={mySlot} playerId={playerId} roomId={roomId} onRoomUpdate={setRoom} />;
    }
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
        <div className="text-center space-y-2">
          <p className="text-amber-200 font-semibold">Waiting for opponent's mulligan…</p>
          <div className="w-4 h-4 border-2 border-amber-500/40 border-t-amber-400 rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return <Playmat room={room} mySlot={mySlot} playerId={playerId} roomId={roomId} onRoomUpdate={setRoom} />;
}
