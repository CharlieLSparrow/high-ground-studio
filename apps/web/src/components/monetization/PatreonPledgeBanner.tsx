"use client";

import { Heart } from "lucide-react";

export default function PatreonPledgeBanner() {
  const isEnabled = process.env.NEXT_PUBLIC_DONATION_ENABLED === "true";
  const patreonUrl = process.env.NEXT_PUBLIC_PATREON_URL?.trim();
  const stripeUrl = process.env.NEXT_PUBLIC_DONATION_STRIPE_URL?.trim();

  if (!isEnabled || (!patreonUrl && !stripeUrl)) {
    return null;
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/45 p-8 shadow-xl text-center backdrop-blur-md">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-amber-500/5 via-transparent to-transparent pointer-events-none" />
      
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-white/5 text-amber-500 mb-5 animate-pulse">
        <Heart className="size-6 fill-amber-500/10" />
      </div>

      <h3 className="text-xl font-bold text-amber-50 mb-2 tracking-wide font-sans">
        Support High Ground Odyssey
      </h3>
      
      <p className="text-sm leading-relaxed text-slate-400 max-w-md mx-auto mb-6">
        Our stories, leadership guides, and lessons are funded directly by readers. Help us capture these narratives and maintain our creative libraries.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row justify-center font-semibold">
        {patreonUrl && (
          <a
            href={patreonUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 items-center justify-center rounded-xl bg-amber-500 px-8 text-xs text-slate-950 transition-all hover:bg-amber-400 hover:shadow-[0_0_24px_rgba(245,158,11,0.25)]"
          >
            Become a Patron
          </a>
        )}
        
        {stripeUrl && (
          <a
            href={stripeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-8 text-xs text-slate-200 transition-all hover:bg-white/10"
          >
            One-time Donation
          </a>
        )}
      </div>
    </section>
  );
}
