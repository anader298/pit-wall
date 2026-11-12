// Shared-password session. The login sets an HttpOnly cookie whose value is
// an HMAC of a fixed message keyed by SESSION_SECRET. The edge gate checks it
// at the perimeter and every function checks it again, because the
// /.netlify/functions/<name> paths exist alongside the /api/* routes.
//
// Known limit: one shared password, no per-user accounts. Per-user logins are
// the next fix (see README, Limits).
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "pitwall_auth";
const SESSION_MESSAGE = "pitwall-session-v1";

export function sessionSecret(): string {
  return process.env.SESSION_SECRET || "";
}

export function sessionCookieValue(secret = sessionSecret()): string {
  return createHmac("sha256", secret).update(SESSION_MESSAGE).digest("hex");
}

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") || "").split(";")) {
    const t = part.trim();
    const eq = t.indexOf("=");
    if (eq > 0 && t.slice(0, eq) === name) return decodeURIComponent(t.slice(eq + 1));
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const unauthorized = () =>
  new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });

export function isAuthed(req: Request): boolean {
  const secret = sessionSecret();
  const got = readCookie(req, SESSION_COOKIE);
  return !!secret && !!got && safeEqual(got, sessionCookieValue(secret));
}

// Returns a 401 Response to short-circuit with, or null when the caller is OK.
export function requireAuth(req: Request): Response | null {
  return isAuthed(req) ? null : unauthorized();
}

// Scheduled jobs authenticate with a shared header instead of a session.
export function requireCronOrAuth(req: Request): Response | null {
  const secret = process.env.CRON_SECRET || "";
  const got = req.headers.get("x-pitwall-cron") || "";
  if (secret && got && safeEqual(got, secret)) return null;
  return requireAuth(req);
}

export function checkPassword(given: string): boolean {
  const expected = process.env.PITWALL_PASSWORD || "";
  return !!expected && safeEqual(given, expected);
}
