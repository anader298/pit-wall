// One warmup run: the send leg, then the engagement leg (opens and replies).
// In production the send leg runs on several irregular crons a day and the
// engagement leg on its own background cron, because opening mail over IMAP
// is slow and starved the sends when they shared a time budget.
import type { Store } from "../store/memory.ts";
import { logEvent } from "../store/memory.ts";
import { dnsLive, valueForDay } from "../outreach/quota.ts";
import { daysBetween, todayNY } from "../util/dates.ts";
import {
  adjustedTarget, composeReply, composeWarmupMail, DEEP_REPLY_PROBABILITY, MAX_REPLIES_PER_ACCOUNT,
  MAX_SENDS_PER_RUN, MAX_THREAD_DEPTH, pickRecipients, REPLY_PROBABILITY, sendsThisRun, type Rng,
} from "./plan.ts";

export type WarmupReport = {
  ok: boolean;
  date: string;
  dryRun: boolean;
  skipped?: string;
  totalSent: number;
  totalReplies: number;
  totalOpened: number;
  accounts: { email: string; day: number | null; target: number; sent: number; held?: string; skipped?: string; planned: { to: string; subject: string }[] }[];
};

const stripRe = (s: string) => s.replace(/^re:\s*/i, "").trim().toLowerCase();

export async function runWarmup(s: Store, opts: { dryRun: boolean; rng?: Rng; today?: string; minAgeMs?: number }): Promise<WarmupReport> {
  const rng = opts.rng ?? Math.random;
  const today = opts.today ?? todayNY();
  const minAge = opts.minAgeMs ?? 30 * 60 * 1000;
  const report: WarmupReport = { ok: true, date: today, dryRun: opts.dryRun, totalSent: 0, totalReplies: 0, totalOpened: 0, accounts: [] };

  // Single flight. The live system holds a Postgres advisory lock.
  if (s.warmupLock) return { ...report, ok: false, skipped: "another warmup run holds the lock" };
  s.warmupLock = true;
  try {
    const allow = s.settings.warmup_allowlist.map((a) => a.toLowerCase());
    const pool = s.accounts.filter((a) => a.connected && allow.includes(a.email.toLowerCase())).map((a) => a.email.toLowerCase());
    const sameTenant = (x: string, y: string) => x.split("@")[1] === y.split("@")[1];

    // ------------------------------------------------------------ send leg
    for (const a of s.accounts.filter((x) => x.warmup_required && x.enabled)) {
      const email = a.email.toLowerCase();
      const entry: WarmupReport["accounts"][number] = { email, day: null, target: 0, sent: 0, planned: [] };
      report.accounts.push(entry);
      if (!allow.includes(email)) { entry.skipped = "not in warmup allowlist"; continue; }
      if (!a.connected) { entry.skipped = "no mailbox connection"; continue; }
      // DNS gate: an account must not warm before DKIM and DMARC are live.
      if (!dnsLive(a)) { entry.held = `DNS not live (dkim=${a.dkim_state}, dmarc=${a.dmarc_state})`; continue; }
      if (!a.warmup_started_on) {
        if (!opts.dryRun) {
          a.warmup_started_on = today;
          logEvent(s, "warmup", `Warmup started for ${email} (day 0 of ${a.warmup_days})`, "account", a.id);
        }
      }
      const day = daysBetween(a.warmup_started_on ?? today, today) ?? 0;
      entry.day = day;
      const target = adjustedTarget(valueForDay(s.warmupSchedule, a.id, day), day >= a.warmup_days, today);
      const done = s.warmupLog.find((l) => l.account_id === a.id && l.log_date === today)?.sends ?? 0;
      entry.target = target;
      const n = sendsThisRun(target - done, report.totalSent + report.totalReplies, rng);
      if (n <= 0) continue;
      const recent = new Set(s.warmupMessages.filter((m) => m.from_email === email && !m.is_reply).map((m) => m.subject.toLowerCase()));
      for (const to of pickRecipients(email, n, pool, sameTenant, rng)) {
        if (report.totalSent + report.totalReplies >= MAX_SENDS_PER_RUN) break;
        const { subject, body } = composeWarmupMail(rng, recent);
        recent.add(subject.toLowerCase());
        if (opts.dryRun) { entry.planned.push({ to, subject }); continue; }
        const res = await s.warmupTransport.send(email, to, subject, body);
        if (!res.ok) { logEvent(s, "warmup", `Warmup send FAILED: ${email} to ${to}: ${res.error}`, "account", a.id); continue; }
        s.warmupMessages.push({ id: ++s.seq.warmup, from_email: email, to_email: to, subject, body, msg_id: res.msgId, is_reply: false, replied: false, opened: false, sent_at: new Date().toISOString() });
        bump(s, a.id, today, "sends");
        entry.sent++;
        report.totalSent++;
      }
      if (entry.sent) logEvent(s, "warmup", `Warmup: ${email} sent ${entry.sent} of ${target} today`, "account", a.id);
    }

    // ------------------------------------------------------ engagement leg
    const now = Date.now();
    for (const self of pool) {
      const inbox = s.warmupMessages.filter((m) =>
        m.to_email === self && (!m.opened || !m.replied) &&
        now - Date.parse(m.sent_at) >= minAge && now - Date.parse(m.sent_at) < 48 * 3600 * 1000);
      const toOpen = inbox.filter((m) => !m.opened && m.msg_id);
      if (toOpen.length && !opts.dryRun) {
        const marked = new Set(await s.warmupTransport.markRead(self, toOpen.map((m) => m.msg_id!)));
        for (const m of toOpen) if (marked.has(m.msg_id!)) { m.opened = true; report.totalOpened++; }
      }
      let replies = 0;
      for (const m of inbox) {
        if (m.replied || replies >= MAX_REPLIES_PER_ACCOUNT) continue;
        const depth = s.warmupMessages.filter((x) => stripRe(x.subject) === stripRe(m.subject) &&
          ((x.from_email === self && x.to_email === m.from_email) || (x.from_email === m.from_email && x.to_email === self))).length;
        if (depth >= MAX_THREAD_DEPTH) continue;
        if (rng() >= (m.is_reply ? DEEP_REPLY_PROBABILITY : REPLY_PROBABILITY)) continue;
        const subject = /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`;
        replies++;
        if (opts.dryRun) continue;
        const res = await s.warmupTransport.send(self, m.from_email, subject, composeReply(rng), m.msg_id ?? undefined);
        if (!res.ok) continue;
        m.replied = true;
        s.warmupMessages.push({ id: ++s.seq.warmup, from_email: self, to_email: m.from_email, subject, body: "", msg_id: res.msgId, is_reply: true, replied: false, opened: false, sent_at: new Date().toISOString() });
        const acct = s.accounts.find((x) => x.email.toLowerCase() === m.from_email);
        if (acct) bump(s, acct.id, today, "replies_received");
        report.totalReplies++;
      }
    }
    return report;
  } finally {
    s.warmupLock = false;
  }
}

function bump(s: Store, accountId: number, date: string, field: "sends" | "replies_received") {
  let row = s.warmupLog.find((l) => l.account_id === accountId && l.log_date === date);
  if (!row) { row = { account_id: accountId, log_date: date, sends: 0, replies_received: 0 }; s.warmupLog.push(row); }
  row[field]++;
}
