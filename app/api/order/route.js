import { NextResponse } from "next/server";
import { setDoc } from "../../../lib/store";
import { canWrite } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PUT { type, ids } — saves the card order for one card type.
export async function PUT(req) {
  try {
    const auth = await canWrite(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
    const { type, ids } = await req.json();
    if (!type || !Array.isArray(ids)) return NextResponse.json({ error: "type and ids[] required" }, { status: 400 });
    const doc = auth.doc;
    doc.cardOrder = doc.cardOrder || {};
    doc.cardOrder[type] = ids;
    await setDoc(doc);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }
}
