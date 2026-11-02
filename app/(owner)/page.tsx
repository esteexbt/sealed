import Link from "next/link";
import { listProjects, read, isOverdue, outstanding, held, projectSlug } from "@/lib/db";
import { money, settleDue } from "@/lib/actions";
import { pageUser } from "@/lib/auth";
import { MilestoneSeals } from "@/components/MilestoneSeals";

function since(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default async function Dashboard() {
  const user = await pageUser();
  await settleDue();
  const projects = listProjects(user.id);
  const mine = new Set(projects.map((p) => p.id));
  const activity = read().activity.filter((a) => mine.has(a.projectId)).slice(0, 12);
  const currency = projects[0]?.currency || "USD";
  const owed = projects.reduce((a, p) => a + outstanding(p), 0);
  const overdueRows = projects.flatMap((p) => p.milestones.filter((m) => isOverdue(m)).map((m) => ({ p, m })));
  const overdue = overdueRows.reduce((a, r) => a + r.m.amount, 0);
  const paid = projects.flatMap((p) => p.milestones).filter((m) => m.status === "paid").reduce((a, m) => a + m.amount, 0);
  const holding = projects.reduce((a, p) => a + held(p), 0);

  if (!projects.length) {
    return (
      <section className="empty">
        <h1>Paste a client brief and get a payment plan back.</h1>
        <p className="lede muted">
          Sealed splits the work into paid milestones, sends them through PayPal, and keeps every file sealed until the client pays.
        </p>
        <Link href="/new" className="btn btn-seal">Start from a brief</Link>
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
        <div className="dash-wins">
          {paid > 0 && (
            <span className="win win-paid">
              <span className="win-ic" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 10.5l3.6 3.5 7.4-8" /></svg>
              </span>
              <span><strong>{money(paid, currency)}</strong> banked so far, from {projects.length} project{projects.length === 1 ? "" : "s"}</span>
            </span>
          )}
          {holding > 0 && (
            <span className="win win-held">
              <span className="win-ic" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
              </span>
              <span><strong>{money(holding, currency)}</strong> locked in with PayPal, waiting on review</span>
            </span>
          )}
        </div>
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
              const hold = held(p);
              return (
                <li key={p.id}>
                  <Link href={`/projects/${projectSlug(p)}`} className="project-row">
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
                      ) : hold > 0 ? (
                        <>
                          <span className="amount">{money(hold, p.currency)}</span>
                          <span className="status status-in_review">Held, in review</span>
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
