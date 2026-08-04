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
});
