import type { SessionFinishingEvidence } from "./session-finishing-cockpit";
import type { SessionReadinessExpectedSource, SessionReadinessSource, SessionReadinessTopology } from "./session-readiness-topology";
import type { SessionSourceEvidence } from "./session-source-evidence-model";

export type SessionSourceJourneyCheckpoint = {
  id: "plan" | "capture" | "retention" | "playback" | "transcript" | "assembly";
  label: string;
  state: "COMPLETE" | "CURRENT" | "HELD" | "MISSING" | "NOT_APPLICABLE";
  detail: string;
  at: string | null;
};

export type SessionSourceJourney = {
  id: string;
  expectedSourceId: string | null;
  recordingAssetId: string | null;
  captureId: string | null;
  participantLabel: string;
  label: string;
  sourceKind: string;
  retentionRole: string;
  deviceLabel: string;
  protectedPlayback: EvidenceSource["protectedPlayback"];
  state: "COMPLETE" | "IN_PROGRESS" | "ATTENTION";
  summary: string;
  checkpoints: SessionSourceJourneyCheckpoint[];
};

export type SessionSourceJourneyProjection = {
  journeys: SessionSourceJourney[];
  counts: { complete: number; inProgress: number; attention: number };
  boundaries: {
    projectionCreatesNoSourceState: true;
    livePresenceIsNotHistoricalEvidence: true;
    serverBytesDoNotProveEndpointDrain: true;
    protectedRouteIsNotObservedPlayback: true;
    completeDecodeIsNotHumanListening: true;
    transcriptAttemptIsNotReferenceTruth: true;
    editorMaterializationIsNotPublication: true;
    sourcePlanIsOptionalForVerifiedObservedMedia: true;
  };
};

type EvidenceSource = SessionSourceEvidence["sources"][number];
type TranscriptJob = SessionFinishingEvidence["transcriptJobs"][number];

function iso(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function latestTranscriptByAsset(jobs: TranscriptJob[]) {
  const latest = new Map<string, TranscriptJob>();
  for (const job of jobs) {
    if (!job.recordingAssetId) continue;
    const current = latest.get(job.recordingAssetId);
    if (!current || (iso(current.updatedAt) ?? "") < (iso(job.updatedAt) ?? "")) {
      latest.set(job.recordingAssetId, job);
    }
  }
  return latest;
}

function findSource(
  sources: SessionReadinessSource[],
  expectation: SessionReadinessExpectedSource,
) {
  if (expectation.recordingAssetId) {
    const byAsset = sources.find((source) => source.id === expectation.recordingAssetId);
    if (byAsset) return byAsset;
  }
  if (expectation.captureId) {
    return sources.find((source) => source.captureId === expectation.captureId) ?? null;
  }
  return null;
}

function planCheckpoint(expectation: SessionReadinessExpectedSource | null): SessionSourceJourneyCheckpoint {
  if (!expectation) return {
    id: "plan",
    label: "Plan",
    state: "NOT_APPLICABLE",
    detail: "Recorded without an advance device plan. Capture and exact-byte evidence remain authoritative.",
    at: null,
  };
  if (expectation.status === "waived" || expectation.status === "canceled") return {
    id: "plan",
    label: "Plan",
    state: "NOT_APPLICABLE",
    detail: `${expectation.status === "waived" ? "Waived" : "Canceled"} at revision ${expectation.revision}${expectation.latestReason ? `: ${expectation.latestReason}` : "."}`,
    at: expectation.updatedAt,
  };
  if (expectation.fulfillment === "fulfilled") return {
    id: "plan",
    label: "Plan",
    state: "COMPLETE",
    detail: `${expectation.retentionRole.replaceAll("-", " ")} is bound to exact released bytes.`,
    at: expectation.updatedAt,
  };
  if (expectation.fulfillment === "candidate-review") return {
    id: "plan",
    label: "Plan",
    state: "HELD",
    detail: `${expectation.candidateSources.length} compatible retained source candidate${expectation.candidateSources.length === 1 ? " needs" : "s need"} an explicit binding decision.`,
    at: expectation.updatedAt,
  };
  return {
    id: "plan",
    label: "Plan",
    state: expectation.fulfillment === "bound-source-pending" ? "CURRENT" : "HELD",
    detail: expectation.fulfillment === "bound-source-invalid"
      ? "The bound source does not satisfy the planned source kind."
      : expectation.fulfillment === "bound-source-pending"
        ? "The planned source is bound, but its retained server copy is not released yet."
        : "No retained source is bound to this active plan item; the absence remains visible instead of disappearing from the Session.",
    at: expectation.updatedAt,
  };
}

function captureCheckpoint(source: SessionReadinessSource | null, evidence: EvidenceSource | null): SessionSourceJourneyCheckpoint {
  if (evidence?.sourceOrigin === "NEST_RECOVERY_REPLICA") return {
    id: "capture",
    label: "Capture",
    state: evidence.boundaryAuthority === "AUDITED_RECOVERY_REPLICA" ? "NOT_APPLICABLE" : "HELD",
    detail: evidence.boundaryAuthority === "AUDITED_RECOVERY_REPLICA"
      ? "Created through an audited exact-byte recovery decision; native Capture start and stop boundaries are not claimed for this replica."
      : "Recovery lineage is incomplete; Quipsly will not substitute the original source's Capture boundaries for this replica.",
    at: evidence.recoveryAudit?.decidedAt ?? evidence.cloud.verifiedAt,
  };
  if (evidence?.sourceOrigin === "NEST_EXTERNAL_IMPORT") return {
    id: "capture",
    label: "Capture",
    state: "NOT_APPLICABLE",
    detail: "Imported through the staff-reviewed external-source boundary; Capture start and stop receipts are not claimed.",
    at: evidence.cloud.verifiedAt,
  };
  const startedAt = evidence?.startBoundary?.occurredAt ?? source?.startedAt ?? null;
  const stoppedAt = evidence?.stopBoundary?.occurredAt ?? source?.stoppedAt ?? null;
  if (startedAt && stoppedAt) return {
    id: "capture",
    label: "Capture",
    state: "COMPLETE",
    detail: "Durable start and stop boundaries are present for this capture identity.",
    at: stoppedAt,
  };
  if (startedAt) return {
    id: "capture",
    label: "Capture",
    state: "CURRENT",
    detail: "A start boundary exists, but no applied stop boundary is observed yet.",
    at: startedAt,
  };
  if (source?.evidenceKind === "recording-asset") return {
    id: "capture",
    label: "Capture",
    state: "HELD",
    detail: "Retained media exists without a complete Capture boundary pair or reviewed external-import authority.",
    at: source.startedAt,
  };
  return {
    id: "capture",
    label: "Capture",
    state: source ? "CURRENT" : "MISSING",
    detail: source ? "Capture evidence exists, but its durable boundary pair is incomplete." : "No capture or retained-media evidence is bound yet.",
    at: source?.stoppedAt ?? source?.startedAt ?? null,
  };
}

function retentionCheckpoint(source: SessionReadinessSource | null, evidence: EvidenceSource | null): SessionSourceJourneyCheckpoint {
  if (!source) return {
    id: "retention",
    label: "Retain",
    state: "MISSING",
    detail: "No RecordingAsset or exact-byte finalization receipt is bound.",
    at: null,
  };
  const retention = source.serverRetention;
  if (retention.state === "CAPTURE_PLAN_RESOLVED") return {
    id: "retention",
    label: "Retain",
    state: "COMPLETE",
    detail: source.planDisposition
      ? `The interrupted capture receipt remains as evidence. Recording plan revision ${source.planDisposition.revision} ${source.planDisposition.status} this source: ${source.planDisposition.reason}`
      : "The interrupted capture receipt remains as resolved evidence and no longer blocks the active source plan.",
    at: source.planDisposition?.updatedAt ?? retention.updatedAt,
  };
  if (retention.state === "SERVER_COPY_VERIFIED_RELEASED" && evidence?.status === "VERIFIED_MATCH") return {
    id: "retention",
    label: "Retain",
    state: "COMPLETE",
    detail: "Server bytes, checksum, size, storage generation, capture identity, and release receipt agree.",
    at: evidence.recoveryAudit?.decidedAt ?? evidence.releaseAudit?.releasedAt ?? retention.updatedAt ?? evidence.cloud.verifiedAt,
  };
  if (retention.state === "SERVER_COPY_VERIFIED_HELD" || evidence?.status === "HELD" || evidence?.status === "DRIFT") return {
    id: "retention",
    label: "Retain",
    state: "HELD",
    detail: evidence?.issues[0] ?? "The server copy is verified but held, or immutable provenance evidence disagrees.",
    at: retention.updatedAt ?? evidence?.cloud.verifiedAt ?? null,
  };
  if (retention.state === "FINALIZATION_RECEIPT_MISSING") return {
    id: "retention",
    label: "Retain",
    state: "MISSING",
    detail: "Media exists, but the exact upload and release receipt is missing.",
    at: evidence?.cloud.verifiedAt ?? null,
  };
  return {
    id: "retention",
    label: "Retain",
    state: "CURRENT",
    detail: retention.state === "CAPTURE_AWAITING_MEDIA"
      ? "The stopped capture still needs a retained server source."
      : "Upload, verification, or release remains in progress.",
    at: retention.updatedAt,
  };
}

function playbackCheckpoint(
  source: SessionReadinessSource | null,
  evidence: EvidenceSource | null,
): SessionSourceJourneyCheckpoint {
  if (source?.serverRetention.state === "CAPTURE_PLAN_RESOLVED") return {
    id: "playback",
    label: "Playback",
    state: "NOT_APPLICABLE",
    detail: "This interrupted capture was resolved without retained media, so no playable source is claimed.",
    at: source.serverRetention.updatedAt,
  };
  if (!source || source.evidenceKind !== "recording-asset" || !evidence) return {
    id: "playback",
    label: "Playback",
    state: "MISSING",
    detail: "Playback waits for a retained RecordingAsset and its exact-byte evidence.",
    at: null,
  };
  if (
    source.serverRetention.state === "SERVER_COPY_VERIFIED_HELD"
    || evidence.status === "HELD"
    || evidence.status === "DRIFT"
  ) return {
    id: "playback",
    label: "Playback",
    state: "HELD",
    detail: evidence.issues[0] ?? "Playback is held because immutable source evidence needs attention.",
    at: source.serverRetention.updatedAt ?? evidence.cloud.verifiedAt,
  };
  if (
    source.serverRetention.state !== "SERVER_COPY_VERIFIED_RELEASED"
    || evidence.status !== "VERIFIED_MATCH"
  ) return {
    id: "playback",
    label: "Playback",
    state: "CURRENT",
    detail: "Protected playback waits for verification and release of the exact retained bytes.",
    at: source.serverRetention.updatedAt ?? evidence.cloud.verifiedAt,
  };
  if (!evidence.protectedPlayback) return {
    id: "playback",
    label: "Playback",
    state: "CURRENT",
    detail: "Exact bytes are released, but the authenticated playback source has not materialized yet.",
    at: evidence.releaseAudit?.releasedAt ?? evidence.cloud.verifiedAt,
  };

  if (evidence.protectedPlayback.kind === "audio") {
    if (evidence.analysis?.status === "failed" || evidence.analysis?.status === "blocked") return {
      id: "playback",
      label: "Playback",
      state: "HELD",
      detail: evidence.analysis.error
        ? `The exact-source decode check failed: ${evidence.analysis.error}`
        : "The exact-source decode check is blocked or failed; the retained original remains unchanged.",
      at: evidence.analysis.updatedAt,
    };
    if (
      evidence.analysis?.exactSourceBound
      && evidence.analysis.completeDecode
      && (evidence.analysis.media?.durationSeconds ?? 0) > 0
    ) return {
      id: "playback",
      label: "Playback",
      state: "COMPLETE",
      detail: "An authenticated player is bound to the retained source and an exact-source complete decode has a positive duration. Human listening remains separate acceptance evidence.",
      at: evidence.analysis.completedAt ?? evidence.analysis.updatedAt,
    };
    return {
      id: "playback",
      label: "Playback",
      state: "CURRENT",
      detail: "The authenticated audio source exists; complete exact-source decode evidence is still preparing.",
      at: evidence.analysis?.updatedAt ?? evidence.releaseAudit?.releasedAt ?? evidence.cloud.verifiedAt,
    };
  }

  const recordedVideo = evidence.captureRuntime.videoFormat?.recorded;
  if (
    (evidence.protectedPlayback.durationSeconds ?? 0) > 0
    && (recordedVideo?.videoTrackCount ?? 0) > 0
    && (recordedVideo?.encodedWidthPixels ?? 0) > 0
    && (recordedVideo?.encodedHeightPixels ?? 0) > 0
  ) return {
    id: "playback",
    label: "Playback",
    state: "COMPLETE",
    detail: "An authenticated player is bound to the retained source and the recorded video track has a positive duration and encoded dimensions. Human viewing remains separate acceptance evidence.",
    at: evidence.releaseAudit?.releasedAt ?? evidence.cloud.verifiedAt,
  };
  return {
    id: "playback",
    label: "Playback",
    state: "CURRENT",
    detail: "The authenticated video source exists; its recorded track profile and duration are still being validated.",
    at: evidence.releaseAudit?.releasedAt ?? evidence.cloud.verifiedAt,
  };
}

function transcriptCheckpoint(
  source: SessionReadinessSource | null,
  job: TranscriptJob | null,
): SessionSourceJourneyCheckpoint {
  if (!source || source.evidenceKind !== "recording-asset") return {
    id: "transcript",
    label: "Transcript",
    state: "MISSING",
    detail: "A transcript cannot bind until a RecordingAsset exists.",
    at: null,
  };
  if (!job) return {
    id: "transcript",
    label: "Transcript",
    state: source.serverRetention.state === "SERVER_COPY_VERIFIED_RELEASED" ? "CURRENT" : "MISSING",
    detail: source.serverRetention.state === "SERVER_COPY_VERIFIED_RELEASED"
      ? "Released source bytes are ready for a source-bound transcript attempt."
      : "Transcription waits for released exact source bytes.",
    at: source.serverRetention.updatedAt,
  };
  if (job.readiness?.state === "HELD") return {
    id: "transcript",
    label: "Transcript",
    state: "HELD",
    detail: job.readiness.detail,
    at: job.updatedAt,
  };
  if (job.readiness?.state === "PROCESSING" || job.readiness?.state === "REVIEW_REQUIRED") return {
    id: "transcript",
    label: "Transcript",
    state: "CURRENT",
    detail: job.readiness.detail,
    at: job.updatedAt,
  };
  if (job.readiness?.state === "READY") return {
    id: "transcript",
    label: "Transcript",
    state: "COMPLETE",
    detail: job.readiness.detail,
    at: job.updatedAt,
  };
  if (job.status === "COMPLETED" && job.segmentCount > 0) return {
    id: "transcript",
    label: "Transcript",
    state: "COMPLETE",
    detail: `${job.segmentCount} immutable provider segment${job.segmentCount === 1 ? "" : "s"} are bound to this source; corrections remain separate evidence.`,
    at: job.updatedAt,
  };
  if (job.status === "FAILED" || job.status === "HELD") return {
    id: "transcript",
    label: "Transcript",
    state: "HELD",
    detail: `The latest source-bound transcript attempt is ${job.status.toLowerCase()}; source media and prior corrections remain unchanged.`,
    at: job.updatedAt,
  };
  return {
    id: "transcript",
    label: "Transcript",
    state: "CURRENT",
    detail: `The latest source-bound transcript attempt is ${job.status.toLowerCase()}.`,
    at: job.updatedAt,
  };
}

function assemblyCheckpoint(
  evidence: EvidenceSource | null,
  assembly: SessionFinishingEvidence["assembly"],
): SessionSourceJourneyCheckpoint {
  if (!assembly) return {
    id: "assembly",
    label: "Editor",
    state: "NOT_APPLICABLE",
    detail: "No Episode assembly is bound to this Session; this does not block coaching or archive outcomes.",
    at: null,
  };
  const selectedRecordingAssetIds = assembly.selectedRecordingAssetIds ?? [];
  const sourceIsSelected = evidence
    ? selectedRecordingAssetIds.length > 0
      ? selectedRecordingAssetIds.includes(evidence.recordingAssetId)
      : Boolean(evidence.captureGroupId && evidence.captureGroupId === assembly.captureGroupId)
    : false;
  if (!sourceIsSelected) return {
    id: "assembly",
    label: "Editor",
    state: "NOT_APPLICABLE",
    detail: "This source is preserved outside the currently selected Capture take; sharing a Session or Capture group does not silently place it on the timeline.",
    at: assembly.productionUpdatedAt,
  };
  if (assembly.state === "BLOCKED") return {
    id: "assembly",
    label: "Editor",
    state: "HELD",
    detail: assembly.nextAction,
    at: assembly.productionUpdatedAt,
  };
  if (assembly.state === "READY_TO_MATERIALIZE") return {
    id: "assembly",
    label: "Editor",
    state: "CURRENT",
    detail: "The verified take is ready for an explicit conflict-safe timeline save.",
    at: assembly.productionUpdatedAt,
  };
  return {
    id: "assembly",
    label: "Editor",
    state: "COMPLETE",
    detail: assembly.state === "MATERIALIZED_ASSEMBLY"
      ? "The source is represented in the canonical take and assembly evidence."
      : "The source is represented in the canonical editable take; automated assembly remains separate.",
    at: assembly.latestCanonicalSaveAt ?? assembly.productionUpdatedAt,
  };
}

function journeyState(checkpoints: SessionSourceJourneyCheckpoint[]) {
  if (checkpoints.some((checkpoint) => checkpoint.state === "HELD")) return "ATTENTION" as const;
  if (checkpoints.some((checkpoint) => checkpoint.state === "CURRENT" || checkpoint.state === "MISSING")) return "IN_PROGRESS" as const;
  return "COMPLETE" as const;
}

function journeySummary(checkpoints: SessionSourceJourneyCheckpoint[]) {
  const attention = checkpoints.find((checkpoint) => checkpoint.state === "HELD");
  if (attention) return `${attention.label} needs attention: ${attention.detail}`;
  const active = checkpoints.find((checkpoint) => checkpoint.state === "CURRENT" || checkpoint.state === "MISSING");
  if (active) return `${active.label} is next: ${active.detail}`;
  return "Every applicable source checkpoint is complete; downstream editorial and publication authority remain separate.";
}

export function buildSessionSourceJourneyProjection(input: {
  topology: SessionReadinessTopology;
  sourceEvidence: SessionSourceEvidence;
  finishingEvidence: SessionFinishingEvidence;
}): SessionSourceJourneyProjection {
  const sourcesWithPeople = [
    ...input.topology.people.flatMap((person) => person.sources.map((source) => ({ source, participantLabel: person.label }))),
    ...input.topology.unassignedSources.map((source) => ({ source, participantLabel: "Unassigned source" })),
  ];
  const allSources = sourcesWithPeople.map(({ source }) => source);
  const participantBySourceId = new Map(sourcesWithPeople.map(({ source, participantLabel }) => [source.id, participantLabel]));
  const evidenceByAsset = new Map(input.sourceEvidence.sources.map((source) => [source.recordingAssetId, source]));
  const transcriptByAsset = latestTranscriptByAsset(input.finishingEvidence.transcriptJobs);
  const coveredSourceIds = new Set<string>();

  const makeJourney = (
    expectation: SessionReadinessExpectedSource | null,
    source: SessionReadinessSource | null,
  ): SessionSourceJourney => {
    if (source) coveredSourceIds.add(source.id);
    const evidence = source?.evidenceKind === "recording-asset" ? evidenceByAsset.get(source.id) ?? null : null;
    const transcript = source?.evidenceKind === "recording-asset" ? transcriptByAsset.get(source.id) ?? null : null;
    const checkpoints = [
      planCheckpoint(expectation),
      captureCheckpoint(source, evidence),
      retentionCheckpoint(source, evidence),
      playbackCheckpoint(source, evidence),
      transcriptCheckpoint(source, transcript),
      assemblyCheckpoint(evidence, input.finishingEvidence.assembly),
    ];
    const state = journeyState(checkpoints);
    return {
      id: expectation?.id ?? `observed:${source?.id ?? "missing"}`,
      expectedSourceId: expectation?.id ?? null,
      recordingAssetId: source?.evidenceKind === "recording-asset" ? source.id : null,
      captureId: source?.captureId ?? expectation?.captureId ?? null,
      participantLabel: expectation?.participantLabel ?? (source ? participantBySourceId.get(source.id) : null) ?? "Unassigned source",
      label: expectation?.label ?? source?.label ?? "Planned source",
      sourceKind: expectation?.sourceKind ?? source?.sourceKind ?? "unknown",
      retentionRole: expectation?.retentionRole ?? "unplanned",
      deviceLabel: source?.deviceLabel ?? expectation?.expectedDeviceLabel ?? expectation?.expectedClientKind ?? "Device not observed",
      protectedPlayback: evidence?.protectedPlayback ?? null,
      state,
      summary: journeySummary(checkpoints),
      checkpoints,
    };
  };

  const journeys = [
    ...input.topology.expectedSources.map((expectation) => makeJourney(expectation, findSource(allSources, expectation))),
    ...sourcesWithPeople
      .filter(({ source }) => !coveredSourceIds.has(source.id))
      .map(({ source }) => makeJourney(null, source)),
  ].sort((left, right) => {
    const rank = { ATTENTION: 0, IN_PROGRESS: 1, COMPLETE: 2 } as const;
    if (rank[left.state] !== rank[right.state]) return rank[left.state] - rank[right.state];
    if (left.participantLabel !== right.participantLabel) return left.participantLabel.localeCompare(right.participantLabel);
    return left.label.localeCompare(right.label);
  });

  return {
    journeys,
    counts: {
      complete: journeys.filter((journey) => journey.state === "COMPLETE").length,
      inProgress: journeys.filter((journey) => journey.state === "IN_PROGRESS").length,
      attention: journeys.filter((journey) => journey.state === "ATTENTION").length,
    },
    boundaries: {
      projectionCreatesNoSourceState: true,
      livePresenceIsNotHistoricalEvidence: true,
      serverBytesDoNotProveEndpointDrain: true,
      protectedRouteIsNotObservedPlayback: true,
      completeDecodeIsNotHumanListening: true,
      transcriptAttemptIsNotReferenceTruth: true,
      editorMaterializationIsNotPublication: true,
      sourcePlanIsOptionalForVerifiedObservedMedia: true,
    },
  };
}
