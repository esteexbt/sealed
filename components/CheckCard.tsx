"use client";

import { useEffect, useRef, useState } from "react";
import type { DeliveryCheck } from "@/lib/types";
import { useScrollLock } from "./useScrollLock";

const MARK: Record<string, string> = { met: "✓", partial: "!", missing: "×", info: "i" };
const HEAD: Record<DeliveryCheck["verdict"], string> = {
  ok: "Matches what was agreed",
  warn: "A few things to look at",
  fail: "Something agreed is missing",
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
function tally(check: DeliveryCheck) {
  const missing = check.items.filter((i) => i.status === "missing").length;
  const partial = check.items.filter((i) => i.status === "partial").length;
  const met = check.items.filter((i) => i.status === "met").length;
  return { missing, partial, met, issues: missing + partial };
}
function countLine(check: DeliveryCheck) {
  const t = tally(check);
  if (!t.issues) return `${t.met} of ${t.met} delivered`;
  return `${t.issues} not delivered · ${t.met} delivered`;
}

export function InfoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.6" r=".6" fill="currentColor" />
    </svg>
  );
}

/**
 * The delivery check as one slim, colour-coded line. The full list opens in a pop-up,
 * from the line itself or from the info button in the stage header.
 */
export function CheckCard({
  check,
  pending,
  audience,
  milestoneId,
}: {
  check: DeliveryCheck | null | undefined;
  pending?: boolean;
  audience: "client" | "freelancer";
  milestoneId?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!milestoneId) return;
    const on = () => setOpen(true);
    window.addEventListener(`check:${milestoneId}`, on);
    return () => window.removeEventListener(`check:${milestoneId}`, on);
  }, [milestoneId]);

  if (!check) {
    return pending ? (
      <div className="cb cb-pending" role="status">
        <span className="cb-icon cb-spin" aria-hidden />
        <span className="small">Checking the delivery against what was agreed…</span>
      </div>
    ) : null;
  }
  return (
    <>
      <button type="button" className={`cb cb-${check.verdict}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="cb-icon" aria-hidden>
          <InfoIcon size={18} />
        </span>
        <span className="cb-text">
          <strong>{HEAD[check.verdict]}</strong>
          <span className="cb-count">{countLine(check)}</span>
        </span>
        <span className="cb-more">See details</span>
      </button>
      {open && <CheckDialog check={check} audience={audience} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Header button that opens a stage's check. Shows how many things need a look. */
export function CheckButton({ milestoneId, check }: { milestoneId: string; check: DeliveryCheck | null | undefined }) {
  if (!check) return null;
  const t = tally(check);
  const label = t.issues ? `Delivery check: ${countLine(check)}` : "Delivery check: matches what was agreed";
  return (
    <button type="button" className={`bell cb-btn cb-btn-${check.verdict}`} onClick={() => window.dispatchEvent(new Event(`check:${milestoneId}`))} aria-label={label} title={label}>
      <InfoIcon size={19} />
      {t.issues > 0 && <span className="bell-count">{t.issues}</span>}
    </button>
  );
}

function CheckDialog({ check, audience, onClose }: { check: DeliveryCheck; audience: "client" | "freelancer"; onClose: () => void }) {
  useScrollLock();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Two groups only: what isn't there (or isn't right yet), and what is.
  const bad = check.items.filter((i) => i.status === "missing" || i.status === "partial");
  const good = check.items.filter((i) => i.status === "met");

  return (
    <div className="dlg-backdrop" onClick={onClose}>
      <div ref={box} tabIndex={-1} className={`dlg dlg-wide nt cd cd-${check.verdict}`} role="dialog" aria-modal="true" aria-labelledby="cd-title" onClick={(e) => e.stopPropagation()}>
        <div className="nt-head">
          <div className="cd-headline">
            <span className="cb-icon" aria-hidden>
              <InfoIcon size={20} />
            </span>
            <div>
              <h2 id="cd-title">{HEAD[check.verdict]}</h2>
              <p className="small muted">{check.summary}</p>
            </div>
          </div>
          <button type="button" className="nt-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="nt-list cd-groups">
          {bad.length > 0 && (
            <section>
              <h3 className="cd-h cd-h-bad">Not delivered <span>{bad.length}</span></h3>
              <ul className="cd-list">
                {bad.map((i, k) => (
                  <li key={k} className="cd-item">
                    <span className="cd-mark cd-mark-bad" aria-label="Not delivered">
                      <svg viewBox="0 0 20 20" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>
                    </span>
                    <span className="cd-text"><strong>{i.label}</strong><span>{i.note}</span></span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {good.length > 0 && (
            <section>
              <h3 className="cd-h cd-h-good">Delivered <span>{good.length}</span></h3>
              <ul className="cd-list">
                {good.map((i, k) => (
                  <li key={k} className="cd-item">
                    <span className="cd-mark cd-mark-good" aria-label="Delivered">
                      <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4.5 10.5l3.6 3.5 7.4-8" /></svg>
                    </span>
                    <span className="cd-text"><strong>{i.label}</strong><span>{i.note}</span></span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <p className="tiny muted check-foot">
          {check.by === "ai-vision"
            ? "Checked by Sealed with AI, looking at the files against the agreed deliverables."
            : check.by === "ai-text"
              ? "Checked by Sealed from file names, types and sizes."
              : "Checked against the agreed deliverables using file facts."}{" "}
          {audience === "client" ? "It's a guide, not a guarantee: you review the full work before your payment is released." : "Your client sees this check before they pay."}
        </p>
      </div>
    </div>
  );
}
