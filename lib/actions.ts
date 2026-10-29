import "server-only";
import { config, paypalMode } from "./config";
import { findByOrder, findMilestone, id, isOverdue, log, mutate, read, token } from "./db";
import * as paypal from "./paypal";
import { draftReminder } from "./ai";
import type { Milestone, Project, ScopePlan } from "./types";

export const money = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

export const portalUrl = (p: Project) => `${config.appUrl}/p/${p.portalToken}`;

function addDays(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function createProject(plan: ScopePlan, brief: string): Promise<Project> {
  const project: Project = {
    id: id(),
    portalToken: token(),
    title: plan.title.trim() || "Untitled project",
    clientName: plan.clientName.trim() || "Client",
    clientEmail: plan.clientEmail.trim(),
    currency: (plan.currency || "USD").toUpperCase(),
    brief,
    summary: plan.summary,
    questions: plan.questions,
    createdAt: new Date().toISOString(),
    milestones: plan.milestones.map(
      (m): Milestone => ({
        id: id(),
        title: m.title,
        description: m.description,
        deliverables: m.deliverables,
        amount: Math.round(m.amount * 100) / 100,
        dueDate: addDays(m.dueInDays),
        status: "awaiting_payment",
        files: [],
        payment: null,
        reminders: [],
      }),
    ),
  };
  await mutate((s) => {
    s.projects.push(project);
    log(s, { projectId: project.id, kind: "created", text: `Created ${project.title} for ${project.clientName}` });
  });
  return project;
}

/** Creates a PayPal order for a milestone from the client portal. */
export async function startCheckout(portalToken: string, milestoneId: string) {
  const s = read();
  const project = s.projects.find((p) => p.portalToken === portalToken);
  const milestone = project?.milestones.find((m) => m.id === milestoneId);
  if (!project || !milestone) throw new Error("Milestone not found");
  if (milestone.status === "paid") throw new Error("This milestone is already paid");
  const order = await paypal.createOrder({
    projectId: project.id,
    milestoneId,
    description: `${project.title}: ${milestone.title}`,
    amount: milestone.amount,
    currency: project.currency,
  });
  await mutate((st) => {
    const { milestone: m } = findMilestone(st, project.id, milestoneId);
    if (m && m.status !== "paid") {
      m.payment = { orderId: order.id, captureId: null, amount: m.amount, currency: project.currency, payerEmail: null, capturedAt: null, mode: paypalMode };
    }
  });
  return order;
}

/**
 * Captures the order and unlocks the milestone only if PayPal confirms a
 * COMPLETED capture for exactly this milestone, amount and currency.
 * This is the gate: nothing else can mark a milestone paid.
 */
export async function completeCheckout(portalToken: string, orderId: string) {
  const before = read();
  const { project, milestone } = findByOrder(before, orderId);
  if (!project || !milestone || project.portalToken !== portalToken) throw new Error("Order does not belong to this project");
  if (milestone.status === "paid") return { ok: true as const, milestoneId: milestone.id, already: true };

  const cap = await paypal.captureOrder(orderId);
  const expected = `${project.id}:${milestone.id}`;
  const problems: string[] = [];
  if (cap.status !== "COMPLETED") problems.push(`capture status is ${cap.status}`);
  if (cap.customId && cap.customId !== expected) problems.push("order was created for a different milestone");
  if (Math.abs(cap.amount - milestone.amount) > 0.001) problems.push(`captured ${cap.amount}, expected ${milestone.amount}`);
  if (cap.currency !== project.currency) problems.push(`currency ${cap.currency}, expected ${project.currency}`);
  if (problems.length) throw new Error("Payment not verified: " + problems.join("; "));

  await mutate((s) => {
    const { milestone: m } = findMilestone(s, project.id, milestone.id);
    if (!m) return;
    m.status = "paid";
    m.payment = {
      orderId,
      captureId: cap.captureId,
      amount: cap.amount,
      currency: cap.currency,
      payerEmail: cap.payerEmail,
      capturedAt: new Date().toISOString(),
      mode: paypalMode,
    };
    log(s, {
      projectId: project.id,
      milestoneId: m.id,
      kind: "payment_captured",
      text: `${project.clientName} paid ${money(cap.amount, cap.currency)} for ${m.title}. Files unlocked.`,
    });
  });
  return { ok: true as const, milestoneId: milestone.id, already: false };
}

export async function sendReminder(projectId: string, milestoneId: string, customMessage?: string) {
  const s = read();
  const { project, milestone } = findMilestone(s, projectId, milestoneId);
  if (!project || !milestone) throw new Error("Milestone not found");
  if (milestone.status !== "awaiting_payment") throw new Error(`${milestone.title} is not awaiting payment`);
  if (!project.clientEmail) throw new Error(`Add an email for ${project.clientName} before sending a reminder`);

  const days = Math.max(0, Math.floor((Date.now() - new Date(milestone.dueDate + "T00:00:00Z").getTime()) / 86400000));
  const message =
    customMessage ||
    (await draftReminder({
      clientName: project.clientName,
      milestoneTitle: milestone.title,
      amount: money(milestone.amount, project.currency),
      daysOverdue: days,
      remindersSent: milestone.reminders.length,
      portalUrl: portalUrl(project),
    }));

  // Payment always happens in the portal so the unlock stays tied to the capture;
  // the PayPal invoice carries the message and the portal link.
  const inv = await paypal.createAndSendInvoice({
    clientName: project.clientName,
    clientEmail: project.clientEmail,
    itemName: `${project.title}: ${milestone.title}`,
    amount: milestone.amount,
    currency: project.currency,
    dueDate: milestone.dueDate < new Date().toISOString().slice(0, 10) ? new Date().toISOString().slice(0, 10) : milestone.dueDate,
    note: `${message}\n\nView and unlock your files: ${portalUrl(project)}`,
    reference: `sealed:${project.id}:${milestone.id}`,
  });

  await mutate((st) => {
    const { milestone: m } = findMilestone(st, projectId, milestoneId);
    if (!m) return;
    m.reminders.push({ id: id(), sentAt: new Date().toISOString(), channel: "paypal_invoice", invoiceId: inv.invoiceId, message });
    log(st, { projectId, milestoneId, kind: "reminder_sent", text: `Reminder sent to ${project.clientName} for ${m.title} via PayPal invoice` });
  });
  return { invoiceId: inv.invoiceId, message };
}

export async function refundMilestone(projectId: string, milestoneId: string) {
  const s = read();
  const { project, milestone } = findMilestone(s, projectId, milestoneId);
  if (!project || !milestone) throw new Error("Milestone not found");
  if (milestone.status !== "paid" || !milestone.payment?.captureId) throw new Error(`${milestone.title} has no captured payment to refund`);
  const ref = await paypal.refundCapture(milestone.payment.captureId, milestone.payment.amount, milestone.payment.currency);
  await mutate((st) => {
    const { milestone: m } = findMilestone(st, projectId, milestoneId);
    if (!m) return;
    m.status = "refunded";
    log(st, { projectId, milestoneId, kind: "refunded", text: `Refunded ${money(m.amount, project.currency)} for ${m.title}. Files sealed again.` });
  });
  return ref;
}

export function receivables() {
  const s = read();
  const rows = s.projects.flatMap((p) =>
    p.milestones
      .filter((m) => m.status === "awaiting_payment")
      .map((m) => ({
        projectId: p.id,
        milestoneId: m.id,
        client: p.clientName,
        clientEmail: p.clientEmail,
        project: p.title,
        milestone: m.title,
        amount: m.amount,
        currency: p.currency,
        dueDate: m.dueDate,
        overdue: isOverdue(m),
        filesReady: m.files.length,
        remindersSent: m.reminders.length,
        lastReminder: m.reminders.at(-1)?.sentAt || null,
      })),
  );
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
