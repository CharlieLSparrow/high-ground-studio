import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import MarketingScripts from "../components/analytics/MarketingScripts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "AI Pulse Hub | Advanced AI & Machine Learning Research Logs",
    template: "%s | AI Pulse Hub",
  },
  description:
    "Explore dynamic research logs, deep learning guides, AI agent setups, and professional studies in advanced agentic workflows.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 selection:bg-teal-500 selection:text-slate-950">
        <MarketingScripts />
        {children}
      </body>
    </html>
  );
}
