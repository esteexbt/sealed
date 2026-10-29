import { loupe, ViewError } from "@/lib/view";

export async function GET(req: Request, ctx: { params: Promise<{ sid: string }> }) {
  const { sid } = await ctx.params;
  const url = new URL(req.url);
  try {
    const out = await loupe(sid, req, Number(url.searchParams.get("x")), Number(url.searchParams.get("y")));
    return new Response(new Uint8Array(out.bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store, private, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Loupes-Left": String(out.left),
      },
    });
  } catch (e) {
    return new Response((e as Error).message, { status: e instanceof ViewError ? e.status : 500 });
  }
}
