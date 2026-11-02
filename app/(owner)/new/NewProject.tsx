"use client";

import { useRef, useState } from "react";
import { FoldAnimation } from "@/components/FoldAnimation";
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
  const [source, setSource] = useState("");
  const [importing, setImporting] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [drag, setDrag] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null);

  /** Pulls text out of a file or link, so the freelancer can check it before planning. */
  async function importBrief(input: File | string) {
    setError("");
    setImporting(true);
    try {
      let res: Response;
      if (typeof input === "string") {
        res = await fetch("/api/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: input }) });
      } else {
        const fd = new FormData();
        fd.append("file", input);
        res = await fetch("/api/brief", { method: "POST", body: fd });
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn’t read that brief.");
      setBrief((b) => (b.trim() ? `${b.trim()}\n\n${json.text}` : json.text));
      setSource(json.source);
      setLinkOpen(false);
      setLink("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

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
      router.push(`/projects/${json.slug || json.id}`);
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
        <p className="muted">Paste it, upload it, or link to it, as it is. Sealed turns it into paid stages.</p>
        <div className="field">
          <label htmlFor="brief">Client brief</label>
          <div
            className={`brief-box${drag ? " brief-drag" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) importBrief(f);
            }}
          >
            <textarea id="brief" className="textarea" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Paste the DM, email or call notes here, or drop a PDF, Word file or screenshot" />
            {importing && <div className="brief-reading" role="status">Reading the brief…</div>}
            <div className="brief-tools">
              <button type="button" className="brief-tool" onClick={() => fileIn.current?.click()} disabled={importing}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 11.5 12.4 19a5 5 0 0 1-7.1-7.1l7.9-7.9a3.3 3.3 0 1 1 4.7 4.7l-7.9 7.9a1.7 1.7 0 0 1-2.4-2.4l7.1-7.1" /></svg>
                Attach file
              </button>
              <button type="button" className="brief-tool" onClick={() => setLinkOpen((o) => !o)} disabled={importing} aria-expanded={linkOpen}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></svg>
                From a link
              </button>
              {!brief && (
                <button type="button" className="brief-tool brief-tool-quiet" onClick={() => setBrief(SAMPLE)}>
                  Use an example
                </button>
              )}
              <span className="tiny muted brief-types">PDF, Word, text or screenshot</span>
            </div>
            <input ref={fileIn} type="file" hidden accept=".pdf,.docx,.txt,.md,.rtf,.eml,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importBrief(f); }} />
          </div>
          {linkOpen && (
            <form
              className="brief-link"
              onSubmit={(e) => {
                e.preventDefault();
                if (link.trim()) importBrief(link.trim());
              }}
            >
              <input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a Google Doc, web page or PDF link" autoFocus inputMode="url" />
              <button className="btn btn-ink" disabled={importing || !link.trim()}>{importing ? "Reading…" : "Get brief"}</button>
            </form>
          )}
          {source && (
            <p className="brief-source tiny">
              <span>Imported from {source}. Check it reads right before planning.</span>
              <button type="button" className="link-btn" onClick={() => setSource("")} aria-label="Dismiss">Got it</button>
            </p>
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
        {error && !plan && <p className="error small" role="alert">{error}</p>}
      </section>

      {!plan && <FoldAnimation busy={busy === "plan"} />}

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
            <button className="btn btn-seal" onClick={create} disabled={busy !== null}>
              {busy === "create" ? "Creating…" : "Create project"}
            </button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      )}
    </div>
  );
}
