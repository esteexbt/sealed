import "server-only";
import { generateText, tool, type CoreMessage, type Tool } from "ai";
import { z } from "zod";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { config, paypalMode } from "./config";
import { model } from "./ai";
import { isOverdue, listProjects, read } from "./db";
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
  pending?: { kind: "remind" | "refund"; projectId: string; milestoneId: string; message?: string } | null;
}

const SYSTEM = () => `You are Sealed's money assistant for ${config.freelancerName}, an independent freelancer.
You can see their projects, milestones and payments in Sealed, and act on their PayPal ${paypalMode === "sandbox" ? "sandbox " : ""}account.
Today is ${new Date().toISOString().slice(0, 10)}.

How you work:
- Answer with real numbers from your tools, never guesses. Lead with the answer.
- Money moves only with consent. For send_payment_reminder and refund_milestone, first call with confirmed=false to get a preview, show it to the user, and ask. Call with confirmed=true only after the user clearly says yes in their latest message.
- Keep replies short: a sentence or two, then a compact list if there are several items. Plain text, no markdown headers.
- Amounts always include currency. Refer to clients and milestones by name, not id.`;

function sealedTools() {
  return {
    list_receivables: tool({
      description: "List every milestone awaiting payment across all projects, with amount, due date, overdue flag and reminders already sent.",
      parameters: z.object({}),
      execute: async () => receivables(),
    }),
    list_projects: tool({
      description: "List all projects with each milestone's status, amount and due date.",
      parameters: z.object({}),
      execute: async () =>
        listProjects().map((p) => ({
          projectId: p.id,
          title: p.title,
          client: p.clientName,
          clientEmail: p.clientEmail,
          portal: portalUrl(p),
          milestones: p.milestones.map((m) => ({
            milestoneId: m.id,
            title: m.title,
            amount: money(m.amount, p.currency),
            status: m.status,
            dueDate: m.dueDate,
            overdue: isOverdue(m),
            files: m.files.length,
          })),
        })),
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
        if (!confirmed) {
          const { project, milestone } = locate(projectId, milestoneId);
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
        const { project, milestone } = locate(projectId, milestoneId);
        if (!confirmed) return { status: "preview", refund: money(milestone.amount, project.currency), milestone: milestone.title, client: project.clientName };
        const r = await refundMilestone(projectId, milestoneId);
        return { status: "refunded", refundId: r.id };
      },
    }),
  };
}

function locate(projectId: string, milestoneId: string) {
  const project = read().projects.find((p) => p.id === projectId);
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
        invoices: { list: true, get: true, search: true, sendReminder: true },
        orders: { get: true },
        transactions: { list: true },
        insights: { get: true },
      },
      context: { sandbox: true },
    },
  });
  return toolkit.getTools() as Record<string, Tool>;
}

const SEALED_TOOL_NAMES = new Set(["list_receivables", "list_projects", "send_payment_reminder", "refund_milestone"]);

function summarize(name: string, args: unknown, result: unknown): string {
  const r = result as Record<string, unknown> | unknown[] | undefined;
  if (name === "list_receivables" && Array.isArray(r)) return `${r.length} milestone${r.length === 1 ? "" : "s"} awaiting payment`;
  if (name === "list_projects" && Array.isArray(r)) return `${r.length} project${r.length === 1 ? "" : "s"}`;
  if (r && !Array.isArray(r) && typeof r === "object" && "status" in r) return String(r.status);
  void args;
  return "done";
}

export async function runAgent(messages: CoreMessage[]): Promise<AgentReply> {
  const m = model();
  if (!m) return offlineAgent(messages);

  const result = await generateText({
    model: m,
    system: SYSTEM(),
    messages,
    tools: { ...sealedTools(), ...paypalTools() },
    maxSteps: 8,
  });

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

async function offlineAgent(messages: CoreMessage[]): Promise<AgentReply> {
  const last = messages.at(-1);
  const text = (typeof last?.content === "string" ? last.content : "").toLowerCase();
  const rows = receivables();

  if (/who owes|outstanding|unpaid|owed|receivable|overdue|money/.test(text)) {
    if (!rows.length) return { text: "Nobody owes you anything right now. Every milestone is paid.", steps: [{ tool: "list_receivables", source: "sealed", summary: "0 awaiting payment" }] };
    const total = rows.reduce((a, r) => a + r.amount, 0);
    const lines = rows.map((r) => `${r.client}: ${money(r.amount, r.currency)} for ${r.milestone}, due ${r.dueDate}${r.overdue ? " (overdue)" : ""}`);
    const overdue = rows.filter((r) => r.overdue);
    return {
      text: `You're owed ${money(total, rows[0].currency)} across ${rows.length} milestone${rows.length === 1 ? "" : "s"}.\n${lines.join("\n")}${overdue.length ? `\n\nWant me to remind ${overdue[0].client}? Say "remind ${overdue[0].client}".` : ""}`,
      steps: [{ tool: "list_receivables", source: "sealed", summary: `${rows.length} awaiting payment` }],
    };
  }

  if (/collect|earned|received|paid me|income/.test(text)) {
    const paid = listProjects().flatMap((p) => p.milestones.filter((m) => m.status === "paid" && m.payment?.capturedAt).map((m) => ({ p, m })));
    const month = new Date().toISOString().slice(0, 7);
    const thisMonth = paid.filter((x) => x.m.payment!.capturedAt!.startsWith(month));
    const sum = thisMonth.reduce((a, x) => a + x.m.amount, 0);
    const cur = paid[0]?.p.currency || "USD";
    return {
      text: thisMonth.length
        ? `You've collected ${money(sum, cur)} this month from ${thisMonth.length} payment${thisMonth.length === 1 ? "" : "s"}.\n${thisMonth.map((x) => `${x.p.clientName}: ${money(x.m.amount, cur)} for ${x.m.title}`).join("\n")}`
        : "No payments captured this month yet.",
      steps: [{ tool: "list_projects", source: "sealed", summary: `${paid.length} paid milestones` }],
    };
  }

  const remind = text.match(/remind\s+(.+)/);
  if (remind) {
    const q = remind[1].replace(/[?.!]/g, "").trim();
    const row = rows.find((r) => r.client.toLowerCase().includes(q) || r.project.toLowerCase().includes(q)) || rows.find((r) => r.overdue);
    if (!row) return { text: `I couldn't find an unpaid milestone for "${q}".`, steps: [] };
    const p = listProjects().find((x) => x.id === row.projectId)!;
    const msg = await draftReminder({
      clientName: row.client,
      milestoneTitle: row.milestone,
      amount: money(row.amount, row.currency),
      daysOverdue: Math.max(0, Math.floor((Date.now() - new Date(row.dueDate + "T00:00:00Z").getTime()) / 86400000)),
      remindersSent: row.remindersSent,
      portalUrl: portalUrl(p),
    });
    return {
      text: `Here's the reminder for ${row.client} (${row.clientEmail}). It goes out as a PayPal invoice for ${money(row.amount, row.currency)} with your portal link.\n\n${msg}\n\nSend it?`,
      steps: [{ tool: "send_payment_reminder", source: "sealed", summary: "preview" }],
      pending: { kind: "remind", projectId: row.projectId, milestoneId: row.milestoneId, message: msg },
    };
  }

  return {
    text: 'I can tell you who owes you money, remind a client, or refund a milestone. Try "who owes me?"',
    steps: [],
  };
}

export async function confirmPending(p: NonNullable<AgentReply["pending"]>): Promise<AgentReply> {
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
