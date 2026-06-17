import { NextResponse } from "next/server";
import { getDoc, setDoc } from "../../../lib/store";
import { canWrite } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);

// POST: create or update a deck (write-gated)
export async function POST(req) {
  try {
    const auth = await canWrite(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
    const deck = await req.json();
    if (!deck) return NextResponse.json({ error: "Missing deck" }, { status: 400 });
    const doc = auth.doc;
    doc.decks = doc.decks || [];
    if (!deck.id) deck.id = uid();
    const i = doc.decks.findIndex(d => d.id === deck.id);
    const now = Date.now();
    if (i >= 0) doc.decks[i] = { ...deck, updatedAt: now };
    else doc.decks.push({ ...deck, createdAt: now, updatedAt: now });
    await setDoc(doc);
    return NextResponse.json({ ok: true, deck });
  } catch (e) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }
}

// DELETE: remove a deck by ?id= (write-gated)
export async function DELETE(req) {
  try {
    const auth = await canWrite(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
    const id = new URL(req.url).searchParams.get("id");
    const doc = auth.doc;
    doc.decks = (doc.decks || []).filter(d => d.id !== id);
    await setDoc(doc);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }
}
