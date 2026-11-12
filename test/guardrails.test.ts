import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedNumbers, extractNumbers, unsourcedNumbers } from "../src/outreach/numbers.ts";
import { canAccept, scoreDraft } from "../src/outreach/lint.ts";
import { checkApproval, checkReject } from "../src/outreach/approve.ts";
import type { Account, Contact, Draft } from "../src/types.ts";

const research = [
  { id: 1, title: "a", numbers: ["120,000", "2.1M"], verified: true, source_note: "" },
  { id: 2, title: "b", numbers: ["1,500"], verified: false, source_note: "" },
];
const allowed = allowedNumbers(research);
const contact = { full_name: "Alex Sample", title: "Head of Partnerships" };
const base = {
  contact, companyName: "Example Neobank Co", variant: "A", touch: 1,
  bannedNames: ["Team Alpha Racing", "Driver 03"], allowedNumbers: allowed, recentBodies: [],
};
const clean = "Alex —\n\nExample Neobank Co is building a US audience this year. A race weekend puts the people you want in one room for three days. We introduce partners to the owners already in our paddock.\n\nWould you be open to an intro to the team running this?";

test("numbers: claims are extracted, small integers are not", () => {
  assert.deepEqual(extractNumbers("about 120,000 fans, 2.1M viewers, 15 minutes, 40%"), ["120,000", "2.1M", "40%"]);
});

test("numbers: only verified research items make a figure quotable", () => {
  assert.deepEqual(unsourcedNumbers("120000 people and 1,500 guests", allowed), ["1,500"]);
});

test("lint: a clean draft passes", () => {
  const card = scoreDraft({ ...base, subject: "Example Neobank Co and the paddock", body: clean });
  assert.equal(card.passes, true, JSON.stringify(card.blocks));
});

test("lint: a team or driver name is a critical block", () => {
  const card = scoreDraft({ ...base, subject: "Team Alpha Racing", body: clean });
  assert.equal(card.blocks[0].code, "team_name");
  assert.equal(card.blocks[0].severity, "critical");
});

test("lint: critical blocks cannot be accepted, even with an override on record", () => {
  const card = scoreDraft({ ...base, subject: "Driver 03 and you", body: clean, accepted: new Set(["team_name"]) });
  assert.equal(card.passes, false);
  assert.equal(canAccept("team_name").ok, false);
  assert.equal(canAccept("link_in_cold").ok, true);
});

test("lint: a non-critical block can be accepted and is recorded as an override", () => {
  const body = clean.replace("paddock.", "paddock at program-one.com.");
  const card = scoreDraft({ ...base, subject: "s", body, accepted: new Set(["link_in_cold"]) });
  assert.equal(card.passes, true);
  assert.equal(card.overridden[0].code, "link_in_cold");
  assert.equal(card.grade_label, "accepted");
});

test("lint: wrong greeting, banned word, unsourced number", () => {
  const body = clean.replace("Alex —", "Jordan —").replace("three days.", "three days and 1,500 guests. No sponsorship deck.");
  const codes = scoreDraft({ ...base, subject: "s", body }).blocks.map((b) => b.code).sort();
  assert.deepEqual(codes, ["banned_word", "unsourced_number", "wrong_name"]);
});

test("lint: near-duplicate copy is blocked", () => {
  const card = scoreDraft({ ...base, subject: "s", body: clean, recentBodies: [{ id: 9, body: clean }] });
  assert.ok(card.blocks.some((b) => b.code === "similarity"));
});

// ------------------------------------------------------------------ approval

const draft = (over: Partial<Draft> = {}): Draft => ({
  id: 1, contact_id: 1, account_id: 1, touch: 1, variant: "A", subject: "s", body: "b", state: "linted",
  scorecard: { blocks: [] } as unknown as Draft["scorecard"], provider_msg_id: null, created_at: "", updated_at: "", ...over,
});
const person = (over: Partial<Contact> = {}): Contact => ({
  id: 1, company_id: 1, full_name: "Alex Sample", title: null, linkedin_url: null, email: "alex@x.example",
  email_evidence: "linkedin_match", email_confidence: "verified", email_source: null, status: "new", priority: 1, vertical: null, ...over,
});
const acct = { id: 1, email: "outreach@program-one.example", connected: true } as Account;
const none = () => null;

test("approve: all checks pass for a clean, verified, unsuppressed draft", () => {
  assert.deepEqual(checkApproval({ draft: draft(), contact: person(), account: acct, suppressed: none }), { ok: true, to: "alex@x.example" });
});

test("approve: each check refuses on its own", () => {
  const cases: [Parameters<typeof checkApproval>[0], RegExp][] = [
    [{ draft: draft({ state: "placed" }), contact: person(), account: acct, suppressed: none }, /no longer be approved/],
    [{ draft: draft(), contact: person({ status: "replied" }), account: acct, suppressed: none }, /contact is replied/],
    [{ draft: draft(), contact: person({ email_confidence: "quarantined" }), account: acct, suppressed: none }, /quarantined/],
    [{ draft: draft(), contact: person(), account: acct, suppressed: () => "opt_out" }, /suppressed/],
    [{ draft: draft({ scorecard: { blocks: [{ code: "x" }] } as unknown as Draft["scorecard"] }), contact: person(), account: acct, suppressed: none }, /unresolved blocks/],
    [{ draft: draft(), contact: person(), account: { ...acct, connected: false }, suppressed: none }, /no mailbox connection/],
  ];
  for (const [args, re] of cases) {
    const r = checkApproval(args);
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, re);
  }
});

test("reject: refused once the draft is in a mailbox", () => {
  assert.equal(checkReject(draft({ state: "placed" })).ok, false);
  assert.equal(checkReject(draft()).ok, true);
});
