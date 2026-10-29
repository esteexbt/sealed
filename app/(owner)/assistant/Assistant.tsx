"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Step = { tool: string; source: "sealed" | "paypal"; summary: string };
type Pending = { kind: "remind" | "refund"; projectId: string; milestoneId: string; message?: string } | null;
type Msg = { role: "user" | "assistant"; content: string; steps?: Step[]; pending?: Pending };

const SUGGESTIONS = ["Who owes me money?", "Remind whoever is most overdue", "What did I collect this month?"];

export function Assistant({ initial, modelLabel, paypalMode }: { initial: string; modelLabel: string; paypalMode: string }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [msgs, busy]);

  async function send(text: string, confirm?: Pending) {
    const content = text.trim();
    if (!content && !confirm) return;
    const next: Msg[] = [...msgs, { role: "user", content: content || "Yes, send it." }];
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
      setMsgs((m) => [...m, { role: "assistant", content: "I couldn't reach the server. Check your connection and try again." }]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initial && !sentInitial.current) {
      sentInitial.current = true;
      send(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const lastPending = [...msgs].reverse().find((m) => m.role === "assistant")?.pending;

  return (
    <div className="chat">
      <header className="chat-head">
        <h1>Ask about your money.</h1>
        <p className="muted small">
          {modelLabel} with your Sealed AI projects and the PayPal Agent Toolkit{paypalMode === "sandbox" ? " (sandbox)" : " (simulated)"}. It asks before sending or refunding anything.
        </p>
      </header>

      <div className="chat-log" aria-live="polite">
        {msgs.length === 0 && (
          <div className="chat-suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="btn btn-ghost small" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.steps && m.steps.length > 0 && (
              <ul className="steps" aria-label="Tools used">
                {m.steps.map((s, j) => (
                  <li key={j} className={`step step-${s.source}`}>
                    <span className="step-src">{s.source === "paypal" ? "PayPal" : "Sealed AI"}</span>
                    <code>{s.tool}</code>
                    <span className="muted">{s.summary}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="msg-text">{m.content}</p>
          </div>
        ))}
        {busy && <div className="msg msg-assistant msg-busy"><span /><span /><span /></div>}
        <div ref={end} />
      </div>

      {lastPending && !busy && (
        <div className="chat-confirm">
          <button className="btn btn-wax" onClick={() => send("", lastPending)}>
            {lastPending.kind === "remind" ? "Send reminder" : "Refund"}
          </button>
          <button className="btn btn-quiet" onClick={() => setMsgs((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, pending: null } : x)))}>Not now</button>
        </div>
      )}

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Who owes me money?" aria-label="Message the assistant" disabled={busy} />
        <button className="btn btn-ink" disabled={busy || !input.trim()}>Ask</button>
      </form>
    </div>
  );
}
