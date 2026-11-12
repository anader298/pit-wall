// Mailbox adapters.
//
// Two narrow interfaces, on purpose:
//   DraftPlacer      puts an approved draft in the sending account's own Drafts
//                    folder. It has no send method. A person opens the folder
//                    and presses Send.
//   WarmupTransport  sends warmup mail, and only between the program's own
//                    mailboxes: every call re-checks a frozen allowlist.
//
// The live system implements these over Microsoft Graph (create message in
// Drafts) and Gmail IMAP APPEND / SMTP with app passwords. This repo ships
// in-memory mocks so it runs with no mailbox credentials at all.

export type PlacedDraft = {
  msgId: string;
  account: string;
  to: string;
  subject: string;
  body: string;
  placedAt: string;
};

export type MailResult = { ok: true; msgId: string } | { ok: false; error: string };

export interface DraftPlacer {
  placeDraft(d: { id: number; from: string; to: string; subject: string; body: string }): Promise<MailResult>;
}

export interface WarmupTransport {
  send(from: string, to: string, subject: string, body: string, inReplyTo?: string): Promise<MailResult>;
  markRead(mailbox: string, msgIds: string[]): Promise<string[]>;
}

// Plain text to reflowing HTML paragraphs, so a draft does not hard-wrap when
// the person opens it in their mail client.
export function bodyHtml(plain: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  const paras = String(plain || "").split("\n\n")
    .map((p) => `<div style="margin:0 0 1em 0">${esc(p).replace(/\n/g, "<br>")}</div>`)
    .join("");
  return `<div dir="ltr" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${paras}</div>`;
}

function newMessageId(from: string, tag: string): string {
  const domain = from.split("@").pop() || "pitwall.local";
  return `<pitwall-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${domain}>`;
}

// Mock Drafts folders, one per account, held in memory.
export class MockDraftPlacer implements DraftPlacer {
  readonly folders = new Map<string, PlacedDraft[]>();

  async placeDraft(d: { id: number; from: string; to: string; subject: string; body: string }): Promise<MailResult> {
    const msgId = newMessageId(d.from, `draft${d.id}`);
    const list = this.folders.get(d.from) ?? [];
    list.unshift({ msgId, account: d.from, to: d.to, subject: d.subject, body: d.body, placedAt: new Date().toISOString() });
    this.folders.set(d.from, list);
    return { ok: true, msgId };
  }

  all(): PlacedDraft[] {
    return [...this.folders.values()].flat().sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1));
  }
}

export function assertAllowlisted(allowlist: readonly string[], addr: string, role: string): string {
  const a = String(addr || "").trim().toLowerCase();
  if (!allowlist.includes(a)) {
    throw new Error(`BLOCKED: ${role} address ${addr} is not in the owned-mailbox warmup allowlist`);
  }
  return a;
}

// Warmup mail between owned mailboxes only. The allowlist is frozen at
// construction and checked on both ends of every message.
export class MockWarmupTransport implements WarmupTransport {
  readonly allowlist: readonly string[];
  readonly sent: { from: string; to: string; subject: string; msgId: string }[] = [];
  constructor(allowlist: readonly string[]) {
    this.allowlist = Object.freeze(allowlist.map((a) => a.toLowerCase()));
  }
  async send(from: string, to: string, subject: string, _body: string, _inReplyTo?: string): Promise<MailResult> {
    const f = assertAllowlisted(this.allowlist, from, "sender");
    const t = assertAllowlisted(this.allowlist, to, "recipient");
    const msgId = newMessageId(f, "warmup");
    this.sent.push({ from: f, to: t, subject, msgId });
    return { ok: true, msgId };
  }
  async markRead(_mailbox: string, msgIds: string[]) {
    return msgIds;
  }
}
