import type { Metadata } from "next";
import { Inter, Merriweather } from "next/font/google";
import "../globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const merriweather = Merriweather({ weight: ["300", "400", "700", "900"], subsets: ["latin"], variable: "--font-merriweather" });

export const metadata: Metadata = {
  title: "Quipsly - The AI Operating System for Content Creators",
  description: "From pre-production storyboarding to AI-generated marketing funnels, Quipsly is the all-in-one suite to orchestrate your entire digital empire.",
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
