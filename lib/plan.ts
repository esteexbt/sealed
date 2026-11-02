import "server-only";
import { findMilestone, id, log, mutate } from "./db";
import type { Milestone, Project, StageTerms, Store } from "./types";

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

/** Stages whose terms can still change: nothing paid, held or in review yet. */
export const OPEN = new Set(["draft", "awaiting_payment"]);
export const isOpenStage = (m: Milestone) => OPEN.has(m.status) && !m.payment?.authorizationId;

export const isAgreed = (p: Project) => !p.agreement || p.agreement.status === "agreed";

export const termsOf = (m: Milestone): StageTerms => ({ title: m.title, deliverables: [...m.deliverables], amount: m.amount, dueDate: m.dueDate });
const snapshot = (p: Project) => Object.fromEntries(p.milestones.filter((m) => m.status !== "cancelled").map((m) => [m.id, termsOf(m)]));
const same = (a: StageTerms, b: StageTerms) =>
  a.title === b.title && a.amount === b.amount && a.dueDate === b.dueDate && a.deliverables.join("\u0000") === b.deliverables.join("\u0000");

/**
 * Call inside a mutate BEFORE changing terms. Projects from before agreements existed
 * get their current terms recorded as agreed, so the client can see what changes.
 */
export function ensureBaseline(p: Project) {
  if (!p.agreement) p.agreement = { status: "agreed", version: 1, sentAt: p.createdAt, agreedAt: null, agreed: snapshot(p), request: null };
}

/** Call inside a mutate AFTER terms changed: the plan goes back to the client to approve. */
export function markPlanChanged(s: Store, p: Project, what: string) {
  ensureBaseline(p);
  const a = p.agreement!;
  const now = new Date().toISOString();
  p.agreement = a.status === "agreed" ? { ...a, status: "pending", version: a.version + 1, sentAt: now } : { ...a, status: "pending", sentAt: now };
  log(s, { projectId: p.id, kind: "plan_sent", text: `${what}. ${p.clientName} needs to approve the updated plan before paying.` });
}

/** One stage in the plan editor. `id` is missing for a new stage. */
export interface PlanStageInput {
  id?: string;
  title: string;
  deliverables: string[];
  amount: number;
  dueDate: string;
}

function clean(x: PlanStageInput): StageTerms {
  const title = String(x.title || "").trim();
  if (!title || title.length > 120) throw new Error("Each stage needs a name (up to 120 characters).");
  const amount = Math.round(Number(x.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) throw new Error(`Set a price for ${title} between 0.01 and 100,000.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.dueDate || "") || Number.isNaN(Date.parse(x.dueDate))) throw new Error(`Pick a due date for ${title}.`);
  const deliverables = (Array.isArray(x.deliverables) ? x.deliverables : [])
    .map((d) => String(d).trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((d) => d.slice(0, 120));
  if (!deliverables.length) throw new Error(`List at least one deliverable for ${title}.`);
  return { title, amount, dueDate: x.dueDate, deliverables };
}

/**
 * Saves the freelancer's edited plan. Stages already paid for, held or in review are fixed
 * and must be left as they are; open stages can be changed, added or removed.
 */
export async function savePlan(projectId: string, stages: PlanStageInput[]) {
  if (!Array.isArray(stages) || stages.length > 30) throw new Error("A plan can have up to 30 stages.");
  const cleaned = stages.map((x) => ({ id: x.id, terms: clean(x) }));
  return mutate((s) => {
    const p = s.projects.find((x) => x.id === projectId);
    if (!p) throw new Error("Project not found.");
    ensureBaseline(p);
    const byId = new Map(p.milestones.map((m) => [m.id, m]));
    const keep = new Set(cleaned.map((c) => c.id).filter(Boolean) as string[]);
    for (const m of p.milestones) {
      if (!isOpenStage(m) && m.status !== "cancelled" && !keep.has(m.id)) throw new Error(`${m.title} is already under way, so it stays in the plan.`);
    }
    const changes: string[] = [];
    const next: Milestone[] = [];
    // Stages that are under way keep their place; open ones follow the editor's order.
    for (const c of cleaned) {
      const m = c.id ? byId.get(c.id) : undefined;
      if (c.id && !m) throw new Error("A stage in this plan no longer exists. Refresh and try again.");
      if (m) {
        if (!isOpenStage(m)) {
          if (!same(termsOf(m), c.terms)) throw new Error(`${m.title} is already under way, so its terms can't change.`);
          next.push(m);
          continue;
        }
        if (!same(termsOf(m), c.terms)) {
          if (m.amount !== c.terms.amount) changes.push(`${c.terms.title} to ${money(c.terms.amount, p.currency)}`);
          else changes.push(`${c.terms.title}`);
          // A checkout opened at the old price must not go through at the new one.
          if (m.amount !== c.terms.amount && m.payment && !m.payment.capturedAt) m.payment = null;
          Object.assign(m, c.terms);
        }
        next.push(m);
      } else {
        next.push({ id: id(), description: "", status: "awaiting_payment", files: [], payment: null, reminders: [], ...c.terms });
        changes.push(`added ${c.terms.title}`);
      }
    }
    const removed = p.milestones.filter((m) => !keep.has(m.id) && m.status !== "cancelled");
    for (const m of removed) {
      if (m.files.some((f) => !f.removedAt)) throw new Error(`${m.title} has files delivered. Remove them first, or keep the stage.`);
      changes.push(`removed ${m.title}`);
    }
    // Cancelled stages stay on record at the end.
    p.milestones = [...next, ...p.milestones.filter((m) => m.status === "cancelled" && !keep.has(m.id))];
    if (!p.milestones.length) throw new Error("Keep at least one stage.");
    if (changes.length) markPlanChanged(s, p, `Updated the plan: ${changes.join(", ")}`);
    return { changed: changes.length > 0, agreement: p.agreement };
  });
}

/** Client approves the plan as it stands now. */
export async function agreePlan(portalToken: string) {
  return mutate((s) => {
    const p = s.projects.find((x) => x.portalToken === portalToken);
    if (!p) throw new Error("Not found");
    if (isAgreed(p)) return p.agreement;
    const now = new Date().toISOString();
    p.agreement = { ...p.agreement!, status: "agreed", agreedAt: now, agreed: snapshot(p), request: null, asked: null };
    log(s, { projectId: p.id, kind: "plan_agreed", text: `${p.clientName} approved the plan: ${p.milestones.filter((m) => m.status !== "cancelled").length} stages, ${money(p.milestones.filter((m) => m.status !== "cancelled").reduce((a, m) => a + m.amount, 0), p.currency)}` });
    return p.agreement;
  });
}

/** Client asks for changes to the plan before approving it. */
export async function requestPlanChanges(portalToken: string, note: string) {
  const text = note.trim();
  if (text.length < 5) throw new Error("Say what you'd like changed.");
  return mutate((s) => {
    const p = s.projects.find((x) => x.portalToken === portalToken);
    if (!p) throw new Error("Not found");
    if (isAgreed(p)) throw new Error("This plan is already approved.");
    p.agreement = { ...p.agreement!, status: "changes", request: { at: new Date().toISOString(), note: text.slice(0, 1500) }, asked: snapshot(p) };
    log(s, { projectId: p.id, kind: "plan_changes", text: `${p.clientName} asked for changes to the plan: “${text.slice(0, 140)}${text.length > 140 ? "…" : ""}”` });
    return p.agreement;
  });
}

/** What changed since the client last agreed, per stage, for the portal. */
export function planDiff(p: Project) {
  // Compare with what the client last saw: the terms they asked to change, or else the ones they agreed.
  const agreed = p.agreement?.asked || p.agreement?.agreed || null;
  const live = p.milestones.filter((m) => m.status !== "cancelled");
  const stages = live.map((m) => {
    const was = agreed?.[m.id];
    return {
      id: m.id,
      isNew: Boolean(agreed) && !was,
      was: was && !same(was, termsOf(m)) ? was : null,
    };
  });
  const removed = agreed ? Object.entries(agreed).filter(([k]) => !live.some((m) => m.id === k)).map(([, t]) => t) : [];
  return { stages, removed };
}

export { findMilestone };
