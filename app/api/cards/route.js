// app/api/cards/route.js
import { NextResponse } from "next/server";
import { setDoc } from "../../../lib/store";
import { canWrite } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DIFF_FIELDS = [
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "rarity", label: "Rarity" },
  { key: "provisions", label: "Provisions" },
  { key: "mana", label: "Mana" },
  { key: "race", label: "Race" },
  { key: "klass", label: "Class" },
  { key: "position", label: "Position" },
  { key: "attack", label: "Attack" },
  { key: "health", label: "Health" },
  { key: "strike", label: "Strike" },
  { key: "passive", label: "Passive" },
  { key: "text", label: "Card Text" },
  { key: "flavor", label: "Flavor" },
  { key: "author", label: "Author" },
];

function serialize(card, key) {
  const v = card?.[key];
  if (key === "keywords" || key === "tribes") return (v || []).join(", ") || "—";
  if (key === "abilities") return (v || []).map((a) => { const cost = [a.prov ? `${a.prov}P` : "", a.mana ? `${a.mana}M` : ""].filter(Boolean).join(" "); return (cost ? `(${cost}) ` : "") + a.text; }).join(" | ") || "—";
  return String(v ?? "") || "—";
}

function buildDiff(before, after) {
  const fields = [...DIFF_FIELDS, { key: "keywords", label: "Keywords" }, { key: "tribes", label: "Tribes" }, { key: "abilities", label: "Abilities" }];
  return fields
    .map(({ key, label }) => ({ label, before: serialize(before, key), after: serialize(after, key) }))
    .filter(({ before, after }) => before !== after);
}

function logEntry(doc, action, { before, after }, username) {
  doc.changelog ||= [];
  const card = after || before || {};
  const diff = action === "edited" ? buildDiff(before, after) : null;
  const snapshot = action !== "edited" ? (after || before) : null;
  doc.changelog.unshift({
    id: Date.now() + "-" + Math.random().toString(36).slice(2),
    action,
    cardName: card.name || "(unnamed)",
    cardType: card.type || "",
    username,
    timestamp: Date.now(),
    diff,
    snapshot,
  });
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
    const before = i >= 0 ? { ...doc.cards[i] } : null;
    if (i >= 0) doc.cards[i] = card;
    else doc.cards.push(card);
    logEntry(doc, action, { before, after: card }, auth.username);
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
    logEntry(doc, "deleted", { before: card, after: null }, auth.username);
    await setDoc(doc);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }
}
