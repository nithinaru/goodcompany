import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(public status: number, message: string, public hint?: string) { super(message); }
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders() });
}

export function fail(status: number, error: string, hint?: string) {
  return NextResponse.json({ error, ...(hint ? { hint } : {}) }, { status, headers: corsHeaders() });
}

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Cache-Control": "no-store",
  };
}

export function options() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// Wrap a handler so thrown ApiErrors become clean JSON errors.
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return fail(e.status, e.message, e.hint);
      console.error(e);
      return fail(500, `internal error: ${(e as Error).message}`);
    }
  };
}

function tokens(): Record<string, string> {
  try {
    return JSON.parse(process.env.BOT_TOKENS || "{}");
  } catch {
    throw new ApiError(500, "server misconfigured: BOT_TOKENS is not valid JSON");
  }
}

// Returns the botId bound to the bearer token.
export function auth(req: Request, allowed?: string[]): string {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new ApiError(401, "missing bearer token", "send header: Authorization: Bearer <your token>");
  const botId = tokens()[m[1].trim()];
  if (!botId) throw new ApiError(401, "unknown token", "check the token you were given");
  if (allowed && !allowed.includes(botId) && botId !== "admin")
    throw new ApiError(403, `bot '${botId}' may not call this endpoint`, `allowed: ${allowed.join(", ")}`);
  return botId;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "body is not valid JSON", "send Content-Type: application/json and a JSON object body");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ApiError(400, "body must be a JSON object");
  return body as Record<string, unknown>;
}
