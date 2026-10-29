import { listProjects, isOverdue } from "@/lib/db";
import { settleDue } from "@/lib/actions";
import { statusLabel } from "@/lib/format";
import { LedgerGrid, type LedgerRow } from "./LedgerGrid";

export default async function LedgerPage() {
  await settleDue();
  const rows: LedgerRow[] = listProjects().flatMap((p) =>
    p.milestones.map((m) => ({
      projectId: p.id,
      milestoneId: m.id,
      clientEmail: p.clientEmail,
      client: p.clientName,
      project: p.title,
      milestone: m.title,
      amount: m.amount,
      currency: p.currency,
      status: statusLabel(m.status, isOverdue(m)),
      due: m.dueDate,
      paidOn: m.payment?.capturedAt?.slice(0, 10) || "",
      captureId: m.payment?.captureId || "",
      reminders: m.reminders.length,
      files: m.files.length,
    })),
  );
  return (
    <div className="ledger">
      <header className="ledger-head">
        <h1>Ledger</h1>
        <p className="muted">
          Every milestone across your projects, reconciled against PayPal captures. See what’s paid, what PayPal is holding while clients review, and what’s still owed. Edit unpaid prices and dates in place, chase late payments, and export for your accountant.
        </p>
      </header>
      <LedgerGrid rows={rows} />
    </div>
  );
}
