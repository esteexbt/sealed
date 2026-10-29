import { requireOwner } from "@/lib/auth";
import { NextResponse } from "next/server";
import { findMilestone, log, mutate } from "@/lib/db";
import { storeDeliverable } from "@/lib/files";

const MAX = 25 * 1024 * 1024;

export async function POST(req: Request, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id, mid } = await ctx.params;
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "Choose at least one file." }, { status: 400 });
  const tooBig = files.find((f) => f.size > MAX);
  if (tooBig) return NextResponse.json({ error: `${tooBig.name} is over 25 MB.` }, { status: 413 });

  const stored = await Promise.all(files.map(storeDeliverable));
  const ok = await mutate((s) => {
    const { project, milestone } = findMilestone(s, id, mid);
    if (!project || !milestone) return false;
    milestone.files.push(...stored);
    log(s, { projectId: id, milestoneId: mid, kind: "file_uploaded", text: `Added ${stored.length} file${stored.length === 1 ? "" : "s"} to ${milestone.title}` });
    return true;
  });
  if (!ok) return NextResponse.json({ error: "Milestone not found." }, { status: 404 });
  return NextResponse.json({ files: stored.map((f) => ({ id: f.id, name: f.name })) });
}
