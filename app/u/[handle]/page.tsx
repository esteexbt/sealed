import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { config } from "@/lib/config";
import { publicProfile, userByHandle } from "@/lib/profile";
import { Logo } from "@/components/Seal";
import { SocialIcon, Stars } from "@/components/SocialIcon";
import { ShareProfile } from "@/components/ShareProfile";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const u = userByHandle((await params).handle);
  if (!u) return { title: "Sealed" };
  const description = u.headline || u.bio?.slice(0, 150) || `${u.name} gets paid through Sealed: payments held by PayPal until the client approves.`;
  return { title: `${u.name} on Sealed`, description, openGraph: { title: `${u.name} on Sealed`, description, type: "profile" }, twitter: { card: "summary_large_image", title: `${u.name} on Sealed`, description } };
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });

/** A freelancer's public profile: who they are, where to find them, and what Sealed can vouch for. */
export default async function FreelancerProfile({ params }: { params: Promise<{ handle: string }> }) {
  const u = userByHandle((await params).handle);
  if (!u?.handle) notFound();
  const p = publicProfile(u);
  const s = p.stats;
  const url = `${config.appUrl}/u/${p.handle}`;

  return (
    <main className="pp">
      <article className="pp-card">
        <div className="pp-banner" style={p.banner ? { backgroundImage: `url(${p.banner})` } : undefined} aria-hidden />
        <div className="pp-head">
          <div className="pp-avatar">{p.avatar ? <img src={p.avatar} alt="" /> : <span>{initials(p.name)}</span>}</div>
          <div className="pp-actions">
            <ShareProfile url={url} name={p.name} className="btn btn-ghost" label="Share" />
          </div>
        </div>

        <div className="pp-body">
          <div className="pp-id">
            <h1>{p.name}</h1>
            {p.headline && <p className="pp-headline">{p.headline}</p>}
            <p className="tiny muted">On Sealed since {monthYear(p.memberSince)}</p>
          </div>

          {s.rating !== null && (
            <a href="#reviews" className="pp-rating">
              <Stars value={s.rating} size={18} />
              <strong>{s.rating.toFixed(1)}</strong>
              <span className="muted">
                {s.reviews.length} verified review{s.reviews.length === 1 ? "" : "s"}
              </span>
            </a>
          )}

          {p.bio && <p className="pp-bio">{p.bio}</p>}

          {p.socials.length > 0 && (
            <ul className="pp-socials" aria-label="Find me on">
              {p.socials.map((x) => (
                <li key={x.kind}>
                  <a href={x.url} target={x.kind === "email" ? undefined : "_blank"} rel="noopener noreferrer nofollow" className="pp-social" title={`${x.label}: ${x.text}`}>
                    <SocialIcon kind={x.kind} />
                    <span>{x.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <section className="pp-proof" aria-labelledby="pp-proof-h">
          <div className="pp-proof-head">
            <h2 id="pp-proof-h">Track record on Sealed</h2>
            <span className="pp-verified">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3.5 19 6v5.5c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6l7-2.5Z" /><path d="M8.8 12.2l2.2 2.2 4.2-4.4" /></svg>
              Verified by Sealed
            </span>
          </div>
          <dl className="pp-stats">
            <div><dt>Projects completed</dt><dd>{s.projectsCompleted}</dd></div>
            <div><dt>Stages paid via PayPal</dt><dd>{s.stagesPaid}</dd></div>
            <div><dt>Clients</dt><dd>{s.clients}</dd></div>
            <div><dt>Delivered on time</dt><dd>{s.onTime === null ? "–" : `${s.onTime}%`}</dd></div>
          </dl>
          <p className="tiny muted">These numbers come from payments PayPal processed through Sealed, not from anything the freelancer typed.</p>
        </section>

        <section className="pp-reviews" id="reviews" aria-labelledby="pp-rev-h">
          <h2 id="pp-rev-h">Reviews</h2>
          {s.reviews.length === 0 ? (
            <p className="muted small">No reviews yet. Only clients who paid through Sealed can leave one.</p>
          ) : (
            <ul>
              {s.reviews.map((r) => (
                <li key={r.projectId} className="pp-review">
                  <div className="pp-review-top">
                    <Stars value={r.rating} />
                    <span className="pp-paid">
                      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4.5 10.5l3.6 3.5 7.4-8" /></svg>
                      Paid through PayPal
                    </span>
                  </div>
                  {r.comment && <p>“{r.comment}”</p>}
                  <p className="tiny muted">
                    {r.client} · {r.project} · {new Date(r.at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="tiny muted">Only clients who approved and paid for work through Sealed can rate, once per project.</p>
        </section>
      </article>

      <footer className="pp-foot">
        <Link href="/" aria-label="Sealed">
          <Logo height={20} />
        </Link>
        <p className="tiny muted">Payments held by PayPal until the client approves the work.</p>
      </footer>
    </main>
  );
}
