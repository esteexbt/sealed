import { NextResponse } from "next/server";
import { startCheckout } from "@/lib/actions";

export async function POST(req: Request) {
  const { token, milestoneId } = (await req.json()) as { token: string; milestoneId: string };
  try {
    const order = await startCheckout(token, milestoneId);
    return NextResponse.json({ id: order.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
