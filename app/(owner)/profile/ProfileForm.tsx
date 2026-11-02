"use client";

import { useRouter } from "next/navigation";

import { useEffect, useRef, useState } from "react";
import { useDialog } from "@/components/Dialog";
import { ShareProfile } from "@/components/ShareProfile";
import { SocialIcon, Stars } from "@/components/SocialIcon";
import type { SocialKind } from "@/lib/types";

interface PublicUser {
  id: string;
  email: string;
  name: string;
  paypalEmail: string | null;
  demo: boolean;
  handle: string;
  headline: string;
  bio: string;
  socials: Partial<Record<SocialKind, string>>;
  avatar: string | null;
  banner: string | null;
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
const CameraIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 8.5A2 2 0 0 1 6 6.5h1.6l1.4-2h6l1.4 2H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5Z" />
    <circle cx="12" cy="12.5" r="3.3" />
  </svg>
);

export function ProfileForm({
  user: initial,
  projects,
  rating,
  reviews,
  baseUrl,
  socials: SOCIALS,
}: {
  user: PublicUser;
  projects: number;
  rating: number | null;
  reviews: number;
  baseUrl: string;
  socials: { kind: SocialKind; label: string; placeholder: string }[];
}) {
  const router = useRouter();
  const bioEl = useRef<HTMLTextAreaElement>(null);
  // Bio starts small and grows with what's written.
  useEffect(() => {
    const t = bioEl.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight + 2, 360)}px`;
  });
  const dialog = useDialog();
  const [user, setUser] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [headline, setHeadline] = useState(initial.headline);
  const [bio, setBio] = useState(initial.bio);
  const [handle, setHandle] = useState(initial.handle);
  const [paypalEmail, setPaypalEmail] = useState(initial.paypalEmail || "");
  // Once saved, the PayPal email is locked behind an Edit button: it's where money goes.
  const [editingPP, setEditingPP] = useState(!initial.paypalEmail);
  const [links, setLinks] = useState<Partial<Record<SocialKind, string>>>(initial.socials);
  const [busy, setBusy] = useState<"" | "save" | "avatar" | "banner" | "logout">("");
  const [error, setError] = useState("");
  const avatarIn = useRef<HTMLInputElement>(null);
  const bannerIn = useRef<HTMLInputElement>(null);

  const dirty =
    name !== user.name || headline !== user.headline || bio !== user.bio || handle !== user.handle || paypalEmail !== (user.paypalEmail || "") || JSON.stringify(cleanLinks(links)) !== JSON.stringify(cleanLinks(user.socials));

  function cleanLinks(l: Partial<Record<SocialKind, string>>) {
    return Object.fromEntries(Object.entries(l).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v!.trim()]));
  }

  async function save() {
    setBusy("save");
    setError("");
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, headline, bio, handle, paypalEmail, socials: cleanLinks(links) }),
    });
    const json = await res.json();
    setBusy("");
    if (!res.ok) return setError(json.error || "That didn’t save.");
    setUser(json.user);
    if (json.user.paypalEmail) setEditingPP(false);
    dialog.notify("Profile saved.");
  }

  async function upload(kind: "avatar" | "banner", file: File | undefined) {
    if (!file) return;
    setBusy(kind);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/profile/image?kind=${kind}`, { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setError(json.error || "That image didn’t upload.");
    setUser((u) => ({ ...u, avatar: json.user.avatar, banner: json.user.banner }));
    router.refresh(); // so the photo shows in the header and tab bar straight away
    dialog.notify(kind === "avatar" ? "Profile photo updated." : "Banner updated.");
  }
  async function removeImage(kind: "avatar" | "banner") {
    setBusy(kind);
    const res = await fetch(`/api/profile/image?kind=${kind}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy("");
    if (res.ok) {
      setUser((u) => ({ ...u, avatar: json.user.avatar, banner: json.user.banner }));
      router.refresh();
    }
  }

  const profileUrl = `${baseUrl}${user.handle}`;

  return (
    <div className="acc">
      <section className="acc-hero">
        <div className="acc-banner" style={user.banner ? { backgroundImage: `url(${user.banner})` } : undefined}>
          <div className="acc-banner-tools">
            <button type="button" className="acc-img-btn" onClick={() => bannerIn.current?.click()} disabled={busy !== ""}>
              <CameraIcon /> {busy === "banner" ? "Uploading…" : user.banner ? "Change banner" : "Add banner"}
            </button>
            {user.banner && (
              <button type="button" className="acc-img-btn acc-img-quiet" onClick={() => removeImage("banner")} disabled={busy !== ""}>
                Remove
              </button>
            )}
          </div>
          <input ref={bannerIn} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload("banner", e.target.files?.[0])} />
        </div>
        <div className="acc-hero-row">
          <div className="acc-avatar-wrap">
            <button type="button" className="acc-avatar" onClick={() => avatarIn.current?.click()} disabled={busy !== ""} aria-label="Change profile photo">
              {user.avatar ? <img src={user.avatar} alt="" /> : <span>{initials(name)}</span>}
              <span className="acc-avatar-cam" aria-hidden>{busy === "avatar" ? "…" : <CameraIcon />}</span>
            </button>
            <input ref={avatarIn} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload("avatar", e.target.files?.[0])} />
          </div>
          <div className="acc-hero-actions">
            <a className="btn btn-ghost acc-view" href={`/u/${user.handle}`} target="_blank" rel="noreferrer">
              View profile
            </a>
            <ShareProfile url={profileUrl} name={user.name} />
          </div>
        </div>
        <div className="acc-hero-id">
          <h1>{user.name}</h1>
          <p className="muted small">
            {user.headline || "Add a headline so clients know what you do"}
          </p>
          <p className="tiny muted acc-meta">
            {rating !== null ? (
              <span className="acc-rating"><Stars value={rating} size={14} /> {rating.toFixed(1)} · {reviews} review{reviews === 1 ? "" : "s"}</span>
            ) : (
              <span>No reviews yet</span>
            )}
            <span>{projects} project{projects === 1 ? "" : "s"}</span>
            <span>{user.email}</span>
            {user.demo && <span>Demo account</span>}
            <a className="acc-view-sm" href={`/u/${user.handle}`} target="_blank" rel="noreferrer">View profile</a>
          </p>
        </div>
      </section>

      <form
        className="acc-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <section className="acc-card">
          <header>
            <h2>About you</h2>
            <p className="small muted">This is what clients see on your public profile and your project portals.</p>
          </header>
          <div className="acc-grid">
            <div className="field">
              <label htmlFor="pf-name">Name</label>
              <input id="pf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={user.demo} required maxLength={80} />
            </div>
            <div className="field">
              <label htmlFor="pf-head">Headline</label>
              <input id="pf-head" className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Brand identity and UI designer" maxLength={80} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="pf-bio">Bio</label>
            <textarea id="pf-bio" ref={bioEl} className="textarea grow-area" rows={2} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={600} placeholder="What you do, who you do it for, and what working with you is like." />
            <span className="tiny muted acc-count">{bio.length} / 600</span>
          </div>
        </section>

        <section className="acc-card">
          <header>
            <h2>Your profile link</h2>
            <p className="small muted">Share it with new clients so they can check your track record before they hire you.</p>
          </header>
          <div className="acc-link">
            <span className="acc-link-base">{baseUrl.replace(/^https?:\/\//, "")}</span>
            <input className="input" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} disabled={user.demo} aria-label="Profile link name" maxLength={30} />
          </div>
        </section>

        <section className="acc-card">
          <header>
            <h2>Social links</h2>
            <p className="small muted">They show as buttons on your profile. Add only the ones you want clients to see.</p>
          </header>
          <div className="acc-socials">
            {SOCIALS.map((s) => (
              <label key={s.kind} className="acc-social">
                <span className="acc-social-ic"><SocialIcon kind={s.kind} size={18} /></span>
                <span className="acc-social-name">{s.label}</span>
                <input className="input" value={links[s.kind] || ""} onChange={(e) => setLinks((l) => ({ ...l, [s.kind]: e.target.value }))} placeholder={s.placeholder} maxLength={200} inputMode={s.kind === "email" ? "email" : "url"} />
              </label>
            ))}
          </div>
        </section>

        <section className="acc-card">
          <header>
            <h2 id="getting-paid">Getting paid</h2>
            <p className="small muted">When a client approves a stage, Sealed sends your money to this PayPal account. Clients don’t see it.</p>
          </header>
          <div className="field">
            <label htmlFor="pf-pp">PayPal email</label>
            {editingPP ? (
              <div className="pp-edit">
                <input id="pf-pp" className="input" type="email" value={paypalEmail} onChange={(e) => setPaypalEmail(e.target.value)} placeholder="you@paypal.com" autoFocus={Boolean(user.paypalEmail)} />
                {user.paypalEmail && (
                  <button type="button" className="btn btn-quiet" onClick={() => { setPaypalEmail(user.paypalEmail || ""); setEditingPP(false); }}>
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <div className="pp-locked">
                <span className="pp-locked-ic" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                </span>
                <span className="pp-locked-email" id="pf-pp">{user.paypalEmail}</span>
                <button type="button" className="pp-edit-btn" onClick={() => setEditingPP(true)} aria-label="Edit PayPal email">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="M13.5 6.5l4 4" /></svg>
                  Edit
                </button>
              </div>
            )}
          </div>
        </section>

        {(dirty || error) && (
        <div className="acc-save acc-save-on">
          {error ? <p className="error small" role="alert">{error}</p> : <p className="small muted">You have unsaved changes.</p>}
          <button className="btn btn-seal" disabled={busy !== "" || !dirty}>{busy === "save" ? "Saving…" : "Save changes"}</button>
        </div>
        )}
      </form>

      <section className="acc-out">
        <button
          type="button"
          className="btn btn-danger-outline acc-out-btn"
          disabled={busy === "logout"}
          onClick={async () => {
            setBusy("logout");
            await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
            window.location.href = "/login";
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14M10 16l-4-4 4-4M6 12h9.5" /></svg>
          {busy === "logout" ? "Logging out…" : "Log out"}
        </button>
      </section>
    </div>
  );
}
