import "server-only";

import {
  parseAudioMasteryJob,
  parseAudioMasteryResult,
} from "@high-ground/quipsly-media-processing";

import { parseAudibleEventDetectorReceipt } from "@/lib/audio/audible-event-analysis";
import {
  AI_EDIT_PROPOSAL_SET_KIND,
  AI_EDIT_PROPOSAL_SET_VERSION,
  type AiEditProposalSet,
} from "@/lib/editor/ai-edit-proposal-contract";

import {
  buildSessionSourceClockAttention,
  type SessionSourceClockAttention,
  type SessionSourceClockAttentionInput,
  type SessionSourceClockSource,
} from "./session-source-clock-attention";

type LoadInput = {
  prisma: any;
  roomId: string;
  projectId: string;
  projectSlug: string;
  episodeProductionId: string | null;
  episodeSlug: string | null;
  sources: Array<{
    recordingAssetId: string;
    mediaAssetId: string;
    sourceId: string;
    sourceUrl: string;
    sourceKind: "audio" | "video";
    durationSeconds: number;
    label: string;
  }>;
};

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function sourceMap(input: LoadInput) {
  return new Map(input.sources.map((source) => [source.sourceId, {
    roomId: input.roomId,
    recordingAssetId: source.recordingAssetId,
    projectSlug: input.projectSlug,
    episodeSlug: input.episodeSlug,
    mediaAssetId: source.mediaAssetId,
    sourceId: source.sourceId,
    sourceUrl: source.sourceUrl,
    sourceKind: source.sourceKind,
    durationSeconds: source.durationSeconds,
    label: source.label,
  } satisfies SessionSourceClockSource]));
}

function latestBy<T>(rows: T[], key: (row: T) => string | null | undefined) {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const value = key(row);
    if (value && !latest.has(value)) latest.set(value, row);
  }
  return latest;
}

function detectorDecision(value: unknown): "confirmed" | "false-positive" | "needs-comparison" | null {
  if (value === "CONFIRMED") return "confirmed";
  if (value === "FALSE_POSITIVE") return "false-positive";
  if (value === "NEEDS_COMPARISON") return "needs-comparison";
  return null;
}

function validProposalSet(value: unknown): value is AiEditProposalSet {
  const row = object(value);
  const binding = object(row.binding);
  const boundaries = object(row.boundaries);
  return row.kind === AI_EDIT_PROPOSAL_SET_KIND
    && row.version === AI_EDIT_PROPOSAL_SET_VERSION
    && typeof row.proposalSetId === "string"
    && typeof binding.projectSlug === "string"
    && typeof binding.episodeSlug === "string"
    && Array.isArray(row.proposals)
    && Array.isArray(row.reviewCandidates)
    && boundaries.sourceMediaUnchanged === true
    && boundaries.proposalsOnly === true
    && boundaries.proofWatchBeforeApply === true
    && boundaries.staleBindingRejectsApply === true
    && boundaries.noAutomaticSaveRenderOrPublish === true;
}

function exactRange(value: unknown) {
  const row = object(value);
  const startSeconds = Number(row.startSeconds);
  const endSeconds = Number(row.endSeconds);
  return Number.isFinite(startSeconds) && Number.isFinite(endSeconds) && startSeconds >= 0 && endSeconds > startSeconds && endSeconds <= 86_400
    ? { startSeconds, endSeconds }
    : null;
}

function editReviewState(action: unknown) {
  if (action === "DISMISSED") return "dismissed" as const;
  if (action === "APPLIED_TO_DRAFT" || action === "TIMELINE_SAVED") return "applied" as const;
  if (action === "PROOF_LISTENED") return "proof-listened" as const;
  if (action === "PROOF_WATCHED") return "proof-watched" as const;
  return "unreviewed" as const;
}

export async function loadSessionSourceClockAttention(input: LoadInput): Promise<SessionSourceClockAttention> {
  const sourcesById = sourceMap(input);
  const sourcesByRecordingAsset = new Map([...sourcesById.values()].map((source) => [source.recordingAssetId!, source]));
  const sourcesByMediaAsset = new Map([...sourcesById.values()].map((source) => [source.mediaAssetId, source]));
  const recordingAssetIds = [...sourcesByRecordingAsset.keys()];
  const mediaAssetIds = [...sourcesByMediaAsset.keys()];
  const sourceIds = [...sourcesById.keys()];
  const empty: SessionSourceClockAttentionInput = { transcript: [], audibleEvents: [], dialogueRepairs: [], mastery: [], edits: [] };
  if (!sourceIds.length) return buildSessionSourceClockAttention(empty);

  const [transcriptJobs, analyses, repairs, masteryJobs, proposalSets] = await Promise.all([
    input.prisma.transcriptJob.findMany({
      where: { roomId: input.roomId, assetId: { in: recordingAssetIds }, status: "COMPLETED" },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        assetId: true,
        segments: {
          orderBy: [{ startSeconds: "asc" }, { id: "asc" }],
          take: 2_000,
          select: {
            id: true,
            speakerLabel: true,
            startSeconds: true,
            endSeconds: true,
            text: true,
            confidence: true,
            corrections: { where: { status: "accepted" }, orderBy: { updatedAt: "desc" }, take: 1, select: { id: true } },
            verifications: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
          },
        },
      },
    }),
    input.prisma.studioAudibleEventAnalysisReceipt.findMany({
      where: { projectId: input.projectId, sourceId: { in: sourceIds } },
      orderBy: [{ analyzedAt: "desc" }, { id: "desc" }],
      take: 500,
      select: { id: true, sourceId: true, analysisJson: true },
    }),
    input.prisma.studioDialogueRepairCandidate.findMany({
      where: { projectId: input.projectId, sourceId: { in: sourceIds } },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 500,
      select: {
        id: true, sourceId: true, label: true, startSeconds: true, endSeconds: true,
        reviews: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 1, select: { decision: true } },
      },
    }),
    input.prisma.studioAssetProcessingJob.findMany({
      where: { projectId: input.projectId, assetId: { in: mediaAssetIds }, type: "audio-mastery", status: "completed" },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: 500,
      select: {
        id: true, assetId: true, inputJson: true, resultJson: true,
        audioMasterReviews: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 1, select: { decision: true } },
      },
    }),
    input.episodeProductionId ? input.prisma.studioEpisodeEditProposalSet.findMany({
      where: { episodeProductionId: input.episodeProductionId, mediaAssetId: { in: mediaAssetIds } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 500,
      select: {
        id: true, mediaAssetId: true, proposalJson: true,
        reviewReceipts: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 500, select: { action: true, subjectId: true } },
      },
    }) : Promise.resolve([]),
  ]);

  const latestTranscripts = latestBy(transcriptJobs, (row: any) => row.assetId);
  for (const job of latestTranscripts.values()) {
    const source = sourcesByRecordingAsset.get(job.assetId);
    if (!source) continue;
    for (const segment of job.segments) empty.transcript.push({
      id: segment.id,
      segmentId: segment.id,
      source,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      text: segment.text,
      speakerLabel: segment.speakerLabel,
      providerConfidence: segment.confidence,
      reviewState: segment.corrections.length ? "corrected" : segment.verifications.length ? "verified" : "unreviewed",
    });
  }

  const latestAnalyses = latestBy(analyses, (row: any) => row.sourceId);
  const analysisIds = [...latestAnalyses.values()].map((row: any) => row.id);
  const detectorReviews = analysisIds.length ? await input.prisma.studioAudibleEventReviewReceipt.findMany({
    where: { projectId: input.projectId, analysisId: { in: analysisIds } },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: 2_000,
    select: { analysisId: true, eventId: true, decision: true },
  }) : [];
  const latestDetectorReview = latestBy(detectorReviews, (row: any) => `${row.analysisId}:${row.eventId}`);
  for (const row of latestAnalyses.values()) {
    const source = sourcesById.get(row.sourceId);
    const receipt = parseAudibleEventDetectorReceipt(row.analysisJson);
    if (!source || !receipt || receipt.status !== "completed") continue;
    for (const suggestion of receipt.suggestions) {
      const review = latestDetectorReview.get(`${receipt.analysisId}:${suggestion.eventId}`) as any;
      empty.audibleEvents.push({
        id: suggestion.eventId,
        analysisId: receipt.analysisId,
        eventId: suggestion.eventId,
        source,
        startSeconds: suggestion.startSeconds,
        endSeconds: suggestion.endSeconds,
        displayLabel: suggestion.displayLabel,
        family: suggestion.family,
        detectorConfidence: suggestion.confidence,
        reviewState: detectorDecision(review?.decision) ?? "unreviewed",
        detail: suggestion.detail,
      });
    }
  }

  for (const candidate of repairs) {
    const source = sourcesById.get(candidate.sourceId);
    if (!source) continue;
    empty.dialogueRepairs.push({
      id: candidate.id,
      candidateId: candidate.id,
      source,
      startSeconds: candidate.startSeconds,
      endSeconds: candidate.endSeconds,
      label: candidate.label,
      reviewState: detectorDecision(candidate.reviews[0]?.decision) ?? "unreviewed",
    });
  }

  const latestMasteryJobs = latestBy(masteryJobs, (row: any) => row.assetId);
  for (const row of latestMasteryJobs.values()) {
    const source = sourcesByMediaAsset.get(row.assetId);
    if (!source) continue;
    try {
      const job = parseAudioMasteryJob(row.inputJson, row.id);
      const result = parseAudioMasteryResult(object(row.resultJson).receipt, job);
      if (job.source.assetId !== source.mediaAssetId) continue;
      const decision = row.audioMasterReviews[0]?.decision === "APPROVED" ? "approved" : row.audioMasterReviews[0]?.decision === "REJECTED" ? "rejected" : "unreviewed";
      for (const [index, observation] of (result.signalDiagnosis?.observations ?? []).entries()) empty.mastery.push({
        id: `${row.id}:${index}:${observation.kind}`,
        jobId: row.id,
        source,
        startSeconds: observation.startSeconds,
        endSeconds: Math.max(observation.endSeconds, observation.startSeconds + 0.001),
        kind: observation.kind,
        severity: observation.severity,
        detail: observation.detail,
        reviewState: decision,
      });
    } catch {
      // Invalid or stale mastery rows never enter the exact-clock projection.
    }
  }

  const latestProposalSets = latestBy(proposalSets as any[], (row: any) => row.mediaAssetId);
  for (const row of latestProposalSets.values()) {
    const source = sourcesByMediaAsset.get(row.mediaAssetId);
    if (!source || !validProposalSet(row.proposalJson)) continue;
    const proposalSet = row.proposalJson;
    if (proposalSet.binding.projectSlug !== input.projectSlug || proposalSet.binding.episodeSlug !== input.episodeSlug) continue;
    const protectedSourceId = proposalSet.binding.signalEvidence?.protectedPlaybackSourceId;
    if (protectedSourceId && protectedSourceId !== source.sourceId) continue;
    const latestReview = latestBy(row.reviewReceipts, (receipt: any) => receipt.subjectId);
    for (const proposal of proposalSet.proposals) {
      const range = exactRange(proposal.sourceRange);
      if (!range) continue;
      empty.edits.push({
        id: proposal.proposalId,
        proposalSetId: proposalSet.proposalSetId,
        subjectId: proposal.proposalId,
        subjectKind: "proposal",
        source,
        ...range,
        editKind: proposal.type,
        rationale: proposal.rationale,
        heuristicConfidence: proposal.confidence,
        reviewState: editReviewState((latestReview.get(proposal.proposalId) as any)?.action),
      });
    }
    for (const candidate of proposalSet.reviewCandidates) {
      const range = exactRange(candidate.sourceRange);
      if (!range) continue;
      empty.edits.push({
        id: candidate.candidateId,
        proposalSetId: proposalSet.proposalSetId,
        subjectId: candidate.candidateId,
        subjectKind: "candidate",
        source,
        ...range,
        editKind: candidate.kind,
        rationale: candidate.rationale,
        heuristicConfidence: candidate.confidence,
        reviewState: editReviewState((latestReview.get(candidate.candidateId) as any)?.action),
      });
    }
  }

  return buildSessionSourceClockAttention(empty);
}
