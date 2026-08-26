export const QUIPSLY_COACHING_LIFECYCLE_KIND = "quipsly-coaching-capture-lifecycle-v2" as const;

export type QuipslyCoachingLifecycleStage =
  | "booking-needed"
  | "payment-needed"
  | "room-needed"
  | "participants-needed"
  | "consent-needed"
  | "capture-route-needed"
  | "ready-to-capture"
  | "recording-needed"
  | "transcription-needed"
  | "packet-needed"
  | "review-ready";

export type QuipslyCoachingLifecycleCheckStatus =
  | "present"
  | "missing"
  | "not-required"
  | "attention";

export type QuipslyCoachingLifecycleCheckId =
  | "booking"
  | "payment"
  | "calendar-receipt"
  | "room"
  | "participants"
  | "consent"
  | "capture-route"
  | "recording"
  | "server-recording"
  | "transcript"
  | "packet"
  | "publication-receipt";

export interface QuipslyCoachingLifecycleCheck {
  readonly id: QuipslyCoachingLifecycleCheckId;
  readonly label: string;
  readonly status: QuipslyCoachingLifecycleCheckStatus;
  readonly meaning: string;
}

export type QuipslyCoachingLifecycleSafeActionId =
  | "create-booking"
  | "resolve-payment-evidence"
  | "prepare-capture-room"
  | "attach-participants"
  | "confirm-recording-consent"
  | "prepare-capture-route"
  | "record-with-visible-state"
  | "verify-recording-storage"
  | "run-or-repair-transcript"
  | "build-review-packet"
  | "review-packet";

export type QuipslyCoachingLifecycleSafeActionRisk = "low" | "medium" | "human-approval-required";

export interface QuipslyCoachingLifecycleSafeAction {
  readonly id: QuipslyCoachingLifecycleSafeActionId;
  readonly label: string;
  readonly enabled: boolean;
  readonly risk: QuipslyCoachingLifecycleSafeActionRisk;
  readonly why: string;
  readonly boundary: string;
}

export interface QuipslyCoachingLifecycle {
  readonly kind: typeof QUIPSLY_COACHING_LIFECYCLE_KIND;
  readonly stage: QuipslyCoachingLifecycleStage;
  readonly readyForCapture: boolean;
  readonly readyForTranscript: boolean;
  readonly readyForPacket: boolean;
  readonly readyForReview: boolean;
  readonly participantCount: number;
  readonly requiredParticipantCount: number;
  readonly checks: readonly QuipslyCoachingLifecycleCheck[];
  readonly safeActions: readonly QuipslyCoachingLifecycleSafeAction[];
  readonly nextAction: string;
}

export interface BuildQuipslyCoachingLifecycleInput {
  readonly bookingExists?: boolean;
  readonly paymentRequired?: boolean;
  readonly paymentResolved?: boolean;
  readonly calendarReceiptExists?: boolean;
  readonly roomExists?: boolean;
  readonly participantsAttached?: boolean;
  readonly participantCount?: number;
  readonly requiredParticipantCount?: number;
  readonly consentGranted?: boolean;
  readonly providerReady?: boolean;
  readonly localFallbackReady?: boolean;
  readonly recordingExists?: boolean;
  readonly serverRecordingVerified?: boolean;
  readonly transcriptExists?: boolean;
  readonly transcriptCompleted?: boolean;
  readonly packetExists?: boolean;
  readonly publicationReceiptExists?: boolean;
  readonly nextAction?: string | null;
}

function check(
  id: QuipslyCoachingLifecycleCheckId,
  label: string,
  status: QuipslyCoachingLifecycleCheckStatus,
  meaning: string,
): QuipslyCoachingLifecycleCheck {
  return { id, label, status, meaning };
}

function safeAction(
  id: QuipslyCoachingLifecycleSafeActionId,
  label: string,
  enabled: boolean,
  risk: QuipslyCoachingLifecycleSafeActionRisk,
  why: string,
  boundary: string,
): QuipslyCoachingLifecycleSafeAction {
  return { id, label, enabled, risk, why, boundary };
}

export function buildQuipslyCoachingLifecycle(
  input: BuildQuipslyCoachingLifecycleInput,
): QuipslyCoachingLifecycle {
  const bookingExists = input.bookingExists === true;
  const paymentRequired = input.paymentRequired === true;
  const paymentResolved = !paymentRequired || input.paymentResolved === true;
  const roomExists = input.roomExists === true;
  const participantCount = Number.isFinite(input.participantCount)
    ? Math.max(0, Math.floor(input.participantCount ?? 0))
    : input.participantsAttached === true
      ? 1
      : 0;
  const requiredParticipantCount = Number.isFinite(input.requiredParticipantCount)
    ? Math.max(1, Math.floor(input.requiredParticipantCount ?? 1))
    : 1;
  const participantsAttached =
    input.participantsAttached === true &&
    participantCount >= requiredParticipantCount;
  const consentGranted = input.consentGranted === true;
  const captureRouteReady = input.providerReady === true || input.localFallbackReady === true;
  const recordingExists = input.recordingExists === true;
  const serverRecordingVerified = input.serverRecordingVerified === true;
  const transcriptExists = input.transcriptExists === true;
  const transcriptCompleted = input.transcriptCompleted === true;
  const packetExists = input.packetExists === true;
  const calendarReceiptExists = input.calendarReceiptExists === true;
  const publicationReceiptExists = input.publicationReceiptExists === true;

  let stage: QuipslyCoachingLifecycleStage = "review-ready";
  if (!bookingExists) stage = "booking-needed";
  else if (!paymentResolved) stage = "payment-needed";
  else if (!roomExists) stage = "room-needed";
  else if (!participantsAttached) stage = "participants-needed";
  else if (!consentGranted) stage = "consent-needed";
  else if (!captureRouteReady && !recordingExists) stage = "capture-route-needed";
  else if (!recordingExists) stage = "ready-to-capture";
  else if (!serverRecordingVerified) stage = "recording-needed";
  else if (!transcriptCompleted) stage = "transcription-needed";
  else if (!packetExists) stage = "packet-needed";

  const participantAndConsentBoundary = participantsAttached && consentGranted;
  const readyForCapture = bookingExists && paymentResolved && roomExists && participantAndConsentBoundary && captureRouteReady;
  const readyForTranscript = participantAndConsentBoundary && recordingExists && serverRecordingVerified && !transcriptCompleted;
  const readyForPacket = participantAndConsentBoundary && transcriptCompleted && !packetExists;
  const readyForReview = participantAndConsentBoundary && packetExists;

  return {
    kind: QUIPSLY_COACHING_LIFECYCLE_KIND,
    stage,
    readyForCapture,
    readyForTranscript,
    readyForPacket,
    readyForReview,
    participantCount,
    requiredParticipantCount,
    checks: [
      check(
        "booking",
        "Booking record",
        bookingExists ? "present" : "missing",
        bookingExists
          ? "Quipsly has an app-owned booking or session anchor."
          : "Create or attach an app-owned booking before treating this as scheduled work.",
      ),
      check(
        "payment",
        "Payment evidence",
        paymentRequired ? (paymentResolved ? "present" : "attention") : "not-required",
        paymentRequired
          ? paymentResolved
            ? "A required payment has provider-backed evidence."
            : "Payment is required and still needs provider-backed evidence."
          : "This session does not require payment evidence before capture.",
      ),
      check(
        "calendar-receipt",
        "Calendar receipt",
        calendarReceiptExists ? "present" : "missing",
        calendarReceiptExists
          ? "A calendar provider receipt is attached."
          : "No external calendar receipt is attached yet. This is a visibility gap, not proof the session is invalid.",
      ),
      check(
        "room",
        "Capture room",
        roomExists ? "present" : "missing",
        roomExists
          ? "A Quipsly capture room exists."
          : "Prepare a capture room before recording.",
      ),
      check(
        "participants",
        "Participants",
        participantsAttached ? "present" : "missing",
        participantsAttached
          ? "The session has participant records."
          : `${participantCount}/${requiredParticipantCount} required participant records are attached. Attach everyone so consent, recordings, and transcripts have clear owners.`,
      ),
      check(
        "consent",
        "Recording consent",
        consentGranted ? "present" : "attention",
        consentGranted
          ? "Recording consent is granted for the current participant/session state."
          : "Confirm explicit consent before recording.",
      ),
      check(
        "capture-route",
        "Capture route",
        captureRouteReady ? "present" : "missing",
        captureRouteReady
          ? "Either the provider room or local fallback path is ready."
          : "Prepare a provider room or local fallback before capture.",
      ),
      check(
        "recording",
        "Recording file",
        recordingExists ? "present" : "missing",
        recordingExists
          ? "A recording asset is attached."
          : "Record the session before transcription or packet building.",
      ),
      check(
        "server-recording",
        "Server recording receipt",
        serverRecordingVerified ? "present" : recordingExists ? "attention" : "missing",
        serverRecordingVerified
          ? "The recording has durable server-side evidence."
          : recordingExists
            ? "A recording exists, but durable server verification still needs attention."
            : "No recording receipt exists yet.",
      ),
      check(
        "transcript",
        "Transcript",
        transcriptCompleted ? "present" : transcriptExists ? "attention" : "missing",
        transcriptCompleted
          ? "Transcript evidence is complete."
          : transcriptExists
            ? "A transcript job exists and still needs completion or repair."
            : "No transcript job exists yet.",
      ),
      check(
        "packet",
        "Review packet",
        packetExists ? "present" : transcriptCompleted ? "missing" : "not-required",
        packetExists
          ? "A human-reviewable coaching packet exists."
          : transcriptCompleted
            ? "Transcript is ready; build the review packet next."
            : "Packet creation waits on transcript evidence.",
      ),
      check(
        "publication-receipt",
        "Publication receipt",
        publicationReceiptExists ? "present" : "not-required",
        publicationReceiptExists
          ? "An external publication or delivery receipt is attached."
          : "No external publication receipt is expected at this lifecycle step.",
      ),
    ],
    safeActions: [
      safeAction(
        "create-booking",
        "Create booking/session anchor",
        !bookingExists,
        "low",
        bookingExists
          ? "Quipsly already has the booking/session anchor for this lifecycle."
          : "The session needs an app-owned anchor before payment, consent, recording, transcript, or packet work can be trusted.",
        "Creates Quipsly-owned state only. It must not charge money, send invites, start recording, or publish anything.",
      ),
      safeAction(
        "resolve-payment-evidence",
        "Resolve payment evidence",
        bookingExists && paymentRequired && !paymentResolved,
        "human-approval-required",
        paymentRequired
          ? paymentResolved
            ? "Required payment evidence is already resolved."
            : "This paid one-to-one session needs provider-backed payment evidence before capture."
          : "This lifecycle does not require payment evidence before capture.",
        "Stripe remains an evidence provider. This action must not create a real charge without explicit approval.",
      ),
      safeAction(
        "prepare-capture-room",
        "Prepare capture room",
        bookingExists && paymentResolved && !roomExists,
        "low",
        roomExists
          ? "A Quipsly capture room already exists."
          : "A capture room is needed before participants, consent, and recording can be coordinated.",
        "Creates Quipsly-owned room state only. Joining a provider room and recording are separate visible actions.",
      ),
      safeAction(
        "attach-participants",
        "Attach participants",
        bookingExists && roomExists && !participantsAttached,
        "low",
        participantsAttached
          ? "Participant records are attached."
          : "Participants need records so consent, local recordings, transcript segments, and follow-up items have clear owners.",
        "Attaches app-owned participant state only. It must not invite, message, or record anyone by itself.",
      ),
      safeAction(
        "confirm-recording-consent",
        "Confirm recording consent",
        bookingExists && roomExists && participantsAttached && !consentGranted,
        "human-approval-required",
        consentGranted
          ? "Explicit recording consent is already present for this lifecycle."
          : "Recording consent is required before provider or local capture should begin.",
        "Consent must be visible and participant-aware. It must not start recording.",
      ),
      safeAction(
        "prepare-capture-route",
        "Prepare provider or local capture route",
        bookingExists && paymentResolved && roomExists && participantsAttached && consentGranted && !captureRouteReady && !recordingExists,
        "medium",
        captureRouteReady
          ? "A provider room or local fallback is ready."
          : "The session still needs a provider room or local fallback path before capture.",
        "Preparing a route is not recording. Provider recording must still require a visible start control and receipt.",
      ),
      safeAction(
        "record-with-visible-state",
        "Record with visible state",
        readyForCapture && !recordingExists,
        "human-approval-required",
        readyForCapture
          ? "Booking, payment boundary, room, consent, and capture route are ready for a visible recording action."
          : "Recording is not safe yet because one or more required lifecycle checks are incomplete.",
        "Recording must be visible, consent-backed, and source-safe. Local files remain source truth until server verification.",
      ),
      safeAction(
        "verify-recording-storage",
        "Verify recording storage",
        recordingExists && !serverRecordingVerified,
        "medium",
        recordingExists
          ? serverRecordingVerified
            ? "Recording storage is already verified."
            : "A recording exists but still needs durable server-side evidence before transcription."
          : "No recording exists yet.",
        "Verification attaches storage evidence. It must not delete local originals silently.",
      ),
      safeAction(
        "run-or-repair-transcript",
        "Run or repair transcript",
        readyForTranscript,
        "medium",
        readyForTranscript
          ? "Verified recording evidence is ready for transcription or transcript repair."
          : transcriptCompleted
            ? "Transcript evidence is already complete."
            : "Transcription waits on verified recording evidence.",
        "Creates or repairs transcript evidence. It must preserve recording truth and keep transcript state inspectable.",
      ),
      safeAction(
        "build-review-packet",
        "Build review packet",
        readyForPacket,
        "medium",
        readyForPacket
          ? "Completed transcript evidence is ready to become notes, highlights, and action items."
          : packetExists
            ? "A review packet already exists."
            : "Packet building waits on completed transcript evidence.",
        "Creates reviewable Quipsly packet artifacts only. It must not send, publish, or claim delivery.",
      ),
      safeAction(
        "review-packet",
        "Review packet",
        readyForReview,
        "human-approval-required",
        readyForReview
          ? "A packet exists and is ready for human review or approved next actions."
          : "Review waits on packet evidence.",
        "Review can approve, refine, or route next work. External delivery still needs explicit approval and receipts.",
      ),
    ],
    nextAction:
      isHardLifecycleGate(stage)
        ? defaultNextActionForStage(stage)
        : input.nextAction?.trim() || defaultNextActionForStage(stage),
  };
}

function isHardLifecycleGate(stage: QuipslyCoachingLifecycleStage) {
  return [
    "booking-needed",
    "payment-needed",
    "room-needed",
    "participants-needed",
    "consent-needed",
    "capture-route-needed",
  ].includes(stage);
}

function defaultNextActionForStage(stage: QuipslyCoachingLifecycleStage) {
  switch (stage) {
    case "booking-needed":
      return "Create or attach a Quipsly booking/session record.";
    case "payment-needed":
      return "Collect provider-backed payment evidence or change the payment policy intentionally.";
    case "room-needed":
      return "Prepare the Quipsly capture room.";
    case "participants-needed":
      return "Attach the Session participants before consent or capture.";
    case "consent-needed":
      return "Confirm explicit recording consent before capture.";
    case "capture-route-needed":
      return "Prepare a provider room or local capture fallback.";
    case "ready-to-capture":
      return "Record the session with consent and visible recording state.";
    case "recording-needed":
      return "Verify durable server storage for the recording before transcription.";
    case "transcription-needed":
      return "Run or repair transcription.";
    case "packet-needed":
      return "Build the review packet from the completed transcript.";
    case "review-ready":
      return "Review the packet and choose the next human-approved action.";
  }
}
