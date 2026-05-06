import Link from "next/link";

import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";

const sections = [
  {
    title: "High Ground Odyssey Text Messages",
    body: "High Ground Odyssey may send text messages related to coaching requests, scheduling, appointment coordination, reminders, and direct follow-up when a person chooses text as their preferred contact method or otherwise gives consent to receive text messages from us.",
  },
  {
    title: "How you opt in",
    body: "You opt in by providing your phone number and selecting Text as your preferred contact method in a High Ground Odyssey form, such as the coaching request form in your member dashboard. By doing so, you agree that High Ground Odyssey may contact you by text message about your coaching request or related scheduling details.",
  },
  {
    title: "Message frequency",
    body: "Message frequency varies based on your coaching request, scheduling needs, and follow-up. We do not use this text program for high-volume promotional blasts.",
  },
  {
    title: "Message and data rates",
    body: "Standard message and data rates may apply.",
  },
  {
    title: "How to opt out",
    body: "You can opt out of text messages at any time by replying STOP. After you reply STOP, we may send one final message confirming that you have been unsubscribed. After that, we will not send additional text messages unless you opt in again.",
  },
  {
    title: "Help",
    body: "For help, reply HELP or contact us through the High Ground Odyssey website.",
  },
  {
    title: "Carrier disclaimer",
    body: "Carriers are not liable for delayed or undelivered messages.",
  },
  {
    title: "Privacy",
    body: "We use your phone number and text message consent only to communicate with you about High Ground Odyssey coaching requests, scheduling, appointment coordination, reminders, and related follow-up. Text messaging opt-in data and consent will not be sold, rented, or shared with third parties for marketing purposes.",
  },
  {
    title: "Opt-in flow for review",
    body: "A coaching client signs in to High Ground Odyssey, opens the member dashboard, clicks Book a Coaching Session or Request Coaching, chooses Text as the preferred contact method, optionally enters a phone number, and submits the coaching request. This records the request and the selected preferred contact method in the High Ground Odyssey system.",
  },
];

export default function SmsOptInPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#08171b_0%,#10272d_16%,#18383d_40%,#6f5636_78%,#f3eadb_100%)] pb-20">
      <PageContainer className="pt-10">
        <div className="space-y-8">
          <GlassPanel className="p-6 text-[var(--text-light)] md:p-8">
            <PageEyebrow>Public Terms</PageEyebrow>
            <h1 className="m-0 mt-4 text-[clamp(2.3rem,5vw,4.4rem)] leading-[0.94] tracking-[-0.05em] text-[var(--text-light)]">
              Text Message Opt-In Terms
            </h1>
            <p className="mb-0 mt-5 max-w-[820px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
              This page explains how High Ground Odyssey uses text messaging for coaching requests and related follow-up. It is intended to make consent plain, limited, and easy to review.
            </p>
          </GlassPanel>

          <section className="grid gap-6">
            {sections.map((section) => (
              <GlassPanel key={section.title} className="p-6 text-[var(--text-light)]">
                <PageEyebrow>{section.title}</PageEyebrow>
                <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(245,239,230,0.9)]">
                  {section.body}
                </p>
              </GlassPanel>
            ))}
          </section>

          <GlassPanel className="p-6 text-[var(--text-light)]">
            <PageEyebrow>Last updated</PageEyebrow>
            <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(245,239,230,0.9)]">
              Last updated: May 2026
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/coaching"
                className="inline-flex rounded-full border border-flare/35 bg-flare/18 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/50 hover:bg-flare/24"
              >
                Back to Coaching
              </Link>
              <Link
                href="/dashboard?intent=coaching"
                className="inline-flex rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
              >
                Open Coaching Request
              </Link>
            </div>
          </GlassPanel>
        </div>
      </PageContainer>
    </main>
  );
}
