import {
  buildTranscriptCorrectionImpact,
  transcriptCorrectionSnapshots,
} from "./transcript-correction-impact";

describe("transcript correction impact", () => {
  const impactFor = (evidence: unknown[], overrides: Record<string, unknown> = {}) =>
    buildTranscriptCorrectionImpact({
      transcriptJobId: "job-1",
      segments: [{ id: "segment-1", acceptedCorrectionId: "correction-new", text: "Write a page.", speakerLabel: "Charlie", ...overrides }],
      artifacts: [{ id: "task-1", kind: "task", label: "Writing", status: "OPEN", href: "/tasks/task-1", updatedAt: "2026-09-07T00:00:00Z", canAcknowledge: true, evidence }],
    }).get("segment-1")?.[0];
  const snapshot = (overrides: Record<string, unknown> = {}) => ({
    transcriptJobId: "job-1", segmentId: "segment-1", acceptedCorrectionId: "correction-old",
    effectiveTextSnapshot: "Write a page.", effectiveSpeakerLabelSnapshot: "Charlie", ...overrides,
  });

  it("does not turn identical words and speaker into work when only receipt history changes", () => {
    expect(impactFor([snapshot()])).toMatchObject({
      state: "current", evidenceCorrectionId: "correction-old", currentCorrectionId: "correction-new",
      changes: { text: "unchanged", speaker: "unchanged", correctionReceipt: "changed" },
    });
  });

  it("does not let a matching receipt hide changed text or speaker", () => {
    expect(impactFor([snapshot({ acceptedCorrectionId: "correction-new", effectiveTextSnapshot: "Write two pages." })]))
      .toMatchObject({ state: "needs-review", changes: { text: "changed", correctionReceipt: "unchanged" } });
    expect(impactFor([snapshot({ acceptedCorrectionId: "correction-new", effectiveSpeakerLabelSnapshot: "Scott" })]))
      .toMatchObject({ state: "needs-review", changes: { speaker: "changed", correctionReceipt: "unchanged" } });
  });

  it("distinguishes an explicitly unnamed speaker from missing speaker evidence", () => {
    expect(impactFor([snapshot({ effectiveSpeakerLabelSnapshot: null })], { speakerLabel: null }))
      .toMatchObject({ state: "current", changes: { speaker: "unchanged", correctionReceipt: "changed" } });
    expect(impactFor([snapshot({ effectiveSpeakerLabelSnapshot: null })]))
      .toMatchObject({ state: "needs-review", changes: { speaker: "changed" } });
    const incomplete: Record<string, unknown> = snapshot();
    delete incomplete.effectiveSpeakerLabelSnapshot;
    expect(impactFor([incomplete])).toMatchObject({ state: "needs-review", changes: { speaker: "unknown" } });
  });

  it("prefers exact source snapshots over a matching span-summary receipt", () => {
    const summary = { transcriptJobId: "job-1", segmentIds: ["segment-1", "segment-2"], acceptedCorrectionId: "correction-new" };
    for (const evidence of [[summary, snapshot({ effectiveTextSnapshot: "Old words." })], [snapshot({ effectiveTextSnapshot: "Old words." }), summary]]) {
      expect(impactFor(evidence)).toMatchObject({ state: "needs-review", priorTextSnapshot: "Old words." });
    }
  });

  it("does not compare combined span wording or speaker labels to an individual passage", () => {
    const summary = {
      transcriptJobId: "job-1", segmentIds: ["segment-1", "segment-2"], acceptedCorrectionId: "correction-new",
      effectiveTextSnapshot: "Write a page. Then call Scott.", effectiveSpeakerLabelSnapshot: null,
    };
    expect(impactFor([summary])).toMatchObject({
      state: "current", changes: { text: "unknown", speaker: "unknown", correctionReceipt: "unchanged" },
    });
    expect(impactFor([{ ...summary, acceptedCorrectionId: "correction-old" }])).toMatchObject({
      state: "needs-review", changes: { text: "unknown", speaker: "unknown", correctionReceipt: "changed" },
    });
  });

  it("finds a matching source among historical revisions without changing those snapshots", () => {
    const evidence = [snapshot({ effectiveTextSnapshot: "Earlier words." }), snapshot()];
    const original = JSON.stringify(evidence);
    expect(impactFor(evidence)).toMatchObject({ state: "current", priorTextSnapshot: "Write a page." });
    expect(JSON.stringify(evidence)).toBe(original);
  });

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
