import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";

export const OWNER_COOKIE = "sealed_owner";
const secret = () => process.env.OWNER_PASSWORD || "";

/** Signed value derived from the password, so the cookie can't be forged. */
export function sessionValue() {
  return crypto.createHmac("sha256", secret()).update("sealed-owner-v1").digest("hex");
}

export function passwordMatches(input: string) {
  const a = Buffer.from(input);
  const b = Buffer.from(secret());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** With no OWNER_PASSWORD set (local development) the owner is always signed in. */
export async function isOwner() {
  if (!secret()) return true;
  const c = (await cookies()).get(OWNER_COOKIE)?.value;
  return c === sessionValue();
}

export async function requireOwner(): Promise<Response | null> {
  return (await isOwner()) ? null : new Response(JSON.stringify({ error: "Sign in first." }), { status: 401, headers: { "Content-Type": "application/json" } });
}
