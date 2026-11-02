"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScopePlan } from "@/lib/types";
import { StageEditor, stageKey, type EditStage } from "@/components/StageEditor";

const SAMPLE = `hey!! saw your work on behance, love it. I'm opening a coffee shop in Yaba called Bean There and I need a logo + full brand kit (colours, fonts, menu template, IG templates). we launch in 3 weeks so kinda urgent lol. budget is tight, around $1,200. my email is tolu@beanthere.ng`;

export function NewProject() {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [rate, setRate] = useState("");
  const [plan, setPlan] = useState<ScopePlan | null>(null);
  const [stages, setStages] = useState<EditStage[]>([]);
  const [busy, setBusy] = useState<"plan" | "create" | null>(null);
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const [importing, setImporting] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [drag, setDrag] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null);
  const briefEl = useRef<HTMLTextAreaElement>(null);
  // The brief box starts small and grows with what's in it (up to a limit, then it scrolls).
  useEffect(() => {
    const fit = () => {
      const t = briefEl.current;
      if (!t) return;
      t.style.height = "auto";
      t.style.height = `${Math.min(t.scrollHeight + 2, 520)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit); // re-fit when the column changes width (e.g. after planning)
    if (briefEl.current) ro.observe(briefEl.current.parentElement!);
    return () => ro.disconnect();
  }, [brief, plan]);

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
      // On phones the plan appears below the brief, so bring it into view.
      if (window.matchMedia("(max-width: 960px)").matches) setTimeout(() => document.querySelector(".plan")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      setStages(
        (json.plan as ScopePlan).milestones.map((m) => ({ key: stageKey(), title: m.title, description: m.description, deliverables: m.deliverables, amount: m.amount, dueInDays: m.dueInDays })),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!plan) return;
    setError("");
    const bad = stages.find((x) => !x.title.trim()) ? "Give every stage a name." : stages.find((x) => !(x.amount > 0)) ? "Give every stage a price." : stages.find((x) => !x.deliverables.length) ? "List at least one deliverable for each stage." : "";
    if (bad) return setError(bad);
    setBusy("create");
    try {
      const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: { ...plan, milestones: stages.map((x) => ({ title: x.title.trim(), description: x.description || "", deliverables: x.deliverables, amount: x.amount, dueInDays: x.dueInDays || 7 })) }, brief }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      router.push(`/projects/${json.slug || json.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  const update = (patch: Partial<ScopePlan>) => setPlan((p) => (p ? { ...p, ...patch } : p));
  const total = stages.reduce((a, m) => a + (Number(m.amount) || 0), 0);
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: plan?.currency || "USD", maximumFractionDigits: 0 }).format(n);

  return (
    <div className={`new${plan ? "" : " new-solo"}`}>
      <section className="new-brief">
        <header className="new-head">
          <h1>What did the client send you?</h1>
          <p className="muted">Paste it, upload it, or link to it, as it is. Sealed turns it into paid stages.</p>
        </header>
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
            <textarea id="brief" ref={briefEl} rows={3} className="textarea brief-grow" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Paste the DM, email or call notes here, or drop a PDF, Word file or screenshot" />
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
        <div className="new-go">
          <div className="field">
            <label htmlFor="rate">Your usual rate <span className="muted">(optional)</span></label>
            <input id="rate" className="input" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. $45/hour or $1,500 per brand kit" />
          </div>
          <button className="btn btn-seal new-plan-btn" onClick={makePlan} disabled={busy !== null || brief.trim().length < 15}>
            {busy === "plan" ? "Planning…" : plan ? "Plan again" : "Plan the payments"}
          </button>
        </div>
        {!plan && (
          <ol className="new-steps">
            <li><span>1</span>Sealed splits the brief into priced, dated stages</li>
            <li><span>2</span>You check them and send the client a link</li>
            <li><span>3</span>They pay each stage into a PayPal hold</li>
          </ol>
        )}
        {error && !plan && <p className="error small" role="alert">{error}</p>}
      </section>

      {plan && (
        <section className="plan sheet" aria-labelledby="plan-h">
          <div className="plan-top">
            <span className="plan-eyebrow">Payment plan</span>
            <input id="plan-h" className="plan-title" value={plan.title} onChange={(e) => update({ title: e.target.value })} aria-label="Project name" />
            {plan.summary && <p className="plan-summary">{plan.summary}</p>}
          </div>

          <div className="plan-client">
            <label className="se-field">
              <span>Client</span>
              <input className="input" value={plan.clientName} onChange={(e) => update({ clientName: e.target.value })} />
            </label>
            <label className="se-field">
              <span>Client email</span>
              <input className="input" type="email" value={plan.clientEmail} onChange={(e) => update({ clientEmail: e.target.value })} placeholder="For PayPal invoices" />
            </label>
            <label className="se-field">
              <span>Currency</span>
              <select className="input" value={plan.currency} onChange={(e) => update({ currency: e.target.value })}>
                {["USD", "EUR", "GBP", "CAD", "AUD"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>

          <div className="plan-stages-h">
            <h3>Stages</h3>
            <span className="muted small">{stages.length} payment{stages.length === 1 ? "" : "s"}</span>
          </div>
          <StageEditor stages={stages} onChange={setStages} currency={plan.currency} dueMode="days" />

          {plan.questions.length > 0 && (
            <details className="plan-q">
              <summary>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4" /><circle cx="12" cy="16.9" r=".6" fill="currentColor" /></svg>
                {plan.questions.length} question{plan.questions.length === 1 ? "" : "s"} worth asking the client
              </summary>
              <ul>{plan.questions.map((q) => <li key={q}>{q}</li>)}</ul>
            </details>
          )}

          <div className="plan-foot">
            <div>
              <p className="plan-sum">
                <strong className="plan-total">{fmt(total)}</strong>
                <span className="muted"> in {stages.length} payment{stages.length === 1 ? "" : "s"}</span>
              </p>
              <p className="tiny muted">{plan.clientName || "Your client"} approves this plan before paying anything.</p>
            </div>
            <button className="btn btn-seal" onClick={create} disabled={busy !== null || !stages.length}>
              {busy === "create" ? "Creating…" : "Create project"}
            </button>
          </div>
          {error && <p className="error small" role="alert">{error}</p>}
        </section>
      )}
    </div>
  );
}
