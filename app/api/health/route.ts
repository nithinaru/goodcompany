import { ok, options } from "@/lib/http";
import { storeKind } from "@/lib/store";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
export const GET = async () => ok({ ok: true, store: storeKind() });
