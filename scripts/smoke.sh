#!/usr/bin/env bash
# Full-flow smoke test: 4 cards -> v1 -> Daniel COUNTERs on time -> v2 -> all ACCEPT -> plan.
# Also checks the validation rules. Usage: scripts/smoke.sh [BASE_URL]
# Tokens are read from BOT_TOKENS (env or .env.local).
set -u
cd "$(dirname "$0")/.."

if [ -z "${BOT_TOKENS:-}" ] && [ -f .env.local ]; then
  BOT_TOKENS=$(grep '^BOT_TOKENS=' .env.local | sed "s/^BOT_TOKENS=//; s/^'//; s/'$//")
fi
BASE="${1:-${SERVICE_URL:-http://localhost:3000}}"
BASE="${BASE%/}"

tok() { node -e 'const m=JSON.parse(process.argv[1]);const t=Object.keys(m).find(k=>m[k]===process.argv[2]);if(!t){process.exit(1)}console.log(t)' "$BOT_TOKENS" "$1"; }
ADMIN=$(tok admin) || { echo "no admin token in BOT_TOKENS"; exit 1; }
CHIEF=$(tok chief); NITHIN=$(tok nithin); MAYA=$(tok maya); DANIEL=$(tok daniel); PRIYA=$(tok priya)

PASS=0; FAIL=0
BODY=""; CODE=""
call() { # method path token [json]
  local out
  if [ -n "${4:-}" ]; then
    out=$(curl -sS -w '\n%{http_code}' -X "$1" "$BASE$2" -H "Authorization: Bearer $3" -H 'Content-Type: application/json' -d "$4")
  else
    out=$(curl -sS -w '\n%{http_code}' -X "$1" "$BASE$2" -H "Authorization: Bearer $3")
  fi
  CODE=$(printf '%s' "$out" | tail -n1)
  BODY=$(printf '%s' "$out" | sed '$d')
}
expect() { # name expected_code
  if [ "$CODE" = "$2" ]; then PASS=$((PASS+1)); echo "  ok   $1 ($CODE)";
  else FAIL=$((FAIL+1)); echo "  FAIL $1: expected $2 got $CODE: $BODY"; fi
}
jget() { printf '%s' "$BODY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let v=JSON.parse(s);for(const k of process.argv[1].split("."))v=v?.[k];console.log(typeof v==="object"?JSON.stringify(v):v)})' "$1"; }

echo "smoke test against $BASE"
call POST /api/reset "$ADMIN"; expect "reset" 200

echo "cards"
call POST /api/cards "$NITHIN" '{"alias":"Nithin","interests":["AI agents","Shopify","art","Ye","budget travel"],"offers":"agent building, startup pricing help","seeking":"Shopify merchants as users, robotics people","freeWindows":["Sat eve","Sun eve"],"budgetTier":"$$","dietary":[],"area":"SF / East Bay"}'; expect "nithin card" 201
call POST /api/cards "$MAYA" '{"alias":"Maya","interests":["health tech","product","clinical workflows"],"offers":"clinical workflow insight","seeking":"engineers for a side project","freeWindows":["Fri eve","Sat eve"],"budgetTier":"$","dietary":["vegetarian"],"area":"SF"}'; expect "maya card" 201
call POST /api/cards "$DANIEL" '{"alias":"Daniel","interests":["coffee","small business","Shopify"],"offers":"real small-business operating experience","seeking":"pricing and tech help","freeWindows":["weekday eve","Sat eve"],"budgetTier":"$$","dietary":[],"area":"Oakland"}'; expect "daniel card" 201
call POST /api/cards "$PRIYA" '{"alias":"Priya","interests":["robotics","startups","research"],"offers":"robotics expertise","seeking":"founders, to see how startups work","freeWindows":["Sat eve","Sun eve"],"budgetTier":"$","dietary":[],"area":"Berkeley"}'; expect "priya card" 201
call POST /api/cards "$PRIYA" '{"alias":"Priya","interests":["a","b","c","d","e","f"],"offers":"x","seeking":"y","freeWindows":["Sat eve"],"budgetTier":"$","area":"Berkeley"}'; expect "reject >5 interests" 400
call POST /api/cards "$PRIYA" '{"alias":"Priya","interests":["a"],"offers":"x","seeking":"y","freeWindows":["Sat eve"],"budgetTier":"$","area":"Berkeley","privateNotes":"mom"}'; expect "reject extra card field" 400
call GET /api/cards "$CHIEF"; expect "get cards" 200
[ "$(jget cards | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).length))')" = "4" ] && { PASS=$((PASS+1)); echo "  ok   4 cards stored"; } || { FAIL=$((FAIL+1)); echo "  FAIL expected 4 cards"; }

echo "auth"
call POST /api/proposals "$NITHIN" '{}'; expect "personal bot cannot propose" 403
call POST /api/proposals "nope" '{}'; expect "bad token" 401

echo "proposal v1"
P1='{"people":["nithin","maya","daniel","priya"],"time":"Sat 7:30pm","place":{"name":"Shan Dong Restaurant","address":"328 10th St, Oakland, CA"},"estCostPerPerson":22,"whyPairs":[{"a":"nithin","b":"daniel","reason":"Daniel gets pricing help; Nithin gets a real merchant view"},{"a":"priya","b":"nithin","reason":"Priya sees how a startup runs; Nithin meets robotics"},{"a":"priya","b":"maya","reason":"Maya needs engineers; Priya gets a health-tech use case"}]}'
call POST /api/proposals "$CHIEF" "$P1"; expect "chief posts v1" 201
PID1=$(jget proposal.id)
call GET /api/proposals/current "$DANIEL"; expect "get current" 200
[ "$(jget proposal.version)" = "1" ] && { PASS=$((PASS+1)); echo "  ok   current is v1"; } || { FAIL=$((FAIL+1)); echo "  FAIL current not v1"; }

echo "responses v1 (validation)"
call POST /api/responses "$MAYA" "{\"proposalId\":\"$PID1\",\"kind\":\"ACCEPT\",\"message\":\"sure, I can't afford much though\"}"; expect "reject free-text field on Response" 400
call POST /api/responses "$DANIEL" "{\"proposalId\":\"$PID1\",\"kind\":\"COUNTER\"}"; expect "reject COUNTER without field/allowed" 400
call POST /api/responses "$PRIYA" "{\"proposalId\":\"$PID1\",\"kind\":\"DECLINE\"}"; expect "reject DECLINE without reason" 400
call POST /api/responses "$PRIYA" "{\"proposalId\":\"$PID1\",\"kind\":\"DECLINE\",\"reason\":\"my mom\"}"; expect "reject bad reason code" 400
call POST /api/responses "$MAYA" "{\"proposalId\":\"$PID1\",\"kind\":\"ACCEPT\",\"botId\":\"daniel\"}"; expect "reject spoofed botId" 400

echo "responses v1"
call POST /api/responses "$NITHIN" "{\"proposalId\":\"$PID1\",\"kind\":\"ACCEPT\"}"; expect "nithin ACCEPT v1" 201
call POST /api/responses "$MAYA" "{\"proposalId\":\"$PID1\",\"kind\":\"ACCEPT\"}"; expect "maya ACCEPT v1" 201
call POST /api/responses "$PRIYA" "{\"proposalId\":\"$PID1\",\"kind\":\"ACCEPT\"}"; expect "priya ACCEPT v1" 201
call POST /api/responses "$DANIEL" "{\"proposalId\":\"$PID1\",\"kind\":\"COUNTER\",\"field\":\"time\",\"allowed\":\"Sat 6:30pm\"}"; expect "daniel COUNTER time" 201
call POST /api/plan "$CHIEF" '{"whyYoullClick":["x"]}'; expect "plan blocked until all ACCEPT" 409
call GET "/api/responses?proposalId=$PID1" "$CHIEF"; expect "get responses v1" 200

echo "proposal v2"
P2=$(printf '%s' "$P1" | sed 's/Sat 7:30pm/Sat 6:30pm/')
call POST /api/proposals "$CHIEF" "$P2"; expect "chief posts v2" 201
PID2=$(jget proposal.id)
[ "$(jget proposal.version)" = "2" ] && { PASS=$((PASS+1)); echo "  ok   v2 version=2"; } || { FAIL=$((FAIL+1)); echo "  FAIL v2 version"; }
call POST /api/responses "$NITHIN" "{\"proposalId\":\"$PID1\",\"kind\":\"ACCEPT\"}"; expect "reject response to superseded v1" 409
for t in "$NITHIN" "$MAYA" "$DANIEL" "$PRIYA"; do
  call POST /api/responses "$t" "{\"proposalId\":\"$PID2\",\"kind\":\"ACCEPT\"}"; expect "ACCEPT v2" 201
done

echo "plan"
call POST /api/plan "$CHIEF" '{"whyYoullClick":["Daniel and Nithin: pricing help for a real Shopify merchant","Priya and Maya: robotics meets clinical workflows","Priya and Nithin: a robotics PhD meets an agent founder"],"conversationStarters":["What would you automate first in a coffee cart?","Which robot demo impressed you most this year?","What is the most underpriced thing you sell or use?"]}'; expect "chief posts plan" 201
call GET /api/plan "$MAYA"; expect "get plan" 200
[ "$(jget plan.proposalId)" = "$PID2" ] && { PASS=$((PASS+1)); echo "  ok   plan is for v2"; } || { FAIL=$((FAIL+1)); echo "  FAIL plan proposalId"; }
call GET /api/proposals/current "$MAYA"
[ "$(jget proposal.status)" = "agreed" ] && { PASS=$((PASS+1)); echo "  ok   v2 status agreed"; } || { FAIL=$((FAIL+1)); echo "  FAIL v2 not agreed"; }
call GET /api/log "$MAYA"; expect "get log" 200
echo "  log events: $(printf '%s' "$BODY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).events.map(e=>e.type).join(" ")))')"
call GET /api/scoreboard "$MAYA"; expect "get scoreboard" 200

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" = "0" ]
