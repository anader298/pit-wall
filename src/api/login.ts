// POST /api/login {password} sets the session cookie (30 days).
// POST /api/logout clears it.
import { checkPassword, SESSION_COOKIE, sessionCookieValue, sessionSecret } from "../auth.ts";
import { json, readJson, type Handler } from "./http.ts";

const secureFlag = () => (process.env.PITWALL_INSECURE_COOKIE === "1" ? "" : " Secure;");

export const login: Handler = async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (new URL(req.url).pathname === "/api/logout") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", "set-cookie": `${SESSION_COOKIE}=; HttpOnly; Path=/;${secureFlag()} SameSite=Lax; Max-Age=0` },
    });
  }
  if (!sessionSecret()) return json({ error: "server not configured" }, 500);
  const body = await readJson(req);
  const password = typeof body.password === "string" ? body.password : "";
  if (!checkPassword(password)) return json({ error: "wrong password" }, 401);
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json",
      "set-cookie": `${SESSION_COOKIE}=${sessionCookieValue()}; HttpOnly; Path=/;${secureFlag()} SameSite=Lax; Max-Age=2592000`,
    },
  });
};
