import Link from "next/link";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { canAccessInternalContent } from "@/lib/authz";
import { buildSignInHref } from "@/lib/content-access";
import { getLayoutVariantFromCookieStore, type LayoutVariant } from "@/lib/layout-variant";
import { redirectToWelcomeIfNeeded } from "@/lib/server/welcome";

function PricingCard({
  title,
  price,
  subtitle,
  description,
  bullets,
  ctaHref,
  ctaLabel,
  featured = false,
  layoutVariant = "cinematic",
}: {
  title: string;
  price: string;
  subtitle: string;
  description: string;
  bullets: string[];
  ctaHref: string;
  ctaLabel: string;
  featured?: boolean;
  layoutVariant?: LayoutVariant;
}) {
  return (
    <GlassPanel
      glow={featured && layoutVariant !== "signal"}
      className={[
        "flex h-full flex-col p-6 text-[var(--text-light)]",
        featured
          ? layoutVariant === "editorial"
            ? "border-[rgba(255,244,225,0.25)] bg-[rgba(84,61,42,0.45)]"
            : layoutVariant === "signal"
              ? "border-white/12 bg-[rgba(255,255,255,0.04)]"
              : "border-[rgba(255,122,24,0.28)]"
          : "",
      ].join(" ")}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <PageEyebrow>{title}</PageEyebrow>
        {featured ? (
          <span
            className={[
              "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em]",
              layoutVariant === "editorial"
                ? "border border-[rgba(255,244,225,0.22)] bg-[rgba(255,244,225,0.08)] text-[rgba(255,244,225,0.9)]"
                : layoutVariant === "signal"
                  ? "border border-white/14 bg-white/6 text-[rgba(230,236,238,0.92)]"
                  : "border border-flare/30 bg-flare/15 text-flare",
            ].join(" ")}
          >
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

      <div className="mt-6">
        <Link
          href={ctaHref}
          className={[
            "inline-flex w-full items-center justify-center rounded-full border px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] no-underline transition",
            featured
              ? "border-flare/35 bg-flare/18 text-[var(--text-light)] hover:border-flare/50 hover:bg-flare/24"
              : "border-white/12 bg-white/8 text-[var(--text-light)] hover:border-flare/30 hover:text-[var(--accent)]",
          ].join(" ")}
        >
          {ctaLabel}
        </Link>
      </div>
    </GlassPanel>
  );
}

export default async function CoachingPage() {
  const session = await auth();
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const isTeam = canAccessInternalContent(roles);
  const cookieStore = await cookies();
  const layoutVariant = getLayoutVariantFromCookieStore(cookieStore, isTeam);

  redirectToWelcomeIfNeeded(session, "/coaching");

  const primaryCtaHref = session?.user
    ? "/dashboard"
    : buildSignInHref("/coaching");

  const primaryCtaLabel = session?.user ? "Go to dashboard" : "Sign in to begin";

  return (
    <main
      className={[
        "min-h-screen pb-20",
        layoutVariant === "editorial"
          ? "bg-[linear-gradient(180deg,#17110d_0%,#3a2a21_24%,#765438_62%,#f1e5d2_100%)]"
          : layoutVariant === "signal"
            ? "bg-[linear-gradient(180deg,#0b1216_0%,#131f26_20%,#1f2f37_48%,#dbe3e5_100%)]"
            : "bg-[linear-gradient(180deg,#08171b_0%,#10272d_16%,#18383d_40%,#6f5636_78%,#f3eadb_100%)]",
      ].join(" ")}
    >
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
              resilience, and the stories that shape who we become. The public
              front door is centered on two recurring coaching rhythms so you
              can step back, get perspective, and move forward with intention.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={primaryCtaHref}
                className="rounded-full border border-flare/35 bg-flare/18 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/50 hover:bg-flare/24"
              >
                {primaryCtaLabel}
              </Link>

              <Link
                href="/team/appointments"
                className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
              >
                Team booking console
              </Link>
            </div>
          </GlassPanel>

          <section className="grid gap-8 lg:grid-cols-2">
            <PricingCard
              title="1 Session / Month"
              price="$57"
              subtitle="Per month"
              description="A steady monthly rhythm for people who want ongoing support without overcomplicating their calendar or budget."
              bullets={[
                "One coaching session each month",
                "Predictable monthly cadence and pricing",
                "Great for steady progress and reflection",
              ]}
              ctaHref={primaryCtaHref}
              ctaLabel="Start monthly coaching"
              featured
              layoutVariant={layoutVariant}
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
              ctaHref={primaryCtaHref}
              ctaLabel="Start twice-monthly coaching"
              layoutVariant={layoutVariant}
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
              <PageEyebrow>How it works</PageEyebrow>

              <h2 className="m-0 mt-3 text-[1.7rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                A simple path in, then a real client portal later
              </h2>

              <div className="mt-5 space-y-4 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
                <p className="m-0">
                  Right now, the cleanest flow is to sign in, choose the
                  recurring coaching rhythm that fits, and let the team finalize
                  scheduling and membership on the back end.
                </p>

                <p className="m-0">
                  This page is the public offer layer. The internal team console
                  already supports clients, memberships, and appointments, and
                  the client dashboard is in place for viewing what’s active.
                </p>

                <p className="m-0">
                  Checkout automation is the next major layer. Until then, this
                  gives you a real and presentable coaching front door without
                  pretending the payment system is done before it actually is.
                </p>
              </div>
            </GlassPanel>
          </section>
        </div>
      </PageContainer>
    </main>
  );
}
