import type { Milestone } from "@/lib/types";
import { isOverdue } from "@/lib/db";

const Check = () => (
  <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4.5 10.5l3.6 3.5 7.4-8" />
  </svg>
);

/**
 * One check per stage. Filled green: paid. Gold: paid into a PayPal hold, still in review.
 * Empty: not paid yet (red ring when overdue). Faded dashed: cancelled or refunded.
 */
export function MilestoneSeals({ milestones }: { milestones: Milestone[] }) {
  const done = milestones.filter((m) => m.status === "paid").length;
  return (
    <div className="mc-row" role="img" aria-label={`${done} of ${milestones.length} stages paid`}>
      {milestones.map((m, i) => {
        const held = m.status === "in_review" || m.status === "changes_requested";
        const off = m.status === "cancelled" || m.status === "refunded";
        const state = m.status === "paid" ? "done" : held ? "held" : off ? "off" : isOverdue(m) ? "late" : "todo";
        const label = { done: "paid", held: "held by PayPal, in review", off: m.status, late: "overdue", todo: "not paid yet" }[state];
        return (
          <span key={m.id} className={`mc mc-${state}`} title={`Stage ${i + 1}, ${m.title}: ${label}`}>
            {(state === "done" || state === "held") && <Check />}
          </span>
        );
      })}
    </div>
  );
}
