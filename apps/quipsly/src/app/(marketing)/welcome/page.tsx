import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, ListChecks, Mic2 } from "lucide-react";

const starts = [
  {
    title: "Schedule a Session",
    body: "Choose a time, invite your client, and let Quipsly keep the call and follow-through together.",
    Icon: CalendarDays,
  },
  {
    title: "Record a conversation",
    body: "Start a call or capture a high-quality local recording from your iPhone.",
    Icon: Mic2,
  },
  {
    title: "Bring work into one place",
    body: "Use notes, tasks, goals, recordings, transcripts, and shared spaces without a setup project.",
    Icon: ListChecks,
  },
];

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-[#f6efe6] px-6 py-10 text-[#4a2e1c]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="h-11 w-11 overflow-hidden rounded-xl border border-[#e8d0b5] bg-white shadow-sm">
            <Image src="/quipsly-app-icon.png" alt="Quipsly" width={88} height={88} className="h-full w-full object-cover" priority />
          </span>
          <span className="font-serif text-2xl font-black text-[#3d2618]">Quipsly</span>
        </Link>
        <Link href="/support" className="font-sans text-sm font-bold text-[#8c552e]">Help</Link>
      </nav>

      <section className="mx-auto max-w-6xl pb-20 pt-20 text-center">
        <p className="font-sans text-xs font-black uppercase tracking-[0.22em] text-[#a96735]">Welcome to Quipsly</p>
        <h1 className="mx-auto mt-4 max-w-4xl font-serif text-5xl font-black leading-tight text-[#3d2618] md:text-7xl">Start with the work you came here to do.</h1>
        <p className="mx-auto mt-6 max-w-2xl font-sans text-lg leading-8 text-[#8c552e]">
          Your workspace is ready. You do not need to configure a system before scheduling, recording, writing, or collaborating.
        </p>

        <div className="mt-12 grid gap-5 text-left md:grid-cols-3">
          {starts.map((start) => (
            <article key={start.title} className="rounded-[2rem] border border-[#e8d0b5] bg-white p-7 shadow-sm">
              <div className="inline-flex rounded-2xl bg-[#617c4d]/10 p-3 text-[#617c4d]"><start.Icon className="h-6 w-6" /></div>
              <h2 className="mt-5 font-serif text-2xl font-black text-[#3d2618]">{start.title}</h2>
              <p className="mt-3 font-sans text-sm leading-7 text-[#8c552e]">{start.body}</p>
            </article>
          ))}
        </div>

        <Link
          href="https://nest.quipsly.com/coaching"
          className="mt-10 inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-[#a96735] px-8 py-4 font-sans text-base font-black text-[#fdf5eb] shadow-md transition hover:bg-[#8c552e]"
        >
          Open Quipsly <ArrowRight className="h-5 w-5" />
        </Link>
        <p className="mt-4 font-sans text-sm text-[#8c552e]">You can change direction anytime. Your work stays available from the Nest.</p>
      </section>
    </main>
  );
}
