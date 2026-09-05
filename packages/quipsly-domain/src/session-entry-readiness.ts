export const QUIPSLY_SESSION_ENTRY_READINESS_KIND =
  "quipsly-session-entry-readiness-v1" as const;

export const QUIPSLY_SESSION_ENTRY_READINESS_VERSION = 1 as const;

export type QuipslySessionEntryStage =
  | "room-closed"
  | "accept-invitation"
  | "payment-hold"
  | "confirm-consent"
  | "join-call"
  | "wait-for-participants"
  | "prepare-local-capture"
  | "provider-setup";

export type QuipslySessionEntryActionId =
  | "none"
  | "accept-invitation"
  | "resolve-payment"
  | "confirm-consent"
  | "join-call"
  | "wait-for-participants"
  | "open-recorder"
  | "prepare-provider";

export interface BuildQuipslySessionEntryReadinessInput {
  readonly roomStatus?: string | null;
  readonly purpose?: string | null;
  readonly actorAttached: boolean;
  readonly actorAudioConsentGranted: boolean;
  readonly actorVideoConsentGranted?: boolean | null;
  readonly actorTranscriptionConsentGranted?: boolean | null;
  readonly participantCount: number;
  readonly requiredParticipantCount?: number | null;
  readonly audioConsentGrantedParticipantCount: number;
  readonly videoConsentGrantedParticipantCount?: number | null;
  readonly transcriptionConsentGrantedParticipantCount?: number | null;
  readonly allParticipantAudioConsentGranted: boolean;
  readonly allParticipantVideoConsentGranted?: boolean | null;
  readonly allParticipantTranscriptionConsentGranted?: boolean | null;
  readonly providerCanJoin: boolean;
  readonly providerReadiness?: string | null;
  readonly localCaptureAvailable?: boolean | null;
  readonly paymentBlocked?: boolean | null;
}

export interface QuipslySessionEntryReadiness {
  readonly kind: typeof QUIPSLY_SESSION_ENTRY_READINESS_KIND;
  readonly version: typeof QUIPSLY_SESSION_ENTRY_READINESS_VERSION;
  readonly stage: QuipslySessionEntryStage;
  readonly label: string;
  readonly detail: string;
  readonly primaryAction: {
    readonly id: QuipslySessionEntryActionId;
    readonly label: string;
    readonly detail: string;
  };
  readonly permissions: {
    readonly canJoinCall: boolean;
    readonly canOpenLocalRecorder: boolean;
    readonly canStartAudioRecording: boolean;
    readonly canStartVideoRecording: boolean;
    readonly canTranscribe: boolean;
  };
  readonly participantProgress: {
    readonly attached: number;
    readonly required: number;
    readonly complete: boolean;
  };
  readonly consentProgress: {
    readonly actorAudioReady: boolean;
    readonly actorVideoReady: boolean;
    readonly actorTranscriptionReady: boolean;
    readonly audioGranted: number;
    readonly videoGranted: number;
    readonly transcriptionGranted: number;
    readonly required: number;
    readonly allAudioReady: boolean;
    readonly allVideoReady: boolean;
    readonly allTranscriptionReady: boolean;
  };
  readonly blockers: readonly (
    | "room-closed"
    | "actor-not-attached"
    | "payment-hold"
    | "actor-consent-needed"
    | "participants-needed"
    | "participant-audio-consent-needed"
    | "participant-video-consent-needed"
    | "participant-transcription-consent-needed"
    | "provider-not-ready"
  )[];
  readonly assurances: {
    readonly joiningStartsRecording: false;
    readonly recordingRequiresVisibleAction: true;
    readonly savedSessionConsentIsReused: true;
    readonly devicePermissionRequestedOnRelevantAction: true;
    readonly soundCheckOptional: true;
    readonly joinAndRecordingReadinessAreSeparate: true;
  };
}

function normalizedCount(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0;
}

function requiredParticipantCount(input: BuildQuipslySessionEntryReadinessInput) {
  const explicit = normalizedCount(input.requiredParticipantCount);
  if (explicit > 0) return explicit;
  return String(input.purpose || "").trim().toUpperCase() === "COACHING" ? 2 : 1;
}

function isRoomOpen(value: string | null | undefined) {
  return ["PLANNED", "OPEN", "RECORDING"].includes(
    String(value || "PLANNED").trim().toUpperCase(),
  );
}

/**
 * Canonical, side-effect-free projection for the ordinary Session lobby.
 *
 * This deliberately keeps four facts separate:
 * - a signed-in person may be allowed to join a call;
 * - that person may have saved their own durable Session consent;
 * - every required participant may (or may not) be ready for retained media;
 * - a particular device still owns its just-in-time OS permission and signal checks.
 *
 * UI surfaces should lead with primaryAction. Detailed counts and blockers are
 * support evidence, not a checklist that every ordinary user must understand.
 */
export function buildQuipslySessionEntryReadiness(
  input: BuildQuipslySessionEntryReadinessInput,
): QuipslySessionEntryReadiness {
  const participants = normalizedCount(input.participantCount);
  const required = requiredParticipantCount(input);
  const participantSetComplete = participants >= required;
  const roomOpen = isRoomOpen(input.roomStatus);
  const paymentBlocked = input.paymentBlocked === true;
  const localCaptureAvailable = input.localCaptureAvailable !== false;
  const actorVideoReady = input.actorVideoConsentGranted === true;
  const actorTranscriptionReady = input.actorTranscriptionConsentGranted === true;
  const allVideoReady = input.allParticipantVideoConsentGranted === true;
  const allTranscriptionReady = input.allParticipantTranscriptionConsentGranted === true;
  const audioGranted = normalizedCount(input.audioConsentGrantedParticipantCount);
  const videoGranted = normalizedCount(input.videoConsentGrantedParticipantCount);
  const transcriptionGranted = normalizedCount(
    input.transcriptionConsentGrantedParticipantCount,
  );
  const canJoinCall = roomOpen
    && input.actorAttached
    && !paymentBlocked
    && input.providerCanJoin;
  const canOpenLocalRecorder = roomOpen
    && input.actorAttached
    && !paymentBlocked
    && localCaptureAvailable;
  const canStartAudioRecording = canOpenLocalRecorder
    && participantSetComplete
    && input.actorAudioConsentGranted
    && input.allParticipantAudioConsentGranted;
  const canStartVideoRecording = canOpenLocalRecorder
    && participantSetComplete
    && actorVideoReady
    && allVideoReady;
  const canTranscribe = canStartAudioRecording && allTranscriptionReady;
  const blockers: QuipslySessionEntryReadiness["blockers"][number][] = [];

  if (!roomOpen) blockers.push("room-closed");
  if (!input.actorAttached) blockers.push("actor-not-attached");
  if (paymentBlocked) blockers.push("payment-hold");
  if (!input.actorAudioConsentGranted) blockers.push("actor-consent-needed");
  if (!participantSetComplete) blockers.push("participants-needed");
  if (!input.allParticipantAudioConsentGranted) {
    blockers.push("participant-audio-consent-needed");
  }
  if (!allVideoReady) blockers.push("participant-video-consent-needed");
  if (!allTranscriptionReady) {
    blockers.push("participant-transcription-consent-needed");
  }
  if (!input.providerCanJoin) blockers.push("provider-not-ready");

  let stage: QuipslySessionEntryStage;
  let label: string;
  let detail: string;
  let primaryAction: QuipslySessionEntryReadiness["primaryAction"];

  if (!roomOpen) {
    stage = "room-closed";
    label = "Session closed";
    detail = "This Session is no longer open for joining or new recording.";
    primaryAction = {
      id: "none",
      label: "Session closed",
      detail: "Review the recording, transcript, notes, and follow-through instead.",
    };
  } else if (!input.actorAttached) {
    stage = "accept-invitation";
    label = "Open your invitation";
    detail = "This signed-in account is not attached to the Session yet.";
    primaryAction = {
      id: "accept-invitation",
      label: "Accept invitation",
      detail: "Use the invitation for this exact account, then continue here.",
    };
  } else if (paymentBlocked) {
    stage = "payment-hold";
    label = "Session needs confirmation";
    detail = "This paid Session is waiting for its booking evidence.";
    primaryAction = {
      id: "resolve-payment",
      label: "Review booking",
      detail: "Resolve the booking before joining or recording.",
    };
  } else if (!input.actorAudioConsentGranted) {
    stage = "confirm-consent";
    label = "Allow recording?";
    detail = "You can join either way. Your choice is remembered for this Session.";
    primaryAction = {
      id: "confirm-consent",
      label: "Allow recording",
      detail: "Nothing starts until the host presses Record.",
    };
  } else if (canJoinCall) {
    stage = "join-call";
    label = participantSetComplete ? "Ready to join" : "Join and wait";
    detail = canStartAudioRecording
      ? "The call is ready. Recording starts only from the visible Record control."
      : "You can join now. Recording stays off until every required participant has joined and saved their choice.";
    primaryAction = {
      id: "join-call",
      label: participantSetComplete ? "Join session" : "Join waiting room",
      detail: "Microphone and camera access are requested only when needed on this device.",
    };
  } else if (!participantSetComplete) {
    stage = "wait-for-participants";
    label = "Waiting for a participant";
    detail = `${participants} of ${required} required participants are attached. Recording stays off.`;
    primaryAction = {
      id: "wait-for-participants",
      label: "Share invitation",
      detail: "Invite the remaining participant. Quipsly will refresh readiness when they arrive.",
    };
  } else if (canStartAudioRecording) {
    stage = "prepare-local-capture";
    label = "Ready to record locally";
    detail = "The call provider is unavailable, but participant consent allows protected local capture.";
    primaryAction = {
      id: "open-recorder",
      label: "Open recorder",
      detail: "The device checks its microphone, camera, and storage when recording is prepared.",
    };
  } else {
    stage = "provider-setup";
    label = "Session setup needed";
    detail = input.allParticipantAudioConsentGranted
      ? "Participant choices are saved, but the live room is not ready."
      : "The live room is not ready and at least one participant still needs to save their choice.";
    primaryAction = {
      id: "prepare-provider",
      label: "Prepare session",
      detail: "Keep local capture available while the live room is prepared.",
    };
  }

  return {
    kind: QUIPSLY_SESSION_ENTRY_READINESS_KIND,
    version: QUIPSLY_SESSION_ENTRY_READINESS_VERSION,
    stage,
    label,
    detail,
    primaryAction,
    permissions: {
      canJoinCall,
      canOpenLocalRecorder,
      canStartAudioRecording,
      canStartVideoRecording,
      canTranscribe,
    },
    participantProgress: {
      attached: participants,
      required,
      complete: participantSetComplete,
    },
    consentProgress: {
      actorAudioReady: input.actorAudioConsentGranted,
      actorVideoReady,
      actorTranscriptionReady,
      audioGranted,
      videoGranted,
      transcriptionGranted,
      required,
      allAudioReady: input.allParticipantAudioConsentGranted,
      allVideoReady,
      allTranscriptionReady,
    },
    blockers,
    assurances: {
      joiningStartsRecording: false,
      recordingRequiresVisibleAction: true,
      savedSessionConsentIsReused: true,
      devicePermissionRequestedOnRelevantAction: true,
      soundCheckOptional: true,
      joinAndRecordingReadinessAreSeparate: true,
    },
  };
}
