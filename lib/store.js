// lib/store.js — shared storage backed by Upstash Redis (one JSON document).
import { Redis } from "@upstash/redis";

// The Vercel "Upstash" marketplace integration sets these automatically.
// We accept either naming so it works no matter which the integration uses.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;
export const STORAGE_READY = !!redis;

const KEY = "projectdd:data:v1";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);

// ---- first-run defaults (mirror the reference spreadsheet) ----------------
const SEED_KEYWORDS = [
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

const base = (type, o) => ({
  id: uid(), type, name: "", provisions: "", mana: "", rarity: "Common",
  race: "", klass: "", position: "Frontline", keywords: [], attack: "", health: "",
  strike: "", abilities: [], passive: "", text: "", flavor: "", ...o,
});
const SEED_CARDS = [
  base("Unit", { name: "Julius XI, Grand General", provisions: "4", mana: "0", race: "Human", klass: "Paladin", position: "Frontline", rarity: "Legendary", keywords: ["Guard", "Swift"], attack: "3", health: "6", strike: "Deal 3.",
    abilities: [
      { prov: "", mana: "2", text: "Preach \u2014 Empowers one friendly Human unit. (Per Turn)" },
      { prov: "1", mana: "1", text: "Crusader Strike \u2014 Imbues Julius XI's blade with holy power, dealing 3 damage and 1 burn damage for 2 turns (does not stack)." },
    ] }),
  base("Ancient Legend", { name: "Example Legend :P", provisions: "5", mana: "0", race: "Human", klass: "Paladin", position: "Frontline", rarity: "Legendary", keywords: ["Guard", "Rally X"], attack: "0", health: "8",
    abilities: [{ prov: "2", mana: "", text: "Banner \u2014 ally units of the Faith (Clerics and Paladins) gain a +0/+1 counter." }], passive: "Your party may include 2\u20134 Tribes with no Tension." }),
  base("Ancient Relic", { name: "Oathkeeper Reliquary", provisions: "5", mana: "5", rarity: "Legendary", keywords: ["Faith"], text: "Cannot be destroyed. Allied units of the Faith have Mending; extend the Cemetery revival window by 1 turn." }),
  base("Event", { name: "Firestorm", provisions: "0", mana: "4", rarity: "Rare", text: "Deal 4 Party Damage, or 4 to a unit.", flavor: "The sky exhales." }),
  base("Artifact", { name: "Vanguard Banner", provisions: "3", mana: "0", rarity: "Uncommon", text: "Your units' overspill is +1 before halving." }),
];

function defaultDoc() {
  return { cards: SEED_CARDS, keywords: SEED_KEYWORDS, users: [], writeToken: "changeme" };
}

export async function getDoc() {
  if (!redis) throw new Error("storage_not_configured");
  let doc = await redis.get(KEY); // @upstash/redis auto-parses JSON
  if (!doc || typeof doc !== "object") {
    doc = defaultDoc();
    await redis.set(KEY, doc);
  }
  doc.cards ||= [];
  doc.keywords ||= [];
  doc.users ||= [];
  if (doc.writeToken == null) doc.writeToken = "changeme";
  return doc;
}

export async function setDoc(doc) {
  if (!redis) throw new Error("storage_not_configured");
  await redis.set(KEY, doc);
  return doc;
}
