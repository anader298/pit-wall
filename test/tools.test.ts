import { test } from "node:test";
import assert from "node:assert/strict";
import { npvAt, pairDeals } from "../src/deals/model.ts";
import { impliedNetWorth, wealthView } from "../src/profiles/wealth.ts";
import { axisTotal, gateFactor, rankCompanies, tier } from "../src/targets/score.ts";
import { applyEvidence, confidenceFor, isSendable } from "../src/targets/identity.ts";
import type { Business, Company, Contact, DealModel, Profile } from "../src/types.ts";

const model: DealModel = {
  rates: [0.1, 0.15, 0.2], base_rate: 0.15, ramp: [0.5, 1, 1, 1, 1], setup_per_effort: 15000,
  capture: { low: 0.04, base: 0.1, high: 0.2 }, buyer_spend_cap: 25_000_000,
  categories: {
    freight: { label: "Freight", margin: 0.12, effort_base: 2, sellers: ["logistics"],
      seller_cap: { low: 0.1, base: 0.2, high: 0.35 }, buyers: { agri_food: 0.06 } },
  },
};

test("deals: NPV is the ramped, discounted annual value less setup", () => {
  // 1,000,000 a year at 15%: 0.5/1.15 + 1/1.15^2 + 1/1.15^3 + 1/1.15^4 + 1/1.15^5 = 2.917372, minus 3 x 15,000
  assert.equal(Math.round(npvAt(model, 1_000_000, 3, 0.15)), 2_872_372);
});

test("deals: a pair is sized from buyer spend, capped by seller capacity", () => {
  const b = (id: string, industry: string, mid: number, country = "United States"): Business =>
    ({ id, name: id, industry, what: "", country, state: null, rev: { lo: mid, hi: mid, mid }, rev_basis: "filing" });
  const deals = pairDeals(model, [b("truck", "logistics", 100e6), b("farm", "agri_food", 50e6)]);
  assert.equal(deals.length, 1);
  // spend 3M, capacity 20M: annual base = 3M x 0.1 x 0.12
  assert.equal(deals[0].annual.base, 36_000);
  assert.deepEqual(deals[0].roles, ["seller", "buyer"]);
});

test("wealth: implied net worth is a labelled scenario unless verified", () => {
  assert.equal(impliedNetWorth(1_600_000, 0.05), 32_000_000);
  const p = { wealth_verified: false, nw_verified_usd: null, run_cost_usd: 600_000, run_cost_basis: "series estimate" } as Profile;
  const v = wealthView(p, 0.1);
  assert.equal(v.kind, "scenario");
  assert.equal(v.usd, 6_000_000);
  assert.equal(wealthView({ ...p, wealth_verified: true, nw_verified_usd: 9e7 }).kind, "verified");
});

const company = (gates: Company["gates"], axes: Company["axes"]): Company =>
  ({ id: 1, name: "c", vertical: "", signal: "", why_they_fit: "", status: "target", domain: "", gates, axes });
const allPass = { authority: "pass", budget: "pass", us_activation: "pass", compliance: "pass" } as const;
const strong = { proven_sport_spend: 3, us_intent: 3, budget_capacity: 3, us_viability: 3, timing: 2 };

test("targets: gates multiply, so one failed gate zeroes the company", () => {
  assert.equal(gateFactor(allPass), 1);
  assert.equal(gateFactor({ ...allPass, authority: "fail" }), 0);
  assert.equal(gateFactor({ ...allPass, budget: "partial", compliance: "partial" }), 0.25);
});

test("targets: a big company that cannot sign ranks below a smaller one that can", () => {
  const big = { ...company({ ...allPass, authority: "fail" }, strong), name: "big" };
  const small = { ...company(allPass, { ...strong, budget_capacity: 1, proven_sport_spend: 1 }), name: "small" };
  assert.deepEqual(rankCompanies([big, small]).map((c) => c.name), ["small", "big"]);
});

test("targets: five axes out of 15, US viability disqualifies", () => {
  assert.equal(axisTotal(strong), 14);
  assert.equal(tier(strong), "A");
  assert.equal(tier({ ...strong, us_viability: 1 }), "C");
});

test("identity: only a person-level match is sendable, and evidence only upgrades", () => {
  assert.equal(confidenceFor("company_level"), "quarantined");
  const c = { email: "x@y.example", email_evidence: "company_level", email_confidence: "quarantined" } as Contact;
  assert.equal(isSendable(c), false);
  assert.equal(isSendable(applyEvidence(c, "linkedin_match")), true);
  assert.equal(applyEvidence(applyEvidence(c, "linkedin_match"), "pattern_guess").email_confidence, "verified");
});
