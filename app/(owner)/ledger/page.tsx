import { listProjects, isOverdue } from "@/lib/db";
import { LedgerGrid, type LedgerRow } from "./LedgerGrid";

export default function LedgerPage() {
  const rows: LedgerRow[] = listProjects().flatMap((p) =>
    p.milestones.map((m) => ({
      projectId: p.id,
      client: p.clientName,
      project: p.title,
      milestone: m.title,
      amount: m.amount,
      currency: p.currency,
      status: isOverdue(m) ? "Overdue" : { awaiting_payment: "Awaiting payment", paid: "Paid", refunded: "Refunded", draft: "Draft" }[m.status],
      due: m.dueDate,
      paidOn: m.payment?.capturedAt?.slice(0, 10) || "",
      captureId: m.payment?.captureId || "",
      reminders: m.reminders.length,
      files: m.files.length,
    })),
  );
  const collected = rows.filter((r) => r.status === "Paid").reduce((a, r) => a + r.amount, 0);
  const pending = rows.filter((r) => r.status === "Awaiting payment" || r.status === "Overdue").reduce((a, r) => a + r.amount, 0);
  return (
    <div className="ledger">
      <header className="ledger-head">
        <h1>Ledger</h1>
        <p className="muted">
          Every milestone across your projects, reconciled against PayPal captures. Search, filter and sort to see where every payment stands.
        </p>
      </header>
      <LedgerGrid rows={rows} collected={collected} pending={pending} />
    </div>
  );
}
