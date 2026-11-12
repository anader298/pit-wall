// Tool one: deals between the businesses already inside the paddock, and
// between those businesses and the series' own partners.
//
// Sizing, per deal:
//   spend    = buyer revenue x the share its industry spends on the category,
//              capped so one large buyer cannot dominate the list
//   capacity = seller revenue x the share of its book it could take on
//   annual   = min(spend, capacity) x capture x category margin
//   NPV      = annual value over a five-year ramp, discounted, minus a setup
//              cost proportional to the effort of putting the deal together
//
// Low / base / high cases come from the capture and capacity assumptions.
// Every assumption lives in the model object, not in code, and every figure
// the page shows says which case it is.
import type { Business, DealModel, Partner } from "../types.ts";

export type Case = "low" | "base" | "high";
const CASES: Case[] = ["low", "base", "high"];

export function npvAt(model: DealModel, annual: number, effort: number, rate: number): number {
  let v = -model.setup_per_effort * effort;
  model.ramp.forEach((share, t) => {
    v += (annual * share) / Math.pow(1 + rate, t + 1);
  });
  return v;
}

const STRONG_BASIS = new Set(["company-reported", "filing", "registry accounts"]);
function evidenceOf(...bs: Business[]): number {
  const scores = bs.map((b) => (!b.rev ? 0.4 : STRONG_BASIS.has(b.rev_basis ?? "") ? 1 : 0.7));
  return Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 100) / 100;
}

export type Deal = {
  id: string;
  kind: "pair" | "loop";
  category: string;
  label: string;
  parties: string[]; // business ids, or partner id first for a loop
  roles: string[];
  geo_mult: number;
  evidence: number;
  effort: number;
  spend: number;
  annual: Record<Case, number>;
  npv: Record<Case, number>;
  score: number;
};

function round(n: number): number {
  return Math.round(n / 1000) * 1000;
}

export function pairDeals(model: DealModel, businesses: readonly Business[], rate = model.base_rate): Deal[] {
  const out: Deal[] = [];
  for (const [cat, c] of Object.entries(model.categories)) {
    const sellers = businesses.filter((b) => b.rev && c.sellers.includes(b.industry));
    const buyers = businesses.filter((b) => b.rev && (c.buyers[b.industry] ?? 0) > 0);
    for (const s of sellers) {
      for (const b of buyers) {
        if (s.id === b.id) continue;
        const spend = Math.min(b.rev!.mid * c.buyers[b.industry], model.buyer_spend_cap);
        const sameCountry = s.country === b.country;
        const geo = sameCountry ? 1 : 0.6;
        const effort = c.effort_base + (sameCountry ? 0 : 1);
        const annual = {} as Record<Case, number>;
        const npv = {} as Record<Case, number>;
        for (const k of CASES) {
          const capacity = s.rev!.mid * c.seller_cap[k];
          annual[k] = round(Math.min(spend, capacity) * model.capture[k] * c.margin);
          npv[k] = round(npvAt(model, annual[k], effort, rate));
        }
        if (npv.base <= 0) continue;
        const evidence = evidenceOf(s, b);
        out.push({
          id: `${cat}-${s.id}-${b.id}`,
          kind: "pair",
          category: cat,
          label: c.label,
          parties: [s.id, b.id],
          roles: ["seller", "buyer"],
          geo_mult: geo,
          evidence,
          effort,
          spend: round(spend),
          annual,
          npv,
          score: Math.round(npv.base * evidence * geo),
        });
      }
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

// A series partner selling into several family businesses at once: the
// partner books volume, the families buy on pooled terms. This is the shape
// of the fleet tire deal in the write-up.
export function loopDeals(
  model: DealModel,
  partners: readonly Partner[],
  businesses: readonly Business[],
  rate = model.base_rate,
  maxMembers = 4,
): Deal[] {
  const out: Deal[] = [];
  for (const p of partners) {
    const members = businesses
      .filter((b) => b.rev && (p.buyers[b.industry] ?? 0) > 0)
      .map((b) => ({ b, spend: Math.min(b.rev!.mid * p.buyers[b.industry], model.buyer_spend_cap) }))
      .sort((x, y) => y.spend - x.spend)
      .slice(0, maxMembers);
    if (members.length < 2) continue;
    const spend = members.reduce((s, m) => s + m.spend, 0);
    const effort = p.effort_base;
    const annual = {} as Record<Case, number>;
    const npv = {} as Record<Case, number>;
    for (const k of CASES) {
      annual[k] = round(spend * model.capture[k] * p.partner_margin);
      npv[k] = round(npvAt(model, annual[k], effort, rate));
    }
    const evidence = evidenceOf(...members.map((m) => m.b));
    out.push({
      id: `loop-${p.id}`,
      kind: "loop",
      category: p.category,
      label: `${p.role}: pooled program`,
      parties: [p.id, ...members.map((m) => m.b.id)],
      roles: ["partner", ...members.map(() => "buyer")],
      geo_mult: 1,
      evidence,
      effort,
      spend: round(spend),
      annual,
      npv,
      score: Math.round(npv.base * evidence),
    });
  }
  return out.sort((x, y) => y.score - x.score);
}
