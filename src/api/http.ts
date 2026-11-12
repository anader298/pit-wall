export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export async function readJson(req: Request): Promise<Record<string, any>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? b : {};
  } catch {
    return {};
  }
}

export type Handler = (req: Request, params: Record<string, string>) => Promise<Response>;
