import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OAUTH_COOKIE, exchange, type Provider } from "@/lib/oauth";
import { currentUser, linkOAuth, sessionCookie, upsertOAuthUser } from "@/lib/auth";
import { config } from "@/lib/config";

const back = (msg: string) => NextResponse.redirect(`${config.appUrl}/login?error=${encodeURIComponent(msg)}`);

export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (provider !== "google" && provider !== "paypal") return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const jar = await cookies();
  const saved = jar.get(OAUTH_COOKIE)?.value || "";
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return back("Sign-in was cancelled.");
  // The state must match the one we set, so nobody can sign you into their account.
  // (PayPal doesn't always echo state back; then the short-lived cookie must at least be ours for PayPal.)
  const ok = state ? saved === `${provider}.${state}` : provider === "paypal" && saved.startsWith("paypal.");
  if (!ok) return back("That sign-in link expired. Try again.");
  const code = url.searchParams.get("code");
  if (!code) return back("Sign-in didn’t finish. Try again.");
  try {
    const me = await exchange(provider as Provider, code);
    // Signed in already? Then this links the provider to that account (from the profile page).
    const signedIn = await currentUser();
    const user = signedIn ? await linkOAuth(signedIn.id, provider as Provider, me.sub, me.email) : await upsertOAuthUser(provider as Provider, me.sub, me.email, me.name);
    const res = NextResponse.redirect(`${config.appUrl}/${signedIn ? "profile?linked=" + provider : ""}`);
    res.cookies.set(sessionCookie(user.id));
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  } catch (e) {
    console.error(`[auth] ${provider} sign-in failed:`, (e as Error).message);
    if (await currentUser()) return NextResponse.redirect(`${config.appUrl}/profile?error=${encodeURIComponent((e as Error).message)}`);
    return back((e as Error).message);
  }
}
