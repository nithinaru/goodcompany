// Generates .env.local with random bot tokens (only if it doesn't exist). Prints nothing secret.
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const path = new URL("../.env.local", import.meta.url);
if (existsSync(path)) {
  console.log(".env.local already exists, leaving it alone");
  process.exit(0);
}
const bots = ["admin", "chief", "nithin", "maya", "daniel", "priya"];
const map = {};
for (const b of bots) map[`gc_${b}_${randomBytes(12).toString("hex")}`] = b;
writeFileSync(
  path,
  [
    `BOT_TOKENS='${JSON.stringify(map)}'`,
    "XAI_API_KEY=",
    "XAI_MODEL=grok-4",
    "SERVICE_URL=http://localhost:3000",
    "# UPSTASH_REDIS_REST_URL=",
    "# UPSTASH_REDIS_REST_TOKEN=",
    "",
  ].join("\n")
);
console.log("wrote .env.local with tokens for: " + bots.join(", "));
