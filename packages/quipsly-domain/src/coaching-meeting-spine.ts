export const QUIPSLY_COACHING_MEETING_SPINE_KIND =
  "quipsly-coaching-meeting-spine-v1" as const;

export const QUIPSLY_PROVIDER_RECORDING_RECEIPT_SLOT_KIND =
  "quipsly-provider-recording-receipt-slot-v1" as const;

export type QuipslyMeetingProviderReadiness =
  | "livekit-ready"
  | "livekit-needs-config"
  | "provider-not-configured"
  | "payment-hold"
  | "planned";

export interface BuildQuipslyMeetingJoinSpineInput {
  readonly provider?: string | null;
  readonly providerReadiness: QuipslyMeetingProviderReadiness | string;
  readonly canJoin: boolean;
  readonly callRoomId: string;
  readonly participantId: string;
  readonly recordingConsentId?: string | null;
  readonly recordingConsentStatus: string;
  readonly recordingConsentGranted: boolean;
  readonly nextAction: string;
  readonly serverUrl?: string | null;
  readonly roomName?: string | null;
  readonly participantToken?: string | null;
  readonly tokenIssuedAt?: string | null;
  readonly tokenExpiresAt?: string | null;
  readonly tokenExpiresInSeconds?: number | null;
  readonly tokenSafeClaims?: Record<string, unknown> | null;
  readonly participantCreated?: boolean | null;
}

export interface QuipslyProviderRecordingReceiptSlotManifestInput {
  readonly provider?: string | null;
  readonly providerRoomId?: string | null;
  readonly callRoomId: string;
  readonly captureGroupId: string;
  readonly preparedAt: string;
  readonly preparedByUserId: string;
  readonly reusedExistingSlot?: boolean;
}

function normalizedProvider(provider: string | null | undefined) {
  return provider && provider.trim() ? provider.trim() : "planned";
}

export function buildQuipslyMeetingJoinSpine(input: BuildQuipslyMeetingJoinSpineInput) {
  const provider = normalizedProvider(input.provider);
  const tokenExpiresInSeconds = input.tokenExpiresInSeconds ?? null;
  const tokenIssuedAt = input.tokenIssuedAt ?? null;
  const tokenExpiresAt =
    input.tokenExpiresAt ??
    (typeof tokenExpiresInSeconds === "number"
      ? new Date(Date.now() + tokenExpiresInSeconds * 1000).toISOString()
      : null);
  const tokenBoundary = {
    shortLived: Boolean(input.participantToken),
    tokenRoomScoped: Boolean(input.participantToken),
    expiresAt: tokenExpiresAt,
    expiresInSeconds: tokenExpiresInSeconds,
    providerCredentialExposed: false,
    providerSecretsExposed: false,
    startsRecording: false,
    joiningStartsRecording: false,
    recordingRequiresConsent: true,
    providerRecordingRequiresExplicitAction: true,
    reusableAcrossRooms: false,
    roomStateOwner: "Quipsly CallRoom",
    safeClaims: input.tokenSafeClaims ?? null,
  };
  const joinEffects = {
    sideEffectFree: false,
    participantCreated: input.participantCreated === true,
    providerJoined: false,
    recordingStarted: false,
    providerRecordingStarted: false,
    tokenMinted: Boolean(input.participantToken),
    tokenReturned: Boolean(input.participantToken),
    externalMutated: false,
    stripeMutated: false,
    calendarMutated: false,
    mediaMutated: false,
    storageMutated: false,
    secretExposed: false,
    nextAction: input.participantCreated === true
      ? "Participant evidence was created in Quipsly. The authenticated client may now join; no recording was started."
      : "The authenticated client may now join. The server returned a short-lived key and did not start recording.",
  };

  const providerJoin = {
    canJoin: input.canJoin,
    provider,
    providerReadiness: input.providerReadiness,
    serverUrl: input.serverUrl ?? null,
    roomName: input.roomName ?? null,
    participantToken: input.participantToken ?? null,
    tokenIssuedAt,
    tokenExpiresInSeconds,
    tokenExpiresAt,
    tokenBoundary,
    effects: joinEffects,
  };
  const recordingBoundary = {
    joiningStartsRecording: false,
    localRecordingRequiresConsent: true,
    providerRecordingRequiresAllParticipantConsent: true,
    visibleRecordingIndicatorRequired: true,
    recordingConsentId: input.recordingConsentId ?? null,
    recordingConsentStatus: input.recordingConsentStatus,
    recordingConsentGranted: input.recordingConsentGranted,
    nextAction: input.recordingConsentGranted
      ? "Recording can start only after the visible recording state is started."
      : "Confirm explicit recording consent before recording locally or through the provider.",
  };
  const providerRecording = {
    startsWithJoin: false,
    requiresExplicitStart: true,
    requiresAllParticipantConsent: true,
    visibleRecordingIndicatorRequired: true,
    receiptRequiredBeforeTranscript: true,
    currentStatus: "not-started",
    evidenceSource: provider === "livekit" ? "livekit-egress" : "provider-egress-planned",
    nextAction: input.recordingConsentGranted
      ? "Start provider recording only from a visible Quipsly control and preserve the server-side receipt."
      : "Do not start provider recording until explicit participant consent is granted.",
  };
  const localFallback = {
    available: true,
    safeToRecordLocally: input.recordingConsentGranted,
    reason: input.canJoin ? "provider-ready" : input.providerReadiness,
    nextAction: input.recordingConsentGranted
      ? "Local recording fallback is available. Preserve local files until Nest verifies upload."
      : "Local recording is held until recording consent is granted.",
  };

  return {
    ok: true,
    kind: QUIPSLY_COACHING_MEETING_SPINE_KIND,
    canJoin: input.canJoin,
    provider,
    providerReadiness: input.providerReadiness,
    serverUrl: input.serverUrl ?? undefined,
    roomName: input.roomName ?? undefined,
    participantToken: input.participantToken ?? undefined,
    callRoomId: input.callRoomId,
    participantId: input.participantId,
    recordingConsentId: input.recordingConsentId ?? null,
    recordingConsentStatus: input.recordingConsentStatus,
    recordingConsentGranted: input.recordingConsentGranted,
    tokenExpiresInSeconds: input.tokenExpiresInSeconds ?? undefined,
    tokenIssuedAt,
    tokenExpiresAt,
    tokenBoundary,
    effects: joinEffects,
    joinEffects,
    providerJoin,
    recordingBoundary,
    providerRecording,
    localFallback,
    nextAction: input.nextAction,
  };
}

export function buildQuipslyProviderRecordingReceiptSlotManifest(
  input: QuipslyProviderRecordingReceiptSlotManifestInput,
) {
  return {
    source: "provider-recording-receipt-slot",
    contractKind: QUIPSLY_PROVIDER_RECORDING_RECEIPT_SLOT_KIND,
    provider: normalizedProvider(input.provider),
    providerRoomId: input.providerRoomId || input.callRoomId,
    callRoomId: input.callRoomId,
    captureGroupId: input.captureGroupId,
    preparedAt: input.preparedAt,
    preparedByUserId: input.preparedByUserId,
    startsWithJoin: false,
    externalRecordingStarted: false,
    requiresExplicitStart: true,
    requiresAllParticipantConsent: true,
    visibleRecordingIndicatorRequired: true,
    receiptRequiredBeforeTranscript: true,
    currentStatus: "receipt-slot",
    reusedExistingSlot: input.reusedExistingSlot === true,
    nextAction:
      "Start provider egress only from a visible Quipsly control, then attach the provider receipt before transcription relies on provider media.",
  };
}
