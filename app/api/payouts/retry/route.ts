import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { retryPayouts } from "@/lib/actions";

/** Re-send this freelancer's payouts that failed or were waiting for a PayPal email. */
export async function POST() {
  const { user, denied } = await requireUser();
  if (denied) return denied;
  const n = await retryPayouts(user!.id);
  return NextResponse.json({ retried: n });
}
