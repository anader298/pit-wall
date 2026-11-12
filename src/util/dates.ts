// Dates are business dates in America/New_York, as YYYY-MM-DD strings.

export function todayNY(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function utcMidnight(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).slice(0, 10));
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// Whole days from start to on. Day 0 is the start date itself. Null when
// start is missing or malformed.
export function daysBetween(start: string | null, on: string): number | null {
  if (!start) return null;
  const a = utcMidnight(start);
  const b = utcMidnight(on);
  if (a === null || b === null) return null;
  return Math.floor((b - a) / 86400000);
}

export function addDays(ymd: string, n: number): string {
  const t = utcMidnight(ymd);
  if (t === null) throw new Error(`bad date ${ymd}`);
  return new Date(t + n * 86400000).toISOString().slice(0, 10);
}

// Weekend check on a NY business date. Noon UTC keeps the weekday stable
// regardless of the DST offset.
export function isWeekend(ymd: string): boolean {
  const d = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

// NY business date of an ISO timestamp. created_at is stored in UTC, so a
// plain slice(0, 10) is a day ahead every evening in New York.
export function nyDateOf(iso: string): string {
  return todayNY(new Date(iso));
}
