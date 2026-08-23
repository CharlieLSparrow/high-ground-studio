import { buildSessionSourceJourneyProjection } from "./session-source-journey";
import type { SessionFinishingEvidence } from "./session-finishing-cockpit";
import { EMPTY_SESSION_READINESS_TOPOLOGY, type SessionReadinessSource, type SessionReadinessTopology } from "./session-readiness-topology";
import type { SessionSourceEvidence } from "./session-source-evidence-model";

function retainedSource(): SessionReadinessSource {
  return {
    id: "asset-1",
    evidenceKind: "recording-asset" as const,
    sourceKind: "audio" as const,
    label: "Charlie MV7i.wav",
    status: "VERIFIED",
    clientKind: "web",
    deviceLabel: "Chrome · MV7i",
    captureId: "capture-1",
    startedAt: "2026-08-06T01:00:00.000Z",
    stoppedAt: "2026-08-06T01:42:00.000Z",
    durationSeconds: 2520,
    byteSize: "200000000",
    verified: true,
    serverRetention: {
      state: "SERVER_COPY_VERIFIED_RELEASED" as const,
      uploadSessionId: "upload-1",
      exactBytesVerified: true,
      processingDisposition: "RELEASED",
      transcriptDisposition: "RELEASED",
      updatedAt: "2026-08-06T02:00:00.000Z",
    },
  };
}

function topology(source = retainedSource()): SessionReadinessTopology {
  return {
    ...EMPTY_SESSION_READINESS_TOPOLOGY,
    generatedAt: "2026-08-06T03:00:00.000Z",
    people: [{
      id: "person-1",
      label: "Charlie",
      role: "HOST",
      isCurrentActor: true,
      consent: "ready",
      videoConsent: true,
      transcriptionConsent: true,
      endpoints: [],
      preflights: [],
      endpointQueues: [],
      sources: [source],
      attentionCount: 0,
    }],
    expectedSources: [{
      id: "expected-1",
      participantId: "person-1",
      participantLabel: "Charlie",
      label: "Charlie clean microphone master",
      sourceKind: "audio",
      retentionRole: "required-master",
      status: "active",
      expectedClientKind: "web",
      expectedDeviceLabel: "MV7i",
      recordingAssetId: "asset-1",
      captureId: "capture-1",
      revision: 2,
      latestReason: null,
      fulfillment: "fulfilled",
      blocking: false,
      candidateSources: [],
      createdAt: "2026-08-05T23:00:00.000Z",
      updatedAt: "2026-08-06T02:00:00.000Z",
    }],
  };
}

function sourceEvidence(overrides: Partial<SessionSourceEvidence["sources"][number]> = {}): SessionSourceEvidence {
  return {
    sources: [{
      recordingAssetId: "asset-1",
      fileName: "Charlie MV7i.wav",
      kind: "LOCAL_AUDIO",
      recordingStatus: "VERIFIED",
      status: "VERIFIED_MATCH",
      captureId: "capture-1",
      captureGroupId: "group-1",
      uploadSessionId: "upload-1",
      startBoundary: { receiptId: "start-1", occurredAt: "2026-08-06T01:00:00.000Z" },
      stopBoundary: { receiptId: "stop-1", occurredAt: "2026-08-06T01:42:00.000Z" },
      sourceOrigin: "CAPTURE",
      cloud: { sha256: "a".repeat(64), byteSize: "200000000", generation: "9", bucket: "quipsly", objectPath: "capture.wav", verifiedAt: "2026-08-06T01:59:00.000Z" },
      captureRuntime: { appVersion: "1.0", appBuild: "28", deviceModel: "Mac", operatingSystem: "macOS", audioRoute: "MV7i", audioFormat: undefined },
      processingDisposition: "RELEASED",
      transcriptDisposition: "RELEASED",
      releaseAudit: { releasedAt: "2026-08-06T02:00:00.000Z", reason: "Exact source release verified by retained operation.", transcriptReleasedAt: "2026-08-06T02:00:00.000Z", transcriptReason: "Consent and bytes verified." },
      issues: [],
      ...overrides,
    }],
    counts: { VERIFIED_MATCH: 1, HELD: 0, DRIFT: 0, INCOMPLETE: 0 },
  };
}

function finishingEvidence(overrides: Partial<SessionFinishingEvidence> = {}): SessionFinishingEvidence {
  return {
    transcriptJobs: [{ id: "transcript-1", recordingAssetId: "asset-1", status: "COMPLETED", segmentCount: 340, updatedAt: "2026-08-06T02:20:00.000Z" }],
    outputs: [],
    analyzedSourceCount: 1,
    assembly: {
      episodeProductionId: "episode-9",
      episodeTitle: "Episode 9",
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      editorHref: "/editor?project=high-ground-odyssey&episode=episode-9",
      state: "MATERIALIZED_ASSEMBLY",
      captureGroupId: "group-1",
      selectedMediaCount: 1,
      selectedRecordingAssetIds: ["asset-1"],
      plannedSourceCount: 1,
      blockerCount: 0,
      warningCount: 0,
      nextAction: "Review current proposals.",
      canonicalTakeCount: 1,
      canonicalSourceCount: 1,
      canonicalAssemblyReadyCount: 1,
      sessionTimelineClipCount: 1,
      sessionTranscriptBlockCount: 340,
      episodeTimelineClipCount: 1,
      episodeTranscriptBlockCount: 340,
      currentProposalSetCount: 1,
      staleProposalSetCount: 0,
      currentReviewReceiptCount: 1,
      proofListenCount: 1,
      proofWatchCount: 1,
      localDraftActionCount: 0,
      unsavedLocalDraftActionCount: 0,
      canonicalTimelineSaveCount: 1,
      canonicallyLinkedDraftActionCount: 0,
      latestCanonicalSaveAt: "2026-08-06T02:30:00.000Z",
      ledgerAvailable: true,
      productionUpdatedAt: "2026-08-06T02:30:00.000Z",
    },
    ...overrides,
  };
}

describe("Session source journey projection", () => {
  it("projects a complete planned source across capture, exact-byte retention, transcript, and editor evidence", () => {
    const projection = buildSessionSourceJourneyProjection({
      topology: topology(),
      sourceEvidence: sourceEvidence(),
      finishingEvidence: finishingEvidence(),
    });

    expect(projection.counts).toEqual({ complete: 1, inProgress: 0, attention: 0 });
    expect(projection.journeys[0]).toMatchObject({
      participantLabel: "Charlie",
      recordingAssetId: "asset-1",
      state: "COMPLETE",
      checkpoints: [
        { id: "plan", state: "COMPLETE" },
        { id: "capture", state: "COMPLETE" },
        { id: "retention", state: "COMPLETE" },
        { id: "transcript", state: "COMPLETE" },
        { id: "assembly", state: "COMPLETE" },
      ],
    });
    expect(projection.boundaries).toEqual(expect.objectContaining({
      projectionCreatesNoSourceState: true,
      livePresenceIsNotHistoricalEvidence: true,
      transcriptAttemptIsNotReferenceTruth: true,
    }));
  });

  it("accepts a verified observed source without requiring advance device-plan paperwork", () => {
    const source = retainedSource();
    const inputTopology = topology(source);
    inputTopology.expectedSources = [];

    const projection = buildSessionSourceJourneyProjection({
      topology: inputTopology,
      sourceEvidence: sourceEvidence(),
      finishingEvidence: finishingEvidence(),
    });

    expect(projection.journeys).toHaveLength(1);
    expect(projection.journeys[0]).toMatchObject({
      id: "observed:asset-1",
      state: "COMPLETE",
    });
    expect(projection.journeys[0]!.checkpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "plan", state: "NOT_APPLICABLE" }),
      expect.objectContaining({ id: "capture", state: "COMPLETE" }),
      expect.objectContaining({ id: "retention", state: "COMPLETE" }),
    ]));
    expect(projection.boundaries.sourcePlanIsOptionalForVerifiedObservedMedia).toBe(true);
  });

  it("shows a missing planned master even when no device or file ever appeared", () => {
    const inputTopology = topology();
    inputTopology.people[0]!.sources = [];
    inputTopology.expectedSources[0] = {
      ...inputTopology.expectedSources[0]!,
      recordingAssetId: null,
      captureId: null,
      fulfillment: "missing",
      blocking: true,
    };

    const projection = buildSessionSourceJourneyProjection({
      topology: inputTopology,
      sourceEvidence: { sources: [], counts: { VERIFIED_MATCH: 0, HELD: 0, DRIFT: 0, INCOMPLETE: 0 } },
      finishingEvidence: finishingEvidence({ transcriptJobs: [], assembly: undefined }),
    });

    expect(projection.journeys[0]).toMatchObject({
      state: "ATTENTION",
      deviceLabel: "MV7i",
    });
    expect(projection.journeys[0]!.checkpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "plan", state: "HELD" }),
      expect.objectContaining({ id: "capture", state: "MISSING" }),
      expect.objectContaining({ id: "retention", state: "MISSING" }),
    ]));
  });

  it("surfaces immutable provenance drift and a failed latest transcript attempt independently", () => {
    const retained = retainedSource();
    const heldSource = {
      ...retained,
      serverRetention: {
        ...retained.serverRetention,
        state: "SERVER_COPY_VERIFIED_HELD" as const,
      },
    };
    const inputTopology = topology(heldSource);
    inputTopology.expectedSources[0] = { ...inputTopology.expectedSources[0]!, fulfillment: "bound-source-pending", blocking: true };

    const projection = buildSessionSourceJourneyProjection({
      topology: inputTopology,
      sourceEvidence: sourceEvidence({ status: "DRIFT", issues: ["SHA-256 does not match the immutable upload receipt."] }),
      finishingEvidence: finishingEvidence({
        transcriptJobs: [{ id: "transcript-failed", recordingAssetId: "asset-1", status: "FAILED", segmentCount: 0, updatedAt: "2026-08-06T02:40:00.000Z" }],
      }),
    });

    expect(projection.journeys[0]).toMatchObject({ state: "ATTENTION" });
    expect(projection.journeys[0]!.checkpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "retention", state: "HELD", detail: expect.stringContaining("SHA-256") }),
      expect.objectContaining({ id: "transcript", state: "HELD", detail: expect.stringContaining("failed") }),
    ]));
  });

  it("does not fabricate Capture boundaries for a staff-reviewed external import", () => {
    const projection = buildSessionSourceJourneyProjection({
      topology: topology(),
      sourceEvidence: sourceEvidence({
        sourceOrigin: "NEST_EXTERNAL_IMPORT",
        boundaryAuthority: "STAFF_REVIEWED_EXTERNAL_IMPORT",
        startBoundary: null,
        stopBoundary: null,
      }),
      finishingEvidence: finishingEvidence(),
    });

    expect(projection.journeys[0]!.checkpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "capture", state: "NOT_APPLICABLE", detail: expect.stringContaining("external-source") }),
    ]));
  });

  it("does not borrow the original Capture boundaries for an audited recovery replica", () => {
    const projection = buildSessionSourceJourneyProjection({
      topology: topology(),
      sourceEvidence: sourceEvidence({
        sourceOrigin: "NEST_RECOVERY_REPLICA",
        boundaryAuthority: "AUDITED_RECOVERY_REPLICA",
        startBoundary: null,
        stopBoundary: null,
        recoveryAudit: {
          requestId: "request-1",
          originalRecordingAssetId: "original-asset",
          expectationId: "expected-1",
          decidedAt: "2026-08-06T02:00:00.000Z",
          reason: "The original decoded near silence; adopt the verified backup.",
          importedSourceGeneration: "4",
          durableReplicaGeneration: "9",
          originalSourceMediaUnchanged: true,
        },
      }),
      finishingEvidence: finishingEvidence(),
    });

    expect(projection.journeys[0]!.checkpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "capture", state: "NOT_APPLICABLE", detail: expect.stringContaining("recovery decision") }),
      expect.objectContaining({ id: "retention", state: "COMPLETE" }),
    ]));
  });

  it("does not put a historical source on the editor timeline merely because it shares the Capture group", () => {
    const historical = { ...retainedSource(), id: "asset-historical", label: "Earlier browser witness.webm", captureId: "capture-historical" };
    const inputTopology = topology();
    inputTopology.people[0]!.sources.push(historical);
    const historicalEvidence = {
      ...sourceEvidence().sources[0]!,
      recordingAssetId: "asset-historical",
      fileName: "Earlier browser witness.webm",
      captureId: "capture-historical",
    };
    const evidence = sourceEvidence();
    evidence.sources.push(historicalEvidence);
    evidence.counts.VERIFIED_MATCH = 2;

    const projection = buildSessionSourceJourneyProjection({
      topology: inputTopology,
      sourceEvidence: evidence,
      finishingEvidence: finishingEvidence(),
    });

    const historicalJourney = projection.journeys.find((journey) => journey.recordingAssetId === "asset-historical");
    expect(historicalJourney?.checkpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "assembly", state: "NOT_APPLICABLE", detail: expect.stringContaining("does not silently place") }),
    ]));
  });
});
