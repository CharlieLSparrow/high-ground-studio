/** @jest-environment node */

import {
  readTranscriptDerivedTaskSource,
  readTranscriptSourceSpan,
  TRANSCRIPT_DERIVED_TASK_SCHEMA,
} from "@high-ground/quipsly-domain/transcript-derived-task";

import { projectTranscriptSegmentsForPacket } from "./coaching-packets";
import { buildTranscriptSourceAnchorFields, resolveTranscriptSpanSegments } from "./transcript-source-span";

describe("versioned transcript source spans", () => {
  const segments = projectTranscriptSegmentsForPacket([
    { id: "segment-1", speakerLabel: "Coach", startSeconds: 6, endSeconds: 11, text: "Preserve the recording and", corrections: [], verifications: [] },
    { id: "segment-2", speakerLabel: "Coach", startSeconds: 11, endSeconds: 16, text: "wait for explicit release.", corrections: [], verifications: [] },
  ]);

  it("preserves every constituent hash while retaining the first segment as the deep link", () => {
    const anchor = buildTranscriptSourceAnchorFields(segments);
    expect(anchor).toMatchObject({
      segmentId: "segment-1",
      segmentIds: ["segment-1", "segment-2"],
      startSeconds: 6,
      endSeconds: 16,
      effectiveTextSnapshot: "Preserve the recording and wait for explicit release.",
      sourceSpan: {
        schema: "quipsly-transcript-source-span-v1",
        primarySegmentId: "segment-1",
        segmentIds: ["segment-1", "segment-2"],
        segments: [
          expect.objectContaining({ segmentId: "segment-1", providerTextSha256: segments[0]?.providerTextSha256 }),
          expect.objectContaining({ segmentId: "segment-2", providerTextSha256: segments[1]?.providerTextSha256 }),
        ],
      },
    });
    expect(readTranscriptSourceSpan(anchor?.sourceSpan)).toEqual(anchor?.sourceSpan);

    const source = {
      schema: TRANSCRIPT_DERIVED_TASK_SCHEMA,
      roomId: "room-1",
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      playbackSourceId: "playback-1",
      ...anchor,
    };
    expect(readTranscriptDerivedTaskSource(source)).toMatchObject({
      segmentId: "segment-1",
      startSeconds: 6,
      endSeconds: 16,
      effectiveTextSnapshot: "Preserve the recording and wait for explicit release.",
      sourceSpan: { segmentIds: ["segment-1", "segment-2"] },
    });
  });

  it("fails closed when a constituent provider hash or ordered identity is changed", () => {
    const anchor = buildTranscriptSourceAnchorFields(segments)!;
    const changedHash = structuredClone(anchor.sourceSpan!);
    changedHash.segments[1]!.providerTextSha256 = "not-a-provider-hash";
    expect(readTranscriptSourceSpan(changedHash)).toBeNull();

    const changedOrder = structuredClone(anchor.sourceSpan!);
    changedOrder.segmentIds.reverse();
    expect(readTranscriptSourceSpan(changedOrder)).toBeNull();
  });

  it("rejects a span that skips newly interleaved transcript evidence", () => {
    const interleaved = projectTranscriptSegmentsForPacket([
      { id: "segment-1", speakerLabel: "Coach", startSeconds: 6, endSeconds: 11, text: "Preserve the recording and", corrections: [], verifications: [] },
      { id: "segment-unexpected", speakerLabel: "Client", startSeconds: 11, endSeconds: 12, text: "Yes.", corrections: [], verifications: [] },
      { id: "segment-2", speakerLabel: "Coach", startSeconds: 12, endSeconds: 16, text: "wait for explicit release.", corrections: [], verifications: [] },
    ]);
    expect(resolveTranscriptSpanSegments({
      segmentIds: ["segment-1", "segment-2"],
      primarySegmentId: "segment-1",
      segments: interleaved,
    })).toBeNull();
  });
});
