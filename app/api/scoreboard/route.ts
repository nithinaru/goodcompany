import { auth, handle, ok, options, readJson } from "@/lib/http";
import { getScoreboard, log, putScoreboard } from "@/lib/db";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

export const GET = handle(async () => ok({ scoreboard: await getScoreboard() }));

// Written by eval/score.ts with the admin token.
export const POST = handle(async (req: Request) => {
  const caller = auth(req, ["admin"]);
  const body = await readJson(req);
  await putScoreboard(body);
  await log("scoreboard.updated", caller, { summary: (body as { summary?: unknown }).summary ?? null });
  return ok({ ok: true }, 201);
});
