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
});
