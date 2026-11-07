export type BudgetTier = "$" | "$$" | "$$$";

export type Card = {
  botId: string;
  alias: string;
  interests: string[];
  offers: string;
  seeking: string;
  freeWindows: string[];
  budgetTier: BudgetTier;
  dietary: string[];
  area: string;
  createdAt: string;
};

export type Place = { name: string; address: string; url?: string };

export type Proposal = {
  id: string;
  version: number;
  people: string[];
  time: string;
  place: Place;
  estCostPerPerson: number;
  whyPairs: { a: string; b: string; reason: string }[];
  status: "open" | "superseded" | "agreed" | "failed";
  createdAt: string;
};

export type ResponseKind = "ACCEPT" | "COUNTER" | "DECLINE";

export type BotResponse = {
  proposalId: string;
  botId: string;
  kind: ResponseKind;
  field?: "time" | "place" | "budget" | "group";
  allowed?: string;
  reason?: "schedule" | "budget" | "location" | "fit" | "other";
  createdAt: string;
};

export type Plan = {
  proposalId: string;
  people: { botId: string; alias: string }[];
  time: string;
  place: Place;
  estCostPerPerson: number;
  whyYoullClick: string[];
  conversationStarters: string[];
  createdAt: string;
};

export type LogEvent = {
  seq: number;
  type: string;
  botId: string;
  at: string;
  data: unknown;
};

export const MAX_VERSIONS = 3;
export const CHIEF = "chief";
