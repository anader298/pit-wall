import { test } from "node:test";
import assert from "node:assert/strict";
import { accountHealth, dailyCap, warmupState } from "../src/outreach/quota.ts";
import { adjustedTarget, pickRecipients, sendsThisRun } from "../src/warmup/plan.ts";
import { assertAllowlisted, MockDraftPlacer, MockWarmupTransport } from "../src/mail/mailbox.ts";
import type { Account } from "../src/types.ts";

const today = "2026-11-11"; // a Wednesday
const acct = (over: Partial<Account> = {}): Account => ({
  id: 1, email: "a@one.example", domain: "one.example", provider: "m365", role: "cold", enabled: true,
  dkim_state: "live", dmarc_state: "p=none", dns_checked_on: null, warmup_required: true, warmup_days: 21,
  warmup_started_on: "2026-10-01", ramp_started_on: "2026-11-01", connected: true, notes: "", ...over,
});
const warm = [{ account_id: 1, day_index: 0, value: 2 }, { account_id: 1, day_index: 14, value: 10 }];
const ramp = [{ account_id: 1, day_index: 0, value: 5 }, { account_id: 1, day_index: 7, value: 10 }];

test("cap: a warm, ramping account gets its scheduled cap", () => {
  assert.equal(dailyCap(acct(), warm, ramp, today), 10);
});

test("cap: zero for every unsafe condition", () => {
  assert.equal(dailyCap(acct({ role: "support" }), warm, ramp, today), 0);
  assert.equal(dailyCap(acct({ enabled: false }), warm, ramp, today), 0);
  assert.equal(dailyCap(acct({ dkim_state: "missing" }), warm, ramp, today), 0);
  assert.equal(dailyCap(acct({ dmarc_state: "missing" }), warm, ramp, today), 0);
  assert.equal(dailyCap(acct({ warmup_started_on: "2026-11-05" }), warm, ramp, today), 0); // still warming
  assert.equal(dailyCap(acct({ ramp_started_on: null }), warm, ramp, today), 0);
});

test("warmup state: day counting and targets", () => {
  const ws = warmupState(acct({ warmup_started_on: "2026-11-01" }), warm, today);
  assert.equal(ws.day, 10);
  assert.equal(ws.target, 2);
  assert.equal(warmupState(acct({ warmup_started_on: null }), warm, today).not_started, true);
});

test("bounce health pauses above 3% on a real sample only", () => {
  const log = (sent: number, bounced: number) => [{ log_date: today, sent, bounced }];
  assert.equal(accountHealth(log(100, 4)).should_pause, true);
  assert.equal(accountHealth(log(100, 3)).should_pause, false);
  assert.equal(accountHealth(log(10, 5)).should_pause, false); // under the minimum sample
});

test("warmup targets: maintenance trickle and weekend taper", () => {
  assert.equal(adjustedTarget(12, false, today), 12);
  assert.equal(adjustedTarget(12, true, today), 5); // 40% of 12
  assert.equal(adjustedTarget(2, true, today), 4); // floor of 4
  assert.equal(adjustedTarget(12, false, "2026-11-14"), 4); // Saturday, 35%
});

test("warmup: per-run share never exceeds what is owed", () => {
  for (let i = 0; i < 50; i++) {
    const n = sendsThisRun(5, 0, Math.random);
    assert.ok(n >= 1 && n <= 5);
  }
  assert.equal(sendsThisRun(0, 0, Math.random), 0);
});

test("warmup: recipients never include self", () => {
  const pool = ["a@one.example", "b@two.example", "c@three.example"];
  const got = pickRecipients("a@one.example", 6, pool, () => false, Math.random);
  assert.equal(got.length, 6);
  assert.ok(!got.includes("a@one.example"));
});

test("mail: warmup transport refuses any address outside the allowlist", async () => {
  const t = new MockWarmupTransport(["a@one.example", "b@two.example"]);
  assert.equal((await t.send("a@one.example", "b@two.example", "s", "b")).ok, true);
  await assert.rejects(t.send("a@one.example", "prospect@company.example", "s", "b"), /BLOCKED/);
  assert.throws(() => assertAllowlisted(t.allowlist, "x@y.example", "recipient"), /BLOCKED/);
});

test("mail: the draft placer has no way to send", async () => {
  const p = new MockDraftPlacer();
  const r = await p.placeDraft({ id: 1, from: "a@one.example", to: "p@c.example", subject: "s", body: "b" });
  assert.equal(r.ok, true);
  assert.equal(p.all().length, 1);
  assert.equal("send" in p, false);
});
