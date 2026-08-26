import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

export const QUIPSLY_COACH_MONTHLY_PRICE = "$29.99";
export const QUIPSLY_COACH_ANNUAL_PRICE = "$299.99";
export const QUIPSLY_COACH_TRIAL_DAYS = 14;

const included = [
  "Unlimited client invitations",
  "Coaching calls on iPhone and the web",
  "Participant-owned recording and recovery",
  "Speaker-attributed transcripts",
  "Transcript correction and basic editing",
  "Editable notes, tasks, and goals",
  "Private client collaboration spaces",
];

export function CoachPricing({ compact = false }: { compact?: boolean }) {
  return (
    <section
      id="pricing"
      aria-labelledby="coach-pricing-title"
      className={compact ? "w-full" : "relative z-10 mx-auto max-w-7xl px-5 py-16 md:px-8"}
    >
      <div className="overflow-hidden rounded-[3rem] border border-[#d6bd91] bg-[#2d4f43] p-6 text-[#fff8ec] shadow-2xl shadow-[#173129]/20 md:p-10">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 font-sans text-xs font-black uppercase tracking-[0.18em] text-[#f4d58e]">
              <Sparkles className="h-4 w-4" />
              One complete coaching plan
            </div>
            <h2 id="coach-pricing-title" className="mt-5 font-serif text-4xl font-black leading-tight md:text-6xl">
              Your practice, without the software pile.
            </h2>
            <p className="mt-5 max-w-2xl font-sans text-base leading-8 text-[#f5e8d1]">
              Coaches subscribe. Clients join invited Sessions and collaborate free. Start with every coaching feature for {QUIPSLY_COACH_TRIAL_DAYS} days, then choose monthly or annual billing.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="https://nest.quipsly.com/login?callbackUrl=%2Fcoaching"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#f4d58e] px-6 py-3 font-sans text-sm font-black uppercase tracking-[0.12em] text-[#263f36] shadow-lg"
              >
                Start {QUIPSLY_COACH_TRIAL_DAYS}-day free trial
              </Link>
              <Link
                href="/support"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/25 bg-white/10 px-6 py-3 font-sans text-sm font-black uppercase tracking-[0.12em] text-white"
              >
                Ask a question
              </Link>
            </div>
            <p className="mt-4 font-sans text-xs leading-6 text-[#dfcfb6]">
              No charge during the trial. Subscriptions renew automatically until canceled. App Store pricing and availability can vary by region.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-[2rem] border border-white/15 bg-[#fffaf1] p-6 text-[#342315] shadow-xl">
              <p className="font-sans text-xs font-black uppercase tracking-[0.16em] text-[#8a6a39]">Monthly</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="font-serif text-5xl font-black">{QUIPSLY_COACH_MONTHLY_PRICE}</span>
                <span className="pb-2 font-sans text-sm text-[#745b3c]">/ month</span>
              </div>
              <p className="mt-3 font-sans text-sm leading-6 text-[#745b3c]">Full flexibility while you build your practice.</p>
            </article>
            <article className="rounded-[2rem] border border-[#f4d58e] bg-[#fffaf1] p-6 text-[#342315] shadow-xl ring-2 ring-[#f4d58e]/30">
              <p className="font-sans text-xs font-black uppercase tracking-[0.16em] text-[#315d4f]">Annual · save $59.89</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="font-serif text-5xl font-black">{QUIPSLY_COACH_ANNUAL_PRICE}</span>
                <span className="pb-2 font-sans text-sm text-[#745b3c]">/ year</span>
              </div>
              <p className="mt-3 font-sans text-sm leading-6 text-[#745b3c]">Equivalent to $25 per month, billed annually.</p>
            </article>
            <div className="rounded-[2rem] border border-white/15 bg-white/10 p-6 md:col-span-2">
              <p className="font-sans text-xs font-black uppercase tracking-[0.16em] text-[#f4d58e]">Everything included</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {included.map((item) => (
                  <div key={item} className="flex items-start gap-2 font-sans text-sm leading-6 text-[#fff8ec]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#f4d58e]" aria-hidden="true" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
