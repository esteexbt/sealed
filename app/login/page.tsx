"use client";

import { useState } from "react";
import { Seal } from "@/components/Seal";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <form
        className="sheet login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
          if (res.ok) {
            window.location.href = "/";
            return;
          }
          setError((await res.json()).error);
          setBusy(false);
        }}
      >
        <Seal size={52} />
        <h1>Sign in to Sealed AI</h1>
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input id="pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-ink" disabled={busy || !password}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
