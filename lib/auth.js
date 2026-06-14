// lib/auth.js — tiny auth for a friends-only tool.
import { getDoc } from "./store";

// Admin = whoever knows the ADMIN_TOKEN env var (owner only).
export function isAdmin(req) {
  const admin = process.env.ADMIN_TOKEN;
  return !!admin && req.headers.get("x-admin-token") === admin;
}

// Write access = a known username + the shared write token (both managed in the admin panel).
export async function canWrite(req) {
  const username = (req.headers.get("x-username") || "").trim();
  const token = req.headers.get("x-token") || "";
  const doc = await getDoc();
  if (!doc.writeToken) return { ok: false, reason: "No write token set yet." };
  if (token !== doc.writeToken) return { ok: false, reason: "Invalid token." };
  if (!doc.users.includes(username)) return { ok: false, reason: "Unknown username." };
  return { ok: true, username, doc };
}
