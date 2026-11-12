// One routing table, used by the local dev server. The Netlify functions in
// netlify/functions declare the same paths in their own config.
import { dashboard } from "./dashboard.ts";
import type { Handler } from "./http.ts";
import { sequencer, warmup } from "./jobs.ts";
import { login } from "./login.ts";
import { mailbox, queue } from "./queue.ts";
import { contacts, deals, profiles, targets } from "./tools.ts";

export const ROUTES: [string, Handler][] = [
  ["/api/login", login],
  ["/api/logout", login],
  ["/api/dashboard", dashboard],
  ["/api/queue", queue],
  ["/api/queue/:id", queue],
  ["/api/queue/:id/:action", queue],
  ["/api/mailbox", mailbox],
  ["/api/contacts", contacts],
  ["/api/companies", contacts],
  ["/api/profiles", profiles],
  ["/api/deals", deals],
  ["/api/targets", targets],
  ["/api/sequencer/run", sequencer],
  ["/api/warmup/run", warmup],
];

export function match(pathname: string): { handler: Handler; params: Record<string, string> } | null {
  const parts = pathname.replace(/\/+$/, "").split("/");
  for (const [pattern, handler] of ROUTES) {
    const pp = pattern.split("/");
    if (pp.length !== parts.length) continue;
    const params: Record<string, string> = {};
    if (pp.every((seg, i) => (seg.startsWith(":") ? ((params[seg.slice(1)] = decodeURIComponent(parts[i])), true) : seg === parts[i]))) {
      return { handler, params };
    }
  }
  return null;
}
