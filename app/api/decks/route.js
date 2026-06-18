import { NextResponse } from "next/server";
import { getDoc, setDoc } from "../../../lib/store";
import { canWrite } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);

function deckSummary(deck) {
  return {
    name:       deck.name || "(untitled)",
    author:     deck.author || "",
    description: deck.description || "",
    companion:  deck.companion?.name || "",
    totalCards: (deck.cards || []).reduce((s, e) => s + e.count, 0),
  };
}

function deckDiff(before, after) {
  const fields = [
    ["Name",        "name"],
    ["Author",      "author"],
    ["Description", "description"],
    ["Companion",   "companion"],
    ["Total Cards", "totalCards"],
  ];
  const bSum = deckSummary(before);
  const aSum = deckSummary(after);
  return fields
    .map(([label, key]) => ({ label, before: String(bSum[key] ?? ""), after: String(aSum[key] ?? "") }))
    .filter(d => d.before !== d.after);
}

function logDeck(doc, action, { before, after }, username) {
  doc.changelog ||= [];
  const deck = after || before;
  const entry = {
    id:          uid(),
    action,
    cardName:    deck.name || "(untitled)",
    cardType:    "Deck",
    username,
    timestamp:   Date.now(),
    deckSnapshot: action !== "edited" ? deckSummary(deck) : null,
    diff:         action === "edited"  ? deckDiff(before, after) : null,
  };
  doc.changelog.unshift(entry);
  if (doc.changelog.length > 200) doc.changelog = doc.changelog.slice(0, 200);
}

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
    const before = i >= 0 ? doc.decks[i] : null;
    const action = i >= 0 ? "edited" : "created";
    if (i >= 0) doc.decks[i] = { ...deck, updatedAt: now };
    else doc.decks.push({ ...deck, createdAt: now, updatedAt: now });
    logDeck(doc, action, { before, after: deck }, auth.username);
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
    const deck = doc.decks?.find(d => d.id === id);
    doc.decks = (doc.decks || []).filter(d => d.id !== id);
    if (deck) logDeck(doc, "deleted", { before: deck, after: null }, auth.username);
    await setDoc(doc);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }
}
