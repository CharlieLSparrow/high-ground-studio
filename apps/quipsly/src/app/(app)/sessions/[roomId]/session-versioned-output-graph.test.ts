import { buildSessionVersionedOutputGraph, type SessionOutputGraphAssetInput, type SessionOutputGraphProgramMixInput } from "./session-versioned-output-graph";

const episode = { id: "episode-9", projectSlug: "high-ground-odyssey", slug: "episode-9", title: "Episode 9" };

function asset(overrides: Partial<SessionOutputGraphAssetInput> = {}): SessionOutputGraphAssetInput {
  return {
    recordingAssetId: "recording-1",
    mediaAssetId: "asset-1",
    sourceId: "source-1",
    label: "Homer iPhone audio",
    attachmentRole: "primary-audio",
    masterCandidate: null,
    deliveryArtifact: null,
    ...overrides,
  };
}

function programMix(overrides: Partial<SessionOutputGraphProgramMixInput> = {}): SessionOutputGraphProgramMixInput {
  return {
    jobId: "episode-mix-1",
    assetId: "episode-mix-asset-1",
    sourceTrackCount: 3,
    programFingerprintSha256: "d".repeat(64),
    proposalSha256: "e".repeat(64),
    previewSha256: "f".repeat(64),
    reviewReceiptId: "episode-mix-review-1",
    promotionReceiptId: "episode-mix-promotion-1",
    operation: "PROMOTE" as const,
    playbackUrl: "/api/ingest/media/program-mix-1",
    occurredAt: "2026-08-06T22:30:00.000Z",
    historicalEventCount: 1,
    deliveryArtifact: null,
    integrity: {
      jobCompleted: true,
      assetRegistered: true,
      reviewApproved: true,
      promotionMatchesJob: true,
      promotionMatchesReview: true,
      promotionMatchesProposal: true,
      promotionMatchesBaseline: true,
      promotionMatchesPreview: true,
      promotionMatchesProgram: true,
    },
    ...overrides,
  };
}

describe("versioned Episode output graph", () => {
  it("keeps source, mastering, delivery, proof-listen, and packet states separate", () => {
    const graph = buildSessionVersionedOutputGraph({
      episode,
      assets: [asset({
        masterCandidate: { active: true, eventId: "promotion-1", jobId: "master-1", reviewReceiptId: "master-review-1", playbackUrl: "/master", occurredAt: "2026-08-06T20:00:00.000Z", historicalEventCount: 1 },
        deliveryArtifact: { jobId: "delivery-1", status: "completed", promotionReceiptId: "promotion-1", deliverySha256: "b".repeat(64), playbackUrl: "/delivery", promotionStillActive: true, review: null, readiness: { encodedAndVerified: true, proofListenApproved: false, outputPacketEligible: false } },
      })],
      selections: [],
    });

    expect(graph.assets[0]).toMatchObject({ masterState: "ACTIVE", deliveryState: "PROOF_LISTEN_REQUIRED", packetState: "NOT_SELECTED", packetEligible: false });
    expect(graph.assets[0].nextAction).toContain("beginning, midpoint, and ending");
    expect(graph.counts).toMatchObject({ sources: 1, activeMasters: 1, verifiedArtifacts: 1, approvedArtifacts: 0, selectedPackets: 0 });
    expect(graph.boundaries).toEqual(expect.objectContaining({ proofListenIsNotPacketSelection: true, packetSelectionIsNotUpload: true, uploadIsNotPublication: true }));
  });

  it("projects the latest append-only selection without calling it publication", () => {
    const packetJson = { audio: { assetId: "asset-1" }, episode: { title: "Curiosity and coaching", description: "Reviewed Episode notes.", episodeType: "full", seasonNumber: 2, episodeNumber: 9, publishAt: "2026-08-25T15:00:00.000Z" }, readiness: { metadataComplete: true, enclosurePublic: false, publicationEligible: false } };
    const graph = buildSessionVersionedOutputGraph({
      episode,
      assets: [asset({
        masterCandidate: { active: true, eventId: "promotion-1", jobId: "master-1", reviewReceiptId: "master-review-1", playbackUrl: "/master", occurredAt: "2026-08-06T20:00:00.000Z", historicalEventCount: 1 },
        deliveryArtifact: { jobId: "delivery-1", status: "completed", promotionReceiptId: "promotion-1", deliverySha256: "b".repeat(64), playbackUrl: "/delivery", promotionStillActive: true, review: { id: "delivery-review-1", decision: "approved", reviewedAt: "2026-08-06T21:00:00.000Z" }, readiness: { encodedAndVerified: true, proofListenApproved: true, outputPacketEligible: true } },
      })],
      selections: [{ id: "selection-1", operation: "SELECT", outputPacketId: "packet-1", packetDigestSha256: "c".repeat(64), artifactSha256: "b".repeat(64), occurredAt: "2026-08-06T22:00:00.000Z", reason: null, packet: { id: "packet-1", slug: "episode-9-package", title: "Episode 9 package", status: "needs-review", packetJson } }],
    });

    expect(graph.assets[0]).toMatchObject({ deliveryState: "APPROVED", packetState: "SELECTED" });
    expect(graph.currentPacket).toMatchObject({ id: "packet-1", title: "Curiosity and coaching", description: "Reviewed Episode notes.", episodeType: "full", seasonNumber: 2, episodeNumber: 9, publishAt: "2026-08-25T15:00:00.000Z", metadataComplete: true, enclosurePublic: false, publicationEligible: false });
    expect(graph.counts.selectedPackets).toBe(1);
  });

  it("makes a withdrawal current while preserving the selected packet in history", () => {
    const graph = buildSessionVersionedOutputGraph({
      episode,
      assets: [asset({ deliveryArtifact: { jobId: "delivery-1", status: "completed", promotionReceiptId: "promotion-1", deliverySha256: "b".repeat(64), playbackUrl: "/delivery", promotionStillActive: true, review: { id: "review-1", decision: "approved", reviewedAt: null }, readiness: { encodedAndVerified: true, proofListenApproved: true, outputPacketEligible: true } } })],
      selections: [
        { id: "withdraw-1", operation: "WITHDRAW", outputPacketId: "packet-1", packetDigestSha256: "c".repeat(64), artifactSha256: "b".repeat(64), occurredAt: "2026-08-06T23:00:00.000Z", reason: "Replace mix", packet: { id: "packet-1", slug: "episode-9-package", title: "Episode 9 package", status: "needs-review", packetJson: { audio: { assetId: "asset-1" } } } },
        { id: "selection-1", operation: "SELECT", outputPacketId: "packet-1", packetDigestSha256: "c".repeat(64), artifactSha256: "b".repeat(64), occurredAt: "2026-08-06T22:00:00.000Z", reason: null, packet: { id: "packet-1", slug: "episode-9-package", title: "Episode 9 package", status: "needs-review", packetJson: { audio: { assetId: "asset-1" } } } },
      ],
    });

    expect(graph.currentPacket).toBeNull();
    expect(graph.assets[0].packetState).toBe("WITHDRAWN");
    expect(graph.selectionHistoryCount).toBe(2);
  });

  it("projects a reviewed program mix above single-source masters", () => {
    const graph = buildSessionVersionedOutputGraph({
      episode,
      programMix: programMix(),
      assets: [asset({
        deliveryArtifact: { jobId: "delivery-1", status: "completed", promotionReceiptId: "promotion-1", deliverySha256: "b".repeat(64), playbackUrl: "/delivery", promotionStillActive: true, review: { id: "review-1", decision: "approved", reviewedAt: null }, readiness: { encodedAndVerified: true, proofListenApproved: true, outputPacketEligible: true } },
      })],
      selections: [],
    });

    expect(graph.programMix).toMatchObject({
      state: "ACTIVE",
      sourceTrackCount: 3,
      packetState: "NOT_SELECTED",
      editorHref: "/audio?project=high-ground-odyssey&episode=episode-9#episode-audio-mix",
    });
    expect(graph.assets[0]).toMatchObject({ alternateToActiveProgramMix: true, packetEligible: true });
    expect(graph.assets[0].nextAction).toContain("single-source branch");
    expect(graph.counts).toMatchObject({ activeProgramMixes: 1, packetEligible: 0 });
    expect(graph.boundaries.sourceMasterIsNotProgramMix).toBe(true);
  });

  it("holds a promoted program mix when its immutable evidence does not converge", () => {
    const graph = buildSessionVersionedOutputGraph({
      episode,
      programMix: programMix({ integrity: { ...programMix().integrity, promotionMatchesPreview: false } }),
      assets: [asset()],
      selections: [],
    });

    expect(graph.programMix).toMatchObject({ state: "HELD", playbackUrl: null });
    expect(graph.counts.activeProgramMixes).toBe(0);
    expect(graph.assets[0].alternateToActiveProgramMix).toBe(false);
  });

  it("advances a promoted program through encoded-byte approval without treating the preview as the packet", () => {
    const deliverySha = "9".repeat(64);
    const graph = buildSessionVersionedOutputGraph({
      episode,
      programMix: programMix({
        deliveryArtifact: {
          jobId: "episode-program-delivery-1",
          status: "completed",
          promotionReceiptId: "episode-mix-promotion-1",
          deliverySha256: deliverySha,
          playbackUrl: "/api/ingest/media/program-aac-1",
          durationSeconds: 600,
          promotionStillActive: true,
          review: { id: "episode-program-delivery-review-1", decision: "approved", reviewedAt: "2026-08-07T15:00:00.000Z" },
          readiness: { encodedAndVerified: true, proofListenApproved: true, outputPacketEligible: true },
        },
      }),
      assets: [asset()],
      selections: [],
    });

    expect(graph.programMix).toMatchObject({ deliveryState: "APPROVED", packetEligible: true, deliveryArtifactSha256: deliverySha, packetState: "NOT_SELECTED" });
    expect(graph.programMix?.previewSha256).not.toBe(graph.programMix?.deliveryArtifactSha256);
    expect(graph.counts).toMatchObject({ verifiedArtifacts: 1, approvedArtifacts: 1, packetEligible: 1 });
  });
});
