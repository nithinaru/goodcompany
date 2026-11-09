<h1 align="center">Good Company</h1>

<p align="center"><b>Agents that find the right people to meet and book the coffee chat, without sharing your private details.</b></p>

<p align="center">
  <img src="docs/replay.gif" alt="Replay of a real run: four agents share cards, the chief proposes, Maya declines on budget, v2 gets everyone's yes" width="800">
</p>

Tell your agent you're free. It finds people worth meeting, and their agents agree on a time, a place and a budget. You never join a group chat, and nobody's private details leave their own agent.

The GIF above is a real run with five Grok Bots: four personal agents and one chief.

## How it works

```
 personal agent ──Card──▶            ◀──Card── personal agent
 (private memory)        CHIEF AGENT           (private memory)
         ◀── proposal ──  sees only   ── proposal ──▶
         ── ACCEPT / DECLINE budget ──▶  Cards + reason codes
                              │
                              ▼
                        agreed plan ✓
```

1. **Cards.** Each personal agent posts a short card: budget tier, free evenings, area, interests. Raw context stays on the agent.
2. **Proposal.** The chief agent picks a place and a time from the cards.
3. **Responses.** Agents reply `ACCEPT`, `COUNTER`, or `DECLINE` with a reason code like `budget`. The API rejects free-text reasons, so private details can't leak.
4. **Plan.** When everyone accepts, the chief posts the plan, including why each pair will click and some conversation starters.

<p align="center"><img src="docs/hero.png" alt="Agreed plan: Udupi Palace, Sat 6:30pm, $18 per person" width="800"></p>

## Privacy by design

Maya is paying off student loans and has to keep dinners under $25. Her agent knows this. The chief only sees `$` and, later, `DECLINE: budget`.

<p align="center"><img src="docs/privacy.png" alt="Maya's private context next to the card the chief sees" width="800"></p>

## Results

We ran the same task, on the same Grok models, two ways: one agent with everyone's raw data, and our coordinated agents.

<p align="center"><img src="docs/scoreboard.png" alt="Scoreboard: single agent read 5/5 private facts, chief read 0/5" width="560"></p>

| | Single agent | Good Company |
|---|---|---|
| Private facts the planner could read | 5 / 5 | **0 / 5** |
| Constraint violations | 0 | **0** |
| Rounds to agree | 1 | 2 |

## Run it

```bash
npm install
node scripts/gen-env.mjs      # writes .env.local with bot tokens
npm run dev                   # demo at http://localhost:3000
npm run smoke                 # 38-check end-to-end API test
```

To use real Grok Bots, expose the service with `cloudflared tunnel --url http://localhost:3000`, then run `npx tsx scripts/gen-prompts.ts <URL>` and paste each prompt into its bot.

<details>
<summary>API and eval</summary>

- API contract: [API.md](API.md). Writes need a bearer token, and GETs are public.
- Routes: `/api/cards`, `/api/proposals`, `/api/responses`, `/api/plan`, `/api/log`, `/api/scoreboard`, `/api/reset`
- Storage is in memory by default. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to use Upstash.
- Eval: `npm run eval:baseline` (needs `XAI_API_KEY`) then `npm run eval:score`. Results go to `eval/out/results.json`.

</details>

<p align="center"><sub>Built with Next.js and Grok.</sub></p>
