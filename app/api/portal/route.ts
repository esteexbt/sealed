import { NextResponse } from "next/server";
import { approveMilestone, clientCancel, requestChanges } from "@/lib/actions";
import { mutate } from "@/lib/db";

/** Client actions from the portal. The portal token is the client's credential. */
export async function POST(req: Request) {
  const { token, milestoneId, action, note } = (await req.json()) as {
    token?: string;
    milestoneId?: string;
    action?: "approve" | "changes" | "cancel" | "seen";
    note?: string;
  };
  if (!token || !milestoneId) return NextResponse.json({ error: "Missing milestone" }, { status: 400 });
  try {
    if (action === "approve") await approveMilestone(token, milestoneId);
    else if (action === "changes") await requestChanges(token, milestoneId, note || "");
    else if (action === "cancel") await clientCancel(token, milestoneId);
    else if (action === "seen") {
      await mutate((s) => {
        const m = s.projects.find((p) => p.portalToken === token)?.milestones.find((x) => x.id === milestoneId);
        if (!m) throw new Error("Not found");
        m.clientSeenAt = new Date().toISOString();
      });
    }
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
