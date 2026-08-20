import Link from "next/link";
import { CalendarClock, Camera, CheckCircle2, Headphones, LockKeyhole, MonitorSmartphone, Mic2, ShieldCheck, Smartphone, UserRoundCheck } from "lucide-react";

import { auth } from "@/auth";
import {
  cleanSessionInvitationToken,
  inspectSessionInvitation,
} from "@/lib/server/session-invitation";
import { sessionExperienceForPurpose } from "@/lib/session-experience";

import { acceptSessionInvitationAction } from "./actions";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_INVITATION: "This invitation link is incomplete or invalid.",
  INVITATION_NOT_FOUND: "This invitation is no longer available. Ask the host for a new link.",
  INVITATION_EMAIL_MISMATCH: "The signed-in account does not match the invited email. Switch accounts and try again.",
  INVITATION_NOT_PENDING: "This invitation was already accepted or revoked.",
  INVITATION_ALREADY_CLAIMED: "This invitation was already used.",
  INVITATION_EXPIRED: "This invitation expired. Ask the host for a fresh link.",
  SESSION_NOT_JOINABLE: "This Session is no longer open for new participants.",
  INVITATION_ACCEPT_FAILED: "Quipsly could not accept this invitation safely. Nothing was granted.",
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatted(value: string | null) {
  if (!value) return "Time coordinated by the host";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

export default async function JoinSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[] }>;
}) {
  const query = await searchParams;
  const token = cleanSessionInvitationToken(one(query.token));
  const errorCode = one(query.error) || "";
  const [session, invitation] = await Promise.all([
    auth(),
    token ? inspectSessionInvitation(token) : Promise.resolve(null),
  ]);
  const callbackUrl = token ? `/sessions/join?token=${encodeURIComponent(token)}` : "/sessions/join";

  if (!invitation || !invitation.available) {
    const unavailableMessage = ERROR_MESSAGES[errorCode]
      || (invitation?.status === "EXPIRED"
        ? ERROR_MESSAGES.INVITATION_EXPIRED
        : invitation?.status === "ACCEPTED"
          ? ERROR_MESSAGES.INVITATION_NOT_PENDING
          : "This invitation is unavailable. Ask the host to create a new Session link.");
    return <main className="min-h-full bg-[#f7f0e3] px-5 py-12 text-[#3d3122]">
      <section className="mx-auto max-w-2xl rounded-[2rem] border border-amber-200 bg-[#fffaf0] p-8 shadow-sm" role="status">
        <LockKeyhole className="text-amber-700" aria-hidden="true" />
        <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-amber-800">Session invitation</p>
        <h1 className="mt-2 font-serif text-4xl font-black">This link cannot open a Session.</h1>
        <p className="mt-4 font-semibold leading-7 text-[#765f40]">{unavailableMessage}</p>
        <Link href="/projects" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[#3d3122] px-5 text-xs font-black uppercase tracking-wide text-white">Open Quipsly</Link>
      </section>
    </main>;
  }

  const experience = sessionExperienceForPurpose(invitation.room.purpose);
  const actorEmail = String(session?.user?.primaryEmail || session?.user?.email || "").trim().toLowerCase();
  const emailMatches = Boolean(actorEmail && actorEmail === invitation.recipientEmail);
  const accountSwitch = `/account/switch?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  return <main className="min-h-full bg-[#f7f0e3] px-4 py-8 text-[#3d3122] md:px-8 md:py-12">
    <div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-[#d8c7a7] bg-[#fffdf8] shadow-xl shadow-amber-950/10">
      <header className="bg-[#211a14] px-6 py-8 text-[#fff7e8] md:px-10">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#e7b15f]">You’re invited · {experience.label}</p>
        <h1 className="mt-3 max-w-4xl font-serif text-4xl font-black md:text-5xl">{invitation.room.title}</h1>
        <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-[#d8c6a6]">{invitation.room.hostName ? `${invitation.room.hostName} invited you to join this Quipsly Session.` : "You were invited to join this Quipsly Session."} Accepting gives this account access to this Session only—not the surrounding Nest.</p>
      </header>

      <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] md:p-10">
        <section>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4"><CalendarClock className="text-sky-800" aria-hidden="true" /><p className="mt-3 text-[10px] font-black uppercase tracking-wide text-sky-800">Scheduled</p><p className="mt-1 text-sm font-black text-sky-950">{formatted(invitation.room.scheduledStart)}</p></div>
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4"><UserRoundCheck className="text-violet-800" aria-hidden="true" /><p className="mt-3 text-[10px] font-black uppercase tracking-wide text-violet-800">Your Session role</p><p className="mt-1 text-sm font-black capitalize text-violet-950">{invitation.role.toLowerCase()}</p></div>
          </div>
          <div className="mt-5 rounded-2xl border border-[#e5d5b7] bg-white p-5">
            <h2 className="font-serif text-2xl font-black">A calm lobby before anything starts</h2>
            <ul className="mt-4 space-y-3 text-sm font-semibold leading-6 text-[#765f40]">
              <li className="flex gap-3"><Mic2 className="mt-0.5 shrink-0 text-violet-700" size={18} aria-hidden="true" />Choose and preview the exact microphone you want.</li>
              <li className="flex gap-3"><Camera className="mt-0.5 shrink-0 text-violet-700" size={18} aria-hidden="true" />Choose a camera or join audio-only.</li>
              <li className="flex gap-3"><Headphones className="mt-0.5 shrink-0 text-violet-700" size={18} aria-hidden="true" />Confirm your headphones and output before joining.</li>
              <li className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={18} aria-hidden="true" />Joining the conversation does not start recording. Recording and transcription require separate, visible consent.</li>
            </ul>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Ways to join this Session">
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <MonitorSmartphone className="text-sky-800" aria-hidden="true" />
              <h2 className="mt-3 font-black text-sky-950">Continue in a browser</h2>
              <p className="mt-1 text-xs font-semibold leading-5 text-sky-900">Use your phone, tablet, or desktop. Quipsly will let you choose the microphone, camera, and headphones available on that device.</p>
            </div>
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
              <Smartphone className="text-violet-800" aria-hidden="true" />
              <h2 className="mt-3 font-black text-violet-950">Use the iPhone app</h2>
              <p className="mt-1 text-xs font-semibold leading-5 text-violet-900">Choose Quipsly Capture after accepting. If it is not installed, Quipsly offers the current public TestFlight beta.</p>
            </div>
          </div>
        </section>

        <aside className="rounded-2xl border border-[#d8c7a7] bg-[#fffaf0] p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#987443]">Identity check</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">This link belongs to <strong className="text-[#3d3122]">{invitation.recipientEmailHint}</strong> and expires {formatted(invitation.expiresAt)}.</p>
          {!session?.user ? <>
            <p className="mt-4 text-sm font-semibold leading-6 text-[#765f40]">Sign in with the invited Google or Quipsly email. The link alone grants nothing. After acceptance, choose the browser or Quipsly Capture on iPhone.</p>
            <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-violet-800 px-5 text-xs font-black uppercase tracking-wide text-white">Sign in to choose how to join</Link>
          </> : emailMatches ? <>
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-950"><CheckCircle2 className="mr-2 inline" size={17} aria-hidden="true" />Signed in as {actorEmail}</div>
            {errorCode && ERROR_MESSAGES[errorCode] ? <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-900">{ERROR_MESSAGES[errorCode]}</p> : null}
            <form action={acceptSessionInvitationAction} className="mt-4">
              <input type="hidden" name="token" value={token} />
              <button className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-violet-800 px-5 text-xs font-black uppercase tracking-wide text-white">Accept and choose how to join</button>
            </form>
          </> : <>
            <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-950">You’re signed in as {actorEmail}. Switch to the invited account before accepting.</p>
            <Link href={accountSwitch} className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full border border-violet-300 bg-white px-5 text-xs font-black uppercase tracking-wide text-violet-950">Switch account</Link>
          </>}
        </aside>
      </div>
    </div>
  </main>;
}
