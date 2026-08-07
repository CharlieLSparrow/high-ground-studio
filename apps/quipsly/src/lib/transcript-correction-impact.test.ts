import {
  buildTranscriptCorrectionImpact,
  transcriptCorrectionSnapshots,
} from "./transcript-correction-impact";

describe("transcript correction impact", () => {
  it("collects anchors only beneath the selected transcript job", () => {
    const snapshots = transcriptCorrectionSnapshots({
      transcriptJobId: "job-current",
      segmentId: "segment-1",
      acceptedCorrectionId: null,
      receipts: [
        { segmentId: "segment-2", acceptedCorrectionId: "correction-2" },
        { transcriptJobId: "job-old", segmentId: "segment-old", acceptedCorrectionId: null },
      ],
    }, "job-current");
    expect(snapshots).toEqual(expect.arrayContaining([
      { segmentId: "segment-1", acceptedCorrectionId: null, correctionSnapshotPresent: true },
      { segmentId: "segment-2", acceptedCorrectionId: "correction-2", correctionSnapshotPresent: true },
    ]));
    expect(snapshots.some((snapshot) => snapshot.segmentId === "segment-old")).toBe(false);
  });

  it("distinguishes current, stale, and unversioned derived work", () => {
    const impacts = buildTranscriptCorrectionImpact({
      transcriptJobId: "job-1",
      segments: [
        { id: "segment-1", acceptedCorrectionId: "correction-new" },
        { id: "segment-2", acceptedCorrectionId: null },
      ],
      artifacts: [
        {
          id: "note-stale",
          kind: "note",
          label: "Episode note",
          status: null,
          evidence: [{ transcriptJobId: "job-1", segmentId: "segment-1", acceptedCorrectionId: null }],
        },
        {
          id: "task-current",
          kind: "task",
          label: "Fix chapter title",
          status: "OPEN",
          evidence: [{ transcriptJobId: "job-1", segmentIds: ["segment-1"], sourceSpan: { segments: [{ segmentId: "segment-1", acceptedCorrectionId: "correction-new" }] } }],
        },
        {
          id: "goal-unversioned",
          kind: "goal",
          label: "Publish consistently",
          status: "ACTIVE",
          evidence: [{ transcriptJobId: "job-1", segmentId: "segment-2" }],
        },
      ],
    });
    expect(impacts.get("segment-1")).toEqual([
      expect.objectContaining({ artifactId: "note-stale", state: "needs-review" }),
      expect.objectContaining({ artifactId: "task-current", state: "current" }),
    ]);
    expect(impacts.get("segment-2")).toEqual([
      expect.objectContaining({ artifactId: "goal-unversioned", state: "snapshot-unavailable" }),
    ]);
  });
});
