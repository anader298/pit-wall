// Net worth backed into from what a seat costs.
//
// For most drivers nobody publishes wealth. What is known is the series run
// cost. Assume the family spends some share of its net worth on racing and
// the implied wealth is run_cost / share. That is a scenario, not a
// measurement, and the product labels it that way everywhere it appears.
// Only a sourced figure is shown as verified.
import type { Profile } from "../types.ts";

export const DEFAULT_SPEND_SHARE = 0.05;
export const SPEND_SHARES = [0.02, 0.05, 0.1] as const;

export type WealthView =
  | { kind: "verified"; usd: number; basis: string }
  | { kind: "scenario"; usd: number; basis: string }
  | { kind: "unknown"; usd: null; basis: string };

export function impliedNetWorth(runCostUsd: number, spendShare: number): number {
  if (!(runCostUsd > 0)) throw new Error("run cost must be positive");
  if (!(spendShare > 0 && spendShare <= 1)) throw new Error("spend share must be in (0, 1]");
  return Math.round(runCostUsd / spendShare);
}

export function wealthView(p: Profile, spendShare = DEFAULT_SPEND_SHARE): WealthView {
  if (p.wealth_verified && p.nw_verified_usd) {
    return { kind: "verified", usd: p.nw_verified_usd, basis: "sourced figure" };
  }
  if (p.run_cost_usd) {
    return {
      kind: "scenario",
      usd: impliedNetWorth(p.run_cost_usd, spendShare),
      basis: `run cost $${p.run_cost_usd.toLocaleString("en-US")} (${p.run_cost_basis ?? "series estimate"}) / ${Math.round(spendShare * 100)}% assumed spend share`,
    };
  }
  return { kind: "unknown", usd: null, basis: "no run cost on record" };
}
