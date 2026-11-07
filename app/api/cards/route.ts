import { auth, handle, ok, options, readJson, ApiError } from "@/lib/http";
import { getCards, log, putCard } from "@/lib/db";
import { oneOf, onlyKeys, str, strArr } from "@/lib/validate";
import { CHIEF, type Card } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

const FIELDS = ["botId", "alias", "interests", "offers", "seeking", "freeWindows", "budgetTier", "dietary", "area", "createdAt"];

export const GET = handle(async () => ok({ cards: await getCards() }));

export const POST = handle(async (req: Request) => {
  const caller = auth(req);
  if (caller === CHIEF) throw new ApiError(403, "the chief does not post a Card");
  const body = await readJson(req);
  onlyKeys(body, FIELDS, "Card");
  let botId = caller;
  if (body.botId !== undefined && body.botId !== caller) {
    if (caller !== "admin") throw new ApiError(400, `'botId' must be your own id ('${caller}') or omitted`);
    botId = str(body, "botId")!;
  }
  if (caller === "admin" && body.botId === undefined) throw new ApiError(400, "admin must pass 'botId'");
  const card: Card = {
    botId,
    alias: str(body, "alias", { max: 60 })!,
    interests: strArr(body, "interests", { max: 5, min: 1 }),
    offers: str(body, "offers", { max: 300 })!,
    seeking: str(body, "seeking", { max: 300 })!,
    freeWindows: strArr(body, "freeWindows", { min: 1, max: 10 }),
    budgetTier: oneOf(body, "budgetTier", ["$", "$$", "$$$"] as const)!,
    dietary: strArr(body, "dietary", { optional: true, max: 10 }),
    area: str(body, "area", { max: 100 })!,
    createdAt: new Date().toISOString(),
  };
  await putCard(card);
  await log("card.upserted", botId, card);
  return ok({ ok: true, card }, 201);
});
