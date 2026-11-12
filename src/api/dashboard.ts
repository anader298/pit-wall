// GET /api/dashboard: everything the home page needs in one round trip.
import { requireAuth } from "../auth.ts";
import { dailyCap, remainingQuota, warmupState } from "../outreach/quota.ts";
import { REVIEW_STATES } from "../outreach/approve.ts";
import { adjustedTarget } from "../warmup/plan.ts";
import { store } from "../store/memory.ts";
import { valueForDay } from "../outreach/quota.ts";
import { todayNY } from "../util/dates.ts";
import { json, type Handler } from "./http.ts";

export const dashboard: Handler = async (req) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  const s = store();
  const today = todayNY();

  const byStatus: Record<string, number> = {};
  for (const c of s.contacts) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  const sendable = s.contacts.filter((c) =>
    c.email && c.email_confidence === "verified" && c.status === "new" && !s.suppression.has(c.email.toLowerCase())).length;

  const accounts = s.accounts.map((a) => {
    const ws = warmupState(a, s.warmupSchedule, today);
    const log = s.warmupLog.find((l) => l.account_id === a.id && l.log_date === today);
    const cap = dailyCap(a, s.warmupSchedule, s.rampSchedule, today);
    const drafted = s.rampLog.find((r) => r.account_id === a.id && r.log_date === today)?.drafted ?? 0;
    const target = ws.required && ws.day !== null
      ? adjustedTarget(valueForDay(s.warmupSchedule, a.id, ws.day), ws.complete, today) : 0;
    return {
      id: a.id, email: a.email, domain: a.domain, provider: a.provider, role: a.role, enabled: a.enabled,
      connected: a.connected, method: a.connected ? (a.provider === "m365" ? "graph" : "imap") : null,
      dkim_state: a.dkim_state, dmarc_state: a.dmarc_state, dns_checked_on: a.dns_checked_on, notes: a.notes,
      warmup: {
        required: ws.required, days: a.warmup_days, started_on: a.warmup_started_on, day: ws.day,
        not_started: !!ws.not_started, complete: ws.complete, target_today: target,
        sends_today: log?.sends ?? 0, replies_today: log?.replies_received ?? 0,
      },
      ramp_started_on: a.ramp_started_on,
      daily_cap: cap,
      remaining_today: remainingQuota(cap, drafted),
      warm_idle: ws.required && ws.complete && !a.ramp_started_on,
      no_creds: !a.connected,
    };
  });

  const events = [...s.events].reverse().slice(0, 30);
  const warmupLog = s.warmupLog
    .map((w) => ({ ...w, account_email: s.accounts.find((a) => a.id === w.account_id)?.email ?? "" }))
    .sort((a, b) => (a.log_date < b.log_date ? 1 : a.log_date > b.log_date ? -1 : a.account_email.localeCompare(b.account_email)))
    .slice(0, 40);

  return json({
    ok: true,
    today,
    totals: {
      contacts: s.contacts.length,
      companies: s.companies.length,
      sendable,
      drafts_waiting: s.drafts.filter((d) => REVIEW_STATES.includes(d.state)).length,
      by_status: byStatus,
    },
    accounts,
    warm_idle: accounts.filter((a) => a.warm_idle).map((a) => a.email),
    web_owns_graph_tokens: false,
    events,
    warmup_log: warmupLog,
    warmup_messages: [...s.warmupMessages].reverse().slice(0, 20).map((m) => ({
      from_email: m.from_email, to_email: m.to_email, subject: m.subject, is_reply: m.is_reply ? 1 : 0, sent_at: m.sent_at,
    })),
  });
};
