// Jobs that the live system runs on a schedule, exposed here as buttons-worth
// of API so the sample can be driven by hand.
//   POST /api/sequencer/run {dryRun?}   write first-touch drafts within quota
//   POST /api/warmup/run {dryRun?}      one warmup run against the mock transport
import { requireAuth, requireCronOrAuth } from "../auth.ts";
import { dailyCap, remainingQuota } from "../outreach/quota.ts";
import { eligibleContacts, pendingToday, planFirstTouches } from "../outreach/sequencer.ts";
import { TemplateWriter } from "../outreach/writer.ts";
import { lintFor, logEvent, store } from "../store/memory.ts";
import { addDays, todayNY } from "../util/dates.ts";
import { runWarmup } from "../warmup/engine.ts";
import { json, readJson, type Handler } from "./http.ts";

export const sequencer: Handler = async (req) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const { dryRun } = await readJson(req);
  const s = store();
  const today = todayNY();

  const slots = s.accounts
    .filter((a) => a.enabled && (a.role === "cold" || a.role === "minimal"))
    .map((a) => {
      const cap = dailyCap(a, s.warmupSchedule, s.rampSchedule, today);
      const drafted = s.rampLog.find((r) => r.account_id === a.id && r.log_date === today)?.drafted ?? 0;
      return { account: a, cap, remaining: Math.max(0, remainingQuota(cap, drafted) - pendingToday(s.drafts, a.id, today)) };
    });
  const withQuota = slots.filter((x) => x.remaining > 0);
  const caps = Object.fromEntries(slots.map((x) => [x.account.email, { cap: x.cap, remaining: x.remaining }]));
  if (!withQuota.length) {
    if (!dryRun) logEvent(s, "sequencer", "Daily run: no account has quota today (warmup incomplete, DNS held, or ramp not started)");
    return json({ ok: true, drafted: 0, caps, reason: "no account has quota today" });
  }

  const coName = (id: number | null) => s.companies.find((c) => c.id === id)?.name ?? "";
  const eligible = eligibleContacts(s.contacts, s.drafts, (k) => s.suppression.has(k), coName)
    .filter((c) => s.companies.find((co) => co.id === c.company_id)?.status === "target");
  const { plan, skippedStagger } = planFirstTouches({
    slots: withQuota, eligible, drafts: s.drafts,
    contactsById: new Map(s.contacts.map((c) => [c.id, c])), weekAgo: addDays(today, -7),
  });
  if (dryRun) return json({ ok: true, dryRun: true, would_draft: plan.length, skipped_stagger: skippedStagger, caps });

  const writer = new TemplateWriter();
  for (const p of plan) {
    const company = s.companies.find((c) => c.id === p.contact.company_id) ?? null;
    const { subject, body } = writer.write({ contact: p.contact, company, variant: p.variant, touch: 1 });
    const now = new Date().toISOString();
    const d = { id: ++s.seq.draft, contact_id: p.contact.id, account_id: p.account.id, touch: 1, variant: p.variant,
      subject, body, state: "generated" as const, scorecard: null, provider_msg_id: null, created_at: now, updated_at: now };
    s.drafts.push(d);
    const card = lintFor(s, d);
    Object.assign(d, { scorecard: card, state: card.blocks.length || card.warnings.length ? "flagged" : "linted" });
  }
  logEvent(s, "sequencer", `Daily run: ${plan.length} first touches drafted for review, ${skippedStagger} held back by the per-company stagger`);
  return json({ ok: true, drafted: plan.length, skipped_stagger: skippedStagger, caps });
};

export const warmup: Handler = async (req) => {
  const denied = requireCronOrAuth(req);
  if (denied) return denied;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const { dryRun } = await readJson(req);
  const report = await runWarmup(store(), { dryRun: !!dryRun, minAgeMs: 0 });
  return json(report, report.ok ? 200 : 409);
};
