import type { Metadata } from "next";
import "./globals.css";
import MarketingScripts from "../components/analytics/MarketingScripts";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "QuipLore",
    template: "%s | QuipLore",
  },
  description:
    "Explore, save, verify, and curate quotes with source-aware Quote Passports.",
  alternates: {
    canonical: "./",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <MarketingScripts />
        {children}
      </body>
    </html>
  );
}
