/** @jest-environment node */

jest.mock("server-only", () => ({}));

import {
  applyRecordingShareTranscriptReadiness,
  buildSessionRecordingShareEdit,
  classifyRecordingShareTranscriptCutSafety,
  newestCoherentRecordingTake,
  stableJson,
} from "./session-recording-share";
import { buildSessionTranscriptReadiness } from "@/lib/session-transcript-readiness";

describe("Session recording share take selection", () => {
  it("keeps repeated calls in one room out of the newest take", () => {
    const at = (id: string, seconds: number) => ({ id, recordedStartedAt: new Date(1_787_180_000_000 + seconds * 1_000), captureGroupId: "same-room-group" });
    const newest = newestCoherentRecordingTake([
      at("coach-old", 0),
      at("client-old", 0.02),
      at("coach-new", 180),
      at("client-new", 180.03),
    ]);
    expect(newest.map((source) => source.id)).toEqual(["coach-new", "client-new"]);
  });

  it("keeps normal endpoint startup skew in one take", () => {
    const newest = newestCoherentRecordingTake([
      { id: "coach", recordedStartedAt: new Date("2026-08-19T12:00:00Z") },
      { id: "client", recordedStartedAt: new Date("2026-08-19T12:00:18Z") },
    ]);
    expect(newest).toHaveLength(2);
  });

  it("canonicalizes object fields independent of insertion order", () => {
    expect(stableJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
  });
});

describe("Session recording share text edits", () => {
  const sourceSha256 = "f".repeat(64);
  const transcriptReadiness = (overrides: Record<string, unknown> = {}) => buildSessionTranscriptReadiness({
    status: "COMPLETED",
    segmentCount: 1,
    wordCount: 8,
    reviewedAttributionCount: 0,
    sourceSha256,
    sourceGeneration: "9",
    processingManifestObject: "transcripts/jobs/job-1/manifest.json",
    processingResultObject: "transcripts/jobs/job-1/result.json",
    providerRequestId: "provider-request-1",
    providerResponseObject: "transcripts/jobs/job-1/provider.json",
    workerBuildId: "worker-build-1",
    resultJson: { processingControl: { routing: { schema: "quipsly-transcript-routing-summary-v1", sourceTopology: "participant-isolated", participantLabel: "Coach", speakerAuthority: "source-binding", timingGranularity: "word", manifestBacked: true } } },
    ...overrides,
  }, { status: "VERIFIED_MATCH", sha256: sourceSha256, generation: "9" });
  const transcriptSegment = {
    transcriptJobId: "transcript_job_0001",
    segmentId: "transcript_segment_0001",
    sourceRecordingAssetId: "recording_asset_0001",
    providerTextSha256: "a".repeat(64),
    speakerLabel: "Coach",
    text: "This passage should not be in the shared copy.",
    startSeconds: 10,
    endSeconds: 14,
    cutStartSeconds: 10.2,
    cutEndSeconds: 13.8,
    timingFingerprint: "c".repeat(64),
    timingBasis: "provider-words" as const,
    cutSafety: "safe" as const,
    cutSafetyReason: "Word timing is bound to this exact source recording.",
  };

  it("turns source-bound transcript exclusions into reversible kept ranges", () => {
    const edit = buildSessionRecordingShareEdit({
      startSeconds: 2,
      endSeconds: 20,
      transcriptSegments: [transcriptSegment],
      excludedTranscriptSegments: [{
        transcriptJobId: transcriptSegment.transcriptJobId,
        segmentId: transcriptSegment.segmentId,
        providerTextSha256: transcriptSegment.providerTextSha256,
        timingFingerprint: transcriptSegment.timingFingerprint,
      }],
    });
    expect(edit.keptRanges).toEqual([
      expect.objectContaining({ startSeconds: 2, endSeconds: 10.2 }),
      expect.objectContaining({ startSeconds: 13.8, endSeconds: 20 }),
    ]);
    expect(edit.transcriptExclusions).toEqual([expect.objectContaining({
      sourceRecordingAssetId: "recording_asset_0001",
      startSeconds: 10.2,
      endSeconds: 13.8,
      timingFingerprint: "c".repeat(64),
      timingBasis: "provider-words",
      cutSafety: "safe",
    })]);
    expect(edit.joinCrossfadeSeconds).toBe(0.01);
  });

  it("keeps a safe word-timed passage removable only when the shared readiness contract is ready", () => {
    expect(applyRecordingShareTranscriptReadiness(transcriptSegment, transcriptReadiness())).toEqual(transcriptSegment);
  });

  it("keeps a passage included when mixed-room speaker authority still needs review", () => {
    const readiness = transcriptReadiness({
      resultJson: { processingControl: { routing: { schema: "quipsly-transcript-routing-summary-v1", sourceTopology: "mixed-room", speakerAuthority: "provider-candidate", timingGranularity: "word", manifestBacked: true } } },
    });
    const guarded = applyRecordingShareTranscriptReadiness(transcriptSegment, readiness);

    expect(guarded).toMatchObject({
      cutSafety: "timing-unavailable",
      cutSafetyReason: expect.stringContaining("speaker labels remain candidates"),
    });
    expect(() => buildSessionRecordingShareEdit({
      startSeconds: 2,
      endSeconds: 20,
      transcriptSegments: [guarded],
      excludedTranscriptSegments: [{
        transcriptJobId: guarded.transcriptJobId,
        segmentId: guarded.segmentId,
        providerTextSha256: guarded.providerTextSha256,
        timingFingerprint: guarded.timingFingerprint,
      }],
    })).toThrow(/speaker labels remain candidates/i);
  });

  it("fails closed when a transcript selection no longer matches provider truth", () => {
    expect(() => buildSessionRecordingShareEdit({
      startSeconds: 2,
      endSeconds: 20,
      transcriptSegments: [transcriptSegment],
      excludedTranscriptSegments: [{
        transcriptJobId: transcriptSegment.transcriptJobId,
        segmentId: transcriptSegment.segmentId,
        providerTextSha256: "b".repeat(64),
        timingFingerprint: transcriptSegment.timingFingerprint,
      }],
    })).toThrow(/transcript changed/i);
  });

  it("fails closed when immutable word timing no longer matches the selection", () => {
    expect(() => buildSessionRecordingShareEdit({
      startSeconds: 2,
      endSeconds: 20,
      transcriptSegments: [transcriptSegment],
      excludedTranscriptSegments: [{
        transcriptJobId: transcriptSegment.transcriptJobId,
        segmentId: transcriptSegment.segmentId,
        providerTextSha256: transcriptSegment.providerTextSha256,
        timingFingerprint: "d".repeat(64),
      }],
    })).toThrow(/transcript changed/i);
  });

  it("keeps a passage when ripple deletion would cut overlapping speech", () => {
    expect(() => buildSessionRecordingShareEdit({
      startSeconds: 2,
      endSeconds: 20,
      transcriptSegments: [{
        ...transcriptSegment,
        cutSafety: "overlapping-speech",
        cutSafetyReason: "Another participant is speaking here.",
      }],
      excludedTranscriptSegments: [{
        transcriptJobId: transcriptSegment.transcriptJobId,
        segmentId: transcriptSegment.segmentId,
        providerTextSha256: transcriptSegment.providerTextSha256,
        timingFingerprint: transcriptSegment.timingFingerprint,
      }],
    })).toThrow(/another participant is speaking/i);
  });

  it("detects overlapping speech before the editor offers a ripple delete", () => {
    const [coach, client] = classifyRecordingShareTranscriptCutSafety([
      transcriptSegment,
      {
        ...transcriptSegment,
        transcriptJobId: "transcript_job_0002",
        segmentId: "transcript_segment_0002",
        sourceRecordingAssetId: "recording_asset_0002",
        timingFingerprint: "e".repeat(64),
        startSeconds: 12,
        endSeconds: 15,
        cutStartSeconds: 12.2,
        cutEndSeconds: 14.8,
      },
    ]);
    expect(coach?.cutSafety).toBe("overlapping-speech");
    expect(client?.cutSafety).toBe("overlapping-speech");
    expect(coach?.cutSafetyReason).toMatch(/another participant/i);
  });

  it("keeps same-source passages when their word timing overlaps", () => {
    const [first, second] = classifyRecordingShareTranscriptCutSafety([
      transcriptSegment,
      {
        ...transcriptSegment,
        segmentId: "transcript_segment_0002",
        timingFingerprint: "f".repeat(64),
        startSeconds: 13.7,
        endSeconds: 16,
        cutStartSeconds: 13.7,
        cutEndSeconds: 15.8,
      },
    ]);
    expect(first?.cutSafety).toBe("timing-overlap");
    expect(second?.cutSafety).toBe("timing-overlap");
    expect(first?.cutSafetyReason).toMatch(/shares timing with nearby words/i);
  });
});
