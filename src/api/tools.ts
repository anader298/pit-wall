// The three tools over the one dataset, plus the contacts browser.
//   GET /api/profiles?list=all&share=0.05   tool three: driver lists for teams
//   GET /api/deals?rate=0.15                tool one: inside deals
//   GET /api/targets                        tool two: gated and scored companies
//   GET /api/contacts?q=&status=            decision makers
//   GET /api/companies                      companies with contact coverage
import { requireAuth } from "../auth.ts";
import { loopDeals, pairDeals } from "../deals/model.ts";
import { isListKey, LISTS, listView, summarize } from "../profiles/lists.ts";
import { DEFAULT_SPEND_SHARE, SPEND_SHARES } from "../profiles/wealth.ts";
import { store } from "../store/memory.ts";
import { rankCompanies } from "../targets/score.ts";
import { isSendable } from "../targets/identity.ts";
import { json, type Handler } from "./http.ts";

export const profiles: Handler = async (req) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  const s = store();
  const url = new URL(req.url);
  const list = url.searchParams.get("list") || "all";
  if (!isListKey(list)) return json({ ok: false, error: `unknown list ${list}` }, 400);
  const share = Number(url.searchParams.get("share") || DEFAULT_SPEND_SHARE);
  if (!(share > 0 && share <= 1)) return json({ ok: false, error: "share must be in (0, 1]" }, 400);
  const businesses = new Map(s.businesses.map((b) => [b.id, b]));
  return json({
    ok: true,
    lists: Object.entries(LISTS).map(([k, v]) => ({ key: k, label: v.label, count: s.profiles.filter(v.test).length })),
    list,
    share,
    shares: SPEND_SHARES,
    summary: summarize(s.profiles),
    industries: s.industries,
    rows: listView(s.profiles, businesses, list, share),
  });
};

export const deals: Handler = async (req) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  const s = store();
  const url = new URL(req.url);
  const rate = Number(url.searchParams.get("rate") || s.model.base_rate);
  if (!s.model.rates.includes(rate)) return json({ ok: false, error: `rate must be one of ${s.model.rates.join(", ")}` }, 400);
  const names: Record<string, { name: string; industry: string; drivers: string[] }> = {};
  for (const b of s.businesses) {
    names[b.id] = { name: b.name, industry: s.industries[b.industry] ?? b.industry, drivers: s.profiles.filter((p) => p.business_id === b.id).map((p) => p.driver) };
  }
  for (const p of s.partners) names[p.id] = { name: p.name, industry: "Series partner", drivers: [] };
  const all = [...loopDeals(s.model, s.partners, s.businesses, rate), ...pairDeals(s.model, s.businesses, rate)];
  return json({ ok: true, rate, rates: s.model.rates, model: { ramp: s.model.ramp, capture: s.model.capture, setup_per_effort: s.model.setup_per_effort }, parties: names, deals: all.slice(0, 60), total: all.length });
};

export const targets: Handler = async (req) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  const s = store();
  const ranked = rankCompanies(s.companies).map((c) => {
    const people = s.contacts.filter((x) => x.company_id === c.id);
    return { ...c, people: people.length, sendable: people.filter(isSendable).length, quarantined: people.filter((p) => p.email_confidence === "quarantined").length };
  });
  return json({ ok: true, companies: ranked });
};

export const contacts: Handler = async (req) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "GET") return json({ ok: false, error: "method not allowed" }, 405);
  const s = store();
  const url = new URL(req.url);
  const coName = (id: number | null) => s.companies.find((c) => c.id === id)?.name ?? null;

  if (url.pathname.startsWith("/api/companies")) {
    const rows = s.companies.map((co) => {
      const ppl = s.contacts.filter((c) => c.company_id === co.id);
      return {
        id: co.id, name: co.name, vertical: co.vertical, status: co.status, domain: co.domain, confidence: null,
        why_they_fit: co.why_they_fit, contact_count: ppl.length, with_email: ppl.filter((p) => p.email).length,
        verified_emails: ppl.filter((p) => p.email && p.email_confidence === "verified").length,
      };
    }).sort((a, b) => b.contact_count - a.contact_count || a.name.localeCompare(b.name));
    return json({ ok: true, companies: rows });
  }

  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 200);
  const status = (url.searchParams.get("status") ?? "").trim().slice(0, 50);
  const rows = s.contacts
    .map((c) => ({
      id: c.id, full_name: c.full_name, title: c.title, email: c.email, email_confidence: c.email_confidence,
      status: c.status, priority: c.priority, linkedin_url: c.linkedin_url, company_name: coName(c.company_id),
    }))
    .filter((c) => !q || [c.full_name, c.title, c.email, c.company_name].some((v) => (v ?? "").toLowerCase().includes(q)))
    .filter((c) => !status || c.status === status)
    .sort((a, b) => a.priority - b.priority || (a.company_name ?? "").localeCompare(b.company_name ?? "") || a.full_name.localeCompare(b.full_name));
  const wantStatuses = !q && !status;
  return json({
    ok: true, contacts: rows, total: rows.length,
    ...(wantStatuses ? { statuses: [...new Set(s.contacts.map((c) => c.status))].sort() } : {}),
  });
};
