// The quota engine. Code decides volume: an account's daily cap is zero
// until every condition that makes sending safe is true, and it drops back to
// zero on its own when one stops being true.
import type { Account, ScheduleRow } from "../types.ts";
import { daysBetween } from "../util/dates.ts";

// Highest day_index <= day wins.
export function valueForDay(schedule: readonly ScheduleRow[], accountId: number, day: number): number {
  let best: ScheduleRow | null = null;
  for (const r of schedule) {
    if (r.account_id !== accountId || r.day_index > day) continue;
    if (!best || r.day_index > best.day_index) best = r;
  }
  return best ? best.value : 0;
}

export type WarmupState = {
  required: boolean;
  complete: boolean;
  day: number | null;
  target: number;
  not_started?: boolean;
  days_left?: number;
};

export function warmupState(a: Account, warmupSchedule: readonly ScheduleRow[], today: string): WarmupState {
  if (!a.warmup_required) return { required: false, complete: true, day: null, target: 0 };
  const day = daysBetween(a.warmup_started_on, today);
  if (day === null) return { required: true, complete: false, day: null, target: 0, not_started: true };
  const complete = day >= a.warmup_days;
  const target = complete ? 0 : valueForDay(warmupSchedule, a.id, day);
  return { required: true, complete, day, target, days_left: Math.max(0, a.warmup_days - day) };
}

export function dnsLive(a: Pick<Account, "dkim_state" | "dmarc_state">): boolean {
  return a.dkim_state === "live" && !!a.dmarc_state && a.dmarc_state !== "missing";
}

// Cold-send cap for this account today. Zero for support accounts, for any
// account whose DNS is not live, for any account still in warmup, and for
// accounts whose ramp has not been started. An un-warmed domain physically
// cannot be given work.
export function dailyCap(
  a: Account,
  warmupSchedule: readonly ScheduleRow[],
  rampSchedule: readonly ScheduleRow[],
  today: string,
): number {
  if (!a.enabled || a.role === "support") return 0;
  if (!dnsLive(a)) return 0;
  const ws = warmupState(a, warmupSchedule, today);
  if (ws.required && !ws.complete) return 0;
  const day = daysBetween(a.ramp_started_on, today);
  if (day === null || day < 0) return 0;
  return valueForDay(rampSchedule, a.id, day);
}

export function remainingQuota(cap: number, draftedToday: number): number {
  return Math.max(0, cap - draftedToday);
}

// Bounce health: over the last 30 logged days, more than 3% bounced on a
// sample of at least 20 sends pauses the account (enabled = false), which
// sets its cap to zero until a person turns it back on.
export const BOUNCE_PAUSE_THRESHOLD = 0.03;
export const BOUNCE_MIN_SAMPLE = 20;

export function accountHealth(
  log: readonly { log_date: string; sent: number; bounced: number }[],
): { sent: number; bounced: number; bounce_rate: number; should_pause: boolean; note: string } {
  const recent = [...log].sort((x, y) => (x.log_date < y.log_date ? 1 : -1)).slice(0, 30);
  const sent = recent.reduce((s, r) => s + r.sent, 0);
  const bounced = recent.reduce((s, r) => s + r.bounced, 0);
  const rate = sent ? bounced / sent : 0;
  const shouldPause = sent >= BOUNCE_MIN_SAMPLE && rate > BOUNCE_PAUSE_THRESHOLD;
  return {
    sent,
    bounced,
    bounce_rate: Math.round(rate * 10000) / 10000,
    should_pause: shouldPause,
    note: shouldPause
      ? `bounce rate ${(rate * 100).toFixed(1)}% over ${sent} sends exceeds the ${BOUNCE_PAUSE_THRESHOLD * 100}% threshold; pause this account`
      : "",
  };
}
