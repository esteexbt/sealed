import { takeMosaic, ViewError } from "@/lib/view";

const HEADERS = {
  "Content-Type": "application/octet-stream",
  "Cache-Control": "no-store, private, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export async function GET(req: Request, ctx: { params: Promise<{ sid: string }> }) {
  const { sid } = await ctx.params;
  try {
    return new Response(new Uint8Array(takeMosaic(sid, req)), { headers: HEADERS });
  } catch (e) {
    return new Response((e as Error).message, { status: e instanceof ViewError ? e.status : 500 });
  }
}
