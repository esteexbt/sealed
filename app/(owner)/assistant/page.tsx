import { modelLabel } from "@/lib/ai";
import { paypalMode } from "@/lib/config";
import { pageUser } from "@/lib/auth";
import { held, isOverdue, listProjects, outstanding } from "@/lib/db";
import { money } from "@/lib/actions";
import { Assistant } from "./Assistant";

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const user = await pageUser();
  const projects = listProjects(user.id);
  const cur = projects[0]?.currency || "USD";
  const owed = projects.reduce((a, p) => a + outstanding(p), 0);
  const holding = projects.reduce((a, p) => a + held(p), 0);
  const overdue = projects.flatMap((p) => p.milestones.filter((m) => isOverdue(m)).map((m) => ({ p, m }))).sort((a, b) => a.m.dueDate.localeCompare(b.m.dueDate));
  const month = new Date().toISOString().slice(0, 7);
  const collected = projects.flatMap((p) => p.milestones).filter((m) => m.status === "paid" && m.payment?.capturedAt?.startsWith(month)).reduce((a, m) => a + m.amount, 0);

  // Suggestions follow the money: the most overdue client first, then what's held.
  const suggestions = [
    "Who owes me money?",
    overdue[0] ? `Remind ${overdue[0].p.clientName} about ${money(overdue[0].m.amount, overdue[0].p.currency)}` : null,
    projects.some((p) => p.agreement && p.agreement.status !== "agreed") ? "Which clients haven't approved their plan?" : null,
    holding > 0 ? "What is PayPal holding for me?" : null,
    projects.some((p) => p.milestones.some((m) => m.payment?.payout)) ? "What's been sent to my PayPal?" : "What did I collect this month?",
  ].filter(Boolean) as string[];

  return (
    <Assistant
      initial={q || ""}
      modelLabel={modelLabel}
      paypalMode={paypalMode}
      firstName={user.name.split(/\s+/)[0] || user.name}
      stats={[
        { label: "Owed to you", value: money(owed, cur) },
        { label: "Overdue", value: money(overdue.reduce((a, o) => a + o.m.amount, 0), cur), tone: overdue.length ? "danger" : undefined },
        { label: "Held by PayPal", value: money(holding, cur), tone: holding ? "held" : undefined },
        { label: "Collected this month", value: money(collected, cur), tone: collected ? "paid" : undefined },
      ]}
      suggestions={suggestions}
    />
  );
}
