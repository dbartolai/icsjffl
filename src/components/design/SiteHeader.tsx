"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home", enabled: true },
  { href: "/history", label: "History", enabled: true },
  { href: "/chronicle", label: "Chronicle", enabled: false },
  { href: "/trade-room", label: "Trade Room", enabled: false },
  { href: "/payouts", label: "Payouts", enabled: false },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <Link className="brand" href="/" aria-label="ICSJ FFL home">
          <span className="brand-monogram" aria-hidden="true">
            I
          </span>
          <span>ICSJ FFL</span>
          <span className="brand-year">Year 10</span>
        </Link>
        <nav className="primary-nav" aria-label="Primary navigation">
          {links.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return link.enabled ? (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
              </Link>
            ) : (
              <span key={link.href} aria-disabled="true" title="Coming soon">
                {link.label}
              </span>
            );
          })}
        </nav>
        <div className="season-switcher" aria-label="Current season">
          <span>Season</span>
          <strong>2026</strong>
        </div>
      </div>
    </header>
  );
}
