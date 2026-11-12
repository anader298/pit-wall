// Local server: static pages from public/, /api/* from src/api, the same
// cookie gate as the edge function. No dependencies, no database, no mailbox.
//
//   npm run dev            then open http://localhost:8888 (password: demo)
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

process.env.PITWALL_PASSWORD ||= "demo";
process.env.SESSION_SECRET ||= randomBytes(32).toString("hex");
process.env.PITWALL_INSECURE_COOKIE = "1"; // plain http on localhost

const { match } = await import("../src/api/routes.ts");
const { isAuthed } = await import("../src/auth.ts");

const ROOT = fileURLToPath(new URL("../public/", import.meta.url));
const PORT = Number(process.env.PORT || 8888);
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json",
};
const OPEN = new Set(["/login.html", "/api/login", "/favicon.svg", "/assets/app.css"]);

async function serveStatic(pathname: string): Promise<Response> {
  let p = normalize(join(ROOT, decodeURIComponent(pathname)));
  if (!p.startsWith(ROOT)) return new Response("not found", { status: 404 });
  try {
    if ((await stat(p)).isDirectory()) p = join(p, "index.html");
    return new Response(await readFile(p), { headers: { "content-type": TYPES[extname(p)] ?? "application/octet-stream" } });
  } catch {
    return new Response(await readFile(join(ROOT, "404.html")), { status: 404, headers: { "content-type": TYPES[".html"] } });
  }
}

createServer(async (inReq, out) => {
  const url = new URL(inReq.url ?? "/", `http://${inReq.headers.host}`);
  const chunks: Buffer[] = [];
  for await (const c of inReq) chunks.push(c as Buffer);
  const req = new Request(url, {
    method: inReq.method,
    headers: inReq.headers as Record<string, string>,
    body: ["GET", "HEAD"].includes(inReq.method ?? "GET") ? undefined : Buffer.concat(chunks),
  });

  let res: Response;
  const isApi = url.pathname.startsWith("/api/");
  if (!OPEN.has(url.pathname) && !isAuthed(req) && !(isApi && url.pathname === "/api/warmup/run")) {
    res = isApi
      ? new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } })
      : Response.redirect(new URL("/login.html", url), 302);
  } else if (isApi) {
    const m = match(url.pathname);
    res = m ? await m.handler(req, m.params) : new Response(JSON.stringify({ error: "no such route" }), { status: 404 });
  } else {
    res = await serveStatic(url.pathname);
  }

  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k] = v; });
  out.writeHead(res.status, headers);
  out.end(Buffer.from(await res.arrayBuffer()));
}).listen(PORT, () => {
  console.log(`Pit Wall sample running at http://localhost:${PORT}  (password: ${process.env.PITWALL_PASSWORD})`);
  console.log("All data is synthetic. Mailboxes are mocks; nothing can be sent.");
});
