import { NextResponse } from "next/server";
import { approveMilestone, clientCancel, requestChanges } from "@/lib/actions";
import { mutate } from "@/lib/db";

/** Client actions from the portal. The portal token is the client's credential. */
export async function POST(req: Request) {
  const { token, milestoneId, action, note, rating } = (await req.json()) as {
    token?: string;
    milestoneId?: string;
    action?: "approve" | "changes" | "cancel" | "seen" | "review";
    note?: string;
    rating?: number;
  };
  if (action === "review") {
    // One rating per project, editable. Only after PayPal has captured a payment, so every rating is from a paying client.
    const r = Number(rating);
    if (!token || !Number.isInteger(r) || r < 1 || r > 5) return NextResponse.json({ error: "Pick 1 to 5 stars." }, { status: 400 });
    const comment = (note || "").trim().slice(0, 500);
    try {
      await mutate((s) => {
        const p = s.projects.find((x) => x.portalToken === token);
        if (!p) throw new Error("Not found");
        if (!p.milestones.some((m) => m.status === "paid" && m.payment?.captureId)) throw new Error("You can rate once you’ve approved and paid for a stage.");
        const now = new Date().toISOString();
        p.review = p.review ? { ...p.review, rating: r, comment, updatedAt: now } : { rating: r, comment, at: now };
      });
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }
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
