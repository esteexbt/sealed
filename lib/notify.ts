import type { Milestone } from "./types";

export type NoticeKind = "held" | "changes" | "approved" | "auto" | "cancelled";

export interface Notice {
  id: string;
  at: string;
  kind: NoticeKind;
  title: string;
  note?: string;
  /** For change requests: still to do, or done by a revision. */
  open?: boolean;
  resolvedAt?: string | null;
}

/** What the client did on a milestone, newest first: the freelancer's notifications. */
export function notices(m: Milestone, client: string, money: (n: number) => string): Notice[] {
  const out: Notice[] = [];
  const p = m.payment;
  if (p?.authorizationId && p.authorizedAt) {
    out.push({ id: `held-${p.authorizationId}`, at: p.authorizedAt, kind: "held", title: `${client} paid ${money(p.amount)} into a PayPal hold` });
  }
  const reqs = m.changeRequests || [];
  reqs.forEach((c, i) => {
    out.push({
      id: c.id,
      at: c.at,
      kind: "changes",
      title: reqs.length > 1 ? `${client} asked for changes (round ${i + 1})` : `${client} asked for changes`,
      note: c.note,
      open: !c.resolvedAt && m.status === "changes_requested",
      resolvedAt: c.resolvedAt,
    });
  });
  if (p?.capturedAt) {
    out.push({
      id: `paid-${p.captureId || p.capturedAt}`,
      at: p.capturedAt,
      kind: p.releasedBy === "auto" ? "auto" : "approved",
      title: p.releasedBy === "auto" ? `Review window ended, ${money(p.amount)} released to you` : `${client} approved, ${money(p.amount)} released to you`,
    });
  }
  if (p?.voidedAt) out.push({ id: `void-${p.voidedAt}`, at: p.voidedAt, kind: "cancelled", title: `${client} cancelled and the hold was released back to them` });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export const unread = (list: Notice[], seenAt?: string | null) => list.filter((n) => !seenAt || n.at > seenAt);
