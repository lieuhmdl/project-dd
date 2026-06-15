"use client";

import { useState, useEffect, useRef } from "react";

/* ============================================================================
   PROJECT DD — Card Builder (shared / server-backed)
   - All cards live in one shared database (Upstash Redis via /api/*).
   - Viewing is open. Editing needs sign-in: a username (created by the owner
     in the Admin panel) + the shared write token.
   - Admin panel (owner only) is unlocked by the ADMIN_TOKEN env var; it sets
     the shared write token and manages usernames.
============================================================================ */

const RACE_CLASSES = {
  Human: ["Paladin", "Cleric", "Ranger", "Monk", "Druid"],
  Dwarf: ["Fighter", "Cleric", "Monk"],
  Elf: ["Wizard", "Ranger", "Cleric", "Druid"],
  Gnome: ["Bard", "Cleric", "Druid"],
  "Half-elf": ["Sorcerer", "Ranger", "Druid", "Cleric"],
  "Half-orc": ["Barbarian", "Ranger"],
  Halfling: ["Rogue", "Cleric", "Druid", "Monk"],
};
const SIGNATURE = { Human: "Paladin", Dwarf: "Fighter", Elf: "Wizard", Gnome: "Bard", "Half-elf": "Sorcerer", "Half-orc": "Barbarian", Halfling: "Rogue" };
const TRIBE_INFO = [
  { tribe: "Human", others: "Cleric, Ranger, Monk, Druid", lean: "Flexible", allies: "Everyone (\u201csecond-best friends\u201d)", rivals: "None" },
  { tribe: "Dwarf", others: "Cleric, Monk", lean: "Frontline", allies: "Gnome (best), Halfling, Human; Elf in war", rivals: "Half-orc; friction with Elf" },
  { tribe: "Elf", others: "Ranger, Cleric, Druid", lean: "Backline", allies: "Half-elf; Dwarf in war; gracious to all", rivals: "Half-orc" },
  { tribe: "Gnome", others: "Cleric, Druid", lean: "Backline", allies: "Dwarf (best), Halfling", rivals: "Goblinoids / giants" },
  { tribe: "Half-elf", others: "Ranger, Druid, Cleric", lean: "Flexible / Backline", allies: "Elf, Human, Dwarf, Gnome, Halfling", rivals: "Half-orc (mild)" },
  { tribe: "Half-orc", others: "Ranger", lean: "Frontline", allies: "Human; fellow outsiders", rivals: "Dwarf, Elf" },
  { tribe: "Halfling", others: "Cleric, Druid, Monk", lean: "Flexible", allies: "Everyone, especially Human", rivals: "None" },
];
const RACES = Object.keys(RACE_CLASSES);
const POSITIONS = ["Frontline", "Backline"];
const RARITIES = ["Common", "Uncommon", "Rare", "Legendary", "Mythic"];
const CARD_TYPES = ["Unit", "Ancient Legend", "Ancient Relic", "Event", "Artifact"];
const UNIT_LIKE = ["Unit", "Ancient Legend"];

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
function blankCard(type) {
  return { id: uid(), type, name: "", provisions: "", mana: "", rarity: "Common", race: "", klass: "", position: "Frontline", keywords: [], attack: "", health: "", strike: "", abilities: [], passive: "", text: "", flavor: "" };
}
// Abilities are { prov, mana, text }. Older cards stored them as plain strings;
// normalize on load and render either shape.
function normAbility(ab) {
  return typeof ab === "string" ? { prov: "", mana: "", text: ab } : { prov: ab.prov || "", mana: ab.mana || "", text: ab.text || "" };
}
function abilityLine(ab) {
  if (typeof ab === "string") return ab;
  const cost = [ab.prov ? `${ab.prov}P` : "", ab.mana ? `${ab.mana}M` : ""].filter(Boolean).join(" ");
  return (cost ? `(${cost}) ` : "") + (ab.text || "");
}

// ---- small UI helpers -----------------------------------------------------
const Label = ({ children }) => <label className="block text-[11px] uppercase tracking-wide text-neutral-400 mb-1">{children}</label>;
const inputCls = "w-full rounded-md bg-neutral-800 border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60";
function TextField({ label, value, onChange, placeholder, ...rest }) {
  return (<div><Label>{label}</Label><input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} {...rest} /></div>);
}
function Select({ label, value, onChange, options, placeholder = "—", disabled }) {
  return (<div><Label>{label}</Label><select className={inputCls + (disabled ? " opacity-50" : "")} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}><option value="">{placeholder}</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>);
}

// ---- card tile ------------------------------------------------------------
function CardTile({ card, canEdit, onEdit, onDelete }) {
  const unitLike = UNIT_LIKE.includes(card.type);
  const subtitle = unitLike
    ? [card.race && card.klass ? `${card.race} ${card.klass}` : (card.race || card.klass), card.position, card.rarity].filter(Boolean).join("  \u00b7  ")
    : `${card.type}  \u00b7  ${card.rarity}`;
  const bodyLines = unitLike
    ? [card.strike ? `Strike: ${card.strike}` : "", ...(card.abilities || []).map(abilityLine).filter(Boolean).map((a) => `\u2022 ${a}`), card.passive ? `Passive: ${card.passive}` : ""].filter(Boolean)
    : (card.text ? [card.text] : []);
  return (
    <div className="group relative w-[260px] rounded-xl border border-neutral-700 bg-neutral-900 shadow-lg overflow-hidden flex flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-2" style={{ background: "#3b2d52" }}>
        <span className="font-semibold text-[15px] text-amber-200 truncate">{card.name || "(unnamed)"}</span>
        <span className="shrink-0 text-[11px] font-bold text-amber-100/90 bg-black/25 rounded px-1.5 py-0.5">P {card.provisions || 0} · M {card.mana || 0}</span>
      </div>
      <div className="px-3 py-1 text-[11px] italic text-neutral-300 bg-neutral-800/70 border-b border-neutral-700/60">{subtitle}</div>
      {card.keywords && card.keywords.length > 0 && (
        <div className="px-3 py-1.5 flex flex-wrap gap-1">{card.keywords.map((k) => <span key={k} className="text-[10px] font-semibold text-amber-300 border border-amber-500/40 rounded px-1.5 py-0.5">{k}</span>)}</div>
      )}
      <div className="px-3 py-2 text-[12px] text-neutral-200 leading-snug flex-grow min-h-[64px] space-y-0.5">
        {bodyLines.length ? bodyLines.map((l, i) => <div key={i}>{l}</div>) : <div className="text-neutral-600">No rules text yet.</div>}
      </div>
      {card.flavor && <div className="px-3 pb-2 text-[11px] italic text-neutral-400">&ldquo;{card.flavor}&rdquo;</div>}
      {unitLike && (
        <div className="grid grid-cols-2 text-center text-sm font-bold border-t border-neutral-700 bg-neutral-800/60">
          <div className="py-1 text-rose-300">ATK {card.attack || 0}</div>
          <div className="py-1 text-emerald-300 border-l border-neutral-700">HP {card.health || 0}</div>
        </div>
      )}
      {canEdit && (
        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <button onClick={onEdit} className="text-[11px] bg-neutral-700 hover:bg-neutral-600 text-white rounded px-2 py-0.5">Edit</button>
          <button onClick={onDelete} className="text-[11px] bg-rose-700 hover:bg-rose-600 text-white rounded px-2 py-0.5">✕</button>
        </div>
      )}
    </div>
  );
}

// ---- editor modal ---------------------------------------------------------
function Editor({ draft, setDraft, keywords, onAddKeyword, onSave, onCancel, saving }) {
  const unitLike = UNIT_LIKE.includes(draft.type);
  const classOptions = draft.race ? RACE_CLASSES[draft.race] || [] : [];
  const set = (patch) => setDraft({ ...draft, ...patch });
  const toggleKeyword = (k) => set({ keywords: draft.keywords.includes(k) ? draft.keywords.filter((x) => x !== k) : [...draft.keywords, k] });
  const setAbility = (i, field, val) => { const a = [...draft.abilities]; a[i] = { ...a[i], [field]: val }; set({ abilities: a }); };
  const [newKw, setNewKw] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 overflow-y-auto">
      <div className="w-full max-w-5xl my-6 rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800" style={{ background: "#2a2238" }}>
          <h2 className="text-lg font-semibold text-amber-200">{draft.type} — Card Editor</h2>
          <button onClick={onCancel} className="text-neutral-400 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="grid md:grid-cols-2 gap-6 p-5">
          <div className="space-y-3">
            <TextField label="Card Name" value={draft.name} onChange={(v) => set({ name: v })} placeholder="e.g. Ironbrace Defender" />
            <div className="grid grid-cols-3 gap-3">
              <TextField label="Provisions" value={draft.provisions} onChange={(v) => set({ provisions: v })} placeholder="0" inputMode="numeric" />
              <TextField label="Mana" value={draft.mana} onChange={(v) => set({ mana: v })} placeholder="0" inputMode="numeric" />
              <Select label="Rarity" value={draft.rarity} onChange={(v) => set({ rarity: v })} options={RARITIES} placeholder="Rarity" />
            </div>
            {unitLike && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Select label="Race / Tribe" value={draft.race} onChange={(v) => set({ race: v, klass: (RACE_CLASSES[v] || []).includes(draft.klass) ? draft.klass : "" })} options={RACES} placeholder="Race" />
                  <Select label="Class" value={draft.klass} onChange={(v) => set({ klass: v })} options={classOptions} placeholder={draft.race ? "Class" : "pick race first"} disabled={!draft.race} />
                  <Select label="Position" value={draft.position} onChange={(v) => set({ position: v })} options={POSITIONS} placeholder="Position" />
                </div>
                {draft.race && <p className="text-[11px] text-neutral-500 -mt-1">Signature class for {draft.race}: <span className="text-amber-400">{SIGNATURE[draft.race]}</span>.</p>}
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Attack" value={draft.attack} onChange={(v) => set({ attack: v })} placeholder="0" inputMode="numeric" />
                  <TextField label="Health" value={draft.health} onChange={(v) => set({ health: v })} placeholder="0" inputMode="numeric" />
                </div>
                <div><Label>Strike (basic attack text)</Label><input className={inputCls} value={draft.strike} onChange={(e) => set({ strike: e.target.value })} placeholder="Deal 3 to a unit." /></div>
                <div>
                  <Label>Abilities (Prov / Mana cost + effect)</Label>
                  <div className="space-y-2">
                    {draft.abilities.map((ab, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input className={inputCls + " w-12 text-center px-1"} value={ab.prov} onChange={(e) => setAbility(i, "prov", e.target.value)} placeholder="P" inputMode="numeric" title="Provisions cost" />
                        <input className={inputCls + " w-12 text-center px-1"} value={ab.mana} onChange={(e) => setAbility(i, "mana", e.target.value)} placeholder="M" inputMode="numeric" title="Mana cost" />
                        <input className={inputCls} value={ab.text} onChange={(e) => setAbility(i, "text", e.target.value)} placeholder={`Ability ${i + 1} — e.g. Shield Bash: Strike and Stun.`} />
                        <button onClick={() => set({ abilities: draft.abilities.filter((_, x) => x !== i) })} className="shrink-0 px-2 rounded-md bg-neutral-700 hover:bg-rose-700 text-white text-sm">✕</button>
                      </div>
                    ))}
                    <button onClick={() => set({ abilities: [...draft.abilities, { prov: "", mana: "", text: "" }] })} className="text-xs text-amber-300 border border-amber-500/40 rounded px-2 py-1 hover:bg-amber-500/10">+ Add ability</button>
                  </div>
                </div>
                <div><Label>Passive text</Label><textarea className={inputCls} rows={2} value={draft.passive} onChange={(e) => set({ passive: e.target.value })} placeholder="Takes 1 less combat damage while you control another Dwarf." /></div>
              </>
            )}
            {!unitLike && (
              <div><Label>Card Text {draft.type === "Event" ? "(effect)" : "(passive / persistent effect)"}</Label><textarea className={inputCls} rows={4} value={draft.text} onChange={(e) => set({ text: e.target.value })} placeholder="Deal 4 Party Damage, or 4 to a unit." /></div>
            )}
            <div><Label>Flavor text</Label><textarea className={inputCls} rows={2} value={draft.flavor} onChange={(e) => set({ flavor: e.target.value })} placeholder="A shield is a promise kept with your body." /></div>
            <div>
              <Label>Keywords (click to toggle)</Label>
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((k) => {
                  const on = draft.keywords.includes(k.name);
                  return <button key={k.name} title={k.desc} onClick={() => toggleKeyword(k.name)} className={"text-[11px] rounded px-2 py-1 border transition " + (on ? "bg-amber-500/20 border-amber-400 text-amber-200" : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-500")}>{k.name}</button>;
                })}
              </div>
              <div className="flex gap-2 mt-2">
                <input className={inputCls} value={newKw} onChange={(e) => setNewKw(e.target.value)} placeholder="add a new keyword…" />
                <button onClick={() => { if (newKw.trim()) { onAddKeyword(newKw.trim()); toggleKeyword(newKw.trim()); setNewKw(""); } }} className="shrink-0 px-3 rounded-md bg-amber-600 hover:bg-amber-500 text-black text-sm font-semibold">Add</button>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <p className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">Live preview</p>
            <CardTile card={draft} canEdit={false} onEdit={() => {}} onDelete={() => {}} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-neutral-800">
          <button onClick={onCancel} className="px-4 py-2 rounded-md bg-neutral-700 hover:bg-neutral-600 text-white text-sm">Cancel</button>
          <button onClick={onSave} disabled={saving} className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold">{saving ? "Saving…" : "Save card"}</button>
        </div>
      </div>
    </div>
  );
}

// ---- keywords view --------------------------------------------------------
function KeywordsView({ keywords, canEdit, onSet }) {
  const [name, setName] = useState(""); const [desc, setDesc] = useState("");
  const add = () => {
    if (!name.trim() || keywords.some((k) => k.name.toLowerCase() === name.trim().toLowerCase())) return;
    onSet([...keywords, { name: name.trim(), desc: desc.trim() }]); setName(""); setDesc("");
  };
  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-semibold text-amber-200 mb-1">Keywords</h2>
      <p className="text-sm text-neutral-400 mb-4">{canEdit ? "Add keywords here and they appear in every card editor." : "Sign in to add keywords."}</p>
      {canEdit && (
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input className={inputCls + " sm:w-48"} value={name} onChange={(e) => setName(e.target.value)} placeholder="Keyword" />
          <input className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What it does…" />
          <button onClick={add} className="shrink-0 px-4 rounded-md bg-amber-600 hover:bg-amber-500 text-black text-sm font-semibold">Add</button>
        </div>
      )}
      <div className="divide-y divide-neutral-800 border border-neutral-800 rounded-lg overflow-hidden">
        {keywords.map((k) => (
          <div key={k.name} className="flex items-start gap-3 px-3 py-2 bg-neutral-900">
            <span className="shrink-0 w-28 font-semibold text-amber-300 text-sm">{k.name}</span>
            <span className="flex-grow text-sm text-neutral-300">{k.desc}</span>
            {canEdit && <button onClick={() => onSet(keywords.filter((x) => x.name !== k.name))} className="shrink-0 text-rose-400 hover:text-rose-300 text-sm">remove</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- lore view ------------------------------------------------------------
function LoreView() {
  return (
    <div className="max-w-4xl">
      <h2 className="text-xl font-semibold text-amber-200 mb-1">Lore Combos (Domain reference)</h2>
      <p className="text-sm text-neutral-400 mb-4">Lore-accurate Tribe + Class pairings. Class dropdowns are locked to these.</p>
      <div className="overflow-x-auto border border-neutral-800 rounded-lg">
        <table className="w-full text-sm">
          <thead><tr className="bg-neutral-800 text-neutral-300 text-left"><th className="px-3 py-2">Tribe</th><th className="px-3 py-2">Signature ★</th><th className="px-3 py-2">Other classes</th><th className="px-3 py-2">Lean</th><th className="px-3 py-2">Allies</th><th className="px-3 py-2">Rivals</th></tr></thead>
          <tbody>
            {TRIBE_INFO.map((t, i) => (
              <tr key={t.tribe} className={i % 2 ? "bg-neutral-900" : "bg-neutral-900/40"}>
                <td className="px-3 py-2 font-semibold text-neutral-100">{t.tribe}</td>
                <td className="px-3 py-2 text-amber-300">{SIGNATURE[t.tribe]} ★</td>
                <td className="px-3 py-2 text-neutral-300">{t.others}</td>
                <td className="px-3 py-2 text-neutral-300">{t.lean}</td>
                <td className="px-3 py-2 text-neutral-400">{t.allies}</td>
                <td className="px-3 py-2 text-neutral-400">{t.rivals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- admin view -----------------------------------------------------------
function AdminView() {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [users, setUsers] = useState([]);
  const [writeToken, setWriteToken] = useState("");
  const [newUser, setNewUser] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { const t = localStorage.getItem("pd_admin"); if (t) { setToken(t); load(t); } }, []);
  const load = async (t) => {
    setErr("");
    const r = await fetch("/api/admin", { headers: { "x-admin-token": t }, cache: "no-store" });
    if (r.ok) { const d = await r.json(); setUsers(d.users || []); setWriteToken(d.writeToken || ""); setAuthed(true); localStorage.setItem("pd_admin", t); }
    else { setAuthed(false); setErr((await r.json().catch(() => ({}))).error || "Access denied."); }
  };
  const act = async (action, value) => {
    const r = await fetch("/api/admin", { method: "POST", headers: { "x-admin-token": token, "Content-Type": "application/json" }, body: JSON.stringify({ action, value }) });
    if (r.ok) { const d = await r.json(); setUsers(d.users || []); setWriteToken(d.writeToken || ""); }
    else setErr((await r.json().catch(() => ({}))).error || "Failed.");
  };

  if (!authed) {
    return (
      <div className="max-w-md">
        <h2 className="text-xl font-semibold text-amber-200 mb-1">Admin</h2>
        <p className="text-sm text-neutral-400 mb-4">Enter your owner key (the <code className="text-amber-300">ADMIN_TOKEN</code> you set in Vercel).</p>
        <div className="flex gap-2">
          <input className={inputCls} type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ADMIN_TOKEN" />
          <button onClick={() => load(token)} className="shrink-0 px-4 rounded-md bg-amber-600 hover:bg-amber-500 text-black text-sm font-semibold">Unlock</button>
        </div>
        {err && <p className="text-rose-400 text-sm mt-2">{err}</p>}
      </div>
    );
  }
  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-amber-200">Admin</h2>
        <button onClick={() => { localStorage.removeItem("pd_admin"); setAuthed(false); setToken(""); }} className="text-sm text-neutral-400 hover:text-white">Lock</button>
      </div>
      <div className="rounded-lg border border-neutral-800 p-4 bg-neutral-900">
        <Label>Shared write token (friends type this to add cards)</Label>
        <div className="flex gap-2">
          <input className={inputCls} value={writeToken} onChange={(e) => setWriteToken(e.target.value)} placeholder="set a shared token" />
          <button onClick={() => act("setWriteToken", writeToken)} className="shrink-0 px-4 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">Save</button>
        </div>
        {writeToken === "changeme" && <p className="text-amber-400 text-xs mt-2">⚠ Still the default — set your own token.</p>}
      </div>
      <div className="rounded-lg border border-neutral-800 p-4 bg-neutral-900">
        <Label>Users (each can add cards with the token above)</Label>
        <div className="flex gap-2 mb-3">
          <input className={inputCls} value={newUser} onChange={(e) => setNewUser(e.target.value)} placeholder="new username" onKeyDown={(e) => { if (e.key === "Enter" && newUser.trim()) { act("addUser", newUser.trim()); setNewUser(""); } }} />
          <button onClick={() => { if (newUser.trim()) { act("addUser", newUser.trim()); setNewUser(""); } }} className="shrink-0 px-4 rounded-md bg-amber-600 hover:bg-amber-500 text-black text-sm font-semibold">Add</button>
        </div>
        {users.length === 0 ? <p className="text-neutral-500 text-sm">No users yet. Add one above.</p> : (
          <div className="flex flex-wrap gap-2">
            {users.map((u) => (
              <span key={u} className="inline-flex items-center gap-2 bg-neutral-800 border border-neutral-700 rounded-full pl-3 pr-2 py-1 text-sm">
                {u}<button onClick={() => act("removeUser", u)} className="text-rose-400 hover:text-rose-300">✕</button>
              </span>
            ))}
          </div>
        )}
      </div>
      {err && <p className="text-rose-400 text-sm">{err}</p>}
    </div>
  );
}

// ---- main page ------------------------------------------------------------
export default function Page() {
  const [cards, setCards] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [view, setView] = useState("Unit");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [backendError, setBackendError] = useState(false);
  // auth (sign-in for writing)
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [signError, setSignError] = useState("");
  const draftOpen = useRef(false);
  const fileInput = useRef(null);
  draftOpen.current = !!draft;

  const writeHeaders = () => ({ "Content-Type": "application/json", "x-username": username, "x-token": token });

  const fetchData = async () => {
    try {
      const r = await fetch("/api/data", { cache: "no-store" });
      if (r.status === 503) { setBackendError(true); return; }
      const d = await r.json();
      setBackendError(false);
      setCards(d.cards || []);
      setKeywords(d.keywords || []);
    } catch (e) { /* offline; keep what we have */ }
  };

  // initial load + restore sign-in
  useEffect(() => {
    const u = localStorage.getItem("pd_user"); const t = localStorage.getItem("pd_token");
    if (u && t) { setUsername(u); setToken(t); fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, token: t }) }).then((r) => r.json()).then((d) => setAuthed(!!d.ok)).catch(() => {}); }
    fetchData();
  }, []);

  // poll for others' changes (paused while editing)
  useEffect(() => {
    const iv = setInterval(() => { if (!draftOpen.current) fetchData(); }, 12000);
    const onFocus = () => { if (!draftOpen.current) fetchData(); };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(iv); window.removeEventListener("focus", onFocus); };
  }, []);

  const signIn = async () => {
    setSignError("");
    const r = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, token }) });
    const d = await r.json().catch(() => ({}));
    if (d.ok) { setAuthed(true); localStorage.setItem("pd_user", username); localStorage.setItem("pd_token", token); }
    else { setAuthed(false); setSignError("Username or token not recognized."); }
  };
  const signOut = () => { setAuthed(false); localStorage.removeItem("pd_user"); localStorage.removeItem("pd_token"); };

  const isTypeView = CARD_TYPES.includes(view);
  const visible = cards.filter((c) => c.type === view);
  const counts = CARD_TYPES.reduce((a, t) => { a[t] = cards.filter((c) => c.type === t).length; return a; }, {});

  const startNew = () => setDraft(blankCard(view));
  const editCard = (card) => setDraft({ ...card, abilities: (card.abilities || []).map(normAbility), keywords: [...(card.keywords || [])] });

  const saveDraft = async () => {
    setSaving(true); setStatus("");
    const r = await fetch("/api/cards", { method: "POST", headers: writeHeaders(), body: JSON.stringify(draft) });
    setSaving(false);
    if (r.ok) { setCards((prev) => (prev.some((c) => c.id === draft.id) ? prev.map((c) => (c.id === draft.id ? draft : c)) : [...prev, draft])); setDraft(null); setStatus("Saved ✓"); }
    else { const d = await r.json().catch(() => ({})); alert("Couldn't save: " + (d.error || r.status)); }
  };
  const deleteCard = async (id) => {
    if (!confirm("Delete this card for everyone?")) return;
    const r = await fetch("/api/cards?id=" + encodeURIComponent(id), { method: "DELETE", headers: writeHeaders() });
    if (r.ok) setCards((prev) => prev.filter((c) => c.id !== id));
    else alert("Couldn't delete (are you signed in?)");
  };
  const setKeywordsRemote = async (next) => {
    setKeywords(next); // optimistic
    const r = await fetch("/api/keywords", { method: "PUT", headers: writeHeaders(), body: JSON.stringify({ keywords: next }) });
    if (!r.ok) { alert("Couldn't save keywords (are you signed in?)"); fetchData(); }
  };
  const addKeyword = (n) => { if (!keywords.some((k) => k.name.toLowerCase() === n.toLowerCase())) setKeywordsRemote([...keywords, { name: n, desc: "" }]); };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ cards, keywords, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "project-dd-cards.json"; a.click(); URL.revokeObjectURL(url);
  };
  const importJSON = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.cards)) throw new Error();
        if (!confirm(`Import ${parsed.cards.length} cards? This REPLACES the shared set for everyone.`)) return;
        const r = await fetch("/api/data", { method: "PUT", headers: writeHeaders(), body: JSON.stringify({ cards: parsed.cards, keywords: parsed.keywords }) });
        if (r.ok) fetchData(); else alert("Import failed (are you signed in?)");
      } catch { alert("That doesn't look like a Project DD export file."); }
    };
    reader.readAsText(file); e.target.value = "";
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex">
      <aside className="w-60 shrink-0 border-r border-neutral-800 bg-neutral-900/60 p-4 flex flex-col gap-1">
        <div className="mb-2"><h1 className="text-xl font-bold text-amber-300 leading-tight">PROJECT DD</h1><p className="text-xs text-neutral-500">Card Builder · shared</p></div>

        {/* sign-in box */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2 mb-2">
          {authed ? (
            <div className="flex items-center justify-between text-xs">
              <span className="text-emerald-400">● {username}</span>
              <button onClick={signOut} className="text-neutral-400 hover:text-white">sign out</button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <input className={inputCls + " text-xs py-1"} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
              <input className={inputCls + " text-xs py-1"} type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="shared token" />
              <button onClick={signIn} className="w-full rounded bg-amber-600 hover:bg-amber-500 text-black text-xs font-semibold py-1">Sign in to edit</button>
              {signError && <p className="text-rose-400 text-[10px]">{signError}</p>}
            </div>
          )}
        </div>

        <p className="text-[10px] uppercase tracking-wide text-neutral-600 mt-1 mb-1">Card types</p>
        {CARD_TYPES.map((t) => (
          <button key={t} onClick={() => setView(t)} className={"flex items-center justify-between rounded-md px-3 py-2 text-sm text-left transition " + (view === t ? "bg-violet-800/40 text-amber-200 border border-violet-600/50" : "hover:bg-neutral-800 text-neutral-300")}>
            <span>{t}</span><span className="text-[11px] text-neutral-500">{counts[t]}</span>
          </button>
        ))}
        <p className="text-[10px] uppercase tracking-wide text-neutral-600 mt-3 mb-1">Reference & settings</p>
        {["Keywords", "Lore", "Admin"].map((t) => (
          <button key={t} onClick={() => setView(t)} className={"rounded-md px-3 py-2 text-sm text-left transition " + (view === t ? "bg-violet-800/40 text-amber-200 border border-violet-600/50" : "hover:bg-neutral-800 text-neutral-300")}>{t}</button>
        ))}

        <div className="mt-auto pt-4 space-y-2">
          <button onClick={exportJSON} className="w-full rounded-md bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 px-3 py-2 text-sm">⬇ Export JSON</button>
          <button onClick={() => fileInput.current?.click()} disabled={!authed} className="w-full rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 border border-neutral-700 px-3 py-2 text-sm">⬆ Import JSON</button>
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={importJSON} />
          <p className="text-[10px] text-neutral-600 text-center">{status || "Shared store · auto-synced"}</p>
        </div>
      </aside>

      <main className="flex-grow p-6 overflow-x-hidden">
        {backendError && (
          <div className="mb-5 rounded-lg border border-amber-700/50 bg-amber-900/20 text-amber-200 px-4 py-3 text-sm">
            Backend isn't connected yet. Finish the storage setup (create the Upstash Redis store in Vercel and redeploy), then refresh.
          </div>
        )}
        {isTypeView ? (
          <>
            <div className="flex items-center justify-between mb-5">
              <div><h2 className="text-2xl font-bold text-neutral-100">{view}</h2><p className="text-sm text-neutral-500">{visible.length} card{visible.length === 1 ? "" : "s"}{!authed && " · read-only (sign in to edit)"}</p></div>
              {authed && <button onClick={startNew} className="rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 text-sm shadow">+ New {view}</button>}
            </div>
            {visible.length === 0 ? (
              <div className="border border-dashed border-neutral-800 rounded-xl p-12 text-center text-neutral-500">No {view} cards yet.{authed && <> Click <span className="text-amber-400 font-semibold">+ New {view}</span>.</>}</div>
            ) : (
              <div className="flex flex-wrap gap-4">
                {visible.map((c) => <CardTile key={c.id} card={c} canEdit={authed} onEdit={() => editCard(c)} onDelete={() => deleteCard(c.id)} />)}
              </div>
            )}
          </>
        ) : view === "Keywords" ? (
          <KeywordsView keywords={keywords} canEdit={authed} onSet={setKeywordsRemote} />
        ) : view === "Lore" ? (
          <LoreView />
        ) : (
          <AdminView />
        )}
      </main>

      {draft && <Editor draft={draft} setDraft={setDraft} keywords={keywords} onAddKeyword={addKeyword} onSave={saveDraft} onCancel={() => setDraft(null)} saving={saving} />}
    </div>
  );
}
