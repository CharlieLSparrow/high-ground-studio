import { browserRetainedStorageIssue, projectSessionGuardian, type BrowserRetainedSourceGuardianEvidence, type SessionGuardianInput } from "./session-guardian";

const retained: BrowserRetainedSourceGuardianEvidence = {
  status: "ready",
  sourceType: "audio",
  message: "Durable local source vault is ready.",
  vaultAvailable: true,
  vaultPersistent: true,
  readinessOk: true,
  readinessReason: "Ready",
  protectedRecoveryCount: 0,
  activeCaptureId: null,
  activeSizeBytes: 0,
  issue: null,
};

function input(overrides: Partial<SessionGuardianInput> = {}): SessionGuardianInput {
  return {
    conversationStatus: "connected",
    callSignalState: "ready",
    cameraWanted: true,
    cameraEvidenceAvailable: true,
    pageVisible: true,
    retainedSourceAvailable: true,
    retained,
    ...overrides,
  };
}

describe("projectSessionGuardian", () => {
  it("refuses to confuse a live room with a canonical retained take", () => {
    const result = projectSessionGuardian(input({ retainedSourceAvailable: false, retained: null }));
    expect(result.level).toBe("intervene");
    expect(result.title).toMatch(/retained recording held/i);
    expect(result.action).toMatch(/Do not substitute the room ID/i);
  });

  it("keeps a protected master authoritative while the call reconnects", () => {
    const result = projectSessionGuardian(input({
      conversationStatus: "reconnecting",
      retained: { ...retained, status: "recording", activeCaptureId: "capture-1", activeSizeBytes: 12_000_000 },
    }));
    expect(result.level).toBe("watch");
    expect(result.title).toMatch(/continues while the call reconnects/i);
    expect(result.detail).toMatch(/separate recorder/i);
  });

  it("does not announce readiness before retained evidence loads", () => {
    const result = projectSessionGuardian(input({ retained: null }));
    expect(result.level).toBe("watch");
    expect(result.title).toMatch(/checking the retained-source recorder/i);
  });

  it("ranks a retained encoder stall above healthy call-path evidence", () => {
    const result = projectSessionGuardian(input({
      retained: {
        ...retained,
        status: "stopping",
        activeCaptureId: "capture-1",
        issue: { kind: "encoder-stalled", detail: "No durable chunk arrived for 10 seconds." },
      },
    }));
    expect(result.level).toBe("intervene");
    expect(result.title).toMatch(/retained source was interrupted/i);
    expect(result.detail).toMatch(/10 seconds/i);
  });

  it("keeps a recording start failure separate from the live call", () => {
    const result = projectSessionGuardian(input({
      retained: {
        ...retained,
        status: "error",
        issue: {
          kind: "start-failed",
          detail: "The selected microphone is busy. Your call is still connected.",
          technicalDetail: "NotReadableError: Could not start audio source",
        },
      },
    }));
    expect(result.level).toBe("intervene");
    expect(result.title).toMatch(/recording needs a source/i);
    expect(result.detail).toMatch(/call is still connected/i);
    expect(result.action).toMatch(/independent live call can continue/i);
  });

  it("does not call a silent retained master healthy merely because chunks are advancing", () => {
    const result = projectSessionGuardian(input({
      retained: {
        ...retained,
        status: "recording",
        activeCaptureId: "capture-silent",
        activeSizeBytes: 1_024,
        issue: {
          kind: "source-no-signal",
          detail: "The retained microphone delivered five seconds of samples but no useful program signal.",
        },
      },
    }));
    expect(result.level).toBe("intervene");
    expect(result.title).toMatch(/no observed program signal/i);
    expect(result.action).toMatch(/retained meter follows speech/i);
  });

  it("keeps low storage visible after a take returns to ready", () => {
    const result = projectSessionGuardian(input({
      retained: {
        ...retained,
        issue: { kind: "storage-low", detail: "Browser storage has 1.4 GB remaining." },
      },
    }));
    expect(result.level).toBe("watch");
    expect(result.title).toMatch(/recording space is getting low/i);
  });

  it("labels clipping as call-path evidence instead of retained-master proof", () => {
    const result = projectSessionGuardian(input({ callSignalState: "clipping-risk" }));
    expect(result.level).toBe("intervene");
    expect(result.eyebrow).toBe("Call-path preflight");
    expect(result.detail).toMatch(/not proof of the retained master/i);
  });

  it("reports healthy durable writing only while both paths are observable", () => {
    const result = projectSessionGuardian(input({
      retained: { ...retained, status: "recording", activeCaptureId: "capture-1", activeSizeBytes: 24_000_000 },
    }));
    expect(result.level).toBe("ready");
    expect(result.title).toBe("Protected master is writing");
    expect(result.evidence.find((row) => row.lane === "Retained master")?.value).toMatch(/MB protected locally/i);
  });
});

describe("browserRetainedStorageIssue", () => {
  it("warns before the hard reserve and stops at the reserve", () => {
    expect(browserRetainedStorageIssue(8.5 * 1024 ** 3, 10 * 1024 ** 3)).toMatchObject({ kind: "storage-low" });
    expect(browserRetainedStorageIssue(9.5 * 1024 ** 3, 10 * 1024 ** 3)).toMatchObject({ kind: "storage-critical" });
    expect(browserRetainedStorageIssue(6 * 1024 ** 3, 10 * 1024 ** 3)).toBeNull();
  });

  it("does not invent storage health without finite evidence", () => {
    expect(browserRetainedStorageIssue(null, 10 * 1024 ** 3)).toBeNull();
    expect(browserRetainedStorageIssue(Number.NaN, 10 * 1024 ** 3)).toBeNull();
  });
});
