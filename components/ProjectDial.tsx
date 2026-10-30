"use client";

import { useEffect, useState } from "react";

/** Whole-project progress: share of the price released, with what's held shown on the same ring. */
export function ProjectDial({
  total,
  released,
  held,
  approved,
  stages,
  currency,
  audience = "client",
}: {
  total: number;
  released: number;
  held: number;
  approved: number;
  stages: number;
  currency: string;
  audience?: "client" | "freelancer";
}) {
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const L =
    audience === "freelancer"
      ? { pct: "collected", released: "Paid to you", held: "Held by PayPal", open: "Still to collect" }
      : { pct: "paid out", released: "Released", held: "Held for review", open: "Still to pay" };
  const R = 52;
  const C = 2 * Math.PI * R;
  const paidPart = total ? released / total : 0;
  const heldPart = total ? held / total : 0;
  const pct = Math.round(paidPart * 100);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const toPay = Math.max(0, total - released - held);
  const done = total > 0 && released >= total;

  return (
    <aside className={`dial${done ? " dial-done" : ""}`} aria-label={`Project ${pct}% ${L.pct}: ${fmt(released)} released, ${fmt(held)} held, ${fmt(toPay)} still to pay, of ${fmt(total)}`}>
      <div className="dial-ring">
        <svg viewBox="0 0 128 128" aria-hidden>
          <defs>
            <pattern id="dial-held" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#e6cf7a" />
              <rect width="3" height="6" fill="#c9a227" />
            </pattern>
          </defs>
          <circle cx="64" cy="64" r={R} className="dial-track" />
          {heldPart > 0 && (
            <circle
              cx="64"
              cy="64"
              r={R}
              className="dial-held"
              stroke="url(#dial-held)"
              strokeDasharray={`${drawn ? heldPart * C : 0} ${C}`}
              strokeDashoffset={-(drawn ? paidPart * C : 0)}
            />
          )}
          {paidPart > 0 && <circle cx="64" cy="64" r={R} className="dial-paid" strokeDasharray={`${drawn ? paidPart * C : 0} ${C}`} />}
        </svg>
        <div className="dial-num">
          <strong>{pct}%</strong>
          <span>{done ? "complete" : L.pct}</span>
        </div>
      </div>
      <dl className="dial-legend">
        <div>
          <dt><i className="dot-paid" />{L.released}</dt>
          <dd>{fmt(released)}</dd>
        </div>
        {held > 0 && (
          <div>
            <dt><i className="dot-held" />{L.held}</dt>
            <dd>{fmt(held)}</dd>
          </div>
        )}
        {toPay > 0 && (
          <div>
            <dt><i className="dot-open" />{L.open}</dt>
            <dd>{fmt(toPay)}</dd>
          </div>
        )}
        <p className="tiny muted">
          {approved} of {stages} stage{stages === 1 ? "" : "s"} approved · {fmt(total)} total
        </p>
      </dl>
    </aside>
  );
}
