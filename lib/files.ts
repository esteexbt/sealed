import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { FILES_DIR, id, savedFile } from "./db";
import type { Deliverable } from "./types";
import { isPdf, pdfPageCount, renderPdfPage } from "./pdf";

const IMAGE = /^image\/(png|jpe?g|webp|gif|avif|tiff)$/;
export const isSvg = (mime: string, name = "") => mime === "image/svg+xml" || /\.svg$/i.test(name);
const SVG_EDGE = 2400;

/**
 * Makes SVG safe to rasterise: no scripts, no event handlers, and no external
 * references (only same-document #ids and embedded data: URIs survive).
 */
export function sanitizeSvg(src: string) {
  return src
    // DOCTYPE including any internal subset ([...]) where entities would live.
    .replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/gi, "")
    .replace(/<!ENTITY[\s\S]*?>/gi, "")
    // Undeclared entity references would now break parsing; drop them.
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)[\w.-]+;/gi, "")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/\s(?:xlink:)?href\s*=\s*("(?!#|data:)[^"]*"|'(?!#|data:)[^']*')/gi, "")
    .replace(/url\(\s*(['"]?)(?!#|data:)[^)]*\)/gi, "none");
}

/** Raster version of an SVG at a review-worthy size. */
async function rasterizeSvg(buf: Buffer): Promise<Buffer> {
  const clean = Buffer.from(sanitizeSvg(buf.toString("utf8")));
  const meta = await sharp(clean).metadata();
  const edge = Math.max(meta.width || 1, meta.height || 1);
  const density = Math.min(1200, Math.max(72, Math.round((72 * SVG_EDGE) / edge)));
  return sharp(clean, { density }).resize({ width: SVG_EDGE, height: SVG_EDGE, fit: "inside", withoutEnlargement: false }).png().toBuffer();
}

const g = globalThis as unknown as { __sealedSvgCache?: Map<string, Buffer> };
const svgCache = (g.__sealedSvgCache ??= new Map());

/** The pixels a file is reviewed as, or null if it has none (zip, fig…). */
async function rasterOf(buf: Buffer, mime: string, name: string, key: string, page = 1): Promise<Buffer | null> {
  if (isPdf(mime, name)) return renderPdfPage(buf, page, key);
  if (isSvg(mime, name)) {
    const hit = svgCache.get(key);
    if (hit) return hit;
    const png = await rasterizeSvg(buf);
    svgCache.set(key, png);
    if (svgCache.size > 30) svgCache.delete(svgCache.keys().next().value!);
    return png;
  }
  return IMAGE.test(mime) ? buf : null;
}

/** Writes the blurred, stamped tile the client sees before paying. */
async function writeSealedPreview(raster: Buffer, previewKey: string) {
  const { data, info } = await sharp(raster, { animated: false })
    .rotate()
    .resize({ width: 1100, height: 1100, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .blur(9)
    .toBuffer({ resolveWithObject: true });
  await sharp(data)
    .composite([{ input: watermarkSvg(info.width, info.height), top: 0, left: 0 }])
    .jpeg({ quality: 62 })
    .toFile(path.join(/*turbopackIgnore: true*/ FILES_DIR, previewKey));
  savedFile(previewKey);
}

/** Tiled diagonal watermark, sized to the preview. */
function watermarkSvg(w: number, h: number) {
  const step = 380;
  const lines: string[] = [];
  for (let y = -h; y < h * 2; y += step / 2) {
    for (let x = -w; x < w * 2; x += step * 1.6) {
      lines.push(
        `<text x="${x}" y="${y}" transform="rotate(-28 ${x} ${y})">Sealed until paid</text>`,
      );
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <style>text{font:700 46px sans-serif;fill:#ffffff;fill-opacity:.7;stroke:#1A2238;stroke-opacity:.45;stroke-width:1.5}</style>
  ${lines.join("")}
</svg>`);
}

export async function storeDeliverable(file: File): Promise<Deliverable> {
  fs.mkdirSync(FILES_DIR, { recursive: true });
  const fid = id();
  const ext = path.extname(file.name).slice(0, 10) || "";
  const originalKey = `${fid}-orig${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ FILES_DIR, originalKey), buf);
  savedFile(originalKey);

  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  let width: number | undefined;
  let height: number | undefined;
  let previewKey: string | null = null;
  let pages: number | undefined;
  const mime = isPdf(file.type, file.name) ? "application/pdf" : isSvg(file.type, file.name) ? "image/svg+xml" : file.type || "application/octet-stream";
  try {
    if (mime === "application/pdf") pages = await pdfPageCount(buf);
    if (IMAGE.test(mime) || mime === "image/svg+xml") {
      const meta = await sharp(mime === "image/svg+xml" ? Buffer.from(sanitizeSvg(buf.toString("utf8"))) : buf).metadata();
      // EXIF-rotated photos report swapped dimensions.
      const turned = (meta.orientation || 1) >= 5;
      width = turned ? meta.height : meta.width;
      height = turned ? meta.width : meta.height;
    }
    const raster = await rasterOf(buf, mime, file.name, sha256);
    if (raster) {
      previewKey = `${fid}-preview.jpg`;
      await writeSealedPreview(raster, previewKey);
    }
  } catch (e) {
    console.warn("[files] no preview for", file.name, (e as Error).message);
    previewKey = null;
  }

  return {
    id: fid,
    name: file.name.slice(0, 160),
    mime,
    size: buf.length,
    originalKey,
    previewKey,
    uploadedAt: new Date().toISOString(),
    sha256,
    width,
    height,
    pages,
    removedAt: null,
  };
}

export function readStored(key: string) {
  const p = path.join(/*turbopackIgnore: true*/ FILES_DIR, path.basename(key));
  return fs.readFileSync(p);
}


export const isImage = (mime: string) => IMAGE.test(mime);
export { isPdf };

/** Files the client can open in the protected viewer. */
export const isReviewable = (f: Pick<Deliverable, "mime" | "name">) => IMAGE.test(f.mime) || isPdf(f.mime, f.name) || isSvg(f.mime, f.name);

/** The pixels behind a review copy: the image itself, or a rendered PDF page. */
export async function reviewSource(f: Deliverable, page = 1): Promise<Buffer> {
  const buf = readStored(f.originalKey);
  const raster = await rasterOf(buf, f.mime, f.name, f.sha256 || f.id, page);
  if (!raster) throw new Error("This file type has no review copy");
  return raster;
}

/** Builds a sealed preview for a file stored before its type had one. Returns the new key, or null. */
export async function backfillPreview(f: Deliverable): Promise<string | null> {
  if (f.previewKey || !isReviewable(f)) return f.previewKey;
  try {
    const raster = await reviewSource(f, 1);
    const key = `${f.id}-preview.jpg`;
    await writeSealedPreview(raster, key);
    return key;
  } catch {
    return null;
  }
}

/** Backfills fingerprint and size for files stored before fingerprints existed. */
export async function fileMeta(f: Deliverable): Promise<Pick<Deliverable, "sha256" | "width" | "height">> {
  if (f.sha256 && (f.width || !IMAGE.test(f.mime))) return { sha256: f.sha256, width: f.width, height: f.height };
  const buf = readStored(f.originalKey);
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  if (!IMAGE.test(f.mime)) return { sha256 };
  const meta = await sharp(buf).metadata();
  const turned = (meta.orientation || 1) >= 5;
  return { sha256, width: turned ? meta.height : meta.width, height: turned ? meta.width : meta.height };
}

/** Gives every reviewable file in a project a sealed preview. Cheap when nothing is missing. */
export async function ensurePreviews(projectId: string) {
  const { read, mutate, findMilestone } = await import("./db");
  const project = read().projects.find((p) => p.id === projectId);
  if (!project) return;
  const todo = project.milestones.flatMap((m) => m.files.filter((f) => !f.removedAt && !f.previewKey && isReviewable(f)).map((f) => ({ m, f })));
  for (const { m, f } of todo) {
    const key = await backfillPreview(f);
    if (!key) continue;
    await mutate((st) => {
      const { milestone } = findMilestone(st, projectId, m.id);
      const x = milestone?.files.find((y) => y.id === f.id);
      if (x && !x.previewKey) x.previewKey = key;
    });
  }
}
