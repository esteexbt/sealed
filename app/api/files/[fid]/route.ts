import { isOwner } from "@/lib/auth";
import { read } from "@/lib/db";
import sharp from "sharp";
import { isPdf, readStored, reviewSource } from "@/lib/files";

/**
 * Serves deliverables. ?t=<portal token> is required for client access.
 * variant=preview → watermarked preview (always allowed with the token).
 * variant=full    → original, only once the milestone is paid (hold captured).
 * variant=page    → a clean page-1 image of a PDF, under the same rule as full.
 * The freelancer (no token) gets everything, for their own review.
 */
export async function GET(req: Request, ctx: { params: Promise<{ fid: string }> }) {
  const { fid } = await ctx.params;
  const url = new URL(req.url);
  const t = url.searchParams.get("t");
  const v = url.searchParams.get("variant");
  const variant = v === "full" || v === "page" ? v : "preview";
  if (!t && !(await isOwner())) return new Response("Not found", { status: 404 });
  const s = read();
  for (const p of s.projects) {
    if (t && p.portalToken !== t) continue;
    for (const m of p.milestones) {
      const f = m.files.find((x) => x.id === fid);
      if (!f) continue;
      const isClient = Boolean(t);
      if (isClient && f.removedAt) return new Response("Not found", { status: 404 });
      // The original only leaves the server once the hold is captured.
      if (variant !== "preview" && isClient && m.status !== "paid") {
        return new Response("This file unlocks when you approve the work and payment is released.", { status: 402 });
      }
      if (variant === "preview") {
        if (!f.previewKey) return new Response("No preview for this file type.", { status: 404 });
        return new Response(new Uint8Array(readStored(f.previewKey)), {
          headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" },
        });
      }
      if (variant === "page") {
        if (!isPdf(f.mime, f.name)) return new Response("Not a PDF.", { status: 400 });
        const png = await sharp(await reviewSource(f, 1)).resize({ width: 900, height: 900, fit: "inside" }).jpeg({ quality: 82 }).toBuffer();
        return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" } });
      }
      return new Response(new Uint8Array(readStored(f.originalKey)), {
        headers: {
          "Content-Type": f.mime,
          "Cache-Control": "private, no-store",
          "Content-Disposition": `${url.searchParams.get("download") ? "attachment" : "inline"}; filename="${encodeURIComponent(f.name)}"`,
        },
      });
    }
  }
  return new Response("Not found", { status: 404 });
}
