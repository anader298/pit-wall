// Edge gate: every path except the login page, the login API and the
// favicon needs the session cookie. The cookie is a hex HMAC-SHA256 of a
// fixed message keyed by SESSION_SECRET. Functions re-check it themselves;
// this is the outer perimeter.
import type { Config, Context } from "@netlify/edge-functions";

const enc = new TextEncoder();
let cachedExpected: string | null = null;

async function expectedCookie(secret: string): Promise<string> {
  if (cachedExpected) return cachedExpected;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("pitwall-session-v1"));
  cachedExpected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return cachedExpected;
}

export default async (req: Request, context: Context) => {
  const secret = Netlify.env.get("SESSION_SECRET");
  if (!secret) return new Response("Server not configured", { status: 500 });

  const cookie = context.cookies.get("pitwall_auth");
  if (cookie && cookie === (await expectedCookie(secret))) return context.next();

  const url = new URL(req.url);
  if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
    const login = new URL("/login.html", req.url);
    if (url.pathname !== "/" && url.pathname !== "/index.html") login.searchParams.set("next", url.pathname + url.search);
    return Response.redirect(login, 302);
  }
  return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
};

export const config: Config = {
  path: "/*",
  // The scheduler reaches scheduled functions over HTTP through the CDN, so
  // the gate must let the cron trigger and the warmup route past; both still
  // require CRON_SECRET themselves.
  excludedPath: ["/login.html", "/api/login", "/favicon.svg", "/assets/app.css", "/api/warmup/run", "/.netlify/functions/warmup-cron"],
};
