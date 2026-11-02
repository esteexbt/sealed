import Link from "next/link";
import { Logo } from "./Seal";
import { LegalLinks } from "./LegalLinks";

/** A simple, readable page for public information: how it works, terms, privacy. */
export function DocPage({ title, lede, updated, children }: { title: string; lede?: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="doc">
      <header className="doc-top">
        <Link href="/" aria-label="Sealed home"><Logo height={26} /></Link>
      </header>
      <main className="doc-main">
        <h1>{title}</h1>
        {lede && <p className="doc-lede">{lede}</p>}
        {updated && <p className="tiny muted">Last updated {updated}</p>}
        <div className="doc-body">{children}</div>
      </main>
      <footer className="doc-foot">
        <LegalLinks />
      </footer>
    </div>
  );
}
