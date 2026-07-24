import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { canAccessInternalContent } from "@/lib/authz";
import {
  getHgoCoachingHandoff,
  getQuipslyPublicCoachingPacket,
} from "@/lib/hgo/coaching-handoff";
import {
  QUIPSLY_COACHING_CLIENT_JOURNEY,
  QUIPSLY_COACHING_OPERATOR_JOURNEY,
} from "@high-ground/quipsly-domain/coaching-public";
import { getLayoutVariantFromCookieStore } from "@/lib/layout-variant";
import {
  getLayoutPanelTreatment,
  getLayoutSurfaceBackground,
} from "@/lib/layout-variant-styles";
import { redirectToWelcomeIfNeeded } from "@/lib/server/welcome";

const COACHING_STEPS = [
  "Request a session",
  "Confirm fit, timing, and payment path if needed",
  "Join a consent-aware coaching or capture room",
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

  const handoff = getHgoCoachingHandoff();
  const quipslyPacket = await getQuipslyPublicCoachingPacket();

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
                    Sessions can stay flexible or become paid one-to-one
                    coaching when that is the right fit. High Ground Odyssey is
                    the front porch. Quipsly Nest is the workbench that keeps
                    booking, consent, recording, transcript, payment evidence,
                    and follow-up state visible.
                  </p>

                  <div className="mt-8 flex flex-wrap gap-3">
                    <a
                      href={handoff.primaryBookingHref}
                      className="inline-flex rounded-full border border-flare/40 bg-flare/20 px-7 py-3.5 text-sm font-bold uppercase tracking-[0.1em] text-[var(--text-light)] no-underline transition hover:border-flare/55 hover:bg-flare/28"
                    >
                      Open Quipsly Booking
                    </a>
                    <Link
                      href={handoff.productEducationHref}
                      className="inline-flex rounded-full border border-white/15 bg-white/10 px-7 py-3.5 text-sm font-bold uppercase tracking-[0.1em] text-[var(--text-light)] no-underline transition hover:border-flare/35 hover:bg-white/14"
                    >
                      Public handoff actions
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

          <GlassPanel className="p-7 text-[var(--text-light)] md:p-8">
            <PageEyebrow>Simple coaching path</PageEyebrow>
            <h2 className="m-0 mt-3 text-[clamp(1.9rem,4vw,3.1rem)] leading-[0.96] tracking-[-0.05em] text-[var(--text-light)]">
              Easy for the coachee. Clear for Homer.
            </h2>
            <p className="mb-0 mt-4 max-w-4xl text-sm leading-6 text-[rgba(245,239,230,0.78)]">
              The public page should not make anyone understand Stripe, calendar
              receipts, capture rooms, or transcript jobs. It should make the
              next human step obvious, then let Quipsly keep the records tidy.
            </p>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-[28px] border border-white/10 bg-black/18 p-5">
                <div className="text-sm font-bold text-[var(--text-light)]">
                  What the coachee sees
                </div>
                <div className="mt-4 space-y-3">
                  {QUIPSLY_COACHING_CLIENT_JOURNEY.map((step, index) => (
                    <div key={step.id} className="rounded-[20px] bg-white/8 p-4">
                      <div className="text-xs font-bold uppercase tracking-[0.1em] text-flare/90">
                        {index + 1}. {step.label}
                      </div>
                      <p className="mb-0 mt-2 text-xs leading-5 text-[rgba(245,239,230,0.72)]">
                        {step.plainEnglish}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[28px] border border-flare/20 bg-[rgba(255,146,52,0.09)] p-5">
                <div className="text-sm font-bold text-[var(--text-light)]">
                  What Homer manages
                </div>
                <div className="mt-4 space-y-3">
                  {QUIPSLY_COACHING_OPERATOR_JOURNEY.map((step, index) => (
                    <div key={step.id} className="rounded-[20px] bg-black/18 p-4">
                      <div className="text-xs font-bold uppercase tracking-[0.1em] text-flare/90">
                        {index + 1}. {step.label}
                      </div>
                      <p className="mb-0 mt-2 text-xs leading-5 text-[rgba(245,239,230,0.72)]">
                        {step.plainEnglish}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="p-7 text-[var(--text-light)] md:p-8">
            <PageEyebrow>Public loop map</PageEyebrow>
            <h2 className="m-0 mt-3 text-[clamp(1.8rem,4vw,3rem)] leading-[0.96] tracking-[-0.05em] text-[var(--text-light)]">
              One doorway, one product funnel, one operational truth.
            </h2>
            <p className="mb-0 mt-4 max-w-4xl text-sm leading-6 text-[rgba(245,239,230,0.78)]">
              High Ground Odyssey explains the coaching relationship and routes
              people into Quipsly. Quipsly.com teaches the Research, Studio,
              and Tower system. Nest owns the records that prove what actually
              happened.
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[24px] border border-white/10 bg-black/18 p-5">
                <div className="text-sm font-bold text-[var(--text-light)]">
                  High Ground Odyssey
                </div>
                <p className="mb-0 mt-2 text-xs leading-5 text-[rgba(245,239,230,0.72)]">
                  Public coaching, story, and business doorway. It explains
                  fit, voice, and human service before sending operational work
                  to Quipsly.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-black/18 p-5">
                <div className="text-sm font-bold text-[var(--text-light)]">
                  Quipsly.com
                </div>
                <p className="mb-0 mt-2 text-xs leading-5 text-[rgba(245,239,230,0.72)]">
                  Product education funnel for Research, Studio, Tower, and
                  coaching capture. It teaches the system without creating
                  hidden bookings.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-black/18 p-5">
                <div className="text-sm font-bold text-[var(--text-light)]">
                  Quipsly Nest
                </div>
                <p className="mb-0 mt-2 text-xs leading-5 text-[rgba(245,239,230,0.72)]">
                  Operational source of truth for users, booking, consent,
                  payment evidence, capture rooms, transcripts, packets, and
                  review state.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-black/18 p-5">
                <div className="text-sm font-bold text-[var(--text-light)]">
                  Native capture
                </div>
                <p className="mb-0 mt-2 text-xs leading-5 text-[rgba(245,239,230,0.72)]">
                  Local-first recorder. Local files stay source truth until
                  server verification and explicit retention policy say
                  otherwise.
                </p>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="p-7 text-[var(--text-light)] md:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <PageEyebrow>Quipsly live packet</PageEyebrow>
                <h2 className="m-0 mt-3 text-[clamp(1.9rem,4vw,3.2rem)] leading-[0.96] tracking-[-0.05em] text-[var(--text-light)]">
                  {quipslyPacket.ok
                    ? quipslyPacket.packet.title
                    : "Coaching offer details live in Quipsly."}
                </h2>
                <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(245,239,230,0.82)]">
                  {quipslyPacket.ok
                    ? quipslyPacket.packet.summary
                    : "High Ground Odyssey can explain the work even when Nest is unavailable. Quipsly remains the source of booking, consent, payment evidence, capture, transcript, and packet truth."}
                </p>
              </div>

              <a
                href={handoff.publicPacketHref}
                className="inline-flex shrink-0 rounded-full border border-white/15 bg-white/10 px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-[var(--text-light)] no-underline transition hover:border-flare/35 hover:bg-white/14"
              >
                Inspect packet
              </a>
            </div>

            {quipslyPacket.ok && quipslyPacket.packet.offerings?.items.length ? (
              <div className="mt-6 grid gap-3 md:grid-cols-3">
                {quipslyPacket.packet.offerings.items.slice(0, 3).map((offering) => (
                  <div
                    key={offering.id}
                    className="rounded-[24px] border border-white/10 bg-white/8 p-5"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-flare/90">
                      {offering.kind.replaceAll("_", " ").toLowerCase()}
                    </div>
                    <h3 className="m-0 mt-3 text-xl leading-tight text-[var(--text-light)]">
                      {offering.title}
                    </h3>
                    <p className="mb-0 mt-3 text-sm leading-6 text-[rgba(245,239,230,0.74)]">
                      {offering.description || offering.nextAction}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                      <span className="rounded-full bg-white/10 px-3 py-1">
                        {offering.durationMinutes} min
                      </span>
                      <span className="rounded-full bg-white/10 px-3 py-1">
                        {offering.priceLabel || offering.paymentPolicy.replaceAll("_", " ").toLowerCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-0 mt-5 rounded-[22px] border border-white/10 bg-white/8 px-4 py-3 text-sm leading-6 text-[rgba(245,239,230,0.72)]">
                {quipslyPacket.ok
                  ? "Quipsly is reachable, but no public coaching offerings are active yet."
                  : `Quipsly packet fallback: ${quipslyPacket.warning}`}
              </p>
            )}

            {quipslyPacket.ok && quipslyPacket.packet.positioning ? (
              <div className="mt-6 rounded-[28px] border border-white/10 bg-white/8 p-5">
                <PageEyebrow>Research, Studio, Tower</PageEyebrow>
                <p className="mb-0 mt-3 max-w-4xl text-sm leading-6 text-[rgba(245,239,230,0.78)]">
                  {quipslyPacket.packet.positioning.promise}
                </p>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {quipslyPacket.packet.positioning.pillars.map((pillar) => (
                    <div
                      key={pillar.id}
                      className="rounded-[22px] border border-white/10 bg-black/18 p-4"
                    >
                      <div className="text-sm font-bold text-[var(--text-light)]">
                        Quipsly {pillar.label}
                      </div>
                      <p className="mb-0 mt-2 text-xs leading-5 text-[rgba(245,239,230,0.72)]">
                        {pillar.coachingUse}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mb-0 mt-4 text-xs leading-5 text-[rgba(245,239,230,0.66)]">
                  {quipslyPacket.packet.positioning.systemsAnxietyLine}
                </p>
              </div>
            ) : null}

            {quipslyPacket.ok && quipslyPacket.packet.handoffActions.length ? (
              <div className="mt-6 rounded-[28px] border border-white/10 bg-white/8 p-5">
                <PageEyebrow>Public handoff actions</PageEyebrow>
                <p className="mb-0 mt-3 max-w-4xl text-sm leading-6 text-[rgba(245,239,230,0.78)]">
                  These actions come from Quipsly&apos;s public packet. High
                  Ground can route people clearly without copying booking,
                  payment, consent, capture, or transcript logic into the
                  marketing site.
                </p>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {quipslyPacket.packet.handoffActions.slice(0, 4).map((action) => (
                    <a
                      key={action.id}
                      href={action.href}
                      className="rounded-[22px] border border-white/10 bg-black/18 p-4 text-[var(--text-light)] no-underline transition hover:border-flare/35 hover:bg-black/24"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold">{action.label}</div>
                        <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[rgba(245,239,230,0.72)]">
                          {action.audience}
                        </span>
                      </div>
                      <p className="mb-0 mt-2 text-xs leading-5 text-[rgba(245,239,230,0.72)]">
                        {action.summary}
                      </p>
                      <p className="mb-0 mt-3 text-[11px] leading-5 text-[rgba(245,239,230,0.58)]">
                        Boundary: {action.boundary}
                      </p>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {quipslyPacket.ok && quipslyPacket.packet.nativeCapture ? (
              <div className="mt-6 rounded-[28px] border border-flare/20 bg-[rgba(255,146,52,0.09)] p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <PageEyebrow>Native production capture</PageEyebrow>
                    <h3 className="m-0 mt-3 text-2xl leading-tight text-[var(--text-light)]">
                      {quipslyPacket.packet.nativeCapture.appSurface}
                    </h3>
                    <p className="mb-0 mt-3 max-w-3xl text-sm leading-6 text-[rgba(245,239,230,0.78)]">
                      {quipslyPacket.packet.nativeCapture.localSourceTruth}
                    </p>
                  </div>
                  <span className="rounded-full border border-emerald-300/25 bg-emerald-300/12 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.11em] text-emerald-100">
                    source-safe
                  </span>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {quipslyPacket.packet.nativeCapture.modes.map((mode) => (
                    <div
                      key={mode.id}
                      className="rounded-[22px] border border-white/10 bg-black/18 p-4"
                    >
                      <div className="text-sm font-bold text-[var(--text-light)]">
                        {mode.label}
                      </div>
                      <p className="mb-0 mt-2 text-xs leading-5 text-[rgba(245,239,230,0.7)]">
                        {mode.purpose}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mb-0 mt-4 text-xs leading-5 text-[rgba(245,239,230,0.66)]">
                  {quipslyPacket.packet.nativeCapture.uploadRule}{" "}
                  {quipslyPacket.packet.nativeCapture.deletionRule}
                </p>
              </div>
            ) : null}

            {quipslyPacket.ok && quipslyPacket.packet.scheduling ? (
              <div className="mt-6 rounded-[28px] border border-sky-200/15 bg-sky-200/8 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <PageEyebrow>Scheduling truth</PageEyebrow>
                    <h3 className="m-0 mt-3 text-2xl leading-tight text-[var(--text-light)]">
                      Default coaching time is{" "}
                      {quipslyPacket.packet.scheduling.defaultTimezoneLabel}.
                    </h3>
                    <p className="mb-0 mt-3 max-w-3xl text-sm leading-6 text-[rgba(245,239,230,0.78)]">
                      {quipslyPacket.packet.scheduling.operatorDefault}
                    </p>
                  </div>
                  <span className="rounded-full border border-sky-200/20 bg-sky-200/12 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.11em] text-sky-100">
                    {quipslyPacket.packet.scheduling.defaultTimezone}
                  </span>
                </div>
                <p className="mb-0 mt-4 text-xs leading-5 text-[rgba(245,239,230,0.68)]">
                  {quipslyPacket.packet.scheduling.calendarEvidenceBoundary}
                </p>
                <p className="mb-0 mt-3 text-xs leading-5 text-[rgba(245,239,230,0.58)]">
                  {quipslyPacket.packet.scheduling.externalCalendarBoundary}
                </p>
              </div>
            ) : null}
          </GlassPanel>

          <section className="grid gap-8 lg:grid-cols-3">
            <DetailCard
              title="What to bring"
              body="A decision, a transition, a leadership question, a hard conversation, or even just the sense that something important needs a little more light."
            />

            <DetailCard
              title="What happens next"
              body="Open Quipsly Booking to sign in or create a free Quipsly account, then use the coaching runway for booking, payment evidence when needed, consent, capture, transcript, and follow-up state. The simple request path remains available if you just need a human to follow up."
            />

            <DetailCard
              title="Calm capture"
              body="When a session is recorded or transcribed, Quipsly treats consent, recordings, transcripts, notes, and action items as inspectable records. No hidden recording, no mystery automation."
            />
          </section>

          <GlassPanel className="p-8 text-center text-[var(--text-light)] md:p-10">
            <PageEyebrow>Ready when you are</PageEyebrow>
            <h2 className="m-0 mt-4 text-[clamp(2rem,4vw,3rem)] leading-[0.95] tracking-[-0.05em] text-[var(--text-light)]">
              Start with a simple conversation.
            </h2>

            <div className="mt-7">
              <a
                href={handoff.primaryBookingHref}
                className="inline-flex rounded-full border border-flare/35 bg-flare/18 px-7 py-3.5 text-sm font-bold uppercase tracking-[0.1em] text-[var(--text-light)] no-underline transition hover:border-flare/50 hover:bg-flare/24"
              >
                Open Quipsly Booking
              </a>
            </div>
            <p className="mx-auto mb-0 mt-5 max-w-2xl text-sm leading-6 text-[rgba(245,239,230,0.72)]">
              {handoff.operatingTruth}
            </p>
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
