import Link from "next/link";
import { ArrowLeft, Mic, Shield, Trash2 } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#fdf5eb] text-[#4a2e1c] font-serif selection:bg-[#f4dab0]/50 relative p-6">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 p-6 flex justify-start max-w-7xl mx-auto">
        <Link href="/" className="text-sm font-bold text-[#a96735] hover:text-[#4a2e1c] transition-colors flex items-center gap-2 font-sans">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
      </nav>

      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center py-24">
      <div className="bg-white border border-[#e8d0b5] rounded-[3rem] p-10 md:p-16 shadow-sm">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#fdf5eb] border border-[#e8d0b5] mb-6">
          <Shield className="w-8 h-8 text-[#a96735]" />
        </div>
        <p className="mb-3 font-sans text-xs font-black uppercase tracking-[0.32em] text-[#a96735]">
          Quipsly Privacy
        </p>
        <h1 className="text-3xl md:text-5xl font-bold text-[#3d2618] tracking-tight mb-4">
          Your work stays inspectable, consented, and yours.
        </h1>
        <p className="text-[#8c552e] font-sans leading-relaxed mb-8 text-lg">
          Quipsly Nest is the private workspace side of Quipsly: notes, manuscripts, coaching sessions, podcast recordings, transcripts, research packets, and publishing preparation. We design it so people and agents can see what happened, why it happened, and what still needs approval.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-3xl border border-[#ead8c2] bg-[#fffaf3] p-6 font-sans">
            <Mic className="mb-3 h-6 w-6 text-[#a96735]" />
            <h2 className="mb-2 font-serif text-2xl font-bold text-[#3d2618]">Recording and transcription</h2>
            <p className="leading-relaxed text-[#7a604c]">
              Coaching calls, podcast sessions, interviews, and field notes are recorded only after an explicit user action and visible consent flow. Participants can grant, decline, or revoke recording consent. Transcripts, notes, and action items are review artifacts, not hidden automation.
            </p>
          </section>
          <section className="rounded-3xl border border-[#ead8c2] bg-[#fffaf3] p-6 font-sans">
            <Shield className="mb-3 h-6 w-6 text-[#a96735]" />
            <h2 className="mb-2 font-serif text-2xl font-bold text-[#3d2618]">What Quipsly stores</h2>
            <p className="leading-relaxed text-[#7a604c]">
              Quipsly may store account identity, email, workspace access, bookings, Stripe payment evidence, call-room state, consent records, recordings you upload, transcript jobs, transcript segments, notes, action items, diagnostics, and publishing receipts.
            </p>
          </section>
          <section className="rounded-3xl border border-[#ead8c2] bg-[#fffaf3] p-6 font-sans md:col-span-2">
            <Trash2 className="mb-3 h-6 w-6 text-[#a96735]" />
            <h2 className="mb-2 font-serif text-2xl font-bold text-[#3d2618]">Deletion requests</h2>
            <p className="leading-relaxed text-[#7a604c]">
              You can request account deletion from the mobile app or from the deletion page below. Deletion is reviewed before destructive action because a Quipsly account can be attached to bookings, payments, consent evidence, recordings, transcripts, and coaching records that may require export, retention, or legal review.
            </p>
            <Link href="/privacy/account-deletion" className="mt-5 inline-flex rounded-full bg-[#3d2618] px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#6c4329]">
              Account deletion
            </Link>
          </section>
        </div>

        <p className="mt-8 text-sm text-[#a96735] font-sans italic">
          Beta policy surface. Last updated: July 2026.
        </p>
      </div>
      </main>
    </div>
  );
}
