import Link from "next/link";

import { auth } from "@/auth";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";

function PricingCard({
  title,
  price,
  subtitle,
  description,
  bullets,
  offerKey,
  featured = false,
}: {
  title: string;
  price: string;
  subtitle: string;
  description: string;
  bullets: string[];
  offerKey: "single-session" | "monthly-1" | "monthly-2";
  featured?: boolean;
}) {
  return (
    <GlassPanel
      glow={featured}
      className={[
        "flex h-full flex-col p-6 text-[var(--text-light)]",
        featured ? "border-[rgba(255,122,24,0.28)]" : "",
      ].join(" ")}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <PageEyebrow>{title}</PageEyebrow>
        {featured ? (
          <span className="rounded-full border border-flare/30 bg-flare/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-flare">
            Most Popular
          </span>
        ) : null}
      </div>

      <div className="text-[2.2rem] font-black tracking-[-0.04em] text-[var(--text-light)]">
        {price}
      </div>

      <div className="mt-1 text-sm font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
        {subtitle}
      </div>

      <p className="mb-0 mt-4 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
        {description}
      </p>

      <ul className="mb-0 mt-5 space-y-3 pl-5 text-[0.95rem] leading-7 text-[rgba(245,239,230,0.88)]">
        {bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>

      <form action="/api/stripe/checkout" method="POST" className="mt-6">
        <input type="hidden" name="offer" value={offerKey} />
        <button
          type="submit"
          className={[
            "inline-flex w-full items-center justify-center rounded-full border px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] transition",
            featured
              ? "border-flare/35 bg-flare/18 text-[var(--text-light)] hover:border-flare/50 hover:bg-flare/24"
              : "border-white/12 bg-white/8 text-[var(--text-light)] hover:border-flare/30 hover:text-[var(--accent)]",
          ].join(" ")}
        >
          Choose this plan
        </button>
      </form>
    </GlassPanel>
  );
}

export default async function CoachingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  const { error } = await searchParams;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#08171b_0%,#10272d_16%,#18383d_40%,#6f5636_78%,#f3eadb_100%)] pb-20">
      <PageContainer className="pt-10">
        <div className="space-y-8">
          <GlassPanel className="p-6 text-[var(--text-light)]">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <PageEyebrow>Coaching</PageEyebrow>
              <PageEyebrow>Leadership</PageEyebrow>
              <PageEyebrow>Growth</PageEyebrow>
            </div>

            <h1 className="m-0 max-w-[920px] text-[clamp(2.6rem,6vw,5rem)] leading-[0.96] tracking-[-0.05em] text-[var(--text-light)]">
              Coaching for people trying to lead better, think better, and live a little more on purpose.
            </h1>

            <p className="mb-0 mt-5 max-w-[840px] text-[1.05rem] leading-8 text-[rgba(245,239,230,0.9)]">
              This is practical coaching rooted in leadership, reflection,
              resilience, and the stories that shape who we become. Whether you
              want one focused conversation or an ongoing rhythm of support,
              this gives you a place to step back, get perspective, and move
              forward with intention.
            </p>

            {error ? (
              <div className="mt-6 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm font-medium text-red-100">
                Something went wrong starting checkout. Double-check your Stripe
                price IDs and try again.
              </div>
            ) : null}

            {!session?.user ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm leading-7 text-[rgba(245,239,230,0.88)]">
                You can check out as a guest, but signing in first makes it much
                easier for the team to connect your purchase to your dashboard
                and upcoming coaching appointments.
              </div>
            ) : null}
          </GlassPanel>

          <section className="grid gap-8 lg:grid-cols-3">
            <PricingCard
              title="Single Session"
              price="$65"
              subtitle="One-time"
              description="A focused one-off coaching session for clarity, direction, or a specific challenge you want to work through."
              bullets={[
                "One coaching session",
                "Best for a specific question or decision",
                "Simple entry point if you want to try it first",
              ]}
              offerKey="single-session"
            />

            <PricingCard
              title="1 Session / Month"
              price="$57"
              subtitle="Per month"
              description="A steady monthly rhythm for people who want ongoing support without overcomplicating their calendar or budget."
              bullets={[
                "One coaching session each month",
                "Lower monthly rate than a one-off session",
                "Great for steady progress and reflection",
              ]}
              offerKey="monthly-1"
              featured
            />

            <PricingCard
              title="2 Sessions / Month"
              price="$97"
              subtitle="Per month"
              description="For people who want more accountability, more momentum, and a tighter cadence of coaching conversations."
              bullets={[
                "Two coaching sessions each month",
                "Best for active growth seasons",
                "More support, more check-ins, more momentum",
              ]}
              offerKey="monthly-2"
            />
          </section>

          <section className="grid gap-8 lg:grid-cols-2">
            <GlassPanel className="p-6 text-[var(--text-light)]">
              <PageEyebrow>What this is for</PageEyebrow>

              <h2 className="m-0 mt-3 text-[1.7rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                Coaching that helps you step back and see clearly
              </h2>

              <ul className="mb-0 mt-5 space-y-3 pl-5 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
                <li>Leadership growth and self-awareness</li>
                <li>Decision-making under pressure or uncertainty</li>
                <li>Personal direction, motivation, and accountability</li>
                <li>Reflection around identity, purpose, and next steps</li>
                <li>Honest conversations with practical momentum afterward</li>
              </ul>
            </GlassPanel>

            <GlassPanel className="p-6 text-[var(--text-light)]">
              <PageEyebrow>What happens after checkout</PageEyebrow>

              <h2 className="m-0 mt-3 text-[1.7rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                The team gets you into the system fast
              </h2>

              <div className="mt-5 space-y-4 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
                <p className="m-0">
                  Checkout is now real. After purchase, the next layer is syncing
                  Stripe back into your membership and scheduling system
                  automatically.
                </p>

                <p className="m-0">
                  In the short term, the team can already manage clients,
                  memberships, and appointments on the back end, so nothing has
                  to wait for perfect automation to start being useful.
                </p>

                <p className="m-0">
                  The next technical step is wiring Stripe webhooks so purchases
                  automatically create or update the right membership in your app.
                </p>
              </div>
            </GlassPanel>
          </section>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
            >
              Client dashboard
            </Link>

            <Link
              href="/team/clients"
              className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
            >
              Team console
            </Link>
          </div>
        </div>
      </PageContainer>
    </main>
  );
}