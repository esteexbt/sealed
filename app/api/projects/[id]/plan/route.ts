import { NextResponse } from "next/server";
import { requireProject } from "@/lib/auth";
import { savePlan, type PlanStageInput } from "@/lib/plan";

/** Save the freelancer's edited plan. Changes go to the client to approve before anything can be paid. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { project, denied } = await requireProject(id);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { stages?: PlanStageInput[] };
  try {
    const r = await savePlan(project!.id, body.stages || []);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
