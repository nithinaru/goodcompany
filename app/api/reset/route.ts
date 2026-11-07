import { auth, handle, ok, options } from "@/lib/http";
import { reset } from "@/lib/db";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

// Clears cards, proposals, responses, plan and log. ?scoreboard=1 also clears eval results.
export const POST = handle(async (req: Request) => {
  auth(req, ["admin"]);
  const all = new URL(req.url).searchParams.get("scoreboard") === "1";
  await reset(all);
  return ok({ ok: true, cleared: all ? "everything" : "everything except scoreboard" });
});
