// Every /api/* route in one function, so a warm instance shares one
// in-memory store across the dashboard, the queue and the tools. The live
// system splits these into separate functions over a shared Postgres store.
import type { Config, Context } from "@netlify/functions";
import { match } from "../../src/api/routes.ts";

export default async (req: Request, _context: Context) => {
  const m = match(new URL(req.url).pathname);
  if (!m) {
    return new Response(JSON.stringify({ error: "no such route" }), { status: 404, headers: { "content-type": "application/json" } });
  }
  return m.handler(req, m.params);
};

export const config: Config = {
  path: "/api/*",
};
