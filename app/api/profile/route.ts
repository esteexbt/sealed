import { NextResponse } from "next/server";
import { checkPassword, hashPassword, publicUser, requireUser } from "@/lib/auth";
import { mutate } from "@/lib/db";

/** Updates the signed-in freelancer's profile: name, PayPal email, password. */
export async function PATCH(req: Request) {
  const { user, denied } = await requireUser();
  if (denied) return denied;
  const body = (await req.json()) as { name?: string; paypalEmail?: string; currentPassword?: string; newPassword?: string };
  if (user.demo && (body.newPassword || body.name !== undefined)) {
    return NextResponse.json({ error: "The demo account’s name and password can’t be changed." }, { status: 403 });
  }
  if (body.name !== undefined && !body.name.trim()) return NextResponse.json({ error: "Your name can’t be empty." }, { status: 400 });
  if (body.paypalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.paypalEmail.trim())) return NextResponse.json({ error: "Enter a valid PayPal email." }, { status: 400 });
  if (body.newPassword !== undefined) {
    if (body.newPassword.length < 8) return NextResponse.json({ error: "Use at least 8 characters for your password." }, { status: 400 });
    if (user.passwordHash && !checkPassword(body.currentPassword || "", user.passwordHash)) return NextResponse.json({ error: "Your current password isn’t right." }, { status: 400 });
  }
  const u = await mutate((s) => {
    const x = s.users!.find((y) => y.id === user.id)!;
    if (body.name !== undefined) x.name = body.name.trim().slice(0, 80);
    if (body.paypalEmail !== undefined) x.paypalEmail = body.paypalEmail.trim().toLowerCase() || null;
    if (body.newPassword) x.passwordHash = hashPassword(body.newPassword);
    return x;
  });
  return NextResponse.json({ user: publicUser(u) });
}
