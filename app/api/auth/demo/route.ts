import { NextResponse } from "next/server";
import { sessionCookie, users } from "@/lib/auth";

/** Opens the shared demo account, so judges can try Sealed without signing up. */
export async function POST() {
  if (/^(off|false|0|no)$/i.test(process.env.DEMO_LOGIN || "")) return NextResponse.json({ error: "The demo account is switched off." }, { status: 404 });
  const demo = users().find((u) => u.demo);
  if (!demo) return NextResponse.json({ error: "There’s no demo account on this server. Run npm run seed to create one." }, { status: 404 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(demo.id));
  return res;
}
