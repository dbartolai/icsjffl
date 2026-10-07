import Link from "next/link";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ICSJ FFL | League dashboard",
  description: "Your fantasy football league, standings, and weekly matchups.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div className="topbar">
          <div className="shell topbar-inner">
            <Link className="brand" href="/" aria-label="ICSJ FFL home">
              <span className="brand-icon" aria-hidden="true">
                Ⅲ
              </span>
              ICSJ<span className="muted font-normal">FFL</span>
            </Link>
            <nav aria-label="Dashboard sections">
              <Link href="/#standings">Standings</Link>
              <Link href="/#matchups">Matchups</Link>
              <Link href="/#teams">Teams</Link>
            </nav>
            <span className="season-label">
              SEASON <strong>2026</strong>
            </span>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
