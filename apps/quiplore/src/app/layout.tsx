import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "QuipLore",
    template: "%s | QuipLore",
  },
  description:
    "Explore, save, verify, and curate quotes with source-aware Quote Passports.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
