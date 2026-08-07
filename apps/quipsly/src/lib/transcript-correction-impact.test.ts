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
      expect.objectContaining({ segmentId: "segment-1", acceptedCorrectionId: null, correctionSnapshotPresent: true }),
      expect.objectContaining({ segmentId: "segment-2", acceptedCorrectionId: "correction-2", correctionSnapshotPresent: true }),
    ]));
    expect(snapshots.some((snapshot) => snapshot.segmentId === "segment-old")).toBe(false);
  });

  it("distinguishes current, stale, and unversioned derived work", () => {
    const impacts = buildTranscriptCorrectionImpact({
      transcriptJobId: "job-1",
      segments: [
        { id: "segment-1", acceptedCorrectionId: "correction-new", text: "Ship Thursday.", speakerLabel: "Charlie" },
        { id: "segment-2", acceptedCorrectionId: null, text: "Publish consistently.", speakerLabel: "Scott" },
      ],
      artifacts: [
        {
          id: "note-stale",
          kind: "note",
          label: "Episode note",
          status: null,
          href: "/notes/note-stale",
          updatedAt: "2026-08-06T18:00:00.000Z",
          canAcknowledge: true,
          evidence: [{ transcriptJobId: "job-1", segmentId: "segment-1", acceptedCorrectionId: null, effectiveTextSnapshot: "Ship tomorrow.", effectiveSpeakerLabelSnapshot: "Charlie" }],
        },
        {
          id: "task-current",
          kind: "task",
          label: "Fix chapter title",
          status: "OPEN",
          href: "/work?task=task-current",
          updatedAt: "2026-08-06T18:00:01.000Z",
          canAcknowledge: true,
          evidence: [{ transcriptJobId: "job-1", segmentIds: ["segment-1"], sourceSpan: { segments: [{ segmentId: "segment-1", acceptedCorrectionId: "correction-new", effectiveTextSnapshot: "Ship Thursday.", effectiveSpeakerLabelSnapshot: "Charlie" }] } }],
        },
        {
          id: "goal-unversioned",
          kind: "goal",
          label: "Publish consistently",
          status: "ACTIVE",
          href: "/work?goal=goal-unversioned",
          updatedAt: "2026-08-06T18:00:02.000Z",
          canAcknowledge: true,
          evidence: [{ transcriptJobId: "job-1", segmentId: "segment-2" }],
        },
      ],
    });
    expect(impacts.get("segment-1")).toEqual([
      expect.objectContaining({
        artifactId: "note-stale",
        state: "needs-review",
        href: "/notes/note-stale",
        priorTextSnapshot: "Ship tomorrow.",
        currentTextSnapshot: "Ship Thursday.",
        changes: { text: "changed", speaker: "unchanged", correctionReceipt: "changed" },
      }),
      expect.objectContaining({
        artifactId: "task-current",
        state: "current",
        changes: { text: "unchanged", speaker: "unchanged", correctionReceipt: "unchanged" },
      }),
    ]);
    expect(impacts.get("segment-2")).toEqual([
      expect.objectContaining({ artifactId: "goal-unversioned", state: "snapshot-unavailable" }),
    ]);
  });
});
