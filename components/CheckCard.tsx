import type { DeliveryCheck } from "@/lib/types";

const MARK: Record<string, string> = { met: "✓", partial: "!", missing: "×", info: "i" };
const HEAD: Record<DeliveryCheck["verdict"], string> = {
  ok: "Matches what was agreed",
  warn: "Mostly there, a few things to look at",
  fail: "Something agreed is missing",
};

export function CheckCard({
  check,
  pending,
  audience,
}: {
  check: DeliveryCheck | null | undefined;
  pending?: boolean;
  audience: "client" | "freelancer";
}) {
  if (!check) {
    return pending ? (
      <div className="check check-pending">
        <p className="small">Checking the delivery against what was agreed…</p>
      </div>
    ) : null;
  }
  return (
    <section className={`check check-${check.verdict}`} aria-label="Delivery check">
      <header className="check-head">
        <span className="check-dot" aria-hidden />
        <div>
          <h3>{HEAD[check.verdict]}</h3>
          <p className="small">{check.summary}</p>
        </div>
      </header>
      <ul className="check-items">
        {check.items.map((i, k) => (
          <li key={k} className={`ci ci-${i.status}`}>
            <span className="ci-mark" aria-label={i.status}>{MARK[i.status]}</span>
            <span>
              <strong>{i.label}</strong> <span className="muted">{i.note}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="tiny muted check-foot">
        {check.by === "ai-vision"
          ? "Checked by Sealed with AI, looking at the files against the agreed deliverables."
          : check.by === "ai-text"
            ? "Checked by Sealed from file names, types and sizes."
            : "Checked against the agreed deliverables using file facts."}{" "}
        {audience === "client" ? "It's a guide, not a guarantee: you review the full work before your payment is released." : "Your client sees this check before they pay."}
      </p>
    </section>
  );
}
