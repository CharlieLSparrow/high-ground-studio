import {
  buildQuipslyCoachingLifecycle,
  QUIPSLY_COACHING_LIFECYCLE_KIND,
} from "@high-ground/quipsly-domain";

function captureReadyInput() {
  return {
    bookingExists: true,
    paymentRequired: false,
    roomExists: true,
    participantsAttached: true,
    consentGranted: true,
    providerReady: true,
  };
}

describe("buildQuipslyCoachingLifecycle participant boundary", () => {
  it("cannot call a Session capture-ready when no participant is attached", () => {
    const lifecycle = buildQuipslyCoachingLifecycle({
      ...captureReadyInput(),
      participantsAttached: false,
      nextAction: "Start recording now.",
    });

    expect(lifecycle).toMatchObject({
      kind: QUIPSLY_COACHING_LIFECYCLE_KIND,
      stage: "participants-needed",
      readyForCapture: false,
      readyForTranscript: false,
      readyForPacket: false,
      readyForReview: false,
      nextAction: "Attach the Session participants before consent or capture.",
    });
    expect(
      lifecycle.safeActions.find(
        (action) => action.id === "attach-participants",
      ),
    ).toMatchObject({ enabled: true, risk: "low" });
    expect(
      lifecycle.safeActions.find(
        (action) => action.id === "record-with-visible-state",
      ),
    ).toMatchObject({ enabled: false });
  });

  it("does not route a verified recording into transcription without participant and consent evidence", () => {
    const lifecycle = buildQuipslyCoachingLifecycle({
      ...captureReadyInput(),
      participantsAttached: false,
      consentGranted: false,
      recordingExists: true,
      serverRecordingVerified: true,
    });

    expect(lifecycle.stage).toBe("participants-needed");
    expect(lifecycle.readyForTranscript).toBe(false);
    expect(
      lifecycle.safeActions.find(
        (action) => action.id === "run-or-repair-transcript",
      ),
    ).toMatchObject({ enabled: false });
  });

  it("requires both sides of an ordinary coaching call rather than accepting any one participant", () => {
    const lifecycle = buildQuipslyCoachingLifecycle({
      ...captureReadyInput(),
      participantCount: 1,
      requiredParticipantCount: 2,
    });

    expect(lifecycle).toMatchObject({
      stage: "participants-needed",
      participantCount: 1,
      requiredParticipantCount: 2,
      readyForCapture: false,
    });
    expect(
      lifecycle.checks.find((check) => check.id === "participants"),
    ).toMatchObject({ status: "missing" });
  });

  it("preserves the ordinary one-action capture path after every core gate is present", () => {
    const lifecycle = buildQuipslyCoachingLifecycle(captureReadyInput());

    expect(lifecycle).toMatchObject({
      stage: "ready-to-capture",
      readyForCapture: true,
    });
    expect(
      lifecycle.safeActions.find(
        (action) => action.id === "record-with-visible-state",
      ),
    ).toMatchObject({ enabled: true, risk: "human-approval-required" });
  });
});
