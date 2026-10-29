"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ScopePlan } from "@/lib/types";

const SAMPLE = `hey!! saw your work on behance, love it. I'm opening a coffee shop in Yaba called Bean There and I need a logo + full brand kit (colours, fonts, menu template, IG templates). we launch in 3 weeks so kinda urgent lol. budget is tight, around $1,200. my email is tolu@beanthere.ng`;

export function NewProject({ modelLabel }: { modelLabel: string }) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [rate, setRate] = useState("");
  const [plan, setPlan] = useState<ScopePlan | null>(null);
  const [busy, setBusy] = useState<"plan" | "create" | null>(null);
  const [error, setError] = useState("");

  async function makePlan() {
    setError("");
    setBusy("plan");
    try {
      const res = await fetch("/api/scope", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief, rate }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPlan(json.plan);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!plan) return;
    setError("");
    setBusy("create");
    try {
      const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, brief }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      router.push(`/projects/${json.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  const update = (patch: Partial<ScopePlan>) => setPlan((p) => (p ? { ...p, ...patch } : p));
  const updateMs = (i: number, patch: Partial<ScopePlan["milestones"][number]>) =>
    setPlan((p) => (p ? { ...p, milestones: p.milestones.map((m, j) => (j === i ? { ...m, ...patch } : m)) } : p));
  const total = plan?.milestones.reduce((a, m) => a + (Number(m.amount) || 0), 0) || 0;
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: plan?.currency || "USD", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="new">
      <section className="new-brief">
        <h1>What did the client send you?</h1>
        <p className="muted">Paste the DM, email or call notes as they are. Sealed AI turns them into paid milestones.</p>
        <div className="field">
          <label htmlFor="brief">Client brief</label>
          <textarea id="brief" className="textarea" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Paste the message here" />
          {!brief && (
            <button type="button" className="btn btn-quiet tiny" style={{ justifySelf: "start" }} onClick={() => setBrief(SAMPLE)}>
              Use an example brief
            </button>
          )}
        </div>
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="rate">Your usual rate (optional)</label>
          <input id="rate" className="input" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. $45/hour or $1,500 per brand kit" />
        </div>
        <div className="row">
          <button className="btn btn-ink" onClick={makePlan} disabled={busy !== null || brief.trim().length < 15}>
            {busy === "plan" ? "Planning…" : plan ? "Plan again" : "Plan the payments"}
          </button>
          <span className="tiny muted">Planned by {modelLabel}</span>
        </div>
        {error && !plan && <p className="error" role="alert">{error}</p>}
      </section>

      {plan && (
        <section className="plan sheet" aria-labelledby="plan-h">
          <div className="plan-head">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="title">Project</label>
              <input id="title" className="input plan-title" value={plan.title} onChange={(e) => update({ title: e.target.value })} />
            </div>
          </div>
          <p className="plan-summary" id="plan-h">{plan.summary}</p>

          <div className="plan-client">
            <div className="field">
              <label htmlFor="cn">Client</label>
              <input id="cn" className="input" value={plan.clientName} onChange={(e) => update({ clientName: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ce">Client email</label>
              <input id="ce" className="input" type="email" value={plan.clientEmail} onChange={(e) => update({ clientEmail: e.target.value })} placeholder="Needed for PayPal invoices" />
            </div>
            <div className="field">
              <label htmlFor="cur">Currency</label>
              <select id="cur" className="input" value={plan.currency} onChange={(e) => update({ currency: e.target.value })}>
                {["USD", "EUR", "GBP", "CAD", "AUD"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <ol className="plan-ms">
            {plan.milestones.map((m, i) => (
              <li key={i} className="plan-m">
                <span className="plan-m-n" aria-hidden>{i + 1}</span>
                <div className="plan-m-body">
                  <input className="input plan-m-title" aria-label={`Milestone ${i + 1} title`} value={m.title} onChange={(e) => updateMs(i, { title: e.target.value })} />
                  <p className="small muted">{m.description}</p>
                  <input
                    className="input small"
                    aria-label={`Milestone ${i + 1} deliverables`}
                    value={m.deliverables.join(", ")}
                    onChange={(e) => updateMs(i, { deliverables: e.target.value.split(",").map((d) => d.trim()).filter(Boolean) })}
                  />
                  <button
                  type="button"
                  className="btn btn-quiet tiny plan-m-x"
                  aria-label={`Remove ${m.title}`}
                  onClick={() => setPlan((p) => (p ? { ...p, milestones: p.milestones.filter((_, j) => j !== i) } : p))}
                  disabled={plan.milestones.length <= 1}
                >
                  Remove
                </button>
                </div>
                <div className="plan-m-side">
                  <label className="tiny muted" htmlFor={`amt-${i}`}>Price</label>
                  <input id={`amt-${i}`} className="input input-money" inputMode="decimal" value={m.amount} onChange={(e) => updateMs(i, { amount: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />
                  <label className="tiny muted" htmlFor={`due-${i}`}>Due in days</label>
                  <input id={`due-${i}`} className="input input-money" inputMode="numeric" value={m.dueInDays} onChange={(e) => updateMs(i, { dueInDays: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1) })} />
                </div>

              </li>
            ))}
          </ol>
          <button
            type="button"
            className="btn btn-quiet small"
            onClick={() => setPlan((p) => (p ? { ...p, milestones: [...p.milestones, { title: "New milestone", description: "", deliverables: ["Deliverable"], amount: 100, dueInDays: 14 }] } : p))}
          >
            Add a milestone
          </button>

          {plan.questions.length > 0 && (
            <div className="plan-q">
              <h3>Ask the client first</h3>
              <ul>{plan.questions.map((q) => <li key={q}>{q}</li>)}</ul>
            </div>
          )}

          <hr className="rule" />
          <div className="plan-foot">
            <p>
              <span className="muted">Total </span>
              <strong className="amount plan-total">{fmt(total)}</strong>
              <span className="muted"> in {plan.milestones.length} payments</span>
            </p>
            <button className="btn btn-wax" onClick={create} disabled={busy !== null}>
              {busy === "create" ? "Creating…" : "Create project"}
            </button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      )}
    </div>
  );
}
