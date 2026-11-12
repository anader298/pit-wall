// Approval checks for the review queue. All of them run on the server, in
// this order, every time; the browser's disabled button is a convenience,
// not the gate. Approval places a draft in the sending account's own Drafts
// folder. Nothing in this path can send.
import type { Account, Contact, Draft } from "../types.ts";

export const REVIEW_STATES: readonly string[] = ["generated", "linted", "flagged", "in_review", "snoozed"];
export const READONLY_LISTED: readonly string[] = ["approved", "placed", "sent"];
const CONTACT_BLOCKED_STATUSES = ["replied", "bounced", "dead", "call_booked"];

export type ApprovalResult =
  | { ok: true; to: string }
  | { ok: false; status: number; error: string; blocks?: unknown[] };

export function checkApproval(args: {
  draft: Draft | undefined;
  contact: Contact | undefined;
  account: Account | undefined;
  suppressed: (emailKey: string) => string | null; // returns the reason, or null
}): ApprovalResult {
  const { draft, contact, account } = args;
  if (!draft) return { ok: false, status: 404, error: "draft not found" };

  // 1. the draft must still be reviewable
  if (!REVIEW_STATES.includes(draft.state)) {
    return { ok: false, status: 409, error: `draft is ${draft.state} and can no longer be approved` };
  }
  // 2. the contact must still be contactable
  if (!contact) return { ok: false, status: 409, error: "contact not found" };
  if (CONTACT_BLOCKED_STATUSES.includes(contact.status)) {
    return { ok: false, status: 409, error: `contact is ${contact.status}; refusing to place a draft` };
  }
  const to = String(contact.email ?? "").trim();
  if (!to) return { ok: false, status: 409, error: "contact has no email address" };
  // 3. identity: only a verified address can be approved; quarantined and
  // pattern-guessed addresses never reach a mailbox without a person fixing
  // the record first
  if (contact.email_confidence !== "verified" && contact.email_confidence !== "probable") {
    return { ok: false, status: 409, error: `contact email is ${contact.email_confidence}; verify the identity first` };
  }
  // 4. suppression (opt-outs, bounces, already contacted elsewhere)
  const reason = args.suppressed(to.toLowerCase());
  if (reason) return { ok: false, status: 409, error: `contact email is suppressed (${reason})` };
  // 5. the stored scorecard must have no blocks (trust the card, do not re-lint)
  const blocks = draft.scorecard?.blocks ?? [];
  if (blocks.length > 0) return { ok: false, status: 409, error: "scorecard has unresolved blocks", blocks };
  // 6. the sending account must exist and be connected
  if (!account) return { ok: false, status: 409, error: "draft has no sending account assigned" };
  if (!account.connected) return { ok: false, status: 409, error: `no mailbox connection for ${account.email}` };
  return { ok: true, to };
}

// Rejecting is allowed until the draft exists in a mailbox. After that the
// mailbox copy would live on, so the queue refuses rather than pretend.
export function checkReject(draft: Draft | undefined): { ok: true } | { ok: false; status: number; error: string } {
  if (!draft) return { ok: false, status: 404, error: "draft not found" };
  if (draft.state === "placed" || draft.state === "sent") {
    return { ok: false, status: 409, error: `cannot reject a draft that is already ${draft.state}: the mailbox copy would live on` };
  }
  return { ok: true };
}
