import "server-only";
import { generateText, tool, type CoreMessage, type Tool } from "ai";
import { z } from "zod";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { config, paypalMode } from "./config";
import { model } from "./ai";
import { isOverdue, listProjects, read } from "./db";
import type { User } from "./types";
import { money, portalUrl, receivables, refundMilestone, sendReminder } from "./actions";
import { draftReminder } from "./ai";

export interface AgentStep {
  tool: string;
  source: "sealed" | "paypal";
  summary: string;
}

export interface AgentReply {
  text: string;
  steps: AgentStep[];
  /** Offline mode only: an action waiting for the user's yes. */
  pending?: { kind: "remind" | "refund"; projectId: string; milestoneId: string; message?: string; to?: string; amount?: string; title?: string } | null;
}

const SYSTEM = (u: User) => `You are Sealed's money assistant for ${u.name}, an independent freelancer.
You can see their projects, milestones and payments in Sealed, and act on their PayPal ${paypalMode === "sandbox" ? "sandbox " : ""}account.
Today is ${new Date().toISOString().slice(0, 10)}.

How payments work in Sealed: first the client approves the plan (the stages, prices and dates); plan status is "pending" (waiting for the client), "changes" (the client asked for changes; their note is included) or "agreed". Nothing can be paid until it's agreed, and changing an agreed plan sends it back for approval. When work is delivered, the client pays into a PayPal hold (status in_review). Money moves to the freelancer only when the client approves, or automatically after 3 days. During review the client can request changes (status changes_requested); the hold stays until a revision is sent. "Owed" means awaiting_payment; "held" means in_review or changes_requested. After release, Sealed sends the freelancer's share (after PayPal's fee) to their PayPal email with PayPal Payouts; payout status is sent, pending, waiting_email (they haven't added a PayPal email) or failed.

How you work:
- Answer with real numbers from your tools, never guesses. Lead with the answer.
- Money moves only with consent. For send_payment_reminder and refund_milestone, first call with confirmed=false to get a preview, show it to the user, and ask. Call with confirmed=true only after the user clearly says yes in their latest message.
- Keep replies short: a sentence or two, then a compact list if there are several items. Plain text, no markdown headers.
- Amounts always include currency. Refer to clients and milestones by name, not id.`;

function sealedTools(u: User) {
  return {
    list_receivables: tool({
      description: "List every milestone awaiting payment across all projects, with amount, due date, overdue flag and reminders already sent.",
      parameters: z.object({}),
      execute: async () => receivables(u.id),
    }),
    list_projects: tool({
      description: "List all projects with each milestone's status, amount and due date.",
      parameters: z.object({}),
      execute: async () =>
        listProjects(u.id).map((p) => ({
          projectId: p.id,
          title: p.title,
          client: p.clientName,
          clientEmail: p.clientEmail,
          portal: portalUrl(p),
          plan: p.agreement ? { status: p.agreement.status, clientRequest: p.agreement.request?.note || null } : { status: "agreed", clientRequest: null },
          milestones: p.milestones.map((m) => ({
            milestoneId: m.id,
            title: m.title,
            amount: money(m.amount, p.currency),
            status: m.status,
            dueDate: m.dueDate,
            overdue: isOverdue(m),
            files: m.files.length,
            payout: m.payment?.payout ? { status: m.payment.payout.status, amount: money(m.payment.payout.amount, p.currency), to: m.payment.payout.email } : null,
          })),
        })),
    }),
    list_payouts: tool({
      description: "List money released to the freelancer and where it went: amount sent to their PayPal, status (sent, pending, waiting_email, failed) and date.",
      parameters: z.object({}),
      execute: async () =>
        listProjects(u.id).flatMap((p) =>
          p.milestones
            .filter((m) => m.status === "paid")
            .map((m) => ({
              client: p.clientName,
              milestone: m.title,
              paid: money(m.amount, p.currency),
              releasedAt: m.payment?.capturedAt?.slice(0, 10) || null,
              payout: m.payment?.payout ? { status: m.payment.payout.status, amount: money(m.payment.payout.amount, p.currency), to: m.payment.payout.email, error: m.payment.payout.error || null } : { status: "kept in Sealed's PayPal account" },
            })),
        ),
    }),
    send_payment_reminder: tool({
      description:
        "Send a payment reminder for one milestone. It's delivered to the client as a PayPal invoice with a link back to the portal, where paying unlocks the files. Call with confirmed=false first to preview the message.",
      parameters: z.object({
        projectId: z.string(),
        milestoneId: z.string(),
        message: z.string().optional().describe("Custom message. Omit to let Sealed draft one."),
        confirmed: z.boolean().describe("true only after the user approved the preview"),
      }),
      execute: async ({ projectId, milestoneId, message, confirmed }) => {
        const { project, milestone } = locate(u, projectId, milestoneId);
        if (!confirmed) {
          const days = Math.max(0, Math.floor((Date.now() - new Date(milestone.dueDate + "T00:00:00Z").getTime()) / 86400000));
          const preview =
            message ||
            (await draftReminder({
              clientName: project.clientName,
              milestoneTitle: milestone.title,
              amount: money(milestone.amount, project.currency),
              daysOverdue: days,
              remindersSent: milestone.reminders.length,
              portalUrl: portalUrl(project),
              freelancer: u.name,
            }));
          return { status: "preview", to: project.clientEmail, preview };
        }
        const out = await sendReminder(projectId, milestoneId, message);
        return { status: "sent", invoiceId: out.invoiceId };
      },
    }),
    refund_milestone: tool({
      description: "Refund a paid milestone through PayPal. Its files seal again. Call with confirmed=false first.",
      parameters: z.object({ projectId: z.string(), milestoneId: z.string(), confirmed: z.boolean() }),
      execute: async ({ projectId, milestoneId, confirmed }) => {
        const { project, milestone } = locate(u, projectId, milestoneId);
        if (!confirmed) return { status: "preview", refund: money(milestone.amount, project.currency), milestone: milestone.title, client: project.clientName };
        const r = await refundMilestone(projectId, milestoneId);
        return { status: "refunded", refundId: r.id };
      },
    }),
  };
}

/** A milestone in one of this freelancer's own projects, or an error. */
function locate(u: User, projectId: string, milestoneId: string) {
  const project = read().projects.find((p) => p.id === projectId && p.ownerId === u.id);
  const milestone = project?.milestones.find((m) => m.id === milestoneId);
  if (!project || !milestone) throw new Error("Milestone not found");
  return { project, milestone };
}

/** Official PayPal Agent Toolkit tools, scoped to what a freelancer's assistant needs. */
function paypalTools(): Record<string, Tool> {
  if (paypalMode !== "sandbox") return {};
  const toolkit = new PayPalAgentToolkit({
    clientId: config.paypalClientId,
    clientSecret: config.paypalSecret,
    configuration: {
      actions: {
        // Kept small on purpose: every tool's description is sent with each question, and the free
        // Groq tier allows 8,000 tokens a minute. Reminders go through Sealed's own send_payment_reminder.
        invoices: { list: true, get: true },
        transactions: { list: true },
      },
      context: { sandbox: true },
    },
  });
  return toolkit.getTools() as Record<string, Tool>;
}

const SEALED_TOOL_NAMES = new Set(["list_receivables", "list_projects", "list_payouts", "send_payment_reminder", "refund_milestone"]);

function summarize(name: string, args: unknown, result: unknown): string {
  const r = result as Record<string, unknown> | unknown[] | undefined;
  if (name === "list_receivables" && Array.isArray(r)) return `${r.length} milestone${r.length === 1 ? "" : "s"} awaiting payment`;
  if (name === "list_projects" && Array.isArray(r)) return `${r.length} project${r.length === 1 ? "" : "s"}`;
  if (name === "list_payouts" && Array.isArray(r)) return `${r.length} released payment${r.length === 1 ? "" : "s"}`;
  if (r && !Array.isArray(r) && typeof r === "object" && "status" in r) return String(r.status);
  void args;
  return "done";
}

const QUICK = /who owes|outstanding|unpaid|owed|receivable|overdue|held|hold|in review|payouts?|paid out|my paypal|\bplans?\b|signed off|sign-off|collected|earned|this month/;

export async function runAgent(messages: CoreMessage[], u: User): Promise<AgentReply> {
  const m = model();
  if (!m) return offlineAgent(messages, u);

  // Quick look-ups ("who owes me money?", "what's held?", payouts, plans) are answered straight from
  // Sealed's own data, the same numbers the tools would return, so they come back instantly.
  const last = messages.at(-1);
  const ask = typeof last?.content === "string" ? last.content.toLowerCase() : "";
  if (messages.length === 1 && QUICK.test(ask) && !/remind|refund|send|invoice|why|how|should|draft|write/.test(ask)) return offlineAgent(messages, u);

  let result;
  try {
    result = await generateText({
      model: m,
      system: SYSTEM(u),
      messages: messages.slice(-10),
      tools: { ...sealedTools(u), ...paypalTools() },
      maxSteps: 8,
      // Don't keep the user waiting on a slow provider: fall back to the rule-based answer instead.
      abortSignal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    // Free-tier quota or provider outage: answer with the rule-based assistant instead of failing.
    console.warn("[ai] assistant failed, using offline fallback:", (e as Error).message);
    return offlineAgent(messages, u);
  }

  const steps: AgentStep[] = [];
  for (const step of result.steps) {
    for (const call of step.toolCalls) {
      const res = step.toolResults.find((r) => r.toolCallId === call.toolCallId);
      steps.push({
        tool: call.toolName,
        source: SEALED_TOOL_NAMES.has(call.toolName) ? "sealed" : "paypal",
        summary: summarize(call.toolName, call.args, res?.result),
      });
    }
  }
  return { text: result.text, steps };
}

/* ------------- Offline assistant: rule-based, same tools, no LLM ------------- */

async function offlineAgent(messages: CoreMessage[], u: User): Promise<AgentReply> {
  const last = messages.at(-1);
  const text = (typeof last?.content === "string" ? last.content : "").toLowerCase();
  const rows = receivables(u.id);

  if (/\bplans?\b|signed off|sign-off/.test(text)) {
    const ps = listProjects(u.id);
    const waiting = ps.filter((p) => p.agreement?.status === "pending");
    const changes = ps.filter((p) => p.agreement?.status === "changes");
    const steps: AgentStep[] = [{ tool: "list_projects", source: "sealed", summary: `${ps.length} projects` }];
    if (!waiting.length && !changes.length) return { text: "Every client has approved their plan. Nothing is waiting on a sign-off.", steps };
    const lines = [
      ...changes.map((p) => `- ${p.clientName} asked for changes to ${p.title}: “${p.agreement!.request?.note || ""}”`),
      ...waiting.map((p) => `- ${p.clientName} hasn't approved ${p.title} yet (sent ${new Date(p.agreement!.sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })})`),
    ];
    return {
      text: `${changes.length ? `${changes.length} client${changes.length === 1 ? " wants" : "s want"} changes` : ""}${changes.length && waiting.length ? ", and " : ""}${waiting.length ? `${waiting.length} plan${waiting.length === 1 ? " is" : "s are"} waiting for approval` : ""}. They can't pay until they approve.\n${lines.join("\n")}`,
      steps,
    };
  }

  if (/payout|sent to (me|my)|my paypal|paid out|transfer/.test(text)) {
    const paid = listProjects(u.id).flatMap((p) => p.milestones.filter((m) => m.status === "paid" && m.payment?.payout).map((m) => ({ p, m, o: m.payment!.payout! })));
    const steps: AgentStep[] = [{ tool: "list_payouts", source: "sealed", summary: `${paid.length} payouts` }];
    if (!paid.length) return { text: "No payouts yet. When a client approves a stage, your share is sent to the PayPal email in your profile.", steps };
    const cur = paid[0].p.currency;
    const sent = paid.filter((x) => x.o.status === "sent");
    const waiting = paid.filter((x) => x.o.status === "waiting_email");
    const failed = paid.filter((x) => x.o.status === "failed");
    const lines = paid.map((x) => `- ${x.p.clientName}, ${x.m.title}: ${money(x.o.amount, cur)} ${x.o.status === "sent" ? `sent to ${x.o.email}` : x.o.status === "pending" ? "on its way" : x.o.status === "waiting_email" ? "waiting for your PayPal email" : `failed: ${x.o.error || "PayPal refused it"}`}`);
    return {
      text: `${money(sent.reduce((a, x) => a + x.o.amount, 0), cur)} has been sent to your PayPal so far.${waiting.length ? ` ${money(waiting.reduce((a, x) => a + x.o.amount, 0), cur)} is waiting: add your PayPal email in My account and it goes out straight away.` : ""}${failed.length ? ` ${failed.length} payout${failed.length === 1 ? "" : "s"} failed; open the project to try again.` : ""}\n${lines.join("\n")}`,
      steps,
    };
  }

  if (/who owes|outstanding|unpaid|owed|receivable|overdue|money/.test(text)) {
    if (!rows.length) return { text: "Nobody owes you anything right now. Every milestone is paid.", steps: [{ tool: "list_receivables", source: "sealed", summary: "0 awaiting payment" }] };
    const total = rows.reduce((a, r) => a + r.amount, 0);
    const lines = rows.map((r) => `- ${r.client}: ${money(r.amount, r.currency)} for ${r.milestone}, ${r.overdue ? "overdue since" : "due"} ${new Date(r.dueDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    const heldRows = listProjects(u.id).flatMap((p) => p.milestones.filter((m) => m.status === "in_review" || m.status === "changes_requested").map((m) => ({ p, m })));
    if (heldRows.length) lines.push(`\nAlso held by PayPal while clients review: ${money(heldRows.reduce((a, h) => a + h.m.amount, 0), heldRows[0].p.currency)}.`);
    const overdue = rows.filter((r) => r.overdue);
    return {
      text: `You're owed ${money(total, rows[0].currency)} across ${rows.length} stage${rows.length === 1 ? "" : "s"}.\n${lines.join("\n")}${overdue.length ? `\n\n${overdue[0].client} is the most overdue. Want me to send them a reminder?` : ""}`,
      steps: [{ tool: "list_receivables", source: "sealed", summary: `${rows.length} awaiting payment` }],
    };
  }

  if (/held|hold|in review|reviewing|escrow/.test(text)) {
    const heldRows = listProjects(u.id).flatMap((p) => p.milestones.filter((m) => m.status === "in_review" || m.status === "changes_requested").map((m) => ({ p, m })));
    if (!heldRows.length) return { text: "Nothing is held by PayPal right now. Holds appear when a client pays a stage into review.", steps: [{ tool: "list_projects", source: "sealed", summary: "0 held" }] };
    const total = heldRows.reduce((a, h) => a + h.m.amount, 0);
    return {
      text: `PayPal is holding ${money(total, heldRows[0].p.currency)} for you across ${heldRows.length} stage${heldRows.length === 1 ? "" : "s"}. It releases when each client approves, or automatically after 3 days.\n${heldRows
        .map((h) => `- ${h.p.clientName}: ${money(h.m.amount, h.p.currency)} for ${h.m.title}${h.m.status === "changes_requested" ? " (changes requested)" : h.m.payment?.reviewEndsAt ? `, releases by ${new Date(h.m.payment.reviewEndsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`)
        .join("\n")}`,
      steps: [{ tool: "list_projects", source: "sealed", summary: `${heldRows.length} held` }],
    };
  }

  if (/collect|earned|received|paid me|income/.test(text)) {
    const paid = listProjects(u.id).flatMap((p) => p.milestones.filter((m) => m.status === "paid" && m.payment?.capturedAt).map((m) => ({ p, m })));
    const month = new Date().toISOString().slice(0, 7);
    const thisMonth = paid.filter((x) => x.m.payment!.capturedAt!.startsWith(month));
    const sum = thisMonth.reduce((a, x) => a + x.m.amount, 0);
    const cur = paid[0]?.p.currency || "USD";
    return {
      text: thisMonth.length
        ? `You've collected ${money(sum, cur)} this month from ${thisMonth.length} payment${thisMonth.length === 1 ? "" : "s"}.\n${thisMonth.map((x) => `- ${x.p.clientName}: ${money(x.m.amount, cur)} for ${x.m.title}`).join("\n")}`
        : "No payments captured this month yet.",
      steps: [{ tool: "list_projects", source: "sealed", summary: `${paid.length} paid milestones` }],
    };
  }

  const remind = text.match(/remind\s+(.+)/) || (/^(yes|yeah|yep|sure|ok|okay|send (it|them|a reminder))\b/.test(text.trim()) ? ["", "most overdue"] : null);
  if (remind) {
    const q = remind[1].replace(/[?.!]/g, "").replace(/^(whoever is |the )?most overdue.*$/, "").trim();
    const row = (q && rows.find((r) => r.client.toLowerCase().includes(q) || r.project.toLowerCase().includes(q))) || rows.filter((r) => r.overdue).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    if (!row) return { text: `I couldn't find an unpaid milestone for "${q}".`, steps: [] };
    const p = listProjects(u.id).find((x) => x.id === row.projectId)!;
    const msg = await draftReminder({
      clientName: row.client,
      milestoneTitle: row.milestone,
      amount: money(row.amount, row.currency),
      daysOverdue: Math.max(0, Math.floor((Date.now() - new Date(row.dueDate + "T00:00:00Z").getTime()) / 86400000)),
      remindersSent: row.remindersSent,
      portalUrl: portalUrl(p),
      freelancer: u.name,
    });
    return {
      text: `Here's a reminder for ${row.client}. It goes out as a PayPal invoice for ${money(row.amount, row.currency)}, with the link to their portal.`,
      steps: [{ tool: "send_payment_reminder", source: "sealed", summary: "preview" }],
      pending: { kind: "remind", projectId: row.projectId, milestoneId: row.milestoneId, message: msg, to: `${row.client}${row.clientEmail ? ` · ${row.clientEmail}` : ""}`, amount: money(row.amount, row.currency), title: row.milestone },
    };
  }

  return {
    text: "I can tell you who owes you money, what PayPal is holding, which clients haven't approved their plan, what's been sent to your PayPal, or send a client a payment reminder. Try one of the suggestions below.",
    steps: [],
  };
}

export async function confirmPending(p: NonNullable<AgentReply["pending"]>, u: User): Promise<AgentReply> {
  locate(u, p.projectId, p.milestoneId);
  if (p.kind === "remind") {
    const out = await sendReminder(p.projectId, p.milestoneId, p.message);
    return {
      text: `Sent. PayPal invoice ${out.invoiceId} is on its way, and the files unlock as soon as they pay.`,
      steps: [{ tool: "send_payment_reminder", source: "sealed", summary: "sent" }, { tool: "create_invoice + send_invoice", source: "paypal", summary: out.invoiceId }],
    };
  }
  const r = await refundMilestone(p.projectId, p.milestoneId);
  return { text: `Refunded. PayPal refund ${r.id} is complete and the files are sealed again.`, steps: [{ tool: "refund_milestone", source: "sealed", summary: "refunded" }] };
}
