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

function DetailCard({
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

  const defaultName = session?.user?.name ?? "";
  const defaultEmail = session?.user?.primaryEmail ?? session?.user?.email ?? "";

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
              <PageEyebrow>Credentialing Season</PageEyebrow>
              <PageEyebrow>Donation Supported</PageEyebrow>
            </div>

            <h1 className="m-0 max-w-[920px] text-[clamp(2.6rem,6vw,5rem)] leading-[0.96] tracking-[-0.05em] text-[var(--text-light)]">
              Coaching support during a credentialing season.
            </h1>

            <p className="mb-0 mt-5 max-w-[860px] text-[1.08rem] leading-8 text-[rgba(245,239,230,0.96)]">
              Scott is currently completing paid coaching hours as part of his coaching credentialing process. During this phase, there is no fixed fee. After a session, you are invited to give whatever amount feels appropriate and sustainable for you.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {session?.user ? (
                <Link
                  href="/dashboard"
                  className="rounded-full border border-flare/35 bg-flare/18 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/50 hover:bg-flare/24"
                >
                  Open member home
                </Link>
              ) : (
                <Link
                  href={buildSignInHref("/dashboard")}
                  className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
                >
                  Sign in later to view your member home
                </Link>
              )}

              {isTeam ? (
                <Link
                  href="/team/coaching-requests"
                  className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
                >
                  Open coaching requests
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

          <section className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="space-y-6">
              <StatusMessage error={error} />

              <GlassPanel
                glow={getLayoutGlowEnabled(layoutVariant)}
                className={[
                  "p-6 text-[var(--text-light)]",
                  getLayoutPanelTreatment(layoutVariant, "featured"),
                ].join(" ")}
              >
                <PageEyebrow>Request Coaching</PageEyebrow>

                <h2 className="m-0 mt-3 text-[1.9rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                  Start with a direct conversation.
                </h2>

                <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(245,239,230,0.94)]">
                  If you would like to begin a coaching conversation, tell us a little about what you are navigating and how you would prefer to be contacted. We will follow up personally about fit, scheduling, and next steps.
                </p>

                <form action={submitCoachingRequestAction} className="mt-6 space-y-4">
                  <input
                    type="text"
                    name="company"
                    tabIndex={-1}
                    autoComplete="off"
                    className="hidden"
                    aria-hidden="true"
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label
                        htmlFor="name"
                        className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                      >
                        Name
                      </label>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        required
                        defaultValue={defaultName}
                        className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                        placeholder="Your name"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="email"
                        className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                      >
                        Email
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        defaultValue={defaultEmail}
                        className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label
                        htmlFor="phone"
                        className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                      >
                        Phone
                      </label>
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                        placeholder="Optional unless you prefer calls or texts"
                      />
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
                  </div>

                  <div>
                    <label
                      htmlFor="availabilityNotes"
                      className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                    >
                      Availability notes
                    </label>
                    <textarea
                      id="availabilityNotes"
                      name="availabilityNotes"
                      rows={4}
                      className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                      placeholder="Days, times, time zone, or anything else helpful about your availability"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="coachingGoals"
                      className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                    >
                      What would you like help with?
                    </label>
                    <textarea
                      id="coachingGoals"
                      name="coachingGoals"
                      rows={6}
                      required
                      className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                      placeholder="Share what you are navigating, what kind of support would be useful, and what you hope coaching might help you work through."
                    />
                  </div>

                  <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                    <input type="checkbox" name="contactConsent" className="mt-1" />
                    <span className="text-sm leading-6 text-[rgba(245,239,230,0.92)]">
                      I agree that High Ground Odyssey may contact me about this coaching request using the method I selected above.
                    </span>
                  </label>

                  <button
                    type="submit"
                    className="w-full rounded-2xl border border-flare/25 bg-flare/15 px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:border-flare/40 hover:bg-flare/20"
                  >
                    Send coaching request
                  </button>
                </form>
              </GlassPanel>
            </div>

            <div className="space-y-6">
              <DetailCard
                title="How this works"
                body="During this phase, coaching is donation-supported rather than fixed-rate. If a session is helpful, you may donate afterward in whatever amount feels fair and manageable. That allows the session to count toward paid coaching hours without forcing a rigid price before the work begins."
                layoutVariant={layoutVariant}
                featured
              />

              <DetailCard
                title="What happens next"
                body="Once your request is in, we review it personally and follow up directly about fit, scheduling, and the best next step. Nothing about this is automated theater. A real person will read what you send."
                layoutVariant={layoutVariant}
              />

              <DetailCard
                title="What coaching can be for"
                body="Leadership growth, steadiness under pressure, personal direction, accountability, hard decisions, and practical next steps. The goal is honest support that helps you move with more clarity and intention."
                layoutVariant={layoutVariant}
              />
            </div>
          </section>
        </div>
      </PageContainer>
    </main>
  );
}
