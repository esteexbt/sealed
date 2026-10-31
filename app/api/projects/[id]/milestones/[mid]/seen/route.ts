import { NextResponse } from "next/server";
import { requireProject } from "@/lib/auth";
import { findMilestone, mutate } from "@/lib/db";

/** Marks a milestone's notifications as read. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const { id, mid } = await ctx.params;
  const { denied } = await requireProject(id);
  if (denied) return denied;
  let found = false;
  await mutate((s) => {
    const { milestone } = findMilestone(s, id, mid);
    if (!milestone) return;
    found = true;
    milestone.noticesSeenAt = new Date().toISOString();
  });
  return found ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
