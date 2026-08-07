import { buildSessionFinishingCockpit, type SessionFinishingEvidence } from "./session-finishing-cockpit";
import { EMPTY_SESSION_READINESS_TOPOLOGY, type SessionReadinessTopology } from "./session-readiness-topology";
import type { SessionSourceEvidence } from "./session-source-evidence-model";

function topology(overrides: Partial<SessionReadinessTopology["exitReadiness"]> = {}): SessionReadinessTopology {
  return {
    ...EMPTY_SESSION_READINESS_TOPOLOGY,
    exitReadiness: {
      ...EMPTY_SESSION_READINESS_TOPOLOGY.exitReadiness,
      state: "SAFE_TO_LEAVE",
      label: "Safe to leave every reconciled recording endpoint",
      detail: "Exact server masters and endpoint queues agree.",
      requiredSourceCount: 2,
      serverSafeRequiredSourceCount: 2,
      endpointQueueCount: 2,
      drainedEndpointCount: 2,
      safeForServerObservedSources: true,
      allEndpointQueuesConfirmedEmpty: true,
      safeToLeaveAllEndpoints: true,
      ...overrides,
    },
  };
}

function sourceEvidence(overrides: Partial<SessionSourceEvidence["counts"]> = {}): SessionSourceEvidence {
  return {
    sources: [],
    counts: { VERIFIED_MATCH: 2, HELD: 0, DRIFT: 0, INCOMPLETE: 0, ...overrides },
  };
}

const finishingEvidence: SessionFinishingEvidence = {
  transcriptJobs: [{
    id: "transcript-1",
    recordingAssetId: "asset-1",
    status: "COMPLETED",
    segmentCount: 80,
    updatedAt: "2026-08-06T20:00:00.000Z",
  }],
  outputs: [],
  analyzedSourceCount: 1,
};

describe("Session finishing cockpit", () => {
  it("ranks source safety and integrity ahead of downstream review work", () => {
    const cockpit = buildSessionFinishingCockpit({
      topology: topology({
        state: "SERVER_COPY_INCOMPLETE",
        label: "Do not close recording devices yet",
        detail: "One phone queue remains open.",
        safeToLeaveAllEndpoints: false,
        allEndpointQueuesConfirmedEmpty: false,
        drainedEndpointCount: 1,
      }),
      sourceEvidence: sourceEvidence({ DRIFT: 1 }),
      contentReadiness: { status: "capture-proof-only", captureAssetCount: 2, substantialRecordingCount: 0 },
      studioHandoff: { recordings: [{ status: "READY_FOR_HANDOFF" }] },
      finishingEvidence,
    });

    expect(cockpit.attention.map((item) => item.id).slice(0, 2)).toEqual(["source-exit", "source-integrity"]);
    expect(cockpit.counts).toMatchObject({ blockers: 2, high: 1 });
    expect(cockpit.stages[0]).toMatchObject({ id: "recover", state: "BLOCKED" });
  });

  it("keeps analyzed audio distinct from reviewed repair and Studio attachment from assembly completion", () => {
    const cockpit = buildSessionFinishingCockpit({
      topology: topology(),
      sourceEvidence: sourceEvidence(),
      contentReadiness: { status: "substantial", captureAssetCount: 2, substantialRecordingCount: 2 },
      studioHandoff: { recordings: [{ status: "ATTACHED" }, { status: "ATTACHED" }] },
      finishingEvidence: { ...finishingEvidence, analyzedSourceCount: 2 },
    });

    expect(cockpit.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "repair", state: "IN_PROGRESS", summary: expect.stringContaining("requires audition") }),
      expect.objectContaining({ id: "assemble", state: "IN_PROGRESS", summary: expect.stringContaining("not inferred") }),
      expect.objectContaining({ id: "finish", state: "NOT_OBSERVED" }),
    ]));
  });

  it("projects governed delivery evidence without calling the whole workflow finished", () => {
    const cockpit = buildSessionFinishingCockpit({
      topology: topology(),
      sourceEvidence: sourceEvidence(),
      contentReadiness: { status: "substantial", captureAssetCount: 2, substantialRecordingCount: 2 },
      studioHandoff: { recordings: [{ status: "ATTACHED" }, { status: "ATTACHED" }] },
      finishingEvidence: {
        ...finishingEvidence,
        analyzedSourceCount: 2,
        outputs: [{ id: "output-1", kind: "CLIENT_FOLLOW_UP", status: "RELEASED", deliveryCount: 1, updatedAt: "2026-08-06T21:00:00.000Z" }],
      },
    });

    expect(cockpit.stages.find((stage) => stage.id === "finish")).toMatchObject({
      state: "IN_PROGRESS",
      evidence: "1 released output · 1 delivery event",
    });
  });

  it("projects podcast package depth separately from coaching or Session delivery", () => {
    const cockpit = buildSessionFinishingCockpit({
      topology: topology(),
      sourceEvidence: sourceEvidence(),
      contentReadiness: { status: "substantial", captureAssetCount: 2, substantialRecordingCount: 2 },
      studioHandoff: { recordings: [{ status: "ATTACHED" }, { status: "ATTACHED" }] },
      finishingEvidence: {
        ...finishingEvidence,
        analyzedSourceCount: 2,
        versionedOutput: { sources: 2, activeMasters: 1, verifiedArtifacts: 1, approvedArtifacts: 1, packetEligible: 1, selectedPackets: 1, metadataComplete: false, enclosurePublic: false, publicationEligible: false },
      },
    });

    expect(cockpit.attention).toEqual(expect.arrayContaining([expect.objectContaining({ id: "episode-package-open-facts", lane: "outputs" })]));
    expect(cockpit.stages.find((stage) => stage.id === "finish")).toMatchObject({ state: "IN_PROGRESS", summary: expect.stringContaining("hosting, metadata, upload, and publication remain separate") });
    expect(cockpit.stages.find((stage) => stage.id === "finish")?.evidence).toContain("1 proof-listened artifact · 1 selected package");
  });

  it("separates a materialized Episode take, current proposals, local drafts, and canonical saves", () => {
    const cockpit = buildSessionFinishingCockpit({
      topology: topology(),
      sourceEvidence: sourceEvidence(),
      contentReadiness: { status: "substantial", captureAssetCount: 2, substantialRecordingCount: 2 },
      studioHandoff: { recordings: [{ status: "ATTACHED" }, { status: "ATTACHED" }] },
      finishingEvidence: {
        ...finishingEvidence,
        analyzedSourceCount: 2,
        assembly: {
          episodeProductionId: "episode-9",
          episodeTitle: "Episode 9",
          projectSlug: "high-ground-odyssey",
          episodeSlug: "episode-9",
          editorHref: "/editor?project=high-ground-odyssey&episode=episode-9#automated-edit-evidence",
          state: "MATERIALIZED_ASSEMBLY",
          captureGroupId: "take-9",
          selectedMediaCount: 2,
          plannedSourceCount: 2,
          blockerCount: 0,
          warningCount: 0,
          nextAction: "Review deterministic camera assembly.",
          canonicalTakeCount: 1,
          canonicalSourceCount: 2,
          canonicalAssemblyReadyCount: 1,
          sessionTimelineClipCount: 2,
          sessionTranscriptBlockCount: 80,
          episodeTimelineClipCount: 3,
          episodeTranscriptBlockCount: 80,
          currentProposalSetCount: 1,
          staleProposalSetCount: 2,
          currentReviewReceiptCount: 2,
          proofListenCount: 1,
          proofWatchCount: 0,
          localDraftActionCount: 1,
          unsavedLocalDraftActionCount: 1,
          canonicalTimelineSaveCount: 1,
          canonicallyLinkedDraftActionCount: 0,
          latestCanonicalSaveAt: "2026-08-07T01:00:00.000Z",
          ledgerAvailable: true,
          productionUpdatedAt: "2026-08-07T01:00:00.000Z",
        },
      },
    });

    expect(cockpit.attention).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "episode-local-draft-unsaved", severity: "HIGH" }),
    ]));
    expect(cockpit.stages.find((stage) => stage.id === "assemble")).toMatchObject({
      state: "IN_PROGRESS",
      summary: expect.stringContaining("assembly-ready"),
      href: expect.stringContaining("/editor?"),
    });
  });

  it("turns camera evidence into a precise cross-workflow next action", () => {
    const cockpit = buildSessionFinishingCockpit({
      topology: topology(),
      sourceEvidence: sourceEvidence(),
      contentReadiness: { status: "substantial", captureAssetCount: 2, substantialRecordingCount: 2 },
      studioHandoff: { recordings: [{ status: "ATTACHED" }, { status: "ATTACHED" }] },
      finishingEvidence: {
        ...finishingEvidence,
        analyzedSourceCount: 2,
        assembly: {
          episodeProductionId: "episode-9",
          episodeTitle: "Episode 9",
          projectSlug: "high-ground-odyssey",
          episodeSlug: "episode-9",
          editorHref: "/editor?project=high-ground-odyssey&episode=episode-9#automated-edit-evidence",
          state: "MATERIALIZED_MEDIA",
          captureGroupId: "take-9",
          selectedMediaCount: 2,
          plannedSourceCount: 2,
          blockerCount: 0,
          warningCount: 1,
          nextAction: "Resolve camera review.",
          cameraReadiness: {
            status: "PRIMARY_ANGLE_REQUIRED",
            videoSourceCount: 2,
            participantBoundVideoSourceCount: 2,
            unboundVideoSourceCount: 0,
            reviewedSpeakerCount: 1,
            attributedSpeakerCount: 1,
            mappedSpeakerCount: 0,
            participantCount: 1,
            missingParticipantCount: 0,
            ambiguousParticipantCount: 1,
            nextAction: "Choose a primary synchronized camera for every reviewed speaker.",
            actionHref: "/editor?project=high-ground-odyssey&episode=episode-9#automated-edit-evidence",
            actionLabel: "Choose primary cameras",
          },
          canonicalTakeCount: 1,
          canonicalSourceCount: 2,
          canonicalAssemblyReadyCount: 0,
          sessionTimelineClipCount: 2,
          sessionTranscriptBlockCount: 80,
          episodeTimelineClipCount: 2,
          episodeTranscriptBlockCount: 80,
          currentProposalSetCount: 0,
          staleProposalSetCount: 0,
          currentReviewReceiptCount: 0,
          proofListenCount: 0,
          proofWatchCount: 0,
          localDraftActionCount: 0,
          unsavedLocalDraftActionCount: 0,
          canonicalTimelineSaveCount: 1,
          canonicallyLinkedDraftActionCount: 0,
          latestCanonicalSaveAt: "2026-08-07T01:00:00.000Z",
          ledgerAvailable: true,
          productionUpdatedAt: "2026-08-07T01:00:00.000Z",
        },
      },
    });

    expect(cockpit.attention).toEqual(expect.arrayContaining([expect.objectContaining({
      id: "episode-take-media-only",
      title: "A reviewed speaker still needs a primary camera",
      actionLabel: "Choose primary cameras",
      href: expect.stringContaining("#automated-edit-evidence"),
    })]));
    expect(cockpit.stages.find((stage) => stage.id === "assemble")?.evidence).toContain("2 video sources · 0 camera maps");
  });
});
