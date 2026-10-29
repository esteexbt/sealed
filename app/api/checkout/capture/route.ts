import { NextResponse } from "next/server";
import { completeCheckout } from "@/lib/actions";

export async function POST(req: Request) {
  const { token, orderId } = (await req.json()) as { token: string; orderId: string };
  try {
    return NextResponse.json(await completeCheckout(token, orderId));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
