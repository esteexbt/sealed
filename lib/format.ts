import type { MilestoneStatus } from "./types";
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}


export const STATUS_LABEL: Record<MilestoneStatus, string> = {
  draft: "Draft",
  awaiting_payment: "Awaiting payment",
  in_review: "Held, in review",
  changes_requested: "Changes requested",
  paid: "Paid",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

/** Status label, with overdue folded in for unpaid milestones. */
export function statusLabel(status: MilestoneStatus, overdue: boolean) {
  return overdue && status === "awaiting_payment" ? "Overdue" : STATUS_LABEL[status];
}

export function shortHash(h?: string) {
  return h ? h.slice(0, 8) + "…" + h.slice(-4) : "";
}

export function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
