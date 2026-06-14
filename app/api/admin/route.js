// app/api/admin/route.js
import { NextResponse } from "next/server";
import { getDoc, setDoc } from "../../../lib/store";
import { isAdmin } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Read current settings (admin only). Returns the write token so the owner can see/share it.
export async function GET(req) {
  try {
    if (!process.env.ADMIN_TOKEN)
      return NextResponse.json({ error: "ADMIN_TOKEN not set on the server." }, { status: 503 });
    if (!isAdmin(req)) return NextResponse.json({ error: "Bad admin token." }, { status: 401 });
    const doc = await getDoc();
    return NextResponse.json({ users: doc.users, writeToken: doc.writeToken });
  } catch (e) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }
}

// Manage users + write token (admin only).
export async function POST(req) {
  try {
    if (!isAdmin(req)) return NextResponse.json({ error: "Bad admin token." }, { status: 401 });
    const { action, value } = await req.json();
    const doc = await getDoc();
    if (action === "addUser") {
      const u = (value || "").trim();
      if (u && !doc.users.includes(u)) doc.users.push(u);
    } else if (action === "removeUser") {
      doc.users = doc.users.filter((u) => u !== value);
    } else if (action === "setWriteToken") {
      doc.writeToken = (value || "").trim();
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    await setDoc(doc);
    return NextResponse.json({ ok: true, users: doc.users, writeToken: doc.writeToken });
  } catch (e) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }
}
