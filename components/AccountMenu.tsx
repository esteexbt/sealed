"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * The avatar's menu: who you're signed in as, your account, and log out.
 * `variant="tab"` is the Profile tab in the phone tab bar; the menu opens upwards.
 */
export function AccountMenu({ name, email, initials, avatar, status, variant = "top" }: { name: string; email: string; initials: string; avatar?: string | null; status: string; variant?: "top" | "tab" }) {
  const face = avatar ? <img src={avatar} alt="" /> : initials;
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function logout() {
    setLeaving(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }

  return (
    <div ref={wrap} className={`acct acct-${variant}${open ? " acct-open" : ""}`}>
      {variant === "top" ? (
        <button type="button" className="avatar-link" aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu for ${name}`} onClick={() => setOpen((o) => !o)}>
          <span className={`avatar${avatar ? " has-photo" : ""}`} aria-hidden>{face}</span>
        </button>
      ) : (
        <button type="button" className="tab" aria-haspopup="menu" aria-expanded={open} aria-current={path.startsWith("/profile") ? "page" : undefined} onClick={() => setOpen((o) => !o)}>
          <span className={`tab-avatar${avatar ? " has-photo" : ""}`} aria-hidden>{face}</span>
          <span>Profile</span>
        </button>
      )}
      {open && (
        <div className="acct-menu" role="menu">
          <div className="acct-who">
            <span className={`avatar${avatar ? " has-photo" : ""}`} aria-hidden>{face}</span>
            <div>
              <strong>{name}</strong>
              <span className="tiny muted">{email}</span>
            </div>
          </div>
          <Link href="/profile" role="menuitem" className="acct-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" /></svg>
            My account
          </Link>
          <button type="button" role="menuitem" className="acct-item acct-out" onClick={logout} disabled={leaving}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14M10 16l-4-4 4-4M6 12h9.5" /></svg>
            {leaving ? "Logging out…" : "Log out"}
          </button>
          <p className="acct-status tiny muted">{status}</p>
        </div>
      )}
    </div>
  );
}
