"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Projects" },
  { href: "/ledger", label: "Ledger" },
  { href: "/assistant", label: "Assistant" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" || path.startsWith("/projects") : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

const I = {
  projects: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-10Z" />,
  ledger: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M9.5 9.5v10" />
    </>
  ),
  assistant: (
    <>
      <path d="M12 3.5l1.8 4.7 4.7 1.8-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.8L12 3.5Z" />
      <path d="M18 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" />
    </>
  ),
};
const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

/** Phone navigation: a tab bar fixed to the bottom of the screen, with New project in the middle. */
export function BottomNav() {
  const path = usePathname();
  const tab = (href: string, label: string, icon: React.ReactNode) => {
    const active = href === "/" ? path === "/" || path.startsWith("/projects") : path.startsWith(href);
    return (
      <Link href={href} className="tab" aria-current={active ? "page" : undefined}>
        <Icon>{icon}</Icon>
        <span>{label}</span>
      </Link>
    );
  };
  return (
    <nav className="tabbar" aria-label="Main">
      {tab("/", "Projects", I.projects)}
      {tab("/ledger", "Ledger", I.ledger)}
      <Link href="/new" className="tab tab-new" aria-current={path.startsWith("/new") ? "page" : undefined}>
        <span className="tab-plus" aria-hidden>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <span>New</span>
      </Link>
      {tab("/assistant", "Assistant", I.assistant)}
    </nav>
  );
}
