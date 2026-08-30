import type { Metadata } from "next";
import { Inter, Merriweather } from "next/font/google";

import { QuipslyProductAnalytics } from "@/components/quipsly-product-analytics";

import "../globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const merriweather = Merriweather({
  weight: ["300", "400", "700", "900"],
  subsets: ["latin"],
  variable: "--font-merriweather",
});

export const metadata: Metadata = {
  title: "Quipsly Capture",
  description: "Open Quipsly Capture or continue your work in the browser.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/quipsly-icon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function CaptureHandoffLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${merriweather.variable}`}>
      <body className="bg-[#fffaf2] font-sans text-[#392d20] antialiased">
        <QuipslyProductAnalytics measurementId={process.env.QUIPSLY_GA_MEASUREMENT_ID} />
        {children}
      </body>
    </html>
  );
}
