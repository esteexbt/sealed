import "server-only";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { FILES_DIR, id } from "./db";
import type { Deliverable } from "./types";

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

  let previewKey: string | null = null;
  if (IMAGE.test(file.type)) {
    previewKey = `${fid}-preview.jpg`;
    const base = sharp(buf, { animated: false }).rotate().resize({ width: 1100, height: 1100, fit: "inside", withoutEnlargement: true });
    const { data, info } = await base.blur(9).toBuffer({ resolveWithObject: true });
    await sharp(data)
      .composite([{ input: watermarkSvg(info.width, info.height), top: 0, left: 0 }])
      .jpeg({ quality: 62 })
      .toFile(path.join(/*turbopackIgnore: true*/ FILES_DIR, previewKey));
  }

  return {
    id: fid,
    name: file.name.slice(0, 160),
    mime: file.type || "application/octet-stream",
    size: buf.length,
    originalKey,
    previewKey,
    uploadedAt: new Date().toISOString(),
  };
}

export function readStored(key: string) {
  const p = path.join(/*turbopackIgnore: true*/ FILES_DIR, path.basename(key));
  return fs.readFileSync(p);
}

