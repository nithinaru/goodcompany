import { auth, handle, ok, options, readJson, ApiError } from "@/lib/http";
import { getCards, getCurrentProposal, getPlan, getResponses, log, putPlan, putProposal } from "@/lib/db";
import { num, onlyKeys, str, strArr } from "@/lib/validate";
import { CHIEF, type Plan } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

const FIELDS = ["proposalId", "people", "time", "place", "estCostPerPerson", "whyYoullClick", "conversationStarters", "createdAt"];

export const GET = handle(async () => ok({ plan: await getPlan() }));

export const POST = handle(async (req: Request) => {
  const caller = auth(req, [CHIEF]);
  const body = await readJson(req);
  onlyKeys(body, FIELDS, "Plan");

  const cur = await getCurrentProposal();
  if (!cur) throw new ApiError(409, "no proposal exists yet");
  const proposalId = str(body, "proposalId", { optional: true }) ?? cur.id;
  if (proposalId !== cur.id) throw new ApiError(409, `proposalId must be the current proposal '${cur.id}'`);
  if (cur.status !== "open") throw new ApiError(409, `current proposal is ${cur.status}, not open`);

  const responses = await getResponses(cur.id);
  const byBot = new Map(responses.map((r) => [r.botId, r.kind]));
  const missing = cur.people.filter((p) => byBot.get(p) !== "ACCEPT");
  if (missing.length)
    throw new ApiError(
      409,
      `not everyone has ACCEPTed: ${missing.map((m) => `${m}=${byBot.get(m) ?? "no response"}`).join(", ")}`,
      "wait for all ACCEPTs, or post a revised proposal"
    );

  const cards = new Map((await getCards()).map((c) => [c.botId, c]));
  const rawPlace = (body.place ?? cur.place) as Record<string, unknown>;
  if (!rawPlace || typeof rawPlace !== "object" || Array.isArray(rawPlace)) throw new ApiError(400, "'place' must be {name,address,url?}");
  onlyKeys(rawPlace, ["name", "address", "url"], "place");

  const plan: Plan = {
    proposalId: cur.id,
    people: cur.people.map((b) => ({ botId: b, alias: cards.get(b)?.alias ?? b })),
    time: str(body, "time", { optional: true, max: 120 }) ?? cur.time,
    place: rawPlace as Plan["place"],
    estCostPerPerson: body.estCostPerPerson === undefined ? cur.estCostPerPerson : num(body, "estCostPerPerson"),
    whyYoullClick: strArr(body, "whyYoullClick", { min: 1, max: 10 }),
    conversationStarters: strArr(body, "conversationStarters", { optional: true, max: 5 }),
    createdAt: new Date().toISOString(),
  };
  cur.status = "agreed";
  await putProposal(cur);
  await putPlan(plan);
  await log("plan.created", caller, plan);
  return ok({ ok: true, plan }, 201);
});
