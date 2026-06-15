import { NextResponse } from "next/server";
import { setDoc } from "../../../lib/store";
import { canWrite } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(req) {
  try {
    const auth = await canWrite(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
    const body = await req.json();
    if (!Array.isArray(body.races)) return NextResponse.json({ error: "races[] required" }, { status: 400 });
    const doc = auth.doc;
    doc.races = body.races;
    await setDoc(doc);
    return NextResponse.json({ ok: true, races: doc.races });
  } catch (e) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }
}
