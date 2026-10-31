import { NextResponse } from "next/server";
import { createUser, sessionCookie } from "@/lib/auth";
import { clientIp, limited } from "@/lib/limit";

export async function POST(req: Request) {
  if (limited(`signup:${clientIp(req)}`, 10)) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  const { name, email, password } = (await req.json()) as { name?: string; email?: string; password?: string };
  if (!name?.trim()) return NextResponse.json({ error: "Add your name. Clients see it on your projects." }, { status: 400 });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!password || password.length < 8) return NextResponse.json({ error: "Use at least 8 characters for your password." }, { status: 400 });
  try {
    const user = await createUser({ name, email, password });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(sessionCookie(user.id));
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
