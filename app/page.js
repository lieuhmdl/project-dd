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

// Race/class data is stored in Redis and loaded dynamically.
// These helpers derive the shapes the editor needs from the races array.
const POSITIONS = ["Frontline", "Backline"];
const RARITIES = ["Common", "Uncommon", "Rare", "Legendary", "Mythic"];
const CARD_TYPES = ["Unit", "Ancient Legend", "Ancient Relic", "Event", "Artifact"];
const UNIT_LIKE = ["Unit", "Ancient Legend"];
const CHART_COLORS = ["#f59e0b","#8b5cf6","#10b981","#ef4444","#3b82f6","#f97316","#06b6d4","#84cc16","#ec4899","#a78bfa","#34d399","#fb923c","#60a5fa","#f472b6","#fbbf24","#e879f9","#2dd4bf","#fb7185"];
const GROUP_BY_OPTIONS = [
  { value: "type", label: "Card Type" }, { value: "race", label: "Race / Tribe" },
  { value: "klass", label: "Class" }, { value: "rarity", label: "Rarity" },
  { value: "position", label: "Position" }, { value: "author", label: "Author" },
  { value: "keyword", label: "Keyword Distribution" }, { value: "tribe", label: "Companion Tribe" },
];

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
function blankCard(type) {
  return { id: uid(), type, name: "", provisions: "", mana: "", rarity: "Common", race: "", klass: "", position: "Frontline", keywords: [], attack: "", health: "", strike: "", abilities: [], passive: "", text: "", flavor: "", author: "", tribes: [] };
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
  const hasActiveAbilities = !unitLike && (card.type === "Artifact" || card.type === "Ancient Relic");
  const bodyLines = unitLike
    ? [card.strike ? `Strike: ${card.strike}` : "", ...(card.abilities || []).map(abilityLine).filter(Boolean).map((a) => `\u2022 ${a}`), card.passive ? `Passive: ${card.passive}` : ""].filter(Boolean)
    : [...(card.text ? [card.text] : []), ...(hasActiveAbilities ? (card.abilities || []).map(abilityLine).filter(Boolean).map((a) => `\u2022 ${a}`) : [])];
  return (
    <div className="group relative w-full rounded-xl border border-neutral-700 bg-neutral-900 shadow-lg overflow-hidden flex flex-col">
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
      {card.tribes && card.tribes.length > 0 && (
        <div className="px-3 pb-1.5 flex flex-wrap gap-1">{card.tribes.map((t) => <span key={t} className="text-[10px] text-violet-300 border border-violet-500/40 rounded px-1.5 py-0.5">{t}</span>)}</div>
      )}
      {unitLike && (
        <div className="grid grid-cols-2 text-center text-sm font-bold border-t border-neutral-700 bg-neutral-800/60">
          <div className="py-1 text-rose-300">ATK {card.attack || 0}</div>
          <div className="py-1 text-emerald-300 border-l border-neutral-700">HP {card.health || 0}</div>
        </div>
      )}
      {card.author && <div className="px-3 py-1 text-[10px] text-neutral-500 border-t border-neutral-800 text-right">by {card.author}</div>}
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
function Editor({ draft, setDraft, keywords, onAddKeyword, onSave, onCancel, saving, users, races }) {
  const unitLike = UNIT_LIKE.includes(draft.type);
  const isCompanion = draft.type === "Ancient Legend";
  const raceEntry = (races || []).find((r) => r.name === draft.race);
  const classOptions = raceEntry ? raceEntry.classes : [];
  const raceNames = (races || []).map((r) => r.name);
  const set = (patch) => setDraft({ ...draft, ...patch });
  const toggleTribe = (t) => set({ tribes: (draft.tribes || []).includes(t) ? (draft.tribes || []).filter((x) => x !== t) : [...(draft.tribes || []), t] });
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
                  <Select label="Race / Tribe" value={draft.race} onChange={(v) => { const entry = (races||[]).find(r=>r.name===v); set({ race: v, klass: entry?.classes.includes(draft.klass) ? draft.klass : "" }); }} options={raceNames} placeholder="Race" />
                  <Select label="Class" value={draft.klass} onChange={(v) => set({ klass: v })} options={classOptions} placeholder={draft.race ? "Class" : "pick race first"} disabled={!draft.race} />
                  <Select label="Position" value={draft.position} onChange={(v) => set({ position: v })} options={POSITIONS} placeholder="Position" />
                </div>
                {draft.race && raceEntry?.signature && <p className="text-[11px] text-neutral-500 -mt-1">Signature class for {draft.race}: <span className="text-amber-400">{raceEntry.signature}</span>.</p>}
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
                        <textarea className={inputCls + " resize-none overflow-hidden transition-all duration-200 leading-snug"} rows={1} value={ab.text} onChange={(e) => { setAbility(i, "text", e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} onFocus={(e) => { if (e.target.rows === 1) { e.target.style.height = "auto"; e.target.style.height = Math.max(e.target.scrollHeight, 72) + "px"; } }} onBlur={(e) => { if (!ab.text) { e.target.style.height = ""; } }} placeholder={`Ability ${i + 1} — e.g. Shield Bash: Strike and Stun.`} style={{ minHeight: "2.25rem" }} />
                        <button onClick={() => set({ abilities: draft.abilities.filter((_, x) => x !== i) })} className="shrink-0 px-2 rounded-md bg-neutral-700 hover:bg-rose-700 text-white text-sm">✕</button>
                      </div>
                    ))}
                    <button onClick={() => set({ abilities: [...draft.abilities, { prov: "", mana: "", text: "" }] })} className="text-xs text-amber-300 border border-amber-500/40 rounded px-2 py-1 hover:bg-amber-500/10">+ Add ability</button>
                  </div>
                </div>
                <div><Label>Passive text</Label><textarea className={inputCls} rows={2} value={draft.passive} onChange={(e) => set({ passive: e.target.value })} placeholder="Takes 1 less combat damage while you control another Dwarf." /></div>
                {isCompanion && (
                  <div>
                    <Label>Race / Tribe Compatibility (click to toggle)</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {raceNames.map((r) => {
                        const on = (draft.tribes || []).includes(r);
                        return <button key={r} type="button" onClick={() => toggleTribe(r)} className={"text-[11px] rounded px-2 py-1 border transition " + (on ? "bg-violet-500/20 border-violet-400 text-violet-200" : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-500")}>{r}</button>;
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
            {!unitLike && (
              <>
                <div><Label>Card Text {draft.type === "Event" ? "(effect)" : "(passive / persistent effect)"}</Label><textarea className={inputCls} rows={4} value={draft.text} onChange={(e) => set({ text: e.target.value })} placeholder="Deal 4 Party Damage, or 4 to a unit." /></div>
                {(draft.type === "Artifact" || draft.type === "Ancient Relic") && (
                  <div>
                    <Label>Active Abilities (Prov / Mana cost + effect)</Label>
                    <div className="space-y-2">
                      {(draft.abilities || []).map((ab, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input className={inputCls + " w-12 text-center px-1"} value={ab.prov} onChange={(e) => setAbility(i, "prov", e.target.value)} placeholder="P" inputMode="numeric" title="Provisions cost" />
                          <input className={inputCls + " w-12 text-center px-1"} value={ab.mana} onChange={(e) => setAbility(i, "mana", e.target.value)} placeholder="M" inputMode="numeric" title="Mana cost" />
                          <textarea className={inputCls + " resize-none overflow-hidden transition-all duration-200 leading-snug"} rows={1} value={ab.text} onChange={(e) => { setAbility(i, "text", e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} onFocus={(e) => { e.target.style.height = "auto"; e.target.style.height = Math.max(e.target.scrollHeight, 72) + "px"; }} onBlur={(e) => { if (!ab.text) e.target.style.height = ""; }} placeholder={`Active ability ${i + 1} — e.g. Activate: deal 2 to a unit.`} style={{ minHeight: "2.25rem" }} />
                          <button onClick={() => set({ abilities: draft.abilities.filter((_, x) => x !== i) })} className="shrink-0 px-2 rounded-md bg-neutral-700 hover:bg-rose-700 text-white text-sm">✕</button>
                        </div>
                      ))}
                      <button onClick={() => set({ abilities: [...(draft.abilities || []), { prov: "", mana: "", text: "" }] })} className="text-xs text-amber-300 border border-amber-500/40 rounded px-2 py-1 hover:bg-amber-500/10">+ Add active ability</button>
                    </div>
                  </div>
                )}
                {draft.type === "Ancient Relic" && (
                  <div>
                    <Label>Race / Tribe Compatibility (click to toggle)</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {raceNames.map((r) => {
                        const on = (draft.tribes || []).includes(r);
                        return <button key={r} type="button" onClick={() => toggleTribe(r)} className={"text-[11px] rounded px-2 py-1 border transition " + (on ? "bg-violet-500/20 border-violet-400 text-violet-200" : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-500")}>{r}</button>;
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
            <div><Label>Flavor text</Label><textarea className={inputCls} rows={2} value={draft.flavor} onChange={(e) => set({ flavor: e.target.value })} placeholder="A shield is a promise kept with your body." /></div>
            <Select label="Authored by" value={draft.author || ""} onChange={(v) => set({ author: v })} options={users || []} placeholder="— select author —" />
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
  const [editing, setEditing] = useState(null); // keyword name being edited
  const [editDesc, setEditDesc] = useState("");

  const add = () => {
    if (!name.trim() || keywords.some((k) => k.name.toLowerCase() === name.trim().toLowerCase())) return;
    onSet([...keywords, { name: name.trim(), desc: desc.trim() }]); setName(""); setDesc("");
  };
  const startEdit = (k) => { setEditing(k.name); setEditDesc(k.desc); };
  const saveEdit = (kName) => { onSet(keywords.map((k) => k.name === kName ? { ...k, desc: editDesc } : k)); setEditing(null); };

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
            <span className="shrink-0 w-28 font-semibold text-amber-300 text-sm pt-0.5">{k.name}</span>
            {canEdit && editing === k.name ? (
              <>
                <input autoFocus className={inputCls + " flex-grow text-sm"} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(k.name); if (e.key === "Escape") setEditing(null); }} placeholder="What it does…" />
                <button onClick={() => saveEdit(k.name)} className="shrink-0 text-emerald-400 hover:text-emerald-200 text-sm">save</button>
                <button onClick={() => setEditing(null)} className="shrink-0 text-neutral-500 hover:text-white text-sm">cancel</button>
              </>
            ) : (
              <>
                <span className="flex-grow text-sm text-neutral-300">{k.desc || <span className="text-neutral-600 italic">no description</span>}</span>
                {canEdit && <button onClick={() => startEdit(k)} className="shrink-0 text-neutral-500 hover:text-amber-300 text-sm">edit</button>}
                {canEdit && <button onClick={() => onSet(keywords.filter((x) => x.name !== k.name))} className="shrink-0 text-rose-400 hover:text-rose-300 text-sm">remove</button>}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- lore view ------------------------------------------------------------
function LoreView({ races, onSetRaces, canEdit }) {
  const [expanded, setExpanded] = useState(null);
  const [newClassName, setNewClassName] = useState("");
  // new race form
  const [raceName, setRaceName] = useState("");
  const [raceSig, setRaceSig] = useState("");
  const [raceLean, setRaceLean] = useState("");
  const [raceAllies, setRaceAllies] = useState("");
  const [raceRivals, setRaceRivals] = useState("");

  const update = (next) => onSetRaces(next);

  const addRace = () => {
    const name = raceName.trim();
    if (!name || races.some((r) => r.name.toLowerCase() === name.toLowerCase())) return;
    update([...races, { name, signature: raceSig.trim(), classes: raceSig.trim() ? [raceSig.trim()] : [], lean: raceLean.trim(), allies: raceAllies.trim(), rivals: raceRivals.trim() }]);
    setRaceName(""); setRaceSig(""); setRaceLean(""); setRaceAllies(""); setRaceRivals("");
  };

  const deleteRace = (name) => update(races.filter((r) => r.name !== name));

  const addClass = (raceName) => {
    const cls = newClassName.trim();
    if (!cls) return;
    update(races.map((r) => r.name === raceName && !r.classes.includes(cls) ? { ...r, classes: [...r.classes, cls] } : r));
    setNewClassName("");
  };

  const removeClass = (raceName, cls) =>
    update(races.map((r) => r.name === raceName ? { ...r, classes: r.classes.filter((c) => c !== cls), signature: r.signature === cls ? "" : r.signature } : r));

  const setSignature = (raceName, cls) =>
    update(races.map((r) => r.name === raceName ? { ...r, signature: r.signature === cls ? "" : cls } : r));

  const updateField = (raceName, field, value) =>
    update(races.map((r) => r.name === raceName ? { ...r, [field]: value } : r));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-amber-200 mb-1">Tribe / Race Reference</h2>
        <p className="text-sm text-neutral-400 mb-4">Lore-accurate pairings — class dropdowns in the card editor are locked to these.</p>
        <div className="overflow-x-auto border border-neutral-800 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-800 text-neutral-300 text-left">
                <th className="px-3 py-2">Tribe</th>
                <th className="px-3 py-2">Signature ★</th>
                <th className="px-3 py-2">Classes</th>
                <th className="px-3 py-2">Lean</th>
                <th className="px-3 py-2">Allies</th>
                <th className="px-3 py-2">Rivals</th>
                {canEdit && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {races.map((r, i) => (
                <>
                  <tr key={r.name} className={i % 2 ? "bg-neutral-900" : "bg-neutral-900/40"}>
                    <td className="px-3 py-2 font-semibold text-neutral-100">{r.name}</td>
                    <td className="px-3 py-2 text-amber-300">{r.signature ? `${r.signature} ★` : <span className="text-neutral-600">—</span>}</td>
                    <td className="px-3 py-2 text-neutral-300">{r.classes.filter((c) => c !== r.signature).join(", ") || <span className="text-neutral-600">—</span>}</td>
                    <td className="px-3 py-2 text-neutral-300">{r.lean || <span className="text-neutral-600">—</span>}</td>
                    <td className="px-3 py-2 text-neutral-400">{r.allies || <span className="text-neutral-600">—</span>}</td>
                    <td className="px-3 py-2 text-neutral-400">{r.rivals || <span className="text-neutral-600">—</span>}</td>
                    {canEdit && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button onClick={() => setExpanded(expanded === r.name ? null : r.name)} className="text-xs text-amber-400 hover:text-amber-200 mr-2">{expanded === r.name ? "▲ Close" : "▼ Edit"}</button>
                        <button onClick={() => deleteRace(r.name)} className="text-xs text-rose-500 hover:text-rose-300">Delete</button>
                      </td>
                    )}
                  </tr>
                  {canEdit && expanded === r.name && (
                    <tr key={r.name + "-edit"} className="bg-neutral-800/60">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="space-y-3">
                          {/* classes */}
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-neutral-400 mb-1.5">Classes — click ★ to set signature</p>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {r.classes.map((cls) => (
                                <span key={cls} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs bg-neutral-900 border-neutral-700 text-neutral-200">
                                  <button onClick={() => setSignature(r.name, cls)} title="Set as signature" className={r.signature === cls ? "text-amber-400" : "text-neutral-600 hover:text-amber-400"}>★</button>
                                  {cls}
                                  <button onClick={() => removeClass(r.name, cls)} className="text-neutral-600 hover:text-rose-400">✕</button>
                                </span>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <input className={inputCls + " max-w-[200px]"} value={newClassName} onChange={(e) => setNewClassName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addClass(r.name); }} placeholder="New class name…" />
                              <button onClick={() => addClass(r.name)} className="shrink-0 px-3 rounded-md bg-amber-600 hover:bg-amber-500 text-black text-sm font-semibold">Add Class</button>
                            </div>
                          </div>
                          {/* meta fields */}
                          <div className="grid grid-cols-3 gap-3">
                            <div><label className="block text-[11px] uppercase tracking-wide text-neutral-400 mb-1">Lean</label><input className={inputCls} value={r.lean} onChange={(e) => updateField(r.name, "lean", e.target.value)} placeholder="Frontline / Backline / Flexible" /></div>
                            <div><label className="block text-[11px] uppercase tracking-wide text-neutral-400 mb-1">Allies</label><input className={inputCls} value={r.allies} onChange={(e) => updateField(r.name, "allies", e.target.value)} placeholder="Allied races…" /></div>
                            <div><label className="block text-[11px] uppercase tracking-wide text-neutral-400 mb-1">Rivals</label><input className={inputCls} value={r.rivals} onChange={(e) => updateField(r.name, "rivals", e.target.value)} placeholder="Rival races…" /></div>
                          </div>
                          <button onClick={() => update([...races])} className="text-xs text-emerald-400 hover:text-emerald-200 border border-emerald-700/40 rounded px-3 py-1 hover:bg-emerald-900/20">Save changes</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-amber-300">Add New Tribe / Race</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div><label className="block text-[11px] uppercase tracking-wide text-neutral-400 mb-1">Race Name <span className="text-rose-400">*</span></label><input className={inputCls} value={raceName} onChange={(e) => setRaceName(e.target.value)} placeholder="e.g. Tiefling" /></div>
            <div><label className="block text-[11px] uppercase tracking-wide text-neutral-400 mb-1">Signature Class</label><input className={inputCls} value={raceSig} onChange={(e) => setRaceSig(e.target.value)} placeholder="e.g. Warlock" /></div>
            <div><label className="block text-[11px] uppercase tracking-wide text-neutral-400 mb-1">Lean</label><input className={inputCls} value={raceLean} onChange={(e) => setRaceLean(e.target.value)} placeholder="Frontline / Backline…" /></div>
            <div><label className="block text-[11px] uppercase tracking-wide text-neutral-400 mb-1">Allies</label><input className={inputCls} value={raceAllies} onChange={(e) => setRaceAllies(e.target.value)} placeholder="Allied races…" /></div>
            <div><label className="block text-[11px] uppercase tracking-wide text-neutral-400 mb-1">Rivals</label><input className={inputCls} value={raceRivals} onChange={(e) => setRaceRivals(e.target.value)} placeholder="Rival races…" /></div>
          </div>
          <button onClick={addRace} disabled={!raceName.trim()} className="px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-black text-sm font-semibold">Add Race</button>
        </div>
      )}
      {!canEdit && <p className="text-sm text-neutral-500">Sign in to manage tribes and classes.</p>}
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

// ---- changelog view --------------------------------------------------------
function ChangeLogView({ changelog }) {
  const [selected, setSelected] = useState(null);

  const actionColor = { created: "text-emerald-400", edited: "text-amber-300", deleted: "text-rose-400" };
  const actionBg   = { created: "bg-emerald-900/30 border-emerald-700/40", edited: "bg-amber-900/20 border-amber-700/40", deleted: "bg-rose-900/20 border-rose-700/40" };
  const actionIcon = { created: "＋", edited: "✎", deleted: "✕" };

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
    return new Date(ts).toLocaleString();
  }

  const SNAP_FIELDS = [
    ["Name", "name"], ["Type", "type"], ["Rarity", "rarity"],
    ["Provisions", "provisions"], ["Mana", "mana"],
    ["Race", "race"], ["Class", "klass"], ["Position", "position"],
    ["Attack", "attack"], ["Health", "health"],
    ["Strike", "strike"], ["Passive", "passive"],
    ["Card Text", "text"], ["Flavor", "flavor"], ["Author", "author"],
    ["Keywords", "keywords"], ["Tribes", "tribes"], ["Abilities", "abilities"],
  ];

  function renderVal(card, key) {
    const v = card?.[key];
    if (key === "keywords" || key === "tribes") return (v || []).join(", ") || "—";
    if (key === "abilities") return (v || []).map((a, i) => {
      const cost = [a.prov ? `${a.prov}P` : "", a.mana ? `${a.mana}M` : ""].filter(Boolean).join(" ");
      return `${i + 1}. ${cost ? `(${cost}) ` : ""}${a.text}`;
    }).join("\n") || "—";
    return String(v ?? "") || "—";
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold text-amber-200 mb-1">Change Log</h2>
      <p className="text-sm text-neutral-400 mb-4">All card and deck additions, edits, and deletions — click any entry to see details.</p>
      {changelog.length === 0 ? (
        <div className="border border-dashed border-neutral-800 rounded-xl p-10 text-center text-neutral-500">No changes recorded yet.</div>
      ) : (
        <div className="border border-neutral-800 rounded-lg overflow-hidden divide-y divide-neutral-800">
          {changelog.map((e) => (
            <button
              key={e.id}
              onClick={() => setSelected(selected?.id === e.id ? null : e)}
              className={"w-full text-left transition " + (selected?.id === e.id ? "bg-neutral-800" : "bg-neutral-900 hover:bg-neutral-800/60")}
            >
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className={"shrink-0 w-5 text-center font-bold " + (actionColor[e.action] || "text-neutral-400")}>{actionIcon[e.action] || "·"}</span>
                <span className={"shrink-0 text-xs font-semibold uppercase tracking-wide w-14 " + (actionColor[e.action] || "text-neutral-400")}>{e.action}</span>
                <span className="flex-grow text-sm text-neutral-100 truncate">
                  <span className="font-semibold">{e.cardName}</span>
                  <span className={"ml-1.5 text-xs " + (e.cardType === "Deck" ? "text-violet-400" : "text-neutral-500")}>{e.cardType}</span>
                </span>
                <span className="shrink-0 text-xs text-neutral-500">{e.username}</span>
                <span className="shrink-0 text-xs text-neutral-600 w-16 text-right">{timeAgo(e.timestamp)}</span>
                <span className="shrink-0 text-neutral-600 text-xs">{selected?.id === e.id ? "▲" : "▼"}</span>
              </div>

              {selected?.id === e.id && (
                <div className={"mx-3 mb-3 rounded-lg border p-3 text-left " + (actionBg[e.action] || "bg-neutral-800 border-neutral-700")}>
                  {/* Edits: show a before/after diff table */}
                  {e.action === "edited" && e.diff && e.diff.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">Fields changed</p>
                      <div className="space-y-2">
                        {e.diff.map((d) => (
                          <div key={d.label}>
                            <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-0.5">{d.label}</p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-rose-950/50 border border-rose-800/40 rounded px-2 py-1 text-rose-300 whitespace-pre-wrap break-words">
                                <span className="text-rose-600 text-[10px] mr-1">before</span>{d.before}
                              </div>
                              <div className="bg-emerald-950/50 border border-emerald-800/40 rounded px-2 py-1 text-emerald-300 whitespace-pre-wrap break-words">
                                <span className="text-emerald-600 text-[10px] mr-1">after</span>{d.after}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {e.action === "edited" && (!e.diff || e.diff.length === 0) && (
                    <p className="text-sm text-neutral-500">No field differences recorded.</p>
                  )}

                  {/* Deck creates/deletes: show deck snapshot */}
                  {(e.action === "created" || e.action === "deleted") && e.deckSnapshot && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">Deck snapshot</p>
                      <div className="space-y-1">
                        {[["Name","name"],["Author","author"],["Companion","companion"],["Total Cards","totalCards"],["Description","description"]].map(([label, key]) => {
                          const val = String(e.deckSnapshot[key] ?? "");
                          if (!val) return null;
                          return (
                            <div key={key} className="grid grid-cols-[100px_1fr] gap-2 text-xs">
                              <span className="text-neutral-500 uppercase tracking-wide text-[10px] pt-0.5">{label}</span>
                              <span className="text-neutral-200 whitespace-pre-wrap break-words">{val}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Card creates/deletes: show card snapshot */}
                  {(e.action === "created" || e.action === "deleted") && e.snapshot && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">Card snapshot</p>
                      <div className="space-y-1">
                        {SNAP_FIELDS.map(([label, key]) => {
                          const val = renderVal(e.snapshot, key);
                          if (!val || val === "—") return null;
                          return (
                            <div key={key} className="grid grid-cols-[100px_1fr] gap-2 text-xs">
                              <span className="text-neutral-500 uppercase tracking-wide text-[10px] pt-0.5">{label}</span>
                              <span className="text-neutral-200 whitespace-pre-wrap break-words">{val}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {(e.action === "created" || e.action === "deleted") && !e.snapshot && !e.deckSnapshot && (
                    <p className="text-sm text-neutral-500">No snapshot available for this entry.</p>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- rulebook modal --------------------------------------------------------
function RulebookModal({ onClose }) {
  const [html, setHtml] = useState("");
  const [sections, setSections] = useState([]);
  const [active, setActive] = useState(null);
  const contentRef = useRef(null);
  const sidebarRef = useRef(null);
  const isUserScrolling = useRef(false);
  const scrollTimer = useRef(null);

  useEffect(() => {
    fetch("/api/rulebook")
      .then((r) => r.json())
      .then(({ html, sections }) => {
        setHtml(html || "");
        setSections(sections || []);
        if (sections?.length) setActive(sections[0].text);
      });
  }, []);

  // Scroll spy: on every scroll event find the last heading above the top ~20% of the container
  useEffect(() => {
    if (!html || !contentRef.current) return;
    const container = contentRef.current;

    const onScroll = () => {
      if (isUserScrolling.current) return;
      const headings = Array.from(container.querySelectorAll("h1,h2,h3"));
      if (!headings.length) return;
      const cutoff = container.getBoundingClientRect().top + 40;
      let current = headings[0];
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= cutoff) current = h;
        else break;
      }
      setActive(current.textContent.trim());
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    // run once immediately so the first section is highlighted on open
    onScroll();
    return () => container.removeEventListener("scroll", onScroll);
  }, [html]);

  // Auto-scroll the TOC sidebar to keep active item visible
  useEffect(() => {
    if (!active || !sidebarRef.current) return;
    const btn = sidebarRef.current.querySelector(`[data-section="${CSS.escape(active)}"]`);
    if (btn) btn.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  function scrollTo(text) {
    // Suppress observer updates while the programmatic scroll plays out
    isUserScrolling.current = true;
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => { isUserScrolling.current = false; }, 800);

    setActive(text);
    if (!contentRef.current) return;
    const headings = contentRef.current.querySelectorAll("h1,h2,h3");
    for (const h of headings) {
      if (h.textContent.trim() === text) {
        h.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="relative flex w-full max-w-5xl h-[85vh] rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* sidebar */}
        <aside ref={sidebarRef} className="w-56 shrink-0 border-r border-neutral-800 overflow-y-auto p-3 space-y-0.5">
          <p className="text-[10px] uppercase tracking-widest text-neutral-500 px-2 pb-2">Sections</p>
          {sections.map((s) => (
            <button
              key={s.text}
              data-section={s.text}
              onClick={() => scrollTo(s.text)}
              className={"w-full text-left rounded px-2 py-1.5 text-sm transition-all duration-200 delay-200 " +
                (s.level === 1 ? "font-semibold " : s.level === 2 ? "pl-4 " : "pl-6 text-xs ") +
                (active === s.text ? "bg-amber-600/20 text-amber-200" : "text-neutral-400 hover:text-white hover:bg-neutral-800")}
            >
              {s.text}
            </button>
          ))}
        </aside>
        {/* content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-8 rulebook-content" dangerouslySetInnerHTML={{ __html: html }} />
        {/* top-right controls */}
        <div className="absolute top-3 right-3 flex items-center gap-2 group/bar">
          <a href="/rulebook.docx" download className="opacity-0 group-hover/bar:opacity-100 transition-opacity duration-150 text-xs px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white backdrop-blur-sm whitespace-nowrap">Download Rulebook</a>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-xl leading-none">✕</button>
        </div>
      </div>
    </div>
  );
}

// ---- pie chart -------------------------------------------------------------
function PieChart({ slices, sz = 210 }) {
  const [hovered, setHovered] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const size = sz, cx = sz / 2, cy = sz / 2, r = Math.round(sz * 88 / 210);
  const total = slices.reduce((s, d) => s + d.value, 0);

  if (!total) return (
    <div className="flex items-center justify-center rounded-full border border-neutral-800" style={{ width: size, height: size }}>
      <p className="text-neutral-600 text-xs">No data</p>
    </div>
  );

  let angle = -Math.PI / 2;
  const segs = slices.map((s, i) => {
    const sweep = (s.value / total) * 2 * Math.PI;
    const a0 = angle, a1 = angle + sweep;
    angle = a1;
    let d;
    if (sweep >= 2 * Math.PI - 0.001) {
      d = `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
    } else {
      const x1 = cx + r * Math.cos(a0), y1 = cy + r * Math.sin(a0);
      const x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1);
      d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
    }
    return { ...s, d, i, mid: a0 + sweep / 2 };
  });

  return (
    <>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segs.map((seg) => (
          <path key={seg.i} d={seg.d} fill={seg.color} stroke="#0a0a0a" strokeWidth="1.5"
            className="cursor-pointer"
            opacity={hovered !== null && hovered !== seg.i ? 0.45 : 1}
            style={{ transition: "opacity 0.1s" }}
            onMouseEnter={(e) => { setHovered(seg.i); setTooltip({ x: e.clientX, y: e.clientY, label: seg.label, value: seg.value, pct: ((seg.value / total) * 100).toFixed(1) }); }}
            onMouseMove={(e) => setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
            onMouseLeave={() => { setHovered(null); setTooltip(null); }}
          />
        ))}
        <text x={cx} y={cy - 5} textAnchor="middle" fill="#e5e5e5" fontSize="22" fontWeight="bold" style={{ pointerEvents: "none" }}>{total}</text>
        <text x={cx} y={cy + 13} textAnchor="middle" fill="#525252" fontSize="10" style={{ pointerEvents: "none" }}>cards</text>
      </svg>
      {tooltip && (
        <div className="fixed z-[999] pointer-events-none px-2.5 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-xs text-white shadow-xl" style={{ left: tooltip.x + 14, top: tooltip.y - 30 }}>
          <span className="font-semibold">{tooltip.label}</span>
          <span className="text-neutral-400 ml-2">{tooltip.value} ({tooltip.pct}%)</span>
        </div>
      )}
    </>
  );
}

// ---- cost bar chart (used by DeckViewModal) ---------------------------------
function CostBarChart({ data, color, label }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const BAR_W = 22, GAP = 3, H = 72, PAD_T = 18, PAD_B = 20;
  const totalW = data.length * (BAR_W + GAP) - GAP;
  return (
    <div className="flex flex-col items-center">
      <p className="text-[10px] uppercase tracking-wide font-bold mb-1" style={{ color }}>{label}</p>
      <svg width={totalW} height={H + PAD_T + PAD_B} style={{ overflow: "visible" }}>
        {data.map((d, i) => {
          const barH = d.value > 0 ? Math.max(3, Math.round((d.value / max) * H)) : 0;
          const x = i * (BAR_W + GAP);
          return (
            <g key={i}>
              {barH > 0 && <rect x={x} y={PAD_T + H - barH} width={BAR_W} height={barH} fill={color} rx={2} opacity={0.8} />}
              {d.value > 0 && <text x={x + BAR_W / 2} y={PAD_T + H - barH - 3} textAnchor="middle" fill="#d4d4d4" fontSize={9} fontWeight="600">{d.value}</text>}
              <text x={x + BAR_W / 2} y={PAD_T + H + 14} textAnchor="middle" fill="#737373" fontSize={9}>{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---- deck view modal --------------------------------------------------------
function DeckViewModal({ deck, authed, isOwner, onSave, onEdit, onDelete, onCopy, onClose }) {
  const [desc, setDesc] = useState(deck.description || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const DECK_ORDER  = ["Unit", "Event", "Artifact"];
  const TYPE_COLORS = { "Unit": "#8b5cf6", "Event": "#10b981", "Artifact": "#3b82f6" };
  const TYPE_PLURAL = { "Unit": "Units", "Event": "Events", "Artifact": "Artifacts" };

  const allEntries = [
    ...(deck.companion ? [{ card: deck.companion, count: 1 }] : []),
    ...(deck.cards || []),
  ];
  const deckTotal = (deck.cards || []).reduce((s, e) => s + e.count, 0);

  const makeDist = (field) =>
    Array.from({ length: 8 }, (_, i) => ({
      label: i === 7 ? "7+" : String(i),
      value: allEntries.reduce((s, { card, count }) => {
        const v = parseInt(card[field]) || 0;
        return s + (i === 7 ? (v >= 7 ? count : 0) : (v === i ? count : 0));
      }, 0),
    }));

  const grouped = DECK_ORDER.map(type => ({
    type,
    entries: (deck.cards || []).filter(d => d.card.type === type).sort((a, b) => a.card.name.localeCompare(b.card.name)),
  })).filter(g => g.entries.length > 0);

  const saveDesc = async () => {
    setSaving(true);
    await onSave({ ...deck, description: desc });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="w-full max-w-2xl flex flex-col rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl overflow-hidden" style={{ maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-neutral-800 shrink-0" style={{ background: "rgba(139,92,246,0.08)" }}>
          <div>
            <h2 className="text-xl font-bold text-amber-200">{deck.name || "(untitled)"}</h2>
            {deck.author && <p className="text-sm text-neutral-400">by {deck.author}</p>}
            <p className="text-xs text-neutral-600 mt-0.5">{deckTotal} / 40 cards</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-4">
            {isOwner && <button onClick={() => { onClose(); onEdit(deck); }} className="text-xs border border-neutral-600 hover:border-amber-500 text-neutral-300 hover:text-amber-300 rounded px-2.5 py-1 transition">Edit</button>}
            {isOwner && <button onClick={() => { onDelete(deck.id); onClose(); }} className="text-xs bg-rose-700/60 hover:bg-rose-700 text-white rounded px-2.5 py-1 transition">Delete</button>}
            {authed && !isOwner && <button onClick={() => { onClose(); onCopy(deck); }} className="text-xs bg-violet-700/60 hover:bg-violet-700 text-white rounded px-2.5 py-1 transition">Create a Copy</button>}
            <button onClick={onClose} className="text-neutral-400 hover:text-white text-xl leading-none ml-1">✕</button>
          </div>
        </div>

        {/* body */}
        <div className="flex-grow overflow-y-auto">
          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-neutral-800">
            {/* left: description + deck list */}
            <div className="p-5 space-y-5">
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5 font-bold">Description / Strategy Guide</label>
                {isOwner ? (
                  <>
                    <textarea className={inputCls + " text-sm"} rows={4} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe your strategy, win conditions, key combos…" />
                    {desc !== (deck.description || "") && (
                      <button onClick={saveDesc} disabled={saving} className="mt-1.5 text-xs rounded-md bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white px-3 py-1 transition">
                        {saving ? "Saving…" : saved ? "Saved!" : "Save Description"}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-neutral-300 whitespace-pre-wrap">{desc || <span className="text-neutral-600 italic">No description yet.</span>}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-2 font-bold">Deck List</p>
                {deck.companion && (
                  <div className="mb-3">
                    <p className="text-[10px] uppercase tracking-wide font-bold text-violet-400 mb-0.5">Companion</p>
                    <p className="text-sm text-neutral-100">{deck.companion.name}</p>
                    <p className="text-[11px] text-neutral-500">{[deck.companion.race, deck.companion.klass].filter(Boolean).join(" ")}</p>
                  </div>
                )}
                {grouped.map(g => (
                  <div key={g.type} className="mb-2">
                    <p className="text-[10px] uppercase tracking-wide font-bold mb-1" style={{ color: TYPE_COLORS[g.type] }}>
                      {TYPE_PLURAL[g.type]} ({g.entries.reduce((s, e) => s + e.count, 0)})
                    </p>
                    {g.entries.map(({ card, count }) => (
                      <div key={card.id} className="flex items-center gap-1.5 py-0.5 text-sm">
                        <span className="text-neutral-500 text-xs w-5 text-right shrink-0">×{count}</span>
                        <span className="text-neutral-200 flex-grow">{card.name}</span>
                        <span className="text-neutral-600 text-xs shrink-0">P{card.provisions||0} M{card.mana||0}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            {/* right: cost breakdown */}
            <div className="p-5">
              <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-5 font-bold">Cost Breakdown</p>
              <div className="space-y-8 flex flex-col items-center">
                <CostBarChart data={makeDist("provisions")} color="#f59e0b" label="Provisions" />
                <CostBarChart data={makeDist("mana")} color="#8b5cf6" label="Mana" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- deckbuilder view -------------------------------------------------------
function DeckbuilderView({ cards, decks, authed, username, users, onSaveDeck, onDeleteDeck }) {
  // step: "database" | "companion" | "building"
  const [step, setStep] = useState("database");
  const [companion, setCompanion] = useState(null);
  const [deck, setDeck] = useState([]);
  const [deckId, setDeckId] = useState(null);
  const [deckName, setDeckName] = useState("");
  const [deckDesc, setDeckDesc] = useState("");
  const [deckAuthor, setDeckAuthor] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [exportOpen, setExportOpen] = useState(false);
  const [deckSaving, setDeckSaving] = useState(false);
  const [deckStatus, setDeckStatus] = useState("");
  const [dbSearch, setDbSearch] = useState("");
  const [mobileTab, setMobileTab] = useState("browse");
  const [viewDeck, setViewDeck] = useState(null);
  const [previewCard, setPreviewCard] = useState(null);
  const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 });
  const hoverTimer = useRef(null);
  const mousePos = useRef({ x: 0, y: 0 });

  const DECK_MAX = 40;
  const BROWSE_TYPES = ["Unit", "Event", "Artifact"];
  const DECK_ORDER  = ["Unit", "Ancient Relic", "Event", "Artifact"];
  const TYPE_COLORS = { "Unit": "#8b5cf6", "Ancient Relic": "#f59e0b", "Event": "#10b981", "Artifact": "#3b82f6" };
  const TYPE_PLURAL = { "Unit": "Units", "Ancient Relic": "Ancient Relics", "Event": "Events", "Artifact": "Artifacts" };
  const COMPANION_TYPES = ["Ancient Legend", "Ancient Relic"];

  const companions = cards.filter(c => COMPANION_TYPES.includes(c.type));
  const deckTotal  = deck.reduce((s, d) => s + d.count, 0);

  const cardLimit  = (card) => card.type === "Unit" ? 2 : 3;
  const canAddCard = (card) => {
    if (deckTotal >= DECK_MAX) return false;
    const existing = deck.find(d => d.card.id === card.id);
    return !existing || existing.count < cardLimit(card);
  };
  const DECK_MIN = 30;
  const isLegal = deckTotal >= DECK_MIN && deckTotal <= DECK_MAX && deck.every(d => d.count <= cardLimit(d.card));

  const browseable = cards.filter(c => {
    if (!BROWSE_TYPES.includes(c.type)) return false;
    if (typeFilter !== "All" && c.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return [c.name, c.race, c.klass, ...(c.keywords || []), ...(c.tribes || [])].some(v => v?.toLowerCase().includes(q));
    }
    return true;
  });

  const addCard = (card) => {
    if (!canAddCard(card)) return;
    setDeck(prev => {
      const i = prev.findIndex(d => d.card.id === card.id);
      if (i >= 0) return prev.map((d, j) => j === i ? { ...d, count: d.count + 1 } : d);
      return [...prev, { card, count: 1 }];
    });
  };

  const removeCard = (cardId) => {
    setDeck(prev => {
      const i = prev.findIndex(d => d.card.id === cardId);
      if (i < 0) return prev;
      if (prev[i].count <= 1) return prev.filter((_, j) => j !== i);
      return prev.map((d, j) => j === i ? { ...d, count: d.count - 1 } : d);
    });
  };

  const startNewDeck = () => {
    setDeckId(null); setDeckName(""); setDeckDesc(""); setDeckAuthor(username || "");
    setCompanion(null); setDeck([]); setDeckStatus(""); setStep("companion");
  };

  const openDeck = (d) => {
    setDeckId(d.id); setDeckName(d.name || ""); setDeckDesc(d.description || "");
    setDeckAuthor(d.author || ""); setCompanion(d.companion || null); setDeck(d.cards || []);
    setDeckStatus(""); setMobileTab("browse"); setStep("building");
  };

  const copyDeck = (d) => {
    setDeckId(null); setDeckName(`${d.name || "Untitled"} (Copy)`); setDeckDesc(d.description || "");
    setDeckAuthor(username || ""); setCompanion(d.companion || null); setDeck(d.cards || []);
    setDeckStatus(""); setMobileTab("browse"); setStep("building");
  };

  const backToDatabase = () => { setPreviewCard(null); clearTimeout(hoverTimer.current); setStep("database"); };

  const saveDeck = async () => {
    setDeckSaving(true);
    const id = deckId || uid();
    const result = await onSaveDeck({ id, name: deckName, description: deckDesc, author: deckAuthor, companion, cards: deck });
    if (result?.ok) { setDeckId(id); setDeckStatus("Saved!"); setTimeout(() => setDeckStatus(""), 2000); }
    setDeckSaving(false);
  };

  const grouped = DECK_ORDER.map(type => ({
    type,
    entries: deck.filter(d => d.card.type === type).sort((a, b) => a.card.name.localeCompare(b.card.name)),
  })).filter(g => g.entries.length > 0);

  const pieSlices = DECK_ORDER.map(type => {
    const count = deck.filter(d => d.card.type === type).reduce((s, d) => s + d.count, 0);
    return count ? { label: type, value: count, color: TYPE_COLORS[type] } : null;
  }).filter(Boolean);

  const exportText = () => {
    const lines = [];
    if (deckName)   lines.push(`Deck: ${deckName}`);
    if (deckAuthor) lines.push(`By: ${deckAuthor}`);
    if (deckDesc)   lines.push(`Description: ${deckDesc}`);
    if (deckName || deckAuthor || deckDesc) lines.push("");
    lines.push("Companion:", companion ? (companion.name || "(unnamed)") : "(none selected)", "");
    DECK_ORDER.forEach(type => {
      const entries = deck.filter(d => d.card.type === type);
      if (!entries.length) return;
      lines.push(`${TYPE_PLURAL[type]}:`);
      [...entries].sort((a, b) => a.card.name.localeCompare(b.card.name)).forEach(d => lines.push(`${d.card.name} x${d.count}`));
      lines.push("");
    });
    return lines.join("\n").trimEnd();
  };

  // card hover preview helpers
  const trackMouse = (e) => { mousePos.current = { x: e.clientX, y: e.clientY }; };
  const startPreview = (e, card) => {
    clearTimeout(hoverTimer.current);
    mousePos.current = { x: e.clientX, y: e.clientY };
    hoverTimer.current = setTimeout(() => {
      setPreviewCard(card);
      setPreviewPos({ x: mousePos.current.x, y: mousePos.current.y });
    }, 1000);
  };
  const endPreview = () => { clearTimeout(hoverTimer.current); setPreviewCard(null); };

  // ---- step: database -------------------------------------------------------
  if (step === "database") {
    const filteredDecks = [...decks]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .filter(d => {
        if (!dbSearch.trim()) return true;
        const q = dbSearch.toLowerCase();
        return [d.name, d.author, d.companion?.name, d.description].some(v => v?.toLowerCase().includes(q));
      });
    return (
      <>
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-2xl font-bold text-neutral-100">Deckbuilder</h2>
              <p className="text-sm text-neutral-500">{decks.length} deck{decks.length !== 1 ? "s" : ""} in the database</p>
            </div>
            {authed && (
              <button onClick={startNewDeck} className="rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 text-sm shadow">
                + Create New Deck
              </button>
            )}
          </div>
          {decks.length > 0 && (
            <div className="mb-4">
              <input className={inputCls} value={dbSearch} onChange={e => setDbSearch(e.target.value)} placeholder="Search by deck name, author, or companion…" />
            </div>
          )}
          {filteredDecks.length === 0 ? (
            <div className="border border-dashed border-neutral-800 rounded-xl p-16 text-center text-neutral-500">
              {decks.length === 0
                ? (authed ? "No decks yet. Click \"+ Create New Deck\" to get started." : "No decks yet. Sign in to create a deck.")
                : "No decks match your search."}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredDecks.map(d => {
                const total = (d.cards || []).reduce((s, e) => s + e.count, 0);
                const isOwner = authed && (!d.author || d.author === username);
                return (
                  <div key={d.id} onClick={() => setViewDeck(d)}
                    className="rounded-xl border border-neutral-700 bg-neutral-900 hover:border-amber-500/60 hover:bg-neutral-800/60 p-4 cursor-pointer transition group relative">
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      {isOwner && (
                        <button onClick={ev => { ev.stopPropagation(); openDeck(d); }}
                          className="text-[11px] bg-neutral-700 hover:bg-neutral-600 text-white rounded px-1.5 py-0.5">Edit</button>
                      )}
                      {isOwner && (
                        <button onClick={ev => { ev.stopPropagation(); onDeleteDeck(d.id); }}
                          className="text-[11px] bg-rose-700 hover:bg-rose-600 text-white rounded px-1.5 py-0.5">✕</button>
                      )}
                      {authed && !isOwner && (
                        <button onClick={ev => { ev.stopPropagation(); copyDeck(d); }}
                          className="text-[11px] bg-violet-700 hover:bg-violet-600 text-white rounded px-1.5 py-0.5">Copy</button>
                      )}
                    </div>
                    <div className="font-semibold text-amber-200 text-base truncate pr-16">{d.name || "(untitled)"}</div>
                    {d.author && <div className="text-[11px] text-neutral-500 mt-0.5">by {d.author}</div>}
                    <div className="text-xs text-neutral-400 mt-1.5">
                      Companion: <span className="text-neutral-200">{d.companion?.name || "(none)"}</span>
                    </div>
                    {d.description && <p className="text-[11px] text-neutral-500 mt-1 line-clamp-2">{d.description}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-grow h-1 rounded-full bg-neutral-800 overflow-hidden">
                        <div className="h-full rounded-full bg-amber-600/60" style={{ width: `${Math.min((total / 40) * 100, 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-neutral-500 shrink-0">{total} / 40 cards</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {viewDeck && (
          <DeckViewModal
            deck={viewDeck}
            authed={authed}
            isOwner={authed && (!viewDeck.author || viewDeck.author === username)}
            onSave={async (updated) => { const r = await onSaveDeck(updated); setViewDeck(updated); return r; }}
            onEdit={(d) => { setViewDeck(null); openDeck(d); }}
            onDelete={(id) => { onDeleteDeck(id); setViewDeck(null); }}
            onCopy={(d) => { setViewDeck(null); copyDeck(d); }}
            onClose={() => setViewDeck(null)}
          />
        )}
      </>
    );
  }

  // ---- step: companion picker -----------------------------------------------
  if (step === "companion") {
    return (
      <div>
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setStep("database")} className="text-sm text-neutral-500 hover:text-amber-300 transition">← Back</button>
          <div>
            <h2 className="text-xl font-semibold text-amber-200">{deckName || "New Deck"}</h2>
            <p className="text-sm text-neutral-400">Choose your Companion — an Ancient Legend or Ancient Relic that anchors the deck.</p>
          </div>
        </div>
        {companions.length === 0 ? (
          <div className="border border-dashed border-neutral-800 rounded-xl p-16 text-center text-neutral-500">
            No Ancient Legend or Ancient Relic cards yet. Add some in the card database first.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-w-3xl">
            {companions.map(c => (
              <button key={c.id} onClick={() => { setCompanion(c); setMobileTab("browse"); setStep("building"); }}
                className="rounded-xl border border-neutral-700 bg-neutral-900 hover:border-amber-500 hover:bg-neutral-800 p-4 text-left transition group">
                <span className="inline-block text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded mb-1.5"
                  style={{ background: c.type === "Ancient Legend" ? "#8b5cf622" : "#f59e0b22", color: c.type === "Ancient Legend" ? "#a78bfa" : "#f59e0b" }}>{c.type}</span>
                <div className="font-semibold text-amber-200 text-sm truncate group-hover:text-amber-100">{c.name || "(unnamed)"}</div>
                <div className="text-xs text-neutral-400 mt-0.5">{[c.race, c.klass].filter(Boolean).join(" ")}{c.rarity ? ` · ${c.rarity}` : ""}</div>
                {c.tribes?.length ? <div className="text-xs text-violet-400 mt-1">{c.tribes.join(", ")}</div> : null}
                {c.passive ? <p className="text-[10px] text-neutral-500 mt-1.5 line-clamp-2">{c.passive}</p> : null}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- step: building (two-panel layout) ------------------------------------
  return (
    <>
      <div className="flex flex-col md:flex-row md:-m-6 md:overflow-hidden md:h-screen">

        {/* Mobile tab switcher */}
        <div className="flex md:hidden border-b border-neutral-800 bg-neutral-950 shrink-0">
          <button
            onClick={() => setMobileTab("browse")}
            className={"flex-1 py-2.5 text-sm font-medium border-b-2 transition " + (mobileTab === "browse" ? "text-amber-200 border-amber-500" : "text-neutral-500 border-transparent hover:text-neutral-300")}>
            Browse Cards
          </button>
          <button
            onClick={() => setMobileTab("deck")}
            className={"flex-1 py-2.5 text-sm font-medium border-b-2 transition " + (mobileTab === "deck" ? "text-amber-200 border-amber-500" : "text-neutral-500 border-transparent hover:text-neutral-300")}>
            Deck ({deckTotal})
          </button>
        </div>

        {/* LEFT: card browser */}
        <div className={"flex-col flex-grow border-r border-neutral-800 overflow-hidden " + (mobileTab === "deck" ? "hidden md:flex" : "flex")}>
          {/* filter bar */}
          <div className="flex gap-2 items-center p-3 border-b border-neutral-800 bg-neutral-950/60 shrink-0">
            <button onClick={backToDatabase} className="shrink-0 text-xs text-neutral-500 hover:text-amber-300 transition pr-1">← Decks</button>
            <input
              className="flex-grow min-w-0 rounded-md bg-neutral-800 border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, race, class, keyword…"
            />
            <select className="w-24 shrink-0 rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-amber-500/60" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="All">All Types</option>
              {BROWSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {(search || typeFilter !== "All") && (
              <button onClick={() => { setSearch(""); setTypeFilter("All"); }}
                className="shrink-0 px-2.5 py-1.5 rounded-md bg-neutral-800 border border-neutral-700 text-xs text-neutral-400 hover:text-white transition">Clear</button>
            )}
          </div>

          {/* card rows */}
          <div className="flex-grow overflow-y-auto">
            {browseable.length === 0 ? (
              <p className="text-neutral-600 text-sm p-8 text-center">No cards match your filters.</p>
            ) : (
              <div className="divide-y divide-neutral-800/50">
                {browseable.map(c => {
                  const inDeck  = deck.find(d => d.card.id === c.id);
                  const limit   = cardLimit(c);
                  const canAdd  = canAddCard(c);
                  const atLimit = inDeck && inDeck.count >= limit;
                  return (
                    <div key={c.id}
                      className="flex items-center gap-2 px-3 py-2.5 hover:bg-neutral-800/40 transition group cursor-pointer"
                      onMouseEnter={e => startPreview(e, c)}
                      onMouseMove={trackMouse}
                      onMouseLeave={endPreview}
                      onDoubleClick={() => addCard(c)}>
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                        style={{ background: TYPE_COLORS[c.type] + "22", color: TYPE_COLORS[c.type] }}>{c.type}</span>
                      <span className="flex-grow text-sm text-neutral-100 font-medium truncate">{c.name || "(unnamed)"}</span>
                      {(c.race || c.klass) && (
                        <span className="shrink-0 text-[11px] text-neutral-500 hidden md:block truncate max-w-[130px]">{[c.race, c.klass].filter(Boolean).join(" ")}</span>
                      )}
                      <span className="shrink-0 text-[11px] text-amber-600/80">P{c.provisions || 0} M{c.mana || 0}</span>
                      {inDeck
                        ? <span className={"shrink-0 text-xs font-bold w-8 text-center " + (atLimit ? "text-rose-400" : "text-violet-300")}>×{inDeck.count}/{limit}</span>
                        : <span className="w-8 shrink-0 text-[10px] text-neutral-700 text-center">/{limit}</span>}
                      <button onClick={() => addCard(c)} disabled={!canAdd} title={atLimit ? `Max ${limit} copies` : "Add to deck"}
                        className={"shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-base font-bold transition " + (canAdd ? "text-emerald-400 hover:bg-emerald-900/30 hover:text-emerald-300" : "text-neutral-700 cursor-not-allowed")}>+</button>
                      {inDeck && (
                        <button onClick={() => removeCard(c.id)} title="Remove one"
                          className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-base font-bold text-rose-500 hover:bg-rose-900/30 hover:text-rose-400 transition">−</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: deck panel */}
        <div className={"w-full md:w-72 md:shrink-0 flex-col bg-neutral-900 overflow-hidden " + (mobileTab === "browse" ? "hidden md:flex" : "flex")}>

          {/* deck name + author + companion */}
          <div className="p-3 border-b border-neutral-800 shrink-0" style={{ background: "rgba(139,92,246,0.08)" }}>
            <input
              className="bg-transparent text-amber-200 font-semibold text-sm placeholder-neutral-600 focus:outline-none w-full truncate mb-1"
              value={deckName}
              onChange={e => setDeckName(e.target.value)}
              placeholder="Deck Name…"
            />
            {users.length > 0 ? (
              <select className={inputCls + " text-xs py-0.5 mb-2"} value={deckAuthor} onChange={e => setDeckAuthor(e.target.value)}>
                <option value="">Author…</option>
                {users.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            ) : (
              <input className={inputCls + " text-xs py-0.5 mb-2"} value={deckAuthor} onChange={e => setDeckAuthor(e.target.value)} placeholder="Author…" />
            )}
            <div className="flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-widest font-bold text-violet-400">Companion</span>
              <button onClick={() => setStep("companion")} className="text-[10px] text-neutral-500 hover:text-amber-300 transition">↩ Change</button>
            </div>
            <div className="font-medium text-neutral-100 text-sm mt-0.5 truncate">{companion.name || "(unnamed)"}</div>
            <div className="text-[11px] text-neutral-400">
              {[companion.race, companion.klass].filter(Boolean).join(" ")}{companion.rarity ? ` · ${companion.rarity}` : ""}
            </div>
            {companion.tribes?.length ? <div className="text-[10px] text-violet-400 mt-0.5">{companion.tribes.join(", ")}</div> : null}
          </div>

          {/* card count + legality */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800 shrink-0">
            <span className="text-sm font-semibold text-neutral-200">{deckTotal}</span>
            <span className="text-sm text-neutral-500">/ {DECK_MAX}</span>
            <div className="flex-grow h-1.5 rounded-full bg-neutral-800 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-200"
                style={{ width: `${Math.min((deckTotal / DECK_MAX) * 100, 100)}%`, background: deckTotal >= DECK_MAX ? "#ef4444" : "#f59e0b" }} />
            </div>
            <span className={"shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded " + (isLegal ? "bg-emerald-900/40 text-emerald-400" : "bg-rose-900/40 text-rose-400")}>
              {isLegal ? "Legal" : "Illegal"}
            </span>
          </div>

          {/* deck list */}
          <div className="flex-grow overflow-y-auto p-2">
            {grouped.length === 0 ? (
              <p className="text-neutral-600 text-xs text-center py-8">Click + on any card to add it.</p>
            ) : grouped.map(g => (
              <div key={g.type} className="mb-3">
                <div className="flex items-center gap-1.5 px-1 mb-1">
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: TYPE_COLORS[g.type] }} />
                  <span className="text-[10px] uppercase tracking-wide font-bold" style={{ color: TYPE_COLORS[g.type] }}>{TYPE_PLURAL[g.type]}</span>
                  <span className="text-[10px] text-neutral-600">({g.entries.reduce((s, e) => s + e.count, 0)})</span>
                </div>
                {g.entries.map(({ card, count }) => {
                  const limit = cardLimit(card);
                  const over  = count > limit;
                  return (
                    <div key={card.id} className="flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-neutral-800/60 group">
                      <span className={"shrink-0 text-[11px] font-bold w-5 text-right " + (over ? "text-rose-400" : "text-neutral-500")}>×{count}</span>
                      <span className={"flex-grow text-xs truncate " + (over ? "text-rose-300" : "text-neutral-200")}>{card.name}</span>
                      {over && <span className="shrink-0 text-[9px] text-rose-500">over limit</span>}
                      <button onClick={() => addCard(card)} disabled={!canAddCard(card)}
                        className={"shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 text-xs rounded flex items-center justify-center font-bold transition " + (canAddCard(card) ? "text-emerald-400 hover:bg-emerald-900/30" : "text-neutral-700 cursor-not-allowed")}>+</button>
                      <button onClick={() => removeCard(card.id)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 text-xs rounded flex items-center justify-center font-bold text-rose-500 hover:bg-rose-900/30 transition">−</button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* pie chart */}
          {pieSlices.length > 0 && (
            <div className="border-t border-neutral-800 p-3 shrink-0">
              <p className="text-[9px] uppercase tracking-widest text-neutral-500 mb-2 font-bold">Deck Composition</p>
              <div className="flex items-center gap-3">
                <div className="shrink-0">
                  <PieChart slices={pieSlices} sz={100} />
                </div>
                <div className="space-y-1 min-w-0">
                  {pieSlices.map(s => (
                    <div key={s.label} className="flex items-center gap-1.5 text-[10px]">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: s.color }} />
                      <span className="text-neutral-400 truncate">{s.label}</span>
                      <span className="text-neutral-600 ml-auto shrink-0 pl-2">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* export + save */}
          <div className="p-3 border-t border-neutral-800 shrink-0 space-y-2">
            {authed && (
              <button onClick={saveDeck} disabled={deckSaving}
                className="w-full rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-sm font-semibold py-2 transition flex items-center justify-center gap-2">
                {deckSaving ? "Saving…" : deckStatus ? deckStatus : (deckId ? "Save Changes" : "Save Deck")}
              </button>
            )}
            <button onClick={() => setExportOpen(true)}
              className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 text-black text-sm font-semibold py-2 transition">
              Export Deck List
            </button>
          </div>
        </div>
      </div>

      {/* card hover preview */}
      {previewCard && (
        <div className="fixed z-[100] pointer-events-none drop-shadow-2xl"
          style={{
            left: Math.max(8, Math.min(previewPos.x + 16, (typeof window !== "undefined" ? window.innerWidth : 1200) - 285)),
            top:  Math.max(8, Math.min(previewPos.y - 120, (typeof window !== "undefined" ? window.innerHeight : 800) - 440)),
          }}>
          <CardTile card={previewCard} canEdit={false} />
        </div>
      )}

      {/* export modal */}
      {exportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setExportOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800" style={{ background: "rgba(139,92,246,0.1)" }}>
              <h2 className="text-lg font-semibold text-amber-200">{deckName || "Deck List"}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => navigator.clipboard?.writeText(exportText())}
                  className="text-xs text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded px-2 py-1 transition">
                  Copy
                </button>
                <button onClick={() => setExportOpen(false)} className="text-neutral-400 hover:text-white text-xl leading-none ml-1">✕</button>
              </div>
            </div>
            <pre className="p-5 text-sm text-neutral-200 whitespace-pre-wrap overflow-y-auto"
              style={{ maxHeight: "60vh", fontFamily: "ui-monospace, 'Cascadia Code', monospace" }}>
              {exportText()}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}

// ---- statistics view -------------------------------------------------------
function StatisticsView({ cards, keywords, races, users }) {
  const mkConfig = (groupBy) => ({ groupBy, filterTypes: [], filterRace: "", filterClass: "", filterRarity: "", filterPosition: "", filterAuthor: "", filterKeyword: "", filtersOpen: false });
  const [configs, setConfigs] = useState([mkConfig("rarity"), mkConfig("race")]);
  const patch = (i, p) => setConfigs((prev) => prev.map((c, j) => j === i ? { ...c, ...p } : c));

  const allRaces   = [...new Set(cards.map((c) => c.race).filter(Boolean))].sort();
  const allClasses = [...new Set(cards.map((c) => c.klass).filter(Boolean))].sort();
  const allAuthors = [...new Set(cards.map((c) => c.author).filter(Boolean))].sort();
  const allKws     = [...new Set(cards.flatMap((c) => c.keywords || []))].sort();
  const allTribes  = [...new Set(cards.flatMap((c) => c.tribes || []))].sort();

  function slicesFor(cfg) {
    let rows = cards;
    if (cfg.filterTypes.length)    rows = rows.filter((c) => cfg.filterTypes.includes(c.type));
    if (cfg.filterRace)            rows = rows.filter((c) => c.race === cfg.filterRace);
    if (cfg.filterClass)           rows = rows.filter((c) => c.klass === cfg.filterClass);
    if (cfg.filterRarity)          rows = rows.filter((c) => c.rarity === cfg.filterRarity);
    if (cfg.filterPosition)        rows = rows.filter((c) => c.position === cfg.filterPosition);
    if (cfg.filterAuthor)          rows = rows.filter((c) => c.author === cfg.filterAuthor);
    if (cfg.filterKeyword)         rows = rows.filter((c) => (c.keywords || []).includes(cfg.filterKeyword));
    const counts = {};
    for (const c of rows) {
      const keys = (() => {
        switch (cfg.groupBy) {
          case "type":     return [c.type || "Unknown"];
          case "race":     return [c.race || "No Race"];
          case "klass":    return [c.klass || "No Class"];
          case "rarity":   return [c.rarity || "Unknown"];
          case "position": return [c.position || "None"];
          case "author":   return [c.author || "Unknown"];
          case "keyword":  return c.keywords?.length ? c.keywords : ["No Keywords"];
          case "tribe":    return c.tribes?.length ? c.tribes : ["No Tribe"];
          default:         return ["Unknown"];
        }
      })();
      keys.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: CHART_COLORS[i % CHART_COLORS.length] }));
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-amber-200 mb-1">Statistics</h2>
        <p className="text-sm text-neutral-400">{cards.length} total cards · configure each chart independently · hover slices for details</p>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {configs.map((cfg, idx) => {
          const slices = slicesFor(cfg);
          const total = slices.reduce((s, d) => s + d.value, 0);
          const activeFilters = [cfg.filterTypes.length > 0, !!cfg.filterRace, !!cfg.filterClass, !!cfg.filterRarity, !!cfg.filterPosition, !!cfg.filterAuthor, !!cfg.filterKeyword].filter(Boolean).length;

          return (
            <div key={idx} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
              {/* group-by + filter toggle */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wide text-neutral-500">Group by</span>
                <select className={inputCls + " flex-grow text-sm"} value={cfg.groupBy} onChange={(e) => patch(idx, { groupBy: e.target.value })}>
                  {GROUP_BY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button onClick={() => patch(idx, { filtersOpen: !cfg.filtersOpen })}
                  className={"shrink-0 px-3 py-1.5 rounded-md border text-xs font-medium transition " + (cfg.filtersOpen || activeFilters ? "bg-amber-600/20 border-amber-500 text-amber-200" : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-500")}>
                  Filters{activeFilters ? ` (${activeFilters})` : ""}
                </button>
              </div>

              {/* filter panel */}
              {cfg.filtersOpen && (
                <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 space-y-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">Card Types</p>
                    <div className="flex flex-wrap gap-1.5">
                      {CARD_TYPES.map((t) => { const on = cfg.filterTypes.includes(t); return (
                        <button key={t} onClick={() => patch(idx, { filterTypes: on ? cfg.filterTypes.filter((x) => x !== t) : [...cfg.filterTypes, t] })}
                          className={"text-[11px] rounded px-2 py-1 border transition " + (on ? "bg-violet-500/20 border-violet-400 text-violet-200" : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-500")}>
                          {t}
                        </button>
                      ); })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["Race", "filterRace", allRaces],
                      ["Class", "filterClass", allClasses],
                      ["Rarity", "filterRarity", RARITIES],
                      ["Position", "filterPosition", POSITIONS],
                      ["Author", "filterAuthor", allAuthors],
                      ["Has Keyword", "filterKeyword", allKws],
                    ].map(([label, key, opts]) => (
                      <div key={key}>
                        <label className="block text-[10px] uppercase tracking-wide text-neutral-500 mb-1">{label}</label>
                        <select className={inputCls + " text-xs"} value={cfg[key]} onChange={(e) => patch(idx, { [key]: e.target.value })}>
                          <option value="">All</option>
                          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  {activeFilters > 0 && (
                    <button onClick={() => patch(idx, { filterTypes: [], filterRace: "", filterClass: "", filterRarity: "", filterPosition: "", filterAuthor: "", filterKeyword: "" })}
                      className="text-xs text-neutral-500 hover:text-white">Clear all filters</button>
                  )}
                </div>
              )}

              {/* chart + legend */}
              <div className="flex gap-4 items-start">
                <div className="shrink-0">
                  <PieChart slices={slices} />
                </div>
                <div className="flex-grow min-w-0 space-y-1 overflow-y-auto" style={{ maxHeight: 210 }}>
                  {slices.length === 0
                    ? <p className="text-neutral-600 text-xs pt-2">No cards match.</p>
                    : slices.map((s) => (
                      <div key={s.label} className="flex items-center gap-2 text-xs group">
                        <span className="shrink-0 w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                        <span className="flex-grow truncate text-neutral-300 group-hover:text-white transition">{s.label}</span>
                        <span className="shrink-0 font-semibold text-neutral-200 tabular-nums">{s.value}</span>
                        <span className="shrink-0 text-neutral-600 tabular-nums w-9 text-right">{total ? ((s.value / total) * 100).toFixed(0) : 0}%</span>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- main page ------------------------------------------------------------
export default function Page() {
  const [cards, setCards] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [users, setUsers] = useState([]);
  const [races, setRaces] = useState([]);
  const [presence, setPresence] = useState({});
  const [cardOrder, setCardOrder] = useState({});
  const [changelog, setChangelog] = useState([]);
  const [decks, setDecks] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [view, setView] = useState("Unit");
  const [rulebookOpen, setRulebookOpen] = useState(false);
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
      setUsers(d.users || []);
      setRaces(d.races || []);
      setPresence(d.presence || {});
      setCardOrder(d.cardOrder || {});
      setChangelog(d.changelog || []);
      setDecks(d.decks || []);
    } catch (e) { /* offline; keep what we have */ }
  };

  const saveDeckRemote = async (deck) => {
    const r = await fetch("/api/decks", { method: "POST", headers: writeHeaders(), body: JSON.stringify(deck) });
    const d = await r.json();
    if (d.ok) setDecks(prev => { const i = prev.findIndex(x => x.id === d.deck.id); return i >= 0 ? prev.map((x, j) => j === i ? d.deck : x) : [...prev, d.deck]; });
    return d;
  };

  const deleteDeckRemote = async (id) => {
    await fetch(`/api/decks?id=${id}`, { method: "DELETE", headers: writeHeaders() });
    setDecks(prev => prev.filter(d => d.id !== id));
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
  const signOut = () => {
    fetch("/api/presence", { method: "DELETE", headers: { "Content-Type": "application/json", "x-username": username, "x-token": token } }).catch(() => {});
    setAuthed(false); localStorage.removeItem("pd_user"); localStorage.removeItem("pd_token");
  };

  // heartbeat: ping presence every 30s while signed in
  useEffect(() => {
    if (!authed) return;
    const ping = () => fetch("/api/presence", { method: "POST", headers: { "Content-Type": "application/json", "x-username": username, "x-token": token } }).catch(() => {});
    ping();
    const iv = setInterval(ping, 30000);
    return () => clearInterval(iv);
  }, [authed, username, token]);

  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterRace, setFilterRace] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterKeyword, setFilterKeyword] = useState("");
  const [filterTribe, setFilterTribe] = useState("");

  // reset search/filters when switching tabs
  const switchView = (v) => { setView(v); setSearch(""); setFilterRace(""); setFilterClass(""); setFilterKeyword(""); setFilterTribe(""); setFilterOpen(false); setSidebarOpen(false); };

  const isTypeView = CARD_TYPES.includes(view);

  const typeCards = (() => {
    const raw = cards.filter((c) => c.type === view);
    const order = cardOrder[view];
    if (!order || !order.length) return raw;
    const pos = new Map(order.map((id, i) => [id, i]));
    return [...raw].sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : Infinity) - (pos.has(b.id) ? pos.get(b.id) : Infinity));
  })();
  const visible = typeCards.filter((c) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const inName = (c.name || "").toLowerCase().includes(q);
      const inRace = (c.race || "").toLowerCase().includes(q);
      const inClass = (c.klass || "").toLowerCase().includes(q);
      const inKeywords = (c.keywords || []).some((k) => k.toLowerCase().includes(q));
      const inTribes = (c.tribes || []).some((t) => t.toLowerCase().includes(q));
      if (!inName && !inRace && !inClass && !inKeywords && !inTribes) return false;
    }
    if (filterRace && (c.race || "") !== filterRace) return false;
    if (filterClass && (c.klass || "") !== filterClass) return false;
    if (filterKeyword && !(c.keywords || []).includes(filterKeyword)) return false;
    if (filterTribe && !(c.tribes || []).includes(filterTribe)) return false;
    return true;
  });

  const counts = CARD_TYPES.reduce((a, t) => { a[t] = cards.filter((c) => c.type === t).length; return a; }, {});
  const activeFilters = [filterRace, filterClass, filterKeyword, filterTribe].filter(Boolean).length;

  // dropdown options derived from cards of current type
  const raceOptions = [...new Set(typeCards.map((c) => c.race).filter(Boolean))].sort();
  const classOptions = [...new Set(typeCards.map((c) => c.klass).filter(Boolean))].sort();
  const keywordOptions = [...new Set(typeCards.flatMap((c) => c.keywords || []))].sort();
  const tribeOptions = [...new Set(typeCards.flatMap((c) => c.tribes || []))].sort();

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
    setKeywords(next);
    const r = await fetch("/api/keywords", { method: "PUT", headers: writeHeaders(), body: JSON.stringify({ keywords: next }) });
    if (!r.ok) { alert("Couldn't save keywords (are you signed in?)"); fetchData(); }
  };
  const setRacesRemote = async (next) => {
    setRaces(next);
    const r = await fetch("/api/races", { method: "PUT", headers: writeHeaders(), body: JSON.stringify({ races: next }) });
    if (!r.ok) { alert("Couldn't save races (are you signed in?)"); fetchData(); }
  };
  const addKeyword = (n) => { if (!keywords.some((k) => k.name.toLowerCase() === n.toLowerCase())) setKeywordsRemote([...keywords, { name: n, desc: "" }]); };

  const saveOrder = async (type, ids) => {
    setCardOrder((prev) => ({ ...prev, [type]: ids }));
    await fetch("/api/order", { method: "PUT", headers: writeHeaders(), body: JSON.stringify({ type, ids }) });
  };

  const canDrag = authed && !search && !filterRace && !filterClass && !filterKeyword && !filterTribe;

  const handleDragStart = (e, id) => { if (!canDrag) return; setDragId(id); e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver = (e, id) => { e.preventDefault(); if (canDrag) setDragOverId(id); };
  const handleDrop = (e, targetId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const ids = typeCards.map((c) => c.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    saveOrder(view, ids);
    setDragId(null); setDragOverId(null);
  };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };

  const [exportPickerOpen, setExportPickerOpen] = useState(false);

  function formatCardText(card) {
    const lines = [];
    const divider = "─".repeat(48);
    lines.push(divider);
    lines.push(`  ${card.name || "(Unnamed)"}  [${card.type}]`);
    lines.push(divider);

    const meta = [card.rarity, card.race && card.klass ? `${card.race} ${card.klass}` : (card.race || card.klass || ""), card.position].filter(Boolean).join("  ·  ");
    if (meta) lines.push(`  ${meta}`);

    const cost = [`Provisions: ${card.provisions || 0}`, `Mana: ${card.mana || 0}`].join("   ");
    lines.push(`  ${cost}`);

    if (card.attack || card.health) lines.push(`  ATK ${card.attack || 0}  /  HP ${card.health || 0}`);
    if (card.keywords?.length) lines.push(`  Keywords: ${card.keywords.join(", ")}`);
    if (card.tribes?.length) lines.push(`  Tribe Compatibility: ${card.tribes.join(", ")}`);

    lines.push("");

    if (card.strike) lines.push(`  Strike: ${card.strike}`);

    (card.abilities || []).forEach((ab) => {
      if (!ab.text) return;
      const cost = [ab.prov ? `${ab.prov}P` : "", ab.mana ? `${ab.mana}M` : ""].filter(Boolean).join(" ");
      lines.push(`  • ${cost ? `(${cost}) ` : ""}${ab.text}`);
    });

    if (card.passive) lines.push(`  Passive: ${card.passive}`);
    if (card.text) lines.push(`  ${card.text}`);

    if (card.flavor) { lines.push(""); lines.push(`  "${card.flavor}"`); }
    if (card.author) { lines.push(""); lines.push(`  — ${card.author}`); }

    lines.push("");
    return lines.join("\n");
  }

  const doExport = (type) => {
    const subset = type === "All" ? cards : cards.filter((c) => c.type === type);
    const order = cardOrder[type];
    const ordered = order?.length
      ? [...subset].sort((a, b) => { const p = new Map(order.map((id, i) => [id, i])); return (p.get(a.id) ?? Infinity) - (p.get(b.id) ?? Infinity); })
      : subset;

    const header = [
      `PROJECT DD — ${type === "All" ? "Complete Card Database" : `${type} Cards`}`,
      `Exported: ${new Date().toLocaleString()}`,
      `${ordered.length} card${ordered.length !== 1 ? "s" : ""}`,
      "═".repeat(48),
      "",
    ].join("\n");

    const text = header + ordered.map(formatCardText).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `project-dd-${type.toLowerCase().replace(/\s+/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setExportPickerOpen(false);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex">

      {/* ── Mobile header bar ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center gap-3 px-4 bg-neutral-950 border-b border-neutral-800 shrink-0">
        <button onClick={() => setSidebarOpen(o => !o)} className="text-neutral-400 hover:text-white p-1 -ml-1">
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
        <span className="font-bold text-amber-300">PROJECT DD</span>
        <span className="text-neutral-500 text-sm truncate">· {view}</span>
      </div>

      {/* ── Sidebar overlay (mobile) ── */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={"fixed md:static inset-y-0 left-0 z-50 w-60 shrink-0 border-r border-neutral-800 bg-neutral-950 md:bg-neutral-900/60 p-4 flex flex-col gap-1 overflow-y-auto transition-transform duration-200 " + (sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0")}>
        <div className="mb-2 flex items-center justify-between">
          <div><h1 className="text-xl font-bold text-amber-300 leading-tight">PROJECT DD</h1><p className="text-xs text-neutral-500 hidden md:block">Card Builder · shared</p></div>
          <button className="md:hidden text-neutral-500 hover:text-white p-1" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

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
              <input className={inputCls + " text-xs py-1"} type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Password" />
              <button onClick={signIn} className="w-full rounded bg-amber-600 hover:bg-amber-500 text-black text-xs font-semibold py-1">Sign in to edit</button>
              {signError && <p className="text-rose-400 text-[10px]">{signError}</p>}
            </div>
          )}
        </div>

        <button onClick={() => switchView("Deckbuilder")} className={"rounded-md px-3 py-2 text-sm text-left transition font-semibold " + (view === "Deckbuilder" ? "bg-violet-800/40 text-amber-200 border border-violet-600/50" : "hover:bg-neutral-800 text-neutral-300")}>
          Deckbuilder
        </button>

        <p className="text-[10px] uppercase tracking-wide text-neutral-600 mt-2 mb-1">Card types</p>
        {CARD_TYPES.map((t) => (
          <button key={t} onClick={() => switchView(t)} className={"flex items-center justify-between rounded-md px-3 py-2 text-sm text-left transition " + (view === t ? "bg-violet-800/40 text-amber-200 border border-violet-600/50" : "hover:bg-neutral-800 text-neutral-300")}>
            <span>{t}</span><span className="text-[11px] text-neutral-500">{counts[t]}</span>
          </button>
        ))}
        <button onClick={() => switchView("Statistics")} className={"flex items-center justify-between rounded-md px-3 py-2 text-sm text-left transition " + (view === "Statistics" ? "bg-violet-800/40 text-amber-200 border border-violet-600/50" : "hover:bg-neutral-800 text-neutral-300")}>Statistics</button>
        <p className="text-[10px] uppercase tracking-wide text-neutral-600 mt-3 mb-1">Reference & settings</p>
        {["Keywords", "Lore", "Admin", "Change Log"].map((t) => (
          <button key={t} onClick={() => switchView(t)} className={"rounded-md px-3 py-2 text-sm text-left transition " + (view === t ? "bg-violet-800/40 text-amber-200 border border-violet-600/50" : "hover:bg-neutral-800 text-neutral-300")}>{t}</button>
        ))}
        <button onClick={() => { setRulebookOpen(true); setSidebarOpen(false); }} className="rounded-md px-3 py-2 text-sm text-left transition hover:bg-neutral-800 text-neutral-300">Draft Rulebook</button>

        <div className="mt-auto pt-4 space-y-2">
          <button onClick={() => { setExportPickerOpen(true); setSidebarOpen(false); }} className="w-full rounded-md bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 px-3 py-2 text-sm">⬇ Export Cards</button>
          <p className="text-[10px] text-neutral-600 text-center">{status || "Shared store · auto-synced"}</p>
        </div>
      </aside>

      <main className="flex-grow overflow-x-hidden pt-14 md:pt-6 pb-4 md:pb-6 px-4 md:px-6">
        {backendError && (
          <div className="mb-5 rounded-lg border border-amber-700/50 bg-amber-900/20 text-amber-200 px-4 py-3 text-sm">
            Backend isn't connected yet. Finish the storage setup (create the Upstash Redis store in Vercel and redeploy), then refresh.
          </div>
        )}
        {isTypeView ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div><h2 className="text-2xl font-bold text-neutral-100">{view}</h2><p className="text-sm text-neutral-500">{visible.length}{visible.length !== typeCards.length ? ` of ${typeCards.length}` : ""} card{visible.length === 1 ? "" : "s"}{!authed && " · read-only (sign in to edit)"}</p></div>
              {authed && <button onClick={startNew} className="rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 text-sm shadow">+ New {view}</button>}
            </div>

            {/* search + filter bar */}
            <div className="mb-4 space-y-2">
              <div className="flex gap-2">
                <input
                  className={inputCls + " flex-grow"}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, race, class, keyword, or tribe…"
                />
                <button
                  onClick={() => setFilterOpen((o) => !o)}
                  className={"shrink-0 px-3 py-1.5 rounded-md border text-sm font-medium transition " + (filterOpen || activeFilters > 0 ? "bg-amber-600/20 border-amber-500 text-amber-200" : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-500")}
                >
                  Filter{activeFilters > 0 ? ` (${activeFilters})` : ""}
                </button>
                {(search || activeFilters > 0) && (
                  <button onClick={() => { setSearch(""); setFilterRace(""); setFilterClass(""); setFilterKeyword(""); setFilterTribe(""); }} className="shrink-0 px-3 py-1.5 rounded-md bg-neutral-800 border border-neutral-700 text-sm text-neutral-400 hover:text-white">Clear</button>
                )}
              </div>
              {filterOpen && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-lg border border-neutral-800 bg-neutral-900">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Race / Tribe</label>
                    <select className={inputCls + " text-sm"} value={filterRace} onChange={(e) => setFilterRace(e.target.value)}>
                      <option value="">All</option>
                      {raceOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Class</label>
                    <select className={inputCls + " text-sm"} value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
                      <option value="">All</option>
                      {classOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Keyword</label>
                    <select className={inputCls + " text-sm"} value={filterKeyword} onChange={(e) => setFilterKeyword(e.target.value)}>
                      <option value="">All</option>
                      {keywordOptions.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Companion Tribe</label>
                    <select className={inputCls + " text-sm"} value={filterTribe} onChange={(e) => setFilterTribe(e.target.value)}>
                      <option value="">All</option>
                      {tribeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {visible.length === 0 ? (
              <div className="border border-dashed border-neutral-800 rounded-xl p-12 text-center text-neutral-500">
                {typeCards.length === 0 ? <>No {view} cards yet.{authed && <> Click <span className="text-amber-400 font-semibold">+ New {view}</span>.</>}</> : "No cards match your search."}
              </div>
            ) : (
              <>
                {canDrag && <p className="text-[10px] text-neutral-600 mb-2">Drag cards to reorder · changes visible to all on refresh</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {visible.map((c) => (
                    <div
                      key={c.id}
                      draggable={canDrag}
                      onDragStart={(e) => handleDragStart(e, c.id)}
                      onDragOver={(e) => handleDragOver(e, c.id)}
                      onDrop={(e) => handleDrop(e, c.id)}
                      onDragEnd={handleDragEnd}
                      className={"transition-all duration-150 " + (canDrag ? "cursor-grab active:cursor-grabbing" : "") + (dragOverId === c.id && dragId !== c.id ? " ring-2 ring-amber-400 ring-offset-2 ring-offset-neutral-950 rounded-xl scale-[1.02]" : "") + (dragId === c.id ? " opacity-40" : "")}
                    >
                      <CardTile card={c} canEdit={authed} onEdit={() => editCard(c)} onDelete={() => deleteCard(c.id)} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ) : view === "Deckbuilder" ? (
          <DeckbuilderView cards={cards} decks={decks} authed={authed} username={username} users={users} onSaveDeck={saveDeckRemote} onDeleteDeck={deleteDeckRemote} />
        ) : view === "Keywords" ? (
          <KeywordsView keywords={keywords} canEdit={authed} onSet={setKeywordsRemote} />
        ) : view === "Lore" ? (
          <LoreView races={races} onSetRaces={setRacesRemote} canEdit={authed} />
        ) : view === "Change Log" ? (
          <ChangeLogView changelog={changelog} />
        ) : view === "Statistics" ? (
          <StatisticsView cards={cards} keywords={keywords} races={races} users={users} />
        ) : (
          <AdminView />
        )}
      </main>

      {draft && <Editor draft={draft} setDraft={setDraft} keywords={keywords} onAddKeyword={addKeyword} onSave={saveDraft} onCancel={() => setDraft(null)} saving={saving} users={users} races={races} />}
      {rulebookOpen && <RulebookModal onClose={() => setRulebookOpen(false)} />}
      {exportPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setExportPickerOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-amber-200">Export Cards</h2>
              <button onClick={() => setExportPickerOpen(false)} className="text-neutral-400 hover:text-white text-xl leading-none">✕</button>
            </div>
            <p className="text-sm text-neutral-400">Choose which card database to export as a formatted text file.</p>
            <div className="space-y-2">
              {["All", ...CARD_TYPES].map((t) => {
                const count = t === "All" ? cards.length : cards.filter((c) => c.type === t).length;
                return (
                  <button key={t} onClick={() => doExport(t)}
                    className="w-full flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 hover:border-amber-500/50 px-4 py-2.5 text-sm text-left transition">
                    <span className="font-medium text-neutral-100">{t === "All" ? "All Card Types" : t}</span>
                    <span className="text-neutral-500 text-xs">{count} card{count !== 1 ? "s" : ""}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {view !== "Deckbuilder" && ((!presence.michael || Date.now() - presence.michael >= 90000) || (presence.hunter && Date.now() - presence.hunter < 90000)) && (
        <div className="fixed bottom-4 right-4 z-40 pointer-events-none select-none flex items-center gap-3" style={{ fontFamily: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif", fontSize: "1.1rem", letterSpacing: "0.05em" }}>
          {(!presence.michael || Date.now() - presence.michael >= 90000) && (
            <span style={{ color: "#f97316", textShadow: "0 0 12px #ea580c88" }}>MICHAEL IS OFFLINE</span>
          )}
          {presence.hunter && Date.now() - presence.hunter < 90000 && (
            <span style={{ color: "#c4b5fd", textShadow: "0 0 12px #7c3aed88" }}>HUNTER IS ONLINE</span>
          )}
        </div>
      )}
    </div>
  );
}
