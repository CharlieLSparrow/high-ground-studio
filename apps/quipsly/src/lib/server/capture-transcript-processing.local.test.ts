/** @jest-environment node */

import {
  captureTranscriptSourceTopology,
  captureTranscriptProviderRequest,
  localCaptureTranscriptWorkerEnabled,
} from "./capture-transcript-processing";

describe("local Capture transcript worker availability", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalAvailability = process.env.QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE;
  const setNodeEnv = (value: string | undefined) => {
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    });
  };

  afterEach(() => {
    setNodeEnv(originalNodeEnv);
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalAvailability === undefined) delete process.env.QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE;
    else process.env.QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE = originalAvailability;
  });

  it("requires an explicit lifecycle signal and loopback database", () => {
    setNodeEnv("test");
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/quipsly";
    delete process.env.QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE;
    expect(localCaptureTranscriptWorkerEnabled()).toBe(false);

    process.env.QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE = "1";
    expect(localCaptureTranscriptWorkerEnabled()).toBe(true);

    process.env.DATABASE_URL = "postgresql://quipsly@production.example.com/quipsly";
    expect(localCaptureTranscriptWorkerEnabled()).toBe(false);
  });

  it("cannot be enabled in production", () => {
    setNodeEnv("production");
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/quipsly";
    process.env.QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE = "1";
    expect(localCaptureTranscriptWorkerEnabled()).toBe(false);
  });

  it("derives speaker authority from canonical recording ownership", () => {
    expect(captureTranscriptSourceTopology({
      kind: "LOCAL_AUDIO",
      participantId: "participant-001",
      participant: { displayName: "Scott Sparrow", email: "shomers@icloud.com" },
    })).toEqual({
      kind: "participant-isolated",
      participantId: "participant-001",
      participantLabel: "Scott Sparrow",
    });
    expect(captureTranscriptSourceTopology({ kind: "SERVER_MIX" })).toEqual({
      kind: "mixed-room",
      expectedSpeakerCount: null,
    });
    expect(captureTranscriptSourceTopology({ kind: "LOCAL_AUDIO" })).toEqual({
      kind: "unknown",
    });
  });

  it("turns source topology into the exact provider policy", () => {
    const isolated = captureTranscriptProviderRequest({
      topology: {
        kind: "participant-isolated",
        participantId: "participant-001",
        participantLabel: "Scott Sparrow",
      },
      model: "nova-3",
      version: "latest",
      language: "en-US",
      terminology: null,
    });
    expect(isolated).toMatchObject({
      version: "latest",
      diarize: false,
      diarizeModel: null,
    });

    const mixed = captureTranscriptProviderRequest({
      topology: { kind: "mixed-room", expectedSpeakerCount: 2 },
      model: "nova-3",
      version: "latest",
      language: "en-US",
      terminology: null,
    });
    expect(mixed).toMatchObject({
      diarize: true,
      diarizeModel: "v2",
    });
  });
});
