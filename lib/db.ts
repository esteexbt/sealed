import "server-only";
import fs from "node:fs";
import path from "node:path";
import { customAlphabet } from "nanoid";
import type { ActivityEvent, Milestone, Project, Store } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
export const FILES_DIR = path.join(DATA_DIR, "files");

export const id = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 10);
export const token = customAlphabet(
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789",
  24,
);

function ensure() {
  fs.mkdirSync(FILES_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ projects: [], activity: [] }, null, 2));
  }
}

export function read(): Store {
  ensure();
  return JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) as Store;
}

function write(store: Store) {
  const tmp = STORE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_FILE);
}

/** Serialised read-modify-write so concurrent requests can't clobber each other. */
let chain: Promise<unknown> = Promise.resolve();
export function mutate<T>(fn: (s: Store) => T): Promise<T> {
  const next = chain.then(() => {
    const s = read();
    const out = fn(s);
    write(s);
    return out;
  });
  chain = next.catch(() => undefined);
  return next;
}

/** A freelancer's projects, newest first. */
export function listProjects(ownerId: string): Project[] {
  return read().projects.filter((p) => p.ownerId === ownerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const slugify = (t: string) =>
  t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’'"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "") || "project";

/** Readable URL name for a project, from its title. Later projects with the same title get -2, -3… */
export function projectSlug(p: Project, all: Project[] = read().projects): string {
  const base = slugify(p.title);
  const same = all.filter((x) => x.ownerId === p.ownerId && slugify(x.title) === base);
  const n = same.findIndex((x) => x.id === p.id);
  return n > 0 ? `${base}-${n + 1}` : base;
}

/** Finds one of a freelancer's projects by its readable name or its id. */
export function getProject(idOrSlug: string, ownerId: string): Project | undefined {
  const all = read().projects;
  const mine = all.filter((p) => p.ownerId === ownerId);
  return mine.find((p) => p.id === idOrSlug) || mine.find((p) => projectSlug(p, all) === decodeURIComponent(idOrSlug).toLowerCase());
}

export function getProjectByToken(t: string): Project | undefined {
  return read().projects.find((p) => p.portalToken === t);
}

export function findMilestone(s: Store, projectId: string, milestoneId: string) {
  const project = s.projects.find((p) => p.id === projectId);
  const milestone = project?.milestones.find((m) => m.id === milestoneId);
  return { project, milestone };
}

export function findByOrder(s: Store, orderId: string): { project?: Project; milestone?: Milestone } {
  for (const project of s.projects) {
    for (const milestone of project.milestones) {
      if (milestone.payment?.orderId === orderId) return { project, milestone };
    }
  }
  return {};
}

export function log(s: Store, e: Omit<ActivityEvent, "id" | "at">) {
  s.activity.unshift({ id: id(), at: new Date().toISOString(), ...e });
  s.activity = s.activity.slice(0, 500);
}

export function isOverdue(m: Milestone, today = new Date()) {
  if (m.status !== "awaiting_payment") return false;
  return m.dueDate < today.toISOString().slice(0, 10);
}

/** Files the client is currently being shown (withdrawn files stay on record but out of view). */
export function currentFiles(m: Milestone) {
  return m.files.filter((f) => !f.removedAt);
}

/** Money sitting in a PayPal hold while the client reviews. */
export function held(p: Project) {
  return p.milestones
    .filter((m) => m.status === "in_review" || m.status === "changes_requested")
    .reduce((sum, m) => sum + m.amount, 0);
}

export function outstanding(p: Project) {
  return p.milestones
    .filter((m) => m.status === "awaiting_payment")
    .reduce((sum, m) => sum + m.amount, 0);
}
