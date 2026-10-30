"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Seal } from "@/components/Seal";
import { SecureViewer } from "@/components/SecureViewer";
import { CheckCard } from "@/components/CheckCard";
import type { DeliveryCheck, MilestoneStatus } from "@/lib/types";

export interface PortalFile {
  id: string;
  name: string;
  hasPreview: boolean;
  image: boolean;
  pdf: boolean;
  reviewable: boolean;
  pages: number | null;
  size: number;
  width: number | null;
  height: number | null;
  sha256: string | null;
}

export interface PortalMilestone {
  id: string;
  title: string;
  description: string;
  deliverables: string[];
  amount: number;
  dueDate: string;
  status: MilestoneStatus;
  reviewEndsAt: string | null;
  releasedBy: "client" | "auto" | null;
  reviseBy: string | null;
  openRequest: { at: string; note: string } | null;
  rounds: number;
  check: DeliveryCheck | null;
  checkPending: boolean;
  files: PortalFile[];
}

interface Props {
  token: string;
  title: string;
  clientName: string;
  freelancer: string;
  currency: string;
  milestones: PortalMilestone[];
  mode: "sandbox" | "simulation";
  clientId: string;
}

declare global {
  interface Window {
    paypal?: {
      Buttons: (opts: Record<string, unknown>) => { render: (el: HTMLElement) => Promise<void>; close?: () => void; isEligible?: () => boolean };
    };
  }
}

function loadPayPal(clientId: string, currency: string) {
  const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${currency}&intent=authorize&components=buttons&disable-funding=paylater`;
  return new Promise<void>((resolve, reject) => {
    if (window.paypal) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[data-sealed-paypal]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("PayPal couldn't load")));
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.dataset.sealedPaypal = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("PayPal couldn't load. Check your connection and refresh."));
    document.head.appendChild(s);
  });
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric" });

export function Portal(props: Props) {
  const { milestones, currency } = props;
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const [viewing, setViewing] = useState<PortalFile | null>(null);
  const total = milestones.reduce((a, m) => a + m.amount, 0);
  const released = milestones.filter((m) => m.status === "paid").reduce((a, m) => a + m.amount, 0);
  const heldAmt = milestones.filter((m) => m.status === "in_review" || m.status === "changes_requested").reduce((a, m) => a + m.amount, 0);
  const nextPay = milestones.find((m) => m.status === "awaiting_payment" && m.files.length);

  return (
    <div className="portal">
      <header className="portal-head">
        <p className="portal-from">
          <Seal size={26} monogram={props.freelancer.charAt(0)} />
          {props.freelancer}
        </p>
        <h1>{props.title}</h1>
        <p className="lede muted">
          Hi {props.clientName}. When a stage is ready, you pay into a PayPal hold and review the full work. {props.freelancer} only receives the money when you approve it.
        </p>
        <div className="portal-progress" aria-label={`${fmt(released)} released and ${fmt(heldAmt)} held, of ${fmt(total)}`}>
          <div className="portal-bar">
            <span className="bar-paid" style={{ width: `${total ? (released / total) * 100 : 0}%` }} />
            <span className="bar-held" style={{ width: `${total ? (heldAmt / total) * 100 : 0}%` }} />
          </div>
          <span className="small muted">
            {fmt(released)} released{heldAmt > 0 ? `, ${fmt(heldAmt)} held for your review` : ""}, of {fmt(total)}
          </span>
        </div>
        <details className="how">
          <summary className="small">How your payment is protected</summary>
          <ol className="small">
            <li>Before you pay, you see a sealed preview and an AI check of what was delivered against what you agreed.</li>
            <li>When you pay, PayPal holds the money. It isn’t sent to {props.freelancer} yet.</li>
            <li>You review the full work, then approve to release payment and download the files, or ask for changes and the money stays held.</li>
            <li>If you don’t respond within 3 days, payment releases automatically. If changes you asked for aren’t delivered in time, you can cancel and the hold is released back to you.</li>
          </ol>
        </details>
        {props.mode === "simulation" && (
          <p className="notice tiny">Demo mode: payments are simulated. Connect PayPal sandbox keys to take real sandbox payments.</p>
        )}
      </header>

      <ol className="portal-ms">
        {milestones.map((m, i) => (
          <MilestoneBlock key={m.id} index={i} m={m} fmt={fmt} {...props} emphasis={nextPay?.id === m.id} onView={setViewing} />
        ))}
      </ol>

      <footer className="portal-foot tiny muted">
        Payments are processed and held by PayPal. {props.freelancer} never sees your card or bank details.
      </footer>
      {viewing && <SecureViewer token={props.token} fileId={viewing.id} fileName={viewing.name} onClose={() => setViewing(null)} />}
    </div>
  );
}

function MilestoneBlock({
  m,
  index,
  fmt,
  token,
  mode,
  clientId,
  currency,
  freelancer,
  emphasis,
  onView,
}: Props & { m: PortalMilestone; index: number; fmt: (n: number) => string; emphasis: boolean; onView: (f: PortalFile) => void }) {
  const router = useRouter();
  const [opening, setOpening] = useState(false); // approve animation in flight
  const [revealed, setRevealed] = useState(m.status === "paid");
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "approve" | "changes" | "cancel">("");
  const [error, setError] = useState("");
  const reviewing = m.status === "in_review" || m.status === "changes_requested";

  useEffect(() => {
    if (!opening) return;
    const t = setTimeout(() => {
      setRevealed(true);
      router.refresh();
    }, 1050);
    return () => clearTimeout(t);
  }, [opening, router]);

  async function act(action: "approve" | "changes" | "cancel") {
    setBusy(action);
    setError("");
    const res = await fetch("/api/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, milestoneId: m.id, action, note }),
    });
    const json = await res.json();
    setBusy("");
    if (!res.ok) return setError(json.error || "That didn't go through. Try again.");
    if (action === "approve") setOpening(true);
    else {
      setAsking(false);
      router.refresh();
    }
  }

  const deadlinePassed = m.status === "changes_requested" && m.reviseBy && m.reviseBy < new Date().toISOString();
  const showBroken = opening || m.status === "paid";

  return (
    <li className={`pm pm-${m.status}${showBroken ? " pm-paid" : ""}`}>
      <div className="pm-head">
        <span className="pm-n" aria-hidden>{index + 1}</span>
        <div>
          <h2>{m.title}</h2>
          <p className="small muted">{m.description || m.deliverables.join(", ")}</p>
        </div>
      </div>

      {m.status === "in_review" && !opening && (
        <div className="pm-banner pm-banner-held">
          <strong>{fmt(m.amount)} is held by PayPal while you review.</strong>{" "}
          {m.reviewEndsAt ? `It releases to ${freelancer} automatically on ${when(m.reviewEndsAt)} unless you approve sooner or ask for changes.` : ""}
        </div>
      )}
      {m.status === "changes_requested" && (
        <div className="pm-banner pm-banner-changes">
          <strong>You asked for changes{m.openRequest ? ` on ${when(m.openRequest.at)}` : ""}. Your payment stays held.</strong>
          {m.openRequest && <blockquote>{m.openRequest.note}</blockquote>}
          {deadlinePassed ? (
            <p>The revision deadline has passed. You can cancel this stage and the hold is released back to you.</p>
          ) : (
            <p>{freelancer} has until {m.reviseBy ? when(m.reviseBy) : "soon"} to send a revision.</p>
          )}
        </div>
      )}
      {m.status === "paid" && m.releasedBy === "auto" && <p className="small muted">Released automatically after the review window ended.</p>}

      {m.files.length > 0 && m.status !== "cancelled" && m.status !== "refunded" ? (
        <ul className="pm-files">
          {m.files.map((f) => (
            <li key={f.id} className="pm-file">
              <div className="pm-frame">
                {f.hasPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/${f.id}?t=${token}&variant=${revealed ? (f.pdf ? "page" : "full") : "preview"}`}
                    alt={revealed ? f.name : `${f.name}, sealed preview`}
                    className={revealed ? "pm-img pm-img-full" : "pm-img"}
                    draggable={false}
                    onContextMenu={(e) => !revealed && e.preventDefault()}
                  />
                ) : (
                  <span className="pm-generic">{f.name.split(".").pop()?.toUpperCase()}</span>
                )}
                {!revealed && (
                  <span className="pm-seal">
                    <Seal size={64} broken={opening} />
                  </span>
                )}
                {reviewing && !opening && f.reviewable && (
                  <button type="button" className="pm-review" onClick={() => onView(f)}>
                    Review full work
                  </button>
                )}
              </div>
              <div className="pm-file-meta">
                <span className="pm-file-name" title={f.name}>{f.name}</span>
                {revealed ? (
                  <a className="pm-dl" href={`/api/files/${f.id}?t=${token}&variant=full&download=1`}>Download</a>
                ) : (
                  <span className="tiny muted">
                    {f.pdf ? `PDF, ${f.pages || 1} page${(f.pages || 1) === 1 ? "" : "s"}` : f.width ? `${f.width}×${f.height}` : `${Math.max(1, Math.round(f.size / 1024))} KB`}
                  </span>
                )}
              </div>
              {f.sha256 && <span className="pm-hash tiny muted" title={`SHA-256 ${f.sha256}`}>Fingerprint {f.sha256.slice(0, 10)}</span>}
            </li>
          ))}
        </ul>
      ) : m.status === "cancelled" || m.status === "refunded" ? (
        <p className="small muted pm-wait">{m.status === "cancelled" ? "Cancelled. The PayPal hold was released back to you, so you weren’t charged." : "Refunded through PayPal."}</p>
      ) : (
        <p className="small muted pm-wait">In progress. Expected by {day(m.dueDate)}. You’ll pay once there’s work to review.</p>
      )}

      {(m.status === "awaiting_payment" || reviewing) && m.files.length > 0 && <CheckCard check={m.check} pending={m.checkPending} audience="client" />}

      <div className="pm-pay">
        <div className="pm-price">
          <span className="pm-amount">{fmt(m.amount)}</span>
          <span className="tiny muted">
            {m.status === "paid" || opening
              ? "Released, thank you"
              : reviewing
                ? "Held by PayPal"
                : m.status === "cancelled"
                  ? "Not charged"
                  : m.status === "refunded"
                    ? "Refunded"
                    : `Due ${day(m.dueDate)}`}
          </span>
        </div>

        {m.status === "awaiting_payment" && m.files.length > 0 && (
          <div className="pm-paywrap">
            <PayButton token={token} milestoneId={m.id} mode={mode} clientId={clientId} currency={currency} label={`Pay ${fmt(m.amount)} into hold`} emphasis={emphasis} onPaid={() => router.refresh()} />
            <p className="tiny muted pm-paynote">Held by PayPal until you approve. You review the full work first.</p>
          </div>
        )}

        {m.status === "in_review" && !opening && (
          <div className="pm-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setAsking((a) => !a)} disabled={busy !== ""}>
              Request changes
            </button>
            <button type="button" className="btn btn-wax" onClick={() => act("approve")} disabled={busy !== ""}>
              {busy === "approve" ? "Releasing…" : `Approve and release ${fmt(m.amount)}`}
            </button>
          </div>
        )}
        {deadlinePassed && (
          <button type="button" className="btn btn-ghost" onClick={() => act("cancel")} disabled={busy !== ""}>
            {busy === "cancel" ? "Cancelling…" : "Cancel and release my hold"}
          </button>
        )}
        {(m.status === "paid" || opening) && <span className="status status-paid">Unlocked</span>}
      </div>

      {asking && m.status === "in_review" && (
        <form
          className="pm-ask"
          onSubmit={(e) => {
            e.preventDefault();
            act("changes");
          }}
        >
          <label htmlFor={`ask-${m.id}`} className="small"><strong>What needs to change?</strong> Be specific. {freelancer} gets 3 days to send a revision, and your payment stays held meanwhile.</label>
          <textarea id={`ask-${m.id}`} className="textarea" style={{ minHeight: 110 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The mobile mockup is missing, and the logo colours don't match the brief." />
          <div className="row">
            <button className="btn btn-ink" disabled={busy !== "" || note.trim().length < 10}>{busy === "changes" ? "Sending…" : "Send change request"}</button>
            <button type="button" className="btn btn-quiet" onClick={() => setAsking(false)}>Cancel</button>
          </div>
        </form>
      )}
      {error && <p className="error small" role="alert">{error}</p>}
    </li>
  );
}

function PayButton({
  token,
  milestoneId,
  mode,
  clientId,
  currency,
  label,
  emphasis,
  onPaid,
}: {
  token: string;
  milestoneId: string;
  mode: "sandbox" | "simulation";
  clientId: string;
  currency: string;
  label: string;
  emphasis: boolean;
  onPaid: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function createOrder() {
    const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, milestoneId }) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Couldn't start the payment");
    return json.id as string;
  }
  async function capture(orderId: string) {
    const res = await fetch("/api/checkout/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, orderId }) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Payment didn't complete");
    onPaid();
  }

  useEffect(() => {
    if (mode !== "sandbox" || !box.current) return;
    let cancelled = false;
    const el = box.current;
    loadPayPal(clientId, currency)
      .then(() => {
        if (cancelled || !window.paypal) return;
        el.innerHTML = "";
        return window.paypal
          .Buttons({
            style: { layout: "horizontal", color: "gold", shape: "rect", label: "pay", height: 44, tagline: false },
            createOrder: async () => {
              setError("");
              return createOrder();
            },
            onApprove: async (data: { orderID: string }) => {
              try {
                await capture(data.orderID);
              } catch (e) {
                setError((e as Error).message);
              }
            },
            onError: () => setError("PayPal ran into a problem. Nothing was held or charged. Please try again."),
          })
          .render(el);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, clientId, currency, milestoneId]);

  if (mode === "sandbox") {
    return (
      <div className="pm-paypal">
        <div ref={box} className="pm-paypal-box" />
        {error && <p className="error small" role="alert">{error}</p>}
      </div>
    );
  }
  return (
    <div className="pm-paypal">
      <button
        type="button"
        className={`btn ${emphasis ? "btn-wax" : "btn-ghost"} pm-sim`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const id = await createOrder();
            await capture(id);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? "Placing the hold…" : label}
      </button>
      {error && <p className="error small" role="alert">{error}</p>}
    </div>
  );
}
