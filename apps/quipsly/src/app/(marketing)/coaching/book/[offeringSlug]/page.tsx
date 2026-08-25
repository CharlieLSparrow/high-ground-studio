import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, ShieldCheck } from "lucide-react";

import { loadPublicCoachingOfferings } from "@/lib/server/public-coaching-offerings";
import { BookingRequestClient } from "./booking-request-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Choose a coaching time | Quipsly",
  description: "Choose an available coaching time and request it in Quipsly.",
};

export default async function CoachingBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ offeringSlug: string }>;
  searchParams: Promise<{ slot?: string }>;
}) {
  const [{ offeringSlug }, query] = await Promise.all([params, searchParams]);
  const result = await loadPublicCoachingOfferings({ slug: offeringSlug });
  const offering = result.items[0];
  if (!offering) notFound();

  return (
    <main className="min-h-screen bg-[#f8efe0] text-[#332316]">
      <nav className="border-b border-[#e4cfaa]/70 bg-[#fff8ec]/95">
        <div className="mx-auto flex h-20 max-w-5xl items-center justify-between px-5">
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
              />
            </span>
            <span className="font-serif text-2xl font-black">Quipsly</span>
          </Link>
          <Link
            href="/public/coaching"
            className="text-sm font-bold text-[#315d4f]"
          >
            About coaching
          </Link>
        </div>
      </nav>

      <section className="mx-auto grid max-w-5xl gap-8 px-5 py-10 lg:grid-cols-[0.8fr_1.2fr] lg:py-16">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d9b66b] bg-[#fffaf1] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#7b5b2c]">
            <ShieldCheck className="h-4 w-4 text-[#315d4f]" />
            Private coaching request
          </div>
          <h1 className="mt-6 font-serif text-4xl font-black leading-tight sm:text-5xl">
            {offering.title}
          </h1>
          <p className="mt-4 text-lg leading-8 text-[#745b3c]">
            With {offering.coachName}
          </p>
          {offering.description ? (
            <p className="mt-4 leading-8 text-[#745b3c]">
              {offering.description}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3 text-sm font-bold text-[#654d32]">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2">
              <Clock className="h-4 w-4 text-[#315d4f]" />
              {offering.durationMinutes} minutes
            </span>
            {offering.priceLabel ? (
              <span className="rounded-full bg-white/70 px-4 py-2">
                {offering.priceLabel}
              </span>
            ) : null}
          </div>
          <div className="mt-8 rounded-2xl border border-[#d7c39e] bg-[#fffaf1]/75 p-4 text-sm leading-7 text-[#745b3c]">
            Pick a time, sign in if needed, and send the request. You do not
            need to configure a calendar, microphone, camera, or recording
            permission yet.
          </div>
        </div>

        <BookingRequestClient
          offering={offering}
          initialSelectedInstant={query.slot || null}
        />
      </section>
    </main>
  );
}
