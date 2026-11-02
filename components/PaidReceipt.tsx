"use client";

import { useEffect, useRef, useState } from "react";
import type { Payment } from "@/lib/types";
import { PayoutLine } from "./PayoutLine";
import { useScrollLock } from "./useScrollLock";

/**
 * A paid stage, said simply: how much, when, and where the money went.
 * The PayPal reference numbers live in a receipt pop-up, for disputes, support or accounting.
 */
export function PaidReceipt({ payment, client }: { payment: Payment; client: string }) {
  const [open, setOpen] = useState(false);
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: payment.currency, minimumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const day = payment.capturedAt ? new Date(payment.capturedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }).replace(" ", "\u00a0") : "";
  const how = payment.releasedBy === "auto" ? "Released automatically" : payment.authorizationId ? `Approved by ${client}` : `Paid by ${client}`;

  return (
    <div className="pr-paid">
      <span className="paid-check" aria-hidden>
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 10.5l3.6 3.5 7.4-8" /></svg>
      </span>
      <div className="pr-paid-text">
        <p className="pr-paid-head">
          <strong>{fmt(payment.amount)} paid</strong>
          <span>{how}{day ? `\u00a0·\u00a0${day}` : ""}</span>
        </p>
        {payment.payout ? (
          <PayoutLine payout={payment.payout} currency={payment.currency} />
        ) : (
          <p className="payout payout-sent">In Sealed’s PayPal account</p>
        )}
        {payment.captureStatus === "PENDING" && <p className="payout payout-wait">PayPal is still clearing this payment.</p>}
      </div>
      <button type="button" className="pr-paid-btn" onClick={() => setOpen(true)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z" /><path d="M9 8.5h6M9 12h6" /></svg>
        Receipt
      </button>
      {open && <Receipt payment={payment} client={client} fmt={fmt} how={how} onClose={() => setOpen(false)} />}
    </div>
  );
}

function Receipt({ payment, client, fmt, how, onClose }: { payment: Payment; client: string; fmt: (n: number) => string; how: string; onClose: () => void }) {
  useScrollLock();
  const box = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState("");
  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const copy = (v: string) => {
    navigator.clipboard?.writeText(v).then(() => {
      setCopied(v);
      setTimeout(() => setCopied(""), 1500);
    });
  };
  const sent = payment.payout?.amount ?? payment.netAmount ?? null;
  const fee = sent !== null ? Math.round((payment.amount - sent) * 100) / 100 : null;
  const when = payment.capturedAt ? new Date(payment.capturedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const Id = ({ v }: { v: string }) => (
    <button type="button" className="rc-id" onClick={() => copy(v)} title="Copy">
      <code>{v}</code>
      <span>{copied === v ? "Copied" : "Copy"}</span>
    </button>
  );

  return (
    <div className="dlg-backdrop" onClick={onClose}>
      <div ref={box} tabIndex={-1} className="dlg rc" role="dialog" aria-modal="true" aria-labelledby="rc-title" onClick={(e) => e.stopPropagation()}>
        <div className="nt-head">
          <div>
            <h2 id="rc-title">Payment receipt</h2>
            <p className="small muted">{how}{when ? `, ${when}` : ""}</p>
          </div>
          <button type="button" className="nt-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <dl className="rc-rows">
          <div><dt>{client} paid</dt><dd>{fmt(payment.amount)}</dd></div>
          {fee !== null && fee > 0 && <div><dt>PayPal’s fee</dt><dd>−{fmt(fee)}</dd></div>}
          {sent !== null && <div className="rc-total"><dt>{payment.payout?.status === "sent" ? "Sent to you" : "Your share"}</dt><dd>{fmt(sent)}</dd></div>}
          {payment.payout?.email && <div><dt>Your PayPal</dt><dd className="rc-wrap">{payment.payout.email}</dd></div>}
        </dl>
        <div className="rc-ids">
          <p className="tiny muted">References, if you ever contact PayPal about this payment</p>
          {payment.captureId && <div><span className="small">PayPal transaction</span><Id v={payment.captureId} /></div>}
          {payment.payout?.batchId && <div><span className="small">Payout</span><Id v={payment.payout.batchId} /></div>}
        </div>
      </div>
    </div>
  );
}
