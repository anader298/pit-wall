// The number guardrail. A figure in an outbound email must exist in a
// verified research item, or the draft is blocked.
import type { ResearchItem } from "../types.ts";

// Numbers that read as a claim: magnitude suffixes, thousands separators,
// percentages, currency, four or more digits. Bare small integers
// ("15 minutes", "one partner") are not claims and are ignored.
const NUMBER_RE =
  /(?<![\w.])(?:~|about\s+|approx\.?\s+)?(\$?\d[\d,]*(?:\.\d+)?\s*(?:[KkMmBb]\b|%|,\d{3})|\$\d[\d,.]*|\d{4,})/g;

export function normalizeNumber(tok: string): string {
  return tok.replace(/[~\s]/g, "").toUpperCase().replace(/\.$/, "");
}

export function extractNumbers(text: string): string[] {
  return [...String(text || "").matchAll(NUMBER_RE)].map((m) => m[1]);
}

// Every number quotable in an email, from verified items only.
export function allowedNumbers(items: readonly ResearchItem[]): Set<string> {
  const out = new Set<string>();
  for (const item of items) {
    if (!item.verified) continue;
    for (const tok of item.numbers) {
      const n = normalizeNumber(tok);
      out.add(n);
      // 350K and 350,000 should both satisfy a claim of either.
      out.add(n.replace(/,/g, ""));
    }
  }
  return out;
}

export function unsourcedNumbers(text: string, allowed: ReadonlySet<string>): string[] {
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const tok of extractNumbers(text)) {
    const norm = normalizeNumber(tok);
    if (allowed.has(norm) || allowed.has(norm.replace(/,/g, "")) || seen.has(norm)) continue;
    seen.add(norm);
    bad.push(tok);
  }
  return bad;
}
