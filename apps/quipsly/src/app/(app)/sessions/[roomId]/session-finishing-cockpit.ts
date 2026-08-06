import type { SessionSourceEvidence } from "./session-source-evidence-model";
import type { SessionEpisodeAssemblyEvidence } from "./session-episode-assembly-evidence";
import type { SessionReadinessTopology } from "./session-readiness-topology";

export type SessionFinishingEvidence = {
  transcriptJobs: Array<{
    id: string;
    recordingAssetId: string | null;
    status: string;
    segmentCount: number;
    updatedAt: string;
  }>;
  outputs: Array<{
    id: string;
    kind: string;
    status: string;
    deliveryCount: number;
    updatedAt: string;
  }>;
  analyzedSourceCount: number;
  sourceClockAttention?: { total: number; high: number; review: number };
  assembly?: SessionEpisodeAssemblyEvidence;
  versionedOutput?: {
    sources: number;
    activeMasters: number;
    verifiedArtifacts: number;
    approvedArtifacts: number;
    packetEligible: number;
    selectedPackets: number;
    metadataComplete: boolean;
    enclosurePublic: boolean;
    publicationEligible: boolean;
  };
};

type ContentReadiness = {
  status: "none" | "capture-proof-only" | "substantial";
  captureAssetCount: number;
  substantialRecordingCount: number;
};

type StudioHandoff = {
  recordings: Array<{
    status: "READY_FOR_HANDOFF" | "NOT_READY" | "ATTACHED" | "RECEIPT_MISSING" | "PROJECT_CONFLICT";
  }>;
} | null;

export type SessionFinishingAttention = {
  id: string;
  severity: "BLOCKER" | "HIGH" | "REVIEW";
  lane: "recordings" | "transcript" | "outputs";
  title: string;
  detail: string;
  consequence: string;
  href?: string;
  actionLabel?: string;
};

export type SessionFinishingStage = {
  id: "recover" | "understand" | "repair" | "assemble" | "finish";
  label: string;
  state: "BLOCKED" | "READY" | "IN_PROGRESS" | "NOT_OBSERVED";
  summary: string;
  evidence: string;
  lane: "recordings" | "transcript" | "outputs";
  href?: string;
  actionLabel?: string;
};

export type SessionFinishingCockpit = {
  attention: SessionFinishingAttention[];
  stages: SessionFinishingStage[];
  counts: { blockers: number; high: number; review: number };
};

const severityRank = { BLOCKER: 0, HIGH: 1, REVIEW: 2 } as const;

export function buildSessionFinishingCockpit(input: {
  topology: SessionReadinessTopology;
  sourceEvidence: SessionSourceEvidence;
  contentReadiness: ContentReadiness | null;
  studioHandoff: StudioHandoff;
  finishingEvidence: SessionFinishingEvidence;
}): SessionFinishingCockpit {
  const { topology, sourceEvidence, contentReadiness, studioHandoff, finishingEvidence } = input;
  const attention: SessionFinishingAttention[] = [];
  if (!topology.exitReadiness.safeToLeaveAllEndpoints) attention.push({
    id: "source-exit",
    severity: "BLOCKER",
    lane: "recordings",
    title: topology.exitReadiness.label,
    detail: topology.exitReadiness.detail,
    consequence: "A recording device may still hold the only recoverable source, or Nest may not have a released exact-byte copy.",
  });
  const sourceIntegrityCount = sourceEvidence.counts.HELD + sourceEvidence.counts.DRIFT + sourceEvidence.counts.INCOMPLETE;
  if (sourceIntegrityCount) attention.push({
    id: "source-integrity",
    severity: sourceEvidence.counts.HELD + sourceEvidence.counts.DRIFT ? "BLOCKER" : "HIGH",
    lane: "recordings",
    title: `${sourceIntegrityCount} source ${sourceIntegrityCount === 1 ? "receipt needs" : "receipts need"} review`,
    detail: `${sourceEvidence.counts.HELD} held · ${sourceEvidence.counts.DRIFT} drift · ${sourceEvidence.counts.INCOMPLETE} incomplete.`,
    consequence: "Editor, transcript, or delivery work could attach to incomplete or mismatched provenance.",
  });
  if (contentReadiness && contentReadiness.status !== "substantial") attention.push({
    id: "production-content",
    severity: "HIGH",
    lane: "recordings",
    title: contentReadiness.status === "capture-proof-only" ? "Only capture-test content is retained" : "No substantial recording is retained",
    detail: `${contentReadiness.substantialRecordingCount} substantial take${contentReadiness.substantialRecordingCount === 1 ? "" : "s"} across ${contentReadiness.captureAssetCount} capture asset${contentReadiness.captureAssetCount === 1 ? "" : "s"}.`,
    consequence: "A technically verified test file is not a production spine for editing or publishing.",
  });
  const handoffHolds = studioHandoff?.recordings.filter((recording) => recording.status === "RECEIPT_MISSING" || recording.status === "PROJECT_CONFLICT").length ?? 0;
  const readyForHandoff = studioHandoff?.recordings.filter((recording) => recording.status === "READY_FOR_HANDOFF").length ?? 0;
  const attached = studioHandoff?.recordings.filter((recording) => recording.status === "ATTACHED").length ?? 0;
  if (handoffHolds) attention.push({
    id: "studio-integrity",
    severity: "BLOCKER",
    lane: "outputs",
    title: `${handoffHolds} Studio handoff integrity hold${handoffHolds === 1 ? "" : "s"}`,
    detail: "The project binding or immutable attachment receipt does not match this Session.",
    consequence: "An editor could open the wrong project source or lose the provenance return path.",
  });
  if (readyForHandoff) attention.push({
    id: "studio-handoff-ready",
    severity: "REVIEW",
    lane: "outputs",
    title: `${readyForHandoff} verified source${readyForHandoff === 1 ? " is" : "s are"} ready for explicit Studio attachment`,
    detail: "The source bytes are safe, but no attachment receipt exists yet.",
    consequence: "Transcript and editor work remain disconnected from the immutable Session source.",
  });

  const latestJobByAsset = new Map<string, SessionFinishingEvidence["transcriptJobs"][number]>();
  for (const job of finishingEvidence.transcriptJobs) {
    const key = job.recordingAssetId || `unbound:${job.id}`;
    if (!latestJobByAsset.has(key)) latestJobByAsset.set(key, job);
  }
  const transcriptJobs = [...latestJobByAsset.values()];
  const completedTranscripts = transcriptJobs.filter((job) => job.status === "COMPLETED" && job.segmentCount > 0);
  const transcriptHolds = transcriptJobs.filter((job) => job.status === "FAILED" || job.status === "HELD");
  if (transcriptHolds.length) attention.push({
    id: "transcript-held",
    severity: "HIGH",
    lane: "transcript",
    title: `${transcriptHolds.length} latest transcript attempt${transcriptHolds.length === 1 ? " is" : "s are"} held or failed`,
    detail: "Provider text remains an attempt; source media and any prior corrections are unchanged.",
    consequence: "Search, notes, tasks, chapters, and explainable edit proposals cannot rely on complete transcript evidence.",
  });
  if (!completedTranscripts.length && topology.exitReadiness.safeForServerObservedSources) attention.push({
    id: "transcript-missing",
    severity: "REVIEW",
    lane: "transcript",
    title: "No completed source-bound transcript is observed",
    detail: "The retained source is ready for a released transcription attempt, but no completed segment set is projected here.",
    consequence: "Understanding and assembly remain manual until transcript evidence exists and is reviewed.",
  });

  const analyzableSourceCount = Math.max(attached, topology.exitReadiness.serverSafeRequiredSourceCount);
  if (analyzableSourceCount > finishingEvidence.analyzedSourceCount) attention.push({
    id: "audio-analysis-coverage",
    severity: "REVIEW",
    lane: "transcript",
    title: `Audio evidence covers ${finishingEvidence.analyzedSourceCount}/${analyzableSourceCount} retained source${analyzableSourceCount === 1 ? "" : "s"}`,
    detail: "A complete decoded signal scan or audible-event analysis is not projected for every source.",
    consequence: "Repair and automated assembly could miss clipping, silence, route loss, overlap, or boundary risk.",
  });
  if ((finishingEvidence.sourceClockAttention?.total ?? 0) > 0) attention.push({
    id: "source-clock-review",
    severity: (finishingEvidence.sourceClockAttention?.high ?? 0) > 0 ? "HIGH" : "REVIEW",
    lane: "transcript",
    title: `${finishingEvidence.sourceClockAttention!.total} exact source range${finishingEvidence.sourceClockAttention!.total === 1 ? "" : "s"} need${finishingEvidence.sourceClockAttention!.total === 1 ? "s" : ""} a listen or decision`,
    detail: `${finishingEvidence.sourceClockAttention!.high} high · ${finishingEvidence.sourceClockAttention!.review} review. Transcript, detector, repair, mastering, and edit evidence keep separate authority boundaries.`,
    consequence: "Unresolved exact-clock evidence can mislead transcript, repair, assembly, or delivery decisions if it is flattened into a generic confidence score.",
  });

  const assembly = finishingEvidence.assembly;
  if (assembly && !assembly.ledgerAvailable) attention.push({
    id: "episode-edit-ledger-unavailable",
    severity: "HIGH",
    lane: "outputs",
    title: "The Episode edit-review ledger could not be read",
    detail: "The canonical timeline remains intact, but Quipsly cannot currently prove which proposed, local-draft, proof-review, or saved actions belong to it.",
    consequence: "The cockpit will not collapse unknown editorial evidence into a false zero or claim that a draft was canonically saved.",
    href: assembly.editorHref,
    actionLabel: "Open editor",
  });
  if (assembly?.state === "BLOCKED") attention.push({
    id: "episode-take-materialization-held",
    severity: "HIGH",
    lane: "outputs",
    title: "The current Capture take is held before timeline materialization",
    detail: `${assembly.blockerCount} blocker${assembly.blockerCount === 1 ? "" : "s"} · ${assembly.warningCount} warning${assembly.warningCount === 1 ? "" : "s"}. ${assembly.nextAction}`,
    consequence: "The protected sources remain unchanged, but this take cannot become a trustworthy editable timeline until its identity, spine, alignment, or playback evidence is repaired.",
    href: assembly.editorHref,
    actionLabel: "Resolve in Guided sync",
  });
  if (assembly?.state === "READY_TO_MATERIALIZE") attention.push({
    id: "episode-take-ready-to-materialize",
    severity: "REVIEW",
    lane: "outputs",
    title: `${assembly.plannedSourceCount} verified Capture source${assembly.plannedSourceCount === 1 ? " is" : "s are"} ready to become an editable Episode take`,
    detail: `${assembly.warningCount} non-blocking warning${assembly.warningCount === 1 ? "" : "s"}. Materialization is an explicit, conflict-safe canonical timeline save.`,
    consequence: "Until that save is accepted, source attachment proves provenance but the editor has no canonical take lanes for this Session.",
    href: assembly.editorHref,
    actionLabel: "Materialize take",
  });
  if (assembly?.state === "MATERIALIZED_MEDIA") attention.push({
    id: "episode-take-media-only",
    severity: "REVIEW",
    lane: "outputs",
    title: "The Capture media is canonical, but automated assembly is not ready",
    detail: `${assembly.sessionTimelineClipCount} Session clip${assembly.sessionTimelineClipCount === 1 ? "" : "s"} and ${assembly.sessionTranscriptBlockCount} transcript block${assembly.sessionTranscriptBlockCount === 1 ? "" : "s"} are persisted. ${assembly.nextAction}`,
    consequence: "Quipsly will not guess speaker identity, camera ownership, or non-spine alignment merely to make the timeline look complete.",
    href: assembly.editorHref,
    actionLabel: "Continue assembly review",
  });
  if (assembly && assembly.state === "MATERIALIZED_ASSEMBLY" && assembly.currentProposalSetCount === 0) attention.push({
    id: "episode-current-proposal-missing",
    severity: "REVIEW",
    lane: "outputs",
    title: "The editable take has no proposal set bound to the current timeline",
    detail: `${assembly.staleProposalSetCount} older proposal set${assembly.staleProposalSetCount === 1 ? " is" : "s are"} preserved but not treated as current.`,
    consequence: "A fresh rough-cut or camera proposal must bind to these exact timeline bytes before it can be reviewed or applied.",
    href: assembly.editorHref,
    actionLabel: "Create current proposals",
  });
  if (assembly && assembly.currentProposalSetCount > 0 && assembly.currentReviewReceiptCount === 0) attention.push({
    id: "episode-proposals-unreviewed",
    severity: "REVIEW",
    lane: "outputs",
    title: `${assembly.currentProposalSetCount} current edit proposal set${assembly.currentProposalSetCount === 1 ? " needs" : "s need"} a human decision`,
    detail: "The proposals are durable evidence, but no proof-listen, proof-watch, apply, restore, or dismiss receipt is observed for the current timeline.",
    consequence: "Generated suggestions remain suggestions; they do not silently become editorial canon.",
    href: assembly.editorHref,
    actionLabel: "Review proposals",
  });
  if (assembly?.unsavedLocalDraftActionCount) attention.push({
    id: "episode-local-draft-unsaved",
    severity: "HIGH",
    lane: "outputs",
    title: `${assembly.unsavedLocalDraftActionCount} local edit action${assembly.unsavedLocalDraftActionCount === 1 ? " is" : "s are"} not linked to a canonical timeline save`,
    detail: `${assembly.localDraftActionCount} local-draft action${assembly.localDraftActionCount === 1 ? "" : "s"} observed · ${assembly.canonicallyLinkedDraftActionCount} linked into saved timeline evidence.`,
    consequence: "Another device or collaborator cannot rely on an unsaved browser draft, even when the local editor currently looks correct.",
    href: assembly.editorHref,
    actionLabel: "Open unsaved draft",
  });

  const versionedOutput = finishingEvidence.versionedOutput;
  if (versionedOutput?.activeMasters && !versionedOutput.verifiedArtifacts) attention.push({
    id: "episode-artifact-missing",
    severity: "REVIEW",
    lane: "outputs",
    title: "The active Episode master has no verified delivery artifact",
    detail: "The mastered candidate remains intact; create and verify a separate encoded AAC version for distribution review.",
    consequence: "Proof-listen and Episode package selection cannot identify immutable delivery bytes.",
  });
  if (versionedOutput?.verifiedArtifacts && !versionedOutput.approvedArtifacts) attention.push({
    id: "episode-proof-listen",
    severity: "HIGH",
    lane: "outputs",
    title: `${versionedOutput.verifiedArtifacts} encoded Episode artifact${versionedOutput.verifiedArtifacts === 1 ? " needs" : "s need"} proof-listen review`,
    detail: "Encoding verification proves technical properties, not the actual beginning, midpoint, ending, or creative acceptability.",
    consequence: "Quipsly will not offer unreviewed encoded bytes as the Episode package candidate.",
  });
  if (versionedOutput?.packetEligible && !versionedOutput.selectedPackets) attention.push({
    id: "episode-packet-selection",
    severity: "REVIEW",
    lane: "outputs",
    title: "Approved Episode audio is ready for reversible packet selection",
    detail: "Choose which exact proof-listened artifact should become the current Episode package candidate.",
    consequence: "Metadata and publishing preparation have no canonical audio lineage until a version is selected.",
  });
  if (versionedOutput?.selectedPackets && (!versionedOutput.metadataComplete || !versionedOutput.enclosurePublic)) attention.push({
    id: "episode-package-open-facts",
    severity: "REVIEW",
    lane: "outputs",
    title: "The selected Episode package still has open publication facts",
    detail: `${versionedOutput.metadataComplete ? "Metadata reviewed" : "Metadata needs review"} · ${versionedOutput.enclosurePublic ? "public enclosure ready" : "public enclosure not hosted"}.`,
    consequence: "Selection remains a reversible internal decision; it is not an upload, RSS change, or publication authorization.",
  });

  const releasedOutputs = finishingEvidence.outputs.filter((output) => output.status === "RELEASED");
  const deliveryCount = finishingEvidence.outputs.reduce((total, output) => total + output.deliveryCount, 0);
  const podcastFinishEvidence = versionedOutput
    ? `${versionedOutput.approvedArtifacts} proof-listened artifact${versionedOutput.approvedArtifacts === 1 ? "" : "s"} · ${versionedOutput.selectedPackets} selected package`
    : null;
  const sessionDeliveryEvidence = `${releasedOutputs.length} released ${versionedOutput ? "Session " : ""}output${releasedOutputs.length === 1 ? "" : "s"} · ${deliveryCount} delivery event${deliveryCount === 1 ? "" : "s"}`;
  const assemblySaved = Boolean(
    assembly
    && assembly.state === "MATERIALIZED_ASSEMBLY"
    && assembly.currentProposalSetCount > 0
    && assembly.currentReviewReceiptCount > 0
    && assembly.canonicallyLinkedDraftActionCount > 0
    && assembly.unsavedLocalDraftActionCount === 0,
  );
  const assemblyStage = assembly ? {
    state: assembly.state === "BLOCKED"
      ? "BLOCKED" as const
      : assemblySaved
        ? "READY" as const
        : assembly.state === "NO_CAPTURE_TAKE"
          ? "NOT_OBSERVED" as const
          : "IN_PROGRESS" as const,
    summary: assemblySaved
      ? "Reviewed edit actions are linked to a canonical Episode timeline save."
      : assembly.state === "MATERIALIZED_ASSEMBLY"
        ? "The take is assembly-ready; proposal review and canonical save truth remain visible."
        : assembly.state === "MATERIALIZED_MEDIA"
          ? "Capture media is editable; transcript, speaker, or camera evidence is still incomplete."
          : assembly.state === "READY_TO_MATERIALIZE"
            ? "The verified Capture take is ready for an explicit canonical timeline save."
            : assembly.state === "BLOCKED"
              ? "The Capture take is held before trustworthy timeline materialization."
              : "No Capture take from this Session is observed in the bound Episode.",
    evidence: `${assembly.sessionTimelineClipCount} Session clips · ${assembly.canonicalTakeCount} materialized take${assembly.canonicalTakeCount === 1 ? "" : "s"} · ${assembly.currentProposalSetCount} current proposal set${assembly.currentProposalSetCount === 1 ? "" : "s"} · ${assembly.unsavedLocalDraftActionCount} unsaved draft actions · ${assembly.canonicalTimelineSaveCount} canonical saves`,
    href: assembly.editorHref,
    actionLabel: "Open exact Episode editor",
  } : null;
  const stages: SessionFinishingStage[] = [
    {
      id: "recover",
      label: "Recover",
      state: topology.exitReadiness.safeToLeaveAllEndpoints ? "READY" : "BLOCKED",
      summary: topology.exitReadiness.safeToLeaveAllEndpoints ? "All reconciled endpoint queues and required server masters agree." : "Source or endpoint recovery is still open.",
      evidence: `${topology.exitReadiness.serverSafeRequiredSourceCount}/${topology.exitReadiness.requiredSourceCount} server-safe masters · ${topology.exitReadiness.drainedEndpointCount}/${topology.exitReadiness.endpointQueueCount} endpoint queues drained`,
      lane: "recordings",
    },
    {
      id: "understand",
      label: "Understand",
      state: completedTranscripts.length ? "IN_PROGRESS" : "NOT_OBSERVED",
      summary: completedTranscripts.length ? "Source-bound transcript evidence is available for human review." : "No completed source-bound transcript is observed.",
      evidence: `${completedTranscripts.length} completed transcript source${completedTranscripts.length === 1 ? "" : "s"} · ${completedTranscripts.reduce((total, job) => total + job.segmentCount, 0)} segments`,
      lane: "transcript",
    },
    {
      id: "repair",
      label: "Repair",
      state: finishingEvidence.analyzedSourceCount > 0 ? "IN_PROGRESS" : "NOT_OBSERVED",
      summary: finishingEvidence.analyzedSourceCount ? "Audio evidence exists; treatment still requires audition and review." : "No complete audio-analysis coverage is observed.",
      evidence: `${finishingEvidence.analyzedSourceCount}/${analyzableSourceCount} source analyses · ${finishingEvidence.sourceClockAttention?.total ?? 0} exact ranges queued`,
      lane: "transcript",
    },
    {
      id: "assemble",
      label: "Assemble",
      state: assemblyStage?.state ?? (attached ? "IN_PROGRESS" : handoffHolds ? "BLOCKED" : "NOT_OBSERVED"),
      summary: assemblyStage?.summary ?? (attached ? "Immutable Session sources are attached to Studio; editorial choice is not inferred." : "No verified Studio source attachment is observed."),
      evidence: assemblyStage?.evidence ?? `${attached} attached · ${readyForHandoff} ready · ${handoffHolds} integrity holds`,
      lane: "outputs",
      href: assemblyStage?.href,
      actionLabel: assemblyStage?.actionLabel,
    },
    {
      id: "finish",
      label: "Finish",
      state: releasedOutputs.length && deliveryCount || versionedOutput?.selectedPackets ? "IN_PROGRESS" : "NOT_OBSERVED",
      summary: versionedOutput?.selectedPackets
        ? "A versioned Episode package candidate exists; hosting, metadata, upload, and publication remain separate."
        : deliveryCount ? "A governed Session delivery history exists." : versionedOutput?.approvedArtifacts ? "Approved Episode audio awaits package selection." : "No governed Session delivery is observed.",
      evidence: [podcastFinishEvidence, sessionDeliveryEvidence].filter(Boolean).join(" · "),
      lane: "outputs",
    },
  ];

  attention.sort((left, right) => severityRank[left.severity] - severityRank[right.severity] || left.id.localeCompare(right.id));
  return {
    attention,
    stages,
    counts: {
      blockers: attention.filter((item) => item.severity === "BLOCKER").length,
      high: attention.filter((item) => item.severity === "HIGH").length,
      review: attention.filter((item) => item.severity === "REVIEW").length,
    },
  };
}
