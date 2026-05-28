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
    <section className="relative overflow-hidden rounded-xl border border-amber-500/25 bg-[rgba(28,25,23,0.7)] p-6 shadow-lg text-center backdrop-blur-md">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-amber-950/20 via-transparent to-transparent pointer-events-none" />
      
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-400 mb-4 animate-pulse">
        <Heart className="size-6 fill-amber-500/20" />
      </div>

      <h4 className="font-serif text-lg font-bold text-stone-100 mb-2">
        Support Aperture & Light
      </h4>
      
      <p className="text-xs leading-relaxed text-stone-400 max-w-sm mx-auto mb-6">
        Aperture & Light is an independent photography journal. Help us maintain our testing studios and deliver ad-free camera journals and lighting manuals.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row justify-center font-mono">
        {patreonUrl && (
          <a
            href={patreonUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 items-center justify-center rounded-lg bg-amber-400 px-6 text-xs font-bold text-stone-950 transition-all hover:bg-amber-300 hover:shadow-[0_0_16px_rgba(251,191,36,0.3)]"
          >
            Become a Patron
          </a>
        )}
        
        {stripeUrl && (
          <a
            href={stripeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 items-center justify-center rounded-lg border border-stone-800 bg-stone-900/40 px-6 text-xs font-semibold text-stone-200 transition-all hover:bg-stone-900"
          >
            One-time Donation
          </a>
        )}
      </div>
    </section>
  );
}
