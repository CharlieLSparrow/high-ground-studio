/** @jest-environment node */

import { deterministicEditEvidence } from "./deterministic-edit-evidence";

describe("deterministic edit evidence", () => {
  function audioSignal(rmsDbfs: number) {
    return {
      recordingAssetId: "recording-1",
      sourceSha256: "a".repeat(64),
      storageGeneration: "generation-1",
      signalProfileSha256: "b".repeat(64),
      signal: {
        algorithm: "capture-energy-v1",
        thresholds: { nearSilenceDbfs: -72, surroundingSignalDbfs: -45 },
        waveform: [{ startSeconds: 2, durationSeconds: 3, rmsDbfs }],
      },
    } as never;
  }

  it("creates an exact reversible proposal only for explicit restart language", () => {
    const result = deterministicEditEvidence([
      { id: "restart", time: 10, duration: 3, text: "Let me restart that thought." },
    ]);

    expect(result.proposals).toEqual([
      expect.objectContaining({
        type: "deactivate",
        blockId: "restart",
        sourceRange: { startSeconds: 10, endSeconds: 13 },
        confidence: "high",
        changesSource: false,
        applied: false,
      }),
    ]);
    expect(result.proposals[0]?.evidence.transcriptTextSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps timing gaps as listen-only evidence and never calls them silence", () => {
    const result = deterministicEditEvidence([
      { id: "left", time: 0, duration: 2, text: "The first complete thought." },
      { id: "right", time: 5, duration: 2, text: "The next complete thought." },
    ]);

    expect(result.proposals).toHaveLength(0);
    expect(result.reviewCandidates).toEqual([
      expect.objectContaining({
        kind: "transcript-timing-gap",
        sourceRange: { startSeconds: 2, endSeconds: 5 },
        confidence: "low",
        suggestedAction: "listen",
        requiresSignalEvidence: true,
        changesSource: false,
      }),
    ]);
    expect(result.reviewCandidates[0]?.rationale).toMatch(/not proof of silence/i);
  });

  it("surfaces recording markers and repeated language without auto-cutting either", () => {
    const result = deterministicEditEvidence([
      { id: "first", time: 0, duration: 3, text: "This is the opening point we need.", alert: "Retake" },
      { id: "second", time: 3, duration: 3, text: "This is the opening point we need, with context." },
    ]);

    expect(result.proposals).toHaveLength(0);
    expect(result.reviewCandidates.map((candidate) => candidate.kind)).toEqual([
      "retake-marker",
      "repeated-language",
    ]);
    expect(new Set(result.reviewCandidates.map((candidate) => candidate.candidateId)).size).toBe(2);
  });

  it("creates an unapplied source-bound range proposal for a fully covered low-energy gap", () => {
    const result = deterministicEditEvidence([
      { id: "left", time: 0, duration: 2, text: "The first complete thought." },
      { id: "right", time: 5, duration: 2, text: "The next complete thought." },
    ], { audioSignal: audioSignal(-78) });

    expect(result.proposals).toEqual([
      expect.objectContaining({
        type: "deactivate_range",
        confidence: "medium",
        applied: false,
        changesSource: false,
        evidence: expect.objectContaining({
          audioSignal: expect.objectContaining({
            classification: "measured-low-energy",
            maximumRmsDbfs: -78,
            coverageFraction: 1,
          }),
        }),
      }),
    ]);
    expect(result.reviewCandidates).toHaveLength(0);
    expect(result.proposals[0]?.rationale).toMatch(/reversible range skip/i);
  });

  it("raises possible missing words when decoded signal is present inside a transcript gap", () => {
    const result = deterministicEditEvidence([
      { id: "left", time: 0, duration: 2, text: "The first complete thought." },
      { id: "right", time: 5, duration: 2, text: "The next complete thought." },
    ], { audioSignal: audioSignal(-24) });

    expect(result.reviewCandidates).toEqual([
      expect.objectContaining({
        kind: "transcript-gap-with-signal",
        confidence: "high",
        suggestedAction: "listen",
        requiresSignalEvidence: false,
        evidence: expect.objectContaining({
          audioSignal: expect.objectContaining({ classification: "measured-signal-present" }),
        }),
      }),
    ]);
    expect(result.reviewCandidates[0]?.rationale).toMatch(/untranscribed speech/i);
  });

  it("uses canonical speaker timing for overlap and camera-transition review", () => {
    const result = deterministicEditEvidence([
      { id: "charlie", time: 0, duration: 3, text: "I think this is the key point.", speaker: "Charlie" },
      { id: "homer", time: 2.5, duration: 2, text: "Yes, and here is why.", speaker: "Homer" },
    ]);

    expect(result.reviewCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "overlapping-speech",
        sourceRange: { startSeconds: 2.5, endSeconds: 3 },
        suggestedAction: "listen",
      }),
      expect.objectContaining({
        kind: "speaker-change",
        suggestedAction: "review-camera",
        confidence: "high",
      }),
    ]));
  });

  it("is deterministic across input ordering", () => {
    const blocks = [
      { id: "second", time: 5, duration: 2, text: "Second complete thought." },
      { id: "first", time: 0, duration: 2, text: "First complete thought." },
    ];
    expect(deterministicEditEvidence(blocks)).toEqual(deterministicEditEvidence([...blocks].reverse()));
  });
});
