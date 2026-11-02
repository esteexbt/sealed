import Link from "next/link";

/** Small footer links to the public pages. */
export function LegalLinks() {
  return (
    <nav className="legal-links tiny" aria-label="About Sealed">
      <Link href="/how-it-works">How payments work</Link>
      <Link href="/terms">Terms</Link>
      <Link href="/privacy">Privacy</Link>
    </nav>
  );
}
