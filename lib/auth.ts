import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { id, mutate, read } from "./db";
import type { Project, User } from "./types";
import { freeHandle } from "./profile";

export const SESSION_COOKIE = "sealed_session";
const SESSION_DAYS = 30;

/** Signing key for sessions: SESSION_SECRET, or a random one kept next to the data. */
function secret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const g = globalThis as unknown as { __sealedSecret?: string };
  if (g.__sealedSecret) return g.__sealedSecret;
  const dir = process.env.DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
  const file = path.join(dir, ".session-secret");
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  return (g.__sealedSecret = fs.readFileSync(file, "utf8").trim());
}
const sign = (v: string) => crypto.createHmac("sha256", secret()).update(v).digest("base64url");

export function sessionToken(userId: string) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const v = `${userId}.${exp}`;
  return `${v}.${sign(v)}`;
}
function readToken(t: string | undefined): string | null {
  if (!t) return null;
  const [uid, exp, mac] = t.split(".");
  if (!uid || !exp || !mac) return null;
  const want = Buffer.from(sign(`${uid}.${exp}`));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  if (Number(exp) < Date.now()) return null;
  return uid;
}
export const sessionCookie = (userId: string) => ({
  name: SESSION_COOKIE,
  value: sessionToken(userId),
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production" && (process.env.APP_URL || "").startsWith("https"),
  path: "/",
  maxAge: SESSION_DAYS * 86400,
});

/* ---------------- passwords ---------------- */
export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}
export function checkPassword(pw: string, stored: string | null | undefined) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  const a = crypto.scryptSync(pw, salt, 64);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------- users ---------------- */
export const normEmail = (e: string) => e.trim().toLowerCase();
export const users = () => read().users || [];
export const findUserByEmail = (email: string) => users().find((u) => u.email === normEmail(email));
export const getUser = (uid: string) => users().find((u) => u.id === uid);

/** Public view of a user: never send the password hash anywhere. */
export const publicUser = (u: User) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  paypalEmail: u.paypalEmail || null,
  google: Boolean(u.googleId),
  paypal: Boolean(u.paypalId),
  hasPassword: Boolean(u.passwordHash),
  demo: Boolean(u.demo),
  handle: u.handle || "",
  headline: u.headline || "",
  bio: u.bio || "",
  socials: u.socials || {},
  avatar: u.avatarKey && u.handle ? `/api/u/${u.handle}/image/avatar?v=${u.imageVersion || 0}` : null,
  banner: u.bannerKey && u.handle ? `/api/u/${u.handle}/image/banner?v=${u.imageVersion || 0}` : null,
});

/**
 * Creates an account. The very first account on a fresh install takes over any projects
 * made before accounts existed, so nobody loses work in the upgrade.
 */
export async function createUser(input: { email: string; name: string; password?: string; googleId?: string; paypalId?: string; paypalEmail?: string; demo?: boolean }) {
  return mutate((s) => {
    s.users = s.users || [];
    const email = normEmail(input.email);
    if (s.users.some((u) => u.email === email)) throw new Error("There’s already an account with that email. Sign in instead.");
    const u: User = {
      id: id(),
      email,
      name: input.name.trim().slice(0, 80) || email.split("@")[0],
      passwordHash: input.password ? hashPassword(input.password) : null,
      googleId: input.googleId || null,
      paypalId: input.paypalId || null,
      paypalEmail: input.paypalEmail || null,
      demo: input.demo || false,
      createdAt: new Date().toISOString(),
    };
    u.handle = freeHandle(u.name, s.users);
    const firstReal = !u.demo && !s.users.some((x) => !x.demo);
    s.users.push(u);
    if (firstReal) for (const p of s.projects) if (!p.ownerId) p.ownerId = u.id;
    return u;
  });
}

/** Finds the account for a Google or PayPal sign-in, linking it to an existing email account, or creates one. */
export async function upsertOAuthUser(kind: "google" | "paypal", sub: string, email: string, name: string) {
  const key = kind === "google" ? "googleId" : "paypalId";
  const all = users();
  const linked = all.find((u) => u[key] === sub);
  if (linked) return linked;
  const byEmail = all.find((u) => u.email === normEmail(email));
  if (byEmail) {
    return mutate((s) => {
      const u = s.users!.find((x) => x.id === byEmail.id)!;
      u[key] = sub;
      if (kind === "paypal" && !u.paypalEmail) u.paypalEmail = normEmail(email);
      return u;
    });
  }
  return createUser({ email, name, [key]: sub, ...(kind === "paypal" ? { paypalEmail: normEmail(email) } : {}) });
}

/* ---------------- the signed-in freelancer ---------------- */
export async function currentUser(): Promise<User | null> {
  const uid = readToken((await cookies()).get(SESSION_COOKIE)?.value);
  return (uid && getUser(uid)) || null;
}

const unauthorized = () => new Response(JSON.stringify({ error: "Sign in first." }), { status: 401, headers: { "Content-Type": "application/json" } });
const notFound = () => new Response(JSON.stringify({ error: "Not found." }), { status: 404, headers: { "Content-Type": "application/json" } });

/** For API routes: the user, or a 401 response. */
export async function requireUser(): Promise<{ user: User; denied: null } | { user: null; denied: Response }> {
  const user = await currentUser();
  return user ? { user, denied: null } : { user: null, denied: unauthorized() };
}

/** For project API routes: the user must own the project. */
export async function requireProject(projectId: string): Promise<{ user: User; project: Project; denied: null } | { user: null; project: null; denied: Response }> {
  const user = await currentUser();
  if (!user) return { user: null, project: null, denied: unauthorized() };
  const project = read().projects.find((p) => p.id === projectId && p.ownerId === user.id);
  return project ? { user, project, denied: null } : { user: null, project: null, denied: notFound() };
}

/** The freelancer's display name for a project, as clients see it. */
export function ownerName(p: Pick<Project, "ownerId">): string {
  return (p.ownerId && getUser(p.ownerId)?.name) || process.env.FREELANCER_NAME || "Your freelancer";
}
export function ownerOf(p: Pick<Project, "ownerId">): User | undefined {
  return p.ownerId ? getUser(p.ownerId) : undefined;
}

/** For freelancer pages: the signed-in user, or off to the sign-in page. */
export async function pageUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

/** Links a Google or PayPal sign-in to the account that's already signed in. */
export async function linkOAuth(userId: string, kind: "google" | "paypal", sub: string, email: string) {
  const key = kind === "google" ? "googleId" : "paypalId";
  const other = users().find((u) => u[key] === sub && u.id !== userId);
  if (other) throw new Error(`That ${kind === "google" ? "Google" : "PayPal"} account is already linked to another Sealed account.`);
  return mutate((s) => {
    const u = s.users!.find((x) => x.id === userId)!;
    u[key] = sub;
    if (kind === "paypal" && !u.paypalEmail) u.paypalEmail = normEmail(email);
    return u;
  });
}

/** Gives older accounts (made before public profiles) a handle. Returns the user as stored. */
export async function ensureHandle(u: User): Promise<User> {
  if (u.handle) return u;
  return mutate((s) => {
    const x = s.users!.find((y) => y.id === u.id)!;
    if (!x.handle) x.handle = freeHandle(x.name, s.users!);
    return x;
  });
}
