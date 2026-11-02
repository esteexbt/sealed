import "server-only";
import { read } from "./db";
import type { Project, SocialKind, User } from "./types";

/* ---------------- handles ---------------- */
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;
const RESERVED = new Set(["admin", "api", "login", "new", "profile", "projects", "ledger", "assistant", "sealed", "support", "help", "u", "p"]);

export const handleFrom = (name: string) =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "") || "freelancer";

export function validHandle(h: string) {
  if (!HANDLE_RE.test(h)) return "Use 3 to 30 lowercase letters, numbers or dashes.";
  if (RESERVED.has(h)) return "That name is reserved. Try another.";
  return null;
}

/** A free handle based on `base`, adding -2, -3… if needed. */
export function freeHandle(base: string, users: User[], selfId?: string) {
  const taken = new Set(users.filter((u) => u.id !== selfId && u.handle).map((u) => u.handle!));
  let h = handleFrom(base);
  if (h.length < 3) h = `${h}-studio`;
  if (RESERVED.has(h)) h = `${h}-1`;
  let n = 2;
  const root = h;
  while (taken.has(h)) h = `${root}-${n++}`;
  return h;
}

/* ---------------- socials ---------------- */
export const SOCIALS: { kind: SocialKind; label: string; placeholder: string }[] = [
  { kind: "website", label: "Website", placeholder: "yourportfolio.com" },
  { kind: "email", label: "Email", placeholder: "you@studio.com" },
  { kind: "x", label: "X", placeholder: "@handle" },
  { kind: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/in/you" },
  { kind: "instagram", label: "Instagram", placeholder: "@handle" },
  { kind: "behance", label: "Behance", placeholder: "behance.net/you" },
  { kind: "dribbble", label: "Dribbble", placeholder: "dribbble.com/you" },
  { kind: "github", label: "GitHub", placeholder: "github.com/you" },
];

const HOSTS: Partial<Record<SocialKind, string[]>> = {
  x: ["x.com", "twitter.com"],
  linkedin: ["linkedin.com"],
  instagram: ["instagram.com"],
  behance: ["behance.net"],
  dribbble: ["dribbble.com"],
  github: ["github.com"],
};
const BASE: Partial<Record<SocialKind, string>> = {
  x: "https://x.com/",
  linkedin: "https://www.linkedin.com/in/",
  instagram: "https://www.instagram.com/",
  behance: "https://www.behance.net/",
  dribbble: "https://dribbble.com/",
  github: "https://github.com/",
};

/** Turns "@ada", "ada" or a full URL into a clean https link. Returns null when it can't be a real link. */
export function socialUrl(kind: SocialKind, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (kind === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? `mailto:${v.toLowerCase()}` : null;
  if (kind === "website") {
    try {
      const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      return u.protocol === "https:" || u.protocol === "http:" ? u.toString().replace(/\/$/, "") : null;
    } catch {
      return null;
    }
  }
  const hosts = HOSTS[kind]!;
  if (/^https?:\/\//i.test(v) || hosts.some((h) => v.toLowerCase().includes(h))) {
    try {
      const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      const host = u.hostname.replace(/^www\./, "");
      return hosts.includes(host) ? `https://${u.hostname}${u.pathname}`.replace(/\/$/, "") : null;
    } catch {
      return null;
    }
  }
  const handle = v.replace(/^@/, "").replace(/[^A-Za-z0-9._-]/g, "");
  return handle ? BASE[kind] + handle : null;
}

/** What to show inside the pill, e.g. "@ada" or "adaokafor.com". */
export function socialText(kind: SocialKind, url: string) {
  if (kind === "email") return url.replace(/^mailto:/, "");
  try {
    const u = new URL(url);
    if (kind === "website") return u.hostname.replace(/^www\./, "");
    const last = u.pathname.split("/").filter(Boolean).at(-1) || "";
    return kind === "x" || kind === "instagram" ? `@${last}` : last;
  } catch {
    return url;
  }
}

/* ---------------- credibility ---------------- */
const paidStages = (p: Project) => p.milestones.filter((m) => m.status === "paid" && m.payment?.captureId);
/** A review counts as verified when the project has at least one payment PayPal captured. */
export const reviewVerified = (p: Project) => Boolean(p.review) && paidStages(p).length > 0;

export function profileStats(userId: string) {
  const projects = read().projects.filter((p) => p.ownerId === userId);
  const stages = projects.flatMap(paidStages);
  const completed = projects.filter((p) => p.milestones.length > 0 && p.milestones.every((m) => m.status === "paid" || m.status === "cancelled" || m.status === "refunded") && paidStages(p).length > 0);
  const clients = new Set(projects.filter((p) => paidStages(p).length).map((p) => (p.clientEmail || p.clientName).toLowerCase()));
  // On time: the work was delivered (first file) on or before the stage's due date.
  const timed = stages.filter((m) => m.files.length);
  const onTime = timed.filter((m) => {
    const first = m.files.map((f) => f.uploadedAt).sort()[0];
    return first.slice(0, 10) <= m.dueDate;
  }).length;
  const reviews = projects
    .filter(reviewVerified)
    .map((p) => ({ projectId: p.id, rating: p.review!.rating, comment: p.review!.comment, at: p.review!.updatedAt || p.review!.at, client: p.clientName, project: p.title }))
    .sort((a, b) => b.at.localeCompare(a.at));
  const rating = reviews.length ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length) * 10) / 10 : null;
  return {
    projectsCompleted: completed.length,
    stagesPaid: stages.length,
    clients: clients.size,
    onTime: timed.length ? Math.round((onTime / timed.length) * 100) : null,
    rating,
    reviews,
  };
}

export function publicProfile(u: User) {
  const socials = SOCIALS.flatMap(({ kind, label }) => {
    const raw = u.socials?.[kind];
    const url = raw ? socialUrl(kind, raw) : null;
    return url ? [{ kind, label, url, text: socialText(kind, url) }] : [];
  });
  const v = u.imageVersion || 0;
  return {
    handle: u.handle!,
    name: u.name,
    headline: u.headline || "",
    bio: u.bio || "",
    avatar: u.avatarKey ? `/api/u/${u.handle}/image/avatar?v=${v}` : null,
    banner: u.bannerKey ? `/api/u/${u.handle}/image/banner?v=${v}` : null,
    memberSince: u.createdAt,
    socials,
    stats: profileStats(u.id),
  };
}
export type PublicProfile = ReturnType<typeof publicProfile>;

export const userByHandle = (h: string) => (read().users || []).find((u) => u.handle === h.toLowerCase());
