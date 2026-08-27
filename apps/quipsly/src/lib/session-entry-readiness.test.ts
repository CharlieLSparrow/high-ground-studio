import { buildQuipslySessionEntryReadiness } from "@high-ground/quipsly-domain/session-entry-readiness";

function baseInput() {
  return {
    roomStatus: "PLANNED",
    purpose: "COACHING",
    actorAttached: true,
    actorAudioConsentGranted: true,
    actorVideoConsentGranted: true,
    actorTranscriptionConsentGranted: true,
    participantCount: 2,
    requiredParticipantCount: 2,
    audioConsentGrantedParticipantCount: 2,
    videoConsentGrantedParticipantCount: 2,
    transcriptionConsentGrantedParticipantCount: 2,
    allParticipantAudioConsentGranted: true,
    allParticipantVideoConsentGranted: true,
    allParticipantTranscriptionConsentGranted: true,
    providerCanJoin: true,
    providerReadiness: "livekit-ready",
    localCaptureAvailable: true,
    paymentBlocked: false,
  } as const;
}

describe("canonical Session entry readiness", () => {
  it("lets a coach enter the waiting room without pretending one participant can record a two-person Session", () => {
    const readiness = buildQuipslySessionEntryReadiness({
      ...baseInput(),
      participantCount: 1,
      audioConsentGrantedParticipantCount: 1,
      videoConsentGrantedParticipantCount: 1,
      transcriptionConsentGrantedParticipantCount: 1,
      allParticipantAudioConsentGranted: false,
      allParticipantVideoConsentGranted: false,
      allParticipantTranscriptionConsentGranted: false,
    });

    expect(readiness).toMatchObject({
      stage: "join-call",
      label: "Join and wait",
      primaryAction: { id: "join-call", label: "Join waiting room" },
      permissions: {
        canJoinCall: true,
        canOpenLocalRecorder: true,
        canStartAudioRecording: false,
        canStartVideoRecording: false,
        canTranscribe: false,
      },
      participantProgress: { attached: 1, required: 2, complete: false },
    });
    expect(readiness.blockers).toContain("participants-needed");
  });

  it("leads a ready appointment with the conventional join action", () => {
    const readiness = buildQuipslySessionEntryReadiness(baseInput());

    expect(readiness).toMatchObject({
      stage: "join-call",
      label: "Ready to join",
      primaryAction: { id: "join-call", label: "Join session" },
      permissions: {
        canJoinCall: true,
        canStartAudioRecording: true,
      },
    });
    expect(readiness.assurances.joiningStartsRecording).toBe(false);
  });

  it("keeps joining available while the actor reviews their one-time Session choice", () => {
    const readiness = buildQuipslySessionEntryReadiness({
      ...baseInput(),
      actorAudioConsentGranted: false,
      actorVideoConsentGranted: false,
      actorTranscriptionConsentGranted: false,
      audioConsentGrantedParticipantCount: 1,
      videoConsentGrantedParticipantCount: 1,
      transcriptionConsentGrantedParticipantCount: 1,
      allParticipantAudioConsentGranted: false,
      allParticipantVideoConsentGranted: false,
      allParticipantTranscriptionConsentGranted: false,
    });

    expect(readiness.stage).toBe("confirm-consent");
    expect(readiness.permissions.canJoinCall).toBe(true);
    expect(readiness.permissions.canStartAudioRecording).toBe(false);
    expect(readiness.assurances.savedSessionConsentIsReused).toBe(true);
  });

  it("separates audio, video, and transcription permission", () => {
    const readiness = buildQuipslySessionEntryReadiness({
      ...baseInput(),
      actorVideoConsentGranted: false,
      actorTranscriptionConsentGranted: false,
      videoConsentGrantedParticipantCount: 1,
      transcriptionConsentGrantedParticipantCount: 1,
      allParticipantVideoConsentGranted: false,
      allParticipantTranscriptionConsentGranted: false,
    });

    expect(readiness.permissions).toMatchObject({
      canJoinCall: true,
      canStartAudioRecording: true,
      canStartVideoRecording: false,
      canTranscribe: false,
    });
  });

  it("offers protected local capture when the provider is unavailable and the complete consent set is ready", () => {
    const readiness = buildQuipslySessionEntryReadiness({
      ...baseInput(),
      providerCanJoin: false,
      providerReadiness: "livekit-needs-config",
    });

    expect(readiness).toMatchObject({
      stage: "prepare-local-capture",
      primaryAction: { id: "open-recorder", label: "Open recorder" },
      permissions: {
        canJoinCall: false,
        canStartAudioRecording: true,
      },
    });
  });

  it("fails closed for ended rooms and payment holds", () => {
    const ended = buildQuipslySessionEntryReadiness({
      ...baseInput(),
      roomStatus: "ENDED",
    });
    const payment = buildQuipslySessionEntryReadiness({
      ...baseInput(),
      paymentBlocked: true,
    });

    expect(ended.stage).toBe("room-closed");
    expect(ended.permissions.canJoinCall).toBe(false);
    expect(ended.permissions.canStartAudioRecording).toBe(false);
    expect(payment.stage).toBe("payment-hold");
    expect(payment.permissions.canJoinCall).toBe(false);
    expect(payment.permissions.canStartAudioRecording).toBe(false);
  });
});
