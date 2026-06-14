// app/api/keywords/route.js
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
    if (!Array.isArray(body.keywords)) return NextResponse.json({ error: "keywords[] required" }, { status: 400 });
    const doc = auth.doc;
    doc.keywords = body.keywords;
    await setDoc(doc);
    return NextResponse.json({ ok: true, keywords: doc.keywords });
  } catch (e) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }
}
