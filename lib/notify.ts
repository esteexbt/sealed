import type { Milestone } from "./types";

export type NoticeKind = "held" | "changes" | "approved" | "auto" | "cancelled" | "delivered" | "revision" | "reminder";

export interface Notice {
  id: string;
  at: string;
  kind: NoticeKind;
  title: string;
  note?: string;
  /** File names, for deliveries and revisions. */
  files?: string[];
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

const BATCH_MS = 15 * 60 * 1000;

/** What the freelancer did on a milestone, newest first: the client's notifications. */
export function clientNotices(m: Milestone, freelancer: string, money: (n: number) => string): Notice[] {
  const out: Notice[] = [];
  const reqs = m.changeRequests || [];
  // Files that went up while a change request was open belong to that revision.
  const inRevision = (at: string) => reqs.some((c) => c.at < at && (!c.resolvedAt || at <= c.resolvedAt));

  const uploads = [...m.files].filter((f) => !inRevision(f.uploadedAt)).sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  const batches: { at: string; names: string[] }[] = [];
  for (const f of uploads) {
    const last = batches.at(-1);
    if (last && Date.parse(f.uploadedAt) - Date.parse(last.at) < BATCH_MS) {
      last.names.push(f.name);
      last.at = f.uploadedAt;
    } else batches.push({ at: f.uploadedAt, names: [f.name] });
  }
  batches.forEach((b, i) => {
    const n = b.names.length;
    out.push({
      id: `up-${b.at}`,
      at: b.at,
      kind: "delivered",
      title: `${freelancer} ${i === 0 ? "delivered" : "added"} ${n} file${n === 1 ? "" : "s"}`,
      files: b.names,
    });
  });

  reqs.forEach((c, i) => {
    if (!c.resolvedAt) return;
    const files = m.files.filter((f) => f.uploadedAt > c.at && f.uploadedAt <= c.resolvedAt!).map((f) => f.name);
    const removed = m.files.filter((f) => f.removedAt && f.removedAt > c.at && f.removedAt <= c.resolvedAt!).map((f) => f.name);
    const round = reqs.length > 1 ? ` (round ${i + 1})` : "";
    out.push({
      id: `rev-${c.id}`,
      at: c.resolvedAt,
      kind: "revision",
      title: `${freelancer} sent a revision${round}`,
      note: `You asked: ${c.note}`,
      files: [...files.map((f) => `New: ${f}`), ...removed.map((f) => `Removed: ${f}`)],
    });
  });

  for (const r of m.reminders || []) {
    if (r.channel !== "paypal_invoice") continue;
    out.push({ id: `rem-${r.id}`, at: r.sentAt, kind: "reminder", title: `${freelancer} sent a payment reminder` });
  }
  const p = m.payment;
  if (p?.capturedAt && p.releasedBy === "auto") {
    out.push({ id: `auto-${p.capturedAt}`, at: p.capturedAt, kind: "auto", title: `Review window ended, ${money(p.amount)} released to ${freelancer}` });
  }
  if (p?.voidedAt) out.push({ id: `void-${p.voidedAt}`, at: p.voidedAt, kind: "cancelled", title: "This stage was cancelled and your hold was released" });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
