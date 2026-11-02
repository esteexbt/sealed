import { DOT, MARK } from "./brandPaths";

const STEPS = [
  ["Brief in", "Paste, upload or link what the client sent."],
  ["Planned", "AI splits it into priced, dated stages."],
  ["Sealed", "Each stage is paid into a PayPal hold."],
  ["Released", "The client approves, you get paid."],
];

/**
 * The Fold, told as the product's story on a loop: the mark arrives, the seal drops in
 * and presses closed, holds, then opens green when payment is released.
 * Pure CSS, so it stays smooth and costs nothing; it stops for reduced-motion users.
 */
export function FoldAnimation({ busy = false }: { busy?: boolean }) {
  return (
    <div className={`fold-stage${busy ? " fold-busy" : ""}`} aria-hidden>
      <div className="fold-glow" />
      <svg className="fold-mark" viewBox={`-20 -30 ${MARK.w + 40} ${MARK.h + 50}`}>
        <g className="fold-body">
          <path d={MARK.body} fill="#fff" fillRule="evenodd" />
        </g>
        <circle className="fold-ring" cx={DOT.cx} cy={DOT.cy} r={DOT.r} />
        <g className="fold-dot" style={{ transformOrigin: `${DOT.cx}px ${DOT.cy}px` }}>
          <path d={MARK.dot} />
        </g>
      </svg>
      <ol className="fold-steps">
        {STEPS.map(([t, d], i) => (
          <li key={t} style={{ animationDelay: `${i * 2}s` }}>
            <strong>{t}</strong>
            <span>{d}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
