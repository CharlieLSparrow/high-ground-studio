"use client";

import { Heart } from "lucide-react";

export default function DonationPledgeBanner() {
  const isEnabled = process.env.NEXT_PUBLIC_DONATION_ENABLED === "true";
  const patreonUrl = process.env.NEXT_PUBLIC_PATREON_URL?.trim();
  const stripeUrl = process.env.NEXT_PUBLIC_DONATION_STRIPE_URL?.trim();

  if (!isEnabled || (!patreonUrl && !stripeUrl)) {
    return null;
  }

  return (
    <section className="relative overflow-hidden rounded-xl border border-rose-500/25 bg-[rgba(24,24,27,0.7)] p-6 shadow-lg text-center backdrop-blur-md">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-rose-950/20 via-transparent to-transparent pointer-events-none" />
      
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 mb-4 animate-pulse">
        <Heart className="size-6 fill-rose-500/20" />
      </div>

      <h4 className="font-display text-lg font-bold text-zinc-100 mb-2 uppercase tracking-wide">
        Support Studio Cut Lab
      </h4>
      
      <p className="text-xs leading-relaxed text-zinc-400 max-w-sm mx-auto mb-6">
        Studio Cut Lab is a non-profit editorial workflow station. Help us research attention pacing models and deliver ad-free grading tutorials.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row justify-center font-mono">
        {patreonUrl && (
          <a
            href={patreonUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 items-center justify-center rounded-lg bg-rose-500 px-6 text-xs font-bold text-zinc-950 transition-all hover:bg-rose-450 hover:shadow-[0_0_16px_rgba(244,63,94,0.3)]"
          >
            Become a Patron
          </a>
        )}
        
        {stripeUrl && (
          <a
            href={stripeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 items-center justify-center rounded-lg border border-zinc-850 bg-zinc-900/40 px-6 text-xs font-semibold text-zinc-200 transition-all hover:bg-zinc-900"
          >
            One-time Donation
          </a>
        )}
      </div>
    </section>
  );
}
