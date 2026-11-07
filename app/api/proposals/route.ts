import { auth, handle, ok, options, readJson, ApiError } from "@/lib/http";
import { getCards, getCurrentProposal, getAllProposals, log, nextVersion, putProposal, setCurrentProposal } from "@/lib/db";
import { num, onlyKeys, str, strArr } from "@/lib/validate";
import { CHIEF, MAX_VERSIONS, type Proposal } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

// Server-managed fields (id, version, status, createdAt) are accepted but ignored.
const FIELDS = ["people", "time", "place", "estCostPerPerson", "whyPairs", "id", "version", "status", "createdAt"];

export const GET = handle(async () => ok({ proposals: await getAllProposals() }));

export const POST = handle(async (req: Request) => {
  const caller = auth(req, [CHIEF]);
  const body = await readJson(req);
  onlyKeys(body, FIELDS, "Proposal");

  const people = strArr(body, "people", { min: 2, max: 6 });
  const known = new Set((await getCards()).map((c) => c.botId));
  const unknown = people.filter((p) => !known.has(p));
  if (unknown.length)
    throw new ApiError(400, `people not found in cards: ${unknown.join(", ")}`, `known botIds: ${[...known].join(", ") || "(none yet)"}`);
  if (new Set(people).size !== people.length) throw new ApiError(400, "'people' contains duplicates");

  const place = body.place as Record<string, unknown> | undefined;
  if (!place || typeof place !== "object" || Array.isArray(place))
    throw new ApiError(400, "'place' is required: {\"name\":\"...\",\"address\":\"...\",\"url\":\"optional\"}");
  onlyKeys(place, ["name", "address", "url"], "place");

  const wp = body.whyPairs ?? [];
  if (!Array.isArray(wp)) throw new ApiError(400, "'whyPairs' must be an array of {a,b,reason}");
  const whyPairs = wp.map((x, i) => {
    if (!x || typeof x !== "object") throw new ApiError(400, `whyPairs[${i}] must be {a,b,reason}`);
    const o = x as Record<string, unknown>;
    onlyKeys(o, ["a", "b", "reason"], `whyPairs[${i}]`);
    return { a: str(o, "a", { max: 60 })!, b: str(o, "b", { max: 60 })!, reason: str(o, "reason", { max: 300 })! };
  });

  const time = str(body, "time", { max: 120 })!;
  const estCostPerPerson = num(body, "estCostPerPerson");
  const placeOut = {
    name: str(place, "name", { max: 120 })!,
    address: str(place, "address", { max: 200 })!,
    ...(place.url ? { url: str(place, "url", { max: 500 }) } : {}),
  };

  const prev = await getCurrentProposal();
  if (prev?.status === "agreed") throw new ApiError(409, "a plan is already agreed; POST /api/reset to start over");
  if (prev?.status === "failed") throw new ApiError(409, "negotiation already failed; POST /api/reset to start over");

  const version = await nextVersion();
  const p: Proposal = {
    id: `p${version}-${Math.random().toString(36).slice(2, 7)}`,
    version,
    people,
    time,
    place: placeOut,
    estCostPerPerson,
    whyPairs,
    status: version > MAX_VERSIONS ? "failed" : "open",
    createdAt: new Date().toISOString(),
  };

  if (prev && prev.status === "open") {
    prev.status = "superseded";
    await putProposal(prev);
    await log("proposal.superseded", caller, { id: prev.id, version: prev.version });
  }
  await putProposal(p);
  await setCurrentProposal(p.id);
  await log(p.status === "failed" ? "proposal.failed" : "proposal.created", caller, p);
  if (p.status === "failed")
    return ok({ ok: false, proposal: p, error: `max ${MAX_VERSIONS} versions reached; negotiation failed. POST /api/reset to start over.` }, 409);
  return ok({ ok: true, proposal: p }, 201);
});
