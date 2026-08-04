/** @jest-environment node */

import { deterministicEditEvidence } from "./deterministic-edit-evidence";

describe("deterministic edit evidence", () => {
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

  it("is deterministic across input ordering", () => {
    const blocks = [
      { id: "second", time: 5, duration: 2, text: "Second complete thought." },
      { id: "first", time: 0, duration: 2, text: "First complete thought." },
    ];
    expect(deterministicEditEvidence(blocks)).toEqual(deterministicEditEvidence([...blocks].reverse()));
  });
});
