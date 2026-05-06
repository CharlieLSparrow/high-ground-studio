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

import { submitCoachingRequestAction } from "./actions";

type SearchParams = Promise<{
  error?: string;
}>;

function StatusMessage({ error }: { error?: string }) {
  if (!error) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm font-medium text-red-100">
      {error}
    </div>
  );
}

function VisualStep({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 text-[var(--text-light)]">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-flare/25 bg-flare/15 text-sm font-black text-[var(--accent)]">
        {number}
      </div>
      <h3 className="mb-0 mt-4 text-[1.18rem] leading-tight tracking-[-0.02em] text-[var(--text-light)]">
        {title}
      </h3>
      <p className="mb-0 mt-3 text-[0.96rem] leading-7 text-[rgba(245,239,230,0.84)]">
        {body}
      </p>
    </div>
  );
}

function PromiseCard({
  title,
  body,
  layoutVariant,
  featured = false,
}: {
  title: string;
  body: string;
  layoutVariant: LayoutVariant;
  featured?: boolean;
}) {
  return (
    <GlassPanel
      glow={featured && getLayoutGlowEnabled(layoutVariant)}
      className={[
        "p-6 text-[var(--text-light)]",
        featured ? getLayoutPanelTreatment(layoutVariant, "featured") : "",
      ].join(" ")}
    >
      <PageEyebrow>{title}</PageEyebrow>
      <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(245,239,230,0.94)]">
        {body}
      </p>
    </GlassPanel>
  );
}

export default async function CoachingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const isTeam = canAccessInternalContent(roles);
  const cookieStore = await cookies();
  const layoutVariant = getLayoutVariantFromCookieStore(cookieStore, isTeam);
  const { error } = await searchParams;

  redirectToWelcomeIfNeeded(session, "/coaching");

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
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)] lg:items-center">
              <div>
                <div className="mb-5 flex flex-wrap items-center gap-3">
                  <PageEyebrow>Coaching</PageEyebrow>
                  <PageEyebrow>Scott Sparrow</PageEyebrow>
                  <PageEyebrow>Pay What You Can</PageEyebrow>
                </div>

                <h1 className="m-0 max-w-[940px] text-[clamp(2.9rem,7vw,6.5rem)] leading-[0.9] tracking-[-0.06em] text-[var(--text-light)]">
                  Need a steadier next step?
                </h1>

                <p className="mb-0 mt-6 max-w-[790px] text-[1.15rem] leading-8 text-[rgba(245,239,230,0.96)]">
                  Sometimes leadership is strategy. Sometimes it is courage.
                  Sometimes it is just having someone calm, experienced, and
                  honest help you sort the next right move from the noise.
                </p>

                <p className="mb-0 mt-4 max-w-[760px] text-[1.02rem] leading-8 text-[rgba(245,239,230,0.86)]">
                  Scott is currently completing paid coaching hours for his
                  credentialing process. During this season, there is no fixed
                  rate. After a session, you can give whatever amount feels
                  right and sustainable for you.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <a
                    href="#request-coaching"
                    className="rounded-full border border-flare/35 bg-flare/18 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/50 hover:bg-flare/24"
                  >
                    Request a session
                  </a>

                  {session?.user ? (
                    <Link
                      href="/dashboard"
                      className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
                    >
                      Open member home
                    </Link>
                  ) : (
                    <Link
                      href={buildSignInHref("/coaching")}
                      className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
                    >
                      Sign in to request
                    </Link>
                  )}

                  {isTeam ? (
                    <Link
                      href="/team/coaching-requests"
                      className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
                    >
                      View requests
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,122,24,0.22),rgba(255,255,255,0.06)_34%,rgba(255,255,255,0.04)_100%)] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.2)]">
                <div className="rounded-[30px] border border-white/10 bg-[#08171b]/55 p-6">
                  <PageEyebrow>The simple version</PageEyebrow>
                  <div className="mt-5 space-y-4">
                    <VisualStep
                      number="1"
                      title="Raise your hand"
                      body="Tell us how you would like Scott to reach out. Keep the note short, long, or blank."
                    />
                    <VisualStep
                      number="2"
                      title="We follow up personally"
                      body="No automated coaching maze. A real human reads the request and coordinates the next step."
                    />
                    <VisualStep
                      number="3"
                      title="Donate afterward if helpful"
                      body="No fixed rate during this credentialing season. Give what feels right after the session."
                    />
                  </div>
                </div>
              </div>
            </div>
          </GlassPanel>

          <section className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="space-y-6">
              <PromiseCard
                title="What this is"
                body="A focused coaching conversation with Scott Sparrow: leadership, direction, hard decisions, steadiness under pressure, or the next step you keep circling but not quite taking."
                layoutVariant={layoutVariant}
                featured
              />

              <PromiseCard
                title="What this is not"
                body="Not a funnel into a giant program. Not a fixed-price package. Not a pressure campaign wearing a headset. Just a real request for a real conversation."
                layoutVariant={layoutVariant}
              />

              <PromiseCard
                title="Why donation-supported?"
                body="Scott needs paid coaching hours for credentialing, but the amount does not need to be fixed. If the session helps, give what fits your situation. That keeps the door open without turning the first step into a toll booth."
                layoutVariant={layoutVariant}
              />
            </div>

            <div id="request-coaching" className="scroll-mt-8 space-y-6">
              <StatusMessage error={error} />

              <GlassPanel
                glow={getLayoutGlowEnabled(layoutVariant)}
                className={[
                  "p-6 text-[var(--text-light)] md:p-7",
                  getLayoutPanelTreatment(layoutVariant, "featured"),
                ].join(" ")}
              >
                <PageEyebrow>Request a Session</PageEyebrow>

                <h2 className="m-0 mt-3 text-[2rem] leading-tight tracking-[-0.04em] text-[var(--text-light)]">
                  Want Scott to reach out?
                </h2>

                <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(245,239,230,0.92)]">
                  Sign in so we know where to find you, then choose the best way
                  for Scott to follow up. The note is optional. The courage to
                  ask is enough for step one.
                </p>

                {session?.user ? (
                  <form action={submitCoachingRequestAction} className="mt-6 space-y-4">
                    <input
                      type="text"
                      name="company"
                      tabIndex={-1}
                      autoComplete="off"
                      className="hidden"
                      aria-hidden="true"
                    />

                    <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm leading-6 text-[rgba(245,239,230,0.9)]">
                      Signed in as{" "}
                      <strong>{session.user.name || session.user.primaryEmail || session.user.email}</strong>
                    </div>

                    <div>
                      <label
                        htmlFor="preferredContactMethod"
                        className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                      >
                        Preferred contact method
                      </label>
                      <select
                        id="preferredContactMethod"
                        name="preferredContactMethod"
                        required
                        defaultValue="EMAIL"
                        className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none"
                      >
                        <option value="EMAIL" className="text-black">
                          Email
                        </option>
                        <option value="PHONE_CALL" className="text-black">
                          Phone call
                        </option>
                        <option value="TEXT" className="text-black">
                          Text
                        </option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="phone"
                        className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                      >
                        Phone number <span className="font-normal text-[rgba(245,239,230,0.68)]">optional</span>
                      </label>
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                        placeholder="Only if you want a call or text"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="note"
                        className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                      >
                        Optional note
                      </label>
                      <textarea
                        id="note"
                        name="note"
                        rows={5}
                        className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                        placeholder="A sentence or two about what you want to talk through, or leave it blank and start simple."
                      />
                    </div>

                    <p className="mb-0 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm leading-6 text-[rgba(245,239,230,0.82)]">
                      By sending this request, you agree that High Ground Odyssey may contact you about coaching using the method you selected.
                    </p>

                    <button
                      type="submit"
                      className="w-full rounded-2xl border border-flare/25 bg-flare/15 px-4 py-4 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:border-flare/40 hover:bg-flare/20"
                    >
                      Ask Scott to reach out
                    </button>
                  </form>
                ) : (
                  <div className="mt-6 rounded-[28px] border border-white/10 bg-white/6 p-5">
                    <h3 className="m-0 text-[1.25rem] leading-tight tracking-[-0.02em] text-[var(--text-light)]">
                      First, sign in.
                    </h3>
                    <p className="mb-0 mt-3 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.86)]">
                      This keeps the request tiny. We will use the email on your account, then you only need to choose how you prefer to be contacted.
                    </p>
                    <Link
                      href={buildSignInHref("/coaching")}
                      className="mt-5 inline-flex rounded-full border border-flare/35 bg-flare/18 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/50 hover:bg-flare/24"
                    >
                      Sign in and request coaching
                    </Link>
                  </div>
                )}
              </GlassPanel>
            </div>
          </section>
        </div>
      </PageContainer>
    </main>
  );
}
