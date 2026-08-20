"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Mic,
  RefreshCw,
  Receipt,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
} from "lucide-react";

type Person = {
  id: string;
  name: string;
  email: string | null;
  image?: string | null;
} | null;

type CoachingCreatedHandoff = {
  bookingId: string;
  callRoomId: string;
  engagementId: string | null;
  clientEntryPath: string;
  engagementPath: string | null;
  liveSessionPath: string;
  sessionWorkspacePath: string;
  clientEmail: string;
  clientName: string | null;
  title: string;
  scheduledStart: string;
};

type JourneySummary = {
  stage?: string | null;
  roomStage?: string | null;
  paymentStage?: string | null;
  nextAction?: string | null;
  paymentNextAction?: string | null;
  roomNextAction?: string | null;
  evidence?: Record<string, boolean | null | undefined>;
  consent?: {
    participantCount?: number;
    requestedCount?: number;
    grantedCount?: number;
    declinedCount?: number;
    revokedCount?: number;
    allParticipantsGranted?: boolean;
    providerRecordingAllowed?: boolean;
    localRecordingFallbackAllowed?: boolean;
    nextAction?: string | null;
  };
};

type LifecycleCheckStatus =
  | "present"
  | "missing"
  | "not-required"
  | "attention";

type CoachingLifecycle = {
  kind?: "quipsly-coaching-capture-lifecycle-v1";
  stage?: string | null;
  readyForCapture?: boolean;
  readyForTranscript?: boolean;
  readyForPacket?: boolean;
  readyForReview?: boolean;
  nextAction?: string | null;
  checks?: Array<{
    id: string;
    label: string;
    status: LifecycleCheckStatus;
    meaning: string;
  }>;
  safeActions?: Array<{
    id: string;
    label: string;
    enabled: boolean;
    risk: "low" | "medium" | "human-approval-required";
    why: string;
    boundary: string;
  }>;
};

type CalendarReadyPacket = {
  kind: "quipsly-calendar-ready-packet-v1";
  title: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  timezone: string;
  provider: string;
  status: string;
  bookingId: string | null;
  roomId: string | null;
  purpose: string;
  attendees: Array<{ email: string; name: string | null; role: string }>;
  receipt: {
    id: string;
    provider: string;
    status: string;
    providerCalendarId: string | null;
    providerEventId: string | null;
    htmlLink: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  } | null;
  externalCalendarUpdated: boolean;
  externalCalendarEventExists: boolean;
  nextAction: string;
};

type CoachingRunway = {
  ok: boolean;
  error?: string;
  generatedAt?: string;
  user?: {
    id: string;
    email: string;
    name: string | null;
    isStaff: boolean;
    isCoach?: boolean;
  };
  boundaries?: {
    stripeScope: string;
    publicationScope: string;
    recordingScope: string;
  };
  readiness?: {
    stripeConfigured: boolean;
    stripeLiveAllowed: boolean;
    liveKitJoinConfigured: boolean;
    liveKitEgressConfigured: boolean;
    liveKitEgressStartEnabled?: boolean;
    liveKitEgressNextAction?: string;
    deepgramConfigured: boolean;
    coachingCustomerPortalEnabled: boolean;
    calendarReadiness?: {
      provider?: string;
      configured?: boolean;
      calendarIdConfigured?: boolean;
      calendarIdVisibleForOps?: string | null;
      credentialConfigured?: boolean;
      metadataTokenCandidate?: boolean;
      configurationStatus?: string;
      verificationRecommended?: boolean;
      credentialPath?: string;
      defaultTimezone?: string;
      sendUpdates?: string;
      attendeesIncluded?: boolean;
      accessOk?: boolean;
      accessStatus?: string;
      message?: string;
      sourceOfTruth?: string;
      nextAction?: string;
    };
    paymentReadiness?: {
      stripeMode: string;
      stripeNextAction: string;
      customerPortalNextAction: string;
      checkoutBoundary: string;
    };
  };
  counts?: {
    coaches: number;
    offerings: number;
    availabilityWindows: number;
    activeHolds: number;
    upcomingBookings: number;
    captureRooms: number;
    openRequests: number;
    roomsWithRecordings: number;
    roomsWithPackets: number;
  };
  coaches?: Array<{
    id: string;
    slug: string;
    displayName: string;
    timezone: string;
    isActive: boolean;
    user: Person;
    offeringCount: number;
    availabilityWindowCount: number;
  }>;
  offerings?: Array<{
    id: string;
    slug: string;
    title: string;
    description: string | null;
    kind: string;
    paymentPolicy: string;
    durationMinutes: number;
    priceCents: number | null;
    currency: string;
    stripePriceConfigured: boolean;
    coach: Person;
  }>;
  availabilityWindows?: Array<{
    id: string;
    coachProfileId: string;
    coach: Person;
    label: string;
    timezone: string;
    dayOfWeek: number | null;
    dayLabel: string | null;
    startMinute: number | null;
    endMinute: number | null;
    startLabel: string | null;
    endLabel: string | null;
    startsAt: string | null;
    endsAt: string | null;
    isActive: boolean;
    kind: string;
    nextAction: string;
  }>;
  bookingHolds?: Array<{
    id: string;
    status: string;
    scheduledStart: string;
    scheduledEnd: string;
    timezone: string;
    expiresAt: string;
    contactEmail: string | null;
    client: Person;
    coach: Person;
    offeringTitle: string | null;
    convertedBookingId: string | null;
    nextAction: string;
  }>;
  upcomingBookings?: Array<{
    id: string;
    clientUserId: string;
    coachingEngagementId: string | null;
    title: string;
    status: string;
    scheduledStart: string;
    scheduledEnd: string;
    timezone: string;
    paymentPolicy: string;
    paymentStatus: string | null;
    amountCents: number | null;
    currency: string;
    serviceKind: string | null;
    client: Person;
    coach: Person;
    callRoomId: string | null;
    callRoomStatus: string | null;
    clientEntryPath: string | null;
    engagementPath: string | null;
    liveSessionPath: string | null;
    sessionWorkspacePath: string | null;
    calendarStatus: string | null;
    calendarReadyPacket?: CalendarReadyPacket | null;
    checkoutSessionCount: number;
    latestCheckoutSessionId: string | null;
    latestCheckoutStatus: string | null;
    latestCheckoutUrl: string | null;
    latestCheckoutLivemode: boolean | null;
    stripeCustomerEvidence: boolean;
    stripeCustomerEvidenceLivemode: boolean | null;
    journeySummary?: JourneySummary | null;
    lifecycle?: CoachingLifecycle | null;
    portalNextAction: string;
    paymentNextAction: string;
    nextAction: string;
  }>;
  captureRooms?: Array<{
    id: string;
    title: string;
    purpose: string;
    status: string;
    provider: string;
    providerRoomId: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    calendarStatus: string | null;
    calendarReadyPacket?: CalendarReadyPacket | null;
    client: Person;
    coach: Person;
    participantCount: number;
    consentGrantedCount: number;
    consentSummary?: JourneySummary["consent"] | null;
    recordingCount: number;
    providerRecordingReceiptSlotId: string | null;
    providerRecordingReceiptStatus: string | null;
    providerRecordingActiveAssetId: string | null;
    providerRecordingActiveStatus: string | null;
    providerRecordingState:
      | "off"
      | "starting"
      | "recording"
      | "stopping"
      | "needs-review"
      | "held";
    providerRecordingCommandId: string | null;
    providerRecordingCommandStatus: string | null;
    providerRecordingCommandAction: string | null;
    providerRecordingCommandErrorCode: string | null;
    providerRecordingNextAction: string;
    latestRecordingAssetId: string | null;
    latestRecordingAssetStatus: string | null;
    latestTranscriptJobId: string | null;
    latestTranscriptStatus: string | null;
    latestTranscriptSegmentCount: number;
    packetSummaryNoteId: string | null;
    packetHighlightCount: number;
    openActionItemCount: number;
    packetStatus: string;
    journeySummary?: JourneySummary | null;
    lifecycle?: CoachingLifecycle | null;
    nextAction: string;
  }>;
  openRequests?: Array<{
    id: string;
    status: string;
    email: string;
    phone: string | null;
    preferredContactMethod: string;
    coachingGoals: string;
    availabilityNotes: string | null;
    createdAt: string;
    client: Person;
    assignedCoach: Person;
    nextAction: string;
  }>;
};

function formatDateTime(value?: string | null) {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time needs review";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function money(cents: number | null | undefined, currency = "USD") {
  if (typeof cents !== "number") return "No price set";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function normalize(value?: string | null) {
  return value ? value.toLowerCase().replaceAll("_", " ") : "not set";
}

function titleCase(value?: string | null) {
  return normalize(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function holdTone(
  status?: string | null,
): "good" | "warn" | "bad" | "warm" | "blue" {
  if (status === "ACTIVE") return "good";
  if (status === "CONVERTED") return "blue";
  if (status === "EXPIRED") return "bad";
  return "warm";
}

function bookingTone(
  status?: string | null,
): "good" | "warn" | "bad" | "warm" | "blue" {
  if (status === "CONFIRMED") return "good";
  if (status === "CANCELED" || status === "NO_SHOW") return "bad";
  if (status === "COMPLETED") return "blue";
  if (status === "HOLDING_PAYMENT") return "warn";
  return "warm";
}

function dollarsToCents(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed * 100)
    : null;
}

function localDateTimeInputValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function durationMinutesFromRange(start?: string | null, end?: string | null) {
  const startMs = start ? new Date(start).getTime() : Number.NaN;
  const endMs = end ? new Date(end).getTime() : Number.NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs)
    return "60";
  return String(Math.max(15, Math.round((endMs - startMs) / 60_000)));
}

function StatusPill({
  label,
  tone = "warm",
}: {
  label: string;
  tone?: "good" | "warn" | "bad" | "warm" | "blue";
}) {
  const classes = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-700",
    bad: "border-rose-200 bg-rose-50 text-rose-700",
    warm: "border-[#e8dcc4] bg-[#f8f3e6] text-[#7b5c3b]",
    blue: "border-sky-200 bg-sky-50 text-sky-700",
  }[tone];

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wide ${classes}`}
    >
      {label}
    </span>
  );
}

function ReadinessCard({
  title,
  detail,
  ready,
}: {
  title: string;
  detail: string;
  ready: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#e8dcc4] bg-white/80 p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        {ready ? (
          <CheckCircle2 size={18} className="text-emerald-600" />
        ) : (
          <AlertCircle size={18} className="text-amber-600" />
        )}
        <h3 className="font-black text-[#3d3122]">{title}</h3>
      </div>
      <p className="text-sm text-[#7b5c3b]">{detail}</p>
    </div>
  );
}

function calendarReadinessDetail(readiness?: CoachingRunway["readiness"]) {
  const calendar = readiness?.calendarReadiness;
  if (!calendar) return "Calendar readiness not loaded.";
  const status = calendar.accessOk
    ? "Access verified"
    : calendar.metadataTokenCandidate
      ? "Verify deployed access"
      : calendar.configured
        ? "Verify before sync"
        : calendar.calendarIdConfigured
          ? "Credentials held"
          : "Calendar setup needed";
  const details = [
    calendar.defaultTimezone ? `default ${calendar.defaultTimezone}` : null,
    calendar.configurationStatus
      ? normalize(calendar.configurationStatus)
      : null,
    calendar.credentialPath ? normalize(calendar.credentialPath) : null,
  ].filter(Boolean);
  return details.length ? `${status}: ${details.join(" · ")}` : status;
}

function FriendlyStepCard({
  step,
  title,
  detail,
  ready,
}: {
  step: string;
  title: string;
  detail: string;
  ready?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#ead8b4] bg-[#fffaf1]/90 p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#3d3122] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
          {step}
        </span>
        {ready !== undefined && (
          <StatusPill
            label={ready ? "ready" : "next"}
            tone={ready ? "good" : "warm"}
          />
        )}
      </div>
      <h3 className="text-sm font-black text-[#3d3122]">{title}</h3>
      <p className="mt-1 text-xs font-bold leading-relaxed text-[#7b5c3b]">
        {detail}
      </p>
    </div>
  );
}

function EvidenceDot({
  label,
  value,
}: {
  label: string;
  value: boolean | null | undefined;
}) {
  const ready = value === true;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
        ready
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-[#ead8b4] bg-[#fffaf1] text-[#8a6a3e]"
      }`}
    >
      {ready ? <CheckCircle2 size={12} /> : <Clock size={12} />}
      {label}
    </span>
  );
}

function LifecycleCheckPill({
  check,
}: {
  check: NonNullable<CoachingLifecycle["checks"]>[number];
}) {
  const classes: Record<LifecycleCheckStatus, string> = {
    present: "border-emerald-200 bg-emerald-50 text-emerald-700",
    attention: "border-amber-200 bg-amber-50 text-amber-700",
    missing: "border-[#ead8b4] bg-[#fffaf1] text-[#8a6a3e]",
    "not-required": "border-stone-200 bg-stone-50 text-stone-500",
  };

  return (
    <span
      title={check.meaning}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${classes[check.status] ?? classes.missing}`}
    >
      {check.status === "present" ? (
        <CheckCircle2 size={12} />
      ) : (
        <Clock size={12} />
      )}
      {check.label}
    </span>
  );
}

function safeActionTone(
  risk?: string | null,
): "good" | "warn" | "bad" | "warm" | "blue" {
  if (risk === "low") return "good";
  if (risk === "medium") return "blue";
  if (risk === "human-approval-required") return "warn";
  return "warm";
}

function LifecycleSafeActionCard({
  action,
}: {
  action: NonNullable<CoachingLifecycle["safeActions"]>[number];
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        action.enabled
          ? "border-emerald-200 bg-white/88"
          : "border-[#e8dcc4] bg-white/55 opacity-80"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill
          label={action.enabled ? "safe next" : "waiting"}
          tone={action.enabled ? "good" : "warm"}
        />
        <StatusPill
          label={
            action.risk === "human-approval-required"
              ? "human approval"
              : action.risk
          }
          tone={safeActionTone(action.risk)}
        />
      </div>
      <div className="mt-2 text-sm font-black text-[#2f3f31]">
        {action.label}
      </div>
      <p className="mt-1 text-xs font-bold leading-relaxed text-[#315641]">
        {action.why}
      </p>
      <p className="mt-2 rounded-lg bg-[#f7f1e6] p-2 text-[11px] font-bold leading-relaxed text-[#6e5635]">
        <span className="uppercase tracking-wide text-[#9a6a2f]">
          Action boundary:
        </span>{" "}
        {action.boundary}
      </p>
    </div>
  );
}

function LifecyclePanel({
  lifecycle,
}: {
  lifecycle?: CoachingLifecycle | null;
}) {
  if (!lifecycle) return null;
  const checks = lifecycle.checks ?? [];
  const visibleChecks = checks
    .filter((check) => check.status !== "not-required")
    .slice(0, 10);
  const safeActions = lifecycle.safeActions ?? [];
  const enabledSafeActions = safeActions.filter((action) => action.enabled);
  const visibleSafeActions = (
    enabledSafeActions.length > 0 ? enabledSafeActions : safeActions
  ).slice(0, 3);

  return (
    <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <StatusPill label="receipt slots" tone="good" />
        <StatusPill
          label={titleCase(lifecycle.stage) || "Needs Review"}
          tone={lifecycle.readyForReview ? "good" : "warm"}
        />
        {lifecycle.readyForCapture && (
          <StatusPill label="capture ready" tone="good" />
        )}
        {lifecycle.readyForTranscript && (
          <StatusPill label="transcript ready" tone="blue" />
        )}
        {lifecycle.readyForPacket && (
          <StatusPill label="packet ready" tone="blue" />
        )}
      </div>
      <p className="text-xs font-bold leading-relaxed text-[#315641]">
        {lifecycle.nextAction ||
          "Review the visible receipt slots before changing session state."}
      </p>
      {visibleChecks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visibleChecks.map((check) => (
            <LifecycleCheckPill key={check.id} check={check} />
          ))}
        </div>
      )}
      {visibleSafeActions.length > 0 && (
        <div className="mt-3 border-t border-emerald-100 pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-black uppercase tracking-wide text-[#315641]">
              Safe next actions
            </p>
            <StatusPill
              label={`${enabledSafeActions.length} enabled`}
              tone={enabledSafeActions.length ? "good" : "warm"}
            />
          </div>
          <div className="grid gap-2 lg:grid-cols-3">
            {visibleSafeActions.map((action) => (
              <LifecycleSafeActionCard key={action.id} action={action} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function JourneyPanel({
  summary,
  fallbackAction,
}: {
  summary?: JourneySummary | null;
  fallbackAction?: string | null;
}) {
  if (!summary) return null;

  const evidence = Object.entries(summary.evidence ?? {}).filter(
    ([, value]) => typeof value === "boolean",
  );
  const visibleEvidence = evidence.slice(0, 8);

  return (
    <div className="mt-3 rounded-2xl border border-[#ead8b4] bg-[#fff8ea] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <StatusPill
          label={`Journey ${titleCase(summary.stage) || "Needs Review"}`}
          tone="blue"
        />
        {summary.paymentStage && (
          <StatusPill
            label={`Payment ${titleCase(summary.paymentStage)}`}
            tone="warm"
          />
        )}
        {summary.roomStage && (
          <StatusPill
            label={`Room ${titleCase(summary.roomStage)}`}
            tone="warm"
          />
        )}
      </div>
      <p className="text-xs font-bold leading-relaxed text-[#5d4930]">
        {summary.nextAction ||
          fallbackAction ||
          "Review the next safe action before changing provider or capture state."}
      </p>
      {summary.paymentNextAction && (
        <p className="mt-1 text-[11px] font-bold leading-relaxed text-[#7b5c3b]">
          Payment: {summary.paymentNextAction}
        </p>
      )}
      {summary.roomNextAction && (
        <p className="mt-1 text-[11px] font-bold leading-relaxed text-[#7b5c3b]">
          Room: {summary.roomNextAction}
        </p>
      )}
      {summary.consent && (
        <p className="mt-2 rounded-xl bg-white/70 p-2 text-[11px] font-bold text-[#7b5c3b]">
          Consent: {summary.consent.grantedCount ?? 0}/
          {summary.consent.participantCount ?? 0} granted.{" "}
          {summary.consent.allParticipantsGranted
            ? "Provider recording can be started with a visible action."
            : summary.consent.nextAction ||
              "Confirm every participant before provider/server recording."}
        </p>
      )}
      {visibleEvidence.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visibleEvidence.map(([key, value]) => (
            <EvidenceDot
              key={key}
              label={titleCase(key.replace(/([A-Z])/g, " $1"))}
              value={value}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarPacketPanel({
  packet,
}: {
  packet?: CalendarReadyPacket | null;
}) {
  if (!packet) return null;

  return (
    <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <StatusPill label="calendar packet" tone="blue" />
        <StatusPill
          label={normalize(packet.status)}
          tone={
            packet.status.includes("cancel")
              ? "bad"
              : packet.status.includes("reschedule") ||
                  packet.status === "not-created"
                ? "warn"
                : packet.externalCalendarUpdated
                  ? "good"
                  : "warm"
          }
        />
        <StatusPill
          label={
            packet.externalCalendarUpdated
              ? "receipt-backed"
              : "not external yet"
          }
          tone={packet.externalCalendarUpdated ? "good" : "warn"}
        />
      </div>
      <p className="text-xs font-black text-[#3d3122]">{packet.title}</p>
      <p className="mt-1 text-[11px] font-bold text-[#5d4930]">
        {formatDateTime(packet.scheduledStart)} to{" "}
        {formatDateTime(packet.scheduledEnd)} · {packet.timezone}
      </p>
      <p className="mt-2 text-[11px] font-bold leading-relaxed text-[#5d4930]">
        {packet.nextAction}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <EvidenceDot
          label={`${packet.attendees.length} attendees`}
          value={packet.attendees.length > 0}
        />
        <EvidenceDot
          label="external receipt"
          value={packet.externalCalendarUpdated}
        />
        <EvidenceDot label={packet.provider} value={Boolean(packet.provider)} />
      </div>
      {packet.receipt?.htmlLink && (
        <a
          href={packet.receipt.htmlLink}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[11px] font-black uppercase tracking-wide text-sky-700 underline"
        >
          Open calendar receipt
        </a>
      )}
    </div>
  );
}

export default function CoachingPage() {
  const [runway, setRunway] = useState<CoachingRunway | null>(null);
  const [status, setStatus] = useState("Loading coaching runway...");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [createdHandoff, setCreatedHandoff] =
    useState<CoachingCreatedHandoff | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [checkoutStatusByBooking, setCheckoutStatusByBooking] = useState<
    Record<string, string>
  >({});
  const [checkoutBusyByBooking, setCheckoutBusyByBooking] = useState<
    Record<string, boolean>
  >({});
  const [linkCopyStatusByBooking, setLinkCopyStatusByBooking] = useState<
    Record<string, string>
  >({});
  const [portalStatusByBooking, setPortalStatusByBooking] = useState<
    Record<string, string>
  >({});
  const [portalBusyByBooking, setPortalBusyByBooking] = useState<
    Record<string, boolean>
  >({});
  const [holdStatusById, setHoldStatusById] = useState<Record<string, string>>(
    {},
  );
  const [holdBusyById, setHoldBusyById] = useState<Record<string, boolean>>({});
  const [bookingStatusById, setBookingStatusById] = useState<
    Record<string, string>
  >({});
  const [bookingBusyById, setBookingBusyById] = useState<
    Record<string, boolean>
  >({});
  const [providerRecordingStatusByRoom, setProviderRecordingStatusByRoom] =
    useState<Record<string, string>>({});
  const [providerRecordingBusyByRoom, setProviderRecordingBusyByRoom] =
    useState<Record<string, boolean>>({});
  const providerRecordingRequestIds = useRef<Record<string, string>>({});
  const [transcriptStatusByRoom, setTranscriptStatusByRoom] = useState<
    Record<string, string>
  >({});
  const [transcriptBusyByRoom, setTranscriptBusyByRoom] = useState<
    Record<string, boolean>
  >({});
  const [packetStatusByRoom, setPacketStatusByRoom] = useState<
    Record<string, string>
  >({});
  const [packetBusyByRoom, setPacketBusyByRoom] = useState<
    Record<string, boolean>
  >({});
  const [bookingScheduleDrafts, setBookingScheduleDrafts] = useState<
    Record<
      string,
      { scheduledStart: string; durationMinutes: string; reason: string }
    >
  >({});
  const [createForm, setCreateForm] = useState({
    runwayAction: "create-booking-room",
    clientEmail: "",
    clientName: "",
    title: "Coaching capture session",
    scheduledStart: "",
    durationMinutes: "60",
    timezone: "",
    purpose: "COACHING",
    paymentPolicy: "MANUAL",
    amountDollars: "",
    currency: "USD",
  });
  const [setupStatus, setSetupStatus] = useState<string | null>(null);
  const [isSettingUpCoach, setIsSettingUpCoach] = useState(false);
  const [setupForm, setSetupForm] = useState({
    coachEmail: "",
    coachName: "",
    offeringTitle: "One-to-one coaching session",
    offeringDescription:
      "A one-to-one coaching session with booking, payment evidence, consent-aware capture, transcript review, and a follow-up packet in Quipsly.",
    defaultDurationMinutes: "60",
    defaultAmountDollars: "",
    timezone: "",
    currency: "USD",
  });

  async function loadRunway() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/coaching/runway", {
        cache: "no-store",
      });
      const payload = (await response.json()) as CoachingRunway;
      if (!response.ok || !payload.ok)
        throw new Error(
          payload.error || `Runway returned HTTP ${response.status}.`,
        );
      setRunway(payload);
      setSetupForm((current) => ({
        ...current,
        coachEmail: current.coachEmail || payload.user?.email || "",
        coachName: current.coachName || payload.user?.name || "",
      }));
      setCreateForm((current) => ({
        ...current,
        timezone: payload.user?.isStaff
          ? current.timezone
          : payload.coaches?.[0]?.timezone || current.timezone,
      }));
      setStatus("Coaching runway ready");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Coaching runway could not load.",
      );
      setStatus("Needs attention");
    } finally {
      setIsLoading(false);
    }
  }

  async function createCheckoutSession(bookingId: string) {
    setCheckoutBusyByBooking((current) => ({ ...current, [bookingId]: true }));
    setCheckoutStatusByBooking((current) => ({
      ...current,
      [bookingId]: "Creating a secure Stripe payment link...",
    }));

    try {
      const response = await fetch("/api/coaching/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(
          payload.error || `Checkout returned HTTP ${response.status}.`,
        );

      const url =
        typeof payload.result?.url === "string" ? payload.result.url : "";
      setCheckoutStatusByBooking((current) => ({
        ...current,
        [bookingId]: url
          ? "Payment link ready. It opened in a new tab; copy it from this card if you need to send it manually."
          : payload.result?.nextAction ||
            "Payment link was created. Payment is still pending until Stripe sends a receipt.",
      }));
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      await loadRunway();
    } catch (cause) {
      setCheckoutStatusByBooking((current) => ({
        ...current,
        [bookingId]:
          cause instanceof Error
            ? cause.message
            : "Checkout could not be created.",
      }));
    } finally {
      setCheckoutBusyByBooking((current) => ({
        ...current,
        [bookingId]: false,
      }));
    }
  }

  async function copyCheckoutLink(bookingId: string, url: string) {
    setLinkCopyStatusByBooking((current) => ({
      ...current,
      [bookingId]: "Copying payment link...",
    }));
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopyStatusByBooking((current) => ({
        ...current,
        [bookingId]:
          "Payment link copied. Send it to the client only when the appointment details look right.",
      }));
    } catch {
      setLinkCopyStatusByBooking((current) => ({
        ...current,
        [bookingId]:
          "Copy failed. Open the payment page and copy the URL from the browser instead.",
      }));
    }
  }

  function clientEntryUrl(path: string | null | undefined) {
    if (!path || typeof window === "undefined") return "";
    return new URL(path, window.location.origin).toString();
  }

  async function copyClientSessionLink(
    bookingId: string,
    path?: string | null,
  ) {
    setLinkCopyStatusByBooking((current) => ({
      ...current,
      [bookingId]: "Copying client session link...",
    }));
    try {
      const url = clientEntryUrl(path);
      if (!url)
        throw new Error("This booking does not have a live Session path yet.");
      await navigator.clipboard.writeText(url);
      setLinkCopyStatusByBooking((current) => ({
        ...current,
        [bookingId]:
          "Client entry copied. Their verified invited email—not possession of the URL—controls access.",
      }));
    } catch {
      setLinkCopyStatusByBooking((current) => ({
        ...current,
        [bookingId]:
          "Copy failed. Open the coachee view and copy the URL from the browser instead.",
      }));
    }
  }

  async function shareClientSessionLink(input: {
    bookingId: string;
    title: string;
    clientEmail: string | null | undefined;
    clientEntryPath: string | null | undefined;
  }) {
    const url = clientEntryUrl(input.clientEntryPath);
    if (!url) {
      setLinkCopyStatusByBooking((current) => ({
        ...current,
        [input.bookingId]:
          "This booking does not have a live Session path yet.",
      }));
      return;
    }
    if (!navigator.share) {
      await copyClientSessionLink(input.bookingId, input.clientEntryPath);
      return;
    }
    try {
      await navigator.share({
        title: input.title,
        text: `Join your private Quipsly coaching Session. Sign in with ${input.clientEmail || "the invited email"}.`,
        url,
      });
      setLinkCopyStatusByBooking((current) => ({
        ...current,
        [input.bookingId]: "Client entry opened in the system share sheet.",
      }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLinkCopyStatusByBooking((current) => ({
        ...current,
        [input.bookingId]:
          "The system share sheet could not open. Copy the client entry instead.",
      }));
    }
  }

  async function createCustomerPortalSession(
    booking: NonNullable<CoachingRunway["upcomingBookings"]>[number],
  ) {
    setPortalBusyByBooking((current) => ({ ...current, [booking.id]: true }));
    setPortalStatusByBooking((current) => ({
      ...current,
      [booking.id]: "Opening coaching billing portal...",
    }));

    try {
      const response = await fetch("/api/coaching/customer-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: booking.clientUserId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(
          payload.error || `Customer portal returned HTTP ${response.status}.`,
        );

      const url =
        typeof payload.result?.url === "string" ? payload.result.url : "";
      setPortalStatusByBooking((current) => ({
        ...current,
        [booking.id]: url
          ? "Portal session created. Provider evidence remains separate from Quipsly booking truth."
          : "Portal session created without a returned URL.",
      }));
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      await loadRunway();
    } catch (cause) {
      setPortalStatusByBooking((current) => ({
        ...current,
        [booking.id]:
          cause instanceof Error
            ? cause.message
            : "Customer portal could not be opened.",
      }));
    } finally {
      setPortalBusyByBooking((current) => ({
        ...current,
        [booking.id]: false,
      }));
    }
  }

  function bookingDraft(
    booking: NonNullable<CoachingRunway["upcomingBookings"]>[number],
  ) {
    return (
      bookingScheduleDrafts[booking.id] ?? {
        scheduledStart: localDateTimeInputValue(
          new Date(booking.scheduledStart),
        ),
        durationMinutes: durationMinutesFromRange(
          booking.scheduledStart,
          booking.scheduledEnd,
        ),
        reason: "",
      }
    );
  }

  function updateBookingDraft(
    booking: NonNullable<CoachingRunway["upcomingBookings"]>[number],
    patch: Partial<{
      scheduledStart: string;
      durationMinutes: string;
      reason: string;
    }>,
  ) {
    setBookingScheduleDrafts((current) => ({
      ...current,
      [booking.id]: {
        ...bookingDraft(booking),
        ...patch,
      },
    }));
  }

  async function rescheduleBooking(
    booking: NonNullable<CoachingRunway["upcomingBookings"]>[number],
  ) {
    const draft = bookingDraft(booking);
    setBookingBusyById((current) => ({ ...current, [booking.id]: true }));
    setBookingStatusById((current) => ({
      ...current,
      [booking.id]: "Rescheduling in Quipsly...",
    }));

    try {
      const scheduledStart = draft.scheduledStart
        ? new Date(draft.scheduledStart).toISOString()
        : "";
      const response = await fetch("/api/coaching/runway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule-booking",
          bookingId: booking.id,
          scheduledStart,
          durationMinutes: Number.parseInt(draft.durationMinutes, 10) || 60,
          reason: draft.reason || "Rescheduled from the coaching runway UI.",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(
          payload.error || `Runway returned HTTP ${response.status}.`,
        );
      setBookingStatusById((current) => ({
        ...current,
        [booking.id]:
          payload.result?.nextAction || "Booking rescheduled in Quipsly.",
      }));
      await loadRunway();
    } catch (cause) {
      setBookingStatusById((current) => ({
        ...current,
        [booking.id]:
          cause instanceof Error
            ? cause.message
            : "Booking could not be rescheduled.",
      }));
    } finally {
      setBookingBusyById((current) => ({ ...current, [booking.id]: false }));
    }
  }

  async function cancelBooking(
    booking: NonNullable<CoachingRunway["upcomingBookings"]>[number],
  ) {
    setBookingBusyById((current) => ({ ...current, [booking.id]: true }));
    setBookingStatusById((current) => ({
      ...current,
      [booking.id]: "Canceling in Quipsly...",
    }));

    try {
      const draft = bookingDraft(booking);
      const response = await fetch("/api/coaching/runway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel-booking",
          bookingId: booking.id,
          reason: draft.reason || "Canceled from the coaching runway UI.",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(
          payload.error || `Runway returned HTTP ${response.status}.`,
        );
      setBookingStatusById((current) => ({
        ...current,
        [booking.id]:
          payload.result?.nextAction || "Booking canceled in Quipsly.",
      }));
      await loadRunway();
    } catch (cause) {
      setBookingStatusById((current) => ({
        ...current,
        [booking.id]:
          cause instanceof Error
            ? cause.message
            : "Booking could not be canceled.",
      }));
    } finally {
      setBookingBusyById((current) => ({ ...current, [booking.id]: false }));
    }
  }

  async function syncGoogleCalendar(
    booking: NonNullable<CoachingRunway["upcomingBookings"]>[number],
  ) {
    const confirmed = window.confirm(
      "Create or update a Google Calendar event for this Quipsly booking? Quipsly remains the source of truth, and guest invites are not sent unless calendar attendee sending is explicitly enabled on the server.",
    );
    if (!confirmed) return;

    setBookingBusyById((current) => ({ ...current, [booking.id]: true }));
    setBookingStatusById((current) => ({
      ...current,
      [booking.id]: "Syncing Google Calendar receipt...",
    }));

    try {
      const response = await fetch("/api/coaching/runway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync-google-calendar-event",
          bookingId: booking.id,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(
          payload.error || `Runway returned HTTP ${response.status}.`,
        );
      setBookingStatusById((current) => ({
        ...current,
        [booking.id]:
          payload.result?.nextAction || "Google Calendar receipt synced.",
      }));
      await loadRunway();
    } catch (cause) {
      setBookingStatusById((current) => ({
        ...current,
        [booking.id]:
          cause instanceof Error
            ? cause.message
            : "Google Calendar could not be synced.",
      }));
    } finally {
      setBookingBusyById((current) => ({ ...current, [booking.id]: false }));
    }
  }

  async function cancelGoogleCalendar(
    booking: NonNullable<CoachingRunway["upcomingBookings"]>[number],
  ) {
    const confirmed = window.confirm(
      "Cancel the receipt-backed Google Calendar event for this already-canceled Quipsly booking? Guest cancellation updates follow the server's explicit Google Calendar send-updates setting.",
    );
    if (!confirmed) return;
    setBookingBusyById((current) => ({ ...current, [booking.id]: true }));
    setBookingStatusById((current) => ({
      ...current,
      [booking.id]: "Canceling the Google Calendar event...",
    }));
    try {
      const response = await fetch("/api/coaching/runway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel-google-calendar-event",
          bookingId: booking.id,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(
          payload.error || `Runway returned HTTP ${response.status}.`,
        );
      setBookingStatusById((current) => ({
        ...current,
        [booking.id]:
          payload.result?.nextAction ||
          "Google Calendar cancellation receipt attached.",
      }));
      await loadRunway();
    } catch (cause) {
      setBookingStatusById((current) => ({
        ...current,
        [booking.id]:
          cause instanceof Error
            ? cause.message
            : "Google Calendar event could not be canceled.",
      }));
    } finally {
      setBookingBusyById((current) => ({ ...current, [booking.id]: false }));
    }
  }

  async function runProviderRecordingAction(
    room: NonNullable<CoachingRunway["captureRooms"]>[number],
    action:
      | "START_EGRESS"
      | "STOP_EGRESS"
      | "RECONCILE_COMMAND"
      | "RECONCILE_PROVIDER_FILE",
  ) {
    if (action === "START_EGRESS") {
      const confirmed = window.confirm(
        "Start the optional provider safety copy? Everyone must know recording is active and consent first. Protected local masters and capture-group timing remain the production sync authority.",
      );
      if (!confirmed) return;
    }

    setProviderRecordingBusyByRoom((current) => ({
      ...current,
      [room.id]: true,
    }));
    setProviderRecordingStatusByRoom((current) => ({
      ...current,
      [room.id]:
        action === "START_EGRESS"
          ? "Starting visible provider egress..."
          : action === "STOP_EGRESS"
            ? "Stopping provider egress..."
            : action === "RECONCILE_COMMAND"
              ? "Reconciling the uncertain provider command..."
              : "Reconciling provider recording file evidence...",
    }));

    const commandUsesIdempotency =
      action === "START_EGRESS" || action === "STOP_EGRESS";
    const requestKey = `${room.id}:${action}`;
    const requestId = commandUsesIdempotency
      ? providerRecordingRequestIds.current[requestKey] || crypto.randomUUID()
      : undefined;
    if (requestId) providerRecordingRequestIds.current[requestKey] = requestId;

    try {
      const response = await fetch(
        "/api/mobile/capture/rooms/provider-recording",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callRoomId: room.id,
            action,
            requestId,
            commandId: room.providerRecordingCommandId,
            recordingAssetId:
              room.providerRecordingActiveAssetId ||
              room.providerRecordingReceiptSlotId,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        // A 5xx can arrive after an external dispatch but before the browser
        // receives the durable acknowledgement. Keep the UUID for safe replay.
        if (requestId && response.status < 500) {
          delete providerRecordingRequestIds.current[requestKey];
        }
        await loadRunway();
        throw new Error(
          payload.error ||
            payload.message ||
            `Provider recording returned HTTP ${response.status}.`,
        );
      }

      if (
        requestId &&
        ["started", "stopped", "held", "failed"].includes(
          payload.command?.status,
        )
      ) {
        delete providerRecordingRequestIds.current[requestKey];
      }

      setProviderRecordingStatusByRoom((current) => ({
        ...current,
        [room.id]:
          payload.providerRecording?.nextAction ||
          payload.nextAction ||
          payload.message ||
          "Provider recording evidence updated. Refreshing Quipsly truth...",
      }));
      await loadRunway();
    } catch (cause) {
      // Transport loss, invalid success payloads, and 5xx responses are all
      // ambiguous. Preserve the UUID so a retry replays the durable command.
      setProviderRecordingStatusByRoom((current) => ({
        ...current,
        [room.id]:
          cause instanceof Error
            ? cause.message
            : "Provider recording action could not finish safely.",
      }));
    } finally {
      setProviderRecordingBusyByRoom((current) => ({
        ...current,
        [room.id]: false,
      }));
    }
  }

  async function runTranscriptAction(
    room: NonNullable<CoachingRunway["captureRooms"]>[number],
  ) {
    const transcriptJobId = room.latestTranscriptJobId;
    const recordingAssetId = transcriptJobId
      ? null
      : room.latestRecordingAssetId;

    setTranscriptBusyByRoom((current) => ({ ...current, [room.id]: true }));
    setTranscriptStatusByRoom((current) => ({
      ...current,
      [room.id]: transcriptJobId
        ? "Running or repairing the selected transcript job..."
        : "Creating a transcript job from verified recording evidence...",
    }));

    try {
      const response = await fetch("/api/mobile/capture/transcripts/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcriptJobId,
          recordingAssetId,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error ||
            payload.message ||
            `Transcript route returned HTTP ${response.status}.`,
        );
      }

      setTranscriptStatusByRoom((current) => ({
        ...current,
        [room.id]:
          payload.nextAction ||
          payload.message ||
          `Transcript ${payload.transcriptJob?.status ? normalize(payload.transcriptJob.status) : "updated"}. Refreshing Quipsly truth...`,
      }));
      await loadRunway();
    } catch (cause) {
      setTranscriptStatusByRoom((current) => ({
        ...current,
        [room.id]:
          cause instanceof Error
            ? cause.message
            : "Transcript work could not finish safely.",
      }));
    } finally {
      setTranscriptBusyByRoom((current) => ({ ...current, [room.id]: false }));
    }
  }

  async function buildPacketAction(
    room: NonNullable<CoachingRunway["captureRooms"]>[number],
  ) {
    setPacketBusyByRoom((current) => ({ ...current, [room.id]: true }));
    setPacketStatusByRoom((current) => ({
      ...current,
      [room.id]:
        "Building a reviewable coaching packet from the completed transcript...",
    }));

    try {
      const response = await fetch("/api/mobile/capture/transcripts/packet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcriptJobId: room.latestTranscriptJobId,
          force: false,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error ||
            payload.message ||
            `Packet route returned HTTP ${response.status}.`,
        );
      }

      setPacketStatusByRoom((current) => ({
        ...current,
        [room.id]:
          payload.nextAction ||
          payload.message ||
          "Packet evidence created. Refreshing Quipsly truth...",
      }));
      await loadRunway();
    } catch (cause) {
      setPacketStatusByRoom((current) => ({
        ...current,
        [room.id]:
          cause instanceof Error
            ? cause.message
            : "Packet work could not finish safely.",
      }));
    } finally {
      setPacketBusyByRoom((current) => ({ ...current, [room.id]: false }));
    }
  }

  async function releaseBookingHold(holdId: string) {
    setHoldBusyById((current) => ({ ...current, [holdId]: true }));
    setHoldStatusById((current) => ({
      ...current,
      [holdId]: "Releasing hold...",
    }));

    try {
      const response = await fetch("/api/coaching/runway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "release-booking-hold",
          holdId,
          reason: "Released from the coaching runway UI.",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(
          payload.error || `Runway returned HTTP ${response.status}.`,
        );
      setHoldStatusById((current) => ({
        ...current,
        [holdId]: payload.result?.nextAction || "Hold released.",
      }));
      await loadRunway();
    } catch (cause) {
      setHoldStatusById((current) => ({
        ...current,
        [holdId]:
          cause instanceof Error
            ? cause.message
            : "Hold could not be released.",
      }));
    } finally {
      setHoldBusyById((current) => ({ ...current, [holdId]: false }));
    }
  }

  async function convertBookingHold(holdId: string) {
    setHoldBusyById((current) => ({ ...current, [holdId]: true }));
    setHoldStatusById((current) => ({
      ...current,
      [holdId]: "Converting hold into booking and capture room...",
    }));

    try {
      const response = await fetch("/api/coaching/runway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "convert-booking-hold",
          holdId,
          notes: "Converted from the coaching runway UI.",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(
          payload.error || `Runway returned HTTP ${response.status}.`,
        );
      setHoldStatusById((current) => ({
        ...current,
        [holdId]: payload.result?.nextAction || "Hold converted to booking.",
      }));
      await loadRunway();
    } catch (cause) {
      setHoldStatusById((current) => ({
        ...current,
        [holdId]:
          cause instanceof Error
            ? cause.message
            : "Hold could not be converted.",
      }));
    } finally {
      setHoldBusyById((current) => ({ ...current, [holdId]: false }));
    }
  }

  useEffect(() => {
    void loadRunway();
  }, []);

  useEffect(() => {
    if (!runway?.user) return;
    setSetupForm((current) => ({
      ...current,
      coachEmail: current.coachEmail || runway.user?.email || "",
      coachName:
        current.coachName || runway.user?.name || runway.user?.email || "",
    }));
  }, [runway?.user?.email, runway?.user?.name]);

  useEffect(() => {
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detectedTimezone) {
      setSetupForm((current) => ({
        ...current,
        timezone: current.timezone || detectedTimezone,
      }));
    }
    const nextStart = new Date();
    nextStart.setDate(nextStart.getDate() + 1);
    nextStart.setMinutes(0, 0, 0);
    setCreateForm((current) => ({
      ...current,
      scheduledStart:
        current.scheduledStart || localDateTimeInputValue(nextStart),
      timezone: current.timezone || detectedTimezone || "UTC",
    }));
  }, []);

  async function setupCoachProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSettingUpCoach(true);
    setSetupStatus(
      "Setting up coach profile, offering, and flexible scheduling clue...",
    );
    try {
      const response = await fetch("/api/coaching/runway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setup-coach-profile",
          ...setupForm,
          defaultDurationMinutes:
            Number.parseInt(setupForm.defaultDurationMinutes, 10) || 60,
          defaultAmountCents: dollarsToCents(setupForm.defaultAmountDollars),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(
          payload.error || `Runway returned HTTP ${response.status}.`,
        );
      setSetupStatus(payload.result?.nextAction || "Coach setup is ready.");
      setCreateForm((current) => ({
        ...current,
        title: setupForm.offeringTitle || current.title,
        durationMinutes:
          setupForm.defaultDurationMinutes || current.durationMinutes,
        timezone: setupForm.timezone || current.timezone,
        paymentPolicy: dollarsToCents(setupForm.defaultAmountDollars)
          ? "PAID_ONE_TO_ONE"
          : "MANUAL",
        amountDollars: setupForm.defaultAmountDollars || current.amountDollars,
        currency: setupForm.currency || current.currency,
      }));
      await loadRunway();
    } catch (cause) {
      setSetupStatus(
        cause instanceof Error
          ? cause.message
          : "Coach setup could not be completed.",
      );
    } finally {
      setIsSettingUpCoach(false);
    }
  }

  async function createLocalSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setCreateStatus(null);
    setCreatedHandoff(null);
    const submitted = { ...createForm };
    try {
      const response = await fetch("/api/coaching/runway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: createForm.runwayAction,
          ...createForm,
          durationMinutes:
            Number.parseInt(createForm.durationMinutes, 10) || 60,
          amountCents: dollarsToCents(createForm.amountDollars),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(
          payload.error || `Runway returned HTTP ${response.status}.`,
        );
      setCreateStatus(payload.result?.nextAction || "Session created.");
      if (
        submitted.runwayAction === "create-booking-room" &&
        payload.result?.bookingId &&
        payload.result?.callRoomId &&
        payload.result?.clientEntryPath
      ) {
        setCreatedHandoff({
          bookingId: payload.result.bookingId,
          callRoomId: payload.result.callRoomId,
          engagementId: payload.result.engagementId || null,
          clientEntryPath: payload.result.clientEntryPath,
          engagementPath: payload.result.engagementPath || null,
          liveSessionPath:
            payload.result.liveSessionPath || payload.result.clientEntryPath,
          sessionWorkspacePath:
            payload.result.sessionWorkspacePath ||
            `/sessions/${encodeURIComponent(payload.result.callRoomId)}`,
          clientEmail: submitted.clientEmail.trim().toLowerCase(),
          clientName: submitted.clientName.trim() || null,
          title: submitted.title,
          scheduledStart: submitted.scheduledStart,
        });
      }
      setCreateForm((current) => ({
        ...current,
        clientEmail: "",
        clientName: "",
        scheduledStart: "",
        amountDollars:
          current.paymentPolicy === "PAID_ONE_TO_ONE"
            ? current.amountDollars
            : "",
      }));
      await loadRunway();
    } catch (cause) {
      setCreateStatus(
        cause instanceof Error
          ? cause.message
          : "Session could not be created.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  const counts = runway?.counts;
  const readiness = runway?.readiness;
  const bookings = runway?.upcomingBookings ?? [];
  const rooms = runway?.captureRooms ?? [];
  const offerings = runway?.offerings ?? [];
  const availabilityWindows = runway?.availabilityWindows ?? [];
  const bookingHolds = runway?.bookingHolds ?? [];
  const requests = runway?.openRequests ?? [];
  const nextRoom = useMemo(
    () =>
      rooms.find(
        (room) => room.status === "OPEN" || room.status === "RECORDING",
      ) ?? rooms[0],
    [rooms],
  );
  const isStaff = runway?.user?.isStaff === true;
  const canManageCoaching = isStaff || runway?.user?.isCoach === true;

  return (
    <div className="min-h-full w-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,#fff7df,transparent_35%),linear-gradient(135deg,#fffaf1,#f7efe2_45%,#eef8f0)]">
      <header className="mx-auto max-w-7xl px-8 pb-4 pt-8">
        <div className="rounded-[2rem] border border-[#e8dcc4] bg-white/75 p-7 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.28em] text-[#b98036]">
                Quipsly coaching runway
              </p>
              <h1 className="max-w-3xl text-4xl font-black leading-tight text-[#3d3122]">
                Schedule the next session. Quipsly keeps the rest together.
              </h1>
              <p className="mt-3 max-w-3xl text-[#7b5c3b]">
                Coaches get one calm place to create sessions, invite clients,
                record only after consent, and review follow-up. Clients get the
                simple version: time, consent, join, shared notes, goals, and
                tasks. Payment stays optional while a coach is getting started.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {isStaff ? (
                <StatusPill label="staff operations" tone="blue" />
              ) : null}
              {isStaff ? (
                <StatusPill label={status} tone={error ? "bad" : "good"} />
              ) : null}
              <a
                href="/coaching/sessions"
                className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800 shadow-sm transition hover:bg-emerald-100"
              >
                <Users size={15} /> All Sessions
              </a>
              {isStaff ? (
                <button
                  onClick={() => void loadRunway()}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 rounded-full border border-[#d6c5a5] bg-[#3d3122] px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-[#5a472f] disabled:cursor-wait disabled:opacity-60"
                >
                  <RefreshCw
                    size={15}
                    className={isLoading ? "animate-spin" : ""}
                  />{" "}
                  Refresh operations
                </button>
              ) : null}
            </div>
          </div>
          {error && (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
              {error}
            </div>
          )}
          {isStaff ? (
            <p className="mt-6 rounded-2xl border border-[#eadbc6] bg-[#fffaf1] p-4 text-sm font-bold leading-relaxed text-[#6f5c42]">
              Operator view: these cards report evidence Quipsly can see. They
              are deliberately absent from the ordinary coach journey so
              provider diagnostics and acceptance fixtures never become the
              product workflow.
            </p>
          ) : null}
          {!isLoading && runway?.user && !canManageCoaching ? (
            <a
              href="#coach-setup"
              className="mt-4 inline-flex min-h-11 items-center rounded-full bg-emerald-800 px-5 py-3 text-sm font-black text-white shadow-sm"
            >
              Start here · finish coach setup
            </a>
          ) : null}
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <FriendlyStepCard
              step="1"
              title="Set coach profile"
              detail="Your coach identity connects private relationships, Sessions, recordings, and follow-up."
              ready={canManageCoaching}
            />
            <FriendlyStepCard
              step="2"
              title="Create session"
              detail="Use a hold for tentative time. Create a booking when the coachee should see the appointment."
              ready={
                (counts?.activeHolds ?? 0) > 0 ||
                (counts?.upcomingBookings ?? 0) > 0
              }
            />
            <FriendlyStepCard
              step="3"
              title="Meet and record"
              detail="Open the room, choose each device, confirm consent, and record only when everyone is ready."
              ready={(counts?.roomsWithRecordings ?? 0) > 0}
            />
            <FriendlyStepCard
              step="4"
              title="Review and share"
              detail="Review the transcript, notes, goals, tasks, and recording before sharing follow-up."
              ready={(counts?.roomsWithPackets ?? 0) > 0}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-8 pb-10 xl:grid-cols-[1.5fr_0.95fr]">
        <section className="space-y-6">
          {isStaff ? (
            <details className="rounded-[1.7rem] border border-sky-200 bg-sky-50/70 p-5 shadow-sm">
              <summary className="cursor-pointer text-sm font-black uppercase tracking-[0.14em] text-sky-800">
                Operations and provider diagnostics
              </summary>
              <p className="mt-2 text-sm leading-6 text-sky-900">
                Staff-only readiness, receipt, payment, provider, and
                tentative-hold evidence. This is not part of the coach or client
                acceptance journey.
              </p>
              <div className="mt-5 space-y-6">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                  <ReadinessCard
                    title="Schedule"
                    detail={`${counts?.availabilityWindows ?? 0} windows, ${counts?.activeHolds ?? 0} active holds`}
                    ready={
                      (counts?.availabilityWindows ?? 0) > 0 ||
                      (counts?.activeHolds ?? 0) > 0
                    }
                  />
                  <ReadinessCard
                    title="Bookings"
                    detail={`${counts?.upcomingBookings ?? 0} upcoming`}
                    ready={(counts?.upcomingBookings ?? 0) > 0}
                  />
                  <ReadinessCard
                    title="Calendar"
                    detail={calendarReadinessDetail(readiness)}
                    ready={readiness?.calendarReadiness?.accessOk === true}
                  />
                  <ReadinessCard
                    title="Capture"
                    detail={`${counts?.captureRooms ?? 0} rooms, ${counts?.roomsWithRecordings ?? 0} with recordings`}
                    ready={(counts?.captureRooms ?? 0) > 0}
                  />
                  <ReadinessCard
                    title="Transcripts"
                    detail={
                      readiness?.deepgramConfigured
                        ? "Provider configured"
                        : "Provider held"
                    }
                    ready={readiness?.deepgramConfigured === true}
                  />
                  <ReadinessCard
                    title="Stripe"
                    detail={
                      readiness?.stripeConfigured
                        ? readiness.stripeLiveAllowed
                          ? "Live guard enabled"
                          : "Test/internal evidence only"
                        : "Checkout not configured"
                    }
                    ready={readiness?.stripeConfigured === true}
                  />
                </div>

                <div className="rounded-[1.7rem] border border-[#e8dcc4] bg-white/80 p-5 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h2 className="flex items-center gap-2 text-xl font-black text-[#3d3122]">
                        <Receipt className="text-[#b98036]" /> Payment evidence
                        boundary
                      </h2>
                      <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6b5538]">
                        {readiness?.paymentReadiness?.checkoutBoundary ??
                          "Paid one-to-one coaching should use a Stripe-hosted payment page. Coachees should never have to trust a half-built custom card form."}
                      </p>
                    </div>
                    <StatusPill
                      label={
                        readiness?.paymentReadiness?.stripeMode
                          ? normalize(readiness.paymentReadiness.stripeMode)
                          : "unknown"
                      }
                      tone={
                        readiness?.stripeLiveAllowed
                          ? "warn"
                          : readiness?.stripeConfigured
                            ? "blue"
                            : "warm"
                      }
                    />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <p className="rounded-2xl border border-[#efe3cb] bg-[#fdfaf6] p-3 text-xs font-bold leading-5 text-[#7b5c3b]">
                      Stripe:{" "}
                      {readiness?.paymentReadiness?.stripeNextAction ??
                        "When the session details are right, create a secure payment link and send it to the coachee."}
                    </p>
                    <p className="rounded-2xl border border-[#efe3cb] bg-[#fdfaf6] p-3 text-xs font-bold leading-5 text-[#7b5c3b]">
                      Portal:{" "}
                      {readiness?.paymentReadiness?.customerPortalNextAction ??
                        "Use the portal only after there is real Stripe customer evidence for this coachee."}
                    </p>
                  </div>
                  <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-black leading-5 text-amber-800">
                    Customer Portal requires existing Stripe customer evidence.
                    It helps with eligible one-to-one coaching billing after
                    checkout evidence exists; it does not create bookings,
                    subscriptions, course access, SaaS access, recordings, or
                    entitlements.
                  </p>
                </div>

                <div className="rounded-[1.7rem] border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h2 className="flex items-center gap-2 text-xl font-black text-[#12384d]">
                        <CalendarIcon className="text-sky-700" /> Calendar
                        evidence boundary
                      </h2>
                      <p className="mt-2 max-w-4xl text-sm leading-6 text-[#31566b]">
                        {readiness?.calendarReadiness?.sourceOfTruth ??
                          "Google Calendar is scheduling evidence and convenience. Quipsly owns booking, room, consent, recording, transcript, notes, goals, and follow-up truth."}
                      </p>
                    </div>
                    <StatusPill
                      label={
                        readiness?.calendarReadiness?.accessOk
                          ? "access verified"
                          : readiness?.calendarReadiness?.configured
                            ? "verify first"
                            : "setup needed"
                      }
                      tone={
                        readiness?.calendarReadiness?.accessOk ? "good" : "warn"
                      }
                    />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <p className="rounded-2xl border border-sky-100 bg-white p-3 text-xs font-bold leading-5 text-[#31566b]">
                      Timezone:{" "}
                      {readiness?.calendarReadiness?.defaultTimezone ??
                        "America/Los_Angeles"}{" "}
                      is the coaching default unless a specific coach, booking,
                      or client-facing choice overrides it.
                    </p>
                    <p className="rounded-2xl border border-sky-100 bg-white p-3 text-xs font-bold leading-5 text-[#31566b]">
                      Provider:{" "}
                      {readiness?.calendarReadiness?.configurationStatus
                        ? normalize(
                            readiness.calendarReadiness.configurationStatus,
                          )
                        : "calendar readiness not loaded"}
                      .
                    </p>
                    <p className="rounded-2xl border border-sky-100 bg-white p-3 text-xs font-bold leading-5 text-[#31566b]">
                      Next:{" "}
                      {readiness?.calendarReadiness?.nextAction ??
                        "Verify calendar access before promising external sync."}
                    </p>
                  </div>
                </div>

                <div className="rounded-[1.7rem] border border-[#e8dcc4] bg-white/80 p-6 shadow-sm">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <h2 className="flex items-center gap-2 text-2xl font-black text-[#3d3122]">
                        <Clock className="text-[#b98036]" /> Scheduling runway
                      </h2>
                      <p className="mt-1 text-sm text-[#7b5c3b]">
                        Availability clues and temporary holds before a session
                        becomes a committed booking.
                      </p>
                    </div>
                    <StatusPill
                      label={`${availabilityWindows.length} windows · ${bookingHolds.length} holds`}
                      tone="warm"
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[#e8dcc4] bg-[#fdfaf6] p-4">
                      <h3 className="mb-3 font-black text-[#3d3122]">
                        Availability windows
                      </h3>
                      <div className="space-y-3">
                        {availabilityWindows.length === 0 ? (
                          <p className="rounded-xl border border-dashed border-[#d6c5a5] bg-[#fffaf1] p-4 text-sm text-[#7b5c3b]">
                            No reusable availability windows yet. This does not
                            block manual booking, but it makes scheduling harder
                            to trust.
                          </p>
                        ) : (
                          availabilityWindows.slice(0, 8).map((window) => (
                            <div
                              key={window.id}
                              className="rounded-xl border border-[#efe3cb] bg-white p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-black text-[#3d3122]">
                                  {window.label}
                                </p>
                                <StatusPill
                                  label={window.kind}
                                  tone={
                                    window.kind === "specific" ? "blue" : "warm"
                                  }
                                />
                              </div>
                              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-[#b98036]">
                                {window.timezone}
                              </p>
                              <p className="mt-2 text-sm text-[#7b5c3b]">
                                {window.nextAction}
                              </p>
                              <p className="mt-1 text-xs text-[#7b5c3b]">
                                Coach: {window.coach?.name ?? "Unassigned"}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#e8dcc4] bg-[#fdfaf6] p-4">
                      <h3 className="mb-3 font-black text-[#3d3122]">
                        Booking holds
                      </h3>
                      <div className="space-y-3">
                        {bookingHolds.length === 0 ? (
                          <p className="rounded-xl border border-dashed border-[#d6c5a5] bg-[#fffaf1] p-4 text-sm text-[#7b5c3b]">
                            No active or recent holds. A hold is the safe middle
                            state between interest and confirmed booking.
                          </p>
                        ) : (
                          bookingHolds.slice(0, 8).map((hold) => (
                            <div
                              key={hold.id}
                              className="rounded-xl border border-[#efe3cb] bg-white p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-black text-[#3d3122]">
                                  {hold.offeringTitle || "Held coaching slot"}
                                </p>
                                <StatusPill
                                  label={normalize(hold.status)}
                                  tone={holdTone(hold.status)}
                                />
                              </div>
                              <p className="mt-1 text-sm text-[#7b5c3b]">
                                {formatDateTime(hold.scheduledStart)} to{" "}
                                {formatDateTime(hold.scheduledEnd)} ·{" "}
                                {hold.timezone}
                              </p>
                              <p className="mt-2 text-sm font-bold text-[#3d3122]">
                                {hold.nextAction}
                              </p>
                              <div className="mt-2 grid gap-1 text-xs text-[#7b5c3b]">
                                <span>
                                  Client:{" "}
                                  {hold.client?.name ??
                                    hold.contactEmail ??
                                    "Not attached yet"}
                                </span>
                                <span>
                                  Coach: {hold.coach?.name ?? "Unassigned"}
                                </span>
                                <span>
                                  Expires: {formatDateTime(hold.expiresAt)}
                                </span>
                              </div>
                              {holdStatusById[hold.id] && (
                                <p className="mt-2 rounded-lg bg-[#f8f3e6] p-2 text-xs font-bold text-[#7b5c3b]">
                                  {holdStatusById[hold.id]}
                                </p>
                              )}
                              {canManageCoaching &&
                                hold.status === "ACTIVE" && (
                                  <div className="mt-3 grid grid-cols-2 gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void convertBookingHold(hold.id)
                                      }
                                      disabled={holdBusyById[hold.id]}
                                      className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-50"
                                    >
                                      Convert
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void releaseBookingHold(hold.id)
                                      }
                                      disabled={holdBusyById[hold.id]}
                                      className="inline-flex items-center justify-center rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-[#7b5c3b] transition hover:bg-[#fffaf1] disabled:cursor-wait disabled:opacity-50"
                                    >
                                      Release
                                    </button>
                                  </div>
                                )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </details>
          ) : null}

          <div className="rounded-[1.7rem] border border-[#e8dcc4] bg-white/80 p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-2xl font-black text-[#3d3122]">
                  <CalendarIcon className="text-[#b98036]" /> Upcoming sessions
                </h2>
                <p className="mt-1 text-sm text-[#7b5c3b]">
                  Open the Session, invite the client, or make a schedule
                  change.
                </p>
              </div>
              <StatusPill label={`${bookings.length} visible`} tone="warm" />
            </div>

            <div className="space-y-3">
              {bookings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#d6c5a5] bg-[#fffaf1] p-5 text-[#7b5c3b]">
                  No upcoming coaching bookings are visible yet. Next useful
                  action: create a booking/hold path that writes to
                  Quipsly-owned records before Stripe or calendar evidence.
                </div>
              ) : (
                bookings.map((booking) => {
                  const draft = bookingDraft(booking);
                  const canChangeSchedule =
                    canManageCoaching &&
                    !["CANCELED", "COMPLETED", "NO_SHOW"].includes(
                      booking.status,
                    ) &&
                    !["RECORDING", "ENDED", "CANCELED"].includes(
                      booking.callRoomStatus || "",
                    );
                  const canSyncCalendar =
                    canManageCoaching && !["CANCELED"].includes(booking.status);

                  return (
                    <article
                      key={booking.id}
                      className="rounded-2xl border border-[#e8dcc4] bg-[#fdfaf6] p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill
                              label={normalize(booking.status)}
                              tone={bookingTone(booking.status)}
                            />
                            {booking.paymentPolicy === "PAID_ONE_TO_ONE" ? (
                              <StatusPill label="payment needed" tone="blue" />
                            ) : null}
                            {isStaff && booking.latestCheckoutStatus && (
                              <StatusPill
                                label={`checkout ${normalize(booking.latestCheckoutStatus)}`}
                                tone={
                                  booking.paymentStatus === "PAID"
                                    ? "good"
                                    : "warn"
                                }
                              />
                            )}
                            <StatusPill
                              label={
                                booking.callRoomStatus
                                  ? `room ${normalize(booking.callRoomStatus)}`
                                  : "room needed"
                              }
                              tone={
                                booking.callRoomStatus === "CANCELED"
                                  ? "bad"
                                  : booking.callRoomId
                                    ? "good"
                                    : "warn"
                              }
                            />
                            {isStaff && booking.calendarStatus && (
                              <StatusPill
                                label={`calendar ${normalize(booking.calendarStatus)}`}
                                tone={
                                  booking.calendarStatus.includes("cancel")
                                    ? "bad"
                                    : booking.calendarStatus.includes(
                                          "reschedule",
                                        )
                                      ? "warn"
                                      : "warm"
                                }
                              />
                            )}
                          </div>
                          <h3 className="mt-3 text-lg font-black text-[#3d3122]">
                            {booking.title}
                          </h3>
                          <p className="mt-1 text-sm text-[#7b5c3b]">
                            {formatDateTime(booking.scheduledStart)} to{" "}
                            {formatDateTime(booking.scheduledEnd)} ·{" "}
                            {booking.timezone}
                          </p>
                          <p className="mt-2 text-sm font-bold text-[#3d3122]">
                            {booking.nextAction}
                          </p>
                          {booking.paymentPolicy === "PAID_ONE_TO_ONE" ? (
                            <p className="mt-1 text-xs font-bold text-[#7b5c3b]">
                              {booking.paymentNextAction}
                            </p>
                          ) : null}
                          {isStaff ? (
                            <details className="mt-3 rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                              <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-sky-800">
                                Booking evidence and lifecycle
                              </summary>
                              <JourneyPanel
                                summary={booking.journeySummary}
                                fallbackAction={booking.nextAction}
                              />
                              <LifecyclePanel lifecycle={booking.lifecycle} />
                              <CalendarPacketPanel
                                packet={booking.calendarReadyPacket}
                              />
                            </details>
                          ) : null}
                          {(checkoutStatusByBooking[booking.id] ||
                            bookingStatusById[booking.id]) && (
                            <div className="mt-2 space-y-2">
                              {checkoutStatusByBooking[booking.id] && (
                                <p className="rounded-xl bg-[#f8f3e6] p-3 text-xs font-bold text-[#7b5c3b]">
                                  {checkoutStatusByBooking[booking.id]}
                                </p>
                              )}
                              {bookingStatusById[booking.id] && (
                                <p className="rounded-xl bg-[#f8f3e6] p-3 text-xs font-bold text-[#7b5c3b]">
                                  {bookingStatusById[booking.id]}
                                </p>
                              )}
                            </div>
                          )}
                          {linkCopyStatusByBooking[booking.id] && (
                            <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
                              {linkCopyStatusByBooking[booking.id]}
                            </p>
                          )}
                        </div>
                        <div className="min-w-60 rounded-xl border border-[#e8dcc4] bg-white p-3 text-sm text-[#7b5c3b]">
                          <div className="mb-3 grid gap-2">
                            {booking.liveSessionPath ? (
                              <a
                                href={booking.liveSessionPath}
                                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-3 py-2 text-xs font-black uppercase tracking-wide text-white transition hover:bg-emerald-900"
                              >
                                <Video size={14} /> Open Session
                              </a>
                            ) : null}
                            {booking.engagementPath ? (
                              <a
                                href={booking.engagementPath}
                                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-emerald-800 transition hover:bg-emerald-100"
                              >
                                <Users size={14} /> Coaching home
                              </a>
                            ) : null}
                          </div>
                          <p>
                            <strong>Client:</strong>{" "}
                            {booking.client?.name ?? "Unassigned"}
                          </p>
                          <p>
                            <strong>Coach:</strong>{" "}
                            {booking.coach?.name ?? "Unassigned"}
                          </p>
                          {booking.paymentPolicy === "PAID_ONE_TO_ONE" ? (
                            <p>
                              <strong>Price:</strong>{" "}
                              {money(booking.amountCents, booking.currency)}
                            </p>
                          ) : null}
                          {booking.paymentPolicy === "PAID_ONE_TO_ONE" ? (
                            <p>
                              <strong>Payment:</strong>{" "}
                              {booking.paymentStatus
                                ? normalize(booking.paymentStatus)
                                : "needs payment link"}
                            </p>
                          ) : null}
                          {isStaff && booking.latestCheckoutSessionId && (
                            <p className="break-all text-xs">
                              <strong>Latest:</strong>{" "}
                              {booking.latestCheckoutSessionId}
                            </p>
                          )}
                          <a
                            href={`/api/coaching/bookings/${encodeURIComponent(booking.id)}/calendar`}
                            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-[#7b5c3b] transition hover:bg-[#fffaf1]"
                          >
                            <CalendarIcon size={14} /> Add with iCalendar
                          </a>
                          {canManageCoaching &&
                            readiness?.calendarReadiness?.accessOk === true && (
                              <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
                                <p className="text-[11px] font-black uppercase tracking-wide text-sky-700">
                                  Google Calendar
                                </p>
                                <p className="mt-1 text-xs font-bold text-[#3d3122]">
                                  {booking.calendarReadyPacket
                                    ?.externalCalendarUpdated
                                    ? "Receipt-backed event is attached. Quipsly still owns session truth."
                                    : "Create/update the external event only when the Quipsly time looks right."}
                                </p>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void syncGoogleCalendar(booking)
                                  }
                                  disabled={
                                    !canSyncCalendar ||
                                    bookingBusyById[booking.id]
                                  }
                                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <CalendarIcon size={14} />{" "}
                                  {bookingBusyById[booking.id]
                                    ? "Syncing..."
                                    : "Sync calendar receipt"}
                                </button>
                                {booking.status === "CANCELED" &&
                                booking.calendarReadyPacket
                                  ?.externalCalendarEventExists ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void cancelGoogleCalendar(booking)
                                    }
                                    disabled={bookingBusyById[booking.id]}
                                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <CalendarIcon size={14} /> Cancel external
                                    event
                                  </button>
                                ) : null}
                              </div>
                            )}
                          {booking.paymentPolicy === "PAID_ONE_TO_ONE" ? (
                            <div className="mt-3 rounded-2xl border border-[#e8dcc4] bg-[#fffaf1] p-3">
                              <p className="text-[11px] font-black uppercase tracking-wide text-[#b98036]">
                                Payment request
                              </p>
                              <p className="mt-1 text-xs font-bold text-[#3d3122]">
                                {booking.paymentPolicy !== "PAID_ONE_TO_ONE"
                                  ? "No Stripe payment is needed for this session."
                                  : booking.paymentStatus === "PAID"
                                    ? "Paid. Stripe receipt evidence is attached."
                                    : booking.latestCheckoutUrl
                                      ? "Ready for the client to pay in Stripe Checkout."
                                      : canManageCoaching
                                        ? "Create a payment link when the appointment details are correct."
                                        : "Your coach is preparing the payment link for this session."}
                              </p>
                              <p className="mt-1 text-[11px] text-[#7b5c3b]">
                                Stripe handles the card form. Quipsly keeps the
                                appointment, room, and receipt trail together.
                              </p>
                            </div>
                          ) : null}
                          {canManageCoaching &&
                            booking.paymentPolicy === "PAID_ONE_TO_ONE" &&
                            booking.paymentStatus !== "PAID" && (
                              <button
                                type="button"
                                onClick={() =>
                                  void createCheckoutSession(booking.id)
                                }
                                disabled={
                                  checkoutBusyByBooking[booking.id] ||
                                  readiness?.stripeConfigured !== true
                                }
                                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#d6c5a5] bg-[#3d3122] px-3 py-2 text-xs font-black uppercase tracking-wide text-white transition hover:bg-[#5a472f] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Receipt size={14} />{" "}
                                {checkoutBusyByBooking[booking.id]
                                  ? "Creating..."
                                  : booking.latestCheckoutUrl
                                    ? "Create fresh payment link"
                                    : "Create payment link"}
                              </button>
                            )}
                          {booking.latestCheckoutUrl && (
                            <div className="mt-2 grid grid-cols-1 gap-2">
                              <a
                                href={booking.latestCheckoutUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-emerald-800 transition hover:bg-emerald-100"
                              >
                                <ExternalLink size={14} />{" "}
                                {booking.paymentStatus === "PAID"
                                  ? "Open receipt link"
                                  : "Pay for this session"}
                              </a>
                              {canManageCoaching && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void copyCheckoutLink(
                                      booking.id,
                                      booking.latestCheckoutUrl || "",
                                    )
                                  }
                                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-[#7b5c3b] transition hover:bg-[#fffaf1]"
                                >
                                  <Copy size={14} /> Copy payment link
                                </button>
                              )}
                            </div>
                          )}
                          {canManageCoaching && (
                            <div className="mt-2 rounded-xl border border-[#e8dcc4] bg-white/80 p-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void copyClientSessionLink(
                                    booking.id,
                                    booking.clientEntryPath,
                                  )
                                }
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#d6c5a5] bg-[#fffaf1] px-3 py-2 text-xs font-black uppercase tracking-wide text-[#7b5c3b] transition hover:bg-white"
                              >
                                <Copy size={14} /> Copy client entry
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void shareClientSessionLink({
                                    bookingId: booking.id,
                                    title: booking.title,
                                    clientEmail: booking.client?.email,
                                    clientEntryPath: booking.clientEntryPath,
                                  })
                                }
                                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-violet-800 transition hover:bg-violet-100"
                              >
                                <Share2 size={14} /> Share client entry
                              </button>
                              <p className="mt-2 text-[11px] font-bold leading-relaxed text-[#7b5c3b]">
                                Send this when the client is ready. Quipsly
                                checks the verified invited email before opening
                                their live room and private coaching work.
                              </p>
                            </div>
                          )}
                          {runway?.user?.isStaff === true &&
                            booking.stripeCustomerEvidence && (
                              <button
                                type="button"
                                onClick={() =>
                                  void createCustomerPortalSession(booking)
                                }
                                disabled={
                                  portalBusyByBooking[booking.id] ||
                                  readiness?.coachingCustomerPortalEnabled !==
                                    true
                                }
                                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Receipt size={14} />{" "}
                                {portalBusyByBooking[booking.id]
                                  ? "Opening..."
                                  : "Open portal"}
                              </button>
                            )}
                          {isStaff ? (
                            <p className="mt-2 text-xs font-bold text-[#7b5c3b]">
                              {booking.portalNextAction}
                            </p>
                          ) : null}
                          {portalStatusByBooking[booking.id] && (
                            <p className="mt-2 rounded-xl bg-[#f8f3e6] p-3 text-xs font-bold text-[#7b5c3b]">
                              {portalStatusByBooking[booking.id]}
                            </p>
                          )}
                        </div>
                      </div>
                      {canManageCoaching && (
                        <details className="mt-4 rounded-2xl border border-[#e8dcc4] bg-white/80 p-3">
                          <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#7b5c3b]">
                            Reschedule or cancel
                          </summary>
                          <div className="mt-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-xs font-black uppercase tracking-wide text-[#b98036]">
                                  Change session safely
                                </p>
                                <p className="text-xs text-[#7b5c3b]">
                                  Reschedule or cancel Quipsly truth first.
                                  External calendar/payment evidence remains
                                  separate.
                                </p>
                              </div>
                              {!canChangeSchedule && (
                                <StatusPill
                                  label="locked by state"
                                  tone="warn"
                                />
                              )}
                            </div>
                            <div className="grid gap-2 md:grid-cols-[1fr_0.45fr]">
                              <label className="block text-xs font-black uppercase tracking-wide text-[#7b5c3b]">
                                New start
                                <input
                                  type="datetime-local"
                                  value={draft.scheduledStart}
                                  onChange={(event) =>
                                    updateBookingDraft(booking, {
                                      scheduledStart: event.target.value,
                                    })
                                  }
                                  disabled={
                                    !canChangeSchedule ||
                                    bookingBusyById[booking.id]
                                  }
                                  className="mt-1 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#3d3122] outline-none focus:border-[#b98036] disabled:opacity-50"
                                />
                              </label>
                              <label className="block text-xs font-black uppercase tracking-wide text-[#7b5c3b]">
                                Minutes
                                <input
                                  type="number"
                                  min="15"
                                  step="15"
                                  value={draft.durationMinutes}
                                  onChange={(event) =>
                                    updateBookingDraft(booking, {
                                      durationMinutes: event.target.value,
                                    })
                                  }
                                  disabled={
                                    !canChangeSchedule ||
                                    bookingBusyById[booking.id]
                                  }
                                  className="mt-1 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#3d3122] outline-none focus:border-[#b98036] disabled:opacity-50"
                                />
                              </label>
                            </div>
                            <label className="mt-2 block text-xs font-black uppercase tracking-wide text-[#7b5c3b]">
                              Reason / note
                              <input
                                type="text"
                                value={draft.reason}
                                onChange={(event) =>
                                  updateBookingDraft(booking, {
                                    reason: event.target.value,
                                  })
                                }
                                placeholder="Optional. Visible in Quipsly audit metadata."
                                disabled={
                                  !canChangeSchedule ||
                                  bookingBusyById[booking.id]
                                }
                                className="mt-1 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#3d3122] outline-none focus:border-[#b98036] disabled:opacity-50"
                              />
                            </label>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <button
                                type="button"
                                onClick={() => void rescheduleBooking(booking)}
                                disabled={
                                  !canChangeSchedule ||
                                  bookingBusyById[booking.id]
                                }
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Clock size={14} /> Reschedule
                              </button>
                              <button
                                type="button"
                                onClick={() => void cancelBooking(booking)}
                                disabled={
                                  !canChangeSchedule ||
                                  bookingBusyById[booking.id]
                                }
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <AlertCircle size={14} /> Cancel booking
                              </button>
                            </div>
                          </div>
                        </details>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-[1.7rem] border border-[#e8dcc4] bg-white/80 p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-2xl font-black text-[#3d3122]">
                  <Mic className="text-[#b98036]" /> Capture rooms
                </h2>
                <p className="mt-1 text-sm text-[#7b5c3b]">
                  Join the call, then review the recording, transcript, notes,
                  goals, and tasks.
                </p>
              </div>
              <StatusPill
                label={nextRoom ? nextRoom.packetStatus : "no rooms"}
                tone={nextRoom?.packetSummaryNoteId ? "good" : "warn"}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {rooms.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#d6c5a5] bg-[#fffaf1] p-5 text-[#7b5c3b] lg:col-span-2">
                  No capture rooms yet. The iOS capture app can only become calm
                  once a room exists with participants and consent state.
                </div>
              ) : (
                rooms.map((room) => (
                  <article
                    key={room.id}
                    className="rounded-2xl border border-[#e8dcc4] bg-[#fdfaf6] p-4"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-black text-[#3d3122]">
                          {room.title}
                        </h3>
                        <p className="text-xs font-bold uppercase tracking-wide text-[#b98036]">
                          {normalize(room.purpose)} · {normalize(room.status)}
                        </p>
                      </div>
                      <StatusPill
                        label={room.packetStatus}
                        tone={room.packetSummaryNoteId ? "good" : "warn"}
                      />
                    </div>
                    <p className="mb-3 text-sm font-bold text-[#3d3122]">
                      {room.nextAction}
                    </p>
                    {isStaff ? (
                      <details className="mb-3 rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                        <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-sky-800">
                          Room evidence and lifecycle
                        </summary>
                        <JourneyPanel
                          summary={room.journeySummary}
                          fallbackAction={room.nextAction}
                        />
                        <LifecyclePanel lifecycle={room.lifecycle} />
                        <CalendarPacketPanel
                          packet={room.calendarReadyPacket}
                        />
                      </details>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2 text-xs font-bold text-[#7b5c3b]">
                      <span className="rounded-xl bg-white p-2">
                        <Users size={14} className="mb-1" />{" "}
                        {room.participantCount} participants
                      </span>
                      <span className="rounded-xl bg-white p-2">
                        <ShieldCheck size={14} className="mb-1" />{" "}
                        {room.consentGrantedCount} consented
                      </span>
                      <span className="rounded-xl bg-white p-2">
                        <Video size={14} className="mb-1" />{" "}
                        {room.recordingCount} recordings
                      </span>
                      <span className="rounded-xl bg-white p-2">
                        <FileText size={14} className="mb-1" />{" "}
                        {room.latestTranscriptStatus
                          ? normalize(room.latestTranscriptStatus)
                          : "no transcript"}
                      </span>
                    </div>
                    <div className="mt-3 text-xs text-[#7b5c3b]">
                      <p>Segments: {room.latestTranscriptSegmentCount}</p>
                      <p>
                        Highlights: {room.packetHighlightCount} · Open actions:{" "}
                        {room.openActionItemCount}
                      </p>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <a
                        href={`/sessions/${encodeURIComponent(room.id)}?mode=live`}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-3 py-2 text-xs font-black uppercase tracking-wide text-white transition hover:bg-emerald-900"
                      >
                        <Video size={14} /> Open Session
                      </a>
                      <a
                        href={`/sessions/${encodeURIComponent(room.id)}?mode=transcript`}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-sky-800 transition hover:bg-sky-100"
                      >
                        <FileText size={14} /> Transcript & notes
                      </a>
                      <a
                        href={`/sessions/${encodeURIComponent(room.id)}?mode=outputs`}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-violet-800 transition hover:bg-violet-100"
                      >
                        <Share2 size={14} /> Review & share
                      </a>
                    </div>
                    {canManageCoaching ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => void runTranscriptAction(room)}
                          disabled={
                            transcriptBusyByRoom[room.id] ||
                            (!room.latestTranscriptJobId &&
                              !room.latestRecordingAssetId) ||
                            room.latestTranscriptStatus === "RUNNING"
                          }
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <FileText size={14} /> Run transcript
                        </button>
                        <button
                          type="button"
                          onClick={() => void buildPacketAction(room)}
                          disabled={
                            packetBusyByRoom[room.id] ||
                            !room.latestTranscriptJobId ||
                            room.latestTranscriptStatus !== "COMPLETED" ||
                            room.latestTranscriptSegmentCount < 1
                          }
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Sparkles size={14} /> Build follow-up
                        </button>
                      </div>
                    ) : null}
                    {isStaff ? (
                      <div className="mt-3 rounded-2xl border border-[#ead8b4] bg-white/80 p-3">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <StatusPill
                            label="transcript to packet"
                            tone="blue"
                          />
                          <StatusPill
                            label={
                              room.latestRecordingAssetId
                                ? `recording ${room.latestRecordingAssetStatus ? normalize(room.latestRecordingAssetStatus) : "ready"}`
                                : "no media"
                            }
                            tone={room.latestRecordingAssetId ? "good" : "warn"}
                          />
                          <StatusPill
                            label={
                              room.latestTranscriptStatus
                                ? `transcript ${normalize(room.latestTranscriptStatus)}`
                                : "no transcript"
                            }
                            tone={
                              room.latestTranscriptStatus === "COMPLETED"
                                ? "good"
                                : room.latestTranscriptJobId
                                  ? "warm"
                                  : "warn"
                            }
                          />
                        </div>
                        <p className="text-xs font-bold leading-relaxed text-[#5d4930]">
                          Transcripts are reusable evidence, not source truth.
                          Build packets only from completed transcript jobs so
                          notes, highlights, and action items stay reviewable.
                        </p>
                        {transcriptStatusByRoom[room.id] && (
                          <p className="mt-2 rounded-xl bg-[#f8f3e6] p-2 text-xs font-bold text-[#7b5c3b]">
                            {transcriptStatusByRoom[room.id]}
                          </p>
                        )}
                        {packetStatusByRoom[room.id] && (
                          <p className="mt-2 rounded-xl bg-[#f8f3e6] p-2 text-xs font-bold text-[#7b5c3b]">
                            {packetStatusByRoom[room.id]}
                          </p>
                        )}
                        {canManageCoaching && (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              onClick={() => void runTranscriptAction(room)}
                              disabled={
                                transcriptBusyByRoom[room.id] ||
                                (!room.latestTranscriptJobId &&
                                  !room.latestRecordingAssetId) ||
                                room.latestTranscriptStatus === "RUNNING"
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FileText size={14} /> Run transcript
                            </button>
                            <button
                              type="button"
                              onClick={() => void buildPacketAction(room)}
                              disabled={
                                packetBusyByRoom[room.id] ||
                                !room.latestTranscriptJobId ||
                                room.latestTranscriptStatus !== "COMPLETED" ||
                                room.latestTranscriptSegmentCount < 1
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Sparkles size={14} /> Build packet
                            </button>
                          </div>
                        )}
                      </div>
                    ) : null}
                    {isStaff ? (
                      <div className="mt-3 rounded-2xl border border-[#ead8b4] bg-white/80 p-3">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <StatusPill
                            label="optional provider safety copy"
                            tone="blue"
                          />
                          <StatusPill
                            label={normalize(room.providerRecordingState)}
                            tone={
                              room.providerRecordingState === "recording"
                                ? "warn"
                                : room.providerRecordingState === "needs-review"
                                  ? "bad"
                                  : room.providerRecordingState === "off"
                                    ? "warm"
                                    : "good"
                            }
                          />
                          <StatusPill
                            label={
                              readiness?.liveKitEgressConfigured
                                ? "egress configured"
                                : "local-first"
                            }
                            tone={
                              readiness?.liveKitEgressConfigured
                                ? "good"
                                : "warm"
                            }
                          />
                        </div>
                        <p className="text-xs font-bold leading-relaxed text-[#5d4930]">
                          This provider copy is separate from the call and local
                          iPhone/browser capture. Turning it off cannot change
                          take synchronization. A durable reservation is created
                          automatically when you start it; protected local
                          masters, device clock receipts, and capture-group
                          timing remain authoritative.
                        </p>
                        <p className="mt-2 text-xs font-black text-[#3d3122]">
                          {room.providerRecordingNextAction}
                        </p>
                        {providerRecordingStatusByRoom[room.id] && (
                          <p className="mt-2 rounded-xl bg-[#f8f3e6] p-2 text-xs font-bold text-[#7b5c3b]">
                            {providerRecordingStatusByRoom[room.id]}
                          </p>
                        )}
                        {runway?.user?.isStaff === true && (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              onClick={() =>
                                void runProviderRecordingAction(
                                  room,
                                  "START_EGRESS",
                                )
                              }
                              disabled={
                                providerRecordingBusyByRoom[room.id] ||
                                readiness?.liveKitEgressConfigured !== true ||
                                room.participantCount < 1 ||
                                room.consentGrantedCount <
                                  room.participantCount ||
                                [
                                  "starting",
                                  "recording",
                                  "stopping",
                                  "needs-review",
                                ].includes(room.providerRecordingState)
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Video size={14} /> Start safety copy
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void runProviderRecordingAction(
                                  room,
                                  "STOP_EGRESS",
                                )
                              }
                              disabled={
                                providerRecordingBusyByRoom[room.id] ||
                                room.providerRecordingState !== "recording"
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <AlertCircle size={14} /> Stop safety copy
                            </button>
                            {room.providerRecordingState === "needs-review" && (
                              <button
                                type="button"
                                onClick={() =>
                                  void runProviderRecordingAction(
                                    room,
                                    "RECONCILE_COMMAND",
                                  )
                                }
                                disabled={
                                  providerRecordingBusyByRoom[room.id] ||
                                  !room.providerRecordingCommandId
                                }
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <ShieldCheck size={14} /> Resolve command
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                void runProviderRecordingAction(
                                  room,
                                  "RECONCILE_PROVIDER_FILE",
                                )
                              }
                              disabled={
                                providerRecordingBusyByRoom[room.id] ||
                                !room.providerRecordingActiveAssetId ||
                                !["UPLOADED", "HELD", "FAILED"].includes(
                                  room.providerRecordingActiveStatus || "",
                                )
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#d6c5a5] bg-[#fffaf1] px-3 py-2 text-xs font-black uppercase tracking-wide text-[#7b5c3b] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <ShieldCheck size={14} /> Verify provider file
                            </button>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </div>
        </section>

        <aside className="order-first space-y-6 xl:order-last">
          <details
            id="coach-setup"
            open={!canManageCoaching}
            className="scroll-mt-6 rounded-[1.7rem] border border-emerald-100 bg-emerald-50/80 p-6 shadow-sm"
          >
            <summary className="mb-3 flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-black text-[#214531]">
                  <Users className="text-emerald-700" /> Coach profile
                </h2>
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                  {canManageCoaching ? "Ready · open to edit defaults" : "Finish your coach workspace once"}
                </p>
              </div>
              <StatusPill
                label={canManageCoaching ? "coach ready" : "needs setup"}
                tone={canManageCoaching ? "good" : "warn"}
              />
            </summary>
            <p className="mb-4 text-sm leading-6 text-[#315641]">
              Confirm your name, timezone, and usual Session length. You can
              change offer and pricing defaults later.
            </p>
            <form className="space-y-3" onSubmit={setupCoachProfile}>
              <p className="rounded-xl border border-emerald-200 bg-white/80 px-3 py-2 text-xs font-bold text-[#315641]">
                Coach account: {setupForm.coachEmail || "your signed-in Quipsly email"}
              </p>
              <label className="block text-xs font-black uppercase tracking-wide text-[#315641]">
                Coach name
                <input
                  type="text"
                  value={setupForm.coachName}
                  onChange={(event) =>
                    setSetupForm((current) => ({
                      ...current,
                      coachName: event.target.value,
                    }))
                  }
                  placeholder="Your name"
                  className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#214531] outline-none focus:border-emerald-600"
                  required
                />
              </label>
              <label className="block text-xs font-black uppercase tracking-wide text-[#315641]">
                Timezone
                <input
                  type="text"
                  aria-label="Timezone"
                  value={setupForm.timezone}
                  onChange={(event) =>
                    setSetupForm((current) => ({
                      ...current,
                      timezone: event.target.value,
                    }))
                  }
                  placeholder="America/Denver"
                  className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#214531] outline-none focus:border-emerald-600"
                  required
                />
                <span className="mt-1 block text-[11px] normal-case tracking-normal text-[#315641]">
                  Detected from this device. Change it if your coaching calendar
                  uses another timezone.
                </span>
              </label>
              <label className="block text-xs font-black uppercase tracking-wide text-[#315641]">
                Usual Session length (minutes)
                <input
                  type="number"
                  min="15"
                  step="15"
                  value={setupForm.defaultDurationMinutes}
                  onChange={(event) => setSetupForm((current) => ({ ...current, defaultDurationMinutes: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#214531] outline-none focus:border-emerald-600"
                />
              </label>
              <details className="rounded-xl border border-emerald-200 bg-white/80 p-3">
                <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#315641]">
                  Offer and pricing defaults
                </summary>
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-black uppercase tracking-wide text-[#315641]">
                    Default offer title
                    <input
                      type="text"
                      value={setupForm.offeringTitle}
                      onChange={(event) => setSetupForm((current) => ({ ...current, offeringTitle: event.target.value }))}
                      className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#214531] outline-none focus:border-emerald-600"
                      required
                    />
                  </label>
                  <label className="block text-xs font-black uppercase tracking-wide text-[#315641]">
                    Offer description
                    <textarea
                      value={setupForm.offeringDescription}
                      onChange={(event) => setSetupForm((current) => ({ ...current, offeringDescription: event.target.value }))}
                      rows={3}
                      className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#214531] outline-none focus:border-emerald-600"
                    />
                  </label>
                  <label className="block text-xs font-black uppercase tracking-wide text-[#315641]">
                    Default price
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={setupForm.defaultAmountDollars}
                      onChange={(event) => setSetupForm((current) => ({ ...current, defaultAmountDollars: event.target.value }))}
                      className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#214531] outline-none focus:border-emerald-600"
                    />
                    <span className="mt-1 block text-[11px] normal-case tracking-normal text-[#315641]">
                      Optional. Leave blank to start without a payment link.
                    </span>
                  </label>
                </div>
              </details>
              <button
                type="submit"
                disabled={isSettingUpCoach}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#214531] px-4 py-3 text-sm font-black text-white transition hover:bg-[#315641] disabled:cursor-wait disabled:opacity-50"
              >
                <ShieldCheck size={16} />{" "}
                {isSettingUpCoach ? "Setting up..." : "Set up coach profile"}
              </button>
              {setupStatus && (
                <p className="rounded-xl bg-white/80 p-3 text-xs font-bold text-[#315641]">
                  {setupStatus}
                </p>
              )}
            </form>
          </details>

          <section
            id="create-appointment"
            aria-labelledby="create-appointment-heading"
            className="rounded-[1.7rem] border border-[#e8dcc4] bg-white/80 p-6 shadow-sm"
          >
            <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 id="create-appointment-heading" className="flex items-center gap-2 text-xl font-black text-[#3d3122]">
                  <CalendarIcon className="text-[#b98036]" /> Create appointment
                </h2>
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-[#b98036]">
                  Schedule, invite, capture, and follow through
                </p>
              </div>
            </div>
            <p className="mb-4 text-sm text-[#7b5c3b]">
              Choose the client, time, and Session name. Quipsly will create the
              private coaching home and give you the exact client entry to send.
            </p>
            <form className="space-y-3" onSubmit={createLocalSession}>
              <label className="block text-xs font-black uppercase tracking-wide text-[#7b5c3b]">
                Client email
                <input
                  type="email"
                  value={createForm.clientEmail}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      clientEmail: event.target.value,
                    }))
                  }
                  placeholder="client@example.com"
                  className="mt-1 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#3d3122] outline-none focus:border-[#b98036]"
                  required
                />
              </label>
              <label className="block text-xs font-black uppercase tracking-wide text-[#7b5c3b]">
                Client name
                <input
                  type="text"
                  value={createForm.clientName}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      clientName: event.target.value,
                    }))
                  }
                  placeholder="Optional"
                  className="mt-1 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#3d3122] outline-none focus:border-[#b98036]"
                />
              </label>
              <label className="block text-xs font-black uppercase tracking-wide text-[#7b5c3b]">
                Session title
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#3d3122] outline-none focus:border-[#b98036]"
                  required
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <label className="block text-xs font-black uppercase tracking-wide text-[#7b5c3b]">
                  Start
                  <input
                    type="datetime-local"
                    value={createForm.scheduledStart}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        scheduledStart: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#3d3122] outline-none focus:border-[#b98036]"
                    required
                  />
                </label>
                <label className="block text-xs font-black uppercase tracking-wide text-[#7b5c3b]">
                  Minutes
                  <input
                    type="number"
                    min="15"
                    step="15"
                    value={createForm.durationMinutes}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        durationMinutes: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#3d3122] outline-none focus:border-[#b98036]"
                    required
                  />
                </label>
              </div>
              <p className="rounded-xl bg-[#f8f3e6] px-3 py-2 text-xs font-bold text-[#7b5c3b]">
                The time above uses {createForm.timezone || "your detected timezone"}. Both people will see the timezone with the appointment.
              </p>
              <details className="rounded-xl border border-[#d6c5a5] bg-white p-3">
                <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#7b5c3b]">
                  Advanced appointment options
                </summary>
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-black uppercase tracking-wide text-[#7b5c3b]">
                    Appointment type
                    <select
                      value={createForm.runwayAction}
                      onChange={(event) => setCreateForm((current) => ({ ...current, runwayAction: event.target.value }))}
                      className="mt-1 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#3d3122] outline-none focus:border-[#b98036]"
                    >
                      <option value="create-booking-room">Schedule and create the private Session</option>
                      <option value="create-booking-hold">Hold the time without inviting yet</option>
                    </select>
                  </label>
                  <label className="block text-xs font-black uppercase tracking-wide text-[#7b5c3b]">
                    Timezone
                    <input
                      type="text"
                      value={createForm.timezone}
                      onChange={(event) => setCreateForm((current) => ({ ...current, timezone: event.target.value }))}
                      placeholder="America/Denver"
                      className="mt-1 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#3d3122] outline-none focus:border-[#b98036]"
                      required
                    />
                  </label>
                  <label className="block text-xs font-black uppercase tracking-wide text-[#7b5c3b]">
                    Purpose
                    <select
                      value={createForm.purpose}
                      onChange={(event) => setCreateForm((current) => ({ ...current, purpose: event.target.value }))}
                      className="mt-1 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#3d3122] outline-none focus:border-[#b98036]"
                    >
                      <option value="COACHING">Coaching</option>
                      <option value="PODCAST">Podcast</option>
                      <option value="RESEARCH_INTERVIEW">Research interview</option>
                      <option value="INTERNAL_MEETING">Internal meeting</option>
                    </select>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-black uppercase tracking-wide text-[#7b5c3b]">
                      Payment
                      <select
                        value={createForm.paymentPolicy}
                        onChange={(event) => setCreateForm((current) => ({ ...current, paymentPolicy: event.target.value }))}
                        className="mt-1 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#3d3122] outline-none focus:border-[#b98036]"
                      >
                        <option value="MANUAL">Decide payment later</option>
                        <option value="FREE">Free session</option>
                        <option value="DONATION_SUPPORTED">Contribution supported</option>
                        <option value="PAID_ONE_TO_ONE">Paid 1:1 coaching</option>
                      </select>
                    </label>
                    <label className="block text-xs font-black uppercase tracking-wide text-[#7b5c3b]">
                      Client price
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={createForm.amountDollars}
                        onChange={(event) => setCreateForm((current) => ({ ...current, amountDollars: event.target.value }))}
                        placeholder="Example: 150"
                        className="mt-1 w-full rounded-xl border border-[#d6c5a5] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#3d3122] outline-none focus:border-[#b98036]"
                      />
                    </label>
                  </div>
                  <p className="text-[11px] font-semibold leading-5 text-[#7b5c3b]">
                    Quipsly never charges, emails, or writes an external calendar event just because you create the appointment. Those remain separate, explicit actions.
                  </p>
                </div>
              </details>
              {createForm.paymentPolicy === "PAID_ONE_TO_ONE" &&
                !dollarsToCents(createForm.amountDollars) && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-700">
                    Paid one-to-one sessions need an amount here or a selected
                    offering with Stripe price evidence before checkout can be
                    created.
                  </p>
                )}
              <button
                type="submit"
                disabled={isCreating || !canManageCoaching}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#3d3122] px-4 py-3 text-sm font-black text-white transition hover:bg-[#5a472f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CalendarIcon size={16} />{" "}
                {isCreating
                  ? "Creating..."
                  : createForm.runwayAction === "create-booking-hold"
                    ? "Hold slot"
                    : "Create appointment"}
              </button>
              {!canManageCoaching && (
                <p className="text-xs font-bold text-amber-700">
                  Set up your coach profile first, then this appointment form
                  unlocks.
                </p>
              )}
              {createStatus && (
                <p className="rounded-xl bg-[#f8f3e6] p-3 text-xs font-bold text-[#7b5c3b]">
                  {createStatus}
                </p>
              )}
              {createdHandoff ? (
                <section
                  className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4"
                  aria-labelledby="created-coaching-handoff-heading"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">
                    Appointment ready
                  </p>
                  <h3
                    id="created-coaching-handoff-heading"
                    className="mt-1 text-lg font-black text-emerald-950"
                  >
                    Invite{" "}
                    {createdHandoff.clientName || createdHandoff.clientEmail}
                  </h3>
                  <p className="mt-2 text-xs font-bold leading-5 text-emerald-950">
                    One private coaching relationship and one exact Session now
                    exist. Send the client entry below; Quipsly will require{" "}
                    {createdHandoff.clientEmail} to sign in with Google or a
                    verified Quipsly email before anything opens.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() =>
                        void copyClientSessionLink(
                          createdHandoff.bookingId,
                          createdHandoff.clientEntryPath,
                        )
                      }
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white"
                    >
                      <Copy size={14} /> Copy client entry
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void shareClientSessionLink({
                          bookingId: createdHandoff.bookingId,
                          title: createdHandoff.title,
                          clientEmail: createdHandoff.clientEmail,
                          clientEntryPath: createdHandoff.clientEntryPath,
                        })
                      }
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-violet-900"
                    >
                      <Share2 size={14} /> Share from this device
                    </button>
                    <a
                      href={createdHandoff.liveSessionPath}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-emerald-950"
                    >
                      <Video size={14} /> Open live room
                    </a>
                    {createdHandoff.engagementPath ? (
                      <a
                        href={createdHandoff.engagementPath}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-emerald-950"
                      >
                        <Users size={14} /> Open coaching home
                      </a>
                    ) : null}
                  </div>
                  {linkCopyStatusByBooking[createdHandoff.bookingId] ? (
                    <p
                      role="status"
                      className="mt-3 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-950"
                    >
                      {linkCopyStatusByBooking[createdHandoff.bookingId]}
                    </p>
                  ) : null}
                  <p className="mt-3 text-[11px] font-semibold leading-5 text-emerald-900">
                    Only the invited, verified email can enter this private
                    Session. The client will not see your private coach notes or
                    the rest of your Nest.
                  </p>
                </section>
              ) : null}
            </form>
          </section>

          {isStaff ? (
            <div className="rounded-[1.7rem] border border-[#e8dcc4] bg-[#3d3122] p-6 text-white shadow-sm">
              <h2 className="flex items-center gap-2 text-xl font-black">
                <Sparkles className="text-amber-300" /> Boundaries that keep us
                honest
              </h2>
              <div className="mt-4 space-y-3 text-sm text-[#f6e7cc]">
                <p>
                  {runway?.boundaries?.recordingScope ??
                    "Recording requires explicit consent."}
                </p>
                <p>
                  {runway?.boundaries?.stripeScope ??
                    "Stripe is evidence, not Quipsly truth."}
                </p>
                <p>
                  {runway?.boundaries?.publicationScope ??
                    "Receipt-backed state only."}
                </p>
              </div>
            </div>
          ) : null}

          {isStaff ? (
            <div className="rounded-[1.7rem] border border-[#e8dcc4] bg-white/80 p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-black text-[#3d3122]">
                <Receipt className="text-[#b98036]" /> Offerings
              </h2>
              <div className="space-y-3">
                {offerings.length === 0 ? (
                  <p className="text-sm text-[#7b5c3b]">
                    No active service offerings yet.
                  </p>
                ) : (
                  offerings.slice(0, 6).map((offering) => (
                    <div
                      key={offering.id}
                      className="rounded-2xl border border-[#e8dcc4] bg-[#fdfaf6] p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-black text-[#3d3122]">
                            {offering.title}
                          </h3>
                          <p className="text-xs font-bold uppercase tracking-wide text-[#b98036]">
                            {normalize(offering.kind)} ·{" "}
                            {offering.durationMinutes} min
                          </p>
                        </div>
                        <StatusPill
                          label={normalize(offering.paymentPolicy)}
                          tone={
                            offering.paymentPolicy === "PAID_ONE_TO_ONE"
                              ? "blue"
                              : "warm"
                          }
                        />
                      </div>
                      <p className="mt-2 text-sm text-[#7b5c3b]">
                        {offering.description || "No description yet."}
                      </p>
                      <p className="mt-2 text-sm font-bold text-[#3d3122]">
                        {money(offering.priceCents, offering.currency)}
                      </p>
                      {!offering.stripePriceConfigured &&
                        offering.paymentPolicy === "PAID_ONE_TO_ONE" && (
                          <p className="mt-2 text-xs font-bold text-amber-700">
                            Stripe price evidence is not configured.
                          </p>
                        )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <div className="rounded-[1.7rem] border border-[#e8dcc4] bg-white/80 p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-black text-[#3d3122]">
              <Clock className="text-[#b98036]" /> Requests
            </h2>
            <div className="space-y-3">
              {requests.length === 0 ? (
                <p className="text-sm text-[#7b5c3b]">
                  No open coaching requests visible.
                </p>
              ) : (
                requests.slice(0, 6).map((request) => (
                  <div
                    key={request.id}
                    className="rounded-2xl border border-[#e8dcc4] bg-[#fdfaf6] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-black text-[#3d3122]">
                        {request.client?.name || request.email}
                      </h3>
                      <StatusPill
                        label={normalize(request.status)}
                        tone="warn"
                      />
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm text-[#7b5c3b]">
                      {request.coachingGoals}
                    </p>
                    <p className="mt-2 text-xs font-bold text-[#3d3122]">
                      {request.nextAction}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
