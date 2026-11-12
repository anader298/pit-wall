// The draft scorecard. Computed in code, never by a model: a model grading
// its own output is not a guardrail.
//
// Blocks carry a code and a severity. Critical blocks (wrong name, a team or
// driver name, unresolved merge tokens) can never be accepted around. Any
// other block can be accepted individually, which records an override
// instead of silently passing. Warnings never block.
import type { LintBlock, Scorecard } from "../types.ts";
import { unsourcedNumbers } from "./numbers.ts";

const SPAM_WORDS = [
  "free", "guarantee", "guaranteed", "$$$", "act now", "limited time", "100%",
  "risk-free", "no obligation", "click here", "buy", "order now", "cash", "cheap",
  "discount", "offer", "winner", "congratulations", "urgent",
];

// The offer is a partnership and an introduction, never a sponsorship.
export const BANNED_WORD = "sponsorship";

// A calendar ask in a first touch. Only variant D may ask for time cold.
const TIME_ASK_RE = new RegExp(
  "\\b(?:worth\\s+\\d+\\s*(?:min|minutes)|\\d+\\s*minutes\\??|grab\\s+\\d+|" +
    "book\\s+(?:a\\s+)?(?:call|time|slot)|(?:free|available)\\s+(?:this|next)\\s+week|" +
    "put\\s+(?:some\\s+)?time\\s+in)\\b",
  "i",
);
const INTRO_ASK_RE =
  /\b(?:intro(?:duction)?\s+to\s+the\s+team|open\s+to\s+an\s+intro|meet\s+the\s+team|put\s+you\s+in\s+front\s+of\s+the\s+team|want\s+an\s+intro)\b/i;
const LINK_RE = /(https?:\/\/\S+|www\.[\w.-]+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|io|net|org|co)\b)/gi;
const TOKEN_RE = /\{\{\s*\w+\s*\}\}/g;

export const WORD_TARGET: readonly [number, number] = [40, 55];
export const SIMILARITY_THRESHOLD = 0.62;
export const CRITICAL_CODES = new Set(["unresolved_tokens", "team_name", "wrong_name"]);

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[.,!?;:]/g, "");
  if (!w) return 0;
  let n = (w.match(/[aeiouy]+/g) || []).length;
  if (w.endsWith("e") && n > 1) n -= 1;
  return Math.max(1, n);
}

// Flesch-Kincaid grade. Executives skim on phones; aim for 5 to 8.
export function readingGrade(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim());
  const words = text.match(/[A-Za-z']+/g) || [];
  if (!sentences.length || !words.length) return 0;
  const syl = words.reduce((s, w) => s + syllables(w), 0);
  const g = 0.39 * (words.length / sentences.length) + 11.8 * (syl / words.length) - 15.59;
  return Math.round(g * 10) / 10;
}

function ngrams(text: string, n = 4): Set<string> {
  const words = (text || "").toLowerCase().match(/[a-z']+/g) || [];
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

// Highest 4-gram Jaccard against recently placed or sent drafts. Several
// accounts sending near-identical copy is a spam fingerprint.
export function similarity(
  body: string,
  others: readonly { id: number; body: string }[],
  excludeId?: number | null,
): { score: number; id: number | null } {
  const mine = ngrams(body);
  if (!mine.size) return { score: 0, id: null };
  let best = 0;
  let bestId: number | null = null;
  for (const o of others) {
    if (excludeId && o.id === excludeId) continue;
    const theirs = ngrams(o.body);
    if (!theirs.size) continue;
    let inter = 0;
    for (const g of mine) if (theirs.has(g)) inter++;
    const j = inter / (mine.size + theirs.size - inter);
    if (j > best) {
      best = j;
      bestId = o.id;
    }
  }
  return { score: Math.round(best * 1000) / 1000, id: bestId };
}

// Would this read identically to any recipient? Generic drafts get a warning.
export function personalizationDepth(
  body: string,
  contact: { full_name: string; title: string | null },
  companyName: string | null,
): { depth: number; hits: string[] } {
  const hits: string[] = [];
  const low = (body || "").toLowerCase();
  if (companyName && low.includes(companyName.toLowerCase())) hits.push("names the company");
  const first = (contact.full_name || "").split(/\s+/)[0];
  if (first && low.includes(first.toLowerCase())) hits.push("names the person");
  const titleWords = ((contact.title || "").toLowerCase().match(/[a-z]+/g) || []).filter((w) => w.length > 4);
  if (titleWords.some((w) => low.includes(w))) hits.push("references their role");
  const generic = new Set(["series", "race", "team", "partner", "category", "us", "american"]);
  const content = new Set((low.match(/[a-z]+/g) || []).filter((w) => w.length > 5 && !generic.has(w)));
  if (content.size >= 12) hits.push("carries specific detail");
  return { depth: hits.length, hits };
}

// A draft that greets the wrong person is worse than no draft.
export function wrongName(body: string, contact: { full_name: string }): string | null {
  const first = (contact.full_name || "").split(/\s+/)[0];
  if (!first) return null;
  const m = /^\s*(?:Hi |Hello |Dear )?([A-Z][a-z]+)\s*[—,]/.exec(body || "");
  if (m && m[1].toLowerCase() !== first.toLowerCase()) {
    return `greets '${m[1]}' but the contact is '${first}'`;
  }
  return null;
}

export type LintInput = {
  subject: string;
  body: string;
  contact: { full_name: string; title: string | null };
  companyName: string | null;
  variant: string | null;
  touch: number;
  draftId?: number | null;
  bannedNames: readonly string[]; // team and driver names: never in a cold touch
  allowedNumbers: ReadonlySet<string>;
  recentBodies: readonly { id: number; body: string }[];
  accepted?: ReadonlySet<string>;
};

export function scoreDraft(input: LintInput): Scorecard {
  const { subject, body, contact, companyName, variant, touch } = input;
  const all = `${subject} ${body}`;
  const low = (body || "").toLowerCase();
  const words = (body.match(/[\w'&$%-]+/g) || []).length;
  const grade = readingGrade(body || "");

  const spamHits = SPAM_WORDS.filter((w) =>
    new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(low),
  );
  const unsourced = unsourcedNumbers(all, input.allowedNumbers);
  const tokens = all.match(TOKEN_RE) || [];
  const links = body.match(LINK_RE) || [];
  const names = input.bannedNames.filter((n) => all.toLowerCase().includes(n.toLowerCase()));
  const sim = similarity(body, input.recentBodies, input.draftId);
  const pers = personalizationDepth(body, contact, companyName);

  const hasTimeAsk = TIME_ASK_RE.test(body);
  const hasIntroAsk = INTRO_ASK_RE.test(body);
  const ctaType = hasTimeAsk ? "time_ask" : hasIntroAsk ? "intro_ask"
    : body.trimEnd().endsWith("?") ? "interest_ask" : "none";

  const raw: LintBlock[] = [];
  const warnings: string[] = [];
  const block = (code: string, message: string, severity: LintBlock["severity"] = "high", extra = {}) =>
    raw.push({ code, message, severity, ...extra });

  if (tokens.length) {
    block("unresolved_tokens", `unresolved tokens: ${[...new Set(tokens)].sort().join(", ")}`, "critical");
  }
  if (low.includes(BANNED_WORD)) {
    block("banned_word", `contains the banned word "${BANNED_WORD}" (use partnership / partner with)`);
  }
  if (names.length) {
    block("team_name", `names the team or a driver: ${names.join(", ")}; banned before a reply`, "critical");
  }
  if (links.length && touch <= 4) {
    block("link_in_cold", `contains a link (${links[0]}); no links in cold touches`);
  }
  if (unsourced.length) {
    block("unsourced_number", `unsourced number(s): ${unsourced.join(", ")}; not in a verified research item`,
      "high", { numbers: unsourced });
  }
  if (variant && ["A", "B", "C", "E"].includes(variant) && hasTimeAsk && touch === 1) {
    block("calendar_ask", "asks for a calendar slot on a variant that must use an intro ask; only D may ask for time cold", "medium");
  }
  const wrong = wrongName(body, contact);
  if (wrong) block("wrong_name", wrong, "critical");

  if (words < WORD_TARGET[0] || words > WORD_TARGET[1]) {
    const msg = `${words} words, target ${WORD_TARGET[0]}-${WORD_TARGET[1]}`;
    if (words > 90 || words < 15) block("word_count", msg, "medium");
    else warnings.push(msg);
  }
  if (grade > 9) warnings.push(`reading grade ${grade}, aim 5-8`);
  if (spamHits.length) warnings.push(`spam-trigger words: ${spamHits.join(", ")}`);
  if (sim.score >= SIMILARITY_THRESHOLD) {
    block("similarity", `${Math.floor(sim.score * 100)}% similar to draft #${sim.id}; rewrite to avoid a shared fingerprint`, "medium");
  } else if (sim.score >= 0.45) {
    warnings.push(`${Math.floor(sim.score * 100)}% similar to draft #${sim.id}`);
  }
  if (pers.depth <= 1) warnings.push("reads generically; would work for any recipient");
  if (ctaType === "none") warnings.push("no clear call to action");

  // A critical block stays blocking even if an override exists for it.
  const accepted = input.accepted ?? new Set<string>();
  for (const b of raw) b.accepted = accepted.has(b.code) && b.severity !== "critical";
  const blocking = raw.filter((b) => !b.accepted);
  const overridden = raw.filter((b) => b.accepted);

  return {
    words,
    reading_grade: grade,
    spam_hits: spamHits,
    cta_type: ctaType,
    personalization: pers.depth,
    personalization_hits: pers.hits,
    similarity: sim.score,
    similar_to: sim.id,
    unsourced_numbers: unsourced,
    blocks: blocking,
    overridden,
    warnings,
    passes: blocking.length === 0,
    grade_label: blocking.length ? "blocked" : overridden.length ? "accepted" : warnings.length ? "review" : "clean",
  };
}

// Accepting a block records an override. Critical codes refuse, for anyone.
export function canAccept(code: string): { ok: boolean; reason?: string } {
  if (CRITICAL_CODES.has(code)) return { ok: false, reason: `'${code}' is a critical block and cannot be overridden` };
  return { ok: true };
}
