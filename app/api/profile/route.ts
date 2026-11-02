import { NextResponse } from "next/server";
import { retryPayouts } from "@/lib/actions";
import { checkPassword, hashPassword, publicUser, requireUser } from "@/lib/auth";
import { mutate } from "@/lib/db";
import { SOCIALS, socialUrl, validHandle } from "@/lib/profile";
import type { SocialKind } from "@/lib/types";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/** Updates the signed-in freelancer's profile. */
export async function PATCH(req: Request) {
  const { user, denied } = await requireUser();
  if (denied) return denied;
  const body = (await req.json()) as {
    name?: string;
    paypalEmail?: string;
    headline?: string;
    bio?: string;
    handle?: string;
    socials?: Partial<Record<SocialKind, string>>;
    currentPassword?: string;
    newPassword?: string;
  };
  if (user.demo && (body.newPassword || (body.name !== undefined && body.name.trim() !== user.name) || (body.handle !== undefined && body.handle !== user.handle))) {
    return NextResponse.json({ error: "The demo account’s name, link and password can’t be changed." }, { status: 403 });
  }
  if (body.name !== undefined && !body.name.trim()) return bad("Your name can’t be empty.");
  if (body.paypalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.paypalEmail.trim())) return bad("Enter a valid PayPal email.");
  if (body.headline !== undefined && body.headline.length > 80) return bad("Keep your headline under 80 characters.");
  if (body.bio !== undefined && body.bio.length > 600) return bad("Keep your bio under 600 characters.");
  let handle: string | undefined;
  if (body.handle !== undefined) {
    handle = body.handle.trim().toLowerCase().replace(/^@/, "");
    const why = validHandle(handle);
    if (why) return bad(why);
  }
  const socials: Partial<Record<SocialKind, string>> = {};
  if (body.socials) {
    for (const { kind, label } of SOCIALS) {
      const v = (body.socials[kind] || "").trim();
      if (!v) continue;
      if (!socialUrl(kind, v)) return bad(`That ${label} link doesn’t look right.`);
      socials[kind] = v.slice(0, 200);
    }
  }
  if (body.newPassword !== undefined) {
    if (body.newPassword.length < 8) return bad("Use at least 8 characters for your password.");
    if (user.passwordHash && !checkPassword(body.currentPassword || "", user.passwordHash)) return bad("Your current password isn’t right.");
  }
  try {
    const u = await mutate((s) => {
      if (handle && s.users!.some((y) => y.id !== user.id && y.handle === handle)) throw new Error("That profile link is taken. Try another.");
      const x = s.users!.find((y) => y.id === user.id)!;
      if (body.name !== undefined) x.name = body.name.trim().slice(0, 80);
      if (body.paypalEmail !== undefined) x.paypalEmail = body.paypalEmail.trim().toLowerCase() || null;
      if (body.headline !== undefined) x.headline = body.headline.trim();
      if (body.bio !== undefined) x.bio = body.bio.trim();
      if (handle) x.handle = handle;
      if (body.socials) x.socials = socials;
      if (body.newPassword) x.passwordHash = hashPassword(body.newPassword);
      return x;
    });
    // A new PayPal email sends on any payouts that were waiting for one.
    if (body.paypalEmail && u.paypalEmail) await retryPayouts(u.id);
    return NextResponse.json({ user: publicUser(u) });
  } catch (e) {
    return bad((e as Error).message);
  }
}
