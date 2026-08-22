/** @jest-environment node */

jest.mock("server-only", () => ({}));

import { buildSessionRecordingShareEdit, newestCoherentRecordingTake, stableJson } from "./session-recording-share";

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
  const transcriptSegment = {
    transcriptJobId: "transcript_job_0001",
    segmentId: "transcript_segment_0001",
    sourceRecordingAssetId: "recording_asset_0001",
    providerTextSha256: "a".repeat(64),
    speakerLabel: "Coach",
    text: "This passage should not be in the shared copy.",
    startSeconds: 10,
    endSeconds: 14,
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
      }],
    });
    expect(edit.keptRanges).toEqual([
      expect.objectContaining({ startSeconds: 2, endSeconds: 10 }),
      expect.objectContaining({ startSeconds: 14, endSeconds: 20 }),
    ]);
    expect(edit.transcriptExclusions).toEqual([expect.objectContaining({
      sourceRecordingAssetId: "recording_asset_0001",
      startSeconds: 10,
      endSeconds: 14,
    })]);
    expect(edit.joinCrossfadeSeconds).toBe(0.01);
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
      }],
    })).toThrow(/transcript changed/i);
  });
});
