import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { FILES_DIR, id } from "./db";
import type { Deliverable } from "./types";
import { isPdf, pdfPageCount, renderPdfPage } from "./pdf";

const IMAGE = /^image\/(png|jpe?g|webp|gif|avif|tiff)$/;

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

  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  let width: number | undefined;
  let height: number | undefined;
  let previewKey: string | null = null;
  let pages: number | undefined;
  // PDFs: count pages and build the sealed tile from page 1.
  let source: Buffer | null = null;
  if (isPdf(file.type, file.name)) {
    try {
      pages = await pdfPageCount(buf);
      source = await renderPdfPage(buf, 1, sha256);
    } catch (e) {
      console.warn("[files] PDF could not be rendered:", (e as Error).message);
    }
  }
  if (source) {
    previewKey = `${fid}-preview.jpg`;
    const { data, info } = await sharp(source).resize({ width: 1100, height: 1100, fit: "inside" }).blur(9).toBuffer({ resolveWithObject: true });
    await sharp(data)
      .composite([{ input: watermarkSvg(info.width, info.height), top: 0, left: 0 }])
      .jpeg({ quality: 62 })
      .toFile(path.join(/*turbopackIgnore: true*/ FILES_DIR, previewKey));
  } else if (IMAGE.test(file.type)) {
    const meta = await sharp(buf).metadata();
    // EXIF-rotated photos report swapped dimensions.
    const turned = (meta.orientation || 1) >= 5;
    width = turned ? meta.height : meta.width;
    height = turned ? meta.width : meta.height;
    previewKey = `${fid}-preview.jpg`;
    // Transparent artwork sits on white, or JPEG would turn its background black.
    const base = sharp(buf, { animated: false }).rotate().resize({ width: 1100, height: 1100, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" });
    const { data, info } = await base.blur(9).toBuffer({ resolveWithObject: true });
    await sharp(data)
      .composite([{ input: watermarkSvg(info.width, info.height), top: 0, left: 0 }])
      .jpeg({ quality: 62 })
      .toFile(path.join(/*turbopackIgnore: true*/ FILES_DIR, previewKey));
  }

  return {
    id: fid,
    name: file.name.slice(0, 160),
    mime: isPdf(file.type, file.name) ? "application/pdf" : file.type || "application/octet-stream",
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
export const isReviewable = (f: Pick<Deliverable, "mime" | "name">) => IMAGE.test(f.mime) || isPdf(f.mime, f.name);

/** The pixels behind a review copy: the image itself, or a rendered PDF page. */
export async function reviewSource(f: Deliverable, page = 1): Promise<Buffer> {
  const buf = readStored(f.originalKey);
  if (isPdf(f.mime, f.name)) return renderPdfPage(buf, page, f.sha256 || f.id);
  return buf;
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
