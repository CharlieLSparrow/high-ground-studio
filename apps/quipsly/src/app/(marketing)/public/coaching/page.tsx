import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import {
  CalendarClock,
  HeartHandshake,
  Library,
  Mic2,
  ShieldCheck,
  Sparkles,
  TowerControl,
  Video,
} from "lucide-react";
import {
  QUIPSLY_COACHING_CLIENT_JOURNEY,
  QUIPSLY_COACHING_OPERATOR_JOURNEY,
  QUIPSLY_NATIVE_CAPTURE_CONTRACT,
  QUIPSLY_PUBLIC_COACHING_HANDOFF_ACTIONS,
  QUIPSLY_PUBLIC_LOOP_STATUS,
  QUIPSLY_PUBLIC_COACHING_POSITIONING,
} from "@high-ground/quipsly-domain/coaching-public";
import { loadPublicCoachingOfferings } from "@/lib/server/public-coaching-offerings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quipsly for Coaches - Capture, Consent, Notes, and Follow-Up",
  description:
    "Quipsly helps coaches capture sessions with consent, keep notes and transcripts connected, and turn conversations into reusable follow-up packets.",
};

const workflowSteps = [
  {
    title: "Invite the right conversation",
    body: "High Ground Odyssey can explain the coaching offer and route people into Quipsly. Quipsly Nest keeps the operational booking and session truth.",
    Icon: HeartHandshake,
  },
  {
    title: "Schedule with evidence",
    body: "Availability, booking holds, payment evidence, calendar-ready metadata, and next actions should be inspectable instead of scattered across inboxes.",
    Icon: CalendarClock,
  },
          {
            title: "Capture with consent",
            body: "Recording is a visible action, not a hidden side effect. The route keeps explicit consent, local capture, provider recording, upload verification, and transcript jobs in separate receipt-backed states.",
            Icon: Mic2,
          },
  {
    title: "Turn sessions into assets",
    body: "Notes, transcript segments, action items, clips, frameworks, and follow-up packets become reusable Quipsly assets without pretending the raw conversation disappeared.",
    Icon: Library,
  },
];

const systemIconByPillar = {
  research: Library,
  studio: Video,
  tower: TowerControl,
};

const systemCards = QUIPSLY_PUBLIC_COACHING_POSITIONING.pillars.map((pillar) => ({
  name: `Quipsly ${pillar.label}`,
  copy: pillar.coachingUse,
  detail: pillar.promise,
  Icon: systemIconByPillar[pillar.id],
}));

const publicHandoffHrefByKey = {
  signInOrCreateFreeAccount: "https://nest.quipsly.com/login?callbackUrl=%2Fcoaching%3Fsource%3Dquipsly-marketing%26intent%3Dcoaching",
  coachingRunway: "https://nest.quipsly.com/coaching?source=quipsly-marketing&intent=coaching",
  projectsHome: "https://nest.quipsly.com/projects",
  captureAppSurface: "https://nest.quipsly.com/call?purpose=COACHING",
};

const publicHandoffActions = QUIPSLY_PUBLIC_COACHING_HANDOFF_ACTIONS.map((action) => ({
  ...action,
  href: publicHandoffHrefByKey[action.hrefKey],
}));

const trustRules = [
  QUIPSLY_PUBLIC_COACHING_POSITIONING.hgoRole,
  QUIPSLY_PUBLIC_COACHING_POSITIONING.quipslyRole,
  "Stripe, calendars, call providers, and publishing platforms are evidence feeds, not hidden owners of the workflow.",
  QUIPSLY_NATIVE_CAPTURE_CONTRACT.localSourceTruth,
];

const publicLoopCards = QUIPSLY_PUBLIC_LOOP_STATUS.owners.map((owner) => ({
  title: owner.label,
  body: owner.responsibility,
  boundary: owner.safeBoundary,
  sourceOfTruth: owner.sourceOfTruth,
}));

export default async function QuipslyCoachingPage() {
  const publicOfferings = await loadPublicCoachingOfferings();
  return (
    <main className="min-h-screen overflow-hidden bg-[#f8efe0] text-[#332316] selection:bg-[#d9b66b]/40">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_8%_12%,rgba(91,125,87,0.26),transparent_32%),radial-gradient(circle_at_82%_0%,rgba(215,168,83,0.18),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.55),rgba(255,255,255,0))]" />

      <nav className="sticky top-0 z-40 border-b border-[#e4cfaa]/70 bg-[#fff8ec]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="h-12 w-12 overflow-hidden rounded-2xl border border-[#e4cfaa] bg-white shadow-sm">
              <Image src="/quipsly-app-icon.png" alt="Quipsly" width={96} height={96} className="h-full w-full object-cover" priority />
            </span>
            <span>
              <span className="block font-serif text-2xl font-black leading-none">Quipsly</span>
              <span className="block font-sans text-[10px] font-black uppercase tracking-[0.22em] text-[#8a6a39]">Research Studio Tower</span>
            </span>
          </Link>
          <div className="hidden items-center gap-6 font-sans text-sm font-bold text-[#6d5637] lg:flex">
            <Link href="/#research-studio-tower" className="hover:text-[#1f493e]">System</Link>
            <Link href="/#who" className="hover:text-[#1f493e]">Who it helps</Link>
            <Link href="/philosophy/systems-anxiety" className="hover:text-[#1f493e]">Philosophy</Link>
          </div>
          <div className="flex items-center gap-2 font-sans text-xs font-black uppercase tracking-[0.12em]">
            <Link href="https://highgroundodyssey.com/coaching" className="hidden rounded-full border border-[#caa96f] bg-white/80 px-4 py-2 text-[#5d4527] shadow-sm sm:inline-flex">
              HGO Coaching
            </Link>
            <Link href="https://nest.quipsly.com/projects" className="rounded-full bg-[#315d4f] px-4 py-2 text-[#fff8ec] shadow-sm">
              Open Nest
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 pb-14 pt-12 md:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:pb-20 lg:pt-18">
        <div className="flex flex-col justify-center">
          <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-[#d9b66b]/70 bg-[#fffaf1]/90 px-4 py-2 font-sans text-xs font-black uppercase tracking-[0.18em] text-[#7b5b2c] shadow-sm">
            <ShieldCheck className="h-4 w-4 text-[#315d4f]" />
            Coaching capture, built for trust
          </div>
          <h1 className="max-w-5xl font-serif text-5xl font-black leading-[0.94] tracking-tight text-[#2f2418] md:text-7xl">
            Coaching conversations should become useful without becoming slippery.
          </h1>
          <p className="mt-7 max-w-3xl font-sans text-xl leading-9 text-[#745b3c]">
            Quipsly helps coaches capture sessions with consent, keep transcripts and notes connected, and turn the conversation into follow-up packets, teaching material, podcast clips, or private action items.
          </p>
          <p className="mt-4 max-w-3xl font-sans text-base leading-8 text-[#745b3c]">
            The point is not to hide the work behind automation. The point is to make booking, payment evidence, recording, transcription, review, delivery, and receipts visible enough that everyone can breathe.
          </p>
          <p className="mt-4 max-w-3xl font-sans text-sm font-bold uppercase leading-7 tracking-[0.13em] text-[#315d4f]">
            {QUIPSLY_PUBLIC_COACHING_POSITIONING.systemsAnxietyLine}
          </p>
          <div className="mt-9 flex flex-col gap-3 font-sans sm:flex-row">
            <Link href="https://highgroundodyssey.com/coaching" className="inline-flex items-center justify-center rounded-2xl bg-[#3b2418] px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-[#fff8ec] shadow-lg shadow-[#3b2418]/15">
              See HGO Coaching
            </Link>
            <Link href="https://nest.quipsly.com/projects" className="inline-flex items-center justify-center rounded-2xl border border-[#b99052] bg-white/80 px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-[#6d4b22] shadow-sm">
              Open Quipsly Nest
            </Link>
          </div>
        </div>

        <div className="relative min-h-[540px]">
          <div className="absolute inset-0 rounded-[3rem] bg-[#315d4f]/10 blur-3xl" />
          <div className="relative overflow-hidden rounded-[3rem] border border-[#d9b66b]/60 bg-[#fffaf1] p-4 shadow-2xl shadow-[#5d4527]/15">
            <Image
              src="/images/quipsly-generated/cute_quipsly_scientist_professor.webp"
              alt="A Quipsly coaching assistant with research notes"
              width={1200}
              height={1200}
              priority
              className="aspect-[4/5] w-full rounded-[2.35rem] object-cover"
            />
            <div className="absolute bottom-8 left-8 right-8 rounded-[2rem] border border-white/50 bg-[#1d382f]/88 p-6 text-[#fff8ec] shadow-xl backdrop-blur-md">
              <div className="mb-2 flex items-center gap-2 font-sans text-xs font-black uppercase tracking-[0.18em] text-[#f4d58e]">
                <Sparkles className="h-4 w-4" />
                Product boundary
              </div>
              <p className="font-serif text-2xl font-black leading-tight">
                High Ground opens the door. Quipsly keeps the receipts.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-10 md:px-8">
        <div className="mb-8 max-w-3xl">
          <p className="font-sans text-xs font-black uppercase tracking-[0.2em] text-[#8a6a39]">For Homer and the coachee</p>
          <h2 className="mt-3 font-serif text-4xl font-black leading-tight md:text-6xl">The easiest path is the one that says what happens next.</h2>
          <p className="mt-4 font-sans text-base leading-8 text-[#745b3c]">
            The coaching flow should feel like a front desk, not a cockpit. The coachee sees a simple journey. Homer sees the operator checklist. Stripe, calendars, rooms, recordings, and transcripts stay in the background until they change the next action.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-[2.5rem] border border-[#dbc295] bg-[#fffaf1]/90 p-6 shadow-sm">
            <p className="font-sans text-xs font-black uppercase tracking-[0.18em] text-[#315d4f]">Coachee path</p>
            <h3 className="mt-3 font-serif text-3xl font-black">Clear, private, and never surprising.</h3>
            <div className="mt-6 space-y-3">
              {QUIPSLY_COACHING_CLIENT_JOURNEY.map((step, index) => (
                <div key={step.id} className="rounded-[1.5rem] border border-[#e6d0a8] bg-white/70 p-4">
                  <div className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#315d4f] font-sans text-sm font-black text-[#fff8ec]">{index + 1}</span>
                    <div>
                      <h4 className="font-serif text-xl font-black">{step.label}</h4>
                      <p className="mt-2 font-sans text-sm leading-7 text-[#745b3c]">{step.plainEnglish}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
          <article className="rounded-[2.5rem] border border-[#dbc295] bg-[#2d4f43] p-6 text-[#fff8ec] shadow-xl shadow-[#173129]/15">
            <p className="font-sans text-xs font-black uppercase tracking-[0.18em] text-[#f4d58e]">Homer operator path</p>
            <h3 className="mt-3 font-serif text-3xl font-black">One setup, then one obvious next action.</h3>
            <div className="mt-6 space-y-3">
              {QUIPSLY_COACHING_OPERATOR_JOURNEY.map((step, index) => (
                <div key={step.id} className="rounded-[1.5rem] border border-white/15 bg-[#f8efe0] p-4 text-[#332316]">
                  <div className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f4d58e] font-sans text-sm font-black text-[#2d4f43]">{index + 1}</span>
                    <div>
                      <h4 className="font-serif text-xl font-black">{step.label}</h4>
                      <p className="mt-2 font-sans text-sm leading-7 text-[#745b3c]">{step.plainEnglish}</p>
                      <p className="mt-2 font-sans text-xs leading-6 text-[#8a6a39]">Truth: {step.quipslyTruth}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-10 md:px-8">
        <div className="mb-8 max-w-3xl">
          <p className="font-sans text-xs font-black uppercase tracking-[0.2em] text-[#8a6a39]">The coaching loop</p>
          <h2 className="mt-3 font-serif text-4xl font-black leading-tight md:text-6xl">From request to reusable wisdom.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {workflowSteps.map((step) => (
            <article key={step.title} className="rounded-[2rem] border border-[#dbc295] bg-[#fffaf1]/88 p-6 shadow-sm">
              <div className="mb-5 inline-flex rounded-2xl bg-[#315d4f] p-3 text-[#fff8ec]">
                <step.Icon className="h-6 w-6" />
              </div>
              <h3 className="font-serif text-2xl font-black">{step.title}</h3>
              <p className="mt-4 font-sans text-sm leading-7 text-[#745b3c]">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-10 md:px-8">
        <div className="mb-8 max-w-3xl">
          <p className="font-sans text-xs font-black uppercase tracking-[0.2em] text-[#8a6a39]">Public handoff actions</p>
          <h2 className="mt-3 font-serif text-4xl font-black leading-tight md:text-6xl">A funnel without hidden business logic.</h2>
          <p className="mt-4 font-sans text-base leading-8 text-[#745b3c]">
            Quipsly.com can educate and route, but Nest owns the records. These shared handoff actions are the public map into booking, capture, and follow-up without making the marketing site charge cards, create rooms, or start recordings.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {publicHandoffActions.map((action) => (
            <Link
              key={action.id}
              href={action.href}
              className="rounded-[2rem] border border-[#dbc295] bg-[#fffaf1]/88 p-6 text-[#332316] no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-[#b99052] hover:shadow-lg"
            >
              <div className="mb-4 inline-flex rounded-full bg-[#315d4f]/10 px-3 py-1 font-sans text-[10px] font-black uppercase tracking-[0.14em] text-[#315d4f]">
                {action.audience}
              </div>
              <h3 className="font-serif text-2xl font-black leading-tight">{action.label}</h3>
              <p className="mt-4 font-sans text-sm leading-7 text-[#745b3c]">{action.summary}</p>
              <p className="mt-4 font-sans text-xs leading-6 text-[#8a6a39]">
                Boundary: {action.boundary}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-10 md:px-8">
        <div className="mb-8 max-w-3xl">
          <p className="font-sans text-xs font-black uppercase tracking-[0.2em] text-[#8a6a39]">
            Book coaching
          </p>
          <h2 className="mt-3 font-serif text-4xl font-black leading-tight md:text-6xl">
            Choose a real open time without the calendar scavenger hunt.
          </h2>
          <p className="mt-4 font-sans text-base leading-8 text-[#745b3c]">
            Quipsly shows only the times a coach has made available. Pick one,
            sign in or create a free account, and request it. The coach confirms
            before any calendar invitation, payment, call, or recording begins.
          </p>
        </div>
        {publicOfferings.items.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {publicOfferings.items.map((offering) => (
              <article
                key={offering.id}
                className="rounded-[2rem] border border-[#dbc295] bg-[#fffaf1]/92 p-6 shadow-sm"
              >
                <p className="font-sans text-xs font-black uppercase tracking-[0.16em] text-[#315d4f]">
                  {offering.coachName}
                </p>
                <h3 className="mt-3 font-serif text-2xl font-black">
                  {offering.title}
                </h3>
                {offering.description ? (
                  <p className="mt-3 font-sans text-sm leading-7 text-[#745b3c]">
                    {offering.description}
                  </p>
                ) : null}
                <p className="mt-4 font-sans text-sm font-bold text-[#6d5637]">
                  {offering.durationMinutes} minutes
                  {offering.priceLabel ? ` · ${offering.priceLabel}` : ""}
                </p>
                <Link
                  href={offering.bookingPath}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-[#315d4f] px-5 py-3.5 font-sans text-sm font-black text-white no-underline"
                >
                  {offering.bookableSlots.length
                    ? `Choose from ${offering.bookableSlots.length} open times`
                    : "Check for times"}
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[2rem] border border-[#dbc295] bg-[#fffaf1]/92 p-6 font-sans text-sm leading-7 text-[#745b3c]">
            Coaching times are not published yet. Check back soon or contact your
            coach directly.
          </div>
        )}
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="rounded-[3rem] border border-[#d6bd91] bg-[#2d4f43] p-6 text-[#fff8ec] shadow-2xl shadow-[#173129]/20 md:p-8">
          <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
            <div>
              <p className="font-sans text-xs font-black uppercase tracking-[0.2em] text-[#f4d58e]">Research, Studio, Tower</p>
              <h2 className="mt-4 font-serif text-4xl font-black leading-tight md:text-6xl">Coaching is not a separate island.</h2>
              <p className="mt-5 font-sans text-base leading-8 text-[#f8efe0]/82">
                A coaching session can become private notes, a client-safe packet, a teaching exercise, a podcast seed, a workshop outline, or a research artifact. Quipsly keeps those outputs connected to the original context.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {systemCards.map((card) => (
                <article key={card.name} className="rounded-[2rem] border border-white/15 bg-[#f8efe0] p-5 text-[#342315] shadow-xl">
                  <div className="mb-4 inline-flex rounded-2xl bg-[#315d4f]/10 p-3 text-[#315d4f]">
                    <card.Icon className="h-5 w-5" />
                  </div>
                  <p className="font-sans text-[10px] font-black uppercase tracking-[0.15em] text-[#8a6a39]">{card.detail}</p>
                  <h3 className="mt-2 font-serif text-2xl font-black">{card.name}</h3>
                  <p className="mt-3 font-sans text-sm leading-6 text-[#745b3c]">{card.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="rounded-[3rem] border border-[#dbc295] bg-[#fffaf1]/92 p-8 shadow-xl shadow-[#6c4e29]/10">
          <p className="font-sans text-xs font-black uppercase tracking-[0.2em] text-[#8a6a39]">Public loop map</p>
          <h2 className="mt-3 font-serif text-4xl font-black leading-tight md:text-6xl">
            Doorway, education, operations, capture.
          </h2>
          <p className="mt-4 max-w-4xl font-sans text-base leading-8 text-[#745b3c]">
            Coaching should not feel like a scavenger hunt across websites,
            inboxes, payment tools, and recordings. The public loop makes each
            surface responsible for one clear job.
          </p>
          <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {publicLoopCards.map((card) => (
              <article key={card.title} className="rounded-[2rem] border border-[#dbc295] bg-white/70 p-5">
                <div className="mb-3 inline-flex rounded-full bg-[#315d4f]/10 px-3 py-1 font-sans text-[10px] font-black uppercase tracking-[0.14em] text-[#315d4f]">
                  {card.sourceOfTruth ? "source of truth" : "handoff surface"}
                </div>
                <h3 className="font-serif text-2xl font-black">{card.title}</h3>
                <p className="mt-3 font-sans text-sm leading-7 text-[#745b3c]">{card.body}</p>
                <p className="mt-3 font-sans text-xs leading-6 text-[#8a6a39]">Boundary: {card.boundary}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_0.82fr]">
          <div className="rounded-[3rem] border border-[#dbc295] bg-[#fffaf1]/92 p-8 shadow-xl shadow-[#6c4e29]/10">
            <p className="font-sans text-xs font-black uppercase tracking-[0.2em] text-[#8a6a39]">Trust architecture</p>
            <h2 className="mt-3 font-serif text-4xl font-black leading-tight md:text-5xl">One doorway, one workbench, no hidden owners.</h2>
            <div className="mt-6 grid gap-3">
              {trustRules.map((rule) => (
                <div key={rule} className="rounded-2xl border border-[#dbc295] bg-white/70 px-5 py-4 font-sans text-sm leading-6 text-[#745b3c]">
                  {rule}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[3rem] border border-[#dbc295] bg-[#fffaf1]/92 p-8 shadow-sm">
            <p className="font-sans text-xs font-black uppercase tracking-[0.2em] text-[#8a6a39]">What this is not</p>
            <h2 className="mt-3 font-serif text-4xl font-black leading-tight">Not a booking form stapled to a recorder.</h2>
            <p className="mt-5 font-sans text-base leading-8 text-[#745b3c]">
              Quipsly is building the full coaching and capture spine: scheduling, payment evidence, room state, consent, local recording, provider recording receipts, uploads, transcripts, packets, review, and follow-up.
            </p>
            <p className="mt-4 font-sans text-sm font-bold uppercase leading-7 tracking-[0.13em] text-[#315d4f]">
              Quipsly Nest remains the source of truth. Public sites explain and route; operational records live in the workbench.
            </p>
            <div className="mt-5 rounded-2xl border border-[#dbc295] bg-white/70 p-4">
              <p className="font-sans text-xs font-black uppercase tracking-[0.15em] text-[#8a6a39]">Native capture contract</p>
              <p className="mt-2 font-sans text-sm leading-6 text-[#745b3c]">
                {QUIPSLY_NATIVE_CAPTURE_CONTRACT.uploadRule}
              </p>
              <p className="mt-2 font-sans text-sm leading-6 text-[#745b3c]">
                {QUIPSLY_NATIVE_CAPTURE_CONTRACT.deletionRule}
              </p>
            </div>
            <Link href="/#research-studio-tower" className="mt-7 inline-flex rounded-full bg-[#3b2418] px-5 py-3 font-sans text-xs font-black uppercase tracking-[0.14em] text-[#fff8ec] shadow-sm">
              Explore the system
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
