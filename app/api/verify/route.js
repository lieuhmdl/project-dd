// app/api/verify/route.js
import { NextResponse } from "next/server";
import { getDoc } from "../../../lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { username, token } = await req.json();
    const doc = await getDoc();
    const ok = !!doc.writeToken && token === doc.writeToken && doc.users.includes((username || "").trim());
    return NextResponse.json({ ok });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "storage_not_configured" }, { status: 503 });
  }
}
