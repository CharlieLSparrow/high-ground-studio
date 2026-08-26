import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import {
  CalendarDays,
  CheckCircle2,
  FileAudio,
  ListChecks,
  MessagesSquare,
  Mic2,
  Scissors,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from "lucide-react";

import { CoachPricing } from "../components/CoachPricing";

export const metadata: Metadata = {
  title: "Quipsly for Coaches | Calls, Recording, Transcripts, and Follow-Through",
  description:
    "Schedule coaching, invite clients, meet and record, edit the transcript, and collaborate on notes, tasks, and goals in one calm workspace.",
};

const flow = [
  {
    title: "Schedule",
    body: "Create one Session or a recurring series, choose the time, and send one invitation.",
    Icon: CalendarDays,
  },
  {
    title: "Meet and record",
    body: "Join from iPhone or the web. Each participant records a protected local source while the call stays simple.",
    Icon: Mic2,
  },
  {
    title: "Edit",
    body: "Correct speaker-attributed words, trim the timeline, and remove a passage from the recording by editing its text.",
    Icon: Scissors,
  },
  {
    title: "Follow through",
    body: "Quipsly creates editable notes, tasks, and goals in the same private client space so the conversation keeps moving.",
    Icon: ListChecks,
  },
];

const productPromises = [
  {
    title: "One invitation, any familiar device",
    body: "Clients can join from a phone, tablet, or computer. Invited clients do not need a paid coaching subscription.",
    Icon: UserPlus,
  },
  {
    title: "Originals survive interruptions",
    body: "Participant-owned source recordings remain recoverable through app closes and network drops, then resume syncing when the connection returns.",
    Icon: FileAudio,
  },
  {
    title: "Collaboration lives beside the call",
    body: "Shared notes, private notes, tasks, goals, forms, messages, recordings, and transcripts stay attached to the coaching relationship.",
    Icon: MessagesSquare,
  },
  {
    title: "Automation you can simply edit",
    body: "Quipsly does the first pass after a Session. The result behaves like ordinary work you can change, assign, complete, share, or delete.",
    Icon: Sparkles,
  },
];

export default function CoachesPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f8efe0] text-[#342315] selection:bg-[#d9b66b]/40">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(95,133,91,0.22),transparent_34%),radial-gradient(circle_at_80%_5%,rgba(213,166,79,0.18),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.58),rgba(255,255,255,0))]" />

      <nav className="sticky top-0 z-40 border-b border-[#e4cfaa]/70 bg-[#fff8ec]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="h-12 w-12 overflow-hidden rounded-2xl border border-[#e4cfaa] bg-white shadow-sm">
              <Image src="/quipsly-app-icon.png" alt="Quipsly" width={96} height={96} className="h-full w-full object-cover" priority />
            </span>
            <span>
              <span className="block font-serif text-2xl font-black leading-none">Quipsly</span>
              <span className="block font-sans text-[10px] font-black uppercase tracking-[0.22em] text-[#8a6a39]">Coaching</span>
            </span>
          </Link>
          <div className="hidden items-center gap-6 font-sans text-sm font-bold text-[#6d5637] md:flex">
            <a href="#how-it-works" className="hover:text-[#1f493e]">How it works</a>
            <a href="#pricing" className="hover:text-[#1f493e]">Pricing</a>
            <Link href="/support" className="hover:text-[#1f493e]">Support</Link>
          </div>
          <Link
            href="https://nest.quipsly.com/login?callbackUrl=%2Fsettings%3Fsubscribe%3Dannual%23subscription"
            className="rounded-full bg-[#315d4f] px-4 py-2 font-sans text-xs font-black uppercase tracking-[0.12em] text-[#fff8ec] shadow-sm"
          >
            Start free trial
          </Link>
        </div>
      </nav>

      <section className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-12 md:px-8 lg:grid-cols-[1.03fr_0.97fr] lg:pb-24 lg:pt-20">
        <div className="flex flex-col justify-center">
          <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-[#d9b66b]/70 bg-[#fffaf1]/90 px-4 py-2 font-sans text-xs font-black uppercase tracking-[0.18em] text-[#7b5b2c] shadow-sm">
            <ShieldCheck className="h-4 w-4 text-[#315d4f]" />
            Your coaching practice in one place
          </div>
          <h1 className="max-w-5xl font-serif text-5xl font-black leading-[0.94] tracking-tight text-[#2f2418] md:text-7xl lg:text-8xl">
            From booking to breakthrough to follow-through.
          </h1>
          <p className="mt-7 max-w-3xl font-sans text-xl leading-9 text-[#745b3c]">
            Schedule a coaching Session, invite your client, meet and record, edit the transcript, and keep the notes, tasks, and goals moving together—without stitching five apps into a practice.
          </p>
          <div className="mt-9 flex flex-col gap-3 font-sans sm:flex-row">
            <Link
              href="https://nest.quipsly.com/login?callbackUrl=%2Fsettings%3Fsubscribe%3Dannual%23subscription"
              className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-[#3b2418] px-7 py-4 text-sm font-black uppercase tracking-[0.14em] text-[#fff8ec] shadow-lg shadow-[#3b2418]/15"
            >
              Start 14-day free trial
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-[#b99052] bg-white/80 px-7 py-4 text-sm font-black uppercase tracking-[0.14em] text-[#6d4b22] shadow-sm"
            >
              See how it works
            </a>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-sans text-sm font-semibold text-[#5d6f54]">
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> No charge for 14 days</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Clients join free</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Cancel anytime</span>
          </div>
        </div>

        <div className="relative min-h-[560px]">
          <div className="absolute inset-0 rounded-[3rem] bg-[#315d4f]/10 blur-3xl" />
          <div className="relative overflow-hidden rounded-[3rem] border border-[#d9b66b]/60 bg-[#fffaf1] p-4 shadow-2xl shadow-[#5d4527]/15">
            <Image
              src="/images/quipsly-generated/cute_quipsly_scientist_professor.webp"
              alt="A friendly Quipsly coaching assistant organizing a Session"
              width={1200}
              height={1200}
              priority
              className="aspect-[4/5] w-full rounded-[2.35rem] object-cover"
            />
            <div className="absolute bottom-8 left-8 right-8 rounded-[2rem] border border-white/50 bg-[#1d382f]/90 p-6 text-[#fff8ec] shadow-xl backdrop-blur-md">
              <div className="mb-2 flex items-center gap-2 font-sans text-xs font-black uppercase tracking-[0.18em] text-[#f4d58e]">
                <Sparkles className="h-4 w-4" />
                After every Session
              </div>
              <p className="font-serif text-2xl font-black leading-tight">
                The recording, transcript, notes, tasks, and goals are already together when the call ends.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative z-10 mx-auto max-w-7xl px-5 py-14 md:px-8">
        <div className="mb-8 max-w-3xl">
          <p className="font-sans text-xs font-black uppercase tracking-[0.2em] text-[#8a6a39]">One calm loop</p>
          <h2 className="mt-3 font-serif text-4xl font-black leading-tight md:text-6xl">The admin fades. The coaching stays.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {flow.map((step, index) => (
            <article key={step.title} className="rounded-[2rem] border border-[#dbc295] bg-[#fffaf1]/88 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="inline-flex rounded-2xl bg-[#315d4f] p-3 text-[#fff8ec]"><step.Icon className="h-6 w-6" /></div>
                <span className="font-serif text-4xl font-black text-[#d8bd8e]">{index + 1}</span>
              </div>
              <h3 className="mt-5 font-serif text-2xl font-black">{step.title}</h3>
              <p className="mt-3 font-sans text-sm leading-7 text-[#745b3c]">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-14 md:px-8">
        <div className="grid gap-4 md:grid-cols-2">
          {productPromises.map((item) => (
            <article key={item.title} className="rounded-[2.25rem] border border-[#dbc295] bg-white/75 p-7 shadow-sm">
              <div className="inline-flex rounded-2xl bg-[#315d4f]/10 p-3 text-[#315d4f]"><item.Icon className="h-6 w-6" /></div>
              <h3 className="mt-5 font-serif text-3xl font-black">{item.title}</h3>
              <p className="mt-3 font-sans text-base leading-8 text-[#745b3c]">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <CoachPricing />

      <footer className="relative z-10 border-t border-[#dbc295] bg-[#fff8ec]/80 px-5 py-10 font-sans text-sm text-[#745b3c] md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <p>© 2026 Quipsly, operated by High Ground Odyssey.</p>
          <div className="flex flex-wrap gap-5 font-bold text-[#5d4527]">
            <Link href="/pricing">Pricing</Link>
            <Link href="/support">Support</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
