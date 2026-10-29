import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { updateMilestone, type MilestonePatch } from "@/lib/actions";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id, mid } = await ctx.params;
  const body = (await req.json()) as MilestonePatch;
  try {
    const m = await updateMilestone(id, mid, { title: body.title, amount: body.amount, dueDate: body.dueDate });
    return NextResponse.json({ title: m.title, amount: m.amount, dueDate: m.dueDate });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
