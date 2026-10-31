import Link from "next/link";
import { notFound } from "next/navigation";
import { currentFiles, getProject, held, isOverdue } from "@/lib/db";
import { money, portalUrl, settleDue } from "@/lib/actions";
import { isStale, refreshInBackground } from "@/lib/check";
import { statusLabel, when } from "@/lib/format";
import { ensurePreviews } from "@/lib/files";
import { CheckCard } from "@/components/CheckCard";
import { ProjectDial } from "@/components/ProjectDial";
import { notices, unread } from "@/lib/notify";
import { LiveRefresh, MilestoneBell, OpenNotices } from "@/components/MilestoneBell";
import { OwnerFiles } from "@/components/OwnerFiles";
import { CopyLink, MilestoneAction, RemindButton, UploadFiles } from "@/components/ProjectControls";

const date = (d: string) => new Date(d + (d.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const EDITABLE = new Set(["draft", "awaiting_payment", "changes_requested"]);

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await settleDue();
  await ensurePreviews(id);
  const p = getProject(id);
  if (!p) notFound();
  const holding = held(p);
  const total = p.milestones.reduce((a, m) => a + m.amount, 0);
  const url = portalUrl(p);

  return (
    <div className="proj">
      <LiveRefresh />
      <header className="proj-head has-dial">
        <ProjectDial
          audience="freelancer"
          total={total}
          released={p.milestones.filter((m) => m.status === "paid").reduce((a, m) => a + m.amount, 0)}
          held={holding}
          approved={p.milestones.filter((m) => m.status === "paid").length}
          stages={p.milestones.filter((m) => m.status !== "cancelled" && m.status !== "refunded").length}
          currency={p.currency}
        />
        <div className="head-main">
          <Link href="/" className="tiny muted back">All projects</Link>
          <h1>{p.title}</h1>
          <p className="muted">
            For {p.clientName}
            {p.clientEmail ? ` (${p.clientEmail})` : ""}
          </p>
          <div className="row">
            <CopyLink url={url} />
            <a className="btn btn-quiet" href={`/p/${p.portalToken}`} target="_blank" rel="noreferrer">Open the client’s view</a>
          </div>
        </div>
      </header>

      <ol className="ms-list">
        {p.milestones.map((m, i) => {
          const late = isOverdue(m);
          const files = currentFiles(m);
          const editable = EDITABLE.has(m.status);
          const stale = isStale(m);
          if (stale) refreshInBackground(p.id, m);
          const openReq = (m.changeRequests || []).filter((c) => !c.resolvedAt).at(-1);
          const views = m.views || [];
          const inspections = views.reduce((a, v) => a + v.inspections, 0);
          const statusClass = late ? "overdue" : m.status;
          const updates = notices(m, p.clientName, (n) => money(n, p.currency));
          const fresh = unread(updates, m.noticesSeenAt);
          return (
            <li key={m.id} className={`ms sheet ms-${m.status}`}>
              <div className="ms-top">
                <span className="ms-n" aria-hidden>{i + 1}</span>
                <div className="ms-title">
                  <h2>{m.title}</h2>
                  <p className="small muted">{m.deliverables.join(", ")}</p>
                </div>
                <div className="ms-money">
                  <div className="ms-money-top">
                    <MilestoneBell
                      milestoneId={m.id}
                      milestoneTitle={m.title}
                      from={p.clientName}
                      seenUrl={`/api/projects/${p.id}/milestones/${m.id}/seen`}
                      items={updates}
                      unreadIds={fresh.map((n) => n.id)}
                      reviseBy={m.status === "changes_requested" ? m.reviseBy || null : null}
                    />
                    <span className="amount">{money(m.amount, p.currency)}</span>
                  </div>
                  <span className={`status status-${statusClass}`}>{statusLabel(m.status, late)}</span>
                  <span className="tiny muted">Due {date(m.dueDate)}</span>
                </div>
              </div>

              {m.status === "in_review" && m.payment && (
                <p className="ms-note ms-note-held">
                  {p.clientName} paid {money(m.amount, p.currency)} into a PayPal hold. Files are locked while they review.
                  {m.payment.reviewEndsAt && ` It releases to you automatically on ${when(m.payment.reviewEndsAt)} if they don’t respond.`}
                  {m.payment.releaseError && <span className="error"> Automatic release failed: {m.payment.releaseError}</span>}
                </p>
              )}
              {m.status === "changes_requested" && openReq && (
                <div className="ms-note ms-note-changes ms-note-slim">
                  <span>
                    <strong>Changes requested.</strong> Send a revision by {m.reviseBy ? when(m.reviseBy) : "the deadline"}. Payment stays held until then.
                  </span>
                  <OpenNotices milestoneId={m.id}>See what {p.clientName} asked</OpenNotices>
                </div>
              )}
              {m.status === "cancelled" && <p className="ms-note">Cancelled. The client’s PayPal hold was released back to them.</p>}

              {files.length > 0 ? (
                <OwnerFiles
                  projectId={p.id}
                  milestoneId={m.id}
                  editable={editable}
                  files={files.map((f) => ({
                    id: f.id,
                    name: f.name,
                    size: f.size,
                    width: f.width || null,
                    height: f.height || null,
                    pages: f.pages || null,
                    sha256: f.sha256 || null,
                    uploadedAt: f.uploadedAt,
                    pdf: f.mime === "application/pdf",
                    svg: f.mime === "image/svg+xml",
                    hasPreview: Boolean(f.previewKey),
                  }))}
                />
              ) : (
                <p className="small muted ms-empty">No files yet. Add the deliverables: your client sees them sealed, with an AI check against what you agreed, before they pay.</p>
              )}

              {files.length > 0 && m.status !== "paid" && m.status !== "cancelled" && m.status !== "refunded" && (
                <div className="ms-check">
                  <CheckCard check={stale ? null : m.check} pending={stale} audience="freelancer" />
                </div>
              )}

              {views.length > 0 && (
                <p className="tiny muted ms-views">
                  {p.clientName} opened review copies {views.length} time{views.length === 1 ? "" : "s"}
                  {inspections ? ` and inspected ${inspections} close-up${inspections === 1 ? "" : "s"}` : ""}. Last: {views.at(-1)!.fileName}, {when(views.at(-1)!.at)}.
                </p>
              )}

              <div className="ms-actions">
                {editable && <UploadFiles projectId={p.id} milestoneId={m.id} />}
                {m.status === "changes_requested" && (
                  <MilestoneAction projectId={p.id} milestoneId={m.id} action="revision" label="Send revision for review" busyLabel="Sending…" tone="ink" done={`Revision sent. ${p.clientName} has 3 days to review.`} />
                )}
                {m.status === "awaiting_payment" && <RemindButton projectId={p.id} milestoneId={m.id} hasEmail={Boolean(p.clientEmail)} />}
                {files.length > 0 && editable && !stale && (
                  <MilestoneAction projectId={p.id} milestoneId={m.id} action="check" label="Check again" busyLabel="Checking…" tone="quiet" />
                )}
                {m.status === "paid" && m.payment && (
                  <span className="paid-line small">
                    <span className="seal-open" aria-hidden />
                    {m.payment.releasedBy === "auto" ? "Released automatically" : m.payment.authorizationId ? "Approved and released" : "Paid"}{" "}
                    {m.payment.capturedAt ? date(m.payment.capturedAt.slice(0, 10)) : ""} via PayPal
                    <span className="tiny muted">capture {m.payment.captureId}</span>
                    {m.payment.captureStatus === "PENDING" && (
                      <span className="tiny" style={{ color: "var(--warn)" }}>PayPal is still clearing this payment. It reaches your balance once cleared.</span>
                    )}
                  </span>
                )}
                {m.reminders.length > 0 && m.status === "awaiting_payment" && (
                  <span className="tiny muted">
                    {m.reminders.length} reminder{m.reminders.length === 1 ? "" : "s"} sent, last {date(m.reminders.at(-1)!.sentAt.slice(0, 10))}
                  </span>
                )}
              </div>

              {(m.status === "in_review" || m.status === "changes_requested") && (
                <div className="ms-danger">
                  <div>
                    <p className="small"><strong>Cancel this stage</strong></p>
                    <p className="tiny muted">
                      {p.clientName}’s {money(m.amount, p.currency)} goes back to them and you won’t be paid for this stage. This can’t be undone.
                    </p>
                  </div>
                  <MilestoneAction
                    projectId={p.id}
                    milestoneId={m.id}
                    action="cancel"
                    label="Cancel and release hold"
                    busyLabel="Releasing…"
                    tone="danger-outline"
                    done={`Cancelled. ${p.clientName}'s hold was released back to them.`}
                    confirm={{
                      title: `Cancel ${m.title}?`,
                      body: `PayPal releases ${p.clientName}'s ${money(m.amount, p.currency)} hold back to them. You won't be paid for this stage, and the files stay sealed. This can't be undone.`,
                      confirmLabel: `Cancel and release ${money(m.amount, p.currency)}`,
                      cancelLabel: "Keep the hold",
                      tone: "danger",
                      typeToConfirm: "cancel",
                    }}
                  />
                </div>
              )}
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
