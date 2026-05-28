"use client";

import { Heart, ShieldAlert } from "lucide-react";

export default function DonationPledgeBanner() {
  const isEnabled = process.env.NEXT_PUBLIC_DONATION_ENABLED === "true";
  const patreonUrl = process.env.NEXT_PUBLIC_PATREON_URL?.trim();
  const stripeUrl = process.env.NEXT_PUBLIC_DONATION_STRIPE_URL?.trim();

  if (!isEnabled || (!patreonUrl && !stripeUrl)) {
    return null;
  }

  return (
    <section className="relative overflow-hidden rounded-xl border border-teal-500/25 bg-[rgba(13,27,34,0.7)] p-6 shadow-lg text-center backdrop-blur-md">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-teal-950/20 via-transparent to-transparent pointer-events-none" />
      
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-teal-500/10 text-teal-400 mb-4 animate-pulse">
        <Heart className="size-6 fill-teal-500/20" />
      </div>

      <h4 className="text-lg font-bold text-slate-100 mb-2 font-mono">
        Support Our Independent Research
      </h4>
      
      <p className="text-xs leading-relaxed text-slate-450 max-w-sm mx-auto mb-6">
        AI Pulse Hub is fully funded by our readers. Help us keep our servers running and continue compiling deep agentic tutorials without paywalls or corporate bias.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row justify-center">
        {patreonUrl && (
          <a
            href={patreonUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 items-center justify-center rounded-lg bg-teal-500 px-6 text-xs font-bold text-slate-950 transition-all hover:bg-teal-400 hover:shadow-[0_0_16px_rgba(20,184,166,0.3)]"
          >
            Become a Patron
          </a>
        )}
        
        {stripeUrl && (
          <a
            href={stripeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/40 px-6 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-900"
          >
            One-time Donation
          </a>
        )}
      </div>
    </section>
  );
}
