import type { Metadata } from "next";
import "./globals.css";
import SiteHeader from "@/components/site/SiteHeader";
import MarketingScripts from "@/components/analytics/MarketingScripts";
import Providers from "@/components/providers/Providers";
import { CartProvider } from "@/components/cart/CartContext";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "High Ground Odyssey",
  description: "Leadership, legacy, family, and the stories that shape us.",
  alternates: {
    canonical: "./",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <CartProvider>
            <SiteHeader />
            {children}
          </CartProvider>
        </Providers>
        <MarketingScripts />
      </body>
    </html>
  );
}
