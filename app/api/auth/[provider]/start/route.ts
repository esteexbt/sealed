import { NextResponse } from "next/server";
import { OAUTH_COOKIE, authorizeUrl, newState, providers, type Provider } from "@/lib/oauth";
import { config } from "@/lib/config";

export async function GET(_req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (provider !== "google" && provider !== "paypal") return new Response("Not found", { status: 404 });
  if (!providers[provider as Provider]) return NextResponse.redirect(`${config.appUrl}/login?error=${encodeURIComponent(`${provider === "google" ? "Google" : "PayPal"} sign-in isn’t set up yet.`)}`);
  const state = newState();
  const res = NextResponse.redirect(authorizeUrl(provider as Provider, state));
  res.cookies.set(OAUTH_COOKIE, `${provider}.${state}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600, secure: config.appUrl.startsWith("https") });
  return res;
}
