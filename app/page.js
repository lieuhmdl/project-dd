"use client";

import { useState, useEffect, useRef } from "react";

/* ============================================================================
   PROJECT DD — Card Builder
   Single-file Next.js (App Router) page. Drop this in as app/page.js.
   - Auto-saves to your browser (localStorage)
   - Import / Export JSON (exact round-trip)
   - All card types, race->class dependent dropdowns, expandable keywords,
     multi-keyword + multi-ability cards, card-shaped rendering. Dark mode.
   No external packages required.
============================================================================ */

// ---- Lore framework (D&D 3.5 PHB) ----------------------------------------
const RACE_CLASSES = {
  Human: ["Paladin", "Cleric", "Ranger", "Monk", "Druid"],
  Dwarf: ["Fighter", "Cleric", "Monk"],
  Elf: ["Wizard", "Ranger", "Cleric", "Druid"],
  Gnome: ["Bard", "Cleric", "Druid"],
  "Half-elf": ["Sorcerer", "Ranger", "Druid", "Cleric"],
  "Half-orc": ["Barbarian", "Ranger"],
  Halfling: ["Rogue", "Cleric", "Druid", "Monk"],
};
const SIGNATURE = {
  Human: "Paladin", Dwarf: "Fighter", Elf: "Wizard", Gnome: "Bard",
  "Half-elf": "Sorcerer", "Half-orc": "Barbarian", Halfling: "Rogue",
};
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
const UNIT_LIKE = ["Unit", "Ancient Legend"]; // have race/class/atk/hp

const DEFAULT_KEYWORDS = [
  { name: "Guard", desc: "Must be targeted before your non-Guard units. (Front line only)" },
  { name: "Reach", desc: "May attack the enemy Back rank directly." },
  { name: "Aerial", desc: "Only enemy Aerial or Reach units can intercept it." },
  { name: "Ranged", desc: "Deals damage without suffering retaliation." },
  { name: "Swift", desc: "Acts first; if it defeats its target, takes no retaliation." },
  { name: "Empowered", desc: "May take another action that turn (untap once per turn)." },
  { name: "Stealth", desc: "Cannot be targeted by enemies until it acts for the first time." },
  { name: "Lethal", desc: "Any amount of damage it deals defeats the target." },
  { name: "Cleave", desc: "Excess (overspill) carries to the next enemy unit instead of the party." },
  { name: "Mending", desc: "Damage this unit deals also heals your party's units for the same amount." },
  { name: "Ward", desc: "The first enemy spell or ability targeting it each turn is canceled." },
  { name: "Rally X", desc: "When it arrives, your other units get +X Attack until end of turn." },
  { name: "Siege", desc: "Overspill from this unit hits the enemy Party at FULL value (not halved); if unblocked, full Attack to the Party." },
  { name: "Frontline", desc: "This unit fights in the front rank and can be targeted by attackers." },
  { name: "Backline", desc: "This unit is protected while you control a Frontline unit." },
  { name: "Taunt", desc: "Attacker decides the defense's blocker unit (only 1)." },
  { name: "Faith", desc: "Unit or Artifact with holy origin or class." },
];

const STORAGE_KEY = "projectdd_cards_v1";
const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);

function blankCard(type) {
  return {
    id: uid(), type,
    name: "", provisions: "", mana: "", rarity: "Common",
    race: "", klass: "", position: "Frontline",
    keywords: [], attack: "", health: "",
    strike: "", abilities: [], passive: "",
    text: "", flavor: "",
  };
}

// Starter cards mirroring the reference spreadsheet (shown only on first run;
// delete them freely — your changes auto-save).
const SEED_CARDS = [
  {
    ...blankCard("Unit"),
    name: "Julius XI, Grand General", provisions: "4", mana: "0",
    race: "Human", klass: "Paladin", position: "Frontline", rarity: "Legendary",
    keywords: ["Guard", "Swift"], attack: "3", health: "6", strike: "Deal 3.",
    abilities: [
      "Preach - 2 Mana - Empowers one friendly Human unit. (Per Turn)",
      "Crusader Strike - 1 Prov 1 Mana - Imbues Julius XI's blade with holy power, dealing 3 damage and 1 burn damage for 2 turns (does not stack).",
    ],
  },
  {
    ...blankCard("Ancient Legend"),
    name: "Example Legend :P", provisions: "5", mana: "0",
    race: "Human", klass: "Paladin", position: "Frontline", rarity: "Legendary",
    keywords: ["Guard", "Rally X"], attack: "0", health: "8",
    abilities: ["Banner (P2): ally units of the Faith (Clerics and Paladins) gain a +0/+1 counter."],
    passive: "Your party may include 2\u20134 Tribes with no Tension.",
  },
  {
    ...blankCard("Ancient Relic"),
    name: "Oathkeeper Reliquary", provisions: "5", mana: "5", rarity: "Legendary",
    keywords: ["Faith"],
    text: "Cannot be destroyed. Allied units of the Faith have Mending; extend the Cemetery revival window by 1 turn.",
  },
  {
    ...blankCard("Event"),
    name: "Firestorm", provisions: "0", mana: "4", rarity: "Rare",
    text: "Deal 4 Party Damage, or 4 to a unit.", flavor: "The sky exhales.",
  },
  {
    ...blankCard("Artifact"),
    name: "Vanguard Banner", provisions: "3", mana: "0", rarity: "Uncommon",
    text: "Your units' overspill is +1 before halving.",
  },
];

// ---- small UI helpers -----------------------------------------------------
const Label = ({ children }) => (
  <label className="block text-[11px] uppercase tracking-wide text-neutral-400 mb-1">{children}</label>
);
const inputCls =
  "w-full rounded-md bg-neutral-800 border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-100 " +
  "placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60";

function TextField({ label, value, onChange, placeholder, ...rest }) {
  return (
    <div>
      <Label>{label}</Label>
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} {...rest} />
    </div>
  );
}
function Select({ label, value, onChange, options, placeholder = "—", disabled }) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        className={inputCls + (disabled ? " opacity-50" : "")}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

// ---- the card tile (the "card-shaped square") -----------------------------
function CardTile({ card, onEdit, onDelete }) {
  const unitLike = UNIT_LIKE.includes(card.type);
  const subtitle = unitLike
    ? [card.race && card.klass ? `${card.race} ${card.klass}` : (card.race || card.klass), card.position, card.rarity].filter(Boolean).join("  \u00b7  ")
    : `${card.type}  \u00b7  ${card.rarity}`;
  const bodyLines = unitLike
    ? [
        card.strike ? `Strike: ${card.strike}` : "",
        ...(card.abilities || []).filter(Boolean).map((a) => `\u2022 ${a}`),
        card.passive ? `Passive: ${card.passive}` : "",
      ].filter(Boolean)
    : (card.text ? [card.text] : []);

  return (
    <div className="group relative w-[260px] rounded-xl border border-neutral-700 bg-neutral-900 shadow-lg overflow-hidden flex flex-col">
      {/* header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2" style={{ background: "#3b2d52" }}>
        <span className="font-semibold text-[15px] text-amber-200 truncate">{card.name || "(unnamed)"}</span>
        <span className="shrink-0 text-[11px] font-bold text-amber-100/90 bg-black/25 rounded px-1.5 py-0.5">
          P {card.provisions || 0} · M {card.mana || 0}
        </span>
      </div>
      {/* subtitle */}
      <div className="px-3 py-1 text-[11px] italic text-neutral-300 bg-neutral-800/70 border-b border-neutral-700/60">
        {subtitle}
      </div>
      {/* keywords */}
      {card.keywords && card.keywords.length > 0 && (
        <div className="px-3 py-1.5 flex flex-wrap gap-1">
          {card.keywords.map((k) => (
            <span key={k} className="text-[10px] font-semibold text-amber-300 border border-amber-500/40 rounded px-1.5 py-0.5">{k}</span>
          ))}
        </div>
      )}
      {/* body */}
      <div className="px-3 py-2 text-[12px] text-neutral-200 leading-snug flex-grow min-h-[64px] space-y-0.5">
        {bodyLines.length ? bodyLines.map((l, i) => <div key={i}>{l}</div>) : <div className="text-neutral-600">No rules text yet.</div>}
      </div>
      {/* flavor */}
      {card.flavor && <div className="px-3 pb-2 text-[11px] italic text-neutral-400">&ldquo;{card.flavor}&rdquo;</div>}
      {/* footer */}
      {unitLike && (
        <div className="grid grid-cols-2 text-center text-sm font-bold border-t border-neutral-700 bg-neutral-800/60">
          <div className="py-1 text-rose-300">ATK {card.attack || 0}</div>
          <div className="py-1 text-emerald-300 border-l border-neutral-700">HP {card.health || 0}</div>
        </div>
      )}
      {/* hover actions */}
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition">
        <button onClick={onEdit} className="text-[11px] bg-neutral-700 hover:bg-neutral-600 text-white rounded px-2 py-0.5">Edit</button>
        <button onClick={onDelete} className="text-[11px] bg-rose-700 hover:bg-rose-600 text-white rounded px-2 py-0.5">✕</button>
      </div>
    </div>
  );
}

// ---- the editor modal -----------------------------------------------------
function Editor({ draft, setDraft, keywords, onAddKeyword, onSave, onCancel }) {
  const unitLike = UNIT_LIKE.includes(draft.type);
  const classOptions = draft.race ? RACE_CLASSES[draft.race] || [] : [];
  const set = (patch) => setDraft({ ...draft, ...patch });
  const toggleKeyword = (k) =>
    set({ keywords: draft.keywords.includes(k) ? draft.keywords.filter((x) => x !== k) : [...draft.keywords, k] });

  const setAbility = (i, val) => {
    const a = [...draft.abilities]; a[i] = val; set({ abilities: a });
  };
  const addAbility = () => set({ abilities: [...draft.abilities, ""] });
  const removeAbility = (i) => set({ abilities: draft.abilities.filter((_, x) => x !== i) });

  const [newKw, setNewKw] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 overflow-y-auto">
      <div className="w-full max-w-5xl my-6 rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800" style={{ background: "#2a2238" }}>
          <h2 className="text-lg font-semibold text-amber-200">{draft.type} — Card Editor</h2>
          <button onClick={onCancel} className="text-neutral-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="grid md:grid-cols-2 gap-6 p-5">
          {/* LEFT: form */}
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
                  <Select
                    label="Race / Tribe"
                    value={draft.race}
                    onChange={(v) => set({ race: v, klass: (RACE_CLASSES[v] || []).includes(draft.klass) ? draft.klass : "" })}
                    options={RACES}
                    placeholder="Race"
                  />
                  <Select
                    label="Class"
                    value={draft.klass}
                    onChange={(v) => set({ klass: v })}
                    options={classOptions}
                    placeholder={draft.race ? "Class" : "pick race first"}
                    disabled={!draft.race}
                  />
                  <Select label="Position" value={draft.position} onChange={(v) => set({ position: v })} options={POSITIONS} placeholder="Position" />
                </div>
                {draft.race && (
                  <p className="text-[11px] text-neutral-500 -mt-1">
                    Signature class for {draft.race}: <span className="text-amber-400">{SIGNATURE[draft.race]}</span>. Class list is locked to lore-accurate options.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Attack" value={draft.attack} onChange={(v) => set({ attack: v })} placeholder="0" inputMode="numeric" />
                  <TextField label="Health" value={draft.health} onChange={(v) => set({ health: v })} placeholder="0" inputMode="numeric" />
                </div>
                <div>
                  <Label>Strike (basic attack text)</Label>
                  <input className={inputCls} value={draft.strike} onChange={(e) => set({ strike: e.target.value })} placeholder="Deal 3 to a unit." />
                </div>
                <div>
                  <Label>Abilities</Label>
                  <div className="space-y-2">
                    {draft.abilities.map((ab, i) => (
                      <div key={i} className="flex gap-2">
                        <input className={inputCls} value={ab} onChange={(e) => setAbility(i, e.target.value)} placeholder={`Ability ${i + 1} — e.g. Shield Bash (P1): Strike and Stun.`} />
                        <button onClick={() => removeAbility(i)} className="shrink-0 px-2 rounded-md bg-neutral-700 hover:bg-rose-700 text-white text-sm">✕</button>
                      </div>
                    ))}
                    <button onClick={addAbility} className="text-xs text-amber-300 border border-amber-500/40 rounded px-2 py-1 hover:bg-amber-500/10">+ Add ability</button>
                  </div>
                </div>
                <div>
                  <Label>Passive text</Label>
                  <textarea className={inputCls} rows={2} value={draft.passive} onChange={(e) => set({ passive: e.target.value })} placeholder="Takes 1 less combat damage while you control another Dwarf." />
                </div>
              </>
            )}

            {!unitLike && (
              <div>
                <Label>Card Text {draft.type === "Event" ? "(effect)" : "(passive / persistent effect)"}</Label>
                <textarea className={inputCls} rows={4} value={draft.text} onChange={(e) => set({ text: e.target.value })} placeholder="Deal 4 Party Damage, or 4 to a unit." />
              </div>
            )}

            <div>
              <Label>Flavor text</Label>
              <textarea className={inputCls} rows={2} value={draft.flavor} onChange={(e) => set({ flavor: e.target.value })} placeholder="A shield is a promise kept with your body." />
            </div>

            {/* keywords picker */}
            <div>
              <Label>Keywords (click to toggle)</Label>
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((k) => {
                  const on = draft.keywords.includes(k.name);
                  return (
                    <button
                      key={k.name}
                      title={k.desc}
                      onClick={() => toggleKeyword(k.name)}
                      className={
                        "text-[11px] rounded px-2 py-1 border transition " +
                        (on
                          ? "bg-amber-500/20 border-amber-400 text-amber-200"
                          : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-500")
                      }
                    >
                      {k.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-2">
                <input className={inputCls} value={newKw} onChange={(e) => setNewKw(e.target.value)} placeholder="add a new keyword…" />
                <button
                  onClick={() => { if (newKw.trim()) { onAddKeyword(newKw.trim()); toggleKeyword(newKw.trim()); setNewKw(""); } }}
                  className="shrink-0 px-3 rounded-md bg-amber-600 hover:bg-amber-500 text-black text-sm font-semibold"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: live preview */}
          <div className="flex flex-col items-center">
            <p className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">Live preview</p>
            <CardTile card={draft} onEdit={() => {}} onDelete={() => {}} />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-neutral-800">
          <button onClick={onCancel} className="px-4 py-2 rounded-md bg-neutral-700 hover:bg-neutral-600 text-white text-sm">Cancel</button>
          <button onClick={onSave} className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">Save card</button>
        </div>
      </div>
    </div>
  );
}

// ---- keywords manager view -----------------------------------------------
function KeywordsView({ keywords, setKeywords }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const add = () => {
    if (!name.trim()) return;
    if (keywords.some((k) => k.name.toLowerCase() === name.trim().toLowerCase())) return;
    setKeywords([...keywords, { name: name.trim(), desc: desc.trim() }]);
    setName(""); setDesc("");
  };
  const remove = (n) => setKeywords(keywords.filter((k) => k.name !== n));
  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-semibold text-amber-200 mb-1">Keywords</h2>
      <p className="text-sm text-neutral-400 mb-4">Add keywords here and they appear in every card editor automatically.</p>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input className={inputCls + " sm:w-48"} value={name} onChange={(e) => setName(e.target.value)} placeholder="Keyword" />
        <input className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What it does…" />
        <button onClick={add} className="shrink-0 px-4 rounded-md bg-amber-600 hover:bg-amber-500 text-black text-sm font-semibold">Add</button>
      </div>
      <div className="divide-y divide-neutral-800 border border-neutral-800 rounded-lg overflow-hidden">
        {keywords.map((k) => (
          <div key={k.name} className="flex items-start gap-3 px-3 py-2 bg-neutral-900">
            <span className="shrink-0 w-28 font-semibold text-amber-300 text-sm">{k.name}</span>
            <span className="flex-grow text-sm text-neutral-300">{k.desc}</span>
            <button onClick={() => remove(k.name)} className="shrink-0 text-rose-400 hover:text-rose-300 text-sm">remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- lore reference view --------------------------------------------------
function LoreView() {
  return (
    <div className="max-w-4xl">
      <h2 className="text-xl font-semibold text-amber-200 mb-1">Lore Combos (Domain reference)</h2>
      <p className="text-sm text-neutral-400 mb-4">Lore-accurate Tribe + Class pairings (D&D 3.5 PHB). Class dropdowns in the editor are locked to these.</p>
      <div className="overflow-x-auto border border-neutral-800 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-800 text-neutral-300 text-left">
              <th className="px-3 py-2">Tribe</th>
              <th className="px-3 py-2">Signature ★</th>
              <th className="px-3 py-2">Other classes</th>
              <th className="px-3 py-2">Lean</th>
              <th className="px-3 py-2">Allies</th>
              <th className="px-3 py-2">Rivals</th>
            </tr>
          </thead>
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

// ---- main page ------------------------------------------------------------
export default function Page() {
  const [cards, setCards] = useState([]);
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [view, setView] = useState("Unit"); // a card type, or "Keywords" / "Lore"
  const [draft, setDraft] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const loaded = useRef(false);
  const fileInput = useRef(null);

  // load once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.cards)) setCards(parsed.cards);
        if (Array.isArray(parsed.keywords) && parsed.keywords.length) setKeywords(parsed.keywords);
      } else {
        setCards(SEED_CARDS); // first run: show the reference examples
      }
    } catch (e) { /* ignore */ }
    loaded.current = true;
  }, []);

  // auto-save whenever data changes (after initial load)
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cards, keywords }));
      setSavedAt(new Date());
    } catch (e) { /* ignore */ }
  }, [cards, keywords]);

  const isTypeView = CARD_TYPES.includes(view);
  const visible = cards.filter((c) => c.type === view);

  const startNew = () => setDraft(blankCard(view));
  const editCard = (card) => setDraft({ ...card, abilities: [...(card.abilities || [])], keywords: [...(card.keywords || [])] });
  const deleteCard = (id) => { if (confirm("Delete this card?")) setCards(cards.filter((c) => c.id !== id)); };
  const saveDraft = () => {
    setCards((prev) => (prev.some((c) => c.id === draft.id) ? prev.map((c) => (c.id === draft.id ? draft : c)) : [...prev, draft]));
    setDraft(null);
  };
  const addKeyword = (n) => setKeywords((prev) => (prev.some((k) => k.name.toLowerCase() === n.toLowerCase()) ? prev : [...prev, { name: n, desc: "" }]));

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ cards, keywords, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "project-dd-cards.json"; a.click();
    URL.revokeObjectURL(url);
  };
  const importJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.cards)) throw new Error("No cards array");
        if (!confirm(`Import ${parsed.cards.length} cards? This replaces what's on screen (your file is unchanged).`)) return;
        setCards(parsed.cards);
        if (Array.isArray(parsed.keywords) && parsed.keywords.length) setKeywords(parsed.keywords);
      } catch (err) {
        alert("That doesn't look like a Project DD export file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const counts = CARD_TYPES.reduce((acc, t) => { acc[t] = cards.filter((c) => c.type === t).length; return acc; }, {});

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex">
      {/* sidebar */}
      <aside className="w-60 shrink-0 border-r border-neutral-800 bg-neutral-900/60 p-4 flex flex-col gap-1">
        <div className="mb-3">
          <h1 className="text-xl font-bold text-amber-300 leading-tight">PROJECT DD</h1>
          <p className="text-xs text-neutral-500">Card Builder</p>
        </div>
        <p className="text-[10px] uppercase tracking-wide text-neutral-600 mt-2 mb-1">Card types</p>
        {CARD_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setView(t)}
            className={"flex items-center justify-between rounded-md px-3 py-2 text-sm text-left transition " +
              (view === t ? "bg-violet-800/40 text-amber-200 border border-violet-600/50" : "hover:bg-neutral-800 text-neutral-300")}
          >
            <span>{t}</span>
            <span className="text-[11px] text-neutral-500">{counts[t]}</span>
          </button>
        ))}
        <p className="text-[10px] uppercase tracking-wide text-neutral-600 mt-3 mb-1">Reference</p>
        {["Keywords", "Lore"].map((t) => (
          <button
            key={t}
            onClick={() => setView(t)}
            className={"rounded-md px-3 py-2 text-sm text-left transition " +
              (view === t ? "bg-violet-800/40 text-amber-200 border border-violet-600/50" : "hover:bg-neutral-800 text-neutral-300")}
          >
            {t}
          </button>
        ))}
        <div className="mt-auto pt-4 space-y-2">
          <button onClick={exportJSON} className="w-full rounded-md bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 px-3 py-2 text-sm">⬇ Export JSON</button>
          <button onClick={() => fileInput.current?.click()} className="w-full rounded-md bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 px-3 py-2 text-sm">⬆ Import JSON</button>
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={importJSON} />
          <p className="text-[10px] text-neutral-600 text-center">{savedAt ? `Auto-saved ${savedAt.toLocaleTimeString()}` : "Auto-save on"}</p>
        </div>
      </aside>

      {/* main */}
      <main className="flex-grow p-6 overflow-x-hidden">
        {isTypeView ? (
          <>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-2xl font-bold text-neutral-100">{view}</h2>
                <p className="text-sm text-neutral-500">{visible.length} card{visible.length === 1 ? "" : "s"}</p>
              </div>
              <button onClick={startNew} className="rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 text-sm shadow">+ New {view}</button>
            </div>
            {visible.length === 0 ? (
              <div className="border border-dashed border-neutral-800 rounded-xl p-12 text-center text-neutral-500">
                No {view} cards yet. Click <span className="text-amber-400 font-semibold">+ New {view}</span> to make your first one.
              </div>
            ) : (
              <div className="flex flex-wrap gap-4">
                {visible.map((c) => (
                  <CardTile key={c.id} card={c} onEdit={() => editCard(c)} onDelete={() => deleteCard(c.id)} />
                ))}
              </div>
            )}
          </>
        ) : view === "Keywords" ? (
          <KeywordsView keywords={keywords} setKeywords={setKeywords} />
        ) : (
          <LoreView />
        )}
      </main>

      {draft && (
        <Editor
          draft={draft}
          setDraft={setDraft}
          keywords={keywords}
          onAddKeyword={addKeyword}
          onSave={saveDraft}
          onCancel={() => setDraft(null)}
        />
      )}
    </div>
  );
}
