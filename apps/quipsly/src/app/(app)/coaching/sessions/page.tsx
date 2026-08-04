"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Mic,
  RefreshCw,
  Receipt,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import {
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} from "@/lib/mobile-capture-consent-policy.js";

type SessionTone = "good" | "warn" | "bad" | "warm" | "blue";
type ConsentAction = "GRANT" | "DECLINE" | "REVOKE";
type ConsentGrantChoices = {
  canRecordAudio: boolean;
  canRecordVideo: boolean;
  canTranscribe: boolean;
  allAudibleParticipantsNotifiedAndAgreed: boolean;
};

type MobileCaptureSession = {
  id: string;
  callRoomId: string;
  updatedAt?: string | null;
  participantId?: string | null;
  title: string;
  purpose?: string | null;
  status?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  scheduledTimezone?: string | null;
  canSchedule?: boolean;
  clientLabel?: string | null;
  coachLabel?: string | null;
  bookingStatus?: string | null;
  paymentPolicy?: string | null;
  paymentRequired?: boolean;
  paymentResolved?: boolean;
  paymentStatus?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  latestCheckoutUrl?: string | null;
  latestCheckoutStatus?: string | null;
  latestCheckoutExpiresAt?: string | null;
  calendarStatus?: string | null;
  recordingConsentId?: string | null;
  recordingConsentStatus?: string | null;
  recordingConsentGranted?: boolean;
  canRecordNow?: boolean;
  providerCanJoin?: boolean;
  providerReadiness?: string | null;
  providerNextAction?: string | null;
  captureReadiness?: {
    label?: string | null;
    detail?: string | null;
    nextAction?: string | null;
    blockers?: string[];
  } | null;
  journeySummary?: {
    stage?: string | null;
    paymentStage?: string | null;
    packetStage?: string | null;
    nextAction?: string | null;
    blockers?: string[];
  } | null;
  actionPacket?: {
    stage?: string | null;
    nextAction?: string | null;
    capabilities?: {
      canJoin?: boolean;
      canStartLocalRecording?: boolean;
      canRunTranscript?: boolean;
      canBuildPacket?: boolean;
      canReviewPacket?: boolean;
    };
    blockers?: string[];
  } | null;
  recordingCount?: number;
  latestRecordingAssetStatus?: string | null;
  latestTranscriptStatus?: string | null;
  latestTranscriptSegmentCount?: number;
  coachingPacketStatus?: string | null;
  coachingPacketTitle?: string | null;
  coachingPacketPreview?: string | null;
  coachingPacketHighlightCount?: number;
  coachingPacketActionItemCount?: number;
  afterCaptureNextAction?: string | null;
  nextAction?: string | null;
  coachingEngagementId?: string | null;
  coachingEngagementTitle?: string | null;
};

type SessionsResponse = {
  ok: boolean;
  error?: string;
  user?: {
    id: string;
    email: string | null;
    name: string | null;
    isStaff?: boolean;
    canCreateCaptureSessions?: boolean;
  };
  captureProjects?: Array<{
    id: string;
    slug: string;
    name: string;
    role: "OWNER" | "EDITOR";
  }>;
  coachingEngagements?: Array<{
    id: string;
    title: string;
    status: string;
    projectId: string;
    projectSlug: string;
    projectName: string;
    clientLabel?: string | null;
    coachLabel?: string | null;
  }>;
  sessions?: MobileCaptureSession[];
};

type SessionCreateResponse = {
  ok: boolean;
  error?: string;
  session?: MobileCaptureSession;
  boundaries?: {
    recordingStarted?: boolean;
    providerJoined?: boolean;
    providerTokenMinted?: boolean;
    calendarMutated?: boolean;
    stripeMutated?: boolean;
    externalInviteSent?: boolean;
    nextAction?: string;
  };
};

type SessionScheduleResponse = {
  ok: boolean;
  error?: string;
  session?: {
    roomId?: string;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    timezone?: string | null;
    updatedAt?: string | null;
    replayed?: boolean;
  };
  boundaries?: {
    quipslyScheduleUpdated?: boolean;
    externalCalendarMutated?: boolean;
    externalInviteSent?: boolean;
    recordingStarted?: boolean;
    nextAction?: string;
  };
};

type ConsentResponse = {
  ok: boolean;
  error?: string;
  session?: {
    callRoomId?: string;
    recordingConsentStatus?: string;
    recordingConsentGranted?: boolean;
    nextAction?: string;
  };
};

function normalize(value?: string | null) {
  return value ? value.toLowerCase().replaceAll("_", " ").replaceAll("-", " ") : "not set";
}

function titleCase(value?: string | null) {
  return normalize(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value?: string | null) {
  if (!value) return "Time not set yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time needs review";
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function money(cents?: number | null, currency = "USD") {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents <= 0) return "No price set";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(cents / 100);
}

function optionalIsoDate(value: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function localDateTimeValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function nextDefaultSessionWindow() {
  const start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15);
  const end = new Date(start.getTime() + 50 * 60_000);
  return {
    scheduledStart: localDateTimeValue(start.toISOString()),
    scheduledEnd: localDateTimeValue(end.toISOString()),
  };
}

function newScheduleRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (part) => {
    const random = Math.floor(Math.random() * 16);
    const value = part === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function paymentRequiredFor(session: MobileCaptureSession) {
  return session.paymentRequired ?? session.paymentPolicy === "PAID_ONE_TO_ONE";
}

function paymentResolvedFor(session: MobileCaptureSession) {
  return session.paymentResolved ?? session.paymentStatus === "PAID";
}

function toneForSession(session: MobileCaptureSession): SessionTone {
  if (session.bookingStatus === "CANCELED" || session.status === "CANCELED") return "bad";
  if (session.coachingPacketStatus === "READY_FOR_REVIEW") return "good";
  if (session.canRecordNow || session.providerCanJoin) return "good";
  if (session.recordingConsentStatus && session.recordingConsentStatus !== "GRANTED") return "warn";
  if (paymentRequiredFor(session) && !paymentResolvedFor(session)) return "warn";
  return "warm";
}

function Pill({ label, tone = "warm" }: { label: string; tone?: SessionTone }) {
  const classes = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    bad: "border-rose-200 bg-rose-50 text-rose-700",
    warm: "border-[#ead8b4] bg-[#fff7e8] text-[#7b5c3b]",
    blue: "border-sky-200 bg-sky-50 text-sky-700",
  }[tone];

  return <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wide ${classes}`}>{label}</span>;
}

function HumanStep({
  icon,
  title,
  detail,
  tone,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  tone: SessionTone;
}) {
  const iconClasses = {
    good: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-700",
    bad: "bg-rose-50 text-rose-700",
    warm: "bg-[#fff7e8] text-[#8a6a3e]",
    blue: "bg-sky-50 text-sky-700",
  }[tone];

  return (
    <div className="rounded-2xl border border-[#ead8b4] bg-white/86 p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${iconClasses}`}>{icon}</span>
        <h3 className="font-black text-[#3d3122]">{title}</h3>
      </div>
      <p className="text-sm font-bold leading-relaxed text-[#745a38]">{detail}</p>
    </div>
  );
}

function paymentLine(session: MobileCaptureSession) {
  if (!paymentRequiredFor(session)) return "No Stripe payment is required for this session in Quipsly.";
  if (paymentResolvedFor(session)) return "Payment is recorded. Your session can move forward.";
  if (session.latestCheckoutUrl) return "A secure Stripe payment page is ready for this session.";
  return "Payment is not recorded yet. Homer may send a secure Stripe link before the session.";
}

function consentLine(session: MobileCaptureSession) {
  if (session.recordingConsentGranted) return "Consent is granted. Recording can happen only through the visible capture controls.";
  if (session.recordingConsentStatus === "DECLINED") return "Consent was declined. Recording stays off.";
  if (session.recordingConsentStatus === "REVOKED") return "Consent was revoked. Recording stays off until consent is granted again.";
  return "Recording is off. Consent is needed before any local or provider recording starts.";
}

function packetLine(session: MobileCaptureSession) {
  if (session.coachingPacketStatus === "READY_FOR_REVIEW") {
    return `${session.coachingPacketTitle || "Follow-up packet"} is ready with ${session.coachingPacketHighlightCount ?? 0} highlight(s) and ${session.coachingPacketActionItemCount ?? 0} action item(s).`;
  }
  if (session.latestTranscriptStatus === "COMPLETED") return "Transcript is ready. Homer can build the follow-up packet next.";
  if (session.latestTranscriptStatus) return `Transcript is ${normalize(session.latestTranscriptStatus)}. The follow-up packet comes after transcript review.`;
  return "Follow-up notes appear here after recording and transcription.";
}

function ConsentChoicePanel({
  session,
  isBusy,
  message,
  onConsentAction,
}: {
  session: MobileCaptureSession;
  isBusy: boolean;
  message?: string;
  onConsentAction: (session: MobileCaptureSession, action: ConsentAction, choices?: ConsentGrantChoices) => void;
}) {
  const closed = session.status === "CANCELED" || session.bookingStatus === "CANCELED";
  const status = session.recordingConsentStatus || "not-created";
  const disabled = isBusy || closed;
  const [canRecordAudio, setCanRecordAudio] = useState(false);
  const [canRecordVideo, setCanRecordVideo] = useState(false);
  const [canTranscribe, setCanTranscribe] = useState(false);
  const [audiblePeopleAttested, setAudiblePeopleAttested] = useState(false);
  const grantDisabled = disabled
    || session.recordingConsentGranted === true
    || (!canRecordAudio && !canRecordVideo)
    || !audiblePeopleAttested;

  return (
    <div className="mt-4 rounded-2xl border border-[#ead8b4] bg-[#fffaf1] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-[#b98036]">Recording consent</p>
          <p className="mt-1 text-sm font-bold leading-relaxed text-[#6b5538]">
            {MOBILE_CAPTURE_CONSENT_TEXT}
          </p>
          <div className="mt-3 grid gap-2 text-sm font-bold text-[#3d3122]">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={canRecordAudio} onChange={(event) => setCanRecordAudio(event.target.checked)} disabled={disabled} className="mt-1" />
              Allow audio recording of my participation.
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={canRecordVideo} onChange={(event) => setCanRecordVideo(event.target.checked)} disabled={disabled} className="mt-1" />
              Allow video recording of my participation.
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={canTranscribe} onChange={(event) => setCanTranscribe(event.target.checked)} disabled={disabled} className="mt-1" />
              Separately allow transcription of my recorded participation.
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={audiblePeopleAttested} onChange={(event) => setAudiblePeopleAttested(event.target.checked)} disabled={disabled} className="mt-1" />
              I confirm anyone else who may be heard has been told and agreed before recording starts.
            </label>
          </div>
          <p className="mt-2 text-xs font-bold text-[#7b5c3b]">Saving consent does not start recording. Audio/video and transcription remain separate choices.</p>
          {message && <p className="mt-2 text-sm font-black text-[#3d3122]">{message}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onConsentAction(session, "GRANT", {
              canRecordAudio,
              canRecordVideo,
              canTranscribe,
              allAudibleParticipantsNotifiedAndAgreed: audiblePeopleAttested,
            })}
            disabled={grantDisabled}
            className="rounded-full border border-emerald-200 bg-emerald-600 px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Grant recording consent
          </button>
          <button
            type="button"
            onClick={() => onConsentAction(session, "DECLINE")}
            disabled={disabled || status === "DECLINED"}
            className="rounded-full border border-amber-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-amber-800 shadow-sm transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Decline recording
          </button>
          {status === "GRANTED" && (
            <button
              type="button"
              onClick={() => onConsentAction(session, "REVOKE")}
              disabled={disabled}
              className="rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Revoke consent
            </button>
          )}
        </div>
      </div>
      {closed && (
        <p className="mt-3 text-xs font-black uppercase tracking-wide text-rose-700">
          This session is canceled, so consent changes are paused.
        </p>
      )}
    </div>
  );
}

function PaymentActionPanel({ session }: { session: MobileCaptureSession }) {
  if (!paymentRequiredFor(session)) return null;

  const paid = paymentResolvedFor(session);
  const hasCheckout = Boolean(session.latestCheckoutUrl);
  const expires = session.latestCheckoutExpiresAt ? formatDateTime(session.latestCheckoutExpiresAt) : null;

  return (
    <div className="mt-4 rounded-2xl border border-[#ead8b4] bg-[#fffaf1] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-[#b98036]">Payment</p>
          <p className="mt-1 text-sm font-bold leading-relaxed text-[#6b5538]">
            {paid
              ? "Stripe payment evidence is recorded for this session."
              : hasCheckout
                ? `Pay ${money(session.amountCents, session.currency || "USD")} on Stripe's secure checkout page.`
                : "Homer has not prepared the Stripe checkout link yet."}
          </p>
          {expires && !paid && <p className="mt-1 text-xs font-bold text-[#7b5c3b]">Checkout link expires: {expires}</p>}
          <p className="mt-2 text-xs font-bold text-[#7b5c3b]">
            Quipsly does not collect card details here. Stripe handles payment; Quipsly keeps the receipt trail with the session.
          </p>
        </div>
        {session.latestCheckoutUrl && (
          <a
            href={session.latestCheckoutUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-emerald-700"
          >
            <ExternalLink size={15} /> {paid ? "Open Stripe receipt" : "Pay securely with Stripe"}
          </a>
        )}
      </div>
    </div>
  );
}

function SessionSchedulePanel({
  session,
  onScheduleSaved,
}: {
  session: MobileCaptureSession;
  onScheduleSaved: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientRequestId, setClientRequestId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    scheduledStart: localDateTimeValue(session.scheduledStart),
    scheduledEnd: localDateTimeValue(session.scheduledEnd),
  });
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  useEffect(() => {
    setDraft({
      scheduledStart: localDateTimeValue(session.scheduledStart),
      scheduledEnd: localDateTimeValue(session.scheduledEnd),
    });
    setClientRequestId(null);
  }, [session.scheduledStart, session.scheduledEnd, session.updatedAt]);

  if (!session.canSchedule) return null;

  function openEditor() {
    if (!session.scheduledStart || !session.scheduledEnd) {
      setDraft(nextDefaultSessionWindow());
    }
    setMessage(null);
    setError(null);
    setIsOpen(true);
  }

  function changeDraft(field: "scheduledStart" | "scheduledEnd", value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setClientRequestId(null);
    setMessage(null);
    setError(null);
  }

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const scheduledStart = optionalIsoDate(draft.scheduledStart);
    const scheduledEnd = optionalIsoDate(draft.scheduledEnd);
    if (!scheduledStart || !scheduledEnd) {
      setError("Choose both a start and end time.");
      return;
    }
    if (!session.updatedAt) {
      setError("Refresh this Session before changing its time.");
      return;
    }

    const requestId = clientRequestId || newScheduleRequestId();
    setClientRequestId(requestId);
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/sessions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          callRoomId: session.callRoomId,
          scheduledStart,
          scheduledEnd,
          timezone,
          expectedUpdatedAt: session.updatedAt,
          clientRequestId: requestId,
          reason: "Scheduled from the Quipsly Session workspace.",
        }),
      });
      const body = (await response.json()) as SessionScheduleResponse;
      if (!response.ok || !body.ok) {
        throw new Error(body.error || `Scheduling returned HTTP ${response.status}.`);
      }
      setMessage(
        body.boundaries?.nextAction
        || "The Quipsly Session time is saved. Invitations, consent, recording, and external calendars remain separate.",
      );
      await onScheduleSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Session time could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/65 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-sky-800">Quipsly schedule</p>
          <p className="mt-1 text-sm font-bold leading-relaxed text-[#425466]">
            {session.scheduledStart && session.scheduledEnd
              ? `${formatDateTime(session.scheduledStart)} to ${formatDateTime(session.scheduledEnd)} · ${session.scheduledTimezone || timezone}`
              : "Choose when this existing Session should appear in Quipsly."}
          </p>
          <p className="mt-1 text-xs font-bold text-sky-900">
            This does not send an invitation, update an external calendar, grant consent, or start recording.
          </p>
        </div>
        <button
          type="button"
          onClick={openEditor}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-sky-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-sky-900 shadow-sm hover:bg-sky-100"
        >
          {session.scheduledStart ? "Change Quipsly time" : "Set Quipsly time"}
        </button>
      </div>

      {isOpen ? (
        <form onSubmit={saveSchedule} className="mt-4 grid gap-4 border-t border-sky-200 pt-4 md:grid-cols-2">
          <label className="text-sm font-black text-[#3d3122]">
            Session starts
            <input
              type="datetime-local"
              required
              value={draft.scheduledStart}
              onChange={(event) => changeDraft("scheduledStart", event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-sky-200 bg-white px-3 py-2 font-semibold outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <label className="text-sm font-black text-[#3d3122]">
            Session ends
            <input
              type="datetime-local"
              required
              value={draft.scheduledEnd}
              onChange={(event) => changeDraft("scheduledEnd", event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-sky-200 bg-white px-3 py-2 font-semibold outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <button
              type="submit"
              disabled={isSaving || !session.updatedAt}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-sky-800 px-5 py-3 text-sm font-black uppercase tracking-wide text-white hover:bg-sky-900 disabled:cursor-wait disabled:opacity-60"
            >
              {isSaving ? "Saving Quipsly time…" : "Save Quipsly time"}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              disabled={isSaving}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-sky-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-sky-900 hover:bg-sky-100 disabled:opacity-60"
            >
              Cancel
            </button>
            <p className="text-xs font-bold text-sky-900">Shown in {timezone} on this device.</p>
            {message ? <p role="status" className="w-full text-sm font-bold text-emerald-800">{message}</p> : null}
            {error ? <p role="alert" className="w-full text-sm font-bold text-rose-800">{error}</p> : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}

function SessionCard({
  session,
  consentBusy,
  consentMessage,
  onConsentAction,
  onScheduleSaved,
}: {
  session: MobileCaptureSession;
  consentBusy: boolean;
  consentMessage?: string;
  onConsentAction: (session: MobileCaptureSession, action: ConsentAction, choices?: ConsentGrantChoices) => void;
  onScheduleSaved: () => Promise<void>;
}) {
  const blockers = [
    ...(session.captureReadiness?.blockers ?? []),
    ...(session.journeySummary?.blockers ?? []),
    ...(session.actionPacket?.blockers ?? []),
  ].filter((value, index, array) => value && array.indexOf(value) === index);

  return (
    <article className="rounded-[1.8rem] border border-[#e8dcc4] bg-white/82 p-6 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Pill label={titleCase(session.purpose || "COACHING")} tone="blue" />
            <Pill label={session.captureReadiness?.label || titleCase(session.journeySummary?.stage) || "Session"} tone={toneForSession(session)} />
            <Pill label={session.canRecordNow ? "recording allowed" : "recording off"} tone={session.canRecordNow ? "good" : "warm"} />
            <Pill label={session.providerCanJoin ? "join ready" : titleCase(session.providerReadiness) || "local fallback"} tone={session.providerCanJoin ? "good" : "blue"} />
          </div>
          <h2 className="text-2xl font-black leading-tight text-[#3d3122]">{session.title}</h2>
          <p className="mt-2 text-sm font-bold text-[#7b5c3b]">
            {formatDateTime(session.scheduledStart)} to {formatDateTime(session.scheduledEnd)}
          </p>
          <p className="mt-1 text-sm text-[#7b5c3b]">
            Coach: <strong>{session.coachLabel || "Not assigned yet"}</strong> · Client: <strong>{session.clientLabel || "You"}</strong>
          </p>
          {session.coachingEngagementId ? <Link href={`/coaching/engagements/${encodeURIComponent(session.coachingEngagementId)}`} className="mt-2 inline-flex text-xs font-black uppercase tracking-wide text-violet-800 hover:underline">{session.coachingEngagementTitle || "Open coaching engagement"}</Link> : null}
          <p className="mt-3 max-w-3xl text-sm font-bold leading-relaxed text-[#3d3122]">
            {session.nextAction || session.actionPacket?.nextAction || session.captureReadiness?.nextAction || "Review the session details before recording."}
          </p>
        </div>
        <div className="min-w-64 rounded-2xl border border-[#ead8b4] bg-[#fffaf1] p-4 text-sm text-[#6b5538]">
          <p><strong>Status:</strong> {titleCase(session.bookingStatus || session.status)}</p>
          <p><strong>Payment:</strong> {paymentRequiredFor(session) ? titleCase(session.paymentStatus || "pending") : "Not required here"}</p>
          <p><strong>Consent:</strong> {titleCase(session.recordingConsentStatus || "not created")}</p>
          <p><strong>Transcript:</strong> {titleCase(session.latestTranscriptStatus || "not started")}</p>
          <div className="mt-4 grid gap-2">
            {session.providerCanJoin ? <Link href={`/sessions/${encodeURIComponent(session.callRoomId)}?mode=live`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-violet-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white hover:bg-violet-700"><Video size={15} aria-hidden="true" /> Join live room</Link> : null}
            <Link href={`/sessions/${encodeURIComponent(session.callRoomId)}`} className={`inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide ${session.providerCanJoin ? "border border-[#d8c7a7] bg-white text-[#3d3122] hover:bg-[#fffaf0]" : "bg-[#3d3122] text-white hover:bg-[#5a472f]"}`}>
              Open session workspace
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <HumanStep icon={<Receipt size={18} />} title="Payment" detail={paymentLine(session)} tone={paymentRequiredFor(session) && !paymentResolvedFor(session) ? "warn" : "good"} />
        <HumanStep icon={<ShieldCheck size={18} />} title="Consent" detail={consentLine(session)} tone={session.recordingConsentGranted ? "good" : "warn"} />
        <HumanStep icon={<Mic size={18} />} title="Record or join" detail={session.captureReadiness?.detail || session.providerNextAction || "Use the capture app when the room is ready."} tone={session.canRecordNow || session.providerCanJoin ? "good" : "warm"} />
        <HumanStep icon={<FileText size={18} />} title="Follow-up packet" detail={packetLine(session)} tone={session.coachingPacketStatus === "READY_FOR_REVIEW" ? "good" : "blue"} />
      </div>

      <PaymentActionPanel session={session} />

      <SessionSchedulePanel session={session} onScheduleSaved={onScheduleSaved} />

      <ConsentChoicePanel
        session={session}
        isBusy={consentBusy}
        message={consentMessage}
        onConsentAction={onConsentAction}
      />

      {session.coachingPacketPreview && (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/75 p-4">
          <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-emerald-800">Packet preview</p>
          <p className="text-sm font-bold leading-relaxed text-[#315641]">{session.coachingPacketPreview}</p>
        </div>
      )}

      {blockers.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-amber-800">Needs attention before the next step</p>
          <div className="flex flex-wrap gap-2">
            {blockers.map((blocker) => <Pill key={blocker} label={normalize(blocker)} tone="warn" />)}
          </div>
        </div>
      )}
    </article>
  );
}

export default function CoachingSessionsPage() {
  const [payload, setPayload] = useState<SessionsResponse | null>(null);
  const [status, setStatus] = useState("Loading your coaching sessions...");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [consentBusyByRoom, setConsentBusyByRoom] = useState<Record<string, boolean>>({});
  const [consentMessageByRoom, setConsentMessageByRoom] = useState<Record<string, string>>({});
  const [createBusy, setCreateBusy] = useState(false);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState({
    title: "",
    purpose: "PODCAST",
    projectSlug: "",
    episodeSlug: "",
    coachingEngagementId: "",
    scheduledStart: "",
    scheduledEnd: "",
  });

  async function loadSessions() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/sessions", { cache: "no-store" });
      const nextPayload = (await response.json()) as SessionsResponse;
      if (!response.ok || !nextPayload.ok) throw new Error(nextPayload.error || `Sessions returned HTTP ${response.status}.`);
      setPayload(nextPayload);
      setStatus("Session truth loaded");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your sessions could not load.");
      setStatus("Sign in or ask Homer to check the session");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  async function submitConsent(
    session: MobileCaptureSession,
    consentAction: ConsentAction,
    choices?: ConsentGrantChoices,
  ) {
    const roomId = session.callRoomId;
    setConsentBusyByRoom((current) => ({ ...current, [roomId]: true }));
    setConsentMessageByRoom((current) => ({ ...current, [roomId]: "Saving your consent choice..." }));

    try {
      const response = await fetch("/api/mobile/capture/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          callRoomId: roomId,
          participantId: session.participantId || undefined,
          consentAction,
          ...(consentAction === "GRANT" && choices
            ? {
                consentPolicyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
                consentText: MOBILE_CAPTURE_CONSENT_TEXT,
                consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
                canRecordAudio: choices.canRecordAudio,
                canRecordVideo: choices.canRecordVideo,
                canTranscribe: choices.canTranscribe,
                allAudibleParticipantsNotifiedAndAgreed:
                  choices.allAudibleParticipantsNotifiedAndAgreed,
                presentationEvidence: {
                  version: 1,
                  surface: "quipsly-capture-consent-v2",
                  presentedAt: new Date().toISOString(),
                  recordingChoicePresented: true,
                  transcriptionChoicePresented: true,
                  audibleParticipantAttestationPresented: true,
                },
              }
            : {}),
        }),
      });
      const body = (await response.json()) as ConsentResponse;
      if (!response.ok || !body.ok) throw new Error(body.error || `Consent update returned HTTP ${response.status}.`);

      setConsentMessageByRoom((current) => ({
        ...current,
        [roomId]: body.session?.nextAction || "Consent choice saved. Refreshing session truth.",
      }));
      await loadSessions();
    } catch (cause) {
      setConsentMessageByRoom((current) => ({
        ...current,
        [roomId]: cause instanceof Error ? cause.message : "Consent could not be saved. Please try again.",
      }));
    } finally {
      setConsentBusyByRoom((current) => ({ ...current, [roomId]: false }));
    }
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateBusy(true);
    setCreateMessage(null);
    setCreateError(null);
    setCreatedRoomId(null);
    try {
      const response = await fetch("/api/mobile/capture/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: createDraft.title.trim(),
          purpose: createDraft.purpose,
          projectSlug: createDraft.projectSlug || undefined,
          episodeSlug: createDraft.episodeSlug.trim() || undefined,
          coachingEngagementId: createDraft.coachingEngagementId || undefined,
          scheduledStart: optionalIsoDate(createDraft.scheduledStart),
          scheduledEnd: optionalIsoDate(createDraft.scheduledEnd),
          deviceLabel: "Quipsly Nest web",
        }),
      });
      const body = (await response.json()) as SessionCreateResponse;
      if (!response.ok || !body.ok) throw new Error(body.error || `Session creation returned HTTP ${response.status}.`);
      setCreateMessage(body.boundaries?.nextAction || "Planned session created. Consent and capture remain separate next steps.");
      setCreatedRoomId(body.session?.callRoomId || body.session?.id || null);
      setCreateDraft((current) => ({ ...current, title: "", episodeSlug: "", scheduledStart: "", scheduledEnd: "" }));
      await loadSessions();
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "The planned session could not be created.");
    } finally {
      setCreateBusy(false);
    }
  }

  const sessions = useMemo(() => payload?.sessions ?? [], [payload?.sessions]);
  const nextSession = sessions[0];

  return (
    <div className="min-h-full w-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,#fff7df,transparent_34%),linear-gradient(135deg,#fffaf1,#f7efe2_45%,#edf8ef)]">
      <header className="mx-auto max-w-6xl px-6 pb-4 pt-8">
        <div className="rounded-[2rem] border border-[#e8dcc4] bg-white/78 p-7 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.28em] text-[#b98036]">Your sessions</p>
              <h1 className="max-w-3xl text-4xl font-black leading-tight text-[#3d3122]">Prepare, capture, transcribe, and follow through in one calm place.</h1>
              <p className="mt-3 max-w-3xl text-[#7b5c3b]">
                Podcast, coaching, interview, and internal sessions share one explicit chain of Nest, people, consent, source recording, transcript, review, goals, tasks, and notes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Pill
                label={
                  payload?.user?.isStaff
                    ? "staff tools"
                    : payload?.user?.canCreateCaptureSessions
                      ? "creator tools"
                      : "participant view"
                }
                tone="blue"
              />
              <Pill label={status} tone={error ? "bad" : "good"} />
              <button
                type="button"
                onClick={() => void loadSessions()}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-full border border-[#d6c5a5] bg-[#3d3122] px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-[#5a472f] disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>
          {error && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              {error} If you expected a session here, sign in with the invited email or ask Homer to resend the session link.
            </div>
          )}
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <HumanStep icon={<CalendarDays size={18} />} title="When" detail={nextSession ? `${formatDateTime(nextSession.scheduledStart)} to ${formatDateTime(nextSession.scheduledEnd)}` : "Your time appears here after Homer creates the session."} tone={nextSession ? "good" : "warm"} />
            <HumanStep
              icon={<Receipt size={18} />}
              title="Payment"
              detail={nextSession ? paymentLine(nextSession) : "Payment instructions appear here when needed."}
              tone={
                nextSession &&
                paymentRequiredFor(nextSession) &&
                !paymentResolvedFor(nextSession)
                  ? "warn"
                  : "warm"
              }
            />
            <HumanStep icon={<Video size={18} />} title="Recording" detail={nextSession ? consentLine(nextSession) : "Recording stays off until consent is clear."} tone={nextSession?.recordingConsentGranted ? "good" : "warm"} />
            <HumanStep icon={<Sparkles size={18} />} title="Afterward" detail={nextSession ? packetLine(nextSession) : "Follow-up notes appear after the session is captured and reviewed."} tone={nextSession?.coachingPacketStatus === "READY_FOR_REVIEW" ? "good" : "blue"} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-6 pb-10">
        {payload?.user?.canCreateCaptureSessions ? (
          <section className="rounded-[1.8rem] border border-sky-200 bg-white/85 p-6 shadow-sm" aria-labelledby="new-session-heading">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">App-owned first step</p>
                <h2 id="new-session-heading" className="mt-1 text-2xl font-black text-[#3d3122]">Plan a real session</h2>
                <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#6f5a3d]">This creates the room, you as host, and a requested consent record. It does not invite, schedule, charge, join, record, transcribe, send, or publish.</p>
              </div>
              <Pill label="No external side effects" tone="blue" />
            </div>
            <form onSubmit={createSession} className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-black text-[#3d3122] md:col-span-2">Session title
                <input required value={createDraft.title} onChange={(event) => setCreateDraft((current) => ({ ...current, title: event.target.value }))} placeholder="High Ground Odyssey Episode 8 recording" className="mt-1 min-h-11 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 font-semibold outline-none focus:ring-2 focus:ring-sky-500" />
              </label>
              <label className="text-sm font-black text-[#3d3122]">Purpose
                <select value={createDraft.purpose} onChange={(event) => setCreateDraft((current) => ({ ...current, purpose: event.target.value, episodeSlug: event.target.value === "PODCAST" ? current.episodeSlug : "", coachingEngagementId: event.target.value === "COACHING" ? current.coachingEngagementId : "" }))} className="mt-1 min-h-11 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 font-semibold outline-none focus:ring-2 focus:ring-sky-500">
                  <option value="PODCAST">Podcast episode</option>
                  <option value="COACHING">Coaching session</option>
                  <option value="RESEARCH_INTERVIEW">Research interview</option>
                  <option value="INTERNAL_MEETING">Internal meeting</option>
                </select>
              </label>
              <label className="text-sm font-black text-[#3d3122]">Nest
                <select value={createDraft.projectSlug} onChange={(event) => setCreateDraft((current) => ({ ...current, projectSlug: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 font-semibold outline-none focus:ring-2 focus:ring-sky-500">
                  <option value="">My Home Nest</option>
                  {(payload.captureProjects ?? []).map((project) => <option key={project.id} value={project.slug}>{project.name} · {project.role.toLowerCase()}</option>)}
                </select>
              </label>
              {createDraft.purpose === "PODCAST" ? <label className="text-sm font-black text-[#3d3122]">Episode slug <span className="font-semibold text-[#806a4d]">(optional)</span>
                <input value={createDraft.episodeSlug} onChange={(event) => setCreateDraft((current) => ({ ...current, episodeSlug: event.target.value }))} placeholder="episode-8" className="mt-1 min-h-11 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 font-semibold outline-none focus:ring-2 focus:ring-sky-500" />
              </label> : null}
              {createDraft.purpose === "COACHING" ? <label className="text-sm font-black text-[#3d3122]">Coaching engagement <span className="font-semibold text-[#806a4d]">(optional)</span>
                <select value={createDraft.coachingEngagementId} onChange={(event) => { const engagement = (payload?.coachingEngagements ?? []).find((item) => item.id === event.target.value); setCreateDraft((current) => ({ ...current, coachingEngagementId: event.target.value, projectSlug: engagement?.projectSlug || current.projectSlug })); }} className="mt-1 min-h-11 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 font-semibold outline-none focus:ring-2 focus:ring-sky-500">
                  <option value="">Individual Session only</option>
                  {(payload?.coachingEngagements ?? []).map((engagement) => <option key={engagement.id} value={engagement.id}>{engagement.title} · {engagement.status.toLowerCase()}</option>)}
                </select>
                <span className="mt-1 block text-xs font-semibold leading-5 text-[#806a4d]">Choose this for continuity across calls. Quipsly will not infer a client relationship from a title.</span>
              </label> : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-black text-[#3d3122]">Starts <span className="font-semibold text-[#806a4d]">(optional)</span>
                  <input type="datetime-local" value={createDraft.scheduledStart} onChange={(event) => setCreateDraft((current) => ({ ...current, scheduledStart: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 font-semibold outline-none focus:ring-2 focus:ring-sky-500" />
                </label>
                <label className="text-sm font-black text-[#3d3122]">Ends <span className="font-semibold text-[#806a4d]">(optional)</span>
                  <input type="datetime-local" value={createDraft.scheduledEnd} onChange={(event) => setCreateDraft((current) => ({ ...current, scheduledEnd: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 font-semibold outline-none focus:ring-2 focus:ring-sky-500" />
                </label>
              </div>
              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <button type="submit" disabled={createBusy} className="inline-flex min-h-11 items-center justify-center rounded-full bg-sky-800 px-5 py-3 text-sm font-black uppercase tracking-wide text-white hover:bg-sky-900 disabled:cursor-wait disabled:opacity-60">{createBusy ? "Creating planned session…" : "Create planned session"}</button>
                {createMessage ? <p role="status" className="text-sm font-bold text-emerald-800">{createMessage}</p> : null}
                {createdRoomId ? <Link href={`/sessions/${encodeURIComponent(createdRoomId)}`} className="inline-flex min-h-11 items-center rounded-full border border-emerald-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-emerald-900">Open created session</Link> : null}
                {createError ? <p role="alert" className="text-sm font-bold text-rose-800">{createError}</p> : null}
              </div>
            </form>
          </section>
        ) : null}

        {sessions.length === 0 && !error ? (
          <div className="rounded-[1.8rem] border border-dashed border-[#d6c5a5] bg-white/75 p-8 text-[#7b5c3b] shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-[#3d3122]">
              <Clock size={20} />
              <h2 className="text-xl font-black">No sessions are visible yet.</h2>
            </div>
            <p className="max-w-2xl text-sm font-bold leading-relaxed">
              This does not mean anything is broken. Homer may still be choosing a time, preparing a payment link, or inviting the right email address. Once the session is created, this page will show the human version of Quipsly truth.
            </p>
          </div>
        ) : (
          sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              consentBusy={Boolean(consentBusyByRoom[session.callRoomId])}
              consentMessage={consentMessageByRoom[session.callRoomId]}
              onConsentAction={(target, action, choices) => void submitConsent(target, action, choices)}
              onScheduleSaved={loadSessions}
            />
          ))
        )}

        <div className="rounded-[1.8rem] border border-[#e8dcc4] bg-[#3d3122] p-6 text-[#f6e7cc] shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-white">
            <CheckCircle2 className="text-emerald-300" size={20} />
            <h2 className="text-xl font-black">What Quipsly is promising here</h2>
          </div>
          <div className="grid gap-3 text-sm font-bold leading-relaxed md:grid-cols-3">
            <p>Stripe handles payment pages. Quipsly keeps the appointment and receipt trail together.</p>
            <p>Recording stays off until consent is visible. Local capture is preserved before anything is pruned.</p>
            <p>Transcripts and packets are review material. Homer can edit them before anything is sent or published.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
