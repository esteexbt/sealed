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

export function listProjects(): Project[] {
  return read().projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getProject(projectId: string): Project | undefined {
  return read().projects.find((p) => p.id === projectId);
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

export function outstanding(p: Project) {
  return p.milestones
    .filter((m) => m.status === "awaiting_payment")
    .reduce((sum, m) => sum + m.amount, 0);
}
