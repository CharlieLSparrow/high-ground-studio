"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Receipt,
  Sparkles,
  Video,
} from "lucide-react";

type SessionTone = "good" | "warn" | "bad" | "warm" | "blue";
type SessionPurposeFilter = "ALL" | "PODCAST" | "COACHING" | "OTHER";
type SessionViewFilter = "ACTIVE" | "ATTENTION" | "READY" | "COMPLETED" | "ALL";

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

function optionalIsoDate(value: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
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
  return "Payment is not recorded yet. Your coach may send a secure Stripe link before the session.";
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
  if (session.latestTranscriptStatus === "COMPLETED") return "Transcript is ready. A permitted coach can build the follow-up packet next.";
  if (session.latestTranscriptStatus) return `Transcript is ${normalize(session.latestTranscriptStatus)}. The follow-up packet comes after transcript review.`;
  return "Follow-up notes appear here after recording and transcription.";
}

function blockersFor(session: MobileCaptureSession) {
  return [
    ...(session.captureReadiness?.blockers ?? []),
    ...(session.journeySummary?.blockers ?? []),
    ...(session.actionPacket?.blockers ?? []),
  ].filter((value, index, array) => value && array.indexOf(value) === index);
}

function sessionIsCompleted(session: MobileCaptureSession) {
  const state = String(session.bookingStatus || session.status || "").toUpperCase();
  return state === "COMPLETED" || state === "ENDED" || state === "CANCELED";
}

function sessionIsReady(session: MobileCaptureSession) {
  return session.canRecordNow === true
    || session.providerCanJoin === true
    || session.coachingPacketStatus === "READY_FOR_REVIEW";
}

function SessionCard({ session }: { session: MobileCaptureSession }) {
  const blockers = blockersFor(session);
  const workspaceHref = `/sessions/${encodeURIComponent(session.callRoomId)}`;

  return (
    <article className="rounded-[1.6rem] border border-[#e8dcc4] bg-white/86 p-5 shadow-sm backdrop-blur" data-testid="session-index-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap gap-2">
            <Pill label={titleCase(session.purpose || "COACHING")} tone="blue" />
            <Pill label={session.captureReadiness?.label || titleCase(session.journeySummary?.stage) || "Session"} tone={toneForSession(session)} />
            {blockers.length > 0 ? <Pill label={`${blockers.length} item${blockers.length === 1 ? "" : "s"} need attention`} tone="warn" /> : null}
          </div>
          <h2 className="text-2xl font-black leading-tight text-[#3d3122]">{session.title}</h2>
          <p className="mt-2 text-sm font-bold text-[#7b5c3b]">
            {formatDateTime(session.scheduledStart)} to {formatDateTime(session.scheduledEnd)}
          </p>
          <p className="mt-1 text-sm text-[#7b5c3b]">
            Coach: <strong>{session.coachLabel || "Not assigned yet"}</strong> · Client: <strong>{session.clientLabel || "You"}</strong>
          </p>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-relaxed text-[#5b472f]">
            {session.nextAction || session.actionPacket?.nextAction || session.captureReadiness?.nextAction || "Review the session details before recording."}
          </p>
          {blockers.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Current blockers">
              {blockers.slice(0, 3).map((blocker) => <Pill key={blocker} label={normalize(blocker)} tone="warn" />)}
              {blockers.length > 3 ? <Pill label={`+${blockers.length - 3} more in workspace`} tone="warm" /> : null}
            </div>
          ) : null}
        </div>
        <div className="w-full rounded-2xl border border-[#ead8b4] bg-[#fffaf1] p-4 text-sm text-[#6b5538] lg:w-72">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div><dt className="text-[10px] font-black uppercase tracking-wide">Status</dt><dd className="font-bold">{titleCase(session.bookingStatus || session.status)}</dd></div>
            <div><dt className="text-[10px] font-black uppercase tracking-wide">Consent</dt><dd className="font-bold">{titleCase(session.recordingConsentStatus || "not created")}</dd></div>
            <div><dt className="text-[10px] font-black uppercase tracking-wide">Recording</dt><dd className="font-bold">{session.canRecordNow ? "Allowed" : "Off"}</dd></div>
            <div><dt className="text-[10px] font-black uppercase tracking-wide">Transcript</dt><dd className="font-bold">{titleCase(session.latestTranscriptStatus || "not started")}</dd></div>
          </dl>
          <div className="mt-4 grid gap-2">
            {session.providerCanJoin ? <Link href={`${workspaceHref}?mode=live`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-violet-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white hover:bg-violet-700"><Video size={15} aria-hidden="true" /> Join live room</Link> : null}
            <Link href={workspaceHref} className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#3d3122] px-4 py-2 text-xs font-black uppercase tracking-wide text-white hover:bg-[#5a472f]">
              Open workspace
            </Link>
            {session.recordingConsentGranted !== true && !sessionIsCompleted(session) ? <Link href={`${workspaceHref}?mode=prepare`} className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-amber-900 hover:bg-amber-50">Review consent</Link> : null}
            {session.coachingEngagementId ? <Link href={`/coaching/engagements/${encodeURIComponent(session.coachingEngagementId)}`} className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-violet-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-violet-900 hover:bg-violet-50">Coaching continuity</Link> : null}
            {session.latestCheckoutUrl && !paymentResolvedFor(session) ? <a href={session.latestCheckoutUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-emerald-900 hover:bg-emerald-50"><ExternalLink size={14} aria-hidden="true" /> Open Stripe</a> : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function CoachingSessionsPage() {
  const [payload, setPayload] = useState<SessionsResponse | null>(null);
  const [status, setStatus] = useState("Loading your coaching sessions...");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionQuery, setSessionQuery] = useState("");
  const [purposeFilter, setPurposeFilter] = useState<SessionPurposeFilter>("ALL");
  const [viewFilter, setViewFilter] = useState<SessionViewFilter>("ACTIVE");
  const [visibleLimit, setVisibleLimit] = useState(12);
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState({
    title: "",
    purpose: "COACHING",
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
      setStatus("Sign in with the invited account or ask your coach to check the Session");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSessions();
  }, []);

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
  const isFirstSessionSetup = Boolean(
    payload?.user?.canCreateCaptureSessions && sessions.length === 0,
  );
  const nextSession = sessions.find((session) => !sessionIsCompleted(session)) ?? sessions[0];
  const filteredSessions = useMemo(() => {
    const query = sessionQuery.trim().toLowerCase();
    return sessions.filter((session) => {
      const purpose = String(session.purpose || "COACHING").toUpperCase();
      const purposeMatches = purposeFilter === "ALL"
        || purpose === purposeFilter
        || (purposeFilter === "OTHER" && purpose !== "PODCAST" && purpose !== "COACHING");
      if (!purposeMatches) return false;

      const viewMatches = viewFilter === "ALL"
        || (viewFilter === "ACTIVE" && !sessionIsCompleted(session))
        || (viewFilter === "COMPLETED" && sessionIsCompleted(session))
        || (viewFilter === "READY" && sessionIsReady(session))
        || (viewFilter === "ATTENTION" && blockersFor(session).length > 0);
      if (!viewMatches) return false;
      if (!query) return true;

      return [
        session.title,
        session.purpose,
        session.status,
        session.bookingStatus,
        session.coachLabel,
        session.clientLabel,
        session.coachingEngagementTitle,
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [purposeFilter, sessionQuery, sessions, viewFilter]);
  const visibleSessions = filteredSessions.slice(0, visibleLimit);

  useEffect(() => {
    setVisibleLimit(12);
  }, [purposeFilter, sessionQuery, viewFilter]);

  useEffect(() => {
    if (isFirstSessionSetup) setIsPlannerOpen(true);
  }, [isFirstSessionSetup]);

  return (
    <div className="min-h-full w-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,#fff7df,transparent_34%),linear-gradient(135deg,#fffaf1,#f7efe2_45%,#edf8ef)]">
      <header className="mx-auto max-w-6xl px-6 pb-4 pt-8">
        <div className="rounded-[2rem] border border-[#e8dcc4] bg-white/78 p-7 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.28em] text-[#b98036]">Your sessions</p>
              <h1 className="max-w-3xl text-4xl font-black leading-tight text-[#3d3122]">
                {isFirstSessionSetup
                  ? "Create your first coaching Session."
                  : "Prepare, capture, transcribe, and follow through in one calm place."}
              </h1>
              <p className="mt-3 max-w-3xl text-[#7b5c3b]">
                {isFirstSessionSetup
                  ? "Give it a name now. You can schedule it and invite your client from the Session workspace next."
                  : "Podcast, coaching, interview, and internal sessions share one explicit chain of Nest, people, consent, source recording, transcript, review, goals, tasks, and notes."}
              </p>
            </div>
            {!isFirstSessionSetup ? <div className="flex flex-wrap items-center gap-3">
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
            </div> : null}
          </div>
          {error && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              {error} If you expected a Session here, sign in with the invited email or ask your coach to resend the invitation.
            </div>
          )}
          {!isFirstSessionSetup ? <div className="mt-6 grid gap-3 md:grid-cols-4">
            <HumanStep icon={<CalendarDays size={18} />} title="When" detail={nextSession ? `${formatDateTime(nextSession.scheduledStart)} to ${formatDateTime(nextSession.scheduledEnd)}` : "Your time appears here after a Session is scheduled."} tone={nextSession ? "good" : "warm"} />
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
          </div> : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-6 pb-10">
        {payload?.user?.canCreateCaptureSessions ? (
          <section className="rounded-[1.8rem] border border-sky-200 bg-white/85 p-6 shadow-sm" aria-labelledby="new-session-heading">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">{isFirstSessionSetup ? "Your first step" : "New Session"}</p>
                <h2 id="new-session-heading" className="mt-1 text-2xl font-black text-[#3d3122]">{isFirstSessionSetup ? "Name your coaching Session" : "Plan a real session"}</h2>
                <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#6f5a3d]">{isFirstSessionSetup ? "This creates the private workspace where you will schedule, invite, meet, record, and follow up." : "Create a podcast, coaching, interview, or internal Session when you need one."}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" aria-expanded={isPlannerOpen} aria-controls="session-planner" onClick={() => setIsPlannerOpen((current) => !current)} className="inline-flex min-h-11 items-center justify-center rounded-full bg-sky-800 px-5 py-3 text-xs font-black uppercase tracking-wide text-white hover:bg-sky-900">
                  {isPlannerOpen ? "Close planner" : "Plan a session"}
                </button>
              </div>
            </div>
            {isPlannerOpen ? <form id="session-planner" onSubmit={createSession} className="mt-5 grid gap-4 border-t border-sky-100 pt-5 md:grid-cols-2">
              <p className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs font-bold leading-5 text-sky-950 md:col-span-2">After this step, Quipsly will take you to the private Session workspace to schedule it and invite your client.</p>
              <label className="text-sm font-black text-[#3d3122] md:col-span-2">Session title
                <input required value={createDraft.title} onChange={(event) => setCreateDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Weekly coaching session" className="mt-1 min-h-11 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 font-semibold outline-none focus:ring-2 focus:ring-sky-500" />
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
                <button type="submit" disabled={createBusy} className="inline-flex min-h-11 items-center justify-center rounded-full bg-sky-800 px-5 py-3 text-sm font-black uppercase tracking-wide text-white hover:bg-sky-900 disabled:cursor-wait disabled:opacity-60">{createBusy ? "Creating Session…" : "Create Session"}</button>
                {createMessage ? <p role="status" className="text-sm font-bold text-emerald-800">{createMessage}</p> : null}
                {createdRoomId ? <Link href={`/sessions/${encodeURIComponent(createdRoomId)}`} className="inline-flex min-h-11 items-center rounded-full border border-emerald-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-emerald-900">Open created session</Link> : null}
                {createError ? <p role="alert" className="text-sm font-bold text-rose-800">{createError}</p> : null}
              </div>
            </form> : null}
          </section>
        ) : null}

        {sessions.length > 0 ? (
          <section className="rounded-[1.8rem] border border-[#e8dcc4] bg-white/80 p-5 shadow-sm" aria-labelledby="session-index-heading">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b98036]">Find the room, then work inside it</p>
                <h2 id="session-index-heading" className="mt-1 text-2xl font-black text-[#3d3122]">Session index</h2>
                <p className="mt-1 text-sm font-semibold text-[#765f40]">The index stays bounded. Consent, recording, transcript, notes, and follow-through belong to one exact Session workspace.</p>
              </div>
              <p role="status" className="text-sm font-black text-[#5b472f]">Showing {Math.min(visibleSessions.length, filteredSessions.length)} of {filteredSessions.length} matching · {sessions.length} accessible</p>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
              <label className="text-sm font-black text-[#3d3122]">Search Sessions
                <input type="search" value={sessionQuery} onChange={(event) => setSessionQuery(event.target.value)} placeholder="Client, coach, purpose, or title" className="mt-1 min-h-11 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 font-semibold outline-none focus:ring-2 focus:ring-sky-500" />
              </label>
              <label className="text-sm font-black text-[#3d3122]">Purpose
                <select value={purposeFilter} onChange={(event) => setPurposeFilter(event.target.value as SessionPurposeFilter)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 font-semibold outline-none focus:ring-2 focus:ring-sky-500">
                  <option value="ALL">All purposes</option>
                  <option value="PODCAST">Podcast</option>
                  <option value="COACHING">Coaching</option>
                  <option value="OTHER">Interview &amp; internal</option>
                </select>
              </label>
              <label className="text-sm font-black text-[#3d3122]">View
                <select value={viewFilter} onChange={(event) => setViewFilter(event.target.value as SessionViewFilter)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 font-semibold outline-none focus:ring-2 focus:ring-sky-500">
                  <option value="ACTIVE">Active</option>
                  <option value="ATTENTION">Needs attention</option>
                  <option value="READY">Ready now</option>
                  <option value="COMPLETED">Completed &amp; ended</option>
                  <option value="ALL">Everything</option>
                </select>
              </label>
            </div>
          </section>
        ) : null}

        {sessions.length === 0 && !error && !isFirstSessionSetup ? (
          <div className="rounded-[1.8rem] border border-dashed border-[#d6c5a5] bg-white/75 p-8 text-[#7b5c3b] shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-[#3d3122]">
              <Clock size={20} />
              <h2 className="text-xl font-black">No sessions are visible yet.</h2>
            </div>
            <p className="max-w-2xl text-sm font-bold leading-relaxed">
              {payload?.user?.canCreateCaptureSessions
                ? "Create your first Session above. Once it exists, this page will keep its schedule, consent, recording, transcript, and follow-up together."
                : "If you are meeting with a coach, open the private invitation they sent. If you want to host coaching Sessions, set up your coach profile first."}
            </p>
            {!payload?.user?.canCreateCaptureSessions ? (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link
                  href="/coaching"
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#3d3122] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#5a472f]"
                >
                  Set up coaching
                </Link>
                <p className="max-w-xl text-xs font-bold leading-5 text-[#806a4d]">
                  Already invited? Use the private link from your coach so Quipsly opens the right Session and account.
                </p>
              </div>
            ) : null}
          </div>
        ) : sessions.length > 0 && filteredSessions.length === 0 ? (
          <div className="rounded-[1.8rem] border border-dashed border-[#d6c5a5] bg-white/75 p-8 text-[#7b5c3b] shadow-sm" role="status">
            <h2 className="text-xl font-black text-[#3d3122]">No Sessions match these filters.</h2>
            <p className="mt-2 max-w-2xl text-sm font-bold leading-relaxed">Change the search, purpose, or view. Quipsly has not changed or hidden your canonical Session records.</p>
          </div>
        ) : (
          <>
            {visibleSessions.map((session) => <SessionCard key={session.id} session={session} />)}
            {visibleSessions.length < filteredSessions.length ? (
              <button type="button" onClick={() => setVisibleLimit((current) => current + 12)} className="mx-auto flex min-h-11 items-center justify-center rounded-full border border-[#d6c5a5] bg-white px-5 py-3 text-sm font-black text-[#3d3122] shadow-sm hover:bg-[#fff8eb]">Show 12 more Sessions</button>
            ) : null}
          </>
        )}

        {sessions.length > 0 ? <div className="rounded-[1.8rem] border border-[#e8dcc4] bg-[#3d3122] p-6 text-[#f6e7cc] shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-white">
            <CheckCircle2 className="text-emerald-300" size={20} />
            <h2 className="text-xl font-black">What Quipsly is promising here</h2>
          </div>
          <div className="grid gap-3 text-sm font-bold leading-relaxed md:grid-cols-3">
            <p>Stripe handles payment pages. Quipsly keeps the appointment and receipt trail together.</p>
            <p>Recording stays off until consent is visible. Local capture is preserved before anything is pruned.</p>
            <p>Transcripts and packets are review material. Permitted participants can correct them before anything is shared or published.</p>
          </div>
        </div> : null}
      </main>
    </div>
  );
}
