// The sequencer: plain code, no model. It decides who gets a draft, when, and
// from which account. Deterministic on purpose: quota math, account rotation
// and per-company pacing must never depend on model judgment.
import type { Account, Contact, Draft } from "../types.ts";
import { nyDateOf } from "../util/dates.ts";

export const STAGGER_PER_COMPANY_PER_WEEK = 2;
export const VARIANTS = ["A", "B", "C", "D", "E"] as const;
const LIVE_DRAFT_EXCLUDED = new Set(["rejected", "expired"]);
const PENDING = new Set(["generated", "linted", "flagged", "in_review", "snoozed"]);

export type Slot = { account: Account; remaining: number };

// Contacts that may receive a first touch: an identity-checked address, not
// suppressed, no draft already in flight. Best priority first.
export function eligibleContacts(
  contacts: readonly Contact[],
  drafts: readonly Draft[],
  isSuppressed: (emailKey: string) => boolean,
  companyName: (id: number | null) => string,
): Contact[] {
  const inFlight = new Set(drafts.filter((d) => !LIVE_DRAFT_EXCLUDED.has(d.state)).map((d) => d.contact_id));
  return contacts
    .filter((c) =>
      !!c.email &&
      (c.status === "new" || c.status === "researched") &&
      (c.email_confidence === "verified" || c.email_confidence === "probable") &&
      !isSuppressed(c.email.toLowerCase()) &&
      !inFlight.has(c.id))
    .sort((a, b) => a.priority - b.priority || companyName(a.company_id).localeCompare(companyName(b.company_id)) || a.id - b.id);
}

// Even rotation across the five copy variants, so each gets a fair first read.
export function variantCounts(drafts: readonly Draft[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(VARIANTS.map((v) => [v, 0]));
  for (const d of drafts) if (d.touch === 1 && d.variant && d.variant in counts) counts[d.variant]++;
  return counts;
}

export function assignVariant(counts: Record<string, number>): string {
  return VARIANTS.reduce((best, v) => (counts[v] < counts[best] ? v : best), VARIANTS[0] as string);
}

export function companyTouchesThisWeek(
  companyId: number | null,
  drafts: readonly Draft[],
  contactsById: ReadonlyMap<number, Contact>,
  sinceISO: string,
): number {
  const people = new Set<number>();
  for (const d of drafts) {
    if (d.touch !== 1 || LIVE_DRAFT_EXCLUDED.has(d.state) || nyDateOf(d.created_at) < sinceISO) continue;
    if (contactsById.get(d.contact_id)?.company_id === companyId) people.add(d.contact_id);
  }
  return people.size;
}

// Drafts created today and still awaiting review claim their quota slot at
// drafting time; otherwise every re-run of the sequencer would mint another
// cap-sized batch.
export function pendingToday(drafts: readonly Draft[], accountId: number, today: string): number {
  return drafts.filter((d) => d.account_id === accountId && nyDateOf(d.created_at) === today && PENDING.has(d.state)).length;
}

export type Plan = { contact: Contact; account: Account; variant: string }[];

export function planFirstTouches(args: {
  slots: Slot[];
  eligible: readonly Contact[];
  drafts: readonly Draft[];
  contactsById: ReadonlyMap<number, Contact>;
  weekAgo: string;
}): { plan: Plan; skippedStagger: number } {
  const plan: Plan = [];
  let skippedStagger = 0;
  const seen = new Map<number | null, number>();
  const slots = args.slots.map((s) => ({ ...s }));
  const counts = variantCounts(args.drafts);
  for (const c of args.eligible) {
    const slot = slots.find((s) => s.remaining > 0);
    if (!slot) break;
    let used = seen.get(c.company_id);
    if (used === undefined) used = companyTouchesThisWeek(c.company_id, args.drafts, args.contactsById, args.weekAgo);
    if (used >= STAGGER_PER_COMPANY_PER_WEEK) {
      skippedStagger++;
      continue;
    }
    const variant = assignVariant(counts);
    counts[variant]++; // the next pick rotates
    plan.push({ contact: c, account: slot.account, variant });
    seen.set(c.company_id, used + 1);
    slot.remaining--;
  }
  return { plan, skippedStagger };
}
