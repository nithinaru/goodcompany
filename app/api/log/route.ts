import { handle, ok, options } from "@/lib/http";
import { getLog } from "@/lib/db";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

// Optional ?since=<seq> returns only events with seq > since (for polling).
export const GET = handle(async (req: Request) => {
  const since = Number(new URL(req.url).searchParams.get("since") || 0);
  const events = (await getLog()).filter((e) => e.seq > since);
  return ok({ events });
});
