import Link from "next/link";
import { pageUser } from "@/lib/auth";
import { paypalMode, aiMode } from "@/lib/config";
import { BottomNav, Nav } from "@/components/Nav";
import { Logo } from "@/components/Seal";
import { DialogProvider } from "@/components/Dialog";

export const dynamic = "force-dynamic";

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser();
  return (
    <DialogProvider>
      <header className="topbar">
        <Link href="/" className="wordmark" aria-label="Sealed home">
          <Logo height={30} />
        </Link>
        <Nav />
        <span className="mode-pill" title="Payment and AI mode">
          {paypalMode === "sandbox" ? "PayPal sandbox" : "PayPal simulation"}, {aiMode === "offline" ? "offline AI" : "live AI"}
        </span>
        <Link href="/new" className="btn btn-ink topbar-new">New project</Link>
        <Link href="/profile" className="avatar-link" aria-label={`Your profile: ${user.name}`} title={user.name}>
          <span className="avatar" aria-hidden>{initials(user.name)}</span>
        </Link>
      </header>
      <main className="page">{children}</main>
      <BottomNav initials={initials(user.name)} />
    </DialogProvider>
  );
}
