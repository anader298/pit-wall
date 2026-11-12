// Tool three: the driver lists teams use to find talent and their next
// partners. Five views over one profile dataset.
import type { Business, Profile } from "../types.ts";
import { wealthView } from "./wealth.ts";

export const LISTS = {
  all: { label: "All drivers", test: (_p: Profile) => true },
  "sports-car": { label: "Sports car", test: (p: Profile) => p.discipline === "Sports car" },
  "open-wheel": { label: "Open wheel", test: (p: Profile) => p.discipline === "Open wheel" },
  "us-based": { label: "US-based", test: (p: Profile) => p.us_based === true },
  international: { label: "International", test: (p: Profile) => p.us_based === false },
} as const;

export type ListKey = keyof typeof LISTS;

export function isListKey(k: string): k is ListKey {
  return Object.prototype.hasOwnProperty.call(LISTS, k);
}

export function hasRoute(p: Profile): boolean {
  return p.route.kind !== "none";
}

export function summarize(profiles: readonly Profile[]) {
  return {
    drivers: profiles.length,
    verified_wealth: profiles.filter((p) => p.wealth_verified).length,
    strong_leads: profiles.filter((p) => p.lead === "Strong lead").length,
    named_routes: profiles.filter(hasRoute).length,
    us_based: profiles.filter((p) => p.us_based === true).length,
    residence_open: profiles.filter((p) => p.us_based === null).length,
  };
}

const LEAD_ORDER: Record<Profile["lead"], number> = {
  "Verified wealth": 0, "Strong lead": 1, "Possible lead": 2, "No lead": 3,
};

export function listView(
  profiles: readonly Profile[],
  businesses: ReadonlyMap<string, Business>,
  key: ListKey,
  spendShare: number,
) {
  return profiles
    .filter(LISTS[key].test)
    .map((p) => ({
      ...p,
      business: p.business_id ? businesses.get(p.business_id) ?? null : null,
      wealth: wealthView(p, spendShare),
    }))
    .sort((a, b) => LEAD_ORDER[a.lead] - LEAD_ORDER[b.lead] || (b.wealth.usd ?? 0) - (a.wealth.usd ?? 0));
}
