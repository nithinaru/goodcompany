"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RAW_CONTEXTS } from "@/eval/fixtures";
import savedRun from "@/eval/out/coordinated_run.json";
import savedScore from "@/eval/out/results.json";
import { BlurText, CountUp, ShinyText, SpotlightCard } from "./bits";

type Ev = { seq: number; type: string; botId: string; at: string; data: any };
const PEOPLE = ["nithin", "maya", "daniel", "priya"] as const;
const NAMES: Record<string, string> = { nithin: "Nithin", maya: "Maya", daniel: "Daniel", priya: "Priya", chief: "Chief" };
const ROLES: Record<string, string> = {
  nithin: "Founder, Priceflag",
  maya: "ER nurse → health-tech PM",
  daniel: "Coffee carts + Shopify store",
  priya: "Berkeley robotics PhD",
};
const SHOWN = new Set(["card.upserted", "proposal.created", "proposal.failed", "response.created", "plan.created"]);
const STEP_MS = 1500;

function derive(events: Ev[]) {
  const cards: Record<string, any> = {};
  const proposals: any[] = [];
  const responses: Record<string, Record<string, any>> = {};
  let plan: any = null;
  let last: Ev | null = null;
  for (const e of events) {
    last = e;
    if (e.type === "card.upserted") cards[e.botId] = e.data;
    if (e.type === "proposal.created" || e.type === "proposal.failed") proposals.push(e.data);
    if (e.type === "response.created") (responses[e.data.proposalId] ??= {})[e.data.botId] = e.data;
    if (e.type === "plan.created") plan = e.data;
  }
  const current = proposals[proposals.length - 1] ?? null;
  return { cards, proposals, responses, current, currentResponses: current ? responses[current.id] ?? {} : {}, plan, last };
}

function describe(e: Ev, cards: Record<string, any>) {
  const name = NAMES[e.botId] ?? e.botId;
  const d = e.data;
  switch (e.type) {
    case "card.upserted":
      return { who: `${name}'s agent`, body: `Shared a Card: ${d.budgetTier} · ${d.freeWindows.join(", ")} · ${d.area}`, note: "Private context stayed on the agent." };
    case "proposal.created":
      return { who: "Chief", body: `Proposal v${d.version}: ${d.place.name} · ${d.time.replace(/,?\s*\d{4}/, "")} · ~$${d.estCostPerPerson}/person`, note: `${d.people.map((p: string) => cards[p]?.alias ?? p).join(", ")}` };
    case "proposal.failed":
      return { who: "Chief", body: `v${d.version} exceeded 3 rounds. Negotiation failed.` };
    case "response.created":
      if (d.kind === "ACCEPT") return { who: `${name}'s agent`, body: "ACCEPT", kind: "ACCEPT" };
      if (d.kind === "COUNTER") return { who: `${name}'s agent`, body: `COUNTER · ${d.field} → ${d.allowed}`, kind: "COUNTER", note: "No reason given. None required." };
      return { who: `${name}'s agent`, body: `DECLINE · ${d.reason}`, kind: "DECLINE", note: "Reason code only. The group never learns why." };
    case "plan.created":
      return { who: "Chief", body: `Plan agreed: ${d.place.name}`, note: d.people.map((p: any) => p.alias).join(" · ") };
  }
  return null;
}

function Thinking({ text }: { text: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className="shimmer">{text}</span>
      <span className="dots"><i /><i /><i /></span>
    </span>
  );
}

function highlight(raw: string) {
  return raw.split("\n").map((line, i) => (
    <div key={i}>{line.includes("PRIVATE") ? <span className="priv">{line.replace("- PRIVATE: ", "")}</span> : line}</div>
  ));
}

export default function Demo() {
  const [live, setLive] = useState<Ev[] | null>(null);
  const [score, setScore] = useState<any>(null);
  const [cursor, setCursor] = useState<number | null>(null); // null = live, number = replaying
  const [who, setWho] = useState<string>("maya");
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const [l, s] = await Promise.all([fetch("/api/log", { cache: "no-store" }).then((r) => r.json()), fetch("/api/scoreboard", { cache: "no-store" }).then((r) => r.json())]);
        if (!stop) { setLive(l.events ?? []); setScore(s.scoreboard ?? null); }
      } catch {}
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  // Live log if the service has one; otherwise the saved real run, so the page never goes blank.
  const usingSaved = live !== null && live.length === 0;
  const all: Ev[] = useMemo(() => (live && live.length ? live : (savedRun as any).events), [live]);

  useEffect(() => {
    if (cursor === null) return;
    if (cursor >= all.length) { const t = setTimeout(() => setCursor(null), 400); return () => clearTimeout(t); }
    const next = all[cursor];
    const delay = next && SHOWN.has(next.type) ? STEP_MS : 0;
    const t = setTimeout(() => setCursor((c) => (c === null ? null : c + 1)), delay);
    return () => clearTimeout(t);
  }, [cursor, all]);

  const events = cursor === null ? all : all.slice(0, cursor);
  const st = derive(events);
  const feed = events.filter((e) => SHOWN.has(e.type));
  const replaying = cursor !== null;

  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight }); }, [feed.length]);

  const cardsAll = derive(all).cards;
  const allIn = PEOPLE.every((p) => st.cards[p]);
  const open = st.current && st.current.status !== "failed" && !st.plan;
  const sb = score ?? savedScore;
  const bE = sb?.exposure?.baseline, cE = sb?.exposure?.coordinated;

  const agentState = (p: string) => {
    const card = st.cards[p];
    if (!card) return { active: true, el: <Thinking text="Distilling private context" /> };
    if (st.plan) return { active: false, el: <span className="kind ACCEPT">AGREED</span> };
    if (open && st.current.people.includes(p)) {
      const r = st.currentResponses[p];
      if (!r) return { active: true, el: <Thinking text={`Checking v${st.current.version}`} /> };
      return { active: false, el: <span className={`kind ${r.kind}`}>{r.kind}{r.reason ? ` · ${r.reason}` : r.field ? ` · ${r.field}` : ""}</span> };
    }
    return { active: false, el: <span className="chip">Card shared</span> };
  };

  const chiefStatus = st.plan
    ? <span className="kind ACCEPT">Plan posted</span>
    : !allIn ? <Thinking text={`Waiting for Cards (${Object.keys(st.cards).length}/4)`} />
    : !st.current ? <Thinking text="Forming a group · searching venues" />
    : Object.keys(st.currentResponses).length < st.current.people.length ? <Thinking text={`Negotiating v${st.current.version}`} />
    : <Thinking text="Revising the proposal" />;

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1><BlurText text="Good Company" delay={120} /></h1>
          <p>Tell your agent you&apos;re free for dinner. It finds the right people, and their agents agree on a plan. No group chat.</p>
        </div>
        <div className="controls">
          <span className="chip">{replaying ? "Replaying the real run" : usingSaved ? "Saved run" : "Live"} · {feed.length} messages</span>
          <span className="chip">5 Grok Bots</span>
          <button className="btn" onClick={() => setCursor(0)} disabled={replaying}>{replaying ? "Replaying…" : "Replay run"}</button>
          {replaying && <button className="btn ghost" onClick={() => setCursor(null)}>Skip</button>}
        </div>
      </header>

      <div className="grid">
        <section>
          <p className="label">Personal agents · each holds one person&apos;s private context</p>
          <div className="agents">
            {PEOPLE.map((p) => {
              const s = agentState(p);
              const c = st.cards[p];
              return (
                <SpotlightCard key={p} className={`agent ${s.active ? "active" : ""}`}>
                  <div className="agent-head">
                    <div className="avatar">{NAMES[p][0]}</div>
                    <div>
                      <div className="agent-name">{NAMES[p]}</div>
                      <div className="agent-role">{ROLES[p]}</div>
                    </div>
                  </div>
                  <div className="agent-line">{s.el}</div>
                  {c && (
                    <div className="agent-card">
                      <span className="chip">{c.budgetTier}</span>
                      {c.freeWindows.map((w: string) => <span key={w} className="chip">{w}</span>)}
                      <span className="chip">{c.area}</span>
                      {c.dietary.map((d: string) => <span key={d} className="chip">{d}</span>)}
                    </div>
                  )}
                </SpotlightCard>
              );
            })}
          </div>
        </section>

        <section className="center">
          <SpotlightCard className="panel">
            <div className="chief">
              <div className={`orb ${st.plan ? "" : "active"}`} />
              <div>
                <h2 className="section-title" style={{ marginBottom: 0 }}>Chief agent</h2>
                <div className="agent-role">Sees only Cards and reason codes. Never private context.</div>
                <div style={{ marginTop: 4 }}>{chiefStatus}</div>
              </div>
            </div>
          </SpotlightCard>

          {st.current && !st.plan && (
            <SpotlightCard className="panel" key={st.current.id} style={{ animation: "rise .5s both" }}>
              <p className="label">Current proposal</p>
              <div className="versions">
                {[1, 2, 3].map((v) => (
                  <span key={v} className={`ver ${v === st.current.version ? "on" : v < st.current.version ? "old" : ""}`}>v{v}</span>
                ))}
              </div>
              <div className="venue">{st.current.place.name}</div>
              <div className="sub" style={{ marginTop: 4 }}>{st.current.place.address}</div>
              <div className="meta">
                <span className="chip">{st.current.time}</span>
                <span className="chip">~${st.current.estCostPerPerson} / person</span>
              </div>
              <ul className="why">
                {st.current.whyPairs.map((w: any, i: number) => (
                  <li key={i}><b>{NAMES[w.a] ?? w.a} ↔ {NAMES[w.b] ?? w.b}</b> · {w.reason}</li>
                ))}
              </ul>
              <div className="resp-row">
                {st.current.people.map((p: string) => {
                  const r = st.currentResponses[p];
                  return (
                    <div key={p} className={`resp ${r ? "done" : ""}`}>
                      <span>{NAMES[p] ?? p}</span>
                      {r ? <span className={`kind ${r.kind}`} style={{ alignSelf: "flex-start" }}>{r.kind}</span> : <span className="dots"><i /><i /><i /></span>}
                      {r?.reason && <span style={{ color: "var(--muted)" }}>{r.reason}</span>}
                      {r?.field && <span style={{ color: "var(--muted)" }}>{r.field}: {r.allowed}</span>}
                    </div>
                  );
                })}
              </div>
            </SpotlightCard>
          )}

          {st.plan && (
            <SpotlightCard className="panel plan reveal" key="plan">
              <div className="plan-title"><span className="dot ok" /><ShinyText text={`Everyone agreed · ${st.current?.version ?? 1} rounds`} /></div>
              <div className="venue" style={{ marginTop: 8 }}>{st.plan.place.name}</div>
              <div className="sub" style={{ marginTop: 4 }}>
                {st.plan.place.url ? <a href={st.plan.place.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{st.plan.place.address}</a> : st.plan.place.address}
              </div>
              <div className="meta">
                <span className="chip">{st.plan.time}</span>
                <span className="chip">~${st.plan.estCostPerPerson} / person</span>
                {st.plan.people.map((p: any) => <span key={p.botId} className="chip">{p.alias}</span>)}
              </div>
              <p className="label" style={{ marginTop: 16 }}>Why you&apos;ll click</p>
              <ul className="why" style={{ marginTop: 0 }}>
                {st.plan.whyYoullClick.map((w: string, i: number) => <li key={i}>{w}</li>)}
              </ul>
              {st.plan.conversationStarters?.length > 0 && (
                <>
                  <p className="label" style={{ marginTop: 16 }}>Conversation starters</p>
                  <div className="starters">
                    {st.plan.conversationStarters.map((s: string, i: number) => <div key={i} className="starter">“{s}”</div>)}
                  </div>
                </>
              )}
            </SpotlightCard>
          )}
        </section>

        <section className="feed-col">
          <p className="label">Agent-to-agent messages · no group chat</p>
          <div className="feed" ref={feedRef}>
            {feed.length === 0 && <div className="msg"><Thinking text="Waiting for the first agent" /></div>}
            {feed.map((e) => {
              const m = describe(e, cardsAll);
              if (!m) return null;
              return (
                <div key={e.seq} className={`msg ${e.botId === "chief" ? "from-chief" : ""}`}>
                  <div className="msg-top">
                    <span className="who">{m.who}</span>
                    <span className="when">{new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span>
                  </div>
                  <div className="msg-body">{m.kind ? <span className={`kind ${m.kind}`}>{m.body}</span> : m.body}</div>
                  {m.note && <div className="msg-note">{m.note}</div>}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="lower">
        <SpotlightCard className="panel">
          <h2 className="section-title">What the agent knows vs. what it shared</h2>
          <p className="sub">Raw context never leaves the personal agent. The highlighted details are private: the group never sees them.</p>
          <div className="tabs">
            {PEOPLE.map((p) => <button key={p} className={`tab ${who === p ? "on" : ""}`} onClick={() => setWho(p)}>{NAMES[p]}</button>)}
          </div>
          <div className="split">
            <div>
              <p className="label">Private context (stays on {NAMES[who]}&apos;s agent)</p>
              <div className="raw">{highlight(RAW_CONTEXTS[who as keyof typeof RAW_CONTEXTS])}</div>
            </div>
            <div className="arrow">→</div>
            <div>
              <p className="label">Card (what the chief sees)</p>
              {cardsAll[who] ? (
                <dl className="kv">
                  <dt>Alias</dt><dd>{cardsAll[who].alias}</dd>
                  <dt>Interests</dt><dd>{cardsAll[who].interests.join(", ")}</dd>
                  <dt>Offers</dt><dd>{cardsAll[who].offers}</dd>
                  <dt>Seeking</dt><dd>{cardsAll[who].seeking}</dd>
                  <dt>Free</dt><dd>{cardsAll[who].freeWindows.join(", ")}</dd>
                  <dt>Budget</dt><dd>{cardsAll[who].budgetTier}</dd>
                  <dt>Dietary</dt><dd>{cardsAll[who].dietary.join(", ") || "none"}</dd>
                  <dt>Area</dt><dd>{cardsAll[who].area}</dd>
                </dl>
              ) : <Thinking text="Card not posted yet" />}
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard className="panel">
          <h2 className="section-title">Scoreboard</h2>
          <p className="sub">Same task, same Grok models. One agent with everyone&apos;s raw data vs. our coordinated agents.</p>
          {bE && cE ? (
            <>
              <div className="bars">
                <div className="bar-row">
                  <div className="bar-lab"><span>Single agent: private facts it read</span><b><CountUp to={bE.count} /> / {bE.total}</b></div>
                  <div className="bar"><span style={{ width: `${(bE.count / bE.total) * 100}%` }} /></div>
                </div>
                <div className="bar-row">
                  <div className="bar-lab"><span>Good Company chief: private facts it read</span><b><CountUp to={cE.count} /> / {cE.total}</b></div>
                  <div className="bar ours"><span style={{ width: `${Math.max(2, (cE.count / cE.total) * 100)}%` }} /></div>
                </div>
              </div>
              <div className="stats">
                <div className="stat"><b>{sb.coordinated?.violationCount ?? 0}</b>constraint violations</div>
                <div className="stat"><b>{sb.coordinated?.leakCount ?? 0}</b>privacy leaks</div>
                <div className="stat"><b><CountUp to={sb.coordinated?.rounds ?? 0} /></b>rounds to agree</div>
              </div>
              <p className="sub" style={{ marginTop: 14, marginBottom: 0 }}>
                The single agent kept secrets because it chose to. Ours can&apos;t leak them: the chief never has them, and the API rejects any free-text reason.
              </p>
            </>
          ) : <Thinking text="Waiting for eval results" />}
        </SpotlightCard>
      </div>

      <p className="foot">Demo sandbox: 4 personal Grok Bots + 1 chief Grok Bot coordinating over a shared API. Roadmap: on-device distillation, encrypted Cards, cross-account bots, reservations with your approval.</p>
    </main>
  );
}
