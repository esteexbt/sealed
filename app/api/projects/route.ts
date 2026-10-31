import { requireOwner } from "@/lib/auth";
import { NextResponse } from "next/server";
import { createProject } from "@/lib/actions";
import { projectSlug } from "@/lib/db";
import type { ScopePlan } from "@/lib/types";

export async function POST(req: Request) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { plan, brief } = (await req.json()) as { plan?: ScopePlan; brief?: string };
  if (!plan?.milestones?.length) return NextResponse.json({ error: "Add at least one milestone." }, { status: 400 });
  if (plan.milestones.some((m) => !(m.amount > 0))) {
    return NextResponse.json({ error: "Every milestone needs a price above zero." }, { status: 400 });
  }
  const project = await createProject(plan, brief || "");
  return NextResponse.json({ id: project.id, slug: projectSlug(project) });
}
