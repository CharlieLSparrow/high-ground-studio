import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import MarketingScripts from "../components/analytics/MarketingScripts";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Aperture & Light | Creative Photography & Visual Guides",
    template: "%s | Aperture & Light",
  },
  description:
    "Discover professional lighting guides, gear breakdowns, camera settings manuals, and visually stunning landscape/portrait portfolios.",
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
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stone-950 text-stone-100 selection:bg-amber-400 selection:text-stone-950 font-sans">
        <MarketingScripts />
        {children}
      </body>
    </html>
  );
}
