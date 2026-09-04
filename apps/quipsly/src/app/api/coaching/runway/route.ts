import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { buildQuipslyCoachingLifecycle } from "@high-ground/quipsly-domain/coaching-lifecycle";
import { buildQuipslyCoachingPracticeCommand } from "@high-ground/quipsly-domain/coaching-practice-command";
import {
  isTranscriptPacketSource,
  isUnreviewedTranscriptActionItemSource,
} from "@high-ground/quipsly-domain/coaching-packet";

import { coachingClientEntryPaths } from "@/lib/coaching-client-entry";
import { coachingSetupPaymentPolicy } from "@/lib/coaching-setup";
import { projectProviderRecordingState } from "@/lib/provider-recording-state";
import { getPrismaClient } from "@/lib/prisma";
import {
  canManageCoachingCalendarEvidence,
  cancelCoachingBookingGoogleCalendar,
  getCoachingDefaultTimezone,
  getCoachingCalendarReadiness,
  syncCoachingBookingToGoogleCalendar,
} from "@/lib/server/coaching-google-calendar";
import { getQuipslyLiveKitEgressReadiness } from "@/lib/server/coaching-livekit-egress";
import { ensureCoachingEngagement, CoachingEngagementError } from "@/lib/server/coaching-engagement";
import {
  CoachingBookingSeriesInputError,
  normalizeCoachingBookingSeriesIntent,
} from "@/lib/server/coaching-booking-series";
import { createCoachingBookingSeriesInTransaction } from "@/lib/server/coaching-booking-series-operation";
import { ensureHomeNestForEmail } from "@/lib/server/home-nest";
import { projectClientInvitationDeliveryForViewer } from "@/lib/server/coaching-invitation-delivery-projection";
import {
  buildMobileCaptureConsentVersions,
  mobileCaptureAllPartiesReady,
} from "@/lib/server/mobile-capture-consent-readiness.js";
import { mobileCaptureProcessingGateFromEvidence } from "@/lib/server/mobile-capture-processing-policy.js";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionInvitationEmailReadiness } from "@/lib/server/session-invitation-email";
import { ensureInvitedStudioUserByEmail } from "@/lib/server/studio-user-identity";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";
import { recordQuipslyProductOutcome } from "@/lib/server/product-event";
import { quipslyCoachCapabilityAccess } from "@/lib/server/subscription-entitlements";
import {
  assertCoachingScheduleAvailable,
  CoachingOutsideAvailabilityError,
  CoachingScheduleConflictError,
  CoachingScheduleIntervalError,
} from "@/lib/server/coaching-schedule-availability";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { parseCoachingScheduleDate } from "@/lib/server/coaching-schedule-time";
import { canManageCoachingBookingHold } from "@/lib/server/coaching-booking-hold-authz";

export const runtime = "nodejs";

function person(user: any) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name || user.primaryEmail || "Unnamed Quipsly human",
    email: user.primaryEmail || null,
    image: user.image || null,
  };
}

function sourceJson(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isTranscriptPacketProjection(value: unknown, transcriptJobId: unknown) {
  const source = sourceJson(value);
  return isTranscriptPacketSource(source.source)
    && source.transcriptJobId === transcriptJobId;
}

function isCommittedTranscriptActionItem(item: any, transcriptJobId: unknown) {
  const source = sourceJson(item?.sourceJson);
  return isTranscriptPacketProjection(source, transcriptJobId)
    && !isUnreviewedTranscriptActionItemSource(source);
}

function safeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function integer(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

class RunwayActionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RunwayActionError";
    this.status = status;
  }
}

function runwayActionErrorResponse(error: unknown) {
  if (error instanceof CoachingScheduleConflictError) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        code: error.code,
        conflicts: error.conflicts.map((conflict) => ({
          kind: conflict.kind,
          scheduledStart: conflict.scheduledStart,
          scheduledEnd: conflict.scheduledEnd,
        })),
      },
      { status: error.status },
    );
  }
  if (error instanceof CoachingScheduleIntervalError) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof CoachingOutsideAvailabilityError) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof CoachingEngagementError) {
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof CoachingBookingSeriesInputError) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status: 400 },
    );
  }
  if (error instanceof RunwayActionError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  throw error;
}

async function resolveCoachingProject(input: {
  prisma: any;
  requestedProjectSlug: unknown;
  actorEmail: string;
}) {
  const requestedProjectSlug = text(input.requestedProjectSlug).toLowerCase();
  if (requestedProjectSlug) {
    const access = await resolveStudioProjectAccess({
      projectSlug: requestedProjectSlug,
      email: input.actorEmail,
      action: "write",
      prisma: input.prisma,
    });
    if (!access.allowed || !access.projectId) {
      throw new RunwayActionError("You do not have write access to the requested coaching Nest.", 403);
    }
    return { id: access.projectId, slug: requestedProjectSlug };
  }
  const home = await ensureHomeNestForEmail(input.actorEmail, input.prisma);
  if (!home?.id || !home.slug) {
    throw new RunwayActionError("Quipsly could not create an actor-owned Nest for this coaching engagement.", 409);
  }
  return { id: home.id, slug: home.slug };
}

async function readJson(request: Request) {
  try {
    const value = await request.json();
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

function parseDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + Math.max(15, minutes) * 60_000);
}

/**
 * LiveKit creates a room when the first participant joins, so booking a
 * Quipsly session only needs a durable, opaque room name. Keeping the desired
 * provider on CallRoom makes the same appointment joinable from browser,
 * iPhone, or both; missing deployment credentials remain visible readiness
 * evidence at join time instead of silently downgrading the room to local-only.
 */
function newCoachingProviderBinding() {
  return {
    provider: "livekit",
    providerRoomId: `quipsly-${randomUUID()}`,
  } as const;
}

function minutesBetween(start: unknown, end: unknown) {
  const startTime = new Date(start as any).getTime();
  const endTime = new Date(end as any).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) return 60;
  return Math.max(15, Math.round((endTime - startTime) / 60_000));
}

function iso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value as any);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function recordingServerVerified(asset: any) {
  if (isProviderRecordingReceiptSlot(asset)) return false;
  const status = text(asset?.status).toUpperCase();
  return ["VERIFIED", "TRANSCRIBED"].includes(status);
}

function isProviderRecordingReceiptSlot(asset: any) {
  const manifest = sourceJson(asset?.localManifestJson);
  return asset?.kind === "SERVER_MIX" && manifest.source === "provider-recording-receipt-slot";
}

function runwayProcessingGate(room: any, asset: any, receipts: any[], transcript: boolean) {
  if (!asset) {
    return {
      allowed: false as const,
      errorCode: "CAPTURE_RECORDING_ASSET_REQUIRED",
      error: "Capture processing requires recording asset evidence.",
    };
  }
  return mobileCaptureProcessingGateFromEvidence({
    recordingAsset: asset,
    receipts: receipts.filter((receipt: any) => receipt.recordingAssetId === asset.id),
    room,
    transcript,
  });
}

function transcribableRecordingAssets(room: any, receipts: any[] = []) {
  return Array.isArray(room?.recordingAssets)
    ? room.recordingAssets.filter((asset: any) => (
        !isProviderRecordingReceiptSlot(asset)
        && runwayProcessingGate(room, asset, receipts, true).allowed
      ))
    : [];
}

function providerRecordingReceiptSlot(room: any) {
  return Array.isArray(room?.recordingAssets)
    ? room.recordingAssets.find((asset: any) => isProviderRecordingReceiptSlot(asset)) || null
    : null;
}

function activeProviderRecordingAsset(room: any) {
  return Array.isArray(room?.recordingAssets)
    ? room.recordingAssets.find((asset: any) => {
        if (isProviderRecordingReceiptSlot(asset)) return false;
        return asset?.kind === "SERVER_MIX" && ["UPLOADING", "UPLOADED", "HELD", "FAILED"].includes(text(asset?.status).toUpperCase());
      }) || null
    : null;
}

function calendarLinkHasReceipt(link: any) {
  const status = text(link?.status).toUpperCase();
  return Boolean(
    link?.externalEventId ||
      link?.providerEventId ||
      ["CREATED", "SYNCED", "UPDATED", "VERIFIED"].includes(status),
  );
}

function metadataWithEvent(
  metadataJson: unknown,
  key: string,
  event: Record<string, unknown>,
) {
  const base = sourceJson(metadataJson);
  const previous = Array.isArray(base[key]) ? (base[key] as unknown[]) : [];
  return {
    ...base,
    [key]: [...previous, event].slice(-20),
  };
}

function normalizePurpose(value: unknown) {
  const purpose = text(value).toUpperCase();
  if (["COACHING", "PODCAST", "RESEARCH_INTERVIEW", "INTERNAL_MEETING"].includes(purpose)) {
    return purpose;
  }
  return "COACHING";
}

function consentText() {
  return "I confirm that everyone in this Quipsly session knows this session is being recorded and transcribed, and that I consent to recording my participation.";
}

function nextBookingAction(booking: any) {
  if (booking.status === "CANCELED") return "Canceled. Preserve the record; do not capture.";
  if (booking.status === "COMPLETED") return "Complete. Review notes, packet, transcript, and follow-up actions.";
  if (booking.status === "HOLDING_PAYMENT") return "Payment hold. Keep this out of confirmed capture until Stripe evidence lands.";
  if (!booking.callRoom) return "Create a capture room before the session starts.";
  if (booking.callRoom.status === "RECORDING") return "Recording is active. Keep consent visible and preserve local fallback.";
  if (booking.callRoom.status === "ENDED") return "Session ended. Move to transcript and packet review.";
  if (booking.callRoom.status === "OPEN") return "Room is open. Confirm consent before recording.";
  return "Confirm schedule, consent plan, and capture room readiness.";
}

function nextPaymentAction(booking: any, latestCheckout: any) {
  const paymentStatus = booking.paymentRecord?.status || null;
  const hasPrice = Boolean(booking.offering?.stripePriceId);
  const hasAmount =
    typeof booking.paymentRecord?.amountCents === "number" && booking.paymentRecord.amountCents > 0;

  if (booking.paymentPolicy !== "PAID_ONE_TO_ONE") {
    return "No Stripe checkout needed for this booking. Keep any manual payment note as evidence.";
  }
  if (paymentStatus === "PAID") {
    return "Stripe paid evidence has landed. Keep the provider receipt attached to the booking.";
  }
  if (!hasPrice && !hasAmount) {
    return "Add a Stripe price or positive payment amount before creating checkout evidence.";
  }
  if (latestCheckout?.status === "expired") {
    return "The last checkout expired. Create a fresh checkout link if the client still wants the session.";
  }
  if (latestCheckout?.url) {
    return "Checkout link exists. Payment remains pending until webhook receipt evidence lands.";
  }
  return "Create a Stripe checkout link when the human is ready to request payment.";
}

function latestCalendarLink(record: any) {
  const links = Array.isArray(record?.calendarLinks) ? record.calendarLinks : [];
  return links[0] || null;
}

function calendarAttendees(booking: any, room: any) {
  const attendees = new Map<string, { email: string; name: string | null; role: string }>();
  const add = (email: unknown, name: unknown, role: string) => {
    const normalizedEmail = text(email).toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) return;
    attendees.set(normalizedEmail, {
      email: normalizedEmail,
      name: text(name) || null,
      role,
    });
  };

  add(booking?.clientUser?.primaryEmail, booking?.clientUser?.name, "client");
  add(booking?.coachUser?.primaryEmail, booking?.coachUser?.name, "coach");
  add(room?.booking?.clientUser?.primaryEmail, room?.booking?.clientUser?.name, "client");
  add(room?.booking?.coachUser?.primaryEmail, room?.booking?.coachUser?.name, "coach");

  for (const participant of Array.isArray(room?.participants) ? room.participants : []) {
    add(participant.email, participant.displayName || participant.name, participant.role || "participant");
  }

  return Array.from(attendees.values());
}

function calendarPacketNextAction(latestLink: any, providerEventLink: any, booking: any, room: any) {
  if (booking?.status === "CANCELED" || room?.status === "CANCELED") {
    if (String(latestLink?.status || "").startsWith("canceled")) {
      return "External calendar cancellation receipt is attached. Preserve the canceled Quipsly booking as scheduling history.";
    }
    return providerEventLink?.providerEventId
      ? "Cancel the external calendar event explicitly, then keep its provider receipt with this canceled booking."
      : "No external calendar receipt exists yet. Preserve this canceled Quipsly record as history.";
  }
  if (latestLink?.status === "synced" || latestLink?.providerEventId) {
    return "External calendar evidence exists. Keep Quipsly booking truth and provider receipt in sync if anything changes.";
  }
  if (latestLink?.status === "reschedule-planned") {
    return "Reschedule is planned in Quipsly. Update the external calendar before promising the new time is on calendars.";
  }
  if (latestLink?.status === "cancel-planned") {
    return "Cancellation is planned in Quipsly. Cancel the external calendar event before saying the outside calendar is updated.";
  }
  return "Calendar-ready packet exists. Create or update the external event only when a human approves that action.";
}

function calendarReadyPacket(input: { booking?: any; room?: any; latestLink?: any }) {
  const booking = input.booking || input.room?.booking || null;
  const room = input.room || booking?.callRoom || null;
  const latestLink = input.latestLink || latestCalendarLink(booking) || latestCalendarLink(room);
  const allLinks = [
    ...(Array.isArray(booking?.calendarLinks) ? booking.calendarLinks : []),
    ...(Array.isArray(room?.calendarLinks) ? room.calendarLinks : []),
  ].sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
  const providerEventLink = allLinks.find((link) => text(link?.providerEventId) || text(link?.htmlLink)) || null;
  const latestProviderDecision = allLinks.find((link) => text(link?.providerEventId) || String(link?.status || "").startsWith("canceled")) || null;
  const externalCalendarEventExists = Boolean(providerEventLink?.providerEventId || providerEventLink?.htmlLink)
    && !String(latestProviderDecision?.status || "").startsWith("canceled");
  const scheduledStart = iso(booking?.scheduledStart || room?.scheduledStart);
  const scheduledEnd = iso(booking?.scheduledEnd || room?.scheduledEnd);
  const title =
    text(latestLink?.title) ||
    text(room?.title) ||
    text(booking?.offering?.title) ||
    "Quipsly coaching session";
  const timezone =
    text(latestLink?.timezone) ||
    text(booking?.timezone) ||
    text(room?.timezone) ||
    getCoachingDefaultTimezone();

  return {
    kind: "quipsly-calendar-ready-packet-v1",
    title,
    scheduledStart,
    scheduledEnd,
    timezone,
    provider: latestLink?.provider || "google",
    status: latestLink?.status || "not-created",
    bookingId: booking?.id || null,
    roomId: room?.id || null,
    purpose: room?.purpose || "COACHING",
    attendees: calendarAttendees(booking, room),
    receipt: latestLink
      ? {
          id: latestLink.id,
          provider: latestLink.provider,
          status: latestLink.status,
          providerCalendarId: latestLink.providerCalendarId || null,
          providerEventId: latestLink.providerEventId || null,
          htmlLink: latestLink.htmlLink || null,
          createdAt: iso(latestLink.createdAt),
          updatedAt: iso(latestLink.updatedAt),
        }
      : null,
    externalCalendarUpdated: Boolean(providerEventLink?.providerEventId || providerEventLink?.htmlLink),
    externalCalendarEventExists,
    nextAction: calendarPacketNextAction(latestLink, providerEventLink, booking, room),
  };
}

function nextRoomAction(room: any, receipts: any[] = []) {
  const latestTranscript = room.transcriptJobs?.[0] || null;
  const latestRecordingAsset = room.recordingAssets?.find((asset: any) => asset.id === latestTranscript?.assetId)
    || room.recordingAssets?.find((asset: any) => !isProviderRecordingReceiptSlot(asset))
    || null;
  const transcriptGate = runwayProcessingGate(room, latestRecordingAsset, receipts, true);
  const packetSummary =
    transcriptGate.allowed && room.notes?.find(
      (note: any) =>
        note.kind === "SUMMARY" &&
        isTranscriptPacketProjection(note.sourceJson, latestTranscript?.id),
    ) || null;

  if (!transcriptGate.allowed && latestRecordingAsset) {
    return "The recording is preserved but is not available for transcription yet. Update its processing permission in the Session.";
  }
  if (packetSummary) return "Follow-through is ready. Open the Session to read, edit, complete, or remove its notes, tasks, and goals.";
  if (latestTranscript?.status === "COMPLETED") return "Transcript complete. Create the Session recap and follow-through.";
  if (latestTranscript?.status === "RUNNING") return "Transcription is running. Refresh to see the latest progress.";
  if (latestTranscript) return "Transcript job exists. Run, retry, or resolve its held/failed state.";
  if (safeCount(room.recordingAssets?.filter((asset: any) => !isProviderRecordingReceiptSlot(asset)).length) > 0) {
    return "Recording exists. Queue or run transcription.";
  }
  if (room.status === "RECORDING") return "Recording now. Preserve visible consent and local fallback.";
  if (room.status === "OPEN") return "Room is open. Confirm consent, then capture.";
  return "Prepare the room, participants, and recording consent.";
}

function recordingConsentSummary(room: any) {
  const participants = Array.isArray(room?.participants)
    ? room.participants.filter((participant: any) => participant?.role !== "OBSERVER" && Boolean(participant?.userId))
    : [];
  const consents = Array.isArray(room?.recordingConsents) ? room.recordingConsents : [];
  const versions = buildMobileCaptureConsentVersions({ participants, consents });
  const participantCount = participants.length;
  const grantedCount = versions.filter((consent: any) => mobileCaptureAllPartiesReady([consent], "audio")).length;
  const requestedCount = versions.filter((consent: any) => consent.status === "REQUESTED").length;
  const declinedCount = versions.filter((consent: any) => consent.status === "DECLINED").length;
  const revokedCount = versions.filter((consent: any) => consent.status === "REVOKED").length;
  const allParticipantsGranted = mobileCaptureAllPartiesReady(versions, "audio");
  const providerRecordingAllowed = allParticipantsGranted
    && mobileCaptureAllPartiesReady(versions, "video");

  return {
    participantCount,
    requestedCount,
    grantedCount,
    declinedCount,
    revokedCount,
    allParticipantsGranted,
    providerRecordingAllowed,
    localRecordingFallbackAllowed: grantedCount > 0,
    nextAction: allParticipantsGranted
      ? "All visible participants have granted consent. Recording still needs a visible start action."
      : participantCount === 0
        ? "Add participants before treating consent as complete."
        : "Confirm explicit consent for every participant before provider/server recording.",
  };
}

function roomJourneySummary(room: any, receipts: any[] = []) {
  const latestTranscript = room.transcriptJobs?.[0] || null;
  const latestRecordingAsset = room.recordingAssets?.find((asset: any) => asset.id === latestTranscript?.assetId)
    || room.recordingAssets?.find((asset: any) => !isProviderRecordingReceiptSlot(asset))
    || null;
  const transcriptGate = runwayProcessingGate(room, latestRecordingAsset, receipts, true);
  const packetSummary =
    transcriptGate.allowed && room.notes?.find(
      (note: any) =>
        note.kind === "SUMMARY" &&
        isTranscriptPacketProjection(note.sourceJson, latestTranscript?.id),
    ) || null;
  const consent = recordingConsentSummary(room);
  const recordingCount = safeCount(
    room.recordingAssets?.filter((asset: any) => !isProviderRecordingReceiptSlot(asset)).length,
  );
  const evidence = {
    appOwnedRoom: Boolean(room.id),
    providerSelected: Boolean(text(room.provider) && room.provider !== "planned"),
    participantsAttached: consent.participantCount > 0,
    allParticipantConsentGranted: consent.allParticipantsGranted,
    recordingEvidence: recordingCount > 0,
    transcriptEvidence: Boolean(latestTranscript),
    transcriptCompleted: transcriptGate.allowed && latestTranscript?.status === "COMPLETED",
    packetEvidence: Boolean(packetSummary),
  };
  let stage = "prepare-room";
  if (room.status === "CANCELED") stage = "canceled";
  else if (packetSummary) stage = "packet-ready";
  else if (!transcriptGate.allowed && latestRecordingAsset) stage = "transcript-held";
  else if (latestTranscript?.status === "COMPLETED") stage = "packet-needed";
  else if (latestTranscript?.status) stage = `transcript-${String(latestTranscript.status).toLowerCase()}`;
  else if (recordingCount > 0) stage = "transcription-needed";
  else if (room.status === "RECORDING") stage = "recording";
  else if (room.status === "OPEN" && consent.allParticipantsGranted) stage = "ready-to-record";
  else if (room.status === "OPEN") stage = "consent-needed";
  else if (room.status === "PLANNED") stage = "planned";
  else if (room.status === "ENDED") stage = "ended-review-needed";

  return {
    stage,
    evidence,
    consent,
    transcriptProcessingAllowed: transcriptGate.allowed,
    transcriptHoldReasonCode: transcriptGate.allowed ? null : transcriptGate.errorCode,
    nextAction: nextRoomAction(room, receipts),
  };
}

function bookingJourneySummary(booking: any, latestCheckout: any, hasStripeCustomerEvidence: boolean, receipts: any[] = []) {
  const room = booking.callRoom || null;
  const roomJourney = room ? roomJourneySummary(room, receipts) : null;
  const paymentStatus = booking.paymentRecord?.status || null;
  const isPaidOneToOne = booking.paymentPolicy === "PAID_ONE_TO_ONE";
  const paymentResolved = !isPaidOneToOne || paymentStatus === "PAID";
  const evidence = {
    appOwnedBooking: Boolean(booking.id),
    paymentRequired: isPaidOneToOne,
    paymentResolved,
    paymentRecord: Boolean(booking.paymentRecord?.id),
    checkoutLedger: Boolean(latestCheckout?.checkoutSessionId),
    stripeCustomerEvidence: hasStripeCustomerEvidence,
    calendarReceiptSlot: safeCount(booking.calendarLinks?.length) > 0,
    captureRoom: Boolean(room?.id),
    allParticipantConsentGranted: Boolean(roomJourney?.consent.allParticipantsGranted),
    recordingEvidence: safeCount(
      room?.recordingAssets?.filter((asset: any) => !isProviderRecordingReceiptSlot(asset)).length,
    ) > 0,
    transcriptEvidence: safeCount(room?.transcriptJobs?.length) > 0,
    packetEvidence: Boolean(roomJourney?.evidence.packetEvidence),
  };
  let stage = "requested";
  if (booking.status === "CANCELED") stage = "canceled";
  else if (booking.status === "COMPLETED") stage = "completed";
  else if (isPaidOneToOne && paymentStatus !== "PAID") {
    stage = latestCheckout?.url ? "payment-pending" : "payment-checkout-needed";
  } else if (!room) stage = "capture-room-needed";
  else stage = roomJourney?.stage || "capture-room-ready";

  return {
    stage,
    evidence,
    roomStage: roomJourney?.stage || null,
    paymentStage: paymentResolved ? "payment-resolved" : latestCheckout?.url ? "payment-pending" : "payment-needed",
    nextAction: nextBookingAction(booking),
    paymentNextAction: nextPaymentAction(booking, latestCheckout),
    roomNextAction: roomJourney?.nextAction || "Create a capture room before the session starts.",
  };
}

function roomPacketStatus(room: any, receipts: any[] = []) {
  const latestTranscript = room.transcriptJobs?.[0] || null;
  const latestRecordingAsset = room.recordingAssets?.find((asset: any) => asset.id === latestTranscript?.assetId)
    || room.recordingAssets?.find((asset: any) => !isProviderRecordingReceiptSlot(asset))
    || null;
  const transcriptGate = runwayProcessingGate(room, latestRecordingAsset, receipts, true);
  const packetSummary =
    transcriptGate.allowed && room.notes?.find(
      (note: any) =>
        note.kind === "SUMMARY" &&
        isTranscriptPacketProjection(note.sourceJson, latestTranscript?.id),
    ) || null;

  if (!transcriptGate.allowed && latestRecordingAsset) return "transcript-held";
  if (packetSummary) return "packet-ready";
  if (latestTranscript?.status === "COMPLETED") return "packet-ready-to-build";
  if (latestTranscript?.status) return `transcript-${String(latestTranscript.status).toLowerCase()}`;
  if (safeCount(room.recordingAssets?.filter((asset: any) => !isProviderRecordingReceiptSlot(asset)).length) > 0) {
    return "recording-ready";
  }
  return "capture-not-started";
}

function minuteLabel(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function dayLabel(value: unknown) {
  if (typeof value !== "number" || value < 0 || value > 6) return null;
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][value];
}

function availabilityLabel(window: any) {
  if (window.startsAt || window.endsAt) return window.label || "Specific availability";
  const day = dayLabel(window.dayOfWeek) || "Flexible day";
  const start = minuteLabel(window.startMinute) || "start TBD";
  const end = minuteLabel(window.endMinute) || "end TBD";
  return window.label || `${day}, ${start} to ${end}`;
}

function nextHoldAction(hold: any, now = new Date()) {
  if (hold.status === "CONVERTED") return "Converted to a booking. Preserve the hold as scheduling evidence.";
  if (hold.status === "CANCELED") return "Released. Keep the history, but do not treat this as reserved time.";
  if (hold.status === "EXPIRED" || new Date(hold.expiresAt).getTime() < now.getTime()) {
    return "Expired. Refresh or release before promising this slot.";
  }
  if (!hold.clientUserId && !hold.contactEmail) {
    return "Held without a client. Attach a person or release the slot.";
  }
  return "Active hold. Convert to a booking only when the human confirms.";
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before opening the coaching runway." },
      { status: 401 },
    );
  }

  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const now = new Date();
  const userBookingWhere = session.user.isStaff
    ? {}
    : {
        OR: [{ clientUserId: userId }, { coachUserId: userId }],
      };
  const userRoomWhere = session.user.isStaff
    ? {}
    : {
        OR: [
          { createdByUserId: userId },
          { participants: { some: { userId, accessStatus: "ACTIVE" } } },
          { booking: { clientUserId: userId } },
          { booking: { coachUserId: userId } },
        ],
      };

  const [scheduleAccess, coachProfiles, offerings, upcomingBookings, bookingHolds, recentRooms, openRequests] =
    await Promise.all([
      quipslyCoachCapabilityAccess({
        prisma,
        userId,
        capability: "coaching.schedule",
        isStaff: session.user.isStaff,
        now,
      }),
      prisma.coachProfile.findMany({
        where: session.user.isStaff ? {} : { userId },
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
        take: 20,
        include: {
          user: { select: { id: true, name: true, primaryEmail: true, image: true } },
          serviceOfferings: {
            where: { isActive: true },
            orderBy: { updatedAt: "desc" },
            take: 8,
          },
          availabilityWindows: {
            where: { isActive: true },
            orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }, { startsAt: "asc" }],
            take: 12,
          },
        },
      }),
      prisma.serviceOffering.findMany({
        where: session.user.isStaff
          ? { isActive: true }
          : { isActive: true, coachProfile: { userId } },
        orderBy: [{ kind: "asc" }, { updatedAt: "desc" }],
        take: 30,
        include: {
          coachProfile: {
            include: {
              user: { select: { id: true, name: true, primaryEmail: true, image: true } },
            },
          },
        },
      }),
      prisma.coachingBooking.findMany({
        where: {
          ...userBookingWhere,
          scheduledEnd: { gte: now },
        },
        orderBy: { scheduledStart: "asc" },
        take: 30,
        include: {
          offering: true,
          clientUser: {
            select: {
              id: true,
              name: true,
              primaryEmail: true,
              image: true,
              stripeCustomerLinks: {
                orderBy: { updatedAt: "desc" },
                take: 1,
                select: { stripeCustomerId: true, livemode: true, updatedAt: true },
              },
            },
          },
          coachUser: { select: { id: true, name: true, primaryEmail: true, image: true } },
          paymentRecord: {
            include: {
              checkoutSessionLedgers: {
                orderBy: { createdAt: "desc" },
                take: 3,
              },
            },
          },
          sessionPreparation: {
            select: {
              clientSubmittedAt: true,
              coachPreparedAt: true,
            },
          },
          calendarLinks: { orderBy: { createdAt: "desc" }, take: 3 },
          callRoom: {
            include: {
              calendarLinks: { orderBy: { createdAt: "desc" }, take: 3 },
              invitations: {
                orderBy: { createdAt: "desc" },
                take: 10,
                select: {
                  email: true,
                  deliveries: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                      id: true,
                      channel: true,
                      status: true,
                      requestedAt: true,
                      completedAt: true,
                      errorCode: true,
                      errorMessage: true,
                    },
                  },
                },
              },
              participants: { where: { accessStatus: "ACTIVE" } },
              recordingConsents: true,
              recordingAssets: true,
              transcriptJobs: { orderBy: { createdAt: "desc" }, take: 3 },
              notes: {
                orderBy: { createdAt: "desc" },
                take: 12,
                select: {
                  id: true,
                  kind: true,
                  title: true,
                  sourceJson: true,
                  _count: { select: { actionItems: true } },
                },
              },
              actionItems: {
                where: { status: "OPEN" },
                select: { id: true, sourceJson: true },
                take: 100,
              },
            },
          },
        },
      }),
      prisma.bookingHold.findMany({
        where: session.user.isStaff
          ? {
              OR: [
                { status: "ACTIVE", expiresAt: { gte: now } },
                { createdAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } },
              ],
            }
          : {
              OR: [
                { clientUserId: userId },
                { coachProfile: { userId } },
              ],
            },
        orderBy: [{ status: "asc" }, { scheduledStart: "asc" }],
        take: 30,
        include: {
          offering: true,
          clientUser: { select: { id: true, name: true, primaryEmail: true, image: true } },
          coachProfile: {
            include: {
              user: { select: { id: true, name: true, primaryEmail: true, image: true } },
            },
          },
        },
      }),
      prisma.callRoom.findMany({
        where: userRoomWhere,
        // This is an operating/review runway, not the upcoming calendar. Surface
        // rooms with recent capture or review activity before applying the bound.
        orderBy: [{ updatedAt: "desc" }, { scheduledStart: "asc" }],
        take: 30,
        include: {
          booking: {
            include: {
              offering: true,
              clientUser: { select: { id: true, name: true, primaryEmail: true, image: true } },
              coachUser: { select: { id: true, name: true, primaryEmail: true, image: true } },
              calendarLinks: { orderBy: { createdAt: "desc" }, take: 3 },
            },
          },
          calendarLinks: { orderBy: { createdAt: "desc" }, take: 3 },
          participants: { where: { accessStatus: "ACTIVE" } },
          recordingConsents: true,
          recordingAssets: true,
          providerRecordingCommands: {
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              action: true,
              status: true,
              providerEgressId: true,
              recordingAssetId: true,
              errorCode: true,
              errorMessage: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          transcriptJobs: {
            orderBy: { createdAt: "desc" },
            take: 3,
            include: { _count: { select: { segments: true } } },
          },
          notes: {
            orderBy: { createdAt: "desc" },
            take: 12,
            select: {
              id: true,
              kind: true,
              title: true,
              sourceJson: true,
              _count: { select: { actionItems: true } },
            },
          },
          actionItems: {
            where: { status: "OPEN" },
            select: { id: true, sourceJson: true },
            take: 100,
          },
          outputs: {
            orderBy: { createdAt: "desc" },
            take: 12,
            select: { id: true, kind: true, status: true, createdAt: true },
          },
        },
      }),
      prisma.coachingRequest.findMany({
        where: session.user.isStaff
          ? { status: { in: ["NEW", "CONTACTED", "SCHEDULED"] } }
          : { clientUserId: userId },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          clientUser: { select: { id: true, name: true, primaryEmail: true, image: true } },
          assignedCoachUser: { select: { id: true, name: true, primaryEmail: true, image: true } },
        },
      }),
    ]);

  const runwayRecordingAssetIds = [
    ...recentRooms.flatMap((room: any) => room.recordingAssets || []),
    ...upcomingBookings.flatMap((booking: any) => booking.callRoom?.recordingAssets || []),
  ].map((asset: any) => asset.id);
  const finalizationReceipts = runwayRecordingAssetIds.length
    ? await prisma.mobileCaptureFinalizationReceipt.findMany({
        where: { recordingAssetId: { in: [...new Set(runwayRecordingAssetIds)] } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const mappedRooms = recentRooms.map((room: any) => {
    const latestTranscript = room.transcriptJobs?.[0] || null;
    const journeySummary = roomJourneySummary(room, finalizationReceipts);
    const latestCalendar = latestCalendarLink(room) || latestCalendarLink(room.booking);
    const calendarPacket = calendarReadyPacket({
      room,
      booking: room.booking,
      latestLink: latestCalendar,
    });
    const allRecordingAssets = room.recordingAssets?.filter((asset: any) => !isProviderRecordingReceiptSlot(asset)) || [];
    const latestRecordingAsset = allRecordingAssets.find((asset: any) => asset.id === latestTranscript?.assetId)
      || allRecordingAssets[0]
      || null;
    const mediaGate = runwayProcessingGate(room, latestRecordingAsset, finalizationReceipts, false);
    const transcriptGate = runwayProcessingGate(room, latestRecordingAsset, finalizationReceipts, true);
    const packetSummary =
      transcriptGate.allowed && room.notes?.find(
        (note: any) =>
          note.kind === "SUMMARY" &&
          isTranscriptPacketProjection(note.sourceJson, latestTranscript?.id),
      ) || null;
    const receiptSlot = providerRecordingReceiptSlot(room);
    const providerProjection = projectProviderRecordingState(room);
    const activeProviderAsset = providerProjection.activeAsset || activeProviderRecordingAsset(room);
    const recordingAssetsForTranscript = transcribableRecordingAssets(room, finalizationReceipts);
    const recordingCount = safeCount(allRecordingAssets.length);
    const lifecycle = buildQuipslyCoachingLifecycle({
      bookingExists: Boolean(room.booking?.id || room.id),
      paymentRequired: room.booking?.paymentPolicy === "PAID_ONE_TO_ONE",
      paymentResolved:
        room.booking?.paymentPolicy !== "PAID_ONE_TO_ONE" ||
        room.booking?.paymentRecord?.status === "PAID",
      calendarReceiptExists: calendarLinkHasReceipt(latestCalendar),
      roomExists: Boolean(room.id),
      participantsAttached: safeCount(room.participants?.length) > 0,
      participantCount: safeCount(room.participants?.length),
      requiredParticipantCount: room.purpose === "COACHING" ? 2 : 1,
      consentGranted: journeySummary.evidence?.allParticipantConsentGranted === true,
      providerReady: Boolean(room.providerRoomId),
      localFallbackReady: Boolean(room.id),
      recordingExists: recordingCount > 0,
      serverRecordingVerified: mediaGate.allowed && recordingServerVerified(latestRecordingAsset),
      transcriptExists: Boolean(latestTranscript?.id),
      transcriptCompleted: transcriptGate.allowed && latestTranscript?.status === "COMPLETED",
      packetExists: Boolean(packetSummary?.id),
      publicationReceiptExists: false,
      nextAction: nextRoomAction(room, finalizationReceipts),
    });

    return {
      id: room.id,
      bookingId: room.bookingId || room.booking?.id || null,
      coachingEngagementId: room.coachingEngagementId || room.booking?.engagementId || null,
      title: room.title || room.booking?.offering?.title || "Quipsly capture room",
      purpose: room.purpose,
      status: room.status,
      provider: room.provider,
      providerRoomId: room.providerRoomId,
      scheduledStart: room.scheduledStart,
      scheduledEnd: room.scheduledEnd,
      endedAt: room.endedAt,
      calendarStatus: calendarPacket.status,
      calendarReadyPacket: calendarPacket,
      client: person(room.booking?.clientUser),
      coach: person(room.booking?.coachUser),
      participantCount: safeCount(room.participants?.length),
      consentGrantedCount: journeySummary.consent.grantedCount,
      consentSummary: journeySummary.consent,
      recordingCount,
      providerRecordingReceiptSlotId: receiptSlot?.id || null,
      providerRecordingReceiptStatus: receiptSlot?.status || null,
      providerRecordingActiveAssetId: activeProviderAsset?.id || null,
      providerRecordingActiveStatus: activeProviderAsset?.status || null,
      providerRecordingState: providerProjection.state,
      providerRecordingCommandId: providerProjection.unresolved?.id || providerProjection.latest?.id || null,
      providerRecordingCommandStatus: providerProjection.unresolved?.status || providerProjection.latest?.status || null,
      providerRecordingCommandAction: providerProjection.unresolved?.action || providerProjection.latest?.action || null,
      providerRecordingCommandErrorCode: providerProjection.unresolved?.errorCode || providerProjection.latest?.errorCode || null,
      providerRecordingNextAction: providerProjection.nextAction,
      latestRecordingAssetId: latestRecordingAsset?.id || null,
      latestRecordingAssetStatus: latestRecordingAsset?.status || null,
      latestTranscriptJobId: latestTranscript?.id || null,
      latestTranscriptStatus: latestTranscript?.status || null,
      latestTranscriptSegmentCount: latestTranscript?._count?.segments || 0,
      captureMediaProcessingAllowed: mediaGate.allowed,
      captureTranscriptProcessingAllowed: transcriptGate.allowed,
      captureProcessingHoldReasonCode: mediaGate.allowed ? null : mediaGate.errorCode,
      captureTranscriptHoldReasonCode: transcriptGate.allowed ? null : transcriptGate.errorCode,
      packetSummaryNoteId: packetSummary?.id || null,
      packetHighlightCount: safeCount(
        transcriptGate.allowed && room.notes?.filter(
          (note: any) =>
            note.kind === "HIGHLIGHT" &&
            isTranscriptPacketProjection(note.sourceJson, latestTranscript?.id),
        ).length || 0,
      ),
      openActionItemCount: transcriptGate.allowed && packetSummary
        ? safeCount(room.actionItems?.filter(
            (actionItem: any) =>
              isCommittedTranscriptActionItem(actionItem, latestTranscript?.id),
          ).length)
        : 0,
      packetStatus: roomPacketStatus(room, finalizationReceipts),
      followUpReleased: Boolean(
        room.outputs?.some((output: any) => output.status === "RELEASED"),
      ),
      journeySummary,
      lifecycle,
      nextAction: nextRoomAction(room, finalizationReceipts),
    };
  });

  const mappedBookings = upcomingBookings.map((booking: any) => {
    const latestCheckout = booking.paymentRecord?.checkoutSessionLedgers?.[0] || null;
    const latestCustomerLink = booking.clientUser?.stripeCustomerLinks?.[0] || null;
    const hasStripeCustomerEvidence = Boolean(
      booking.paymentRecord?.providerCustomerId || latestCustomerLink?.stripeCustomerId,
    );
    const journeySummary = bookingJourneySummary(
      booking,
      latestCheckout,
      hasStripeCustomerEvidence,
      finalizationReceipts,
    );
    const latestCalendar = latestCalendarLink(booking) || latestCalendarLink(booking.callRoom);
    const canManageClientInvitation =
      session.user.isStaff || booking.coachUserId === userId;
    const clientInvitationDelivery = projectClientInvitationDeliveryForViewer({
      canManageInvitation: canManageClientInvitation,
      clientEmail: booking.clientUser?.primaryEmail,
      invitations: booking.callRoom?.invitations,
    });
    const calendarPacket = calendarReadyPacket({
      booking,
      room: booking.callRoom,
      latestLink: latestCalendar,
    });
    const latestTranscript = booking.callRoom?.transcriptJobs?.[0] || null;
    const bookingAllRecordingAssets = booking.callRoom?.recordingAssets?.filter(
      (asset: any) => !isProviderRecordingReceiptSlot(asset),
    ) || [];
    const latestRecordingAsset = bookingAllRecordingAssets.find((asset: any) => asset.id === latestTranscript?.assetId)
      || bookingAllRecordingAssets[0]
      || null;
    const bookingMediaGate = runwayProcessingGate(
      booking.callRoom,
      latestRecordingAsset,
      finalizationReceipts,
      false,
    );
    const bookingTranscriptGate = runwayProcessingGate(
      booking.callRoom,
      latestRecordingAsset,
      finalizationReceipts,
      true,
    );
    const packetSummary =
      bookingTranscriptGate.allowed && booking.callRoom?.notes?.find(
        (note: any) =>
          note.kind === "SUMMARY" &&
          isTranscriptPacketProjection(note.sourceJson, latestTranscript?.id),
      ) || null;
    const bookingRecordingAssetsForTranscript = transcribableRecordingAssets(
      booking.callRoom,
      finalizationReceipts,
    );
    const paymentRequired = booking.paymentPolicy === "PAID_ONE_TO_ONE";
    const paymentResolved = !paymentRequired || booking.paymentRecord?.status === "PAID";
    const lifecycle = buildQuipslyCoachingLifecycle({
      bookingExists: Boolean(booking.id),
      paymentRequired,
      paymentResolved,
      calendarReceiptExists: calendarLinkHasReceipt(latestCalendar),
      roomExists: Boolean(booking.callRoom?.id),
      participantsAttached: safeCount(booking.callRoom?.participants?.length) > 0,
      consentGranted: journeySummary.evidence?.allParticipantConsentGranted === true,
      providerReady: Boolean(booking.callRoom?.providerRoomId),
      localFallbackReady: Boolean(booking.callRoom?.id),
      recordingExists: safeCount(bookingAllRecordingAssets.length) > 0,
      serverRecordingVerified: bookingMediaGate.allowed && recordingServerVerified(latestRecordingAsset),
      transcriptExists: Boolean(latestTranscript?.id),
      transcriptCompleted: bookingTranscriptGate.allowed && latestTranscript?.status === "COMPLETED",
      packetExists: Boolean(packetSummary?.id),
      publicationReceiptExists: false,
      nextAction: nextBookingAction(booking),
    });

    return {
      id: booking.id,
      clientUserId: booking.clientUserId,
      coachingEngagementId: booking.engagementId || booking.callRoom?.coachingEngagementId || null,
      title: booking.callRoom?.title || booking.offering?.title || "Coaching session",
      status: booking.status,
      scheduledStart: booking.scheduledStart,
      scheduledEnd: booking.scheduledEnd,
      timezone: booking.timezone,
      paymentPolicy: booking.paymentPolicy,
      paymentStatus: booking.paymentRecord?.status || null,
      amountCents: booking.paymentRecord?.amountCents || booking.offering?.priceCents || null,
      currency: booking.paymentRecord?.currency || booking.offering?.currency || "USD",
      serviceKind: booking.offering?.kind || null,
      client: person(booking.clientUser),
      coach: person(booking.coachUser),
      callRoomId: booking.callRoom?.id || null,
      callRoomStatus: booking.callRoom?.status || null,
      clientInvitationDelivery,
      ...coachingClientEntryPaths({
        roomId: booking.callRoom?.id,
        engagementId: booking.engagementId || booking.callRoom?.coachingEngagementId,
      }),
      calendarStatus: calendarPacket.status,
      calendarReadyPacket: calendarPacket,
      checkoutSessionCount: safeCount(booking.paymentRecord?.checkoutSessionLedgers?.length),
      latestCheckoutSessionId: latestCheckout?.checkoutSessionId || null,
      latestCheckoutStatus: latestCheckout?.status || null,
      latestCheckoutUrl: latestCheckout?.url || null,
      latestCheckoutLivemode: typeof latestCheckout?.livemode === "boolean" ? latestCheckout.livemode : null,
      stripeCustomerEvidence: hasStripeCustomerEvidence,
      stripeCustomerEvidenceLivemode:
        typeof latestCustomerLink?.livemode === "boolean"
          ? latestCustomerLink.livemode
          : typeof latestCheckout?.livemode === "boolean"
            ? latestCheckout.livemode
            : null,
      journeySummary,
      lifecycle,
      portalNextAction: hasStripeCustomerEvidence
        ? process.env["COACHING_CUSTOMER_PORTAL_ENABLED"] === "true"
          ? "Customer Portal can open from existing Stripe customer evidence."
          : "Stripe customer evidence exists. Enable Coaching Customer Portal before opening the provider portal."
        : "Customer Portal needs Stripe customer evidence from checkout or webhook reconciliation first.",
      paymentNextAction: nextPaymentAction(booking, latestCheckout),
      nextAction: nextBookingAction(booking),
    };
  });

  const mappedAvailabilityWindows = coachProfiles.flatMap((profile: any) =>
    (profile.availabilityWindows || []).map((window: any) => ({
      id: window.id,
      coachProfileId: profile.id,
      coach: person(profile.user),
      label: availabilityLabel(window),
      timezone: window.timezone,
      dayOfWeek: window.dayOfWeek,
      dayLabel: dayLabel(window.dayOfWeek),
      startMinute: window.startMinute,
      endMinute: window.endMinute,
      startLabel: minuteLabel(window.startMinute),
      endLabel: minuteLabel(window.endMinute),
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      isActive: window.isActive,
      kind: window.startsAt || window.endsAt ? "specific" : "recurring",
      nextAction: window.startsAt || window.endsAt
        ? "Use this one-time window when proposing a session."
        : "Use this recurring window as a safe scheduling clue, not a calendar guarantee.",
    })),
  );

  const mappedBookingHolds = bookingHolds.map((hold: any) => ({
    id: hold.id,
    status: hold.status,
    scheduledStart: hold.scheduledStart,
    scheduledEnd: hold.scheduledEnd,
    timezone: hold.timezone,
    expiresAt: hold.expiresAt,
    contactEmail: hold.contactEmail,
    client: person(hold.clientUser),
    coach: person(hold.coachProfile?.user),
    offeringTitle: hold.offering?.title || null,
    convertedBookingId: hold.convertedBookingId || null,
    nextAction: nextHoldAction(hold, now),
  }));
  const actorIsCoach = coachProfiles.some(
    (profile: any) => profile.user?.id === userId,
  );
  const practiceCommand = actorIsCoach
    ? buildQuipslyCoachingPracticeCommand({
        now: now.toISOString(),
        bookings: upcomingBookings
          .filter((booking: any) => booking.coachUserId === userId)
          .map((booking: any) => ({
            id: booking.id,
            title: booking.callRoom?.title || booking.offering?.title || "Coaching Session",
            status: booking.status,
            scheduledStart: booking.scheduledStart.toISOString(),
            scheduledEnd: booking.scheduledEnd?.toISOString() || null,
            roomId: booking.callRoom?.id || null,
            roomStatus: booking.callRoom?.status || null,
            engagementId: booking.engagementId || booking.callRoom?.coachingEngagementId || null,
            clientLabel: booking.clientUser?.name || booking.clientUser?.primaryEmail || null,
            clientCheckInSubmittedAt:
              booking.sessionPreparation?.clientSubmittedAt?.toISOString() || null,
            coachPreparedAt:
              booking.sessionPreparation?.coachPreparedAt?.toISOString() || null,
          })),
        timeRequests: bookingHolds
          .filter((hold: any) => hold.coachProfile?.user?.id === userId)
          .map((hold: any) => ({
            id: hold.id,
            status: hold.status,
            expiresAt: hold.expiresAt.toISOString(),
            scheduledStart: hold.scheduledStart.toISOString(),
            scheduledEnd: hold.scheduledEnd?.toISOString() || null,
            title: hold.offering?.title || null,
            clientLabel:
              hold.clientUser?.name || hold.clientUser?.primaryEmail || hold.contactEmail || null,
          })),
        rooms: recentRooms
          .filter((room: any) => room.booking?.coachUserId === userId)
          .map((room: any) => {
            const mapped = mappedRooms.find((candidate: any) => candidate.id === room.id);
            return {
              id: room.id,
              bookingId: room.bookingId || room.booking?.id || null,
              engagementId: room.coachingEngagementId || room.booking?.engagementId || null,
              title: room.title || room.booking?.offering?.title || "Coaching Session",
              status: room.status,
              scheduledStart: room.scheduledStart?.toISOString() || null,
              endedAt: room.endedAt?.toISOString() || null,
              clientLabel: room.booking?.clientUser?.name || room.booking?.clientUser?.primaryEmail || null,
              recordingCount: mapped?.recordingCount || 0,
              recordingStatus: mapped?.latestRecordingAssetStatus || null,
              providerRecordingState: mapped?.providerRecordingState || null,
              transcriptStatus: mapped?.latestTranscriptStatus || null,
              packetStatus: mapped?.packetStatus || null,
              followUpReleased: mapped?.followUpReleased === true,
            };
          }),
      })
    : null;
  const liveKitEgressReadiness = getQuipslyLiveKitEgressReadiness();
  const calendarReadiness = getCoachingCalendarReadiness();
  const invitationEmailReadiness = sessionInvitationEmailReadiness(request.url);

  return NextResponse.json({
    ok: true,
    user: {
      id: session.user.id,
      email: session.user.primaryEmail,
      name: session.user.name,
      isStaff: session.user.isStaff,
      isCoach: actorIsCoach,
      isClient: session.user.roles.includes("CLIENT"),
    },
    subscription: {
      canScheduleNewWork: scheduleAccess.allowed,
      accessMode: scheduleAccess.accessMode,
      planName: scheduleAccess.entitlement?.planName ?? null,
      trialDays: scheduleAccess.entitlement?.trialDays ?? 14,
      managementURL: scheduleAccess.entitlement?.management?.webURL ?? "/settings#subscription",
    },
    generatedAt: new Date().toISOString(),
    boundaries: {
      stripeScope: "Stripe is evidence for eligible one-to-one real-time coaching only. SaaS, courses, group coaching, and libraries stay separate.",
      publicationScope: "This runway reports local Quipsly truth. It does not claim publication, payment, calendar sync, or external receipts without provider evidence.",
      recordingScope: "Recording requires explicit consent and visible recording state.",
    },
    readiness: {
      invitationEmailConfigured: invitationEmailReadiness.available,
      invitationEmailStatus: invitationEmailReadiness.status,
      stripeConfigured: Boolean(process.env["STRIPE_SECRET_KEY"]),
      stripeLiveAllowed: process.env["QUIPSLY_ALLOW_LIVE_STRIPE"] === "true",
      liveKitJoinConfigured: liveKitEgressReadiness.liveKitJoinConfigured,
      liveKitEgressConfigured: liveKitEgressReadiness.liveKitEgressConfigured,
      liveKitEgressStartEnabled: liveKitEgressReadiness.liveKitEgressStartEnabled,
      liveKitEgressNextAction: liveKitEgressReadiness.nextAction,
      calendarReadiness,
      deepgramConfigured: Boolean(process.env.DEEPGRAM_API_KEY),
      coachingCustomerPortalEnabled: process.env["COACHING_CUSTOMER_PORTAL_ENABLED"] === "true",
      paymentReadiness: {
        stripeMode: process.env["STRIPE_SECRET_KEY"]
          ? process.env["QUIPSLY_ALLOW_LIVE_STRIPE"] === "true"
            ? "live-enabled"
            : "test-or-held"
          : "not-configured",
        stripeNextAction: process.env["STRIPE_SECRET_KEY"]
          ? process.env["QUIPSLY_ALLOW_LIVE_STRIPE"] === "true"
            ? "Live Stripe is explicitly enabled. Keep checkout scoped to eligible paid one-to-one coaching only."
            : "Stripe credentials exist, but live charging is held. Use this as test/internal evidence unless launch approval enables live Stripe."
          : "Configure Stripe test credentials before creating checkout evidence.",
        customerPortalNextAction: process.env["COACHING_CUSTOMER_PORTAL_ENABLED"] === "true"
          ? "Customer Portal can open only from existing Stripe customer evidence."
          : "Customer Portal is held until COACHING_CUSTOMER_PORTAL_ENABLED=true and existing Stripe customer evidence exists.",
        checkoutBoundary:
          "Checkout is only for eligible paid one-to-one real-time coaching. SaaS, courses, group coaching, content libraries, and subscriptions stay outside this Stripe path.",
      },
    },
    counts: {
      coaches: coachProfiles.length,
      offerings: offerings.length,
      availabilityWindows: mappedAvailabilityWindows.length,
      activeHolds: mappedBookingHolds.filter((hold: any) => hold.status === "ACTIVE").length,
      upcomingBookings: mappedBookings.length,
      captureRooms: mappedRooms.length,
      openRequests: openRequests.length,
      roomsWithRecordings: mappedRooms.filter((room: any) => room.recordingCount > 0).length,
      roomsWithPackets: mappedRooms.filter((room: any) => room.packetSummaryNoteId).length,
    },
    coaches: coachProfiles.map((profile: any) => ({
      id: profile.id,
      slug: profile.slug,
      displayName: profile.displayName || profile.user?.name || profile.user?.primaryEmail,
      timezone: profile.timezone,
      isActive: profile.isActive,
      user: person(profile.user),
      offeringCount: safeCount(profile.serviceOfferings?.length),
      availabilityWindowCount: safeCount(profile.availabilityWindows?.length),
    })),
    offerings: offerings.map((offering: any) => ({
      id: offering.id,
      slug: offering.slug,
      title: offering.title,
      description: offering.description,
      kind: offering.kind,
      paymentPolicy: offering.paymentPolicy,
      durationMinutes: offering.durationMinutes,
      priceCents: offering.priceCents,
      currency: offering.currency,
      stripePriceConfigured: Boolean(offering.stripePriceId),
      publicBookingEnabled: offering.publicBookingEnabled === true,
      coach: person(offering.coachProfile?.user),
    })),
    availabilityWindows: mappedAvailabilityWindows,
    bookingHolds: mappedBookingHolds,
    practiceCommand,
    upcomingBookings: mappedBookings,
    captureRooms: mappedRooms,
    openRequests: openRequests.map((request: any) => ({
      id: request.id,
      status: request.status,
      email: request.email,
      phone: request.phone,
      preferredContactMethod: request.preferredContactMethod,
      coachingGoals: request.coachingGoals,
      availabilityNotes: request.availabilityNotes,
      createdAt: request.createdAt,
      client: person(request.clientUser),
      assignedCoach: person(request.assignedCoachUser),
      nextAction:
        request.status === "NEW"
          ? "Review goals and choose the next human contact."
          : request.status === "CONTACTED"
            ? "Schedule or close the request based on the conversation."
            : "Preserve request history and link it to the booking when available.",
    })),
  });
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before changing the coaching runway." },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  const action = text(body.action) || "create-booking-room";

  if (![
    "setup-coach-profile",
    "update-weekly-availability",
    "update-public-booking",
    "create-booking-room",
    "create-booking-series",
    "create-booking-hold",
    "release-booking-hold",
    "convert-booking-hold",
    "reschedule-booking",
    "cancel-booking",
    "attach-calendar-receipt",
    "sync-google-calendar-event",
    "cancel-google-calendar-event",
  ].includes(action)) {
    return NextResponse.json(
      { ok: false, error: "Unsupported coaching runway action." },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const paidCoachActions = new Set([
    "create-booking-room",
    "create-booking-series",
    "convert-booking-hold",
    "update-public-booking",
  ]);
  if (paidCoachActions.has(action)) {
    const access = await quipslyCoachCapabilityAccess({
      prisma,
      userId: session.user.id,
      capability: "coaching.schedule",
      isStaff: session.user.isStaff,
    });
    if (!access.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Start or restore a Quipsly Coach plan to schedule new coaching work. Existing Sessions, client access, and past work remain available.",
          code: "QUIPSLY_SUBSCRIPTION_REQUIRED",
          managementURL: "/settings#subscription",
        },
        { status: 402 },
      );
    }
  }

  if (action === "setup-coach-profile") {
    const coachEmail = text(body.coachEmail) || session.user.primaryEmail;
    const coachName = text(body.coachName) || session.user.name || coachEmail;
    const timezone = text(body.timezone) || getCoachingDefaultTimezone();
    const defaultDurationMinutes = integer(body.defaultDurationMinutes) || 60;
    const defaultAmountCents = integer(body.defaultAmountCents);
    const offeringTitle = text(body.offeringTitle) || `${coachName.split("@")[0]} coaching session`;
    const offeringDescription =
      text(body.offeringDescription) ||
      "A one-to-one coaching session with booking, payment evidence, consent-aware capture, transcript review, and a follow-up packet in Quipsly.";

    if (!coachEmail || !coachEmail.includes("@")) {
      return NextResponse.json(
        { ok: false, error: "Coach email is required before setting up a coach profile." },
        { status: 400 },
      );
    }

    const sessionEmail = text(session.user.primaryEmail).toLowerCase();
    if (!session.user.isStaff && (!sessionEmail || coachEmail.toLowerCase() !== sessionEmail)) {
      return NextResponse.json(
        { ok: false, error: "You can only set up your own coach profile." },
        { status: 403 },
      );
    }

    const transactionResult = await prisma.$transaction(async (tx: any) => {
      const coachUser = await ensureInvitedStudioUserByEmail({
        email: coachEmail,
        name: coachName,
        prisma: tx,
      });

      await tx.userRole.upsert({
        where: {
          userId_role: {
            userId: coachUser.id,
            role: "COACH",
          },
        },
        update: {},
        create: {
          userId: coachUser.id,
          role: "COACH",
        },
      });

      const baseSlug = slugify(coachName) || slugify(coachEmail.split("@")[0]) || "coach";
      const profileSlug = `${baseSlug}-${coachUser.id.slice(-6)}`;
      const existingProfile = await tx.coachProfile.findUnique({
        where: { userId: coachUser.id },
        select: { id: true },
      });
      const profile = await tx.coachProfile.upsert({
        where: { userId: coachUser.id },
        update: {
          displayName: coachName,
          timezone,
          isActive: true,
          metadataJson: {
            source: "quipsly-coaching-runway",
            updatedByUserId: session.user.id,
            setupMode: "coach-profile",
          },
        },
        create: {
          userId: coachUser.id,
          slug: profileSlug,
          displayName: coachName,
          timezone,
          isActive: true,
          metadataJson: {
            source: "quipsly-coaching-runway",
            createdByUserId: session.user.id,
            setupMode: "coach-profile",
          },
        },
      });

      const offeringSlug = `${profile.slug || profileSlug}-one-to-one-coaching`;
      const priceCents =
        typeof defaultAmountCents === "number" && defaultAmountCents > 0
          ? defaultAmountCents
          : null;
      const paymentPolicy = coachingSetupPaymentPolicy(priceCents);
      const offering = await tx.serviceOffering.upsert({
        where: { slug: offeringSlug },
        update: {
          coachProfileId: profile.id,
          title: offeringTitle,
          description: offeringDescription,
          kind: "ONE_TO_ONE_COACHING",
          paymentPolicy,
          durationMinutes: defaultDurationMinutes,
          priceCents,
          currency: text(body.currency) || "USD",
          isActive: true,
          metadataJson: {
            source: "quipsly-coaching-runway",
            updatedByUserId: session.user.id,
            variablePricingAllowed: true,
            stripeCheckoutUsesBookingAmountWhenNoPriceId: true,
          },
        },
        create: {
          coachProfileId: profile.id,
          slug: offeringSlug,
          title: offeringTitle,
          description: offeringDescription,
          kind: "ONE_TO_ONE_COACHING",
          paymentPolicy,
          durationMinutes: defaultDurationMinutes,
          priceCents,
          currency: text(body.currency) || "USD",
          isActive: true,
          metadataJson: {
            source: "quipsly-coaching-runway",
            createdByUserId: session.user.id,
            variablePricingAllowed: true,
            stripeCheckoutUsesBookingAmountWhenNoPriceId: true,
          },
        },
      });

      const existingAvailability = await tx.availabilityWindow.findFirst({
        where: {
          coachProfileId: profile.id,
          isActive: true,
          label: "Flexible scheduling by conversation",
        },
      });
      const availability =
        existingAvailability ||
        (await tx.availabilityWindow.create({
          data: {
            coachProfileId: profile.id,
            label: "Flexible scheduling by conversation",
            timezone,
            isActive: true,
            metadataJson: {
              source: "quipsly-coaching-runway",
              createdByUserId: session.user.id,
              meaning:
                "This is a friendly scheduling clue, not an external calendar guarantee.",
            },
          },
        }));

      return {
        coachUserId: coachUser.id,
        coachEmail: coachUser.primaryEmail,
        coachProfileId: profile.id,
        offeringId: offering.id,
        availabilityWindowId: availability.id,
        profileCreated: !existingProfile,
        role: "COACH",
        nextAction: priceCents
          ? "Coach setup is ready. Create a Session; payment remains separate until you send a Stripe Checkout link."
          : "Coach setup is ready. Create a Session and invite a client. You can add paid booking later if you need it.",
      };
    });

    if (transactionResult.profileCreated) {
      await recordQuipslyProductOutcome({
        prisma,
        userId: transactionResult.coachUserId,
        eventName: "coach_profile_created",
        parameters: {
          surface: "coaching_home",
          workflow: "coaching",
          participant_role: "coach",
          result: "success",
        },
      });
    }
    const { profileCreated: _profileCreated, ...result } = transactionResult;

    return NextResponse.json({ ok: true, action, result });
  }

  let actingCoachProfile = session.user.isStaff
    ? null
    : await prisma.coachProfile.findFirst({
        where: { userId: session.user.id, isActive: true },
        select: { id: true, slug: true },
      });

  if (!session.user.isStaff && !actingCoachProfile) {
    if (!["create-booking-room", "create-booking-series", "create-booking-hold"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "Schedule your first Session before changing coaching preferences." },
        { status: 403 },
      );
    }

    const coachEmail = text(session.user.primaryEmail).toLowerCase();
    const coachName = text(session.user.name) || coachEmail;
    const timezone = text(body.timezone) || getCoachingDefaultTimezone();
    const defaultDurationMinutes = integer(body.durationMinutes) || 60;

    if (!coachEmail || !coachEmail.includes("@")) {
      return NextResponse.json(
        { ok: false, error: "A verified account email is required before scheduling a Session." },
        { status: 400 },
      );
    }

    actingCoachProfile = await prisma.$transaction(async (tx: any) => {
      await tx.userRole.upsert({
        where: {
          userId_role: {
            userId: session.user.id,
            role: "COACH",
          },
        },
        update: {},
        create: {
          userId: session.user.id,
          role: "COACH",
        },
      });

      const baseSlug =
        slugify(coachName) || slugify(coachEmail.split("@")[0]) || "coach";
      const profileSlug = `${baseSlug}-${session.user.id.slice(-6)}`;
      const profile = await tx.coachProfile.upsert({
        where: { userId: session.user.id },
        update: {
          displayName: coachName,
          timezone,
          isActive: true,
        },
        create: {
          userId: session.user.id,
          slug: profileSlug,
          displayName: coachName,
          timezone,
          isActive: true,
          metadataJson: {
            source: "quipsly-coaching-runway",
            setupMode: "automatic-on-first-session",
            createdByUserId: session.user.id,
          },
        },
      });

      await tx.serviceOffering.upsert({
        where: { slug: `${profile.slug || profileSlug}-coaching` },
        update: {
          coachProfileId: profile.id,
          durationMinutes: defaultDurationMinutes,
          isActive: true,
        },
        create: {
          coachProfileId: profile.id,
          slug: `${profile.slug || profileSlug}-coaching`,
          title: "Coaching session",
          description:
            "A private coaching Session with calling, recording, transcript, notes, tasks, and goals in Quipsly.",
          kind: "ONE_TO_ONE_COACHING",
          paymentPolicy: "MANUAL",
          durationMinutes: defaultDurationMinutes,
          currency: "USD",
          isActive: true,
          metadataJson: {
            source: "quipsly-coaching-runway",
            setupMode: "automatic-on-first-session",
          },
        },
      });

      return { id: profile.id, slug: profile.slug };
    });
    await recordQuipslyProductOutcome({
      prisma,
      userId: session.user.id,
      eventName: "coach_profile_created",
      parameters: {
        surface: "coaching_home",
        workflow: "coaching",
        participant_role: "coach",
        result: "success",
      },
    });
  }

  if (action === "update-weekly-availability") {
    const requestedProfileId = text(body.coachProfileId);
    const profile = await prisma.coachProfile.findFirst({
      where: session.user.isStaff
        ? requestedProfileId
          ? { id: requestedProfileId, isActive: true }
          : { userId: session.user.id, isActive: true }
        : { id: actingCoachProfile?.id, userId: session.user.id, isActive: true },
      select: { id: true, userId: true },
    });
    if (!profile) {
      return NextResponse.json(
        { ok: false, error: "Set up a coach profile before choosing weekly availability." },
        { status: 404 },
      );
    }

    const timezone = text(body.timezone) || getCoachingDefaultTimezone();
    try {
      Temporal.Now.instant().toZonedDateTimeISO(timezone);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Choose a valid IANA time zone for weekly availability." },
        { status: 400 },
      );
    }
    const windows = (Array.isArray(body.windows) ? body.windows : []).map((value: unknown) => {
      const window = isObject(value) ? value : {};
      return {
        dayOfWeek: integer(window.dayOfWeek),
        startMinute: integer(window.startMinute),
        endMinute: integer(window.endMinute),
      };
    });
    if (
      windows.length < 1 ||
      windows.length > 14 ||
      windows.some((window) =>
        window.dayOfWeek === null || window.dayOfWeek < 0 || window.dayOfWeek > 6 ||
        window.startMinute === null || window.startMinute < 0 ||
        window.endMinute === null || window.endMinute > 24 * 60 ||
        window.endMinute <= window.startMinute)
    ) {
      return NextResponse.json(
        { ok: false, error: "Choose at least one weekday with an end time after its start time." },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx: any) => {
      await acquirePrismaAdvisoryTransactionLock(
        tx,
        `quipsly:coaching-availability:${profile.userId}`,
      );
      await tx.availabilityWindow.updateMany({
        where: {
          coachProfileId: profile.id,
          isActive: true,
          startsAt: null,
          endsAt: null,
        },
        data: { isActive: false },
      });
      const created = await Promise.all(
        windows.map((window) => tx.availabilityWindow.create({
          data: {
            coachProfileId: profile.id,
            label: `${dayLabel(window.dayOfWeek)} working hours`,
            timezone,
            dayOfWeek: window.dayOfWeek,
            startMinute: window.startMinute,
            endMinute: window.endMinute,
            isActive: true,
            metadataJson: {
              source: "quipsly.coaching.weekly-availability.v1",
              updatedByUserId: session.user.id,
            },
          },
          select: { id: true },
        })),
      );
      await tx.coachProfile.update({ where: { id: profile.id }, data: { timezone } });
      return {
        coachProfileId: profile.id,
        timezone,
        windowCount: created.length,
        nextAction:
          "Weekly availability saved. Quipsly will still recheck conflicts when a Session is created or moved.",
      };
    });
    return NextResponse.json({ ok: true, action, result });
  }

  if (action === "update-public-booking") {
    const offeringId = text(body.offeringId);
    const enabled = body.enabled === true;
    if (!offeringId) {
      return NextResponse.json(
        { ok: false, error: "Choose an offering before changing public booking." },
        { status: 400 },
      );
    }
    const offering = await prisma.serviceOffering.findFirst({
      where: session.user.isStaff
        ? { id: offeringId, isActive: true }
        : {
            id: offeringId,
            isActive: true,
            coachProfileId: actingCoachProfile?.id,
          },
      select: { id: true, slug: true },
    });
    if (!offering) {
      return NextResponse.json(
        { ok: false, error: "That coaching offering was not found." },
        { status: 404 },
      );
    }
    const updated = await prisma.serviceOffering.update({
      where: { id: offering.id },
      data: { publicBookingEnabled: enabled },
      select: { id: true, slug: true },
    });
    return NextResponse.json({
      ok: true,
      action,
      result: {
        offeringId: updated.id,
        publicBookingEnabled: enabled,
        bookingPath: `/coaching/book/${encodeURIComponent(updated.slug)}`,
        nextAction: enabled
          ? "Public booking is on. Clients can see only your published open times."
          : "Public booking is off. Existing private holds remain visible to their participants.",
      },
    });
  }

  if (action === "attach-calendar-receipt") {
    const bookingId = text(body.bookingId);
    const roomId = text(body.roomId);
    const provider = text(body.provider) || "google";
    const providerCalendarId = text(body.providerCalendarId) || null;
    const providerEventId = text(body.providerEventId) || null;
    const htmlLink = text(body.htmlLink) || null;
    const receiptStatus = text(body.status) || (providerEventId || htmlLink ? "synced" : "planned");
    const note = text(body.note) || "Calendar provider receipt attached from the Quipsly coaching runway.";

    if (!bookingId && !roomId) {
      return NextResponse.json(
        { ok: false, error: "Choose a booking or capture room before attaching calendar receipt evidence." },
        { status: 400 },
      );
    }

    if (!providerEventId && !htmlLink && !providerCalendarId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Attach at least one calendar evidence field: provider event ID, provider calendar ID, or event link.",
        },
        { status: 400 },
      );
    }

    try {
      const result = await prisma.$transaction(async (tx: any) => {
        const booking = bookingId
          ? await tx.coachingBooking.findUnique({
              where: { id: bookingId },
              include: {
                offering: true,
                clientUser: { select: { id: true, name: true, primaryEmail: true, image: true } },
                coachUser: { select: { id: true, name: true, primaryEmail: true, image: true } },
                callRoom: true,
                calendarLinks: { orderBy: { createdAt: "desc" }, take: 1 },
              },
            })
          : null;
        const room =
          roomId || booking?.callRoom?.id
            ? await tx.callRoom.findUnique({
                where: { id: roomId || booking.callRoom.id },
                include: {
                  booking: {
                    include: {
                      offering: true,
                      clientUser: { select: { id: true, name: true, primaryEmail: true, image: true } },
                      coachUser: { select: { id: true, name: true, primaryEmail: true, image: true } },
                      calendarLinks: { orderBy: { createdAt: "desc" }, take: 1 },
                    },
                  },
                  participants: { where: { accessStatus: "ACTIVE" } },
                  calendarLinks: { orderBy: { createdAt: "desc" }, take: 1 },
                },
              })
            : null;
        const resolvedBooking = booking || room?.booking || null;
        const resolvedRoom = room || resolvedBooking?.callRoom || null;

        if (!resolvedBooking && !resolvedRoom) {
          throw new RunwayActionError("That booking or capture room was not found.", 404);
        }
        if (!canManageCoachingCalendarEvidence({
          operatorUserId: session.user.id,
          operatorIsStaff: session.user.isStaff,
          assignedCoachUserId: resolvedBooking?.coachUser?.id,
          roomCreatedByUserId: resolvedRoom?.createdByUserId,
        })) {
          throw new RunwayActionError("Only the assigned coach, room creator, or Quipsly staff can attach calendar evidence here.", 403);
        }

        const scheduledStart =
          parseDate(body.scheduledStart) ||
          resolvedBooking?.scheduledStart ||
          resolvedRoom?.scheduledStart ||
          null;
        const scheduledEnd =
          parseDate(body.scheduledEnd) ||
          resolvedBooking?.scheduledEnd ||
          resolvedRoom?.scheduledEnd ||
          null;
        const timezone =
          text(body.timezone) ||
          resolvedBooking?.timezone ||
          resolvedRoom?.timezone ||
          getCoachingDefaultTimezone();
        const title =
          text(body.title) ||
          resolvedRoom?.title ||
          resolvedBooking?.offering?.title ||
          "Quipsly coaching session";

        const link = await tx.calendarEventLink.create({
          data: {
            bookingId: resolvedBooking?.id || null,
            roomId: resolvedRoom?.id || null,
            provider,
            providerCalendarId,
            providerEventId,
            status: receiptStatus,
            title,
            scheduledStart,
            scheduledEnd,
            timezone,
            htmlLink,
            rawJson: {
              source: "quipsly-coaching-runway",
              action: "attach-calendar-receipt",
              attachedByUserId: session.user.id,
              attachedAt: new Date().toISOString(),
              note,
              externalCalendarMutatedByQuipsly: false,
            },
          },
        });

        if (resolvedBooking?.id && providerEventId) {
          await tx.coachingBooking.update({
            where: { id: resolvedBooking.id },
            data: {
              calendarEventId: providerEventId,
              metadataJson: metadataWithEvent(resolvedBooking.metadataJson, "calendarReceiptEvents", {
                at: new Date().toISOString(),
                byUserId: session.user.id,
                provider,
                providerCalendarId,
                providerEventId,
                htmlLink,
                status: receiptStatus,
                externalCalendarMutatedByQuipsly: false,
              }),
            },
          });
        }

        return {
          bookingId: resolvedBooking?.id || null,
          callRoomId: resolvedRoom?.id || null,
          calendarLinkId: link.id,
          provider: link.provider,
          providerEventId: link.providerEventId,
          htmlLink: link.htmlLink,
          calendarStatus: link.status,
          calendarReadyPacket: calendarReadyPacket({
            booking: resolvedBooking,
            room: resolvedRoom,
            latestLink: link,
          }),
          nextAction:
            "Calendar receipt attached. Keep Quipsly booking truth and provider evidence together if the time changes again.",
        };
      });

      return NextResponse.json({ ok: true, action, result });
    } catch (error) {
      return runwayActionErrorResponse(error);
    }
  }

  if (action === "sync-google-calendar-event") {
    const bookingId = text(body.bookingId);
    if (!bookingId) {
      return NextResponse.json(
        { ok: false, error: "A booking ID is required before syncing a Google Calendar receipt." },
        { status: 400 },
      );
    }

    try {
      const result = await syncCoachingBookingToGoogleCalendar({
        bookingId,
        operatorUserId: session.user.id,
        operatorIsStaff: session.user.isStaff,
      });

      return NextResponse.json({ ok: true, action, result });
    } catch (error) {
      return runwayActionErrorResponse(error);
    }
  }

  if (action === "cancel-google-calendar-event") {
    const bookingId = text(body.bookingId);
    if (!bookingId) {
      return NextResponse.json(
        { ok: false, error: "A booking ID is required before canceling its Google Calendar event." },
        { status: 400 },
      );
    }
    try {
      const result = await cancelCoachingBookingGoogleCalendar({
        bookingId,
        operatorUserId: session.user.id,
        operatorIsStaff: session.user.isStaff,
      });
      return NextResponse.json({ ok: true, action, result });
    } catch (error) {
      return runwayActionErrorResponse(error);
    }
  }

  if (action === "reschedule-booking") {
    const bookingId = text(body.bookingId);
    const reason = text(body.reason) || "Rescheduled from the Quipsly coaching runway.";

    if (!bookingId) {
      return NextResponse.json(
        { ok: false, error: "A booking ID is required before rescheduling a coaching session." },
        { status: 400 },
      );
    }

    if (!text(body.scheduledStart)) {
      return NextResponse.json(
        { ok: false, error: "A valid scheduled start time is required before rescheduling a coaching session." },
        { status: 400 },
      );
    }

    try {
      const result = await prisma.$transaction(async (tx: any) => {
        const booking = await tx.coachingBooking.findUnique({
          where: { id: bookingId },
          include: {
            appointment: true,
            callRoom: true,
            calendarLinks: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        });

        if (!booking) throw new RunwayActionError("That coaching booking was not found.", 404);
        if (!canManageCoachingCalendarEvidence({
          operatorUserId: session.user.id,
          operatorIsStaff: session.user.isStaff,
          assignedCoachUserId: booking.coachUserId,
          roomCreatedByUserId: booking.callRoom?.createdByUserId,
        })) {
          throw new RunwayActionError("Only the assigned coach, room creator, or Quipsly staff can reschedule this booking.", 403);
        }
        if (booking.status === "CANCELED") {
          throw new RunwayActionError(
            "Canceled bookings stay preserved. Create a new booking instead of rescheduling this one.",
            409,
          );
        }
        if (booking.status === "COMPLETED") {
          throw new RunwayActionError(
            "Completed bookings should stay immutable. Create a follow-up booking if more time is needed.",
            409,
          );
        }
        if (["RECORDING", "ENDED", "CANCELED"].includes(booking.callRoom?.status)) {
          throw new RunwayActionError(
            "This capture room is already recording, ended, or canceled. Preserve it and create a fresh booking if needed.",
            409,
          );
        }

        const timezone = text(body.timezone) || booking.timezone || getCoachingDefaultTimezone();
        const scheduledStart = parseCoachingScheduleDate(body.scheduledStart, timezone);
        if (!scheduledStart) {
          throw new RunwayActionError(
            "Choose a valid start time in this Session's timezone. Daylight-saving gaps and repeated times must be changed.",
            400,
          );
        }
        const durationMinutes = integer(body.durationMinutes) || minutesBetween(booking.scheduledStart, booking.scheduledEnd);
        const scheduledEnd = parseCoachingScheduleDate(body.scheduledEnd, timezone) || addMinutes(scheduledStart, durationMinutes);
        if (!booking.coachUserId) {
          throw new RunwayActionError("Assign a coach before rescheduling this session.", 409);
        }
        await assertCoachingScheduleAvailable({
          tx,
          coachUserId: booking.coachUserId,
          scheduledStart,
          scheduledEnd,
          excludeBookingId: booking.id,
        });
        const auditEvent = {
          at: new Date().toISOString(),
          byUserId: session.user.id,
          reason,
          previousScheduledStart: iso(booking.scheduledStart),
          previousScheduledEnd: iso(booking.scheduledEnd),
          scheduledStart: scheduledStart.toISOString(),
          scheduledEnd: scheduledEnd.toISOString(),
          externalCalendarUpdated: false,
        };
        const nextBookingStatus =
          booking.status === "REQUESTED" || booking.status === "HOLDING_PAYMENT"
            ? booking.status
            : "CONFIRMED";

        if (booking.appointment) {
          await tx.appointment.update({
            where: { id: booking.appointment.id },
            data: {
              scheduledStart,
              scheduledEnd,
              timezone,
              status: "SCHEDULED",
              updatedByUserId: session.user.id,
            },
          });
        }

        const updatedBooking = await tx.coachingBooking.update({
          where: { id: booking.id },
          data: {
            scheduledStart,
            scheduledEnd,
            timezone,
            status: nextBookingStatus,
            metadataJson: metadataWithEvent(booking.metadataJson, "scheduleEvents", {
              ...auditEvent,
              kind: "reschedule",
            }),
          },
        });

        const updatedRoom = booking.callRoom
          ? await tx.callRoom.update({
              where: { id: booking.callRoom.id },
              data: {
                scheduledStart,
                scheduledEnd,
                status: "PLANNED",
                metadataJson: metadataWithEvent(booking.callRoom.metadataJson, "scheduleEvents", {
                  ...auditEvent,
                  kind: "reschedule",
                }),
              },
            })
          : null;

        await tx.calendarEventLink.create({
          data: {
            bookingId: booking.id,
            roomId: updatedRoom?.id || booking.callRoom?.id || null,
            provider: "google",
            status: "reschedule-planned",
            title: booking.callRoom?.title || "Quipsly coaching session",
            scheduledStart,
            scheduledEnd,
            timezone,
            rawJson: {
              source: "quipsly-coaching-runway",
              action: "reschedule-booking",
              previousCalendarLinkId: booking.calendarLinks?.[0]?.id || null,
              externalCalendarUpdated: false,
              reason,
            },
          },
        });

        return {
          bookingId: updatedBooking.id,
          callRoomId: updatedRoom?.id || null,
          status: updatedBooking.status,
          callRoomStatus: updatedRoom?.status || null,
          scheduledStart: updatedBooking.scheduledStart,
          scheduledEnd: updatedBooking.scheduledEnd,
          calendarStatus: "reschedule-planned",
          nextAction: "Booking rescheduled in Quipsly. Update external calendar/invite evidence before promising the change is on calendars.",
        };
      });

      return NextResponse.json({ ok: true, action, result });
    } catch (error) {
      return runwayActionErrorResponse(error);
    }
  }

  if (action === "cancel-booking") {
    const bookingId = text(body.bookingId);
    const reason = text(body.reason) || "Canceled from the Quipsly coaching runway.";

    if (!bookingId) {
      return NextResponse.json(
        { ok: false, error: "A booking ID is required before canceling a coaching session." },
        { status: 400 },
      );
    }

    try {
      const result = await prisma.$transaction(async (tx: any) => {
        const booking = await tx.coachingBooking.findUnique({
          where: { id: bookingId },
          include: {
            appointment: true,
            callRoom: true,
            calendarLinks: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        });

        if (!booking) throw new RunwayActionError("That coaching booking was not found.", 404);
        if (!canManageCoachingCalendarEvidence({
          operatorUserId: session.user.id,
          operatorIsStaff: session.user.isStaff,
          assignedCoachUserId: booking.coachUserId,
          roomCreatedByUserId: booking.callRoom?.createdByUserId,
        })) {
          throw new RunwayActionError("Only the assigned coach, room creator, or Quipsly staff can cancel this booking.", 403);
        }
        if (booking.status === "CANCELED") {
          return {
            bookingId: booking.id,
            callRoomId: booking.callRoom?.id || null,
            status: booking.status,
            callRoomStatus: booking.callRoom?.status || null,
            nextAction: "Booking was already canceled. Preserve it as scheduling history.",
          };
        }
        if (booking.status === "COMPLETED") {
          throw new RunwayActionError(
            "Completed bookings should stay complete. Add follow-up notes instead of canceling history.",
            409,
          );
        }
        if (["RECORDING", "ENDED"].includes(booking.callRoom?.status)) {
          throw new RunwayActionError(
            "This room is already recording or ended. Stop/review that session instead of canceling it.",
            409,
          );
        }

        const auditEvent = {
          at: new Date().toISOString(),
          byUserId: session.user.id,
          reason,
          previousBookingStatus: booking.status,
          previousRoomStatus: booking.callRoom?.status || null,
          scheduledStart: iso(booking.scheduledStart),
          scheduledEnd: iso(booking.scheduledEnd),
          externalCalendarCanceled: false,
        };

        if (booking.appointment) {
          await tx.appointment.update({
            where: { id: booking.appointment.id },
            data: {
              status: "CANCELED",
              updatedByUserId: session.user.id,
            },
          });
        }

        const updatedBooking = await tx.coachingBooking.update({
          where: { id: booking.id },
          data: {
            status: "CANCELED",
            metadataJson: metadataWithEvent(booking.metadataJson, "scheduleEvents", {
              ...auditEvent,
              kind: "cancel",
            }),
          },
        });

        const updatedRoom = booking.callRoom
          ? await tx.callRoom.update({
              where: { id: booking.callRoom.id },
              data: {
                status: "CANCELED",
                metadataJson: metadataWithEvent(booking.callRoom.metadataJson, "scheduleEvents", {
                  ...auditEvent,
                  kind: "cancel",
                }),
              },
            })
          : null;

        await tx.calendarEventLink.create({
          data: {
            bookingId: booking.id,
            roomId: updatedRoom?.id || booking.callRoom?.id || null,
            provider: "google",
            status: "cancel-planned",
            title: booking.callRoom?.title || "Quipsly coaching session",
            scheduledStart: booking.scheduledStart,
            scheduledEnd: booking.scheduledEnd,
            timezone: booking.timezone,
            rawJson: {
              source: "quipsly-coaching-runway",
              action: "cancel-booking",
              previousCalendarLinkId: booking.calendarLinks?.[0]?.id || null,
              externalCalendarCanceled: false,
              reason,
            },
          },
        });

        return {
          bookingId: updatedBooking.id,
          callRoomId: updatedRoom?.id || null,
          status: updatedBooking.status,
          callRoomStatus: updatedRoom?.status || null,
          calendarStatus: "cancel-planned",
          nextAction: "Booking canceled in Quipsly. Cancel external calendar/invite/payment evidence separately before saying the outside world is updated.",
        };
      });

      return NextResponse.json({ ok: true, action, result });
    } catch (error) {
      return runwayActionErrorResponse(error);
    }
  }

  if (action === "release-booking-hold") {
    const holdId = text(body.holdId);
    const reason = text(body.reason) || "Released from the Quipsly coaching runway.";

    if (!holdId) {
      return NextResponse.json(
        { ok: false, error: "A hold ID is required before releasing a booking hold." },
        { status: 400 },
      );
    }

    const hold = await prisma.bookingHold.findUnique({
      where: { id: holdId },
      select: {
        id: true,
        status: true,
        convertedBookingId: true,
        metadataJson: true,
        coachProfile: { select: { userId: true } },
      },
    });

    if (!hold) {
      return NextResponse.json(
        { ok: false, error: "That booking hold was not found." },
        { status: 404 },
      );
    }

    if (!canManageCoachingBookingHold({
      actorUserId: session.user.id,
      actorIsStaff: session.user.isStaff,
      assignedCoachUserId: hold.coachProfile?.userId,
    })) {
      return NextResponse.json(
        { ok: false, error: "Only the assigned coach can release this time request." },
        { status: 403 },
      );
    }

    if (hold.status === "CONVERTED" || hold.convertedBookingId) {
      return NextResponse.json(
        { ok: false, error: "Converted holds stay attached to their booking and cannot be released." },
        { status: 409 },
      );
    }

    if (hold.status === "CANCELED") {
      return NextResponse.json({
        ok: true,
        action,
        result: {
          holdId: hold.id,
          status: hold.status,
          nextAction: "Hold was already released. No scheduling slot is being reserved.",
        },
      });
    }

    const updated = await prisma.bookingHold.update({
      where: { id: hold.id },
      data: {
        status: "CANCELED",
        metadataJson: {
          ...sourceJson(hold.metadataJson),
          releasedAt: new Date().toISOString(),
          releasedByUserId: session.user.id,
          releaseReason: reason,
        },
      },
      select: { id: true, status: true },
    });

    return NextResponse.json({
      ok: true,
      action,
      result: {
        holdId: updated.id,
        status: updated.status,
        nextAction: "Hold released. The time is no longer reserved unless a human creates a new hold or booking.",
      },
    });
  }

  if (action === "convert-booking-hold") {
    const holdId = text(body.holdId);
    const notes = text(body.notes) || null;

    if (!holdId) {
      return NextResponse.json(
        { ok: false, error: "A hold ID is required before converting a booking hold." },
        { status: 400 },
      );
    }

    let coachingProject;
    try {
      coachingProject = await resolveCoachingProject({
        prisma,
        requestedProjectSlug: body.projectSlug,
        actorEmail: text(session.user.primaryEmail || session.user.email).toLowerCase(),
      });
    } catch (error) {
      return runwayActionErrorResponse(error);
    }

    try {
      const result = await prisma.$transaction(async (tx: any) => {
      await acquirePrismaAdvisoryTransactionLock(
        tx,
        `quipsly:coaching-hold-conversion:${holdId}`,
      );
      const hold = await tx.bookingHold.findUnique({
        where: { id: holdId },
        include: {
          offering: { include: { coachProfile: true } },
          coachProfile: true,
          clientUser: true,
        },
      });

      if (!hold) throw new Error("That booking hold was not found.");
      const assignedCoachUserId =
        hold.offering?.coachProfile?.userId || hold.coachProfile?.userId || null;
      if (!canManageCoachingBookingHold({
        actorUserId: session.user.id,
        actorIsStaff: session.user.isStaff,
        assignedCoachUserId,
      })) {
        throw new RunwayActionError(
          "Only the assigned coach can confirm this time request.",
          403,
        );
      }
      if (hold.convertedBookingId || hold.status === "CONVERTED") {
        return {
          holdId: hold.id,
          bookingId: hold.convertedBookingId,
          status: "CONVERTED",
          nextAction: "Hold was already converted. Open the existing booking and capture room.",
        };
      }
      if (hold.status === "CANCELED") throw new Error("Released holds cannot be converted. Create a fresh hold or booking.");
      if (hold.status === "EXPIRED" || new Date(hold.expiresAt).getTime() < Date.now()) {
        throw new Error("Expired holds cannot be converted. Refresh the slot before promising the session.");
      }

      const clientEmail = text(hold.contactEmail || hold.clientUser?.primaryEmail).toLowerCase();
      if (!clientEmail || !clientEmail.includes("@")) throw new Error("Hold needs a client email before it can become a booking.");

      const client =
        hold.clientUser ||
        (await ensureInvitedStudioUserByEmail({
          email: clientEmail,
          prisma: tx,
        }));
      const offering = hold.offering || null;
      const coachUserId = session.user.isStaff
        ? text(body.coachUserId) || assignedCoachUserId || session.user.id
        : session.user.id;
      await assertCoachingScheduleAvailable({
        tx,
        coachUserId,
        scheduledStart: hold.scheduledStart,
        scheduledEnd: hold.scheduledEnd,
        excludeHoldId: hold.id,
      });
      const title = text(body.title) || offering?.title || "Quipsly coaching session";
      const paymentPolicy = text(body.paymentPolicy) || offering?.paymentPolicy || "MANUAL";
      const amountCents = integer(body.amountCents) ?? offering?.priceCents ?? null;
      const purpose = normalizePurpose(body.purpose || offering?.kind);
      if (purpose !== "COACHING" && text(body.engagementId)) {
        throw new RunwayActionError("Only coaching Sessions can join a Coaching Engagement.", 409);
      }
      const engagement = purpose === "COACHING" ? await ensureCoachingEngagement({
        prisma: tx,
        projectId: coachingProject.id,
        actorUserId: session.user.id,
        clientUserId: client.id,
        coachUserId,
        clientLabel: client.name || client.primaryEmail,
        requestedEngagementId: text(body.engagementId) || null,
      }) : null;

      const appointment = await tx.appointment.create({
        data: {
          clientUserId: client.id,
          coachUserId,
          createdByUserId: session.user.id,
          updatedByUserId: session.user.id,
          scheduledStart: hold.scheduledStart,
          scheduledEnd: hold.scheduledEnd,
          timezone: hold.timezone,
          status: "SCHEDULED",
          locationType: "VIDEO",
          locationDetails: "Quipsly capture room planned from a converted hold. External calendar/provider receipt not created yet.",
          notes,
        },
      });

      const paymentRecord =
        paymentPolicy === "PAID_ONE_TO_ONE" && typeof amountCents === "number" && amountCents > 0
          ? await tx.paymentRecord.create({
              data: {
                userId: client.id,
                provider: "stripe",
                status: "PENDING",
                amountCents,
                currency: offering?.currency || text(body.currency) || "USD",
                description: title,
                metadataJson: {
                  source: "quipsly-coaching-runway",
                  convertedFromHoldId: hold.id,
                  externalCheckoutCreated: false,
                  note: "Pending Quipsly payment record only. Stripe checkout evidence has not been created.",
                },
              },
            })
          : null;

      const booking = await tx.coachingBooking.create({
        data: {
          appointmentId: appointment.id,
          offeringId: offering?.id || null,
          clientUserId: client.id,
          coachUserId,
          engagementId: engagement?.id || null,
          status: paymentRecord ? "HOLDING_PAYMENT" : "CONFIRMED",
          scheduledStart: hold.scheduledStart,
          scheduledEnd: hold.scheduledEnd,
          timezone: hold.timezone,
          paymentPolicy,
          paymentRecordId: paymentRecord?.id || null,
          notes,
          metadataJson: {
            source: "quipsly-coaching-runway",
            convertedFromHoldId: hold.id,
            createdByUserId: session.user.id,
            externalCalendarCreated: false,
            externalInviteSent: false,
            stripeCheckoutCreated: false,
          },
        },
      });

      const providerBinding = newCoachingProviderBinding();
      const room = await tx.callRoom.create({
        data: {
          bookingId: booking.id,
          createdByUserId: session.user.id,
          projectId: coachingProject.id,
          coachingEngagementId: engagement?.id || null,
          purpose,
          status: "PLANNED",
          ...providerBinding,
          title,
          scheduledStart: hold.scheduledStart,
          scheduledEnd: hold.scheduledEnd,
          nestSlug: coachingProject.slug,
          projectSlug: coachingProject.slug,
          recordingPolicyJson: {
            source: "quipsly-coaching-runway",
            requiresExplicitConsent: true,
            visibleRecordingIndicatorRequired: true,
          },
          transcriptPolicyJson: {
            source: "quipsly-coaching-runway",
            queueAfterVerifiedUpload: true,
          },
          metadataJson: {
            source: "quipsly-coaching-runway",
            convertedFromHoldId: hold.id,
            createdByUserId: session.user.id,
            externalProviderRoomCreated: false,
          },
        },
      });

      const coachParticipant = await tx.callParticipant.create({
        data: {
          roomId: room.id,
          userId: coachUserId,
          role: "COACH",
          displayName: session.user.id === coachUserId ? session.user.name || session.user.primaryEmail : "Coach",
          email: session.user.id === coachUserId ? session.user.primaryEmail : null,
          deviceLabel: "Quipsly capture room",
        },
      });

      const clientParticipant = await tx.callParticipant.create({
        data: {
          roomId: room.id,
          userId: client.id,
          role: "CLIENT",
          displayName: client.name || client.primaryEmail,
          email: client.primaryEmail,
          deviceLabel: "Quipsly capture room",
        },
      });

      await tx.recordingConsent.createMany({
        data: [
          {
            roomId: room.id,
            participantId: coachParticipant.id,
            userId: coachUserId,
            status: "REQUESTED",
            consentText: consentText(),
            metadataJson: { source: "quipsly-coaching-runway", convertedFromHoldId: hold.id },
          },
          {
            roomId: room.id,
            participantId: clientParticipant.id,
            userId: client.id,
            status: "REQUESTED",
            consentText: consentText(),
            metadataJson: { source: "quipsly-coaching-runway", convertedFromHoldId: hold.id },
          },
        ],
      });

      await tx.calendarEventLink.create({
        data: {
          bookingId: booking.id,
          roomId: room.id,
          provider: "google",
          status: "planned",
          title,
          scheduledStart: hold.scheduledStart,
          scheduledEnd: hold.scheduledEnd,
          timezone: hold.timezone,
          rawJson: {
            source: "quipsly-coaching-runway",
            convertedFromHoldId: hold.id,
            externalCalendarCreated: false,
          },
        },
      });

      await tx.bookingHold.update({
        where: { id: hold.id },
        data: {
          status: "CONVERTED",
          convertedBookingId: booking.id,
          metadataJson: {
            ...sourceJson(hold.metadataJson),
            convertedAt: new Date().toISOString(),
            convertedByUserId: session.user.id,
            convertedBookingId: booking.id,
            convertedCallRoomId: room.id,
          },
        },
      });

      return {
        holdId: hold.id,
        appointmentId: appointment.id,
        bookingId: booking.id,
        callRoomId: room.id,
        engagementId: engagement?.id || null,
        ...coachingClientEntryPaths({ roomId: room.id, engagementId: engagement?.id }),
        clientUserId: client.id,
        paymentRecordId: paymentRecord?.id || null,
        status: booking.status,
        nextAction: paymentRecord
          ? "Hold converted to booking and room. Prepare Stripe test checkout evidence before confirming payment."
          : "Session ready. Open it in this browser or Quipsly Capture, then join and record when everyone is ready.",
      };
    });

      return NextResponse.json({
        ok: true,
        action,
        result,
      });
    } catch (error) {
      return runwayActionErrorResponse(error);
    }
  }

  const clientEmail = text(body.clientEmail).toLowerCase();
  const clientName = text(body.clientName) || null;
  const title = text(body.title) || "Quipsly coaching session";
  const offeringId = text(body.offeringId) || null;
  const timezone = text(body.timezone) || getCoachingDefaultTimezone();
  const scheduledStart = parseCoachingScheduleDate(body.scheduledStart, timezone);
  const requestedDuration = integer(body.durationMinutes);
  const requestedAmountCents = integer(body.amountCents);
  const projectSlug = text(body.projectSlug) || null;
  const notes = text(body.notes) || null;

  if (!clientEmail || !clientEmail.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "Client email is required before creating a coaching session." },
      { status: 400 },
    );
  }

  if (!scheduledStart) {
    return NextResponse.json(
      { ok: false, error: "A valid scheduled start time is required before creating a coaching session." },
      { status: 400 },
    );
  }

  if (action === "create-booking-hold") {
    try {
      const result = await prisma.$transaction(async (tx: any) => {
      const offering = offeringId
        ? await tx.serviceOffering.findUnique({
            where: { id: offeringId },
            include: { coachProfile: true },
          })
        : null;

      if (offeringId && !offering) {
        throw new Error("Selected service offering was not found.");
      }

      const durationMinutes = requestedDuration || offering?.durationMinutes || 60;
      const scheduledEnd = parseCoachingScheduleDate(body.scheduledEnd, timezone) || addMinutes(scheduledStart, durationMinutes);
      const client = await ensureInvitedStudioUserByEmail({
        email: clientEmail,
        name: clientName,
        prisma: tx,
      });
      const coachProfile =
        offering?.coachProfile ||
        (await tx.coachProfile.findFirst({
          where: { userId: text(body.coachUserId) || session.user.id },
          orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
        }));
      if (!coachProfile?.userId) {
        throw new RunwayActionError("Choose a coach before holding this time.", 409);
      }
      await assertCoachingScheduleAvailable({
        tx,
        coachUserId: coachProfile.userId,
        scheduledStart,
        scheduledEnd,
      });
      const expiresMinutes = integer(body.expiresMinutes) || 48 * 60;
      const expiresAt = addMinutes(new Date(), expiresMinutes);

      const hold = await tx.bookingHold.create({
        data: {
          offeringId: offering?.id || null,
          coachProfileId: coachProfile?.id || null,
          clientUserId: client.id,
          contactEmail: client.primaryEmail || clientEmail,
          scheduledStart,
          scheduledEnd,
          timezone,
          status: "ACTIVE",
          expiresAt,
          metadataJson: {
            source: "quipsly-coaching-runway",
            createdByUserId: session.user.id,
            externalCalendarCreated: false,
            externalInviteSent: false,
            stripeCheckoutCreated: false,
            notes,
          },
        },
      });

      return {
        holdId: hold.id,
        clientUserId: client.id,
        status: hold.status,
        scheduledStart: hold.scheduledStart,
        scheduledEnd: hold.scheduledEnd,
        expiresAt: hold.expiresAt,
        nextAction: "Hold created. Convert to a booking only when the human confirms the session.",
      };
      });

      return NextResponse.json({
        ok: true,
        action,
        result,
      });
    } catch (error) {
      return runwayActionErrorResponse(error);
    }
  }

  let coachingProject;
  try {
    coachingProject = await resolveCoachingProject({
      prisma,
      requestedProjectSlug: projectSlug,
      actorEmail: text(session.user.primaryEmail || session.user.email).toLowerCase(),
    });
  } catch (error) {
    return runwayActionErrorResponse(error);
  }

  if (action === "create-booking-series") {
    try {
      if (normalizePurpose(body.purpose) !== "COACHING") {
        throw new RunwayActionError(
          "Recurring Session series are currently available for coaching relationships.",
          409,
        );
      }
      const requestId = text(body.requestId);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        throw new CoachingBookingSeriesInputError(
          "A stable Session-series request identity is required. Refresh and try again.",
        );
      }
      const durationMinutes = requestedDuration || 60;
      if (durationMinutes < 15 || durationMinutes > 480) {
        throw new CoachingBookingSeriesInputError(
          "A Session series duration must be between 15 minutes and 8 hours.",
        );
      }
      const intent = normalizeCoachingBookingSeriesIntent({
        frequency: body.frequency,
        intervalCount: body.intervalCount,
        occurrenceCount: body.occurrenceCount,
      });
      const result = await prisma.$transaction(
        (tx: any) => createCoachingBookingSeriesInTransaction(tx, {
          requestId,
          actor: {
            id: session.user.id,
            name: session.user.name,
            primaryEmail: session.user.primaryEmail,
            isStaff: session.user.isStaff,
          },
          project: coachingProject,
          clientEmail,
          clientName,
          title,
          offeringId,
          timezone,
          firstScheduledStart: scheduledStart,
          durationMinutes,
          paymentPolicy: text(body.paymentPolicy) || "MANUAL",
          amountCents: requestedAmountCents,
          currency: text(body.currency) || "USD",
          notes,
          requestedEngagementId: text(body.engagementId) || null,
          requestedCoachUserId: text(body.coachUserId) || null,
          intent,
        }),
        { timeout: 30_000 },
      );
      return NextResponse.json({
        ok: true,
        action,
        result: {
          ...result,
          ...(result.firstOccurrence || {}),
        },
      });
    } catch (error) {
      return runwayActionErrorResponse(error);
    }
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
    const offering = offeringId
      ? await tx.serviceOffering.findUnique({
          where: { id: offeringId },
          include: { coachProfile: true },
        })
      : null;

    if (offeringId && !offering) {
      throw new Error("Selected service offering was not found.");
    }

    const durationMinutes = requestedDuration || offering?.durationMinutes || 60;
    const scheduledEnd = parseCoachingScheduleDate(body.scheduledEnd, timezone) || addMinutes(scheduledStart, durationMinutes);
    const paymentPolicy = text(body.paymentPolicy) || offering?.paymentPolicy || "MANUAL";
    const amountCents = requestedAmountCents ?? offering?.priceCents ?? null;
    const coachUserId = text(body.coachUserId) || offering?.coachProfile?.userId || session.user.id;
    await assertCoachingScheduleAvailable({
      tx,
      coachUserId,
      scheduledStart,
      scheduledEnd,
    });
    const purpose = normalizePurpose(body.purpose || offering?.kind);
    const client = await ensureInvitedStudioUserByEmail({
      email: clientEmail,
      name: clientName,
      prisma: tx,
    });
    if (purpose !== "COACHING" && text(body.engagementId)) {
      throw new RunwayActionError("Only coaching Sessions can join a Coaching Engagement.", 409);
    }
    const engagement = purpose === "COACHING" ? await ensureCoachingEngagement({
      prisma: tx,
      projectId: coachingProject.id,
      actorUserId: session.user.id,
      clientUserId: client.id,
      coachUserId,
      clientLabel: client.name || client.primaryEmail,
      requestedEngagementId: text(body.engagementId) || null,
    }) : null;

    const appointment = await tx.appointment.create({
      data: {
        clientUserId: client.id,
        coachUserId,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id,
        scheduledStart,
        scheduledEnd,
        timezone,
        status: "SCHEDULED",
        locationType: "VIDEO",
        locationDetails: "Quipsly capture room planned. External calendar/provider receipt not created yet.",
        notes,
      },
    });

    const paymentRecord =
      paymentPolicy === "PAID_ONE_TO_ONE" && typeof amountCents === "number" && amountCents > 0
        ? await tx.paymentRecord.create({
            data: {
              userId: client.id,
              provider: "stripe",
              status: "PENDING",
              amountCents,
              currency: offering?.currency || text(body.currency) || "USD",
              description: title,
              metadataJson: {
                source: "quipsly-coaching-runway",
                externalCheckoutCreated: false,
                note: "Pending Quipsly payment record only. Stripe checkout evidence has not been created.",
              },
            },
          })
        : null;

    const booking = await tx.coachingBooking.create({
      data: {
        appointmentId: appointment.id,
        offeringId: offering?.id || null,
        clientUserId: client.id,
        coachUserId,
        engagementId: engagement?.id || null,
        status: paymentRecord ? "HOLDING_PAYMENT" : "CONFIRMED",
        scheduledStart,
        scheduledEnd,
        timezone,
        paymentPolicy,
        paymentRecordId: paymentRecord?.id || null,
        notes,
        metadataJson: {
          source: "quipsly-coaching-runway",
          createdByUserId: session.user.id,
          externalCalendarCreated: false,
          externalInviteSent: false,
          stripeCheckoutCreated: false,
        },
      },
    });

    const providerBinding = newCoachingProviderBinding();
    const room = await tx.callRoom.create({
      data: {
        bookingId: booking.id,
        createdByUserId: session.user.id,
        projectId: coachingProject.id,
        coachingEngagementId: engagement?.id || null,
        purpose,
        status: "PLANNED",
        ...providerBinding,
        title,
        scheduledStart,
        scheduledEnd,
        nestSlug: coachingProject.slug,
        projectSlug: coachingProject.slug,
        recordingPolicyJson: {
          source: "quipsly-coaching-runway",
          requiresExplicitConsent: true,
          visibleRecordingIndicatorRequired: true,
        },
        transcriptPolicyJson: {
          source: "quipsly-coaching-runway",
          queueAfterVerifiedUpload: true,
        },
        metadataJson: {
          source: "quipsly-coaching-runway",
          createdByUserId: session.user.id,
          externalProviderRoomCreated: false,
        },
      },
    });

    const coachParticipant = await tx.callParticipant.create({
      data: {
        roomId: room.id,
        userId: coachUserId,
        role: "COACH",
        displayName: session.user.id === coachUserId ? session.user.name || session.user.primaryEmail : "Coach",
        email: session.user.id === coachUserId ? session.user.primaryEmail : null,
        deviceLabel: "Quipsly capture room",
      },
    });

    const clientParticipant = await tx.callParticipant.create({
      data: {
        roomId: room.id,
        userId: client.id,
        role: "CLIENT",
        displayName: client.name || client.primaryEmail,
        email: client.primaryEmail,
        deviceLabel: "Quipsly capture room",
      },
    });

    await tx.recordingConsent.createMany({
      data: [
        {
          roomId: room.id,
          participantId: coachParticipant.id,
          userId: coachUserId,
          status: "REQUESTED",
          consentText: consentText(),
          metadataJson: { source: "quipsly-coaching-runway" },
        },
        {
          roomId: room.id,
          participantId: clientParticipant.id,
          userId: client.id,
          status: "REQUESTED",
          consentText: consentText(),
          metadataJson: { source: "quipsly-coaching-runway" },
        },
      ],
    });

    await tx.calendarEventLink.create({
      data: {
        bookingId: booking.id,
        roomId: room.id,
        provider: "google",
        status: "planned",
        title,
        scheduledStart,
        scheduledEnd,
        timezone,
        rawJson: {
          source: "quipsly-coaching-runway",
          externalCalendarCreated: false,
        },
      },
    });

    return {
      appointmentId: appointment.id,
      bookingId: booking.id,
      callRoomId: room.id,
      engagementId: engagement?.id || null,
      ...coachingClientEntryPaths({ roomId: room.id, engagementId: engagement?.id }),
      clientUserId: client.id,
      paymentRecordId: paymentRecord?.id || null,
      status: booking.status,
      nextAction: paymentRecord
        ? "Booking and room created. Prepare Stripe test checkout evidence before confirming payment."
        : "Session ready. Open it in this browser or Quipsly Capture, then join and record when everyone is ready.",
    };
  });

    return NextResponse.json({
      ok: true,
      action,
      result,
    });
  } catch (error) {
    return runwayActionErrorResponse(error);
  }
}
