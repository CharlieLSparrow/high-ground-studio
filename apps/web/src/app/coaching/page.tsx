import Link from "next/link";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { canAccessInternalContent } from "@/lib/authz";
import { buildSignInHref } from "@/lib/content-access";
import { getLayoutVariantFromCookieStore, type LayoutVariant } from "@/lib/layout-variant";
import {
  getLayoutGlowEnabled,
  getLayoutPanelTreatment,
  getLayoutSurfaceBackground,
} from "@/lib/layout-variant-styles";
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
      glow={featured && getLayoutGlowEnabled(layoutVariant)}
      className={[
        "flex h-full flex-col p-6 text-[var(--text-light)]",
        featured ? getLayoutPanelTreatment(layoutVariant, "featured") : "",
      ].join(" ")}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <PageEyebrow>{title}</PageEyebrow>
        {featured ? (
          <span
            className={[
              "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em]",
              getLayoutPanelTreatment(layoutVariant, "featuredBadge"),
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

  const primaryCtaLabel = session?.user ? "Open member home" : "Join / sign in to begin";

  return (
    <main
      className={[
        "min-h-screen pb-20",
        getLayoutSurfaceBackground(layoutVariant, "coaching"),
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
              Coaching for people trying to lead with more clarity, steadiness, and intention.
            </h1>

            <p className="mb-0 mt-5 max-w-[840px] text-[1.05rem] leading-8 text-[rgba(245,239,230,0.9)]">
              This is practical coaching rooted in leadership, reflection,
              resilience, and the stories that shape who we become. Choose the
              coaching rhythm that fits your season, and we will follow up
              directly to confirm fit, scheduling, and next steps.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={primaryCtaHref}
                className="rounded-full border border-flare/35 bg-flare/18 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/50 hover:bg-flare/24"
              >
                {primaryCtaLabel}
              </Link>

              {isTeam ? (
                <Link
                  href="/team/appointments"
                  className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
                >
                  Open studio scheduling
                </Link>
              ) : (
                <Link
                  href="/library"
                  className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
                >
                  Explore the library
                </Link>
              )}
            </div>
          </GlassPanel>

          <section className="grid gap-8 lg:grid-cols-2">
            <PricingCard
              title="1 Session / Month"
              price="$57"
              subtitle="Per month"
              description="A steady monthly rhythm for leaders who want regular support, honest reflection, and practical momentum without crowding the calendar."
              bullets={[
                "One coaching session each month",
                "Predictable monthly cadence and pricing",
                "Great for steady progress and reflection",
              ]}
              ctaHref={primaryCtaHref}
              ctaLabel="Choose this rhythm"
              featured
              layoutVariant={layoutVariant}
            />

            <PricingCard
              title="2 Sessions / Month"
              price="$97"
              subtitle="Per month"
              description="For seasons that need closer support, more accountability, and a tighter coaching cadence."
              bullets={[
                "Two coaching sessions each month",
                "Best for active growth seasons",
                "More support, more check-ins, more momentum",
              ]}
              ctaHref={primaryCtaHref}
              ctaLabel="Choose this rhythm"
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
                <li>Honest conversations that turn into practical next steps</li>
              </ul>
            </GlassPanel>

            <GlassPanel className="p-6 text-[var(--text-light)]">
              <PageEyebrow>How it works</PageEyebrow>

              <h2 className="m-0 mt-3 text-[1.7rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                A direct start, with real human follow-through
              </h2>

              <div className="mt-5 space-y-4 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
                <p className="m-0">
                  Coaching enrollment currently begins with a direct
                  conversation so we can match the right rhythm, confirm fit,
                  and coordinate scheduling well.
                </p>

                <p className="m-0">
                  After you choose a coaching rhythm, we will follow up directly
                  to confirm timing, expectations, and the best next step for
                  your situation.
                </p>

                <p className="m-0">
                  Once you are inside, your member home keeps the essentials in
                  one place so the coaching relationship stays clear, calm, and
                  easy to navigate.
                </p>
              </div>
            </GlassPanel>
          </section>
        </div>
      </PageContainer>
    </main>
  );
}
