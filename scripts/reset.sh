#!/usr/bin/env bash
# Clears demo state (keeps the scoreboard). Usage: scripts/reset.sh [BASE_URL]
cd "$(dirname "$0")/.."
BOT_TOKENS=$(grep '^BOT_TOKENS=' .env.local | sed "s/^BOT_TOKENS=//; s/^'//; s/'$//")
ADMIN=$(node -e 'const m=JSON.parse(process.argv[1]);console.log(Object.keys(m).find(k=>m[k]==="admin"))' "$BOT_TOKENS")
BASE="${1:-http://localhost:3000}"
curl -sS -X POST "${BASE%/}/api/reset" -H "Authorization: Bearer $ADMIN"
echo
