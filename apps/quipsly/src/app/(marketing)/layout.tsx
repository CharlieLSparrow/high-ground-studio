import type { Metadata } from "next";
import { Inter, Merriweather } from "next/font/google";
import { Suspense } from "react";
import { GoogleOneTap } from "./components/GoogleOneTap";
import { QuipslyProductAnalytics } from "@/components/quipsly-product-analytics";
import "../globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const merriweather = Merriweather({ weight: ["300", "400", "700", "900"], subsets: ["latin"], variable: "--font-merriweather" });

export const metadata: Metadata = {
  title: "Quipsly - Research, Studio, and Tower for Creative Work",
  description: "Quipsly helps storytellers, coaches, trainers, and researchers gather sources, shape media and writing, and prepare publishing packets without losing the thread.",
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
        <QuipslyProductAnalytics measurementId={process.env.QUIPSLY_GA_MEASUREMENT_ID} />
        <Suspense fallback={null}>
          <GoogleOneTap />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
