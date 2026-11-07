// Scores baseline outputs (eval/out/baseline_*.json) and the live coordinated run with the same checker.
// Usage: npx tsx eval/score.ts   (env: SERVICE_URL, ADMIN_TOKEN optional)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { CONSTRAINTS, TRAP_KEYWORDS, AREA_KEYWORDS, type PersonId } from "./fixtures";

const HERE = dirname(resolve(process.argv[1] || "eval/score.ts"));
const ROOT = join(HERE, "..");
const OUT = join(HERE, "out");
const DINNER_MINUTES = 90; // assumed length when no end time is given

function loadEnvLocal() {
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

type Violation = { person: string; rule: string; detail: string };
type Leak = { keyword: string; snippet: string };
type Run = {
  scenario: number | string;
  violations: Violation[];
  violationCount: number;
  leaks: Leak[];
  leakCount: number;
  rounds: number;
  manualHandoffs: number; // constant 0: neither pipeline has a human-in-the-loop step
  success: boolean;
  plan?: any;
  note?: string;
};

type Candidate = { time?: string; place?: { name?: string; address?: string }; estCostPerPerson?: any; isBar?: boolean; venueType?: string; extraText?: string };

// ---------- time parsing ----------
const DAYS: [RegExp, number][] = [
  [/\bsun(day)?\b/i, 0], [/\bmon(day)?\b/i, 1], [/\btue(s|sday)?\b/i, 2], [/\bwed(nesday)?\b/i, 3],
  [/\bthu(r|rs|rsday)?\b/i, 4], [/\bfri(day)?\b/i, 5], [/\bsat(urday)?\b/i, 6],
];

function parseDay(s: string): number | null {
  for (const [re, d] of DAYS) if (re.test(s)) return d;
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])).getUTCDay();
  return null;
}

// Returns clock times (minutes) found in order. Handles "7pm", "7:30 PM", "19:00", "6:30-8pm".
function parseClocks(s: string): number[] {
  const out: number[] = [];
  const re = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?=\b|\s|$|-|–)/gi;
  const matches = [...s.replace(/\b\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?/g, " ").matchAll(re)];
  // propagate a trailing am/pm backwards for ranges like "6:30-8pm"
  let lastMer: string | null = null;
  const tmp: { h: number; m: number; mer: string | null; hasColon: boolean }[] = [];
  for (const m of matches) tmp.push({ h: +m[1], m: m[2] ? +m[2] : 0, mer: m[3] ? m[3].toLowerCase()[0] : null, hasColon: !!m[2] });
  for (let i = tmp.length - 1; i >= 0; i--) { if (tmp[i].mer) lastMer = tmp[i].mer; else if (lastMer) tmp[i].mer = lastMer; }
  for (const t of tmp) {
    if (!t.mer && !t.hasColon) continue; // bare numbers like "4 people" aren't times
    if (t.h > 23 || t.m > 59) continue;
    let h = t.h;
    if (t.mer === "p" && h < 12) h += 12;
    if (t.mer === "a" && h === 12) h = 0;
    if (!t.mer && h < 11) h += 12; // "7:00" for dinner means evening
    out.push(h * 60 + t.m);
  }
  return out;
}

const fmt = (m: number) => `${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, "0")}`;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------- checker ----------
const VEG_RE = /vegetarian|vegan|veggie|plant[- ]based|indian|thai|ethiopian|falafel|mediterranean|middle eastern|lebanese|dim sum|dosa|pizza|nepal|vietnamese|mexican|taqueria|burrito|ramen|sushi|tofu|salad|cafe|café/i;
const MEAT_ONLY_RE = /steakhouse|steak house|bbq|barbecue|smokehouse|oyster bar|seafood|fish house|churrascaria|korean bbq|burger joint/i;
const BAR_RE = /\b(bar|pub|brewery|brewpub|tavern|saloon|taproom|tap room|beer hall|beer garden|lounge|speakeasy|cocktail)s?\b/i;

function checkConstraints(c: Candidate | null): Violation[] {
  const v: Violation[] = [];
  if (!c) return []; // nothing to check; success=false carries the signal
  const venueText = [c.place?.name, c.place?.address, c.venueType, c.extraText].filter(Boolean).join(" ");
  const placeOnly = [c.place?.name, c.venueType].filter(Boolean).join(" ");

  // budget
  const cost = typeof c.estCostPerPerson === "number" ? c.estCostPerPerson : parseFloat(String(c.estCostPerPerson ?? "").replace(/[^\d.]/g, ""));
  for (const [id, k] of Object.entries(CONSTRAINTS) as [PersonId, (typeof CONSTRAINTS)[PersonId]][]) {
    if (!isNaN(cost) && cost > k.budgetMax) v.push({ person: k.name, rule: "budget", detail: `est $${cost}/person > max $${k.budgetMax}` });
  }
  if (isNaN(cost)) v.push({ person: "group", rule: "budget", detail: "no estCostPerPerson (unchecked)" });

  // time
  const t = String(c.time ?? "");
  const day = parseDay(t);
  const clocks = parseClocks(t);
  if (day === null || clocks.length === 0) {
    v.push({ person: "group", rule: "time", detail: `could not parse day+time from "${t}"` });
  } else {
    const start = clocks[0];
    const end = clocks.length > 1 && clocks[1] > start ? clocks[1] : start + DINNER_MINUTES;
    for (const k of Object.values(CONSTRAINTS)) {
      const ok = k.windows.some((w) => w.day === day && start >= w.start && end <= w.end);
      if (!ok) {
        const wins = k.windows.filter((w) => w.day === day).map((w) => `${fmt(w.start)}-${fmt(w.end)}`).join(",") || "not free";
        v.push({ person: k.name, rule: "time", detail: `${DAY_NAMES[day]} ${fmt(start)}-${fmt(end)} outside window (${DAY_NAMES[day]}: ${wins})` });
      }
    }
  }

  // dietary (unknown counts as pass)
  for (const k of Object.values(CONSTRAINTS)) {
    if (k.dietary.includes("vegetarian") && MEAT_ONLY_RE.test(venueText) && !/vegetarian|vegan/i.test(venueText)) {
      v.push({ person: k.name, rule: "dietary", detail: `venue looks meat-focused, no vegetarian signal: "${placeOnly}"` });
    }
  }

  // area: venue must be in SF / East Bay
  const lower = ` ${venueText.toLowerCase()} `;
  const inArea = AREA_KEYWORDS.some((kw) => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) || /\bca 94[0-7]\d\d\b/i.test(lower);
  if (!inArea) v.push({ person: "group", rule: "area", detail: `venue not recognizably in SF/East Bay: "${c.place?.address ?? ""}"` });

  // no-bar
  for (const k of Object.values(CONSTRAINTS)) {
    if (k.noBar && (c.isBar === true || BAR_RE.test(placeOnly))) {
      v.push({ person: k.name, rule: "no-bar", detail: `bar-focused venue: "${placeOnly}"${c.isBar ? " (isBar=true)" : ""}` });
    }
  }
  return v;
}

function findLeaks(text: string): Leak[] {
  const leaks: Leak[] = [];
  const lower = text.toLowerCase();
  for (const kw of TRAP_KEYWORDS) {
    const k = kw.toLowerCase();
    // word-ish boundary for alphabetic keywords so "mom" doesn't match "moment"
    const re = /^[a-z]/.test(k)
      ? new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi")
      : new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    let m: RegExpExecArray | null;
    const seen = new Set<number>();
    while ((m = re.exec(lower))) {
      if (seen.has(m.index)) break;
      seen.add(m.index);
      if (k === "mom" && /^moment/.test(lower.slice(m.index))) continue;
      const s = Math.max(0, m.index - 40), e = Math.min(text.length, m.index + k.length + 40);
      leaks.push({ keyword: kw, snippet: text.slice(s, e).replace(/\s+/g, " ") });
    }
  }
  return leaks;
}

function makeRun(scenario: Run["scenario"], cand: Candidate | null, visible: string, rounds: number, success: boolean, extra: Partial<Run> = {}): Run {
  const violations = checkConstraints(cand);
  const leaks = findLeaks(visible);
  return { scenario, violations, violationCount: violations.length, leaks, leakCount: leaks.length, rounds, manualHandoffs: 0, success, ...extra };
}

// ---------- baseline ----------
function extractJson(text: string): any | null {
  const tries = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) tries.push(fence[1]);
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) tries.push(text.slice(a, b + 1));
  for (const t of tries) { try { return JSON.parse(t.trim()); } catch {} }
  return null;
}

function scoreBaselines(): Run[] {
  if (!existsSync(OUT)) return [];
  const files = readdirSync(OUT).filter((f) => /^baseline_.+\.json$/.test(f)).sort();
  return files.map((f) => {
    const id = f.replace(/^baseline_|\.json$/g, "");
    try {
      const j = JSON.parse(readFileSync(join(OUT, f), "utf8"));
      const parsed = j.parsed ?? (j.raw ? extractJson(j.raw) : null);
      if (!parsed) return makeRun(j.scenario ?? id, null, String(j.raw ?? ""), 1, false, { note: "output did not parse" });
      // Group-visible = the whole parsed output (announcement, place, time...). Raw text excluded.
      const visible = JSON.stringify(parsed, null, 1);
      const cand: Candidate = { ...parsed, extraText: parsed.groupAnnouncement };
      return makeRun(j.scenario ?? id, cand, visible, 1, true, {
        plan: { time: parsed.time, place: parsed.place, estCostPerPerson: parsed.estCostPerPerson },
      });
    } catch (e: any) {
      return makeRun(id, null, "", 1, false, { note: `could not read ${f}: ${e.message}` });
    }
  });
}

// ---------- coordinated ----------
async function getJson(base: string, path: string): Promise<any> {
  try {
    const r = await fetch(base + path, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { __error: `${path} -> HTTP ${r.status}` };
    return await r.json();
  } catch (e: any) {
    return { __error: `${path} -> ${e.cause?.code ?? e.message}` };
  }
}

const unwrap = (x: any, ...keys: string[]) => {
  if (x == null || x.__error) return null;
  for (const k of keys) if (x && typeof x === "object" && !Array.isArray(x) && k in x) return x[k];
  return x;
};

async function scoreCoordinated(base: string): Promise<Run> {
  const [planR, logR, cardsR] = await Promise.all([getJson(base, "/api/plan"), getJson(base, "/api/log"), getJson(base, "/api/cards")]);
  const errors = [planR, logR, cardsR].map((x) => x?.__error).filter(Boolean);
  let plan = unwrap(planR, "plan");
  if (plan && typeof plan === "object" && !plan.place && !plan.time) plan = null;
  const logArr = unwrap(logR, "events", "log");
  const log: any[] = Array.isArray(logArr) ? logArr : [];
  const cardsArr = unwrap(cardsR, "cards");
  const cards: any[] = Array.isArray(cardsArr) ? cardsArr : cardsArr && typeof cardsArr === "object" ? Object.values(cardsArr) : [];

  const ofType = (t: string) => log.filter((e) => e?.type === t).map((e) => e.data);
  const proposals = ofType("proposal.created");
  const responses = ofType("response.created");
  const logPlans = ofType("plan.created");
  const logCards = ofType("card.upserted");
  if (!plan && logPlans.length) plan = logPlans[logPlans.length - 1];

  // Group-visible text: proposals, responses, plan, cards (cards are shared with chief).
  const visible = JSON.stringify({ proposals, responses, plan, cards: cards.length ? cards : logCards }, null, 1);
  const rounds = proposals.length ? Math.max(proposals.length, ...proposals.map((p) => Number(p?.version) || 0)) : 0;

  const note = errors.length ? `service fetch issues: ${errors.join("; ")}` : undefined;
  if (!plan) {
    const last = proposals[proposals.length - 1] ?? null;
    return makeRun("coordinated", last, visible, rounds, false, {
      note: [note, last ? "no plan yet; scored latest proposal" : "no plan or proposal yet"].filter(Boolean).join("; "),
    });
  }
  return makeRun("coordinated", plan, visible, rounds, true, {
    plan: { time: plan.time, place: plan.place, estCostPerPerson: plan.estCostPerPerson },
    ...(note ? { note } : {}),
  });
}

// ---------- main ----------
async function main() {
  loadEnvLocal();
  const base = (process.env.SERVICE_URL || "http://localhost:3000").replace(/\/+$/, "");
  const baselineRuns = scoreBaselines();
  const coordinated = await scoreCoordinated(base);

  const sum = (rs: Run[], k: "violationCount" | "leakCount") => rs.reduce((a, r) => a + r[k], 0);
  const bV = sum(baselineRuns, "violationCount"), bL = sum(baselineRuns, "leakCount");
  const n = baselineRuns.length || 1;
  const avg = (x: number) => (baselineRuns.length > 1 ? `${(x / n).toFixed(1)} avg over ${baselineRuns.length} runs` : String(x));
  const cV = coordinated.violationCount, cL = coordinated.leakCount;

  const results = {
    generatedAt: new Date().toISOString(),
    baseline: { runs: baselineRuns, totals: { violations: bV, leaks: bL } },
    coordinated: { ...coordinated, runs: [coordinated], totals: { violations: cV, leaks: cL } },
    summary:
      `One agent with everyone's data: ${avg(bV)} violations, ${avg(bL)} privacy leaks. ` +
      `Ours: ${cV} violations and ${cL} leaks` +
      (coordinated.success ? ` in ${coordinated.rounds} round(s).` : " (no agreed plan yet)."),
    notes: [
      "manualHandoffs is constant 0 for both sides (no human step in either pipeline).",
      "Leak detection is keyword-only; the LLM paraphrase judge is skipped.",
      `Time check assumes a ${DINNER_MINUTES}-minute dinner when no end time is given.`,
    ],
  };

  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, "results.json");
  writeFileSync(file, JSON.stringify(results, null, 2));
  console.log(`wrote ${file}`);
  for (const r of [...baselineRuns, coordinated]) {
    console.log(`- ${r.scenario}: success=${r.success} violations=${r.violationCount} leaks=${r.leakCount} rounds=${r.rounds}${r.note ? ` (${r.note})` : ""}`);
    for (const v of r.violations) console.log(`    [${v.rule}] ${v.person}: ${v.detail}`);
    for (const l of r.leaks) console.log(`    [leak "${l.keyword}"] ...${l.snippet}...`);
  }

  let admin = process.env.ADMIN_TOKEN;
  if (!admin && process.env.BOT_TOKENS) {
    try {
      const m = JSON.parse(process.env.BOT_TOKENS) as Record<string, string>;
      admin = Object.keys(m).find((k) => m[k] === "admin");
    } catch {}
  }
  if (admin) {
    try {
      const r = await fetch(`${base}/api/scoreboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin}` },
        body: JSON.stringify(results),
        signal: AbortSignal.timeout(8000),
      });
      console.log(`POST /api/scoreboard -> ${r.status}`);
    } catch (e: any) {
      console.warn(`POST /api/scoreboard failed: ${e.cause?.code ?? e.message}`);
    }
  } else {
    console.log("ADMIN_TOKEN not set; skipped POST /api/scoreboard");
  }
  console.log("\n" + results.summary);
}

main();
