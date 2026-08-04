import { act, renderHook } from "@testing-library/react";

import { deactivatedTimelineIntervals, useTimelineState } from "./useTimelineState";

describe("timeline range edits", () => {
  it("merges overlapping transcript and exact-range decisions for one playback skip", () => {
    expect(deactivatedTimelineIntervals({
      clips: [],
      transcript: [{ id: "words", time: 2, duration: 2, text: "restart", deleted: true, alert: null }],
      deactivatedRanges: [{
        id: "range-1",
        startSeconds: 3,
        durationSeconds: 3,
        reason: "Measured low energy.",
        source: "deterministic-signal",
      }],
    })).toEqual([{ startSeconds: 2, endSeconds: 6, ids: ["transcript:words", "range:range-1"] }]);
  });

  it("adds, undoes, and redoes a source-bound exact range without changing transcript", () => {
    const { result } = renderHook(() => useTimelineState({
      clips: [],
      transcript: [{ id: "left", time: 0, duration: 2, text: "Keep me", deleted: false, alert: null }],
    }));

    act(() => result.current.addDeactivatedRange({
      id: "ai-range-1",
      startSeconds: 2,
      durationSeconds: 3,
      reason: "Measured low energy.",
      source: "deterministic-signal",
      aiSuggested: true,
      sourceEvidence: {
        recordingAssetId: "recording-1",
        sourceSha256: "a".repeat(64),
        storageGeneration: "generation-1",
        signalProfileSha256: "b".repeat(64),
        classification: "measured-low-energy",
        coverageFraction: 1,
        maximumRmsDbfs: -78,
        nearSilenceDbfs: -72,
      },
    }));

    expect(result.current.state.deactivatedRanges).toHaveLength(1);
    expect(result.current.state.transcript[0]?.deleted).toBe(false);
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.state.deactivatedRanges).toEqual([]);
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    expect(result.current.state.deactivatedRanges?.[0]).toEqual(expect.objectContaining({
      id: "ai-range-1",
      source: "deterministic-signal",
      aiSuggested: true,
    }));

    act(() => result.current.removeDeactivatedRange("ai-range-1"));
    expect(result.current.state.deactivatedRanges).toEqual([]);
    expect(result.current.state.transcript[0]?.text).toBe("Keep me");
    act(() => result.current.undo());
    expect(result.current.state.deactivatedRanges?.[0]?.id).toBe("ai-range-1");
  });

  it("rejects malformed persisted range decisions instead of moving them to zero", () => {
    const { result } = renderHook(() => useTimelineState({
      clips: [],
      transcript: [],
      deactivatedRanges: [{
        id: "invalid-negative",
        startSeconds: -3,
        durationSeconds: 2,
        reason: "Invalid imported edit",
        source: "imported-edit",
      }],
    }));

    expect(result.current.state.deactivatedRanges).toEqual([]);
  });

  it("persists camera identity and clears a stale assembled cut when the mapping changes", () => {
    const { result } = renderHook(() => useTimelineState({
      clips: [
        { id: "cam-1", assetId: "one.mp4", kind: "video", startIn: 0, duration: 10, sourceStart: 0, name: "One", color: "#111", trackId: "V1" },
        { id: "cam-2", assetId: "two.mp4", kind: "video", startIn: 0, duration: 10, sourceStart: 0, name: "Two", color: "#222", trackId: "V2" },
      ],
      transcript: [],
    }));

    act(() => result.current.setSpeakerCameraMapping({
      id: "map-charlie",
      speakerKey: "charlie",
      speakerLabel: "Charlie",
      targetClipId: "cam-1",
      targetAssetId: "one.mp4",
      source: "manual",
      createdAt: "2026-08-03T00:00:00.000Z",
    }));
    act(() => result.current.setCameraSwitchDecisions([{
      id: "camera-switch:map-charlie:0",
      startSeconds: 0,
      durationSeconds: 10,
      speakerKey: "charlie",
      speakerLabel: "Charlie",
      targetClipId: "cam-1",
      targetAssetId: "one.mp4",
      mappingId: "map-charlie",
      source: "deterministic-speaker",
      status: "draft",
      createdAt: "2026-08-03T00:00:00.000Z",
      evidence: { transcriptBlockIds: ["b1"] },
    }]));
    expect(result.current.state.cameraSwitchDecisions).toHaveLength(1);

    act(() => result.current.setSpeakerCameraMapping({
      id: "map-charlie",
      speakerKey: "CHARLIE",
      speakerLabel: "Charlie",
      targetClipId: "cam-2",
      targetAssetId: "two.mp4",
      source: "manual",
      createdAt: "2026-08-03T00:00:00.000Z",
    }));
    expect(result.current.state.speakerCameraMappings?.[0]?.speakerKey).toBe("charlie");
    expect(result.current.state.speakerCameraMappings?.[0]?.targetClipId).toBe("cam-2");
    expect(result.current.state.cameraSwitchDecisions).toEqual([]);

    act(() => result.current.undo());
    expect(result.current.state.cameraSwitchDecisions).toHaveLength(1);
    expect(result.current.state.speakerCameraMappings?.[0]?.targetClipId).toBe("cam-1");
  });
});
