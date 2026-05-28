import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import MarketingScripts from "../components/analytics/MarketingScripts";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Studio Cut Lab | Advanced Video Editing & Color Grading logs",
    template: "%s | Studio Cut Lab",
  },
  description:
    "Learn high-performance video editing workflows, color grading LUT mechanics, Insta360 workflows, and youtube pacing strategies.",
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
      className={`${inter.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 selection:bg-rose-500 selection:text-zinc-950 font-sans">
        <MarketingScripts />
        {children}
      </body>
    </html>
  );
}
