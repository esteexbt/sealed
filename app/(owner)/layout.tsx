import Link from "next/link";
import { redirect } from "next/navigation";
import { isOwner } from "@/lib/auth";
import { paypalMode, aiMode } from "@/lib/config";
import { BottomNav, Nav } from "@/components/Nav";
import { Logo } from "@/components/Seal";
import { DialogProvider } from "@/components/Dialog";

export const dynamic = "force-dynamic";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  if (!(await isOwner())) redirect("/login");
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
      </header>
      <main className="page">{children}</main>
      <BottomNav />
    </DialogProvider>
  );
}
