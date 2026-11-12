// End to end through the handlers with the sample store.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET = "test-secret";
process.env.PITWALL_PASSWORD = "demo";
const { match } = await import("../src/api/routes.ts");
const { sessionCookieValue } = await import("../src/auth.ts");
const { resetStore, store } = await import("../src/store/memory.ts");

async function call(method: string, path: string, body?: unknown, authed = true) {
  const m = match(new URL(`http://t${path}`).pathname)!;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authed) headers.cookie = `pitwall_auth=${sessionCookieValue()}`;
  const res = await m.handler(new Request(`http://t${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), m.params);
  return { status: res.status, body: await res.json(), res };
}

test("every data route needs a session", async () => {
  for (const p of ["/api/dashboard", "/api/queue", "/api/profiles", "/api/deals", "/api/targets", "/api/contacts", "/api/mailbox"]) {
    assert.equal((await call("GET", p, undefined, false)).status, 401, p);
  }
});

test("login sets the cookie only for the right password", async () => {
  assert.equal((await call("POST", "/api/login", { password: "nope" }, false)).status, 401);
  const ok = await call("POST", "/api/login", { password: "demo" }, false);
  assert.equal(ok.status, 200);
  assert.match(ok.res.headers.get("set-cookie") ?? "", /pitwall_auth=[0-9a-f]{64}; HttpOnly/);
});

test("approve places a clean draft in the mock Drafts folder and nowhere else", async () => {
  resetStore();
  const clean = (await call("GET", "/api/queue")).body.drafts.find((d: any) => d.state === "linted" && !d.blocks.length);
  const r = await call("POST", `/api/queue/${clean.id}/approve`);
  assert.equal(r.status, 200);
  assert.equal(store().mailbox.all().length, 1);
  assert.equal(store().mailbox.all()[0].to, clean.contact.email);
  assert.equal((await call("POST", `/api/queue/${clean.id}/approve`)).status, 409); // already placed
  assert.equal((await call("POST", `/api/queue/${clean.id}/reject`, { reason: "x" })).status, 409);
});

test("a blocked draft cannot be approved, whatever the browser does", async () => {
  resetStore();
  const blocked = (await call("GET", "/api/queue")).body.drafts.find((d: any) => d.blocks.some((b: any) => b.code === "team_name"));
  const r = await call("POST", `/api/queue/${blocked.id}/approve`);
  assert.equal(r.status, 409);
  assert.equal(store().mailbox.all().length, 0);
});

test("the sequencer only drafts for accounts with quota, and its drafts are linted", async () => {
  resetStore();
  const r = await call("POST", "/api/sequencer/run", {});
  assert.equal(r.status, 200);
  assert.equal(r.body.caps["hello@program-two.example"].cap, 0); // still warming
  assert.equal(r.body.caps["team@program-three.example"].cap, 0); // DNS held
  assert.ok(r.body.drafted > 0 && r.body.drafted <= r.body.caps["outreach@program-one.example"].remaining);
  const fresh = store().drafts.filter((d) => d.id > 7);
  assert.ok(fresh.every((d) => d.scorecard && d.account_id === 1));
  // a second run the same day finds the slots already claimed
  assert.equal((await call("POST", "/api/sequencer/run", {})).body.drafted, 0);
});

test("warmup mail only moves between owned mailboxes and a DNS-held account sits out", async () => {
  resetStore();
  const r = await call("POST", "/api/warmup/run", {});
  assert.equal(r.status, 200);
  const owned = new Set(store().settings.warmup_allowlist);
  assert.ok(store().warmupTransport.sent.every((m) => owned.has(m.from) && owned.has(m.to)));
  assert.match(r.body.accounts.find((a: any) => a.email === "team@program-three.example").held, /DNS not live/);
});
