// app/api/cards/route.js
import { NextResponse } from "next/server";
import { setDoc } from "../../../lib/store";
import { canWrite } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function logEntry(doc, action, card, username) {
  doc.changelog ||= [];
  doc.changelog.unshift({ id: Date.now() + "-" + Math.random().toString(36).slice(2), action, cardName: card.name || "(unnamed)", cardType: card.type || "", username, timestamp: Date.now() });
  if (doc.changelog.length > 200) doc.changelog = doc.changelog.slice(0, 200);
}

// Create or update one card.
export async function POST(req) {
  try {
    const auth = await canWrite(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
    const card = await req.json();
    if (!card || !card.id) return NextResponse.json({ error: "Missing card id" }, { status: 400 });
    const doc = auth.doc;
    const i = doc.cards.findIndex((c) => c.id === card.id);
    const action = i >= 0 ? "edited" : "created";
    if (i >= 0) doc.cards[i] = card;
    else doc.cards.push(card);
    logEntry(doc, action, card, auth.username);
    await setDoc(doc);
    return NextResponse.json({ ok: true, card });
  } catch (e) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }
}

// Delete one card by ?id=
export async function DELETE(req) {
  try {
    const auth = await canWrite(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
    const id = new URL(req.url).searchParams.get("id");
    const doc = auth.doc;
    const card = doc.cards.find((c) => c.id === id) || { name: "(unknown)", type: "" };
    doc.cards = doc.cards.filter((c) => c.id !== id);
    logEntry(doc, "deleted", card, auth.username);
    await setDoc(doc);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }
}
