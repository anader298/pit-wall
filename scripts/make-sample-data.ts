// Writes data/sample/*.json. Everything it produces is synthetic: people are
// "Driver 07" or "Alex Sample", companies are "Example ... Co", and every
// domain ends in .example (reserved, never resolvable). Deterministic: the
// same seed gives the same files.
//
//   node scripts/make-sample-data.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "sample");
mkdirSync(OUT, { recursive: true });

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261018);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rng() * a.length)];
const between = (lo: number, hi: number) => lo + rng() * (hi - lo);

const NOTE = "SYNTHETIC SAMPLE DATA. No real person, team, company or address appears in this file.";
const write = (name: string, data: unknown) =>
  writeFileSync(join(OUT, name), JSON.stringify({ _note: NOTE, ...data as object }, null, 2) + "\n");

// ------------------------------------------------------------- businesses

const INDUSTRIES: Record<string, string> = {
  motorsport: "Motorsport", tire_retail: "Tires", auto_retail: "Auto retail & repair",
  logistics: "Logistics & transport", agri_food: "Agriculture & food", energy: "Energy & fuel",
  construction: "Construction & trades", materials: "Building materials", real_estate: "Real estate",
  hospitality: "Hospitality & leisure", manufacturing: "Manufacturing", finance: "Finance & investment",
  tech: "Technology", retail: "Retail & trade", consumer_goods: "Consumer goods",
};

const BUSINESS_SEEDS: [string, string, string, string, string | null, number][] = [
  // id, name, industry, what, US state (null = abroad), revenue midpoint in $M
  ["example-logistics", "Example Logistics Co", "logistics", "Regional trucking and refrigerated freight", "GA", 140],
  ["sample-orchards", "Sample Orchards Ltd", "agri_food", "Fruit grower and exporter", null, 85],
  ["demo-tire-auto", "Demo Tire & Auto", "tire_retail", "Multi-site tire and service centers", "TX", 60],
  ["placeholder-builders", "Placeholder Builders", "construction", "General contracting", "KY", 95],
  ["example-stone", "Example Stone & Supply", "materials", "Aggregates and building materials", "OH", 70],
  ["sample-hotels", "Sample Hotel Group", "hospitality", "Select-service hotels", "FL", 120],
  ["demo-plastics", "Demo Plastics Inc", "manufacturing", "Injection-molded components", "MI", 210],
  ["example-capital", "Example Capital Partners", "finance", "Private investment office", "NY", null as unknown as number],
  ["sample-foods", "Sample Fresh Foods", "agri_food", "Produce packing and distribution", "CA", 180],
  ["demo-fuel", "Demo Fuel Stops", "energy", "Fuel stations and convenience", "IN", 260],
  ["example-realty", "Example Realty Trust", "real_estate", "Industrial and retail property", "AZ", 55],
  ["placeholder-motors", "Placeholder Motors", "auto_retail", "Dealer group with fleet service", "NC", 330],
  ["sample-goods", "Sample Home Goods", "consumer_goods", "Housewares brand", null, 150],
  ["demo-software", "Demo Software Ltd", "tech", "Logistics software", null, 40],
];

const businesses = BUSINESS_SEEDS.map(([id, name, industry, what, state, mid]) => {
  const known = typeof mid === "number" && mid > 0;
  const spread = known ? between(0.04, 0.12) : 0;
  const m = known ? mid * 1e6 : 0;
  return {
    id, name, industry, what,
    country: state ? "United States" : pick(["United Kingdom", "Spain", "Netherlands"]),
    state,
    rev: known ? { lo: Math.round(m * (1 - spread)), hi: Math.round(m * (1 + spread)), mid: Math.round(m) } : null,
    rev_basis: known ? pick(["company-reported", "filing", "press report", "third-party estimate"]) : null,
  };
});

// --------------------------------------------------------------- profiles

const TEAMS = ["Team Alpha Racing", "Team Bravo Motorsport", "Team Charlie GT", "Team Delta Junior", "Team Echo Formula"];
const SERIES_SC = ["GT endurance", "GT sprint", "One-make cup"];
const SERIES_OW = ["Formula 4 (sample)", "Junior formula", "Formula development"];
const RUN_COST_SC: Record<string, number> = { "GT endurance": 1_600_000, "GT sprint": 900_000, "One-make cup": 600_000 };
const RUN_COST_OW: Record<string, number> = { "Formula 4 (sample)": 350_000, "Junior formula": 250_000, "Formula development": 500_000 };
const INTERESTS = ["engineering school", "family-run business", "competitive sailing", "karting champion", "aviation", "golf", "philanthropy", "agriculture", "skiing"];

const profiles = Array.from({ length: 24 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  const sc = i < 13;
  const series = sc ? pick(SERIES_SC) : pick(SERIES_OW);
  const biz = i < BUSINESS_SEEDS.length ? businesses[i] : rng() < 0.4 ? pick(businesses) : null;
  const verified = [0, 2, 5, 9].includes(i);
  const usBased = biz ? biz.country === "United States" : i % 5 === 0 ? null : rng() < 0.6;
  const routeKind = i % 6 === 5 ? "none" : pick(["published_email", "verified_email", "linkedin", "manager"] as const);
  const lead = verified ? "Verified wealth" : biz ? pick(["Strong lead", "Strong lead", "Possible lead"] as const) : pick(["Possible lead", "No lead"] as const);
  return {
    uid: `sample:${n}`,
    driver: `Driver ${n}`,
    discipline: sc ? "Sports car" : "Open wheel",
    series,
    team: pick(TEAMS),
    residence_country: usBased === null ? "not established" : usBased ? "United States" : (biz?.country ?? "United Kingdom"),
    us_based: usBased,
    driver_type: sc ? pick(["Gentleman driver", "Hired pro", "Team owner-driver"]) : "Junior",
    lead,
    confidence: verified ? "High" : biz ? "Medium" : "Low",
    money_holder: sc && rng() < 0.4 ? "driver (self-made)" : biz ? pick(["father", "mother", "family (other)"] as const) : "unknown",
    money_holder_name: biz ? `Parent of Driver ${n}` : null,
    business_id: biz?.id ?? null,
    run_cost_usd: sc ? RUN_COST_SC[series] : RUN_COST_OW[series],
    run_cost_basis: "series estimate",
    wealth_verified: verified,
    nw_verified_usd: verified ? Math.round(between(40, 400)) * 1e6 : null,
    route: {
      kind: routeKind,
      basis: routeKind === "none" ? "no professional route found yet" :
        routeKind === "manager" ? "driver management (sample)" :
        routeKind === "linkedin" ? "money holder's own profile (sample)" : "named address from a public source (sample)",
    },
    interests: [pick(INTERESTS), pick(INTERESTS)].filter((v, k, a) => a.indexOf(v) === k),
  };
});

// ----------------------------------------------------- partners and model

const partners = [
  { id: "series-tire", name: "Series Tire Partner", role: "Official tire supplier (sample)", category: "tires",
    buyers: { logistics: 0.025, construction: 0.006, agri_food: 0.004, materials: 0.008 }, partner_margin: 0.15, effort_base: 2.5 },
  { id: "series-fuel", name: "Series Fuel Partner", role: "Official fuel supplier (sample)", category: "energy",
    buyers: { logistics: 0.05, construction: 0.01, auto_retail: 0.01 }, partner_margin: 0.08, effort_base: 3 },
];

const model = {
  _assumptions: "Illustrative parameters for the sample. The live model keeps the same structure with researched shares.",
  rates: [0.1, 0.15, 0.2],
  base_rate: 0.15,
  ramp: [0.5, 1, 1, 1, 1],
  setup_per_effort: 15000,
  capture: { low: 0.04, base: 0.1, high: 0.2 },
  buyer_spend_cap: 25_000_000,
  categories: {
    freight: { label: "Freight contract", margin: 0.12, effort_base: 2, sellers: ["logistics"],
      seller_cap: { low: 0.1, base: 0.2, high: 0.35 },
      buyers: { agri_food: 0.06, manufacturing: 0.05, consumer_goods: 0.05, materials: 0.08, retail: 0.04 } },
    tires: { label: "Fleet tire program", margin: 0.15, effort_base: 2, sellers: ["tire_retail"],
      seller_cap: { low: 0.03, base: 0.08, high: 0.15 },
      buyers: { logistics: 0.025, construction: 0.006, agri_food: 0.004, materials: 0.008 } },
    fleet_service: { label: "Fleet maintenance contract", margin: 0.2, effort_base: 2, sellers: ["auto_retail"],
      seller_cap: { low: 0.03, base: 0.08, high: 0.15 },
      buyers: { logistics: 0.03, construction: 0.01, agri_food: 0.005, energy: 0.005 } },
    build: { label: "Build / renovation work", margin: 0.1, effort_base: 3, sellers: ["construction"],
      seller_cap: { low: 0.03, base: 0.08, high: 0.15 },
      buyers: { real_estate: 0.25, hospitality: 0.04, manufacturing: 0.02, retail: 0.02 } },
    materials: { label: "Building materials supply", margin: 0.12, effort_base: 2, sellers: ["materials"],
      seller_cap: { low: 0.03, base: 0.08, high: 0.15 },
      buyers: { construction: 0.3, real_estate: 0.03 } },
    food: { label: "Food service supply", margin: 0.1, effort_base: 2, sellers: ["agri_food"],
      seller_cap: { low: 0.03, base: 0.08, high: 0.15 },
      buyers: { hospitality: 0.12, retail: 0.05 } },
    it: { label: "Software contract", margin: 0.4, effort_base: 3, sellers: ["tech"],
      seller_cap: { low: 0.02, base: 0.05, high: 0.1 },
      buyers: { logistics: 0.004, manufacturing: 0.003 } },
  },
};

// -------------------------------------------------------- outside targets

type G = "pass" | "partial" | "fail";
const COMPANY_SEEDS: [string, string, string, number[], G[]][] = [
  // name, vertical, signal, axes [spend, us_intent, budget, viability, timing], gates [authority, budget, us_activation, compliance]
  ["Example Neobank Co", "Fintech and neobanking", "Hiring a Head of US Growth after a US card launch", [2, 3, 2, 3, 3], ["pass", "pass", "pass", "pass"]],
  ["Sample Growth Brands", "Inc. 5000 fast growers", "Founder-led, on a fast-grower list three years running", [1, 2, 2, 3, 2], ["pass", "partial", "pass", "pass"]],
  ["Demo Digital Assets", "Crypto and digital assets", "Registered as a money services business in new states", [2, 3, 3, 1, 3], ["pass", "pass", "pass", "partial"]],
  ["Example Sportsbook Ltd", "Gambling and sports betting", "Active shirt partner in another sport, no US licence yet", [3, 2, 3, 0, 2], ["pass", "pass", "fail", "fail"]],
  ["Sample Appliance Co", "Consumer tech and appliances", "US retail rollout announced", [1, 3, 2, 3, 3], ["partial", "pass", "pass", "pass"]],
  ["Placeholder Challenger Inc", "Challenger brands", "Relaunching the brand in the US this year", [2, 3, 2, 3, 3], ["pass", "pass", "pass", "pass"]],
  ["Example Delivery Co", "Ride-share, delivery, logistics", "Expanding to new US metros", [2, 2, 3, 3, 2], ["partial", "pass", "pass", "pass"]],
  ["Sample Energy Drinks", "Energy drinks and beverage", "Distributor recruitment drive in the South", [3, 3, 2, 3, 2], ["pass", "pass", "pass", "pass"]],
  ["Demo Outdoor Gear", "Americana and outdoor", "New dealer program announced", [1, 2, 1, 3, 2], ["pass", "partial", "pass", "pass"]],
  ["Example Marketplace", "E-commerce and retail", "US warehouse opening", [1, 2, 2, 3, 1], ["fail", "pass", "pass", "pass"]],
  ["Sample eSIM Co", "Travel and connectivity", "Launch campaign for US travellers", [2, 3, 1, 3, 3], ["pass", "partial", "pass", "pass"]],
  ["Demo Predictions", "Prediction markets", "Raised a growth round; state licensing in progress", [1, 3, 3, 2, 3], ["pass", "pass", "partial", "partial"]],
  ["Example Streaming", "Streaming and entertainment", "Launching a motorsport content vertical", [2, 2, 3, 3, 2], ["partial", "pass", "pass", "pass"]],
  ["Sample Air", "Airlines and aviation", "New US routes this season", [3, 3, 3, 3, 2], ["fail", "pass", "pass", "pass"]],
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const companies = COMPANY_SEEDS.map(([name, vertical, signal, ax, g], i) => ({
  id: i + 1,
  name,
  vertical,
  signal,
  why_they_fit: `${signal}; a race weekend puts its buyers in one room.`,
  axes: { proven_sport_spend: ax[0], us_intent: ax[1], budget_capacity: ax[2], us_viability: ax[3], timing: ax[4] },
  gates: { authority: g[0], budget: g[1], us_activation: g[2], compliance: g[3] },
  status: ax[3] <= 1 ? "watchlist" : "target",
  domain: `${slug(name)}.example`,
}));

const FIRST = ["Alex", "Jordan", "Casey", "Morgan", "Riley", "Taylor", "Jamie", "Avery", "Quinn", "Reese", "Drew", "Sam", "Robin", "Parker", "Hayden"];
const LAST = ["Sample", "Example", "Placeholder", "Demo", "Testcase"];
const TITLES = ["Head of Partnerships", "Chief Marketing Officer", "VP Brand", "General Manager, US", "Head of Growth", "Founder and CEO"];
const EVIDENCE = ["linkedin_match", "linkedin_match", "domain_full_name", "company_level", "pattern_guess", "none"] as const;
const CONF: Record<string, string> = { linkedin_match: "verified", domain_full_name: "probable", company_level: "quarantined", pattern_guess: "unverified", none: "none" };

let cid = 0;
const contacts = companies.flatMap((co) => {
  const n = 2 + Math.floor(rng() * 2);
  return Array.from({ length: n }, (_, k) => {
    cid++;
    const first = FIRST[(cid * 7) % FIRST.length];
    const last = LAST[cid % LAST.length];
    const ev = k === 0 ? "linkedin_match" : pick(EVIDENCE);
    const hasEmail = ev !== "none";
    return {
      id: cid,
      company_id: co.id,
      full_name: `${first} ${last}`,
      title: TITLES[(cid + k) % TITLES.length],
      linkedin_url: ev === "linkedin_match" ? `https://profiles.example/${first.toLowerCase()}-${last.toLowerCase()}-${cid}` : null,
      email: hasEmail ? `${first.toLowerCase()}.${last.toLowerCase()}@${co.domain}` : null,
      email_evidence: ev,
      email_confidence: CONF[ev],
      email_source: hasEmail ? "sample source" : null,
      status: co.status === "watchlist" ? "new" : k === 2 ? "departed" : "new",
      priority: k === 0 ? 1 : k === 1 ? 2 : 3,
      vertical: co.vertical,
    };
  });
});

const research = [
  { id: 1, title: "Race weekend attendance (sample figure)", numbers: ["120,000"], verified: true, source_note: "Sample verified research item" },
  { id: 2, title: "Broadcast reach (sample figure)", numbers: ["2.1M"], verified: true, source_note: "Sample verified research item" },
  { id: 3, title: "Hospitality guests per event (sample, unverified)", numbers: ["1,500"], verified: false, source_note: "Awaiting a source" },
];

// --------------------------------------------------------------- accounts

const accounts = [
  { id: 1, email: "outreach@program-one.example", domain: "program-one.example", provider: "m365", role: "cold", enabled: true,
    dkim_state: "live", dmarc_state: "p=none", warmup_required: true, warmup_days: 21, warmup_started_offset: -30, ramp_started_offset: -8,
    connected: true, notes: "Warm and ramping. Carries most first touches." },
  { id: 2, email: "hello@program-two.example", domain: "program-two.example", provider: "google_workspace", role: "cold", enabled: true,
    dkim_state: "live", dmarc_state: "p=none", warmup_required: true, warmup_days: 21, warmup_started_offset: -9, ramp_started_offset: null,
    connected: true, notes: "Mid-warmup. Cap is zero until day 21 and a ramp start." },
  { id: 3, email: "team@program-three.example", domain: "program-three.example", provider: "m365", role: "minimal", enabled: true,
    dkim_state: "missing", dmarc_state: "missing", warmup_required: true, warmup_days: 14, warmup_started_offset: null, ramp_started_offset: null,
    connected: true, notes: "Held: DKIM and DMARC not live, so it neither warms nor sends." },
  { id: 4, email: "helper@mail-helper.example", domain: "mail-helper.example", provider: "gmail_personal", role: "support", enabled: true,
    dkim_state: "live", dmarc_state: "p=none", warmup_required: false, warmup_days: 0, warmup_started_offset: null, ramp_started_offset: null,
    connected: true, notes: "Warmup counterparty only. Never emails prospects." },
];
const warmup_schedule = [1, 2, 3].flatMap((a) => [
  { account_id: a, day_index: 0, value: 2 }, { account_id: a, day_index: 4, value: 4 },
  { account_id: a, day_index: 8, value: 7 }, { account_id: a, day_index: 14, value: 10 }, { account_id: a, day_index: 18, value: 12 },
]);
const ramp_schedule = [1, 2].flatMap((a) => [
  { account_id: a, day_index: 0, value: 5 }, { account_id: a, day_index: 7, value: 10 }, { account_id: a, day_index: 14, value: 20 },
]).concat([{ account_id: 3, day_index: 0, value: 3 }]);

// ----------------------------------------------------------------- drafts
// Bodies are chosen so the sample queue shows each kind of check firing.
const c = (id: number) => contacts.find((x) => x.id === id)!;
const co = (id: number) => companies.find((x) => x.id === id)!;
const drafts = [
  { contact_id: 1, account_id: 1, variant: "A", state: "linted", created_offset: 0,
    subject: `${co(1).name} and the paddock`,
    body: `${c(1).full_name.split(" ")[0]} —\n\nYour US card launch needs a room full of owners who decide fast. Our paddock is that room, about 120,000 people across a race weekend, and we introduce partners to the family businesses already in it.\n\nWould you be open to an intro to the team running this?` },
  { contact_id: c(1).id + 3, account_id: 1, variant: "B", state: "linted", created_offset: 0,
    subject: "A partnership idea",
    body: `${contacts[3].full_name.split(" ")[0]} —\n\nHosting for 1,500 guests and a stage in front of dealers is what we offer this season. It is a partnership and an introduction, not a decal. Our program would like to show you how it works.\n\nOpen to an intro to the team?` },
  { contact_id: contacts[6].id, account_id: 1, variant: "C", state: "flagged", created_offset: 0,
    subject: "Team Alpha Racing and your US relaunch",
    body: `${contacts[6].full_name.split(" ")[0]} —\n\nTeam Alpha Racing has a seat partner slot open, and Driver 03 would carry your brand into the US relaunch. We would bring the dealers and distributors you want into one room.\n\nWould an introduction to the team be useful?` },
  { contact_id: contacts[9].id, account_id: 1, variant: "D", state: "in_review", created_offset: -1,
    subject: "Sponsorship package",
    body: `Hi Pat,\n\nOur sponsorship package is attached at www.program-one.example/deck and covers the full season. It reaches 2.1M viewers.\n\nWorth 15 minutes next week to go through it?` },
  { contact_id: contacts[12].id, account_id: 1, variant: "E", state: "linted", created_offset: -1,
    subject: `${co(contacts[12].company_id).name} and a dealer room`,
    body: `${contacts[12].full_name.split(" ")[0]} —\n\nA short note on a partnership idea for ${co(contacts[12].company_id).name}: introductions to family businesses in the paddock, not a logo on a car. Dealer recruitment works best face to face, and a race weekend puts the buyers in one place.\n\nIs this worth an intro to the team?` },
  { contact_id: contacts[15].id, account_id: 1, variant: "A", state: "placed", created_offset: -2,
    subject: "The paddock as a room",
    body: `${contacts[15].full_name.split(" ")[0]} —\n\nYour dealer push needs a room where owners decide on the spot. Our paddock is that room for three days, and we introduce partners to the family businesses already in it. No decal, no deck.\n\nWould you be open to an intro to the team running this?` },
  { contact_id: contacts[18].id, account_id: 1, variant: "B", state: "rejected", created_offset: -3,
    subject: "Quick idea",
    body: `${contacts[18].full_name.split(" ")[0]} —\n\nA short note on an idea for your US launch: meetings with the owners and executives in our paddock, and hosting for your customers at the track. It is a partnership, not a logo on a car.\n\nOpen to an intro to the team?` },
];

const suppression = [
  { email_key: contacts[21]?.email?.toLowerCase() ?? "opted-out@sample.example", reason: "opt_out", source: "sample" },
];

write("profiles.json", { industries: INDUSTRIES, businesses, profiles });
write("deals-model.json", { partners, model });
write("targets.json", { companies, contacts, research });
write("outreach.json", {
  accounts, warmup_schedule, ramp_schedule, drafts, suppression,
  settings: {
    // Team and driver names may never appear in a cold touch.
    banned_names: [...TEAMS, ...profiles.map((p) => p.driver)],
    // The only addresses warmup mail may ever go to.
    warmup_allowlist: accounts.map((a) => a.email),
  },
});
console.log(`wrote ${profiles.length} profiles, ${businesses.length} businesses, ${companies.length} companies, ${contacts.length} contacts, ${drafts.length} drafts to ${OUT}`);
