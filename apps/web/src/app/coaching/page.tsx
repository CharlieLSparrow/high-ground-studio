import Link from "next/link";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { canAccessInternalContent } from "@/lib/authz";
import { buildSignInHref } from "@/lib/content-access";
import { getLayoutVariantFromCookieStore } from "@/lib/layout-variant";
import {
  getLayoutGlowEnabled,
  getLayoutPanelTreatment,
  getLayoutSurfaceBackground,
} from "@/lib/layout-variant-styles";
import { redirectToWelcomeIfNeeded } from "@/lib/server/welcome";

function DetailCard({
  title,
  body,
  featured = false,
  glow = false,
  panelTreatment = "",
}: {
  title: string;
  body: string;
  featured?: boolean;
  glow?: boolean;
  panelTreatment?: string;
}) {
  return (
    <GlassPanel
      glow={glow}
      className={[
        "p-6 text-[var(--text-light)]",
        featured ? panelTreatment : "",
      ].join(" ")}
    >
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
          <GlassPanel
            glow={getLayoutGlowEnabled(layoutVariant)}
            className={[
              "overflow-hidden p-6 text-[var(--text-light)] md:p-8",
              getLayoutPanelTreatment(layoutVariant, "featured"),
            ].join(" ")}
          >
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-center">
              <div>
                <div className="mb-5 flex flex-wrap items-center gap-3">
                  <PageEyebrow>Coaching with Scott Sparrow</PageEyebrow>
                  <PageEyebrow>Donation Supported</PageEyebrow>
                </div>

                <h1 className="m-0 max-w-[860px] text-[clamp(2.9rem,7vw,6.1rem)] leading-[0.9] tracking-[-0.06em] text-[var(--text-light)]">
                  Calm, practical coaching for people trying to lead well.
                </h1>

                <p className="mb-0 mt-6 max-w-[760px] text-[1.1rem] leading-8 text-[rgba(245,239,230,0.96)]">
                  Leadership gets noisy fast. Coaching gives you a place to slow down, name what matters, and take the next step with more clarity, steadiness, and intention.
                </p>

                <p className="mb-0 mt-4 max-w-[760px] text-[1rem] leading-8 text-[rgba(245,239,230,0.84)]">
                  Scott is currently completing paid coaching hours for credentialing. During this season there is no fixed fee. After a session, you are invited to give whatever amount feels appropriate and sustainable for you.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href={ctaHref}
                    className="rounded-full border border-flare/35 bg-flare/18 px-6 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/50 hover:bg-flare/24"
                  >
                    Book a Session
                  </Link>

                  <Link
                    href="/dashboard"
                    className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
                  >
                    Member Home
                  </Link>

                  {isTeam ? (
                    <Link
                      href="/team/coaching-requests"
                      className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
                    >
                      View Requests
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,122,24,0.2),rgba(255,255,255,0.07)_36%,rgba(255,255,255,0.04)_100%)] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
                <div className="flex min-h-[420px] flex-col justify-between rounded-[30px] border border-dashed border-white/14 bg-[#08171b]/55 p-6">
                  <div>
                    <PageEyebrow>Hero image placeholder</PageEyebrow>
                    <h2 className="m-0 mt-4 text-[1.7rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                      Replace with Scott coaching photo / portrait / scene
                    </h2>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-white/6 p-5 text-sm leading-7 text-[rgba(245,239,230,0.82)]">
                    Use this space later for a real coaching image that feels human, grounded, and trustworthy. For now it holds the shape and emphasis of the hero visual without pretending the asset already exists.
                  </div>
                </div>
              </div>
            </div>
          </GlassPanel>

          <section className="grid gap-8 lg:grid-cols-3">
            <DetailCard
              title="What coaching is for"
              body="Leadership decisions, personal direction, accountability, transitions, steadiness under pressure, and sorting the next right move when everything feels louder than it should."
            />

            <DetailCard
              title="How booking works"
              body="Click Book a Session, sign in if needed, and send a short request from your dashboard. Scott follows up personally about fit, scheduling, and the best next step."
              featured
              glow={getLayoutGlowEnabled(layoutVariant)}
              panelTreatment={getLayoutPanelTreatment(layoutVariant, "featured")}
            />

            <DetailCard
              title="Why donation supported"
              body="This credentialing season is designed to keep the first step open and honest. If the session is helpful, you may donate afterward in whatever amount feels fair and sustainable for you."
            />
          </section>
        </div>
      </PageContainer>
    </main>
  );
}
