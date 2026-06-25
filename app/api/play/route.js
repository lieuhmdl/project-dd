import { NextResponse } from "next/server";
import { redis } from "../../../lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROOM_TTL = 60 * 60 * 24; // 24 h

export function roomKey(id) { return `partyfall:room:${id}`; }

function genRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// POST — create a new room
export async function POST(req) {
  try {
    const { playerName, playerId } = await req.json();
    if (!playerName || !playerId) return NextResponse.json({ error: "Missing playerName or playerId" }, { status: 400 });

    const roomId = genRoomId();
    const room = {
      roomId,
      createdAt: Date.now(),
      status: "lobby",          // lobby | mulligan | active | ended
      currentTurn: null,        // "p1" | "p2"
      turnNumber: 0,
      winner: null,
      players: {
        p1: { id: playerId, name: playerName, deckId: null, ready: false, processedDeck: null },
        p2: null,
      },
      gs: null,
      log: [{ ts: Date.now(), msg: `${playerName} created the room.`, type: "system" }],
      updatedAt: Date.now(),
    };

    await redis.set(roomKey(roomId), JSON.stringify(room), { ex: ROOM_TTL });
    return NextResponse.json({ ok: true, roomId, room });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
