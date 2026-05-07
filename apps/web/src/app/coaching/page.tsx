import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { canAccessInternalContent } from "@/lib/authz";
import { buildSignInHref } from "@/lib/content-access";
import { getLayoutVariantFromCookieStore } from "@/lib/layout-variant";
import {
  getLayoutPanelTreatment,
  getLayoutSurfaceBackground,
} from "@/lib/layout-variant-styles";
import { redirectToWelcomeIfNeeded } from "@/lib/server/welcome";

const COACHING_STEPS = [
  "Request a session",
  "Homer follows up personally",
  "Talk it through and find your footing",
];

function DetailCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <GlassPanel className="h-full p-6 text-[var(--text-light)]">
      <PageEyebrow>{title}</PageEyebrow>
      <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(245,239,230,0.92)]">
        {body}
      </p>
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

  const ctaHref = session?.user
    ? "/dashboard?intent=coaching"
    : buildSignInHref("/dashboard?intent=coaching");

  return (
    <main
      className={[
        "min-h-screen pb-20",
        getLayoutSurfaceBackground(layoutVariant, "coaching"),
      ].join(" ")}
    >
      <PageContainer className="pt-10">
        <div className="space-y-8">
          <section
            className={[
              "relative overflow-hidden rounded-[40px] border border-white/10 text-[var(--text-light)] shadow-[0_30px_90px_rgba(0,0,0,0.28)]",
              getLayoutPanelTreatment(layoutVariant, "featured"),
            ].join(" ")}
          >
            <div className="absolute inset-0">
              <Image
                src="/images/CoachingHero0.png"
                alt="Homer coaching portrait"
                fill
                priority
                className="object-cover object-center"
                sizes="100vw"
              />
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,12,14,0.92)_0%,rgba(3,12,14,0.80)_34%,rgba(3,12,14,0.45)_56%,rgba(3,12,14,0.24)_76%,rgba(3,12,14,0.39)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_38%,rgba(255,146,52,0.24),rgba(255,146,52,0.10)_28%,rgba(255,146,52,0)_56%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0)_24%,rgba(0,0,0,0.18)_100%)]" />

            <div className="relative min-h-[560px]">
              <div className="relative z-10 flex min-h-[560px] items-end">
                <div className="w-full p-7 md:p-10 lg:max-w-[820px] lg:p-14">
                  <PageEyebrow>Coaching with Homer</PageEyebrow>

                  <h1 className="m-0 mt-5 max-w-[720px] text-[clamp(3.1rem,8vw,6.8rem)] leading-[0.88] tracking-[-0.065em] text-[var(--text-light)]">
                    Find your footing.
                  </h1>

                  <p className="mb-0 mt-6 max-w-[700px] text-[1.12rem] leading-8 text-[rgba(245,239,230,0.96)] md:text-[1.18rem]">
                    When decisions get noisy, coaching with Homer gives you a
                    steady place to slow down, sort what matters, and choose a
                    next move you can actually stand on.
                  </p>

                  <p className="mb-0 mt-4 max-w-[700px] text-[1rem] leading-8 text-[rgba(245,239,230,0.84)]">
                    Donation-supported while Homer completes his coaching
                    credentialing hours. No fixed rate. After your session,
                    contribute what you can in a way that feels right and
                    sustainable.
                  </p>

                  <div className="mt-8">
                    <Link
                      href={ctaHref}
                      className="inline-flex rounded-full border border-flare/40 bg-flare/20 px-7 py-3.5 text-sm font-bold uppercase tracking-[0.1em] text-[var(--text-light)] no-underline transition hover:border-flare/55 hover:bg-flare/28"
                    >
                      Book a Session
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            {COACHING_STEPS.map((step, index) => (
              <GlassPanel
                key={step}
                className="px-5 py-4 text-[var(--text-light)]"
              >
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[rgba(245,239,230,0.62)]">
                  Step {index + 1}
                </div>
                <div className="mt-2 text-sm font-medium leading-6 text-[rgba(245,239,230,0.9)]">
                  {step}
                </div>
              </GlassPanel>
            ))}
          </section>

          <section className="grid gap-8 lg:grid-cols-3">
            <DetailCard
              title="What to bring"
              body="A decision, a transition, a leadership question, a hard conversation, or even just the sense that something important needs a little more light."
            />

            <DetailCard
              title="What happens next"
              body="Click Book a Session, sign in if needed, and send a short request from your member home. Homer will follow up personally about fit, timing, and the best next step."
            />

            <DetailCard
              title="Donation-supported"
              body="During this credentialing season, sessions do not have a fixed fee. After your session, contribute what you can in a way that fits your situation."
            />
          </section>

          <GlassPanel className="p-8 text-center text-[var(--text-light)] md:p-10">
            <PageEyebrow>Ready when you are</PageEyebrow>
            <h2 className="m-0 mt-4 text-[clamp(2rem,4vw,3rem)] leading-[0.95] tracking-[-0.05em] text-[var(--text-light)]">
              Start with a simple conversation.
            </h2>

            <div className="mt-7">
              <Link
                href={ctaHref}
                className="inline-flex rounded-full border border-flare/35 bg-flare/18 px-7 py-3.5 text-sm font-bold uppercase tracking-[0.1em] text-[var(--text-light)] no-underline transition hover:border-flare/50 hover:bg-flare/24"
              >
                Book a Session
              </Link>
            </div>
          </GlassPanel>

          {isTeam ? (
            <div className="flex justify-end">
              <Link
                href="/team/coaching-requests"
                className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
              >
                Team: View Coaching Requests
              </Link>
            </div>
          ) : null}
        </div>
      </PageContainer>
    </main>
  );
}
