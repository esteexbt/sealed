import { requireOwner } from "@/lib/auth";
import { NextResponse } from "next/server";
import { sendReminder } from "@/lib/actions";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id, mid } = await ctx.params;
  try {
    const out = await sendReminder(id, mid);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
