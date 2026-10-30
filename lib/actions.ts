import "server-only";
import { config, paypalMode } from "./config";
import { currentFiles, findByOrder, findMilestone, id, isOverdue, log, mutate, read, token } from "./db";
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

export const REVIEW_DAYS = 3;
export const REVISE_DAYS = 3;
const later = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

function byToken(portalToken: string, milestoneId: string) {
  const s = read();
  const project = s.projects.find((p) => p.portalToken === portalToken);
  const milestone = project?.milestones.find((m) => m.id === milestoneId);
  if (!project || !milestone) throw new Error("Milestone not found");
  return { project, milestone };
}

/** Creates a PayPal order (intent AUTHORIZE) for a milestone from the client portal. */
export async function startCheckout(portalToken: string, milestoneId: string) {
  const { project, milestone } = byToken(portalToken, milestoneId);
  if (milestone.status !== "awaiting_payment") throw new Error("This milestone isn't waiting for payment");
  if (!currentFiles(milestone).length) throw new Error("There's nothing to review yet. You'll pay once the work is delivered.");
  const order = await paypal.createOrder({
    projectId: project.id,
    milestoneId,
    description: `${project.title}: ${milestone.title}`,
    amount: milestone.amount,
    currency: project.currency,
  });
  await mutate((st) => {
    const { milestone: m } = findMilestone(st, project.id, milestoneId);
    if (m && m.status === "awaiting_payment") {
      m.payment = { orderId: order.id, captureId: null, amount: m.amount, currency: project.currency, payerEmail: null, capturedAt: null, mode: paypalMode };
    }
  });
  return order;
}

/**
 * Authorizes the order: the client's money is held by PayPal, not moved.
 * Verified against the milestone, amount and currency before anything changes.
 * The review copy opens; the original files stay sealed until the hold is captured.
 */
export async function completeCheckout(portalToken: string, orderId: string) {
  const before = read();
  const { project, milestone } = findByOrder(before, orderId);
  if (!project || !milestone || project.portalToken !== portalToken) throw new Error("Order does not belong to this project");
  if (milestone.status !== "awaiting_payment") return { ok: true as const, milestoneId: milestone.id, already: true };
  if (Math.abs((milestone.payment?.amount ?? milestone.amount) - milestone.amount) > 0.001) {
    throw new Error("The price changed after checkout started. Refresh the page and pay again.");
  }

  const auth = await paypal.authorizeOrder(orderId);
  const expected = `${project.id}:${milestone.id}`;
  const problems: string[] = [];
  if (auth.status !== "CREATED" && auth.status !== "PENDING") problems.push(`hold status is ${auth.status}`);
  if (!auth.authorizationId) problems.push("PayPal returned no hold");
  if (auth.customId && auth.customId !== expected) problems.push("order was created for a different milestone");
  if (Math.abs(auth.amount - milestone.amount) > 0.001) problems.push(`held ${auth.amount}, expected ${milestone.amount}`);
  if (auth.currency !== project.currency) problems.push(`currency ${auth.currency}, expected ${project.currency}`);
  if (problems.length) throw new Error("Payment not verified: " + problems.join("; "));

  await mutate((s) => {
    const { milestone: m } = findMilestone(s, project.id, milestone.id);
    if (!m || m.status !== "awaiting_payment") return;
    const now = new Date().toISOString();
    m.status = "in_review";
    m.payment = {
      orderId,
      authorizationId: auth.authorizationId,
      authorizedAt: now,
      reviewEndsAt: later(REVIEW_DAYS),
      captureId: null,
      amount: auth.amount,
      currency: auth.currency,
      payerEmail: auth.payerEmail,
      capturedAt: null,
      mode: paypalMode,
    };
    log(s, {
      projectId: project.id,
      milestoneId: m.id,
      kind: "payment_held",
      text: `${project.clientName} paid ${money(auth.amount, auth.currency)} into a PayPal hold for ${m.title}. Review is open.`,
    });
  });
  return { ok: true as const, milestoneId: milestone.id, already: false };
}

/** Captures the hold: money goes to the freelancer and the originals unlock. */
async function release(projectId: string, milestoneId: string, by: "client" | "auto") {
  const s = read();
  const { project, milestone } = findMilestone(s, projectId, milestoneId);
  if (!project || !milestone) throw new Error("Milestone not found");
  if (milestone.status === "paid") return milestone;
  if (milestone.status !== "in_review") throw new Error(`${milestone.title} isn't in review`);
  const authId = milestone.payment?.authorizationId;
  if (!authId) throw new Error("No PayPal hold found for this milestone");
  const cap = await paypal.captureAuthorization(authId, milestone.payment!.amount, milestone.payment!.currency);
  if (cap.status !== "COMPLETED" && cap.status !== "PENDING") throw new Error(`PayPal capture status is ${cap.status}`);
  return mutate((st) => {
    const { milestone: m } = findMilestone(st, projectId, milestoneId);
    if (!m || !m.payment || m.status !== "in_review") return m;
    m.status = "paid";
    m.payment.captureId = cap.captureId;
    m.payment.captureStatus = cap.status;
    m.payment.capturedAt = new Date().toISOString();
    m.payment.releasedBy = by;
    m.payment.releaseError = null;
    log(st, {
      projectId,
      milestoneId,
      kind: "payment_captured",
      text:
        by === "client"
          ? `${project.clientName} approved ${m.title}. ${money(m.amount, project.currency)} released and files unlocked.`
          : `The review window for ${m.title} ended. ${money(m.amount, project.currency)} released automatically and files unlocked.`,
    });
    return m;
  });
}

export async function approveMilestone(portalToken: string, milestoneId: string) {
  const { project, milestone } = byToken(portalToken, milestoneId);
  if (milestone.status === "changes_requested") throw new Error("This stage is waiting on the revision you asked for, so it can't be approved yet.");
  return release(project.id, milestoneId, "client");
}

export async function requestChanges(portalToken: string, milestoneId: string, note: string) {
  const text = String(note || "").trim();
  if (text.length < 10) throw new Error("Say what needs to change, in a sentence or two.");
  if (text.length > 2000) throw new Error("Keep it under 2,000 characters.");
  const { project } = byToken(portalToken, milestoneId);
  return mutate((s) => {
    const { milestone: m } = findMilestone(s, project.id, milestoneId);
    if (!m) throw new Error("Milestone not found");
    if (m.status !== "in_review") throw new Error("Changes can only be requested during review");
    m.status = "changes_requested";
    m.changeRequests = [...(m.changeRequests || []), { id: id(), at: new Date().toISOString(), note: text, resolvedAt: null }];
    m.reviseBy = later(REVISE_DAYS);
    log(s, { projectId: project.id, milestoneId, kind: "changes_requested", text: `${project.clientName} asked for changes to ${m.title}. Payment stays held.` });
    return m;
  });
}

/** The freelancer sends a revision: files lock again and a fresh review window opens. */
export async function sendRevision(projectId: string, milestoneId: string) {
  return mutate((s) => {
    const { project, milestone: m } = findMilestone(s, projectId, milestoneId);
    if (!project || !m) throw new Error("Milestone not found");
    if (m.status !== "changes_requested") throw new Error(`${m.title} has no open change request`);
    const open = (m.changeRequests || []).filter((c) => !c.resolvedAt);
    const since = open[0]?.at || "";
    const changed = m.files.some((f) => f.uploadedAt > since || (f.removedAt && f.removedAt > since));
    if (!changed) throw new Error("Upload the revised files first, then send the revision.");
    if (!currentFiles(m).length) throw new Error("Add at least one file to review.");
    const now = new Date().toISOString();
    open.forEach((c) => (c.resolvedAt = now));
    m.status = "in_review";
    m.reviseBy = null;
    if (m.payment) m.payment.reviewEndsAt = later(REVIEW_DAYS);
    log(s, { projectId, milestoneId, kind: "revision_sent", text: `Revision sent for ${m.title}. ${project.clientName} has ${REVIEW_DAYS} days to review.` });
    return m;
  });
}

/** Voids the hold. The client's money was never moved. */
async function cancelHold(projectId: string, milestoneId: string, reason: string) {
  const s = read();
  const { project, milestone } = findMilestone(s, projectId, milestoneId);
  if (!project || !milestone) throw new Error("Milestone not found");
  const authId = milestone.payment?.authorizationId;
  if (!authId) throw new Error("No PayPal hold found for this milestone");
  await paypal.voidAuthorization(authId);
  return mutate((st) => {
    const { milestone: m } = findMilestone(st, projectId, milestoneId);
    if (!m || !m.payment) return m;
    m.status = "cancelled";
    m.payment.voidedAt = new Date().toISOString();
    log(st, { projectId, milestoneId, kind: "hold_released", text: reason });
    return m;
  });
}

/** Client side: allowed only after the freelancer missed the revision deadline. */
export async function clientCancel(portalToken: string, milestoneId: string) {
  const { project, milestone } = byToken(portalToken, milestoneId);
  if (milestone.status !== "changes_requested") throw new Error("This milestone can't be cancelled right now");
  if (!milestone.reviseBy || milestone.reviseBy > new Date().toISOString()) {
    throw new Error("The freelancer still has time to send a revision");
  }
  return cancelHold(project.id, milestoneId, `${project.clientName} cancelled ${milestone.title} after the revision deadline passed. The PayPal hold was released back to them.`);
}

/** Freelancer side: give the client their money back without capturing it. */
export async function freelancerCancel(projectId: string, milestoneId: string) {
  const s = read();
  const { project, milestone } = findMilestone(s, projectId, milestoneId);
  if (!project || !milestone) throw new Error("Milestone not found");
  if (milestone.status !== "in_review" && milestone.status !== "changes_requested") throw new Error(`${milestone.title} has no hold to release`);
  return cancelHold(projectId, milestoneId, `${config.freelancerName} cancelled ${milestone.title} and released ${project.clientName}'s PayPal hold.`);
}

/**
 * Releases holds whose review window has ended. Called on page loads, so it
 * runs without a scheduler; capture is idempotent per authorization.
 */
const settling = new Set<string>();
export async function settleDue() {
  const now = new Date().toISOString();
  const due = read().projects.flatMap((p) =>
    p.milestones
      .filter((m) => m.status === "in_review" && m.payment?.reviewEndsAt && m.payment.reviewEndsAt <= now && !settling.has(m.id))
      .map((m) => ({ p, m })),
  );
  for (const { p, m } of due) {
    settling.add(m.id);
    try {
      await release(p.id, m.id, "auto");
    } catch (e) {
      await mutate((s) => {
        const { milestone } = findMilestone(s, p.id, m.id);
        if (milestone?.payment) milestone.payment.releaseError = (e as Error).message;
      });
    } finally {
      settling.delete(m.id);
    }
  }
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

export interface MilestonePatch {
  title?: string;
  amount?: number;
  dueDate?: string;
}

/** Edits an unpaid milestone. Paid or refunded milestones are part of the payment record and stay fixed. */
export async function updateMilestone(projectId: string, milestoneId: string, patch: MilestonePatch) {
  const clean: MilestonePatch = {};
  if (patch.title !== undefined) {
    const t = String(patch.title).trim();
    if (!t || t.length > 120) throw new Error("Titles need 1 to 120 characters.");
    clean.title = t;
  }
  if (patch.amount !== undefined) {
    const a = Math.round(Number(patch.amount) * 100) / 100;
    if (!Number.isFinite(a) || a <= 0 || a > 100000) throw new Error("Amounts must be between 0.01 and 100,000.");
    clean.amount = a;
  }
  if (patch.dueDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate) || Number.isNaN(Date.parse(patch.dueDate))) throw new Error("Use a valid date.");
    clean.dueDate = patch.dueDate;
  }
  return mutate((s) => {
    const { project, milestone } = findMilestone(s, projectId, milestoneId);
    if (!project || !milestone) throw new Error("Milestone not found.");
    if (milestone.status !== "awaiting_payment" && milestone.status !== "draft") {
      throw new Error(`${milestone.title} is ${milestone.status === "paid" ? "paid" : milestone.status}, so it can't be edited.`);
    }
    // A checkout opened at the old price must not be capturable at the new one.
    if (clean.amount !== undefined && clean.amount !== milestone.amount && milestone.payment && !milestone.payment.capturedAt) {
      milestone.payment = null;
    }
    const changes = Object.entries(clean)
      .filter(([k, v]) => (milestone as unknown as Record<string, unknown>)[k] !== v)
      .map(([k, v]) => (k === "amount" ? `price to ${money(v as number, project.currency)}` : k === "dueDate" ? `due date to ${v}` : `title to "${v}"`));
    Object.assign(milestone, clean);
    if (changes.length) log(s, { projectId, milestoneId, kind: "edited", text: `Changed ${milestone.title} ${changes.join(", ")}` });
    return milestone;
  });
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
