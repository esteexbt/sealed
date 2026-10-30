import "server-only";
import crypto from "node:crypto";
import sharp from "sharp";
import { currentFiles, findMilestone, id, log, mutate, read } from "./db";
import { isPdf, isReviewable, reviewSource } from "./files";

/**
 * Protected review copies.
 *
 * What this guarantees: the original file never leaves the server before the
 * client approves. Only a reduced review copy is sent, carrying the viewer's
 * name, email, time and a session code across the whole image.
 *
 * What it makes hard (not impossible): saving even that copy. The copy is
 * sent once, as shuffled 32px blocks XOR-ed with a per-session key, from a
 * URL that only answers the page's own script, then reassembled on a canvas.
 * Anything on a screen can still be photographed; the watermark makes such a
 * capture traceable and the reduced resolution makes it a poor substitute.
 */

const B = 32; // block size; a multiple of 16 keeps JPEG blocks from bleeding across the shuffle
const REVIEW_EDGE = 1600; // longest side of the review copy
const LOUPE = 300; // loupe crop size at native resolution
const LOUPES_PER_SESSION = 40;
const SESSION_MS = 10 * 60 * 1000;

interface Session {
  sid: string;
  key: Buffer;
  projectId: string;
  milestoneId: string;
  fileId: string;
  label: string;
  payload: Buffer | null;
  exp: number;
  origW: number;
  origH: number;
  loupesLeft: number;
  viewId: string;
  page: number;
}

const g = globalThis as unknown as { __sealedViews?: Map<string, Session> };
const sessions = (g.__sealedViews ??= new Map());

function sweep() {
  const now = Date.now();
  for (const [k, s] of sessions) if (s.exp < now) sessions.delete(k);
}

export class ViewError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const esc = (t: string) => t.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Diagonal forensic watermark: who viewed it, when, and which session. */
function forensicSvg(w: number, h: number, label: string, scale = 1) {
  const fs = Math.max(14, Math.round((Math.max(w, h) / 46) * scale));
  // Approximate rendered width so repeats never overlap.
  const textW = label.length * fs * 0.56;
  const stepX = textW + fs * 4;
  const stepY = fs * 3.6;
  const rows: string[] = [];
  let i = 0;
  for (let y = -h; y < h * 2; y += stepY, i++) {
    const offset = (i % 2) * (stepX / 2);
    for (let x = -w * 1.5 + offset; x < w * 2; x += stepX) {
      rows.push(`<text x="${x.toFixed(0)}" y="${y.toFixed(0)}">${esc(label)}</text>`);
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <g transform="rotate(-24 ${w / 2} ${h / 2})">
    <style>text{font:600 ${fs}px sans-serif;fill:#fff;fill-opacity:.42;stroke:#111827;stroke-opacity:.30;stroke-width:${Math.max(1, fs / 18)}px;paint-order:stroke}</style>
    ${rows.join("")}
  </g>
</svg>`);
}

function xor(buf: Buffer, key: Buffer) {
  const out = Buffer.allocUnsafe(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ key[i % key.length];
  return out;
}

function shuffle(n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function openView(portalToken: string, fileId: string, pageArg = 1) {
  sweep();
  const s = read();
  const project = s.projects.find((p) => p.portalToken === portalToken);
  if (!project) throw new ViewError("Not found", 404);
  const milestone = project.milestones.find((m) => currentFiles(m).some((f) => f.id === fileId));
  const file = milestone && currentFiles(milestone).find((f) => f.id === fileId);
  if (!milestone || !file) throw new ViewError("Not found", 404);
  if (milestone.status !== "in_review" && milestone.status !== "changes_requested") {
    throw new ViewError(
      milestone.status === "awaiting_payment"
        ? "The full review opens once payment is held by PayPal."
        : "This preview is closed.",
      403,
    );
  }
  if (!isReviewable(file)) throw new ViewError("This file type has no review copy. It opens after you approve.", 415);
  const pdf = isPdf(file.mime, file.name);
  const pages = pdf ? Math.max(1, file.pages || 1) : 1;
  const page = Math.min(pages, Math.max(1, Math.floor(Number(pageArg) || 1)));

  const sid = crypto.randomBytes(12).toString("base64url");
  const code = sid.slice(0, 6).toUpperCase();
  const stamp = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
  const label = `Review copy${pdf ? ` p.${page}` : ""} · ${project.clientName}${project.clientEmail ? ` · ${project.clientEmail}` : ""} · ${stamp} · ${code}`;

  let original: Buffer;
  try {
    original = await reviewSource(file, page);
  } catch {
    throw new ViewError("This page couldn't be rendered for review.", 422);
  }
  const meta = await sharp(original).rotate().toBuffer({ resolveWithObject: true });
  const origW = meta.info.width;
  const origH = meta.info.height;

  const base = await sharp(meta.data)
    .resize({ width: REVIEW_EDGE, height: REVIEW_EDGE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .toBuffer({ resolveWithObject: true });
  const w = base.info.width;
  const h = base.info.height;
  const W = Math.ceil(w / B) * B;
  const H = Math.ceil(h / B) * B;

  const marked = await sharp(base.data)
    .composite([{ input: forensicSvg(w, h, label) }])
    .extend({ right: W - w, bottom: H - h, background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer();

  const cols = W / B;
  const rows = H / B;
  const perm = shuffle(cols * rows); // output block k holds source block perm[k]
  const scrambled = Buffer.alloc(W * H * 3);
  const row = B * 3;
  for (let k = 0; k < perm.length; k++) {
    const src = perm[k];
    const sx = (src % cols) * B;
    const sy = Math.floor(src / cols) * B;
    const ox = (k % cols) * B;
    const oy = Math.floor(k / cols) * B;
    for (let y = 0; y < B; y++) {
      const from = ((sy + y) * W + sx) * 3;
      const to = ((oy + y) * W + ox) * 3;
      marked.copy(scrambled, to, from, from + row);
    }
  }
  const jpeg = await sharp(scrambled, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 86, chromaSubsampling: "4:2:0" }).toBuffer();
  const key = crypto.randomBytes(32);

  const viewId = id();
  sessions.set(sid, {
    sid,
    key,
    projectId: project.id,
    milestoneId: milestone.id,
    fileId,
    label,
    payload: xor(jpeg, key),
    exp: Date.now() + SESSION_MS,
    origW,
    origH,
    loupesLeft: LOUPES_PER_SESSION,
    viewId,
    page,
  });

  await mutate((st) => {
    const { milestone: m } = findMilestone(st, project.id, milestone.id);
    if (!m) return;
    const fileName = pdf ? `${file.name}, page ${page}` : file.name;
    m.views = [...(m.views || []), { id: viewId, at: new Date().toISOString(), fileId, fileName, inspections: 0 }].slice(-200);
    log(st, { projectId: project.id, milestoneId: m.id, kind: "viewed", text: `${project.clientName} opened the review copy of ${fileName}` });
  });

  return {
    sid,
    w,
    h,
    W,
    H,
    B,
    cols,
    rows,
    perm,
    key: key.toString("base64"),
    expiresAt: Date.now() + SESSION_MS,
    code,
    original: { width: origW, height: origH },
    page,
    pages,
    kind: pdf ? ("pdf" as const) : ("image" as const),
    loupe: { left: LOUPES_PER_SESSION, size: LOUPE, sharper: origW > w || origH > h },
  };
}

function checkRequest(sess: Session | undefined, req: Request) {
  if (!sess || sess.exp < Date.now()) throw new ViewError("This preview has closed. Open it again.", 410);
  // Only the page's own script sends this header; download managers and
  // extensions that replay the URL do not.
  if (req.headers.get("x-sealed-view") !== sess.sid) throw new ViewError("Not found", 404);
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") throw new ViewError("Not found", 404);
}

/** The scrambled review copy. Served exactly once per session. */
export function takeMosaic(sid: string, req: Request) {
  const sess = sessions.get(sid);
  checkRequest(sess, req);
  if (!sess!.payload) throw new ViewError("This preview was already loaded. Open it again.", 410);
  const out = sess!.payload;
  sess!.payload = null;
  return out;
}

/** A small crop at native resolution so the client can judge sharpness. */
export async function loupe(sid: string, req: Request, nx: number, ny: number) {
  const sess = sessions.get(sid);
  checkRequest(sess, req);
  const s = sess!;
  if (s.loupesLeft <= 0) throw new ViewError("No close-up inspections left in this session. Reopen the preview for more.", 429);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) throw new ViewError("Bad position");

  const { project, milestone } = findMilestone(read(), s.projectId, s.milestoneId);
  const file = milestone && currentFiles(milestone).find((f) => f.id === s.fileId);
  if (!project || !milestone || !file || (milestone.status !== "in_review" && milestone.status !== "changes_requested")) {
    throw new ViewError("This preview is closed.", 403);
  }
  const size = Math.min(LOUPE, s.origW, s.origH);
  const left = Math.max(0, Math.min(s.origW - size, Math.round(nx * s.origW - size / 2)));
  const top = Math.max(0, Math.min(s.origH - size, Math.round(ny * s.origH - size / 2)));
  const crop = await sharp(await reviewSource(file, s.page))
    .rotate()
    .extract({ left, top, width: size, height: size })
    .flatten({ background: "#ffffff" })
    .toBuffer();
  const jpeg = await sharp(crop)
    .composite([{ input: forensicSvg(size, size, s.label, 2.2) }])
    .jpeg({ quality: 88 })
    .toBuffer();
  s.loupesLeft -= 1;

  await mutate((st) => {
    const { milestone: m } = findMilestone(st, s.projectId, s.milestoneId);
    const v = m?.views?.find((x) => x.id === s.viewId);
    if (v) v.inspections += 1;
  });
  return { bytes: xor(jpeg, s.key), left: s.loupesLeft };
}
