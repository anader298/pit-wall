// Shared record shapes. The live system keeps these in Postgres (see
// db/schema.sql); this repo keeps them in memory, seeded from data/sample.

export type Range = { lo: number; hi: number; mid: number };

// ---------------------------------------------------------------- profiles

export type Business = {
  id: string;
  name: string;
  industry: string;
  what: string;
  country: string;
  state: string | null;
  rev: Range | null; // latest annual revenue, never valuation or net worth
  rev_basis: "company-reported" | "filing" | "registry accounts" | "press report" | "third-party estimate" | null;
};

export type Profile = {
  uid: string;
  driver: string;
  discipline: "Sports car" | "Open wheel";
  series: string;
  team: string;
  residence_country: string;
  us_based: boolean | null; // null = not established; never guessed from nationality
  driver_type: string;
  lead: "Verified wealth" | "Strong lead" | "Possible lead" | "No lead";
  confidence: "High" | "Medium" | "Low";
  money_holder: "father" | "mother" | "family (other)" | "driver (self-made)" | "patron" | "unknown";
  money_holder_name: string | null;
  business_id: string | null;
  run_cost_usd: number | null;
  run_cost_basis: string | null;
  wealth_verified: boolean;
  nw_verified_usd: number | null;
  route: { kind: "published_email" | "verified_email" | "linkedin" | "manager" | "none"; basis: string };
  interests: string[]; // schools, history, personality notes, as tags
};

export type Partner = {
  id: string;
  name: string;
  role: string;
  category: string;
  buyers: Record<string, number>; // industry -> share of revenue spent on the category
  partner_margin: number;
  effort_base: number;
};

export type DealCategory = {
  label: string;
  margin: number;
  effort_base: number;
  sellers: string[]; // industries that can supply the category
  buyers: Record<string, number>; // industry -> share of revenue spent on it
  seller_cap: { low: number; base: number; high: number };
};

export type DealModel = {
  rates: number[];
  base_rate: number;
  ramp: number[]; // share of steady-state value earned in each year
  setup_per_effort: number;
  capture: { low: number; base: number; high: number };
  buyer_spend_cap: number;
  categories: Record<string, DealCategory>;
};

// --------------------------------------------------------- outside targets

export type Axes = {
  proven_sport_spend: number;
  us_intent: number;
  budget_capacity: number;
  us_viability: number;
  timing: number;
};

export type GateValue = "pass" | "partial" | "fail";
export type Gates = {
  authority: GateValue; // one person can decide alone
  budget: GateValue; // a budget line already exists
  us_activation: GateValue; // a US surface to use what the car offers
  compliance: GateValue; // can legally operate and promote in the US
};

export type Company = {
  id: number;
  name: string;
  vertical: string;
  signal: string;
  why_they_fit: string;
  axes: Axes;
  gates: Gates;
  status: "target" | "watchlist";
  domain: string;
};

export type IdentityEvidence =
  | "linkedin_match"
  | "domain_full_name"
  | "company_level"
  | "pattern_guess"
  | "none";

export type Contact = {
  id: number;
  company_id: number | null;
  full_name: string;
  title: string | null;
  linkedin_url: string | null;
  email: string | null;
  email_evidence: IdentityEvidence;
  email_confidence: "verified" | "probable" | "quarantined" | "unverified" | "none";
  email_source: string | null;
  status: string;
  priority: number;
  vertical: string | null;
};

export type ResearchItem = {
  id: number;
  title: string;
  numbers: string[];
  verified: boolean;
  source_note: string;
};

// ---------------------------------------------------------------- outreach

export type Account = {
  id: number;
  email: string;
  domain: string;
  provider: "m365" | "google_workspace" | "gmail_personal";
  role: "cold" | "minimal" | "support";
  enabled: boolean;
  dkim_state: "live" | "missing";
  dmarc_state: string; // "p=none" | "p=quarantine" | "missing" ...
  dns_checked_on: string | null;
  warmup_required: boolean;
  warmup_days: number;
  warmup_started_on: string | null;
  ramp_started_on: string | null;
  connected: boolean; // has stored mailbox credentials (mocked here)
  notes: string;
};

export type ScheduleRow = { account_id: number; day_index: number; value: number };

export type LintBlock = {
  code: string;
  message: string;
  severity: "critical" | "high" | "medium";
  accepted?: boolean;
  numbers?: string[];
};

export type Scorecard = {
  words: number;
  reading_grade: number;
  spam_hits: string[];
  cta_type: "time_ask" | "intro_ask" | "interest_ask" | "none";
  personalization: number;
  personalization_hits: string[];
  similarity: number;
  similar_to: number | null;
  unsourced_numbers: string[];
  blocks: LintBlock[];
  overridden: LintBlock[];
  warnings: string[];
  passes: boolean;
  grade_label: "blocked" | "accepted" | "clean" | "review";
};

export type DraftState =
  | "generated" | "linted" | "flagged" | "in_review" | "snoozed"
  | "approved" | "placed" | "sent" | "rejected" | "expired";

export type Draft = {
  id: number;
  contact_id: number;
  account_id: number | null;
  touch: number;
  variant: string | null;
  subject: string;
  body: string;
  state: DraftState;
  scorecard: Scorecard | null;
  provider_msg_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EventRow = {
  id: number;
  ts: string;
  kind: string;
  entity_type: string | null;
  entity_id: number | null;
  summary: string;
};
