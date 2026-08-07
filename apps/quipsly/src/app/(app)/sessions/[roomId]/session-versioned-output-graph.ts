export type SessionOutputGraphAssetInput = {
  recordingAssetId: string;
  mediaAssetId: string;
  sourceId: string;
  label: string;
  attachmentRole: string | null;
  masterCandidate: null | {
    active: boolean;
    eventId: string;
    jobId: string;
    reviewReceiptId: string | null;
    playbackUrl: string | null;
    occurredAt: string | null;
    historicalEventCount: number;
  };
  deliveryArtifact: null | {
    jobId: string;
    status: string;
    promotionReceiptId: string | null;
    deliverySha256: string | null;
    playbackUrl: string | null;
    durationSeconds?: number | null;
    promotionStillActive: boolean;
    review: null | { id: string; decision: "approved" | "rejected"; reviewedAt: string | null };
    readiness: {
      encodedAndVerified: boolean;
      proofListenApproved: boolean;
      outputPacketEligible: boolean;
    };
  };
};

export type SessionOutputGraphSelectionInput = {
  id: string;
  operation: "SELECT" | "WITHDRAW";
  outputPacketId: string;
  packetDigestSha256: string;
  artifactSha256: string;
  occurredAt: string;
  reason: string | null;
  packet: {
    id: string;
    slug: string;
    title: string;
    status: string;
    packetJson: unknown;
  };
};

export type SessionOutputGraphProgramMixInput = {
  jobId: string;
  assetId: string | null;
  sourceTrackCount: number;
  programFingerprintSha256: string;
  proposalSha256: string;
  previewSha256: string;
  reviewReceiptId: string | null;
  promotionReceiptId: string;
  operation: "PROMOTE" | "WITHDRAW";
  playbackUrl: string | null;
  occurredAt: string | null;
  historicalEventCount: number;
  deliveryArtifact: SessionOutputGraphAssetInput["deliveryArtifact"];
  integrity: {
    jobCompleted: boolean;
    assetRegistered: boolean;
    reviewApproved: boolean;
    promotionMatchesJob: boolean;
    promotionMatchesReview: boolean;
    promotionMatchesProposal: boolean;
    promotionMatchesBaseline: boolean;
    promotionMatchesPreview: boolean;
    promotionMatchesProgram: boolean;
  };
};

export type SessionVersionedOutputGraph = {
  episode: null | { id: string; projectSlug: string; slug: string; title: string };
  programMix: null | {
    jobId: string;
    assetId: string | null;
    sourceTrackCount: number;
    programFingerprintSha256: string;
    proposalSha256: string;
    previewSha256: string;
    reviewReceiptId: string | null;
    promotionReceiptId: string;
    state: "ACTIVE" | "WITHDRAWN" | "HELD";
    playbackUrl: string | null;
    occurredAt: string | null;
    historicalEventCount: number;
    deliveryState: "NOT_OBSERVED" | "PROCESSING" | "FAILED" | "STALE" | "PROOF_LISTEN_REQUIRED" | "REJECTED" | "APPROVED";
    deliveryJobId: string | null;
    deliveryArtifactSha256: string | null;
    deliveryPlaybackUrl: string | null;
    deliveryDurationSeconds: number | null;
    packetEligible: boolean;
    packetState: "NOT_SELECTED" | "SELECTED" | "WITHDRAWN" | "OTHER_ASSET_SELECTED";
    nextAction: string;
    editorHref: string;
    integrity: SessionOutputGraphProgramMixInput["integrity"];
  };
  assets: Array<{
    recordingAssetId: string;
    mediaAssetId: string;
    sourceId: string;
    label: string;
    attachmentRole: string | null;
    masterState: "NOT_OBSERVED" | "ACTIVE" | "WITHDRAWN";
    deliveryState: "NOT_OBSERVED" | "PROCESSING" | "FAILED" | "STALE" | "PROOF_LISTEN_REQUIRED" | "REJECTED" | "APPROVED";
    packetState: "NOT_SELECTED" | "SELECTED" | "WITHDRAWN" | "OTHER_ASSET_SELECTED";
    masterCandidateId: string | null;
    deliveryJobId: string | null;
    deliveryArtifactSha256: string | null;
    deliveryPlaybackUrl: string | null;
    packetEligible: boolean;
    alternateToActiveProgramMix: boolean;
    currentPacketId: string | null;
    nextAction: string;
    editorHref: string;
  }>;
  currentPacket: null | {
    id: string;
    slug: string;
    title: string;
    status: string;
    selectionId: string;
    selectedAt: string;
    packetDigestSha256: string;
    artifactSha256: string;
    audioAssetId: string | null;
    metadataComplete: boolean;
    enclosurePublic: boolean;
    publicationEligible: boolean;
  };
  selectionHistoryCount: number;
  counts: {
    sources: number;
    activeProgramMixes: number;
    activeMasters: number;
    verifiedArtifacts: number;
    approvedArtifacts: number;
    packetEligible: number;
    selectedPackets: number;
  };
  boundaries: {
    sourceIsNotMaster: true;
    sourceMasterIsNotProgramMix: true;
    masterIsNotEncodedArtifact: true;
    proofListenIsNotPacketSelection: true;
    packetSelectionIsNotUpload: true;
    uploadIsNotPublication: true;
    selectionHistoryIsAppendOnly: true;
  };
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function deliveryState(delivery: SessionOutputGraphAssetInput["deliveryArtifact"]) {
  if (!delivery) return "NOT_OBSERVED" as const;
  if (delivery.status === "failed") return "FAILED" as const;
  if (["queued", "processing", "output-ready"].includes(delivery.status)) return "PROCESSING" as const;
  if (!delivery.readiness.encodedAndVerified) return "FAILED" as const;
  if (!delivery.promotionStillActive) return "STALE" as const;
  if (delivery.review?.decision === "rejected") return "REJECTED" as const;
  if (delivery.readiness.proofListenApproved) return "APPROVED" as const;
  return "PROOF_LISTEN_REQUIRED" as const;
}

function nextAction(args: {
  masterState: "NOT_OBSERVED" | "ACTIVE" | "WITHDRAWN";
  deliveryState: ReturnType<typeof deliveryState>;
  packetState: "NOT_SELECTED" | "SELECTED" | "WITHDRAWN" | "OTHER_ASSET_SELECTED";
}) {
  if (args.masterState === "NOT_OBSERVED") return "Create and audition a versioned mastering experiment in Audio Studio.";
  if (args.masterState === "WITHDRAWN") return "Review and deliberately promote the correct mastered candidate.";
  if (args.deliveryState === "NOT_OBSERVED") return "Encode the active mastered candidate as a separately verified AAC artifact.";
  if (args.deliveryState === "PROCESSING") return "Finish or recover the current delivery encoding job.";
  if (args.deliveryState === "FAILED") return "Inspect the delivery evidence failure before retrying encoding.";
  if (args.deliveryState === "STALE") return "The master changed; encode a new artifact from the current promotion.";
  if (args.deliveryState === "REJECTED") return "Keep the rejected bytes as history and prepare a replacement artifact.";
  if (args.deliveryState === "PROOF_LISTEN_REQUIRED") return "Proof-listen the actual encoded beginning, midpoint, and ending.";
  if (args.packetState === "SELECTED") return "Complete metadata, public enclosure hosting, and destination review; do not infer publication.";
  if (args.packetState === "OTHER_ASSET_SELECTED") return "Another artifact is selected. Compare lineage before replacing the Episode package.";
  return "Select these approved encoded bytes as the reversible Episode package candidate.";
}

export function buildSessionVersionedOutputGraph(input: {
  episode: SessionVersionedOutputGraph["episode"];
  programMix?: SessionOutputGraphProgramMixInput | null;
  assets: SessionOutputGraphAssetInput[];
  selections: SessionOutputGraphSelectionInput[];
}): SessionVersionedOutputGraph {
  const latestSelection = input.selections[0] ?? null;
  const currentSelection = latestSelection?.operation === "SELECT" ? latestSelection : null;
  const currentPacketJson = object(currentSelection?.packet.packetJson);
  const currentAudio = object(currentPacketJson.audio);
  const currentReadiness = object(currentPacketJson.readiness);
  const selectedAssetId = text(currentAudio.assetId) || null;
  const programMixIntegrity = input.programMix?.integrity;
  const programMixIntegrityReady = Boolean(programMixIntegrity
    && programMixIntegrity.jobCompleted
    && programMixIntegrity.assetRegistered
    && programMixIntegrity.reviewApproved
    && programMixIntegrity.promotionMatchesJob
    && programMixIntegrity.promotionMatchesReview
    && programMixIntegrity.promotionMatchesProposal
    && programMixIntegrity.promotionMatchesBaseline
    && programMixIntegrity.promotionMatchesPreview
    && programMixIntegrity.promotionMatchesProgram);
  const programMixState = !input.programMix
    ? null
    : input.programMix.operation === "WITHDRAW"
      ? "WITHDRAWN" as const
      : programMixIntegrityReady
        ? "ACTIVE" as const
        : "HELD" as const;
  const hasActiveProgramMix = programMixState === "ACTIVE";
  const programDeliveryState = deliveryState(input.programMix?.deliveryArtifact ?? null);
  const assets = input.assets.map((asset) => {
    const masterState = !asset.masterCandidate
      ? "NOT_OBSERVED" as const
      : asset.masterCandidate.active ? "ACTIVE" as const : "WITHDRAWN" as const;
    const artifactState = deliveryState(asset.deliveryArtifact);
    const packetState = currentSelection
      ? selectedAssetId === asset.mediaAssetId ? "SELECTED" as const : "OTHER_ASSET_SELECTED" as const
      : latestSelection?.operation === "WITHDRAW" && latestSelection.artifactSha256 === asset.deliveryArtifact?.deliverySha256
        ? "WITHDRAWN" as const
        : "NOT_SELECTED" as const;
    return {
      recordingAssetId: asset.recordingAssetId,
      mediaAssetId: asset.mediaAssetId,
      sourceId: asset.sourceId,
      label: asset.label,
      attachmentRole: asset.attachmentRole,
      masterState,
      deliveryState: artifactState,
      packetState,
      masterCandidateId: asset.masterCandidate?.eventId ?? null,
      deliveryJobId: asset.deliveryArtifact?.jobId ?? null,
      deliveryArtifactSha256: asset.deliveryArtifact?.deliverySha256 ?? null,
      deliveryPlaybackUrl: asset.deliveryArtifact?.playbackUrl ?? null,
      packetEligible: asset.deliveryArtifact?.readiness.outputPacketEligible === true,
      alternateToActiveProgramMix: hasActiveProgramMix,
      currentPacketId: packetState === "SELECTED" ? currentSelection?.packet.id ?? null : null,
      nextAction: hasActiveProgramMix && packetState !== "SELECTED"
        ? "Keep this single-source branch for repair and comparison while the active multitrack program advances."
        : nextAction({ masterState, deliveryState: artifactState, packetState }),
      editorHref: input.episode
        ? `/editor?project=${encodeURIComponent(input.episode.projectSlug)}&episode=${encodeURIComponent(input.episode.slug)}&asset=${encodeURIComponent(asset.mediaAssetId)}#audio-mastery-heading`
        : "/editor",
    };
  });
  return {
    episode: input.episode,
    programMix: input.programMix && programMixState ? {
      jobId: input.programMix.jobId,
      assetId: input.programMix.assetId,
      sourceTrackCount: input.programMix.sourceTrackCount,
      programFingerprintSha256: input.programMix.programFingerprintSha256,
      proposalSha256: input.programMix.proposalSha256,
      previewSha256: input.programMix.previewSha256,
      reviewReceiptId: input.programMix.reviewReceiptId,
      promotionReceiptId: input.programMix.promotionReceiptId,
      state: programMixState,
      playbackUrl: programMixState === "ACTIVE" ? input.programMix.playbackUrl : null,
      occurredAt: input.programMix.occurredAt,
      historicalEventCount: input.programMix.historicalEventCount,
      deliveryState: programDeliveryState,
      deliveryJobId: input.programMix.deliveryArtifact?.jobId ?? null,
      deliveryArtifactSha256: input.programMix.deliveryArtifact?.deliverySha256 ?? null,
      deliveryPlaybackUrl: input.programMix.deliveryArtifact?.playbackUrl ?? null,
      deliveryDurationSeconds: input.programMix.deliveryArtifact?.durationSeconds ?? null,
      packetEligible: input.programMix.deliveryArtifact?.readiness.outputPacketEligible === true && programMixState === "ACTIVE",
      packetState: currentSelection
        ? selectedAssetId === input.programMix.assetId ? "SELECTED" : "OTHER_ASSET_SELECTED"
        : latestSelection?.operation === "WITHDRAW" && latestSelection.artifactSha256 === input.programMix.deliveryArtifact?.deliverySha256
          ? "WITHDRAWN"
          : "NOT_SELECTED",
      nextAction: programMixState === "HELD"
        ? "Inspect the program-mix registration or receipt mismatch before finishing."
        : programMixState === "WITHDRAWN"
          ? "Review and deliberately promote the correct multitrack program version."
          : programDeliveryState === "NOT_OBSERVED"
            ? "Encode this promoted program as a separately verified AAC delivery artifact."
            : programDeliveryState === "PROCESSING"
              ? "Finish or recover the current Episode-program delivery encoding."
              : programDeliveryState === "FAILED"
                ? "Inspect the encoded-program evidence failure before retrying."
                : programDeliveryState === "STALE"
                  ? "The promoted program changed; encode a new artifact from the current promotion."
                  : programDeliveryState === "REJECTED"
                    ? "Keep the rejected bytes as history and prepare a replacement artifact."
                    : programDeliveryState === "PROOF_LISTEN_REQUIRED"
                      ? "Proof-listen the actual encoded beginning, midpoint, and ending."
                      : currentSelection
                        ? "Complete metadata, public enclosure hosting, and destination review; selection is not publication."
                        : "Select these approved encoded program bytes as the reversible Episode package candidate.",
      editorHref: input.episode
        ? `/audio?project=${encodeURIComponent(input.episode.projectSlug)}&episode=${encodeURIComponent(input.episode.slug)}#episode-audio-mix`
        : "/audio",
      integrity: input.programMix.integrity,
    } : null,
    assets,
    currentPacket: currentSelection ? {
      id: currentSelection.packet.id,
      slug: currentSelection.packet.slug,
      title: currentSelection.packet.title,
      status: currentSelection.packet.status,
      selectionId: currentSelection.id,
      selectedAt: currentSelection.occurredAt,
      packetDigestSha256: currentSelection.packetDigestSha256,
      artifactSha256: currentSelection.artifactSha256,
      audioAssetId: selectedAssetId,
      metadataComplete: currentReadiness.metadataComplete === true,
      enclosurePublic: currentReadiness.enclosurePublic === true,
      publicationEligible: currentReadiness.publicationEligible === true,
    } : null,
    selectionHistoryCount: input.selections.length,
    counts: {
      sources: assets.length,
      activeProgramMixes: hasActiveProgramMix ? 1 : 0,
      activeMasters: assets.filter((asset) => asset.masterState === "ACTIVE").length,
      verifiedArtifacts: assets.filter((asset) => !["NOT_OBSERVED", "PROCESSING", "FAILED"].includes(asset.deliveryState)).length + (hasActiveProgramMix && !["NOT_OBSERVED", "PROCESSING", "FAILED"].includes(programDeliveryState) ? 1 : 0),
      approvedArtifacts: assets.filter((asset) => asset.deliveryState === "APPROVED").length + (hasActiveProgramMix && programDeliveryState === "APPROVED" ? 1 : 0),
      packetEligible: assets.filter((asset) => asset.packetEligible && !asset.alternateToActiveProgramMix).length + (hasActiveProgramMix && input.programMix?.deliveryArtifact?.readiness.outputPacketEligible === true ? 1 : 0),
      selectedPackets: currentSelection ? 1 : 0,
    },
    boundaries: {
      sourceIsNotMaster: true,
      sourceMasterIsNotProgramMix: true,
      masterIsNotEncodedArtifact: true,
      proofListenIsNotPacketSelection: true,
      packetSelectionIsNotUpload: true,
      uploadIsNotPublication: true,
      selectionHistoryIsAppendOnly: true,
    },
  };
}
