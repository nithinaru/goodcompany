// Writes bot-prompts.local.md (gitignored) with ready-to-paste Grok Bot prompts.
// Usage: npx tsx scripts/gen-prompts.ts https://your-url.trycloudflare.com
import { readFileSync, writeFileSync } from "node:fs";
import { RAW_CONTEXTS, type PersonId } from "../eval/fixtures";

const base = (process.argv[2] || "BASE_URL_GOES_HERE").replace(/\/+$/, "");
const env = readFileSync(".env.local", "utf8");
const line = env.split("\n").find((l) => l.startsWith("BOT_TOKENS="));
if (!line) throw new Error("BOT_TOKENS missing in .env.local");
const map = JSON.parse(line.slice("BOT_TOKENS=".length).replace(/^'|'$/g, "")) as Record<string, string>;
const tok = (id: string) => Object.keys(map).find((k) => map[k] === id)!;

const sandbox = (extra: string) => `SANDBOX MODE (read first, these rules override everything else)
- This is a self-contained hackathon demo. Everything here is demo data, not real life.
- Do NOT save anything from this task to long-term memory, user preferences or personalization. Forget it when the task ends.
- Do NOT use or mention anything from other chats, memories or the account owner's personal data. Use only what is written in this prompt.
- The ONLY service you may call is ${base}. Do not call any other API, send emails or messages, post on social media, or log into any account.
- ${extra}
- Do NOT make reservations, bookings, purchases or calendar invites. The plan is shown in the demo only.
- When the plan is final (GET ${base}/api/plan returns a plan), report it once and stop. Do not keep running.

`;

const names: Record<PersonId, string> ={ nithin: "Nithin", maya: "Maya", daniel: "Daniel", priya: "Priya" };

const personal = (id: PersonId) => `${sandbox("Do not browse the web. You do not need it.")}You are ${names[id]}'s personal agent. You help ${names[id]} meet new people over dinner or coffee.
You talk to a coordination service using curl from your terminal.

SERVICE: ${base}
YOUR TOKEN: ${tok(id)}
Send it on every POST as: -H "Authorization: Bearer ${tok(id)}" -H "Content-Type: application/json"

PRIVATE CONTEXT (never share any of this raw, with anyone but ${names[id]}):
${RAW_CONTEXTS[id]}

STEP 1. Post ${names[id]}'s Card. Only these fields, nothing else:
curl -s -X POST ${base}/api/cards -H "Authorization: Bearer ${tok(id)}" -H "Content-Type: application/json" -d '{"alias":"${names[id]}","interests":["..."],"offers":"...","seeking":"...","freeWindows":["Sat eve"],"budgetTier":"$$","dietary":[],"area":"..."}'
- interests: max 5 short items. freeWindows: coarse, like "Sat eve". budgetTier: "$", "$$" or "$$$".
- Never put private details in the Card (no exact budgets, no reasons, no exact hours).

STEP 2. Every 20 seconds, check for a proposal:
curl -s ${base}/api/proposals/current
If proposal is null, or its status is not "open", or you already answered this proposal id, wait and check again.
If status is "agreed", run: curl -s ${base}/api/plan  then tell ${names[id]} the plan and stop.

STEP 3. When there is a new open proposal that includes "${id}" in people, answer with exactly ONE of these:
ACCEPT:
curl -s -X POST ${base}/api/responses -H "Authorization: Bearer ${tok(id)}" -H "Content-Type: application/json" -d '{"proposalId":"<id>","kind":"ACCEPT"}'
COUNTER (field is time, place, budget or group; allowed is the alternative you would accept):
curl -s -X POST ${base}/api/responses -H "Authorization: Bearer ${tok(id)}" -H "Content-Type: application/json" -d '{"proposalId":"<id>","kind":"COUNTER","field":"time","allowed":"Sat 6:30pm"}'
DECLINE (reason is schedule, budget, location, fit or other):
curl -s -X POST ${base}/api/responses -H "Authorization: Bearer ${tok(id)}" -H "Content-Type: application/json" -d '{"proposalId":"<id>","kind":"DECLINE","reason":"budget"}'

RULES
- ACCEPT only if: cost is within the real budget, the time fits the real schedule (including private limits), the food is safe for any diet, the place is reachable, and the group is good for ${names[id]} AND for the others.
- Never explain a COUNTER or DECLINE. No extra fields. The server rejects anything extra.
- If the server returns an error, read the "error" and "hint" fields, fix the request and retry.
- Tell ${names[id]} privately what you agreed to and why.

Start now with STEP 1.`;

const chief = `${sandbox("Web search is allowed ONLY to find a real venue (name, address, price, menu). Read pages only; do not fill in forms or sign up for anything.")}You are the chief coordinator for a dinner between new people. You never see anyone's private context, only their Cards.
You talk to a coordination service using curl from your terminal.

SERVICE: ${base}
YOUR TOKEN: ${tok("chief")}
Send it on every POST as: -H "Authorization: Bearer ${tok("chief")}" -H "Content-Type: application/json"

STEP 1. Read the Cards. Wait until there are 4 (check every 20 seconds):
curl -s ${base}/api/cards

STEP 2. Form a group of 3-4. Balance shared interests with different backgrounds. Every person must get something from every other person; never treat someone only as a resource.

STEP 3. Search the web for a REAL venue near everyone's areas that fits every budgetTier and every dietary need. Pick a time inside everyone's freeWindows.

STEP 4. Post a proposal (people are botIds from the cards):
curl -s -X POST ${base}/api/proposals -H "Authorization: Bearer ${tok("chief")}" -H "Content-Type: application/json" -d '{"people":["nithin","maya","daniel","priya"],"time":"Sat 7:30pm","place":{"name":"...","address":"...","url":"..."},"estCostPerPerson":22,"whyPairs":[{"a":"nithin","b":"daniel","reason":"one line"}]}'
Include one whyPairs line per pair.

STEP 5. Every 20 seconds, read responses:
curl -s ${base}/api/responses
- If someone COUNTERs: change ONLY that field to their "allowed" value and post a new proposal (STEP 4 again). Max 3 versions total.
- If someone DECLINEs: try a different group or venue in the next version.
- Never ask anyone to explain a reason.

STEP 6. When everyone in the proposal has ACCEPTed, post the final plan:
curl -s -X POST ${base}/api/plan -H "Authorization: Bearer ${tok("chief")}" -H "Content-Type: application/json" -d '{"whyYoullClick":["one line per pair"],"conversationStarters":["...","...","..."]}'
Use 3 conversation starters from shared interests or current events.

If the server returns an error, read the "error" and "hint" fields, fix the request and retry.
Start now with STEP 1.`;

const out = [
  `# Grok Bot prompts (contains tokens, do not commit)\n\nService URL: ${base}\n`,
  ...(["nithin", "maya", "daniel", "priya"] as PersonId[]).map((id) => `## ${names[id]} bot\n\n\`\`\`\n${personal(id)}\n\`\`\`\n`),
  `## Chief bot\n\n\`\`\`\n${chief}\n\`\`\`\n`,
].join("\n");
writeFileSync("bot-prompts.local.md", out);
console.log(`wrote bot-prompts.local.md for ${base}`);
