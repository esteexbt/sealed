import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject, isOverdue, outstanding } from "@/lib/db";
import { money, portalUrl } from "@/lib/actions";
import { formatBytes } from "@/lib/format";
import { CopyLink, RemindButton, UploadFiles } from "@/components/ProjectControls";

const date = (d: string) => new Date(d + (d.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getProject(id);
  if (!p) notFound();
  const left = outstanding(p);
  const total = p.milestones.reduce((a, m) => a + m.amount, 0);
  const url = portalUrl(p);

  return (
    <div className="proj">
      <header className="proj-head">
        <Link href="/" className="tiny muted back">All projects</Link>
        <h1>{p.title}</h1>
        <p className="muted">
          For {p.clientName}
          {p.clientEmail ? ` (${p.clientEmail})` : ""}. {money(total, p.currency)} in total, {left > 0 ? `${money(left, p.currency)} still to collect.` : "fully paid."}
        </p>
        <div className="row">
          <CopyLink url={url} />
          <a className="btn btn-quiet" href={`/p/${p.portalToken}`} target="_blank" rel="noreferrer">Open the client’s view</a>
        </div>
      </header>

      <ol className="ms-list">
        {p.milestones.map((m, i) => {
          const late = isOverdue(m);
          const statusClass = late ? "overdue" : m.status;
          const statusText = late ? "Overdue" : { awaiting_payment: "Awaiting payment", paid: "Paid", refunded: "Refunded", draft: "Draft" }[m.status];
          return (
            <li key={m.id} className="ms sheet">
              <div className="ms-top">
                <span className="ms-n" aria-hidden>{i + 1}</span>
                <div className="ms-title">
                  <h2>{m.title}</h2>
                  <p className="small muted">{m.deliverables.join(", ")}</p>
                </div>
                <div className="ms-money">
                  <span className="amount">{money(m.amount, p.currency)}</span>
                  <span className={`status status-${statusClass}`}>{statusText}</span>
                  <span className="tiny muted">Due {date(m.dueDate)}</span>
                </div>
              </div>

              {m.files.length > 0 ? (
                <ul className="files">
                  {m.files.map((f) => (
                    <li key={f.id} className="file">
                      {f.previewKey ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/files/${f.id}?variant=full`} alt="" className="file-thumb" />
                      ) : (
                        <span className="file-thumb file-generic">{f.name.split(".").pop()?.toUpperCase()}</span>
                      )}
                      <span className="file-meta">
                        <span className="file-name">{f.name}</span>
                        <span className="tiny muted">{formatBytes(f.size)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted ms-empty">No files yet. Add the deliverables and the client sees them sealed until they pay.</p>
              )}

              <div className="ms-actions">
                {m.status !== "paid" && <UploadFiles projectId={p.id} milestoneId={m.id} />}
                {m.status === "awaiting_payment" && <RemindButton projectId={p.id} milestoneId={m.id} hasEmail={Boolean(p.clientEmail)} />}
                {m.status === "paid" && m.payment && (
                  <span className="paid-line small">
                    <span className="seal-open" aria-hidden />
                    Paid {m.payment.capturedAt ? date(m.payment.capturedAt.slice(0, 10)) : ""} via PayPal
                    <span className="tiny muted">capture {m.payment.captureId}</span>
                  </span>
                )}
                {m.reminders.length > 0 && (
                  <span className="tiny muted">
                    {m.reminders.length} reminder{m.reminders.length === 1 ? "" : "s"} sent, last {date(m.reminders.at(-1)!.sentAt.slice(0, 10))}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {p.brief && (
        <details className="brief">
          <summary className="small">Original brief</summary>
          <p className="small">{p.brief}</p>
        </details>
      )}
    </div>
  );
}
