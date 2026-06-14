// app/api/data/route.js
import { NextResponse } from "next/server";
import { getDoc, setDoc } from "../../../lib/store";
import { canWrite } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public read — never returns the write token.
export async function GET() {
  try {
    const doc = await getDoc();
    return NextResponse.json({ cards: doc.cards, keywords: doc.keywords, users: doc.users });
  } catch (e) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }
}

// Bulk replace (used by Import). Write-gated.
export async function PUT(req) {
  try {
    const auth = await canWrite(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
    const body = await req.json();
    const doc = auth.doc;
    if (Array.isArray(body.cards)) doc.cards = body.cards;
    if (Array.isArray(body.keywords) && body.keywords.length) doc.keywords = body.keywords;
    await setDoc(doc);
    return NextResponse.json({ ok: true, cards: doc.cards, keywords: doc.keywords });
  } catch (e) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }
}
