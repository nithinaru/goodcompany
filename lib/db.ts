import { store } from "./store";
import type { BotResponse, Card, LogEvent, Plan, Proposal } from "./types";

const K = {
  cards: "gc:cards",
  proposals: "gc:proposals",
  current: "gc:proposal:current",
  version: "gc:proposal:version",
  responses: (pid: string) => `gc:responses:${pid}`,
  plan: "gc:plan",
  log: "gc:log",
  scoreboard: "gc:scoreboard",
};

const parse = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

export async function log(type: string, botId: string, data: unknown) {
  const s = store();
  const ev = { type, botId, at: new Date().toISOString(), data };
  const len = await s.rpush(K.log, JSON.stringify(ev));
  return len;
}

export async function getLog(): Promise<LogEvent[]> {
  const raw = await store().lrange(K.log);
  return raw.map((r, i) => ({ seq: i + 1, ...(JSON.parse(r) as Omit<LogEvent, "seq">) }));
}

export async function putCard(card: Card) {
  await store().hset(K.cards, card.botId, JSON.stringify(card));
}

export async function getCards(): Promise<Card[]> {
  const all = await store().hgetall(K.cards);
  return Object.values(all)
    .map((v) => JSON.parse(v) as Card)
    .sort((a, b) => a.botId.localeCompare(b.botId));
}

export async function getProposal(id: string) {
  return parse<Proposal>(await store().hget(K.proposals, id));
}

export async function putProposal(p: Proposal) {
  await store().hset(K.proposals, p.id, JSON.stringify(p));
}

export async function getCurrentProposal(): Promise<Proposal | null> {
  const id = await store().get(K.current);
  return id ? getProposal(id) : null;
}

export async function setCurrentProposal(id: string) {
  await store().set(K.current, id);
}

export async function nextVersion() {
  return store().incr(K.version);
}

export async function getAllProposals(): Promise<Proposal[]> {
  const all = await store().hgetall(K.proposals);
  return Object.values(all).map((v) => JSON.parse(v) as Proposal).sort((a, b) => a.version - b.version);
}

export async function putResponse(r: BotResponse) {
  await store().hset(K.responses(r.proposalId), r.botId, JSON.stringify(r));
}

export async function getResponses(pid: string): Promise<BotResponse[]> {
  const all = await store().hgetall(K.responses(pid));
  return Object.values(all)
    .map((v) => JSON.parse(v) as BotResponse)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getPlan() {
  return parse<Plan>(await store().get(K.plan));
}

export async function putPlan(p: Plan) {
  await store().set(K.plan, JSON.stringify(p));
}

export async function getScoreboard() {
  return parse<unknown>(await store().get(K.scoreboard));
}

export async function putScoreboard(v: unknown) {
  await store().set(K.scoreboard, JSON.stringify(v));
}

// Clears demo state. Keeps the scoreboard unless asked.
export async function reset(includeScoreboard = false) {
  const s = store();
  const proposals = await s.hgetall(K.proposals);
  const keys = [K.cards, K.proposals, K.current, K.version, K.plan, K.log, ...Object.keys(proposals).map(K.responses)];
  if (includeScoreboard) keys.push(K.scoreboard);
  await s.del(keys);
}
