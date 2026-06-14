// app/api/cards/route.js
import { NextResponse } from "next/server";
import { setDoc } from "../../../lib/store";
import { canWrite } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Create or update one card.
export async function POST(req) {
  try {
    const auth = await canWrite(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
    const card = await req.json();
    if (!card || !card.id) return NextResponse.json({ error: "Missing card id" }, { status: 400 });
    const doc = auth.doc;
    const i = doc.cards.findIndex((c) => c.id === card.id);
    if (i >= 0) doc.cards[i] = card;
    else doc.cards.push(card);
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
    doc.cards = doc.cards.filter((c) => c.id !== id);
    await setDoc(doc);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }
}
