"use client";

import { LegalLinks } from "@/components/LegalLinks";

import { useState } from "react";
import { Logo } from "@/components/Seal";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);
const PayPalIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path fill="#003087" d="M7.1 21.3H3.6a.5.5 0 0 1-.5-.6L5.9 3.1A.8.8 0 0 1 6.7 2.4h6.6c3.4 0 5.6 1.8 5 5.2-.7 4-3.3 5.9-7 5.9H9.2a.8.8 0 0 0-.8.7l-1.3 7.1Z" />
    <path fill="#0070E0" d="M19.6 8.1c-.8 3.9-3.4 5.8-7 5.8h-1.8a.8.8 0 0 0-.8.7l-1 6.1a.4.4 0 0 0 .4.5h3a.7.7 0 0 0 .7-.6l.5-3.1a.7.7 0 0 1 .7-.6h.5c3 0 5.3-1.2 6-4.8.3-1.6.1-3-.8-4Z" />
  </svg>
);

/** Sign in or create an account: email and password, Google, PayPal, or the demo account. */
export function AuthForm({ google, paypal, demo, initialError, initialMode }: { google: boolean; paypal: boolean; demo: boolean; initialError: string; initialMode: "signin" | "signup" }) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState<"" | "form" | "demo">("");
  const signup = mode === "signup";

  async function post(url: string, body: object, kind: "form" | "demo") {
    setBusy(kind);
    setError("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      setError((await res.json()).error || "Something went wrong. Try again.");
    } catch {
      setError("Couldn’t reach Sealed. Check your connection.");
    }
    setBusy("");
  }

  return (
    <main className="auth">
      <section className="auth-card">
        <Logo height={34} />
        <div className="auth-head">
          <h1>{signup ? "Create your account" : "Welcome back"}</h1>
          <p className="muted">{signup ? "Get paid for every stage, with the money held by PayPal before your client sees the work." : "Sign in to your projects, payments and clients."}</p>
        </div>

        {(google || paypal) && (
          <div className="auth-social">
            {google && (
              <a className="btn btn-ghost auth-provider" href="/api/auth/google/start">
                <GoogleIcon /> Continue with Google
              </a>
            )}
            {paypal && (
              <a className="btn btn-ghost auth-provider" href="/api/auth/paypal/start">
                <PayPalIcon /> Continue with PayPal
              </a>
            )}
          </div>
        )}
        {(google || paypal) && (
          <p className="auth-or" aria-hidden>
            <span>or use your email</span>
          </p>
        )}

        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            post(signup ? "/api/auth/signup" : "/api/auth/login", signup ? { name, email, password } : { email, password }, "form");
          }}
        >
          {signup && (
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="As your clients know you" required />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input id="pw" className="input" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required />
            {signup && <span className="tiny muted">At least 8 characters.</span>}
          </div>
          {error && (
            <p className="error small" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-seal auth-submit" disabled={busy !== ""}>
            {busy === "form" ? (signup ? "Creating your account…" : "Signing in…") : signup ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="small auth-switch">
          {signup ? "Already have an account?" : "New to Sealed?"}{" "}
          <button type="button" className="link-btn" onClick={() => { setMode(signup ? "signin" : "signup"); setError(""); }}>
            {signup ? "Sign in" : "Create an account"}
          </button>
        </p>

        {demo && (
          <div className="auth-demo">
            <div>
              <strong className="small">Just looking?</strong>
              <p className="tiny muted">Open a demo freelancer account with sample clients and payments.</p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => post("/api/auth/demo", {}, "demo")} disabled={busy !== ""}>
              {busy === "demo" ? "Opening…" : "Try the demo"}
            </button>
          </div>
        )}
      </section>
      <p className="tiny muted auth-foot">Clients never need an account. They open the private link you send them.</p>
      <LegalLinks />
    </main>
  );
}
