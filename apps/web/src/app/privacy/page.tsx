import type { Metadata } from "next";
import Link from "next/link";

import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";

export const metadata: Metadata = {
  title: "Privacy and Recording | High Ground Odyssey",
  description:
    "How High Ground Odyssey and Quipsly handle coaching capture, recordings, transcripts, payments, and account deletion requests.",
};

const DATA_ROWS = [
  {
    label: "Account and contact",
    body: "Name, email, sign-in identity, profile details, and contact preferences used to run coaching, podcast, research, and member workflows.",
  },
  {
    label: "Scheduling and booking",
    body: "Session requests, availability, booking holds, appointment details, calendar evidence, coach/client roles, and operator notes.",
  },
  {
    label: "Payments",
    body: "Stripe checkout, customer, payment, refund, and webhook evidence for eligible one-to-one coaching services. Quipsly keeps its own booking truth and treats Stripe as payment evidence.",
  },
  {
    label: "Recordings and uploads",
    body: "Audio or video recordings you explicitly start, local upload state, chunk evidence, storage object paths, recovery diagnostics, and verification status.",
  },
  {
    label: "Transcripts and notes",
    body: "Transcript jobs, speaker/timing segments, transcript corrections, coaching notes, highlights, action-item candidates, and follow-up packets.",
  },
  {
    label: "Diagnostics",
    body: "Basic device, upload, network, error, and recovery information needed to keep recordings from disappearing when a connection or provider misbehaves.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#071417_0%,#10252a_35%,#483c2c_100%)] pb-20 text-[var(--text-light)]">
      <PageContainer className="pt-10">
        <div className="mx-auto max-w-5xl space-y-8">
          <GlassPanel className="p-6 md:p-8">
            <PageEyebrow>Privacy and recording</PageEyebrow>
            <h1 className="m-0 mt-4 max-w-4xl text-[clamp(2.4rem,6vw,5.4rem)] leading-[0.92] tracking-[-0.055em]">
              Recording should feel explicit, useful, and never sneaky.
            </h1>
            <p className="mb-0 mt-5 max-w-3xl text-base leading-8 text-[rgba(245,239,230,0.86)]">
              High Ground Odyssey uses Quipsly to schedule coaching and podcast sessions, capture recordings with consent, upload them safely, transcribe them, and turn them into reviewable notes and follow-up work. This page explains the current product posture in plain language while the system moves toward beta.
            </p>
          </GlassPanel>

          <section className="grid gap-5 md:grid-cols-2">
            <GlassPanel className="p-6">
              <PageEyebrow>Consent first</PageEyebrow>
              <h2 className="m-0 mt-3 text-3xl font-semibold tracking-[-0.04em]">No hidden recording.</h2>
              <p className="mb-0 mt-4 text-sm leading-7 text-[rgba(245,239,230,0.78)]">
                Recording should begin only after participants know the session is being recorded and consent is granted. Consent can be granted, declined, or revoked. If consent is revoked during a mobile capture session, the app should stop local capture and preserve the source file for review and retention handling.
              </p>
            </GlassPanel>

            <GlassPanel className="p-6">
              <PageEyebrow>Source truth</PageEyebrow>
              <h2 className="m-0 mt-3 text-3xl font-semibold tracking-[-0.04em]">Providers are evidence.</h2>
              <p className="mb-0 mt-4 text-sm leading-7 text-[rgba(245,239,230,0.78)]">
                Stripe, calendars, call providers, storage buckets, and transcription providers are evidence feeds. Quipsly owns the booking, consent, recording, transcript, notes, and action-item chain so users and operators can understand what happened.
              </p>
            </GlassPanel>
          </section>

          <GlassPanel className="p-6 md:p-8">
            <PageEyebrow>Data we expect to handle</PageEyebrow>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {DATA_ROWS.map((row) => (
                <div key={row.label} className="rounded-2xl border border-white/10 bg-white/6 p-4">
                  <h3 className="m-0 text-lg font-semibold">{row.label}</h3>
                  <p className="mb-0 mt-2 text-sm leading-6 text-[rgba(245,239,230,0.74)]">{row.body}</p>
                </div>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel className="p-6 md:p-8">
            <PageEyebrow>Retention and deletion</PageEyebrow>
            <h2 className="m-0 mt-3 text-3xl font-semibold tracking-[-0.04em]">Deletion is reviewed because recordings have obligations.</h2>
            <p className="mb-0 mt-4 text-sm leading-7 text-[rgba(245,239,230,0.78)]">
              Users can request account deletion from inside the iOS capture app. Quipsly reviews deletion requests before destructive deletion because an account may contain coaching bookings, consent records, payment evidence, recordings, transcripts, notes, and legal or operational retention obligations.
            </p>
            <div className="mt-5">
              <Link
                href="/privacy/account-deletion"
                className="inline-flex rounded-full border border-flare/35 bg-flare/18 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/50 hover:bg-flare/24"
              >
                Account deletion details
              </Link>
            </div>
          </GlassPanel>
        </div>
      </PageContainer>
    </main>
  );
}
