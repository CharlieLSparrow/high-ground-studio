/** @jest-environment node */

jest.mock("@high-ground/quipsly-domain/coaching-lifecycle", () => ({ buildQuipslyCoachingLifecycle: jest.fn() }), { virtual: true });
jest.mock("@high-ground/quipsly-domain/coaching-packet", () => ({
  isTranscriptPacketSource: jest.fn(() => false),
  isUnreviewedTranscriptActionItemSource: jest.fn(() => false),
}), { virtual: true });

import { recordingContentReadiness } from "./mobile-capture-content-readiness";
import {
  captureSourceSummaries,
  canonicalMobileSessionEpisodeSlug,
  canonicalMobileSessionProject,
} from "./mobile-capture-sessions";

describe("mobile Session canonical project projection", () => {
  it("uses the relational project and reports legacy slug drift", () => {
    expect(canonicalMobileSessionProject({
      projectId: "project-1",
      projectSlug: "stale-high-ground",
      nestSlug: "older-high-ground",
      project: { id: "project-1", slug: "high-ground", name: "High Ground Odyssey" },
    })).toEqual({
      projectId: "project-1",
      projectSlug: "high-ground",
      projectName: "High Ground Odyssey",
      bindingSource: "canonical-session-project",
      legacySlugDrift: true,
    });
  });

  it("retains a labeled legacy fallback only when no canonical relation exists", () => {
    expect(canonicalMobileSessionProject({ projectSlug: "legacy-coaching" })).toEqual({
      projectId: null,
      projectSlug: "legacy-coaching",
      projectName: null,
      bindingSource: "legacy-session-slug",
      legacySlugDrift: false,
    });
  });

  it("leaves a Session unfiled instead of inventing High Ground Odyssey", () => {
    expect(canonicalMobileSessionProject({})).toEqual({
      projectId: null,
      projectSlug: null,
      projectName: null,
      bindingSource: "unfiled-session",
      legacySlugDrift: false,
    });
  });
});

describe("mobile Session canonical episode projection", () => {
  it("uses the explicit CallRoom episode binding before an offering fallback", () => {
    expect(canonicalMobileSessionEpisodeSlug({
      id: "room-1",
      metadataJson: { episodeSlug: "episode-4-part-2" },
      booking: { offering: { slug: "podcast-offering" } },
    })).toBe("episode-4-part-2");
  });

  it("retains legacy offering and room fallbacks", () => {
    expect(canonicalMobileSessionEpisodeSlug({
      id: "room-1",
      booking: { offering: { slug: "legacy-offering" } },
    })).toBe("legacy-offering");
    expect(canonicalMobileSessionEpisodeSlug({ id: "room-2" })).toBe("room-2");
  });
});

describe("mobile Session recording content readiness", () => {
  it("does not infer content from an empty recording list", () => {
    expect(recordingContentReadiness([], "PODCAST")).toMatchObject({
      status: "none",
      captureAssetCount: 0,
      substantialRecordingCount: 0,
    });
  });

  it("labels short simulator artifacts as capture plumbing proof only", () => {
    expect(recordingContentReadiness([
      {
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        durationSeconds: null,
        segmentsJson: [
          { deviceKind: "Clone 1 of iPhone 17 Pro", durationSeconds: 3.75 },
          { deviceKind: "Clone 1 of iPhone 17 Pro", durationSeconds: 1.57 },
        ],
        localManifestJson: {},
      },
      {
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        durationSeconds: 5,
        segmentsJson: [{ deviceKind: "iPhone 17 Pro Simulator", durationSeconds: 5 }],
        localManifestJson: {},
      },
    ], "PODCAST")).toMatchObject({
      status: "capture-proof-only",
      label: "Capture plumbing proven",
      captureAssetCount: 2,
      knownDurationSeconds: 10.32,
      longestKnownDurationSeconds: 5.32,
      shortCaptureCount: 2,
      simulatorCaptureCount: 2,
      substantialRecordingCount: 0,
    });
  });

  it("requires known duration before calling an asset substantial", () => {
    expect(recordingContentReadiness([
      { kind: "LOCAL_AUDIO", status: "VERIFIED", durationSeconds: null, segmentsJson: [], localManifestJson: {} },
    ], "COACHING")).toMatchObject({
      status: "capture-proof-only",
      unknownDurationCount: 1,
      substantialRecordingCount: 0,
    });
  });

  it("recognizes a non-simulator take without claiming editorial readiness", () => {
    const result = recordingContentReadiness([
      {
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        durationSeconds: 120,
        segmentsJson: [{ deviceKind: "Wall-E’s iPhone", durationSeconds: 120 }],
        localManifestJson: {},
      },
    ], "PODCAST");
    expect(result).toMatchObject({
      status: "substantial",
      captureAssetCount: 1,
      knownDurationSeconds: 120,
      substantialRecordingCount: 1,
    });
    expect(result.detail).toContain("not editorial or release readiness");
  });

  it("does not count provider receipt slots or transcript references as source media", () => {
    expect(recordingContentReadiness([
      { kind: "SERVER_MIX", localManifestJson: { source: "provider-recording-receipt-slot" }, durationSeconds: 3600 },
      { kind: "TRANSCRIPT_SOURCE", durationSeconds: 3600 },
    ], "PODCAST")).toMatchObject({ status: "none", captureAssetCount: 0 });
  });

  it("does not call local-only metadata substantial before uploaded bytes are verified", () => {
    expect(recordingContentReadiness([
      { kind: "LOCAL_AUDIO", status: "LOCAL_READY", durationSeconds: 600, segmentsJson: [{ deviceKind: "Wall-E’s iPhone", durationSeconds: 600 }] },
    ], "PODCAST")).toMatchObject({
      status: "capture-proof-only",
      verifiedCaptureCount: 0,
      substantialRecordingCount: 0,
    });
  });
});

describe("mobile Session canonical capture sources", () => {
  it("projects exact verification, proxy, transcript, and take identity together", () => {
    const [source] = captureSourceSummaries({
      recordingAssets: [{
        id: "recording-1",
        fileName: "homer-iphone.mov",
        kind: "LOCAL_VIDEO",
        contentType: "video/quicktime",
        byteSize: BigInt(4_000_000_000),
        durationSeconds: 1_800,
        status: "VERIFIED",
        recordedStartedAt: new Date("2026-07-27T18:00:00Z"),
        recordedStoppedAt: new Date("2026-07-27T18:30:00Z"),
        localManifestJson: {
          exactBytesVerified: true,
          byteVerificationKind: "server-size-and-sha256",
          captureGroupId: "take-1",
          reportedSourceProfile: {
            schemaVersion: 1,
            codec: "hevc",
            monotonicStartedNanoseconds: "1500000000",
            clockSamples: [{
              protocolVersion: 1,
              sampleId: "sample-1",
              callRoomId: "room-1",
              captureGroupId: "take-1",
              clientKind: "ios",
              deviceWallSentAt: "2026-07-27T17:59:59.500Z",
              deviceMonotonicSentNanoseconds: "1000000000",
              serverReceivedAt: "2026-07-27T17:59:59.560Z",
              serverSentAt: "2026-07-27T17:59:59.570Z",
              deviceWallReceivedAt: "2026-07-27T17:59:59.610Z",
              deviceMonotonicReceivedNanoseconds: "1110000000",
              networkRoundTripMilliseconds: 100,
              serverOffsetMilliseconds: 10,
              uncertaintyMilliseconds: 50,
              wallClockDiscontinuityMilliseconds: 0,
            }],
          },
        },
        transcriptJobs: [{
          id: "transcript-1",
          status: "QUEUED",
          provider: "pending",
          updatedAt: new Date("2026-07-27T18:31:00Z"),
          _count: { segments: 0 },
        }],
      }],
      stateReceipts: [{
        receiptId: "start-1",
        roomId: "room-1",
        captureId: "capture-1",
        actorUserId: "user-1",
        action: "START_RECORDING",
        occurredAt: new Date("2026-07-27T17:59:59.900Z"),
        receivedAt: new Date("2026-07-27T18:00:00.050Z"),
        outcome: "APPLIED",
        stateApplied: true,
      }],
      id: "room-1",
    }, [{
      uploadSessionId: "upload-1",
      captureId: "capture-1",
      actorUserId: "user-1",
      startReceiptId: "start-1",
      recordingAssetId: "recording-1",
      mediaAssetId: "media-1",
      sourceId: "source-1",
      processingDisposition: "RELEASED",
      transcriptDisposition: "RELEASED",
    }], [{
      id: "media-1",
      url: "/api/ingest/media/source-1",
      variants: [],
      proxyAssets: [],
      workflowJobs: [{
        type: "asset-proxy",
        status: "queued",
      }],
    }]);

    expect(source).toMatchObject({
      recordingAssetId: "recording-1",
      uploadSessionId: "upload-1",
      captureId: "capture-1",
      captureGroupId: "take-1",
      exactBytesVerified: true,
      byteVerificationKind: "server-size-and-sha256",
      processingDisposition: "RELEASED",
      transcriptDisposition: "RELEASED",
      sourceId: "source-1",
      mediaAssetId: "media-1",
      playbackUrl: "/api/ingest/media/source-1",
      alignment: {
        status: "proposal-ready",
        sourceClockEvidence: "lowest-rtt-monotonic-projection",
        estimatedServerStartedAt: "2026-07-27T18:00:00.010Z",
        sampleAccurateClaimed: false,
        reviewRequired: true,
        captureGroup: {
          baselineRecordingAssetId: "recording-1",
          estimatedOffsetMilliseconds: 0,
          proposalSourceCount: 1,
          sampleAccurateClaimed: false,
        },
      },
      proxy: {
        required: true,
        status: "queued",
        sourceOriginalPreserved: true,
      },
      transcript: {
        id: "transcript-1",
        status: "QUEUED",
        segmentCount: 0,
      },
    });
  });
});
