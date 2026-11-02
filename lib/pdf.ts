import "server-only";

/**
 * Server-side PDF rendering, so PDFs get the same protected review as images:
 * the PDF itself never reaches the client before approval, only rendered,
 * watermarked page images do.
 */

export const isPdf = (mime: string, name = "") => mime === "application/pdf" || /\.pdf$/i.test(name);

/** Longest side of a rendered page: the "original" resolution the loupe reads from. */
const RENDER_EDGE = 2400;
const MAX_PAGES = 30;

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let lib: Promise<PdfJs> | null = null;
const pdfjs = () => (lib ??= import("pdfjs-dist/legacy/build/pdf.mjs"));

async function open(buf: Buffer) {
  const { getDocument } = await pdfjs();
  return getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
}

export async function pdfPageCount(buf: Buffer) {
  const doc = await open(buf);
  try {
    return doc.numPages;
  } finally {
    await doc.destroy();
  }
}

const g = globalThis as unknown as { __sealedPdfCache?: Map<string, Buffer> };
const cache = (g.__sealedPdfCache ??= new Map());

/** Renders one page (1-based) to PNG. Cached per file fingerprint and page. */
export async function renderPdfPage(buf: Buffer, page: number, cacheKey?: string): Promise<Buffer> {
  const key = cacheKey ? `${cacheKey}:${page}` : "";
  const hit = key && cache.get(key);
  if (hit) return hit;

  const { createCanvas } = await import("@napi-rs/canvas");
  const doc = await open(buf);
  try {
    if (page < 1 || page > Math.min(doc.numPages, MAX_PAGES)) throw new Error("No such page");
    const p = await doc.getPage(page);
    const base = p.getViewport({ scale: 1 });
    const scale = Math.min(4, RENDER_EDGE / Math.max(base.width, base.height));
    const vp = p.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // pdf.js expects a DOM-like 2D context; @napi-rs/canvas provides a compatible one.
    await p.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: vp }).promise;
    const png = canvas.toBuffer("image/png");
    if (key) {
      cache.set(key, png);
      if (cache.size > 60) cache.delete(cache.keys().next().value!);
    }
    return png;
  } finally {
    await doc.destroy();
  }
}

export const MAX_REVIEW_PAGES = MAX_PAGES;

/** The text of a PDF, page by page (for briefs). Scanned PDFs have no text and return "". */
export async function pdfText(buf: Buffer, maxPages = 20): Promise<{ text: string; pages: number }> {
  const doc = await open(buf);
  try {
    const out: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let line = "";
      const lines: string[] = [];
      for (const it of tc.items as { str?: string; hasEOL?: boolean }[]) {
        line += it.str || "";
        if (it.hasEOL) {
          lines.push(line);
          line = "";
        }
      }
      if (line) lines.push(line);
      out.push(lines.join("\n"));
      page.cleanup();
    }
    return { text: out.join("\n\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), pages: doc.numPages };
  } finally {
    await doc.destroy();
  }
}
