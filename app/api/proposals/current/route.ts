import { handle, ok, options } from "@/lib/http";
import { getCurrentProposal } from "@/lib/db";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

// Latest proposal (any status). Bots should only respond when proposal.status === "open".
export const GET = handle(async () => ok({ proposal: await getCurrentProposal() }));
