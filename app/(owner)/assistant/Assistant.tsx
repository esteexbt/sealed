"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Seal } from "@/components/Seal";

type Step = { tool: string; source: "sealed" | "paypal"; summary: string };
type Pending = { kind: "remind" | "refund"; projectId: string; milestoneId: string; message?: string; to?: string; amount?: string; title?: string } | null;
type Msg = { role: "user" | "assistant"; content: string; steps?: Step[]; pending?: Pending; done?: "sent" | "dismissed" };
type Stat = { label: string; value: string; tone?: "danger" | "held" | "paid" };

// Each account keeps its own conversation (this browser tab only).
const storeKey = (userId: string) => `sealed-assistant-chat:${userId}`;

/** Plain names for the tools, so a freelancer (or a judge) can see what the assistant checked. */
const TOOL_NAMES: Record<string, string> = {
  list_receivables: "Unpaid stages",
  list_projects: "Your projects",
  send_payment_reminder: "Payment reminder",
  refund_milestone: "Refund",
  list_invoices: "PayPal invoices",
  get_invoice: "PayPal invoice",
  search_invoicing: "PayPal invoice search",
  send_invoice_reminder: "PayPal invoice reminder",
  get_order: "PayPal order",
  list_transactions: "PayPal transactions",
  get_merchant_insights: "PayPal insights",
  "create_invoice + send_invoice": "PayPal invoice sent",
};

/** Light formatting: "- " lines become a list, **bold** becomes strong. */
function Rich({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length} className="ai-list">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)$/);
    if (m) list.push(m[1]);
    else {
      flush();
      if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="ai-text">{blocks}</div>;
}

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
  </svg>
);

export function Assistant({ userId, initial, modelLabel, paypalMode, firstName, stats, suggestions }: { userId: string; initial: string; modelLabel: string; paypalMode: string; firstName: string; stats: Stat[]; suggestions: string[] }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const sentInitial = useRef(false);
  const loaded = useRef(false);

  // Keep the conversation while moving around the app (this browser tab only).
  useEffect(() => {
    try {
      // Drop chats saved under the old shared key or by another account in this tab.
      for (const k of Object.keys(sessionStorage)) if (k.startsWith("sealed-assistant-chat") && k !== storeKey(userId)) sessionStorage.removeItem(k);
      const saved = sessionStorage.getItem(storeKey(userId));
      if (saved && !initial) setMsgs(JSON.parse(saved));
    } catch {}
    loaded.current = true;
  }, [initial, userId]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      sessionStorage.setItem(storeKey(userId), JSON.stringify(msgs.slice(-40)));
    } catch {}
  }, [msgs, userId]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  // The message box grows with what you type, up to a few lines.
  useEffect(() => {
    const t = box.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
  }, [input]);

  async function send(text: string, confirm?: Pending) {
    const content = text.trim();
    if ((!content && !confirm) || busy) return;
    const shown = confirm ? `Yes, send the reminder to ${confirm.to?.split(" · ")[0] || "them"}.` : content;
    const next: Msg[] = [...msgs.map((m) => (confirm && m.pending === confirm ? { ...m, done: "sent" as const } : m)), { role: "user", content: shown }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirm ? { confirm } : { messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const json = await res.json();
      setMsgs((m) => [...m, { role: "assistant", content: json.text || json.error || "No reply.", steps: json.steps, pending: json.pending }]);
      if (json.steps?.some((s: Step) => s.summary === "sent" || s.summary === "refunded")) router.refresh();
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "I couldn’t reach the server. Check your connection and try again." }]);
    } finally {
      setBusy(false);
      box.current?.focus();
    }
  }

  useEffect(() => {
    if (initial && !sentInitial.current) {
      sentInitial.current = true;
      send(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const empty = msgs.length === 0;
  const live = !/offline/i.test(modelLabel);

  return (
    <div className={`asst${empty ? " asst-empty" : ""}`}>
      <header className="asst-bar">
        <div className="asst-who">
          <span className="asst-mark" aria-hidden><Seal size={22} tone="reverse" /></span>
          <div>
            <strong>Money assistant</strong>
            <span className="tiny muted">
              {live ? modelLabel : "Built-in rules"} · PayPal Agent Toolkit{paypalMode === "sandbox" ? " (sandbox)" : " (simulated)"}
            </span>
          </div>
        </div>
        {!empty && (
          <button type="button" className="btn btn-quiet" onClick={() => setMsgs([])} disabled={busy}>
            New chat
          </button>
        )}
      </header>

      <div className="asst-log" aria-live="polite">
        {empty && (
          <section className="asst-hello">
            <h1>Hi {firstName}. What do you want to know about your money?</h1>
            <p className="muted">I can see your projects and your PayPal account. I never send or refund anything without asking you first.</p>
            <dl className="asst-stats">
              {stats.map((s) => (
                <div key={s.label} className={s.tone ? `as-${s.tone}` : undefined}>
                  <dt>{s.label}</dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
            </dl>
            <div className="asst-suggest">
              {suggestions.map((s) => (
                <button key={s} type="button" className="asst-chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </section>
        )}

        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="am am-user">
              <p>{m.content}</p>
            </div>
          ) : (
            <div key={i} className="am am-ai">
              <span className="am-avatar" aria-hidden><Seal size={16} tone="reverse" /></span>
              <div className="am-body">
                {m.steps && m.steps.length > 0 && (
                  <ul className="am-steps" aria-label="What the assistant checked">
                    {m.steps.map((s, j) => (
                      <li key={j} className={`am-step am-step-${s.source}`} title={`${s.tool}: ${s.summary}`}>
                        <span className="am-src">{s.source === "paypal" ? "PayPal" : "Sealed"}</span>
                        {TOOL_NAMES[s.tool] || s.tool.replace(/_/g, " ")}
                      </li>
                    ))}
                  </ul>
                )}
                <Rich text={m.content} />
                {m.pending && (
                  <div className={`am-confirm${m.done ? " am-confirm-done" : ""}`}>
                    <div className="am-confirm-head">
                      <strong>{m.pending.kind === "remind" ? "Payment reminder" : "Refund"}</strong>
                      {m.pending.amount && <span className="am-amount">{m.pending.amount}</span>}
                    </div>
                    {m.pending.to && <p className="tiny muted">To {m.pending.to}{m.pending.title ? ` · ${m.pending.title}` : ""}</p>}
                    {m.pending.message && <blockquote className="am-preview">{m.pending.message}</blockquote>}
                    {m.done ? (
                      <p className="tiny muted">{m.done === "sent" ? "Sent." : "Not sent."}</p>
                    ) : (
                      <div className="am-confirm-actions">
                        <button type="button" className="btn btn-seal" onClick={() => send("", m.pending!)} disabled={busy}>
                          {m.pending.kind === "remind" ? "Send reminder" : "Refund"}
                        </button>
                        <button type="button" className="btn btn-quiet" onClick={() => setMsgs((all) => all.map((x, k) => (k === i ? { ...x, done: "dismissed" } : x)))} disabled={busy}>
                          Not now
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="am am-ai">
            <span className="am-avatar" aria-hidden><Seal size={16} tone="reverse" /></span>
            <div className="am-body am-busy" aria-label="Thinking"><span /><span /><span /></div>
          </div>
        )}
        <div ref={end} />
      </div>

      <form
        className="asst-compose"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          ref={box}
          rows={1}
          className="asst-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask about payments, clients, or what’s overdue…"
          aria-label="Message the assistant"
        />
        <button className="asst-send" disabled={busy || !input.trim()} aria-label="Send">
          <SendIcon />
        </button>
      </form>
    </div>
  );
}
