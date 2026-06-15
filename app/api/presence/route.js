import { NextResponse } from "next/server";
import { getDoc, setDoc } from "../../../lib/store";
import { canWrite } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Write-gated: signed-in users ping their presence; we store last-seen per username.
export async function POST(req) {
  try {
    const auth = await canWrite(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
    const doc = auth.doc;
    doc.presence = doc.presence || {};
    doc.presence[auth.username.toLowerCase()] = Date.now();
    await setDoc(doc);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }
}

// Clear presence on sign-out.
export async function DELETE(req) {
  try {
    const auth = await canWrite(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
    const doc = auth.doc;
    if (doc.presence) delete doc.presence[auth.username.toLowerCase()];
    await setDoc(doc);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }
}
