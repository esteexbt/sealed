import Link from "next/link";
import { listProjects, read, isOverdue, outstanding } from "@/lib/db";
import { money } from "@/lib/actions";
import { MilestoneSeals } from "@/components/MilestoneSeals";

function since(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function Dashboard() {
  const projects = listProjects();
  const activity = read().activity.slice(0, 12);
  const currency = projects[0]?.currency || "USD";
  const owed = projects.reduce((a, p) => a + outstanding(p), 0);
  const overdueRows = projects.flatMap((p) => p.milestones.filter((m) => isOverdue(m)).map((m) => ({ p, m })));
  const overdue = overdueRows.reduce((a, r) => a + r.m.amount, 0);
  const paid = projects.flatMap((p) => p.milestones).filter((m) => m.status === "paid").reduce((a, m) => a + m.amount, 0);

  if (!projects.length) {
    return (
      <section className="empty">
        <h1>Paste a client brief and get a payment plan back.</h1>
        <p className="lede muted">
          Sealed AI splits the work into paid milestones, sends them through PayPal, and keeps every file sealed until the client pays.
        </p>
        <Link href="/new" className="btn btn-wax">Start from a brief</Link>
      </section>
    );
  }

  return (
    <div className="dash">
      <section className="dash-hero">
        <h1>
          {owed > 0 ? <>You’re owed {money(owed, currency)}.</> : <>Everyone has paid.</>}
          {overdue > 0 && (
            <span className="dash-hero-sub">
              {" "}
              {money(overdue, currency)} of it is overdue
              {overdueRows.length === 1 ? `, from ${overdueRows[0].p.clientName}` : ` across ${overdueRows.length} milestones`}.
            </span>
          )}
        </h1>
        <p className="muted">{money(paid, currency)} collected so far across {projects.length} project{projects.length === 1 ? "" : "s"}.</p>
        {overdue > 0 && (
          <Link href="/assistant?q=Who%20owes%20me%20money%3F" className="btn btn-ghost">Chase overdue payments</Link>
        )}
      </section>

      <div className="dash-grid">
        <section aria-labelledby="projects-h">
          <h2 id="projects-h" className="section-h">Projects</h2>
          <ul className="project-list">
            {projects.map((p) => {
              const late = p.milestones.some((m) => isOverdue(m));
              const left = outstanding(p);
              return (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="project-row">
                    <div className="project-row-main">
                      <span className="project-client">{p.clientName}</span>
                      <span className="project-title">{p.title}</span>
                    </div>
                    <MilestoneSeals milestones={p.milestones} />
                    <div className="project-row-money">
                      {left > 0 ? (
                        <>
                          <span className="amount">{money(left, p.currency)}</span>
                          <span className={`status ${late ? "status-overdue" : "status-awaiting_payment"}`}>{late ? "Overdue" : "Unpaid"}</span>
                        </>
                      ) : (
                        <span className="status status-paid">Paid in full</span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <aside aria-labelledby="activity-h">
          <h2 id="activity-h" className="section-h">Activity</h2>
          <ol className="activity">
            {activity.map((a) => (
              <li key={a.id} className={`activity-${a.kind}`}>
                <span>{a.text}</span>
                <time className="tiny muted" dateTime={a.at}>{since(a.at)}</time>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
