import type { Metadata } from "next";
import { Inter, Merriweather } from "next/font/google";
import "../globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const merriweather = Merriweather({ weight: ["300", "400", "700", "900"], subsets: ["latin"], variable: "--font-merriweather" });

export const metadata: Metadata = {
  title: "Quipsly - Research, Writing, Media, and Publishing Nests",
  description: "Quipsly is a living workspace for authors, researchers, podcasters, and creators: organize sources, write manuscripts, prepare media, and publish from one Nest.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/quipsly-icon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${merriweather.variable}`}>
      <body className="font-sans bg-[#032321] text-studio-ink antialiased">
        {children}
      </body>
    </html>
  );
}
