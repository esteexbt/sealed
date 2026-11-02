import fs from "node:fs";
import path from "node:path";
import { FILES_DIR } from "@/lib/db";
import { userByHandle } from "@/lib/profile";

/** A freelancer's public profile photo or banner. */
export async function GET(_req: Request, ctx: { params: Promise<{ handle: string; kind: string }> }) {
  const { handle, kind } = await ctx.params;
  const u = userByHandle(handle);
  const key = u && (kind === "avatar" ? u.avatarKey : kind === "banner" ? u.bannerKey : null);
  if (!key) return new Response("Not found", { status: 404 });
  try {
    const buf = fs.readFileSync(path.join(/*turbopackIgnore: true*/ FILES_DIR, path.basename(key)));
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
