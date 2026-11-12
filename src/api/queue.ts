// Review queue.
//   GET  /api/queue              review states first, then approved/placed/sent read-only
//   GET  /api/queue/:id          one draft with its rejection history
//   POST /api/queue/:id/approve  server-side checks, then place in Drafts (never sends)
//   POST /api/queue/:id/reject   {reason, note}
import { requireAuth } from "../auth.ts";
import { checkApproval, checkReject, READONLY_LISTED, REVIEW_STATES } from "../outreach/approve.ts";
import { logEvent, store, type Store } from "../store/memory.ts";
import type { Draft } from "../types.ts";
import { todayNY } from "../util/dates.ts";
import { json, readJson, type Handler } from "./http.ts";

function shape(s: Store, d: Draft) {
  const c = s.contacts.find((x) => x.id === d.contact_id);
  const co = c ? s.companies.find((x) => x.id === c.company_id) : undefined;
  const a = s.accounts.find((x) => x.id === d.account_id);
  return {
    ...d,
    contact: { id: d.contact_id, full_name: c?.full_name ?? "", title: c?.title ?? null, email: c?.email ?? null, status: c?.status ?? null, email_confidence: c?.email_confidence ?? null },
    company: co ? { id: co.id, name: co.name } : null,
    account_email: a?.email ?? null,
    blocks: d.scorecard?.blocks ?? [],
    warnings: d.scorecard?.warnings ?? [],
    editable: REVIEW_STATES.includes(d.state),
  };
}

async function approve(s: Store, id: number): Promise<Response> {
  const draft = s.drafts.find((d) => d.id === id);
  const contact = draft ? s.contacts.find((c) => c.id === draft.contact_id) : undefined;
  const account = draft ? s.accounts.find((a) => a.id === draft.account_id) : undefined;
  const check = checkApproval({ draft, contact, account, suppressed: (k) => s.suppression.get(k) ?? null });
  if (!check.ok) return json({ ok: false, error: check.error, blocks: check.blocks }, check.status);

  // State is unchanged unless placement succeeds.
  const placed = await s.mailbox.placeDraft({ id, from: account!.email, to: check.to, subject: draft!.subject, body: draft!.body });
  if (!placed.ok) {
    logEvent(s, "draft_place_failed", `Draft ${id} for ${contact!.full_name}: placement failed (${placed.error})`, "draft", id);
    return json({ ok: false, error: `checks passed but placement failed: ${placed.error}` }, 502);
  }
  draft!.state = "placed";
  draft!.provider_msg_id = placed.msgId;
  draft!.updated_at = new Date().toISOString();
  const today = todayNY();
  const log = s.rampLog.find((r) => r.account_id === account!.id && r.log_date === today);
  if (log) log.drafted++;
  else s.rampLog.push({ account_id: account!.id, log_date: today, drafted: 1, sent: 0, bounced: 0 });
  if (contact!.status === "new" || contact!.status === "researched") contact!.status = "drafted";
  logEvent(s, "draft_placed", `Approved draft ${id} for ${contact!.full_name} and placed it in ${account!.email} Drafts (mock mailbox)`, "draft", id);
  return json({ ok: true, state: "placed", msgId: placed.msgId });
}

async function reject(s: Store, id: number, req: Request): Promise<Response> {
  const draft = s.drafts.find((d) => d.id === id);
  const check = checkReject(draft);
  if (!check.ok) return json({ ok: false, error: check.error }, check.status);
  const body = await readJson(req);
  const reason = String(body.reason ?? "unspecified").slice(0, 200) || "unspecified";
  const note = String(body.note ?? "").slice(0, 2000);
  draft!.state = "rejected";
  draft!.updated_at = new Date().toISOString();
  s.rejections.push({ draft_id: id, reason, note, created_at: draft!.updated_at });
  const c = s.contacts.find((x) => x.id === draft!.contact_id);
  logEvent(s, "draft_rejected", `Rejected draft ${id} for ${c?.full_name ?? "contact"} (${reason})`, "draft", id);
  return json({ ok: true, state: "rejected" });
}

export const queue: Handler = async (req, params) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  const s = store();
  const { id, action } = params;

  if (!id) {
    if (req.method !== "GET") return json({ ok: false, error: "method not allowed" }, 405);
    const listed = s.drafts
      .filter((d) => REVIEW_STATES.includes(d.state) || READONLY_LISTED.includes(d.state))
      .sort((a, b) => Number(!REVIEW_STATES.includes(a.state)) - Number(!REVIEW_STATES.includes(b.state)) || a.id - b.id);
    return json({ ok: true, drafts: listed.map((d) => shape(s, d)) });
  }
  const draftId = Number.parseInt(id, 10);
  if (!Number.isFinite(draftId)) return json({ ok: false, error: "bad draft id" }, 400);
  if (!action) {
    const d = s.drafts.find((x) => x.id === draftId);
    if (!d) return json({ ok: false, error: "draft not found" }, 404);
    return json({ ok: true, draft: shape(s, d), rejections: s.rejections.filter((r) => r.draft_id === draftId) });
  }
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  if (action === "approve") return approve(s, draftId);
  if (action === "reject") return reject(s, draftId, req);
  return json({ ok: false, error: `unknown action ${action}` }, 400);
};

// GET /api/mailbox: what the mock mailboxes hold. In production this is the
// account's real Drafts folder, which a person opens to press Send.
export const mailbox: Handler = async (req) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  const s = store();
  const placedSeed = s.drafts.filter((d) => d.state === "placed" && d.provider_msg_id?.includes("-sample@"));
  const live = s.mailbox.all();
  return json({
    ok: true,
    note: "Mock mailbox. Nothing here was sent; the live system puts these in each account's own Drafts folder.",
    drafts: [
      ...live,
      ...placedSeed.map((d) => ({
        msgId: d.provider_msg_id, account: s.accounts.find((a) => a.id === d.account_id)?.email,
        to: s.contacts.find((c) => c.id === d.contact_id)?.email, subject: d.subject, body: d.body, placedAt: d.updated_at,
      })),
    ],
  });
};
