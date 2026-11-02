"use client";

import { useEffect, useState } from "react";
import { useDialog } from "@/components/Dialog";

interface PublicUser {
  id: string;
  email: string;
  name: string;
  paypalEmail: string | null;
  google: boolean;
  paypal: boolean;
  hasPassword: boolean;
  demo: boolean;
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

export function ProfileForm({ user, projects, google, paypal, notice, initialError }: { user: PublicUser; projects: number; google: boolean; paypal: boolean; notice: string; initialError: string }) {
  const dialog = useDialog();
  const [name, setName] = useState(user.name);
  const [paypalEmail, setPaypalEmail] = useState(user.paypalEmail || "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState<"" | "profile" | "password" | "out">("");
  const [error, setError] = useState(initialError);
  useEffect(() => {
    if (notice) dialog.notify(notice);
    // Only on arrival from a linking redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(body: object, kind: "profile" | "password", done: string) {
    setBusy(kind);
    setError("");
    const res = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy("");
    const json = await res.json();
    if (!res.ok) return setError(json.error || "That didn’t save.");
    dialog.notify(done);
    if (kind === "password") {
      setCurrent("");
      setNext("");
    }
  }

  return (
    <div className="profile">
      <header className="profile-head">
        <span className="avatar" aria-hidden>{initials(name)}</span>
        <div>
          <h1>{name || "Your profile"}</h1>
          <p className="muted small">
            {user.email} · {projects} project{projects === 1 ? "" : "s"}
            {user.demo ? " · demo account" : ""}
          </p>
        </div>
      </header>

      {error && <p className="error small" role="alert">{error}</p>}

      <form
        className="pf-card"
        onSubmit={(e) => {
          e.preventDefault();
          save(user.demo ? { paypalEmail } : { name, paypalEmail }, "profile", "Profile saved.");
        }}
      >
        <h2>How clients see you</h2>
        <div className="pf-grid">
          <div className="field">
            <label htmlFor="pf-name">Name</label>
            <input id="pf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={user.demo} required />
            <span className="tiny muted">Shown on your client portals, reminders and PayPal invoices.</span>
          </div>
          <div className="field">
            <label htmlFor="pf-pp">PayPal email</label>
            <input id="pf-pp" className="input" type="email" value={paypalEmail} onChange={(e) => setPaypalEmail(e.target.value)} placeholder="Where you get paid" />
            <span className="tiny muted">The PayPal account your payments belong to.</span>
          </div>
        </div>
        <div className="pf-actions">
          <button className="btn btn-seal" disabled={busy !== ""}>{busy === "profile" ? "Saving…" : "Save changes"}</button>
        </div>
      </form>

      <section className="pf-card">
        <h2>Ways to sign in</h2>
        <div className="pf-row">
          <div className="pf-row-main">
            <strong className="small">Email and password</strong>
            <span className="small muted">{user.email}</span>
          </div>
          {user.hasPassword ? <span className="pf-ok">On</span> : <span className="tiny muted">Set a password below</span>}
        </div>
        <div className="pf-row">
          <div className="pf-row-main"><strong className="small">Google</strong></div>
          {user.google ? <span className="pf-ok">Linked</span> : google ? <a className="btn btn-ghost" href="/api/auth/google/start">Link Google</a> : <span className="tiny muted">Not set up</span>}
        </div>
        {(paypal || user.paypal) && (
        <div className="pf-row">
          <div className="pf-row-main"><strong className="small">PayPal</strong></div>
          {user.paypal ? <span className="pf-ok">Linked</span> : paypal ? <a className="btn btn-ghost" href="/api/auth/paypal/start">Link PayPal</a> : <span className="tiny muted">Not available yet</span>}
        </div>
        )}
      </section>

      {!user.demo && (
        <form
          className="pf-card"
          onSubmit={(e) => {
            e.preventDefault();
            save({ currentPassword: current, newPassword: next }, "password", user.hasPassword ? "Password changed." : "Password set.");
          }}
        >
          <h2>{user.hasPassword ? "Change password" : "Set a password"}</h2>
          <div className="pf-grid">
            {user.hasPassword && (
              <div className="field">
                <label htmlFor="pf-cur">Current password</label>
                <input id="pf-cur" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
              </div>
            )}
            <div className="field">
              <label htmlFor="pf-new">New password</label>
              <input id="pf-new" className="input" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
              <span className="tiny muted">At least 8 characters.</span>
            </div>
          </div>
          <div className="pf-actions">
            <button className="btn btn-ghost" disabled={busy !== ""}>{busy === "password" ? "Saving…" : user.hasPassword ? "Change password" : "Set password"}</button>
          </div>
        </form>
      )}

      <section className="pf-card">
        <div className="pf-row">
          <div className="pf-row-main">
            <div>
              <strong className="small">Sign out</strong>
              <p className="tiny muted">Your clients’ links keep working while you’re signed out.</p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy !== ""}
            onClick={async () => {
              setBusy("out");
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            {busy === "out" ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </section>
    </div>
  );
}
