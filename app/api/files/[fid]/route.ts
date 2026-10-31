import { currentUser } from "@/lib/auth";
import { findMilestone, mutate, read } from "@/lib/db";
import sharp from "sharp";
import { backfillPreview, isImage, isPdf, isSvg, readStored, reviewSource } from "@/lib/files";

/**
 * Serves deliverables. ?t=<portal token> is required for client access.
 * variant=preview → watermarked preview (always allowed with the token).
 * variant=full    → original, only once the milestone is paid (hold captured).
 * variant=page    → a clean raster of a PDF's first page or an SVG, under the same rule as full.
 * The freelancer (no token) gets everything, for their own review.
 */
export async function GET(req: Request, ctx: { params: Promise<{ fid: string }> }) {
  const { fid } = await ctx.params;
  const url = new URL(req.url);
  const t = url.searchParams.get("t");
  const v = url.searchParams.get("variant");
  const variant = v === "full" || v === "page" ? v : "preview";
  // Without a portal token, only the freelancer who owns the project gets the file.
  const me = t ? null : await currentUser();
  if (!t && !me) return new Response("Not found", { status: 404 });
  const s = read();
  for (const p of s.projects) {
    if (t && p.portalToken !== t) continue;
    if (!t && p.ownerId !== me!.id) continue;
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
        if (!f.previewKey) {
          // Files stored before their type had previews get one on first request.
          const key = await backfillPreview(f);
          if (!key) return new Response("No preview for this file type.", { status: 404 });
          await mutate((st) => {
            const { milestone } = findMilestone(st, p.id, m.id);
            const x = milestone?.files.find((y) => y.id === f.id);
            if (x) x.previewKey = key;
          });
          f.previewKey = key;
        }
        return new Response(new Uint8Array(readStored(f.previewKey)), {
          headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" },
        });
      }
      if (variant === "page") {
        if (!isPdf(f.mime, f.name) && !isSvg(f.mime, f.name)) return new Response("No page view for this file.", { status: 400 });
        const png = await sharp(await reviewSource(f, 1)).resize({ width: 900, height: 900, fit: "inside" }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
        return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" } });
      }
      // Delivered files are untrusted. Only raster images may display inline; everything
      // else downloads, and nothing served from here may run script on this origin.
      const inline = !url.searchParams.get("download") && (isImage(f.mime) || isSvg(f.mime, f.name));
      return new Response(new Uint8Array(readStored(f.originalKey)), {
        headers: {
          "Content-Type": f.mime,
          "Cache-Control": "private, no-store",
          "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
          "Content-Security-Policy": "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }
  return new Response("Not found", { status: 404 });
}
