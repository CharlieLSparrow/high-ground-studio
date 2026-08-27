import Link from "next/link";
import { ArrowLeft, BarChart3, CalendarDays, Cloud, KeyRound, Mic, Shield, Trash2 } from "lucide-react";

import { AnalyticsPrivacyButton } from "@/components/quipsly-product-analytics";

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
          Your work stays private, understandable, and yours.
        </h1>
        <p className="text-[#8c552e] font-sans leading-relaxed mb-8 text-lg">
          Quipsly Nest is the private workspace side of Quipsly: notes, manuscripts, coaching sessions, podcast recordings, transcripts, research packets, and publishing preparation. We keep your work connected and editable so automation can help without taking control away from you.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-3xl border border-[#ead8c2] bg-[#fffaf3] p-6 font-sans">
            <Mic className="mb-3 h-6 w-6 text-[#a96735]" />
            <h2 className="mb-2 font-serif text-2xl font-bold text-[#3d2618]">Recording and transcription</h2>
            <p className="leading-relaxed text-[#7a604c]">
              Coaching calls, podcast sessions, interviews, and field notes are recorded only after an explicit user action and visible consent flow. Participants can grant, decline, or revoke recording consent. Transcripts, notes, tasks, and goals are ordinary editable work that you can change, share, or remove.
            </p>
          </section>
          <section className="rounded-3xl border border-[#ead8c2] bg-[#fffaf3] p-6 font-sans">
            <Shield className="mb-3 h-6 w-6 text-[#a96735]" />
            <h2 className="mb-2 font-serif text-2xl font-bold text-[#3d2618]">What Quipsly stores</h2>
            <p className="leading-relaxed text-[#7a604c]">
              Quipsly may store account identity, email, workspace access, bookings, subscription and payment records, call-room state, consent records, recordings you upload, transcript jobs, transcript segments, notes, action items, diagnostics, and publishing records.
            </p>
          </section>
          <section className="rounded-3xl border border-[#ead8c2] bg-[#fffaf3] p-6 font-sans md:col-span-2">
            <CalendarDays className="mb-3 h-6 w-6 text-[#a96735]" />
            <h2 className="mb-2 font-serif text-2xl font-bold text-[#3d2618]">Optional Google Calendar connection</h2>
            <div className="space-y-3 leading-relaxed text-[#7a604c]">
              <p>
                Connecting Google Calendar is optional and separate from signing in to Quipsly. Quipsly asks only to read the list of calendars available to you and to view and manage events on calendars you own. You choose the owned calendar and the Quipsly production or coaching lane before any event is written.
              </p>
              <p>
                Quipsly uses this access to show your selected calendar in Quipsly, create or update the events you explicitly project, detect scheduling conflicts, and reconcile later changes so you can review them. Quipsly stores the selected calendar identifier, encrypted refresh credentials, provider event identifiers, synchronization cursors, and audit receipts needed to keep that connection reliable. Short-lived Google access tokens are not stored.
              </p>
              <p>
                Google Calendar data is not sold, used for advertising, or used to train general-purpose AI models. It is not shared with other Quipsly members unless you deliberately place the resulting schedule information in a shared workspace. Infrastructure providers may process the minimum data needed to operate Quipsly under their service agreements. Quipsly&apos;s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including its Limited Use requirements.
              </p>
            </div>
          </section>
          <section className="rounded-3xl border border-[#ead8c2] bg-[#fffaf3] p-6 font-sans md:col-span-2">
            <Cloud className="mb-3 h-6 w-6 text-[#a96735]" />
            <h2 className="mb-2 font-serif text-2xl font-bold text-[#3d2618]">Optional Google Drive source connection</h2>
            <div className="space-y-3 leading-relaxed text-[#7a604c]">
              <p>
                Connecting Google Drive is optional and separate from signing in or connecting Calendar. Quipsly requests the selected-file <code>drive.file</code> permission so you choose which files become available to Quipsly; it does not request normal access to browse every file in your Drive.
              </p>
              <p>
                Quipsly stores the selected file identity, revision and checksum evidence Google provides, file metadata, current download capability, encrypted refresh credentials, and audit receipts. Short-lived access tokens are sent only to the signed-in browser for Google Picker and are not stored. Provider locators and resource keys are withheld from shared editor responses.
              </p>
              <p>
                Originals can remain in Google Drive. Quipsly may create a bounded proxy, thumbnail, waveform, transcript, or output only when the user requests that work. Google Drive data is not sold, used for advertising, or used to train general-purpose AI models. Quipsly&apos;s use and transfer of information received from Google APIs follows the Google API Services User Data Policy, including Limited Use requirements.
              </p>
            </div>
          </section>
          <section className="rounded-3xl border border-[#ead8c2] bg-[#fffaf3] p-6 font-sans md:col-span-2">
            <KeyRound className="mb-3 h-6 w-6 text-[#a96735]" />
            <h2 className="mb-2 font-serif text-2xl font-bold text-[#3d2618]">Google connection control and revocation</h2>
            <p className="leading-relaxed text-[#7a604c]">
              You can disconnect Google Calendar from Quipsly at any time, and you can disconnect Google Drive independently. Quipsly asks Google to revoke the credential, deletes the encrypted credential from the active connection, and stops future provider access. Existing Calendar events remain under your control. Existing Drive-backed cards retain their source intent but new proxy and exact-source render work is held until you reconnect. You can also review or revoke Quipsly from your Google Account&apos;s third-party access settings.
            </p>
            <a
              href="https://myaccount.google.com/connections"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex rounded-full border border-[#c99768] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#6c4329] transition hover:bg-[#f7e7d5]"
            >
              Google account access
            </a>
          </section>
          <section className="rounded-3xl border border-[#ead8c2] bg-[#fffaf3] p-6 font-sans md:col-span-2">
            <BarChart3 className="mb-3 h-6 w-6 text-[#a96735]" />
            <h2 className="mb-2 font-serif text-2xl font-bold text-[#3d2618]">Product analytics</h2>
            <div className="space-y-3 leading-relaxed text-[#7a604c]">
              <p>
                Quipsly uses Google Analytics 4 and an app-owned event ledger to understand whether people can complete important workflows and where the product needs improvement. Analytics events use a fixed vocabulary and redacted route categories. Quipsly does not send session titles, resource identifiers, names, email addresses, notes, transcripts, recordings, or other creative and coaching content to Google Analytics.
              </p>
              <p>
                Advertising storage, advertising personalization, and Google Signals are disabled. Analytics storage begins denied; you can allow or decline analytics cookies in the product and change that choice here. Quipsly&apos;s own authenticated event receipts remain limited to operational product events needed to run, support, secure, and improve the service.
              </p>
            </div>
            <AnalyticsPrivacyButton className="mt-5 inline-flex rounded-full border border-[#c99768] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#6c4329] transition hover:bg-[#f7e7d5]" />
          </section>
          <section className="rounded-3xl border border-[#ead8c2] bg-[#fffaf3] p-6 font-sans md:col-span-2">
            <Trash2 className="mb-3 h-6 w-6 text-[#a96735]" />
            <h2 className="mb-2 font-serif text-2xl font-bold text-[#3d2618]">Deletion requests</h2>
            <p className="leading-relaxed text-[#7a604c]">
              You can start account deletion from the mobile app or the deletion page below. Quipsly handles attached work and required retention in the background, explains anything that cannot be removed immediately, and completes eligible deletion without asking you to inventory the system yourself.
            </p>
            <Link href="/privacy/account-deletion" className="mt-5 inline-flex rounded-full bg-[#3d2618] px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#6c4329]">
              Account deletion
            </Link>
          </section>
        </div>

        <div className="mt-8 space-y-2 text-sm text-[#a96735] font-sans">
          <p>
            Privacy questions: <a className="font-bold underline underline-offset-4" href="mailto:charlie@highgroundodyssey.com">charlie@highgroundodyssey.com</a>
          </p>
          <p className="italic">Last updated: August 27, 2026.</p>
        </div>
      </div>
      </main>
    </div>
  );
}
