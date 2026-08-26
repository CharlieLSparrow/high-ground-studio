import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { CoachPricing } from "../components/CoachPricing";

export const metadata: Metadata = {
  title: "Pricing | Quipsly",
  description: "Simple Quipsly coaching pricing. Coaches subscribe and invited clients join free.",
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#f8efe0] px-5 py-8 text-[#342315] md:px-8">
      <nav className="mx-auto flex max-w-7xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="h-11 w-11 overflow-hidden rounded-2xl border border-[#e4cfaa] bg-white shadow-sm">
            <Image src="/quipsly-app-icon.png" alt="Quipsly" width={88} height={88} className="h-full w-full object-cover" priority />
          </span>
          <span className="font-serif text-2xl font-black">Quipsly</span>
        </Link>
        <Link href="/coaches" className="font-sans text-sm font-bold text-[#315d4f]">Quipsly for Coaches</Link>
      </nav>
      <div className="mx-auto max-w-7xl pb-4 pt-16 text-center">
        <p className="font-sans text-xs font-black uppercase tracking-[0.2em] text-[#8a6a39]">Simple pricing</p>
        <h1 className="mx-auto mt-3 max-w-4xl font-serif text-5xl font-black leading-tight md:text-7xl">Pay for the practice. Invite the people free.</h1>
        <p className="mx-auto mt-5 max-w-2xl font-sans text-lg leading-8 text-[#745b3c]">No per-client fee and no maze of feature tiers. The complete coaching workflow is included.</p>
      </div>
      <div className="mx-auto max-w-7xl py-10">
        <CoachPricing compact />
      </div>
    </main>
  );
}
