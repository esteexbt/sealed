import { NextResponse } from "next/server";
import { requireProject } from "@/lib/auth";
import { freelancerCancel, sendRevision } from "@/lib/actions";
import { runCheck } from "@/lib/check";

/** Freelancer actions on a milestone. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const { id, mid } = await ctx.params;
  const { denied } = await requireProject(id);
  if (denied) return denied;
  const { action } = (await req.json()) as { action?: "revision" | "cancel" | "check" };
  try {
    if (action === "revision") await sendRevision(id, mid);
    else if (action === "cancel") await freelancerCancel(id, mid);
    else if (action === "check") await runCheck(id, mid);
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
