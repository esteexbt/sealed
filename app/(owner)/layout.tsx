import Link from "next/link";
import { pageUser } from "@/lib/auth";
import { paypalMode, aiMode } from "@/lib/config";
import { BottomNav, Nav } from "@/components/Nav";
import { Logo } from "@/components/Seal";
import { DialogProvider } from "@/components/Dialog";
import { AccountMenu } from "@/components/AccountMenu";

export const dynamic = "force-dynamic";

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser();
  // Shown quietly in the account menu: whether payments are real sandbox ones and the AI is live.
  const status = `${paypalMode === "sandbox" ? "PayPal sandbox" : "PayPal simulation"} · ${aiMode === "offline" ? "offline AI" : "live AI"}`;
  const avatar = user.handle && user.avatarKey ? `/api/u/${user.handle}/image/avatar?v=${user.imageVersion || 0}` : null;
  return (
    <DialogProvider>
      <header className="topbar">
        <Link href="/" className="wordmark" aria-label="Sealed home">
          <Logo height={30} />
        </Link>
        <Nav />
        <div className="topbar-end">
          <Link href="/new" className="btn btn-ink topbar-new">New project</Link>
          <AccountMenu name={user.name} email={user.email} initials={initials(user.name)} avatar={avatar} status={status} />
        </div>
      </header>
      <main className="page">{children}</main>
      <BottomNav account={<AccountMenu variant="tab" name={user.name} email={user.email} initials={initials(user.name)} avatar={avatar} status={status} />} />
    </DialogProvider>
  );
}
