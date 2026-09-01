import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, ShieldCheck } from "lucide-react";

import { loadPublicCoachingOfferings } from "@/lib/server/public-coaching-offerings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find a coaching time | Quipsly",
  description:
    "Choose a coach and request one of their available coaching times in Quipsly.",
};

export default async function PublicCoachingPage() {
  const offerings = await loadPublicCoachingOfferings();

  return (
    <main className="min-h-screen bg-[#f8efe0] text-[#332316]">
      <nav className="border-b border-[#e4cfaa]/70 bg-[#fff8ec]/95">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5">
          <Link
            href="/"
            className="flex items-center gap-3 text-[#332316] no-underline"
          >
            <span className="h-11 w-11 overflow-hidden rounded-2xl border border-[#e4cfaa] bg-white">
              <Image
                src="/quipsly-app-icon.png"
                alt="Quipsly"
                width={88}
                height={88}
                className="h-full w-full object-cover"
                priority
              />
            </span>
            <span className="font-serif text-2xl font-black">Quipsly</span>
          </Link>
          <Link href="/coaches" className="text-sm font-bold text-[#315d4f]">
            Quipsly for coaches
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:pt-16">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d9b66b] bg-[#fffaf1] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#7b5b2c]">
            <ShieldCheck className="h-4 w-4 text-[#315d4f]" />
            Private coaching in Quipsly
          </div>
          <h1 className="mt-6 font-serif text-4xl font-black leading-tight sm:text-6xl">
            Choose your coach, then choose a time.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#745b3c]">
            Pick an available Session below. Quipsly will ask you to sign in
            only when you send the request, and your coach will confirm it
            before the Session begins.
          </p>
        </div>

        {offerings.items.length ? (
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {offerings.items.map((offering) => (
              <article
                key={offering.id}
                className="flex min-h-72 flex-col rounded-[2rem] border border-[#dbc295] bg-[#fffaf1] p-6 shadow-sm"
              >
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#315d4f]">
                  {offering.coachName}
                </p>
                <h2 className="mt-3 font-serif text-2xl font-black leading-tight">
                  {offering.title}
                </h2>
                {offering.description ? (
                  <p className="mt-3 line-clamp-3 text-sm leading-7 text-[#745b3c]">
                    {offering.description}
                  </p>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-2 text-sm font-bold text-[#654d32]">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-2">
                    <Clock className="h-4 w-4 text-[#315d4f]" />
                    {offering.durationMinutes} minutes
                  </span>
                  {offering.priceLabel ? (
                    <span className="rounded-full bg-white/75 px-3 py-2">
                      {offering.priceLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-5 flex items-center gap-2 text-sm text-[#745b3c]">
                  <CalendarDays className="h-4 w-4 shrink-0 text-[#315d4f]" />
                  {offering.bookableSlots.length
                    ? `${offering.bookableSlots.length} times available`
                    : "No open times right now"}
                </p>
                <Link
                  href={offering.bookingPath}
                  className="mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#315d4f] px-5 py-3 text-sm font-black text-white no-underline"
                >
                  {offering.bookableSlots.length
                    ? "Choose a time"
                    : "View coaching details"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-10 max-w-2xl rounded-[2rem] border border-[#dbc295] bg-[#fffaf1] p-6">
            <h2 className="font-serif text-2xl font-black">
              No coaching times are published right now.
            </h2>
            <p className="mt-3 text-sm leading-7 text-[#745b3c]">
              If a coach sent you a private booking link, open that link
              directly. Otherwise, check back when they publish new times.
            </p>
            {offerings.unavailable ? (
              <p className="mt-4 text-sm font-bold text-[#8a4f35]">
                Quipsly could not load current availability. Please try again in
                a moment.
              </p>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
