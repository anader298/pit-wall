// Tool two: who outside the paddock can actually sign.
//
// Four gates decide whether a company can buy at all, and they multiply: one
// person can decide alone, a budget line already exists, there is a US
// surface to use what the car offers, and the company can legally operate
// and promote here. A plain additive score lets a large company with no
// marketing budget outrank a brand that spends on exactly this; a product of
// gates does not.
//
// Companies that clear the gates are then scored 0-3 on five axes, out of 15.
import type { Axes, Company, GateValue, Gates } from "../types.ts";

export const AXES: readonly (keyof Axes)[] = [
  "proven_sport_spend", "us_intent", "budget_capacity", "us_viability", "timing",
];
export const GATES: readonly (keyof Gates)[] = ["authority", "budget", "us_activation", "compliance"];

const GATE_WEIGHT: Record<GateValue, number> = { pass: 1, partial: 0.5, fail: 0 };

export function gateFactor(g: Gates): number {
  return GATES.reduce((f, k) => f * GATE_WEIGHT[g[k]], 1);
}

export function axisTotal(a: Axes): number {
  return AXES.reduce((s, k) => s + Math.max(0, Math.min(3, Math.round(a[k]))), 0);
}

// US viability is a disqualifier, not just a weight: a brand that cannot take
// US customers can only buy exposure.
export function tier(a: Axes): "A" | "B" | "C" {
  const total = axisTotal(a);
  if (a.us_viability <= 1) return "C";
  return total >= 11 ? "A" : total >= 7 ? "B" : "C";
}

export type RankedCompany = Company & {
  gate_factor: number;
  failed_gates: (keyof Gates)[];
  score: number; // out of 15
  tier: "A" | "B" | "C";
  rank_value: number; // gate_factor * score
};

export function rankCompanies(companies: readonly Company[]): RankedCompany[] {
  return companies
    .map((c) => {
      const f = gateFactor(c.gates);
      const s = axisTotal(c.axes);
      return {
        ...c,
        gate_factor: f,
        failed_gates: GATES.filter((k) => c.gates[k] === "fail"),
        score: s,
        tier: tier(c.axes),
        rank_value: Math.round(f * s * 100) / 100,
      };
    })
    .sort((a, b) => b.rank_value - a.rank_value || b.score - a.score || a.name.localeCompare(b.name));
}
