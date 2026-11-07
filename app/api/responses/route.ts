import { auth, handle, ok, options, readJson, ApiError } from "@/lib/http";
import { getCurrentProposal, getProposal, getResponses, log, putResponse } from "@/lib/db";
import { oneOf, onlyKeys, str } from "@/lib/validate";
import { CHIEF, type BotResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

// Exactly the Response schema. Anything else ("message", "explanation", "note", ...) is rejected:
// this is the structural privacy guarantee.
const FIELDS = ["proposalId", "botId", "kind", "field", "allowed", "reason", "createdAt"];

export const GET = handle(async (req: Request) => {
  let pid = new URL(req.url).searchParams.get("proposalId");
  if (!pid) pid = (await getCurrentProposal())?.id ?? null;
  if (!pid) return ok({ proposalId: null, responses: [] });
  return ok({ proposalId: pid, responses: await getResponses(pid) });
});

export const POST = handle(async (req: Request) => {
  const caller = auth(req);
  if (caller === CHIEF) throw new ApiError(403, "the chief does not respond to proposals");
  const body = await readJson(req);
  onlyKeys(body, FIELDS, "Response");

  let botId = caller;
  if (body.botId !== undefined && body.botId !== caller) {
    if (caller !== "admin") throw new ApiError(400, `'botId' must be your own id ('${caller}') or omitted`);
    botId = str(body, "botId")!;
  }

  const proposalId = str(body, "proposalId")!;
  const p = await getProposal(proposalId);
  if (!p) throw new ApiError(404, `proposal '${proposalId}' not found`, "GET /api/proposals/current for the latest id");
  if (p.status !== "open")
    throw new ApiError(409, `proposal '${proposalId}' is ${p.status}, not open`, "GET /api/proposals/current and respond to the open one");
  if (!p.people.includes(botId)) throw new ApiError(403, `'${botId}' is not in this proposal's people`);

  const kind = oneOf(body, "kind", ["ACCEPT", "COUNTER", "DECLINE"] as const)!;
  const r: BotResponse = { proposalId, botId, kind, createdAt: new Date().toISOString() };

  if (kind === "ACCEPT") {
    for (const k of ["field", "allowed", "reason"])
      if (body[k] !== undefined) throw new ApiError(400, `ACCEPT must not include '${k}'`, 'send only {"proposalId":"...","kind":"ACCEPT"}');
  } else if (kind === "COUNTER") {
    if (body.reason !== undefined) throw new ApiError(400, "COUNTER must not include 'reason' (reason is for DECLINE)");
    r.field = oneOf(body, "field", ["time", "place", "budget", "group"] as const)!;
    r.allowed = str(body, "allowed", { max: 200 })!;
  } else {
    for (const k of ["field", "allowed"])
      if (body[k] !== undefined) throw new ApiError(400, `DECLINE must not include '${k}'`, "DECLINE takes only 'reason'");
    r.reason = oneOf(body, "reason", ["schedule", "budget", "location", "fit", "other"] as const)!;
  }

  await putResponse(r);
  await log("response.created", botId, r);
  return ok({ ok: true, response: r }, 201);
});
