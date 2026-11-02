"use client";

import { useEffect, useRef, useState } from "react";
import { useScrollLock } from "./useScrollLock";

export interface ClientReceiptData {
  amount: number;
  currency: string;
  heldAt: string | null;
  releasedAt: string | null;
  releasedBy: "client" | "auto" | null;
  paidWith: string | null;
  transaction: string | null;
  refunded: boolean;
  voided: boolean;
}

/** The client's record of a payment: what they paid, for what, when, and the PayPal reference. */
export function ClientReceipt({ data, stage, freelancer }: { data: ClientReceiptData; stage: string; freelancer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="pr-paid-btn pm-receipt-btn" onClick={() => setOpen(true)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z" /><path d="M9 8.5h6M9 12h6" /></svg>
        Receipt
      </button>
      {open && <Dialog data={data} stage={stage} freelancer={freelancer} onClose={() => setOpen(false)} />}
    </>
  );
}

function Dialog({ data, stage, freelancer, onClose }: { data: ClientReceiptData; stage: string; freelancer: string; onClose: () => void }) {
  useScrollLock();
  const box = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency, minimumFractionDigits: data.amount % 1 ? 2 : 0 }).format(data.amount);
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "");

  return (
    <div className="dlg-backdrop" onClick={onClose}>
      <div ref={box} tabIndex={-1} className="dlg rc" role="dialog" aria-modal="true" aria-labelledby="crc-title" onClick={(e) => e.stopPropagation()}>
        <div className="nt-head">
          <div>
            <h2 id="crc-title">Your receipt</h2>
            <p className="small muted">{stage}, by {freelancer}</p>
          </div>
          <button type="button" className="nt-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <dl className="rc-rows">
          <div className="rc-total"><dt>You paid</dt><dd>{fmt}</dd></div>
          {data.heldAt && <div><dt>Held by PayPal</dt><dd className="rc-wrap">{when(data.heldAt)}</dd></div>}
          {data.releasedAt && (
            <div>
              <dt>{data.releasedBy === "auto" ? "Released automatically" : "You approved it"}</dt>
              <dd className="rc-wrap">{when(data.releasedAt)}</dd>
            </div>
          )}
          {data.paidWith && <div><dt>Paid with</dt><dd className="rc-wrap">{data.paidWith}</dd></div>}
          <div><dt>Paid to</dt><dd className="rc-wrap">{freelancer}, through Sealed</dd></div>
        </dl>
        {data.transaction && (
          <div className="rc-ids">
            <p className="tiny muted">Your PayPal reference, if you ever contact PayPal about this payment</p>
            <div>
              <span className="small">PayPal transaction</span>
              <button
                type="button"
                className="rc-id"
                onClick={() => navigator.clipboard?.writeText(data.transaction!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
              >
                <code>{data.transaction}</code>
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>
        )}
        <p className="tiny muted" style={{ margin: 0 }}>PayPal also emailed you its own receipt for this payment.</p>
      </div>
    </div>
  );
}
