import {
  SESSION_PREFLIGHT_TTL_MS,
  buildSessionPreflightEvidence,
  sessionPreflightNextAction,
  sessionPreflightRequestSha256,
} from "./session-preflight";

const testedAt = new Date("2026-08-06T10:30:00.000Z");

function healthyInput() {
  return {
    clientInstanceId: "web-studio-1",
    deviceLabel: "Quipsly Web · MacIntel",
    microphoneLabel: "Shure MV7i",
    cameraLabel: "Canon EOS R8",
    outputLabel: "Shure MV7i Headphones",
    cameraWanted: true,
    privateSampleDurationSeconds: 10,
    privateSamplePlaybackComplete: true,
    playbackDecision: "HEARD_CLEAR",
    audioEvidence: {
      state: "ready",
      rmsDbfs: -24,
      samplePeakDbfs: -8,
      peakHoldDbfs: -5,
      clippedSampleCountSinceStart: 0,
      sampleRateHz: 48_000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    },
    cameraEvidence: { width: 1_920, height: 1_080, frameRate: 30 },
  };
}

describe("session preflight evidence", () => {
  it("marks a fully heard healthy endpoint ready without retaining sample bytes", () => {
    const evidence = buildSessionPreflightEvidence(healthyInput(), testedAt);

    expect(evidence.status).toBe("READY");
    expect(evidence.issueCodes).toEqual([]);
    expect(evidence.expiresAt.getTime() - testedAt.getTime()).toBe(SESSION_PREFLIGHT_TTL_MS);
    expect(evidence.evidenceJson).toMatchObject({
      privateSampleBytesRetained: false,
      privateSampleUploaded: false,
      audioEvidenceCoverage: "realtime-call-path-observation-not-complete-decode",
    });
  });

  it("keeps a human listen concern authoritative even when the meter looks healthy", () => {
    const evidence = buildSessionPreflightEvidence({
      ...healthyInput(),
      playbackDecision: "NEEDS_ADJUSTMENT",
    }, testedAt);

    expect(evidence.status).toBe("NEEDS_ATTENTION");
    expect(evidence.issueCodes).toContain("LISTENER_NEEDS_ADJUSTMENT");
    expect(sessionPreflightNextAction(evidence)).toMatch(/adjust the microphone/i);
  });

  it("does not let an unheard or clipping-risk sample become ready", () => {
    const input = healthyInput();
    const evidence = buildSessionPreflightEvidence({
      ...input,
      privateSamplePlaybackComplete: false,
      audioEvidence: { ...input.audioEvidence, state: "clipping-risk", samplePeakDbfs: -0.2 },
    }, testedAt);

    expect(evidence.status).toBe("NEEDS_ATTENTION");
    expect(evidence.issueCodes).toEqual(expect.arrayContaining([
      "PLAYBACK_NOT_COMPLETED",
      "AUDIO_CLIPPING_RISK",
    ]));
    expect(sessionPreflightNextAction(evidence)).toMatch(/lower input gain/i);
  });

  it("requires measured camera evidence only when the person intends to join with video", () => {
    const withCamera = buildSessionPreflightEvidence({
      ...healthyInput(),
      cameraEvidence: {},
    }, testedAt);
    const audioOnly = buildSessionPreflightEvidence({
      ...healthyInput(),
      cameraWanted: false,
      cameraLabel: "",
      cameraEvidence: {},
    }, testedAt);

    expect(withCamera.issueCodes).toContain("CAMERA_NOT_VERIFIED");
    expect(audioOnly.status).toBe("READY");
  });

  it("binds idempotency to normalized client evidence rather than server receipt time", () => {
    const first = buildSessionPreflightEvidence(healthyInput(), testedAt);
    const later = buildSessionPreflightEvidence(healthyInput(), new Date(testedAt.getTime() + 60_000));
    const changed = buildSessionPreflightEvidence({
      ...healthyInput(),
      outputLabel: "MacBook Pro Speakers",
    }, testedAt);

    expect(sessionPreflightRequestSha256(first)).toBe(sessionPreflightRequestSha256(later));
    expect(sessionPreflightRequestSha256(first)).not.toBe(sessionPreflightRequestSha256(changed));
  });
});
