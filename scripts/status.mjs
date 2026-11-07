// Prints a short summary of the live demo state. Usage: node scripts/status.mjs [BASE_URL]
const base = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");
const get = async (p) => (await fetch(base + p)).json();
const [{ cards }, { proposal }, { events }, { plan }] = await Promise.all([
  get("/api/cards"), get("/api/proposals/current"), get("/api/log"), get("/api/plan"),
]);
console.log(`cards (${cards.length}):`);
for (const c of cards) console.log(`  ${c.botId}: ${c.alias} | ${c.budgetTier} | ${c.freeWindows.join(", ")} | ${c.area} | diet ${c.dietary.join(",") || "-"} | interests ${c.interests.join(", ")}`);
if (proposal) {
  console.log(`current proposal v${proposal.version} [${proposal.status}] ${proposal.id}: ${proposal.time} @ ${proposal.place.name} (${proposal.place.address}) ~$${proposal.estCostPerPerson} people=${proposal.people.join(",")}`);
  const { responses } = await get(`/api/responses?proposalId=${proposal.id}`);
  for (const r of responses) console.log(`  ${r.botId}: ${r.kind}${r.field ? ` ${r.field}=${r.allowed}` : ""}${r.reason ? ` reason=${r.reason}` : ""}`);
} else console.log("no proposal yet");
console.log(plan ? `PLAN: ${plan.time} @ ${plan.place.name}, $${plan.estCostPerPerson}, ${plan.people.map((p) => p.alias).join(", ")}` : "no plan yet");
if (process.argv.includes("--save")) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync("eval/out/coordinated_run.json", JSON.stringify({ savedAt: new Date().toISOString(), cards, plan, events }, null, 2));
  console.log("saved eval/out/coordinated_run.json");
}
console.log(`log: ${events.length} events`);
for (const e of events) {
  const d = e.data || {};
  const what = d.kind
    ? `${d.kind}${d.field ? ` ${d.field}=${d.allowed}` : ""}${d.reason ? ` reason=${d.reason}` : ""} (${d.proposalId})`
    : d.version && d.place ? `v${d.version} ${d.time} @ ${d.place.name} $${d.estCostPerPerson}` : d.id ? `${d.id}` : "";
  console.log(`  ${e.seq} ${e.type} ${e.botId} ${what}`);
}
