import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { findMilestone, log, mutate } from "@/lib/db";
import { runCheck } from "@/lib/check";

const EDITABLE = new Set(["draft", "awaiting_payment", "changes_requested"]);

/** Withdraws a file. It stays on record (with its fingerprint) but leaves the client's view. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; mid: string; fid: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id, mid, fid } = await ctx.params;
  try {
    await mutate((s) => {
      const { milestone } = findMilestone(s, id, mid);
      const f = milestone?.files.find((x) => x.id === fid && !x.removedAt);
      if (!milestone || !f) throw new Error("File not found.");
      if (!EDITABLE.has(milestone.status)) throw new Error("Files are locked while the client reviews or after payment.");
      f.removedAt = new Date().toISOString();
      log(s, { projectId: id, milestoneId: mid, kind: "file_removed", text: `Removed ${f.name} from ${milestone.title}` });
    });
    await runCheck(id, mid);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
