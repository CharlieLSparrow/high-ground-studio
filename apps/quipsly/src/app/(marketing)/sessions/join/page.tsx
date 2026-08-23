import Link from "next/link";
import { CalendarClock, CheckCircle2, ChevronDown, LockKeyhole, MonitorSmartphone } from "lucide-react";
import { redirect } from "next/navigation";

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
  PARTICIPANT_ACCESS_REMOVED: "Your access to this Session is no longer active. Ask the host to restore it.",
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

  const acceptedReentry = invitation?.status === "ACCEPTED";
  if (!invitation || (!invitation.available && !acceptedReentry)) {
    const unavailableMessage = ERROR_MESSAGES[errorCode]
      || (invitation?.status === "EXPIRED"
        ? ERROR_MESSAGES.INVITATION_EXPIRED
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

  const accessRemoved = acceptedReentry && !invitation.reentryAvailable;
  if (acceptedReentry && invitation.reentryAvailable && emailMatches) {
    redirect(`/sessions/${encodeURIComponent(invitation.room.id)}?mode=live`);
  }
  return <main className="grid min-h-full place-items-center bg-[#f7f0e3] px-4 py-8 text-[#3d3122] md:py-12">
    <section className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-[#d8c7a7] bg-[#fffdf8] shadow-xl shadow-amber-950/10">
      <header className="bg-[#211a14] px-6 py-7 text-[#fff7e8] md:px-8">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#e7b15f]">{experience.label} Session</p>
        <h1 className="mt-2 font-serif text-3xl font-black md:text-4xl">{invitation.room.title}</h1>
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#d8c6a6]">
          <CalendarClock size={16} aria-hidden="true" />
          {formatted(invitation.room.scheduledStart)}
        </p>
        {invitation.room.hostName ? <p className="mt-2 text-sm font-semibold text-[#d8c6a6]">With {invitation.room.hostName}</p> : null}
      </header>

      <div className="p-6 md:p-8">
        {accessRemoved ? <>
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950">Your access to this Session is no longer active. Ask the host to restore it.</p>
          <Link href="/projects" className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#3d3122] px-5 text-sm font-black text-white">Open Quipsly</Link>
        </> : !session?.user ? <>
          <h2 className="font-serif text-2xl font-black">Ready when you are</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">Continue with the email that received this invitation.</p>
          <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-violet-800 px-5 text-sm font-black text-white">Continue</Link>
        </> : emailMatches ? <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-950"><CheckCircle2 className="mr-2 inline" size={17} aria-hidden="true" />{actorEmail}</div>
          {errorCode && ERROR_MESSAGES[errorCode] ? <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-900">{ERROR_MESSAGES[errorCode]}</p> : null}
          <form action={acceptSessionInvitationAction} className="mt-4">
            <input type="hidden" name="token" value={token} />
            <button className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-violet-800 px-5 text-sm font-black text-white">Continue to Session</button>
          </form>
        </> : <>
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950">This invitation is for {invitation.recipientEmailHint}. You’re signed in as {actorEmail}.</p>
          <Link href={accountSwitch} className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-violet-800 px-5 text-sm font-black text-white">Switch account</Link>
        </>}

        {!accessRemoved ? <details className="mt-5 border-t border-[#eadfc9] pt-4 text-[#765f40]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-black text-[#5b472f]">
            <span className="flex items-center gap-2"><MonitorSmartphone size={17} aria-hidden="true" />What to expect</span>
            <ChevronDown size={17} aria-hidden="true" />
          </summary>
          <p className="pb-1 text-xs font-semibold leading-5">After continuing, choose this browser or Quipsly Capture on iPhone. You can check your microphone, headphones, and camera before joining. Recording starts only when someone deliberately starts it.</p>
        </details> : null}
      </div>
    </section>
  </main>;
}
