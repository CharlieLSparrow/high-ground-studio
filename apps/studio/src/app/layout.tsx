import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "High Ground Studio",
  description: "Private semantic workbench for source-aware creative work.",
  robots: {
    index: false,
    follow: false,
  },
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
