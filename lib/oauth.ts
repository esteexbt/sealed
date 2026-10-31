import "server-only";
import crypto from "node:crypto";
import { config } from "./config";

/**
 * Social sign-in. Each provider is only offered once its keys are set, so the
 * app never shows a button that can't work.
 *
 * Google:  GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Google Cloud > APIs & Services > Credentials > OAuth client ID, Web).
 * PayPal:  the same PayPal app as payments, with "Log in with PayPal" ticked in the developer dashboard
 *          and PAYPAL_LOGIN=on. Its return URL must be exactly PAYPAL_RETURN_URL (or APP_URL/api/auth/paypal/callback).
 */
export type Provider = "google" | "paypal";

export const providers = {
  google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  paypal: Boolean(config.paypalClientId && config.paypalSecret && /^(on|true|1|yes)$/i.test(process.env.PAYPAL_LOGIN || "")),
};

export const callbackUrl = (p: Provider) =>
  p === "paypal" && process.env.PAYPAL_RETURN_URL ? process.env.PAYPAL_RETURN_URL : `${config.appUrl}/api/auth/${p}/callback`;

export const OAUTH_COOKIE = "sealed_oauth";
export const newState = () => crypto.randomBytes(18).toString("base64url");

export function authorizeUrl(p: Provider, state: string) {
  if (p === "google") {
    const q = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: callbackUrl("google"),
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  const q = new URLSearchParams({
    flowEntry: "static",
    client_id: config.paypalClientId,
    response_type: "code",
    scope: "openid profile email",
    redirect_uri: callbackUrl("paypal"),
    state,
    fullPage: "true",
  });
  return `https://www.sandbox.paypal.com/connect?${q}`;
}

export interface OAuthProfile {
  sub: string;
  email: string;
  name: string;
}

/** Trades the code from the provider's redirect for the person's id, email and name. */
export async function exchange(p: Provider, code: string): Promise<OAuthProfile> {
  if (p === "google") {
    const tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: callbackUrl("google"), grant_type: "authorization_code" }),
    }).then((r) => r.json());
    if (!tok.access_token) throw new Error(tok.error_description || "Google didn’t accept the sign-in.");
    const me = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
    if (!me.sub || !me.email) throw new Error("Google didn’t share an email address.");
    if (me.email_verified === false) throw new Error("Verify your Google email address first.");
    return { sub: String(me.sub), email: String(me.email), name: String(me.name || me.given_name || "") };
  }
  const base = "https://api-m.sandbox.paypal.com";
  const basic = Buffer.from(`${config.paypalClientId}:${config.paypalSecret}`).toString("base64");
  const tok = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code }),
  }).then((r) => r.json());
  if (!tok.access_token) throw new Error(tok.error_description || "PayPal didn’t accept the sign-in.");
  const me = await fetch(`${base}/v1/identity/openidconnect/userinfo?schema=openid`, { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
  const email = me.email || me.emails?.find((e: { primary?: boolean }) => e.primary)?.value || me.emails?.[0]?.value;
  const sub = me.payer_id || me.user_id || me.sub;
  if (!sub || !email) throw new Error("PayPal didn’t share an email address. Tick “Email” under Log in with PayPal in your app settings.");
  const name = me.name || [me.given_name, me.family_name].filter(Boolean).join(" ");
  return { sub: String(sub), email: String(email), name: String(name || "") };
}
