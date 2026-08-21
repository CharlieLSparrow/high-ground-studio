/** @jest-environment node */

import {
  captureTranscriptWorkerEnabled,
  captureTranscriptSourceTopology,
  captureTranscriptProviderRequest,
  captureTranscriptRoutingSummary,
  localCaptureTranscriptRoutingSummary,
  localCaptureTranscriptWorkerEnabled,
} from "./capture-transcript-processing";

describe("local Capture transcript worker availability", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalAvailability = process.env.QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE;
  const workerEnvironmentNames = [
    "QUIPSLY_TRANSCRIPT_WORKER_ENABLED",
    "QUIPSLY_TRANSCRIPT_WORKER_PROJECT_ID",
    "QUIPSLY_TRANSCRIPT_WORKER_REGION",
    "QUIPSLY_TRANSCRIPT_WORKER_JOB",
  ] as const;
  const originalWorkerEnvironment = Object.fromEntries(
    workerEnvironmentNames.map((name) => [name, process.env[name]]),
  );
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
    for (const name of workerEnvironmentNames) {
      const original = originalWorkerEnvironment[name];
      if (original === undefined) delete process.env[name];
      else process.env[name] = original;
    }
  });

  it("recognizes the isolated production worker only when its exact execution target is complete", () => {
    process.env.QUIPSLY_TRANSCRIPT_WORKER_ENABLED = "1";
    process.env.QUIPSLY_TRANSCRIPT_WORKER_PROJECT_ID = "high-ground-odyssey";
    process.env.QUIPSLY_TRANSCRIPT_WORKER_REGION = "us-central1";
    delete process.env.QUIPSLY_TRANSCRIPT_WORKER_JOB;
    expect(captureTranscriptWorkerEnabled()).toBe(false);

    process.env.QUIPSLY_TRANSCRIPT_WORKER_JOB = "quipsly-transcript-worker";
    expect(captureTranscriptWorkerEnabled()).toBe(true);

    process.env.QUIPSLY_TRANSCRIPT_WORKER_ENABLED = "0";
    expect(captureTranscriptWorkerEnabled()).toBe(false);
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

  it("projects a safe routing explanation without exposing provider payloads", () => {
    const topology = {
      kind: "participant-isolated" as const,
      participantId: "participant-001",
      participantLabel: "Scott Sparrow",
    };
    const provider = captureTranscriptProviderRequest({
      topology,
      model: "nova-3",
      version: "latest",
      language: "en-US",
      terminology: null,
    });
    const routingPlan = {
      kind: "quipsly-transcript-routing-plan-v1" as const,
      version: 1 as const,
      source: { sourceId: "recording-asset-001", sha256: "a".repeat(64), sizeBytes: 1024, topology },
      speakerIdentityAuthority: { kind: "source-binding" as const, participantId: topology.participantId, participantLabel: topology.participantLabel },
      primaryAttempt: {
        role: "primary" as const,
        provider: "deepgram" as const,
        model: "nova-3@latest",
        modelRevisionPolicy: "moving-latest" as const,
        language: "en-US",
        speakerAttribution: "source-binding" as const,
        timingGranularity: "word" as const,
        terminology: { mode: "none" as const, snapshotSha256: null },
        configuration: { diarize: false },
      },
      comparisonAttempts: [],
      boundaries: {
        providerOutputIsImmutableEvidence: true as const,
        providerSpeakerLabelsAreCandidates: true as const,
        sourceBindingOutranksDiarization: true as const,
        terminologyIsContextNotTruth: true as const,
        humanCorrectionsRemainSeparate: true as const,
        routingChangeRequiresMeasuredEvaluation: true as const,
      },
    };
    const summary = captureTranscriptRoutingSummary({
      routingPlan,
      provider,
    } as any);
    expect(summary).toMatchObject({
      sourceTopology: "participant-isolated",
      participantLabel: "Scott Sparrow",
      speakerAuthority: "source-binding",
      model: "nova-3@latest",
      modelRevisionPolicy: "moving-latest",
      diarizationRequested: false,
      terminologyKeytermCount: 0,
      manifestBacked: true,
    });
    expect(JSON.stringify(summary)).not.toContain("apiKey");
  });

  it("preserves isolated speaker authority in the local Whisper route", () => {
    expect(localCaptureTranscriptRoutingSummary({
      kind: "LOCAL_AUDIO",
      participantId: "participant-001",
      participant: { displayName: "Scott Sparrow", email: "shomers@icloud.com" },
    })).toMatchObject({
      sourceTopology: "participant-isolated",
      participantLabel: "Scott Sparrow",
      speakerAuthority: "source-binding",
      provider: "openai-whisper-local",
      diarizationRequested: false,
      timingGranularity: "segment",
      manifestBacked: false,
      providerOutputRemainsImmutable: true,
    });
  });
});
