import { buildSessionEpisodeAssemblyEvidence } from "./session-episode-assembly-evidence";

const currentFingerprint = "a".repeat(64);

function build(overrides: Partial<Parameters<typeof buildSessionEpisodeAssemblyEvidence>[0]> = {}) {
  return buildSessionEpisodeAssemblyEvidence({
    roomId: "room-9",
    episodeProductionId: "episode-production-9",
    episodeTitle: "Episode 9",
    projectSlug: "high-ground-odyssey",
    episodeSlug: "episode-9",
    productionUpdatedAt: "2026-08-07T01:00:00.000Z",
    captureGroupId: "take-9",
    selectedMediaCount: 2,
    plannedSourceCount: 2,
    plan: {
      ok: true,
      status: "assembly-ready",
      captureGroupId: "take-9",
      changed: false,
      issues: [],
      nextAction: "Review deterministic camera assembly.",
    },
    timelineClipCount: 3,
    transcriptBlockCount: 10,
    materializations: [{
      captureGroupId: "take-9",
      roomId: "room-9",
      status: "assembly-ready",
      sourceBindings: [
        { recordingAssetId: "audio-9", clipId: "clip-audio-9" },
        { recordingAssetId: "video-9", clipId: "clip-video-9" },
      ],
      transcriptBinding: { blockIds: ["block-1", "block-2"] },
      materializedAt: "2026-08-07T00:00:00.000Z",
    }],
    proposalSets: [{ id: "proposal-current", timelineFingerprintSha256: currentFingerprint }],
    reviewReceipts: [],
    currentTimelineFingerprintSha256: currentFingerprint,
    ledgerAvailable: true,
    ...overrides,
  });
}

describe("Session Episode assembly evidence", () => {
  it("recognizes an exact persisted Capture take without treating proposals as edits", () => {
    const evidence = build();

    expect(evidence).toMatchObject({
      state: "MATERIALIZED_ASSEMBLY",
      canonicalTakeCount: 1,
      canonicalSourceCount: 2,
      sessionTimelineClipCount: 2,
      sessionTranscriptBlockCount: 2,
      currentProposalSetCount: 1,
      currentReviewReceiptCount: 0,
      canonicalTimelineSaveCount: 0,
    });
    expect(evidence.editorHref).toBe("/editor?project=high-ground-odyssey&episode=episode-9&captureGroup=take-9#automated-edit-evidence");
  });

  it("keeps a local draft action unsaved until a canonical save explicitly links it", () => {
    const draft = {
      id: "draft-action-1",
      proposalSetId: "proposal-current",
      action: "APPLIED_TO_DRAFT",
      scope: "LOCAL_DRAFT",
      evidenceJson: {},
      occurredAt: "2026-08-07T01:10:00.000Z",
    };
    const unsaved = build({ reviewReceipts: [draft] });
    expect(unsaved).toMatchObject({
      localDraftActionCount: 1,
      unsavedLocalDraftActionCount: 1,
      canonicalTimelineSaveCount: 0,
    });

    const saved = build({
      reviewReceipts: [draft, {
        id: "timeline-save-1",
        proposalSetId: null,
        action: "TIMELINE_SAVED",
        scope: "CANONICAL_TIMELINE",
        evidenceJson: { linkedReviewReceiptIds: [draft.id] },
        occurredAt: "2026-08-07T01:12:00.000Z",
      }],
    });
    expect(saved).toMatchObject({
      unsavedLocalDraftActionCount: 0,
      canonicallyLinkedDraftActionCount: 1,
      canonicalTimelineSaveCount: 1,
      latestCanonicalSaveAt: "2026-08-07T01:12:00.000Z",
    });
  });

  it("does not count proposal evidence bound to an older timeline as current", () => {
    const evidence = build({
      proposalSets: [{ id: "proposal-stale", timelineFingerprintSha256: "b".repeat(64) }],
      reviewReceipts: [{
        id: "stale-unsaved-draft",
        proposalSetId: "proposal-stale",
        action: "APPLIED_TO_DRAFT",
        scope: "LOCAL_DRAFT",
        evidenceJson: {},
        occurredAt: "2026-08-07T00:30:00.000Z",
      }],
    });

    expect(evidence).toMatchObject({
      currentProposalSetCount: 0,
      staleProposalSetCount: 1,
      localDraftActionCount: 0,
      unsavedLocalDraftActionCount: 0,
    });
  });

  it("reports a newly aligned take as ready rather than already persisted", () => {
    const evidence = build({
      plan: {
        ok: true,
        status: "assembly-ready",
        captureGroupId: "take-10",
        changed: true,
        issues: [{ severity: "warning" }],
        nextAction: "Materialize this take.",
      },
      captureGroupId: "take-10",
      materializations: [],
    });

    expect(evidence).toMatchObject({
      state: "READY_TO_MATERIALIZE",
      canonicalTakeCount: 0,
      warningCount: 1,
    });
    expect(evidence.editorHref).toContain("#capture-take-materialization");
  });

  it("keeps blocked evidence repair routed to Guided sync", () => {
    const evidence = build({
      plan: {
        ok: false,
        status: "blocked",
        captureGroupId: "take-10",
        changed: false,
        issues: [{ severity: "blocker" }],
        nextAction: "Review the changed protected-master set.",
      },
    });

    expect(evidence.state).toBe("BLOCKED");
    expect(evidence.editorHref).toContain("#guided-sync-wizard");
  });
});
