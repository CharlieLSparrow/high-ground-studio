export type SessionEpisodeAssemblyState =
  | "NO_CAPTURE_TAKE"
  | "BLOCKED"
  | "READY_TO_MATERIALIZE"
  | "MATERIALIZED_MEDIA"
  | "MATERIALIZED_ASSEMBLY";

export type SessionEpisodeAssemblyEvidence = {
  episodeProductionId: string;
  episodeTitle: string;
  projectSlug: string;
  episodeSlug: string;
  editorHref: string;
  state: SessionEpisodeAssemblyState;
  captureGroupId: string | null;
  selectedMediaCount: number;
  selectedRecordingAssetIds?: string[];
  plannedSourceCount: number;
  blockerCount: number;
  warningCount: number;
  nextAction: string;
  canonicalTakeCount: number;
  canonicalSourceCount: number;
  canonicalAssemblyReadyCount: number;
  sessionTimelineClipCount: number;
  sessionTranscriptBlockCount: number;
  episodeTimelineClipCount: number;
  episodeTranscriptBlockCount: number;
  currentProposalSetCount: number;
  staleProposalSetCount: number;
  currentReviewReceiptCount: number;
  proofListenCount: number;
  proofWatchCount: number;
  localDraftActionCount: number;
  unsavedLocalDraftActionCount: number;
  canonicalTimelineSaveCount: number;
  canonicallyLinkedDraftActionCount: number;
  latestCanonicalSaveAt: string | null;
  ledgerAvailable: boolean;
  productionUpdatedAt: string;
};

type MaterializationReceipt = {
  captureGroupId: string;
  roomId: string;
  status: "media-materialized" | "assembly-ready";
  sourceBindings: Array<{ recordingAssetId: string; clipId: string }>;
  transcriptBinding: { blockIds: string[] } | null;
  materializedAt: string;
};

type Plan = {
  ok: boolean;
  status: "blocked" | "media-ready" | "assembly-ready";
  captureGroupId: string;
  changed: boolean;
  issues: Array<{ severity: "blocker" | "warning" }>;
  nextAction: string;
};

type ProposalSet = {
  id: string;
  timelineFingerprintSha256: string;
};

type ReviewReceipt = {
  id: string;
  proposalSetId: string | null;
  action: string;
  scope: string;
  evidenceJson: unknown;
  occurredAt: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function linkedReviewReceiptIds(value: unknown) {
  const ids = record(value).linkedReviewReceiptIds;
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
}

export function buildSessionEpisodeAssemblyEvidence(input: {
  roomId: string;
  episodeProductionId: string;
  episodeTitle: string;
  projectSlug: string;
  episodeSlug: string;
  productionUpdatedAt: string;
  captureGroupId: string;
  selectedMediaCount: number;
  selectedRecordingAssetIds?: string[];
  plannedSourceCount: number;
  plan: Plan;
  timelineClipCount: number;
  transcriptBlockCount: number;
  materializations: MaterializationReceipt[];
  proposalSets: ProposalSet[];
  reviewReceipts: ReviewReceipt[];
  currentTimelineFingerprintSha256: string;
  ledgerAvailable: boolean;
}): SessionEpisodeAssemblyEvidence {
  const sessionMaterializations = input.materializations
    .filter((receipt) => receipt.roomId === input.roomId)
    .sort((left, right) => right.materializedAt.localeCompare(left.materializedAt));
  const currentCaptureReceipt = input.captureGroupId
    ? sessionMaterializations.find((receipt) => receipt.captureGroupId === input.captureGroupId) ?? null
    : sessionMaterializations[0] ?? null;
  const canonicalClipIds = new Set(sessionMaterializations.flatMap((receipt) => (
    receipt.sourceBindings.map((binding) => binding.clipId)
  )));
  const canonicalTranscriptBlockIds = new Set(sessionMaterializations.flatMap((receipt) => (
    receipt.transcriptBinding?.blockIds ?? []
  )));
  const planBlockers = input.plan.issues.filter((issue) => issue.severity === "blocker").length;
  const planWarnings = input.plan.issues.filter((issue) => issue.severity === "warning").length;

  let state: SessionEpisodeAssemblyState;
  if (!input.selectedMediaCount && !sessionMaterializations.length) {
    state = "NO_CAPTURE_TAKE";
  } else if (!input.plan.ok) {
    state = "BLOCKED";
  } else if (input.plan.changed || !currentCaptureReceipt) {
    state = "READY_TO_MATERIALIZE";
  } else {
    state = currentCaptureReceipt.status === "assembly-ready"
      ? "MATERIALIZED_ASSEMBLY"
      : "MATERIALIZED_MEDIA";
  }

  const currentProposalSets = input.proposalSets.filter((proposal) => (
    proposal.timelineFingerprintSha256 === input.currentTimelineFingerprintSha256
  ));
  const currentProposalIds = new Set(currentProposalSets.map((proposal) => proposal.id));
  const localDraftReceipts = input.reviewReceipts.filter((receipt) => (
    receipt.scope === "LOCAL_DRAFT"
    && Boolean(receipt.proposalSetId)
    && currentProposalIds.has(receipt.proposalSetId!)
  ));
  const linkedDraftIds = new Set(
    input.reviewReceipts
      .filter((receipt) => receipt.action === "TIMELINE_SAVED")
      .flatMap((receipt) => linkedReviewReceiptIds(receipt.evidenceJson)),
  );
  const currentLocalDraftIds = new Set(localDraftReceipts.map((receipt) => receipt.id));
  const canonicallyLinkedDraftIds = new Set(
    [...linkedDraftIds].filter((receiptId) => currentLocalDraftIds.has(receiptId)),
  );
  const canonicalSaves = input.reviewReceipts
    .filter((receipt) => receipt.action === "TIMELINE_SAVED")
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  const currentProposalReviewReceipts = input.reviewReceipts.filter((receipt) => (
    receipt.proposalSetId && currentProposalIds.has(receipt.proposalSetId)
  ));

  const query = new URLSearchParams({
    project: input.projectSlug,
    episode: input.episodeSlug,
  });
  if (input.captureGroupId) query.set("captureGroup", input.captureGroupId);
  const editorAnchor = state === "MATERIALIZED_MEDIA" || state === "MATERIALIZED_ASSEMBLY"
    ? "automated-edit-evidence"
    : "guided-sync-wizard";

  return {
    episodeProductionId: input.episodeProductionId,
    episodeTitle: input.episodeTitle,
    projectSlug: input.projectSlug,
    episodeSlug: input.episodeSlug,
    editorHref: `/editor?${query.toString()}#${editorAnchor}`,
    state,
    captureGroupId: input.captureGroupId || null,
    selectedMediaCount: input.selectedMediaCount,
    selectedRecordingAssetIds: [...new Set(input.selectedRecordingAssetIds ?? [])].sort(),
    plannedSourceCount: input.plannedSourceCount,
    blockerCount: planBlockers,
    warningCount: planWarnings,
    nextAction: input.plan.nextAction,
    canonicalTakeCount: sessionMaterializations.length,
    canonicalSourceCount: new Set(sessionMaterializations.flatMap((receipt) => (
      receipt.sourceBindings.map((binding) => binding.recordingAssetId)
    ))).size,
    canonicalAssemblyReadyCount: sessionMaterializations.filter((receipt) => receipt.status === "assembly-ready").length,
    sessionTimelineClipCount: canonicalClipIds.size,
    sessionTranscriptBlockCount: canonicalTranscriptBlockIds.size,
    episodeTimelineClipCount: input.timelineClipCount,
    episodeTranscriptBlockCount: input.transcriptBlockCount,
    currentProposalSetCount: currentProposalSets.length,
    staleProposalSetCount: input.proposalSets.length - currentProposalSets.length,
    currentReviewReceiptCount: currentProposalReviewReceipts.filter((receipt) => receipt.action !== "PROPOSAL_CREATED").length,
    proofListenCount: currentProposalReviewReceipts.filter((receipt) => receipt.action === "PROOF_LISTENED").length,
    proofWatchCount: currentProposalReviewReceipts.filter((receipt) => receipt.action === "PROOF_WATCHED").length,
    localDraftActionCount: localDraftReceipts.length,
    unsavedLocalDraftActionCount: localDraftReceipts.filter((receipt) => !linkedDraftIds.has(receipt.id)).length,
    canonicalTimelineSaveCount: canonicalSaves.length,
    canonicallyLinkedDraftActionCount: canonicallyLinkedDraftIds.size,
    latestCanonicalSaveAt: canonicalSaves[0]?.occurredAt ?? null,
    ledgerAvailable: input.ledgerAvailable,
    productionUpdatedAt: input.productionUpdatedAt,
  };
}
