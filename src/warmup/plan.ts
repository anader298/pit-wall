// Mailbox warm-up: the program's own accounts write short notes to each other
// so inbox providers learn to trust them before any outreach starts.
//
// Rules the engine enforces:
//   - recipients come only from the owned-mailbox allowlist, and only from
//     accounts with a working connection (a mailbox that cannot reply is a
//     dead drop and teaches providers our mail goes unread)
//   - an account does not warm until DKIM and DMARC are live on its domain
//   - targets are ceilings, not quotas; a short run is fine
//   - a finished account drops to a maintenance trickle instead of going
//     quiet, because reputation decays without ongoing signal
//   - weekends taper instead of stopping; two silent days in seven is itself
//     a pattern
import { isWeekend } from "../util/dates.ts";

export const MAX_SENDS_PER_RUN = 40;
export const MAINTENANCE_SHARE = 0.4;
export const MAINTENANCE_MIN_SENDS = 4;
export const WEEKEND_SHARE = 0.35;
export const REPLY_PROBABILITY = 0.4;
export const DEEP_REPLY_PROBABILITY = 0.25;
export const MAX_THREAD_DEPTH = 3;
export const MAX_REPLIES_PER_ACCOUNT = 3;

export type Rng = () => number;

// Today's target after the maintenance and weekend adjustments.
export function adjustedTarget(scheduled: number, inMaintenance: boolean, today: string): number {
  let t = scheduled;
  if (inMaintenance) t = Math.max(MAINTENANCE_MIN_SENDS, Math.round(t * MAINTENANCE_SHARE));
  if (isWeekend(today) && t > 0) t = Math.max(1, Math.round(t * WEEKEND_SHARE));
  return t;
}

// Each run sends a random share of what the day still owes, so volume spreads
// across the scheduled runs instead of leaving at the same clock minute.
export function sendsThisRun(remaining: number, alreadySentThisRun: number, rng: Rng): number {
  if (remaining <= 0) return 0;
  const n = Math.min(remaining, 1 + Math.floor(rng() * remaining));
  return Math.max(0, Math.min(n, MAX_SENDS_PER_RUN - alreadySentThisRun));
}

// Pairs that earn little reputation (same tenant, or a domain with known
// health issues) stay in rotation but are pushed to the back most of the time.
export function pickRecipients(
  self: string,
  n: number,
  pool: readonly string[],
  isPenalized: (self: string, other: string) => boolean,
  rng: Rng,
): string[] {
  const candidates = pool.filter((a) => a !== self);
  if (!candidates.length) return [];
  const out: string[] = [];
  while (out.length < n) {
    const cycle = shuffle([...candidates], rng);
    for (const c of [...cycle]) {
      if (isPenalized(self, c) && rng() < 0.8) {
        cycle.splice(cycle.indexOf(c), 1);
        cycle.push(c);
      }
    }
    for (const r of cycle) {
      if (out.length >= n) break;
      out.push(r);
    }
  }
  return out;
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Short, plain notes. No links, no trigger words, slot variables so no two
// are identical.
const SUBJECTS = [
  "Travel notes for {weekday}",
  "Quick one before {weekday}",
  "Receipts from the {month} trip",
  "Schedule check for next week",
  "Parking for {weekday}",
  "Hotel block, {month}",
];
const BODIES = [
  "Can you check the hotel block for {month}? I think we are {num} rooms short.",
  "Moved the {weekday} call to {time}. Same dial-in as last time.",
  "Found the receipts from the trip. Sending the summary later today.",
  "The parking passes came through. {num} in total, I will hand them out {weekday}.",
  "Dinner on {weekday} is confirmed for {time}. Let me know if the count changes.",
];
const REPLIES = ["Got it, thanks.", "Sounds good.", "Works for me.", "Perfect, see you then.", "Noted. Will confirm tomorrow."];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function composeWarmupMail(rng: Rng, avoid?: ReadonlySet<string>): { subject: string; body: string } {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rng() * a.length)];
  for (let attempt = 0; ; attempt++) {
    const fill = (s: string) =>
      s.replaceAll("{weekday}", pick(WEEKDAYS))
        .replaceAll("{month}", pick(MONTHS))
        .replaceAll("{num}", String(3 + Math.floor(rng() * 12)))
        .replaceAll("{time}", `${1 + Math.floor(rng() * 5)}:${rng() < 0.5 ? "00" : "30"}`);
    const subject = fill(pick(SUBJECTS));
    if (attempt < 5 && avoid?.has(subject.toLowerCase())) continue;
    return { subject, body: fill(pick(BODIES)) };
  }
}

export function composeReply(rng: Rng): string {
  return REPLIES[Math.floor(rng() * REPLIES.length)];
}
