import type { Milestone } from "@/lib/types";
import { Seal } from "./Seal";

/** A row of seals: red and whole while unpaid, open green ring once paid. */
export function MilestoneSeals({ milestones }: { milestones: Milestone[] }) {
  return (
    <div className="seal-row" aria-label={`${milestones.filter((m) => m.status === "paid").length} of ${milestones.length} milestones paid`}>
      {milestones.map((m) =>
        m.status === "paid" ? (
          <span key={m.id} className="seal-open" title={`${m.title}: paid`} />
        ) : m.status === "in_review" || m.status === "changes_requested" ? (
          <span key={m.id} className="seal-held" title={`${m.title}: payment held while the client reviews`} />
        ) : (
          <span key={m.id} title={`${m.title}: ${m.status === "refunded" || m.status === "cancelled" ? m.status : "unpaid"}`} style={{ opacity: m.status === "refunded" || m.status === "cancelled" ? 0.35 : 1 }}>
            <Seal size={22} label={`${m.title} unpaid`} />
          </span>
        ),
      )}
    </div>
  );
}
