import type { Metadata } from "next";
import { SiteHeader } from "@/components/design/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ICSJ FFL",
    template: "%s | ICSJ FFL",
  },
  description:
    "Ten seasons of ICSJ fantasy football history, records, and weekly stories.",
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
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
