import Link from "next/link";
import { redirect } from "next/navigation";
import { isOwner } from "@/lib/auth";
import { paypalMode, aiMode } from "@/lib/config";
import { Nav } from "@/components/Nav";
import { Seal } from "@/components/Seal";
import { DialogProvider } from "@/components/Dialog";

export const dynamic = "force-dynamic";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  if (!(await isOwner())) redirect("/login");
  return (
    <DialogProvider>
      <header className="topbar">
        <Link href="/" className="wordmark">
          <Seal size={30} />
          Sealed AI
        </Link>
        <Nav />
        <span className="mode-pill" title="Payment and AI mode">
          {paypalMode === "sandbox" ? "PayPal sandbox" : "PayPal simulation"}, {aiMode === "offline" ? "offline AI" : "live AI"}
        </span>
        <Link href="/new" className="btn btn-ink">New project</Link>
      </header>
      <main className="page">{children}</main>
    </DialogProvider>
  );
}
