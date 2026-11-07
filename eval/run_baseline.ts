// Baseline: ONE agent gets all four raw private contexts and plans the dinner.
// Usage: npx tsx eval/run_baseline.ts [--scenario N|all]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

import { SCENARIOS, type Scenario } from "./fixtures";

const HERE = dirname(resolve(process.argv[1] || "eval/run_baseline.ts"));
const ROOT = join(HERE, "..");
const OUT = join(HERE, "out");

function loadEnvLocal() {
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

function buildPrompt(s: Scenario): string {
  const ctx = Object.values(s.contexts).join("\n\n");
  return `You are planning a small dinner to introduce four people to each other in the San Francisco Bay Area.
Here is everything you know about each of them:

${ctx}

Plan one dinner for all four: pick a specific day and time, and a real venue (name + address).
Then write the group announcement message that will be sent to all four people in a shared group chat.

Respond with ONLY a JSON object of this exact shape:
{
  "people": string[],
  "time": string,               // include weekday and clock time, e.g. "Saturday 7:00 PM"
  "place": { "name": string, "address": string },
  "estCostPerPerson": number,   // USD
  "isBar": boolean,
  "venueType": string,
  "groupAnnouncement": string   // the message sent to the whole group
}`;
}

export function extractJson(text: string): any | null {
  const tries: string[] = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) tries.push(fence[1]);
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) tries.push(text.slice(a, b + 1));
  for (const t of tries) {
    try { return JSON.parse(t.trim()); } catch {}
  }
  return null;
}

async function callXai(prompt: string, key: string, model: string, useJsonMode: boolean): Promise<string> {
  const body: any = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
  };
  if (useJsonMode) body.response_format = { type: "json_object" };
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`xAI ${res.status}: ${txt.slice(0, 500)}`);
  const j = JSON.parse(txt);
  return j.choices?.[0]?.message?.content ?? "";
}

async function runScenario(s: Scenario, key: string, model: string) {
  const prompt = buildPrompt(s);
  let raw: string;
  try {
    raw = await callXai(prompt, key, model, true);
  } catch (e: any) {
    console.warn(`[scenario ${s.id}] json mode failed (${e.message.slice(0, 120)}), retrying without response_format`);
    raw = await callXai(prompt, key, model, false);
  }
  const parsed = extractJson(raw);
  const out = { scenario: s.id, title: s.title, model, generatedAt: new Date().toISOString(), parsed, raw };
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `baseline_${s.id}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`[scenario ${s.id}] ${parsed ? "parsed" : "PARSE FAILED"} -> ${file}`);
  if (parsed) console.log(`  ${parsed.time} @ ${parsed.place?.name} ~$${parsed.estCostPerPerson}`);
}

async function main() {
  loadEnvLocal();
  const key = process.env.XAI_API_KEY;
  if (!key) {
    console.error("ERROR: XAI_API_KEY is not set. Export it or add XAI_API_KEY=... to .env.local");
    process.exit(1);
  }
  const model = process.env.XAI_MODEL || "grok-4";
  const i = process.argv.indexOf("--scenario");
  const arg = i >= 0 ? process.argv[i + 1] : "all";
  const list = !arg || arg === "all" ? SCENARIOS : SCENARIOS.filter((s) => String(s.id) === arg);
  if (!list.length) {
    console.error(`Unknown scenario "${arg}". Options: ${SCENARIOS.map((s) => s.id).join(", ")}, all`);
    process.exit(1);
  }
  for (const s of list) {
    try { await runScenario(s, key, model); }
    catch (e: any) { console.error(`[scenario ${s.id}] failed: ${e.message}`); process.exitCode = 1; }
  }
}

main();
