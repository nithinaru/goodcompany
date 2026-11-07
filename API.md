# Coordination API

JSON in, JSON out. Writes need `Authorization: Bearer <token>` (tokens in `BOT_TOKENS`). All GETs are public (no token) so the UI can read them from the browser. CORS is open.

Errors always look like `{ "error": "what was wrong", "hint": "how to fix it" }` with a 4xx status.

| Method | Path | Who | Returns |
|---|---|---|---|
| GET | `/api/health` | anyone | `{ ok, store: "memory" \| "upstash" }` |
| POST | `/api/cards` | personal bot | `201 { ok, card }` |
| GET | `/api/cards` | anyone | `{ cards: Card[] }` |
| POST | `/api/proposals` | chief | `201 { ok, proposal }` (4th version: `409 { ok:false, proposal (status "failed"), error }`) |
| GET | `/api/proposals` | anyone | `{ proposals: Proposal[] }` (all versions, ascending) |
| GET | `/api/proposals/current` | anyone | `{ proposal: Proposal \| null }` (latest, any status; respond only when `status === "open"`) |
| POST | `/api/responses` | personal bot | `201 { ok, response }` |
| GET | `/api/responses?proposalId=` | anyone | `{ proposalId, responses: Response[] }` (no param = current proposal; one entry per bot, latest wins) |
| POST | `/api/plan` | chief | `201 { ok, plan }` |
| GET | `/api/plan` | anyone | `{ plan: Plan \| null }` |
| GET | `/api/log?since=<seq>` | anyone | `{ events: { seq, type, botId, at, data }[] }` |
| GET | `/api/scoreboard` | anyone | `{ scoreboard: Results \| null }` (shape: see `eval/out/results.json`) |
| POST | `/api/scoreboard` | admin | stores eval results (used by `eval/score.ts`) |
| POST | `/api/reset` | admin | clears everything except the scoreboard (`?scoreboard=1` clears that too) |

Log event types: `card.upserted`, `proposal.created`, `proposal.superseded`, `proposal.failed`, `response.created`, `plan.created`, `scoreboard.updated`.

Models are exactly section 4 of `good-company-handoff.md`. The server sets `botId` (from the token), `id`, `version`, `status`, `createdAt`.

## curl examples (for the bot prompts)

```bash
# personal bot: post card
curl -s -X POST $BASE/api/cards -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"alias":"Maya","interests":["health tech"],"offers":"clinical workflow insight","seeking":"engineers","freeWindows":["Fri eve","Sat eve"],"budgetTier":"$","dietary":["vegetarian"],"area":"SF"}'

# personal bot: poll + respond
curl -s $BASE/api/proposals/current
curl -s -X POST $BASE/api/responses -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"proposalId":"p1-abcde","kind":"ACCEPT"}'
curl -s -X POST $BASE/api/responses -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"proposalId":"p1-abcde","kind":"COUNTER","field":"time","allowed":"Sat 6:30pm"}'
curl -s -X POST $BASE/api/responses -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"proposalId":"p1-abcde","kind":"DECLINE","reason":"budget"}'

# chief
curl -s $BASE/api/cards
curl -s -X POST $BASE/api/proposals -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"people":["nithin","maya","daniel","priya"],"time":"Sat 6:30pm","place":{"name":"...","address":"..."},"estCostPerPerson":22,"whyPairs":[{"a":"nithin","b":"daniel","reason":"..."}]}'
curl -s "$BASE/api/responses?proposalId=p1-abcde"
curl -s -X POST $BASE/api/plan -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"whyYoullClick":["..."],"conversationStarters":["...","...","..."]}'
```
