// In-memory store, seeded from data/sample. The live system keeps the same
// records in Postgres (db/schema.sql) behind the same handler code; swapping
// the store is the only change between this repo and a database-backed
// deployment.
//
// State lives for the life of the process. On Netlify each function instance
// has its own copy, so the hosted demo resets often. That is fine for sample
// data and is the reason nothing here pretends to be durable.
import profilesFile from "../../data/sample/profiles.json" with { type: "json" };
import dealsFile from "../../data/sample/deals-model.json" with { type: "json" };
import targetsFile from "../../data/sample/targets.json" with { type: "json" };
import outreachFile from "../../data/sample/outreach.json" with { type: "json" };
import type {
  Account, Business, Company, Contact, DealModel, Draft, EventRow, Partner, Profile,
  ResearchItem, ScheduleRow,
} from "../types.ts";
import { MockDraftPlacer, MockWarmupTransport } from "../mail/mailbox.ts";
import { allowedNumbers } from "../outreach/numbers.ts";
import { scoreDraft } from "../outreach/lint.ts";
import { addDays, todayNY } from "../util/dates.ts";

export type WarmupMessage = {
  id: number; from_email: string; to_email: string; subject: string; body: string;
  msg_id: string | null; is_reply: boolean; replied: boolean; opened: boolean; sent_at: string;
};

export type Store = {
  industries: Record<string, string>;
  businesses: Business[];
  profiles: Profile[];
  partners: Partner[];
  model: DealModel;
  companies: Company[];
  contacts: Contact[];
  research: ResearchItem[];
  accounts: Account[];
  warmupSchedule: ScheduleRow[];
  rampSchedule: ScheduleRow[];
  rampLog: { account_id: number; log_date: string; drafted: number; sent: number; bounced: number }[];
  warmupLog: { account_id: number; log_date: string; sends: number; replies_received: number }[];
  warmupMessages: WarmupMessage[];
  drafts: Draft[];
  rejections: { draft_id: number; reason: string; note: string; created_at: string }[];
  suppression: Map<string, string>;
  events: EventRow[];
  settings: { banned_names: string[]; warmup_allowlist: string[] };
  mailbox: MockDraftPlacer;
  warmupTransport: MockWarmupTransport;
  warmupLock: boolean;
  seq: { draft: number; event: number; warmup: number };
};

let current: Store | null = null;

export function store(): Store {
  if (!current) current = seed();
  return current;
}

export function resetStore(): Store {
  current = seed();
  return current;
}

export function logEvent(s: Store, kind: string, summary: string, entityType?: string, entityId?: number): void {
  s.events.push({
    id: ++s.seq.event, ts: new Date().toISOString(), kind,
    entity_type: entityType ?? null, entity_id: entityId ?? null, summary,
  });
}

export function lintFor(s: Store, d: Pick<Draft, "id" | "contact_id" | "subject" | "body" | "variant" | "touch">) {
  const contact = s.contacts.find((c) => c.id === d.contact_id)!;
  const company = s.companies.find((c) => c.id === contact.company_id) ?? null;
  const recent = s.drafts
    .filter((x) => ["approved", "placed", "sent"].includes(x.state))
    .map((x) => ({ id: x.id, body: x.body }));
  return scoreDraft({
    subject: d.subject, body: d.body, contact, companyName: company?.name ?? null,
    variant: d.variant, touch: d.touch, draftId: d.id,
    bannedNames: s.settings.banned_names, allowedNumbers: allowedNumbers(s.research), recentBodies: recent,
  });
}

function seed(): Store {
  const today = todayNY();
  const off = (n: number | null) => (n === null ? null : addDays(today, n));
  const o = outreachFile as any;

  const accounts: Account[] = o.accounts.map((a: any) => ({
    ...a,
    warmup_started_on: off(a.warmup_started_offset),
    ramp_started_on: off(a.ramp_started_offset),
    dns_checked_on: today,
  }));

  const s: Store = {
    industries: (profilesFile as any).industries,
    businesses: (profilesFile as any).businesses,
    profiles: (profilesFile as any).profiles,
    partners: (dealsFile as any).partners,
    model: (dealsFile as any).model,
    companies: (targetsFile as any).companies,
    contacts: (targetsFile as any).contacts,
    research: (targetsFile as any).research,
    accounts,
    warmupSchedule: o.warmup_schedule,
    rampSchedule: o.ramp_schedule,
    rampLog: [],
    warmupLog: [],
    warmupMessages: [],
    drafts: [],
    rejections: [],
    suppression: new Map(o.suppression.map((x: any) => [x.email_key, x.reason])),
    events: [],
    settings: o.settings,
    mailbox: new MockDraftPlacer(),
    warmupTransport: new MockWarmupTransport(o.settings.warmup_allowlist),
    warmupLock: false,
    seq: { draft: 0, event: 0, warmup: 0 },
  };

  // A little history so the dashboard has something to show: the ramping
  // account drafted a few a day, warmup ran between owned mailboxes.
  for (let d = -6; d <= -1; d++) {
    const date = addDays(today, d);
    s.rampLog.push({ account_id: 1, log_date: date, drafted: 3 + ((d + 9) % 3), sent: 3, bounced: 0 });
    for (const a of [1, 2]) s.warmupLog.push({ account_id: a, log_date: date, sends: 4 + ((a + d + 8) % 4), replies_received: 2 });
  }

  for (const raw of o.drafts) {
    const created = new Date(Date.now() + raw.created_offset * 86400000).toISOString();
    const d: Draft = {
      id: ++s.seq.draft, contact_id: raw.contact_id, account_id: raw.account_id, touch: 1,
      variant: raw.variant, subject: raw.subject, body: raw.body, state: raw.state,
      scorecard: null, provider_msg_id: null, created_at: created, updated_at: created,
    };
    s.drafts.push(d);
  }
  // Score after all drafts exist so similarity sees the placed ones. Review
  // states get their state from the card, as the live linter does.
  for (const d of s.drafts) {
    d.scorecard = lintFor(s, d);
    if (["generated", "linted", "flagged"].includes(d.state)) {
      d.state = d.scorecard.blocks.length || d.scorecard.warnings.length ? "flagged" : "linted";
    }
    if (d.state === "placed") {
      d.provider_msg_id = `<pitwall-draft${d.id}-sample@program-one.example>`;
      const c = s.contacts.find((x) => x.id === d.contact_id);
      if (c) c.status = "drafted";
    }
    if (d.state === "rejected") s.rejections.push({ draft_id: d.id, reason: "Wrong contact", note: "sample", created_at: d.created_at });
  }

  logEvent(s, "sequencer", "Sample data loaded: drafts written for review, none placed today");
  logEvent(s, "warmup", "WARMUP HELD: DNS not live for program-three.example (dkim=missing, dmarc=missing)", "account", 3);
  return s;
}
