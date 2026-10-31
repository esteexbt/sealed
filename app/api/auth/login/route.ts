import { NextResponse } from "next/server";
import { checkPassword, findUserByEmail, sessionCookie } from "@/lib/auth";
import { clientIp, limited } from "@/lib/limit";

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (limited(`login:${clientIp(req)}`, 20) || (email && limited(`login:${email.toLowerCase()}`, 8))) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }
  const user = email ? findUserByEmail(email) : undefined;
  if (user && !user.passwordHash && (user.googleId || user.paypalId)) {
    return NextResponse.json({ error: `This account signs in with ${user.googleId ? "Google" : "PayPal"}. Use that button below.` }, { status: 401 });
  }
  if (!user || !password || !checkPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "That email and password don’t match." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(user.id));
  return res;
}
