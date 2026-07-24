import type { Metadata } from "next";
import Link from "next/link";

import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";

export const metadata: Metadata = {
  title: "Account Deletion | High Ground Odyssey",
  description:
    "How to request account deletion for High Ground Odyssey and Quipsly capture accounts.",
};

const STEPS = [
  "Open the Quipsly capture app and go to Account.",
  "Choose Request deletion review and optionally include a reason.",
  "Quipsly records the request and routes it to the team review runway.",
  "The team checks export, payment, consent, recording, transcript, and retention obligations.",
  "After review, the request can be marked ready, completed, canceled, or rejected with operator notes.",
];

export default function AccountDeletionPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#071417_0%,#10252a_35%,#483c2c_100%)] pb-20 text-[var(--text-light)]">
      <PageContainer className="pt-10">
        <div className="mx-auto max-w-4xl space-y-8">
          <GlassPanel className="p-6 md:p-8">
            <PageEyebrow>Account deletion</PageEyebrow>
            <h1 className="m-0 mt-4 text-[clamp(2.4rem,6vw,5rem)] leading-[0.94] tracking-[-0.055em]">
              You can start deletion from inside the app.
            </h1>
            <p className="mb-0 mt-5 text-base leading-8 text-[rgba(245,239,230,0.86)]">
              Quipsly supports an in-app account deletion request path. Because the product can include coaching sessions, payment evidence, consent records, recordings, transcripts, and notes, deletion is reviewed before destructive action happens.
            </p>
          </GlassPanel>

          <GlassPanel className="p-6 md:p-8">
            <PageEyebrow>How it works</PageEyebrow>
            <ol className="mt-5 space-y-3 pl-0">
              {STEPS.map((step, index) => (
                <li key={step} className="flex gap-3 rounded-2xl border border-white/10 bg-white/6 p-4 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-flare/25 bg-flare/16 text-xs font-bold text-[var(--text-light)]">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </GlassPanel>

          <section className="grid gap-5 md:grid-cols-2">
            <GlassPanel className="p-6">
              <PageEyebrow>What may be deleted</PageEyebrow>
              <p className="mb-0 mt-4 text-sm leading-7 text-[rgba(245,239,230,0.78)]">
                Account profile data, app-owned preferences, recoverable local-upload evidence, notes, and other personal records may be eligible for deletion after review.
              </p>
            </GlassPanel>
            <GlassPanel className="p-6">
              <PageEyebrow>What may be retained</PageEyebrow>
              <p className="mb-0 mt-4 text-sm leading-7 text-[rgba(245,239,230,0.78)]">
                Payment evidence, consent records, safety logs, legal-retention records, and records needed to protect other participants may be retained when required or appropriate.
              </p>
            </GlassPanel>
          </section>

          <GlassPanel className="p-6 md:p-8">
            <PageEyebrow>Need help?</PageEyebrow>
            <p className="mb-0 mt-4 text-sm leading-7 text-[rgba(245,239,230,0.78)]">
              If you cannot access the app, contact the High Ground Odyssey team using the same email address you used for your account and ask for account deletion review.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/privacy"
                className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
              >
                Back to privacy
              </Link>
              <Link
                href="/coaching"
                className="rounded-full border border-flare/35 bg-flare/18 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/50 hover:bg-flare/24"
              >
                Coaching home
              </Link>
            </div>
          </GlassPanel>
        </div>
      </PageContainer>
    </main>
  );
}
