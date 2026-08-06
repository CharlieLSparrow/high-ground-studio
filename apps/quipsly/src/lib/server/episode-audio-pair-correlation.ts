import "server-only";

import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";
import {
  newAudioPairCorrelationJob,
  parseAudioPairCorrelationJob,
  parseAudioPairCorrelationResult,
  type AudioPairCorrelationMeasurement,
} from "@high-ground/quipsly-media-processing";

import { buildEpisodeAudioComparisonPlan } from "@/lib/episode-audio-comparison";
import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { loadEpisodeAudioActivityAnalysisContext } from "@/lib/server/episode-audio-activity-analysis";
import { projectEpisodeAudioTrackDecisions } from "@/lib/server/episode-audio-track-decisions";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

const JOB_TYPE = "audio-pair-correlation";

export class EpisodeAudioPairCorrelationError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}

export type PublicEpisodeAudioPairCorrelationStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  analysisReceiptId: string | null;
  activityMomentId: string | null;
  referenceAssetId: string | null;
  observationAssetId: string | null;
  measurement: AudioPairCorrelationMeasurement | null;
  segments: Array<{ programStartSeconds: number; programEndSeconds: number; measurement: AudioPairCorrelationMeasurement }>;
  error: string | null;
  updatedAt: string | null;
  boundaries: { correlationIsNotCausation: true; measurementDoesNotClassifyBleedOrEcho: true; requiresProtectedPlaybackReview: true; createsNoTimelineOrMixChange: true };
};

export async function queueEpisodeAudioPairCorrelation(input: {
  prisma: any;
  projectSlug: string;
  episodeProductionId: string;
  analysisReceiptId: string;
  activityMomentId: string;
  referenceAssetId: string;
  observationAssetId: string;
  actorEmail: string;
}) {
  const context = await loadPairContext(input);
  if (context.reference.binding.provider !== "local" || context.observation.binding.provider !== "local") {
    throw new EpisodeAudioPairCorrelationError("Cloud pair correlation is not qualified yet. This release analyzes local retained sources only.", 409, "EPISODE_AUDIO_PAIR_PROVIDER_UNSUPPORTED");
  }
  const job = newAudioPairCorrelationJob({
    jobId: `audio_pair_${randomUUID().replaceAll("-", "")}`,
    projectId: context.project.id,
    episodeProductionId: context.episode.id,
    analysisReceiptId: input.analysisReceiptId,
    activityMomentId: input.activityMomentId,
    programFingerprintSha256: context.program.fingerprintSha256!,
    activeDecisionReceiptIds: context.program.activeDecisions.map((decision) => decision.id),
    requestedByEmail: input.actorEmail,
    queuedAt: new Date().toISOString(),
    reference: pairSource(context.reference, "reference"),
    observation: pairSource(context.observation, "observation"),
  });
  const saved = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `episode-audio-decisions:${context.episode.id}`);
    await acquirePrismaAdvisoryTransactionLock(tx, `episode-audio-pair:${context.episode.id}:${input.analysisReceiptId}:${input.activityMomentId}:${input.referenceAssetId}:${input.observationAssetId}`);
    const decisionRows = await tx.studioEpisodeAudioTrackDecisionReceipt.findMany({ where: { episodeProductionId: context.episode.id }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }], take: 500 });
    const activeIds = projectEpisodeAudioTrackDecisions(decisionRows, context.program.fingerprintSha256!).active.map((decision) => decision.id).sort();
    if (JSON.stringify(activeIds) !== JSON.stringify(job.activeDecisionReceiptIds)) throw new EpisodeAudioPairCorrelationError("Canonical audio decisions changed while pair analysis was being queued.", 409, "EPISODE_AUDIO_PAIR_DECISIONS_CHANGED");
    const existing = await tx.studioAssetProcessingJob.findFirst({ where: pairJobWhere(context.project.id, context.reference.track.assetId, input), orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (existing) {
      try {
        const contract = parseAudioPairCorrelationJob(existing.inputJson, existing.id);
        if (existing.status !== "failed" && contract.reference.source.sha256 === context.reference.binding.sha256 && contract.observation.source.sha256 === context.observation.binding.sha256 && contract.programFingerprintSha256 === context.program.fingerprintSha256) return existing;
      } catch { /* malformed or stale rows do not own the exact request */ }
    }
    return tx.studioAssetProcessingJob.create({ data: { id: job.jobId, projectId: context.project.id, assetId: context.reference.track.assetId, type: JOB_TYPE, status: "queued", requestedByEmail: input.actorEmail, inputJson: json(job) } });
  });
  return toPublicEpisodeAudioPairCorrelationStatus(saved);
}

export async function readEpisodeAudioPairCorrelation(input: { prisma: any; projectSlug: string; episodeProductionId: string; analysisReceiptId: string; activityMomentId: string; referenceAssetId: string; observationAssetId: string }) {
  const context = await loadPairContext(input);
  const row = await input.prisma.studioAssetProcessingJob.findFirst({
    where: pairJobWhere(context.project.id, context.reference.track.assetId, input),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!row) return emptyStatus();
  try {
    const job = parseAudioPairCorrelationJob(row.inputJson, row.id);
    if (job.analysisReceiptId !== input.analysisReceiptId || job.activityMomentId !== input.activityMomentId || job.observation.source.assetId !== input.observationAssetId) return emptyStatus();
  } catch { return emptyStatus(); }
  return toPublicEpisodeAudioPairCorrelationStatus(row);
}

export async function reconcileEpisodeAudioPairCorrelation(input: { prisma: any; projectSlug: string; episodeProductionId: string; analysisReceiptId: string; activityMomentId: string; referenceAssetId: string; observationAssetId: string }) {
  const context = await loadPairContext(input);
  const row = await input.prisma.studioAssetProcessingJob.findFirst({
    where: pairJobWhere(context.project.id, context.reference.track.assetId, input),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!row) return emptyStatus();
  const job = parseAudioPairCorrelationJob(row.inputJson, row.id);
  if (job.analysisReceiptId !== input.analysisReceiptId || job.activityMomentId !== input.activityMomentId || job.observation.source.assetId !== input.observationAssetId) return emptyStatus();
  if (row.status === "completed" || row.status === "failed" || row.status !== "output-ready") return toPublicEpisodeAudioPairCorrelationStatus(row);
  const result = parseAudioPairCorrelationResult(record(row.resultJson).receipt, job);
  const [referenceCurrent, observationCurrent] = await Promise.all([
    inspectImmutableStudioMediaSource(context.reference.providerSourceId, context.reference.mimeType),
    inspectImmutableStudioMediaSource(context.observation.providerSourceId, context.observation.mimeType),
  ]);
  if (!sameBinding(referenceCurrent, job.reference.source) || !sameBinding(observationCurrent, job.observation.source)) {
    throw new EpisodeAudioPairCorrelationError("A retained source changed before pair-analysis registration.", 409, "EPISODE_AUDIO_PAIR_SOURCE_DRIFT");
  }
  const updated = await input.prisma.studioAssetProcessingJob.update({
    where: { id: row.id },
    data: { status: "completed", completedAt: new Date(result.completedAt), error: null, resultJson: json({ state: "completed", receipt: result, registration: { exactSourcesVerifiedAgain: true, classificationNotAuthorized: true } }) },
  });
  return toPublicEpisodeAudioPairCorrelationStatus(updated);
}

async function loadPairContext(input: { prisma: any; projectSlug: string; episodeProductionId: string; analysisReceiptId: string; activityMomentId: string; referenceAssetId: string; observationAssetId: string }) {
  if (!input.analysisReceiptId || !input.activityMomentId || !input.referenceAssetId || !input.observationAssetId || input.referenceAssetId === input.observationAssetId) throw new EpisodeAudioPairCorrelationError("A current analysis event and two distinct retained sources are required.", 400, "EPISODE_AUDIO_PAIR_REQUEST_INVALID");
  const activity = await loadEpisodeAudioActivityAnalysisContext(input);
  if (!activity.program.fingerprintSha256 || !activity.program.summary.hasProgramClock) throw new EpisodeAudioPairCorrelationError("Pair analysis requires the canonical program clock.", 409, "EPISODE_AUDIO_PAIR_CLOCK_REQUIRED");
  const analysis = await input.prisma.studioEpisodeAudioAnalysisReceipt.findFirst({ where: { id: input.analysisReceiptId, projectId: activity.project.id, episodeProductionId: activity.episode.id } });
  if (!analysis || analysis.programFingerprintSha256 !== activity.program.fingerprintSha256) throw new EpisodeAudioPairCorrelationError("The selected analysis receipt is missing or stale.", 409, "EPISODE_AUDIO_PAIR_ANALYSIS_STALE");
  const recordedIds = (Array.isArray(record(analysis.inputJson).activeDecisionReceiptIds) ? record(analysis.inputJson).activeDecisionReceiptIds : []).map(String).sort();
  const currentIds = activity.program.activeDecisions.map((decision) => decision.id).sort();
  if (JSON.stringify(recordedIds) !== JSON.stringify(currentIds)) throw new EpisodeAudioPairCorrelationError("Canonical audio decisions changed after this analysis receipt.", 409, "EPISODE_AUDIO_PAIR_DECISIONS_CHANGED");
  const moment = activity.map.moments.find((candidate) => candidate.id === input.activityMomentId) ?? null;
  if (!moment || !moment.assetIds.includes(input.referenceAssetId) || !moment.assetIds.includes(input.observationAssetId)) throw new EpisodeAudioPairCorrelationError("The selected pair is not part of the current analysis event.", 409, "EPISODE_AUDIO_PAIR_EVENT_CHANGED");
  const playbackSources = activity.program.tracks.map((track) => ({ assetId: track.assetId, sourceId: track.sourceId, playbackUrl: `/protected/${track.assetId}` }));
  const plan = buildEpisodeAudioComparisonPlan({ map: activity.map, moment, playbackSources });
  const referencePlan = plan?.sources.find((source) => source.assetId === input.referenceAssetId) ?? null;
  const observationPlan = plan?.sources.find((source) => source.assetId === input.observationAssetId) ?? null;
  if (!plan || !referencePlan || !observationPlan) throw new EpisodeAudioPairCorrelationError("The selected pair no longer has a common qualified program-clock range.", 409, "EPISODE_AUDIO_PAIR_RANGE_UNAVAILABLE");
  const [reference, observation] = await Promise.all([
    exactSource(input.prisma, activity.project.id, activity.program, referencePlan),
    exactSource(input.prisma, activity.project.id, activity.program, observationPlan),
  ]);
  return { ...activity, analysis, moment, plan, reference, observation };
}

async function exactSource(prisma: any, projectId: string, program: Awaited<ReturnType<typeof loadEpisodeAudioActivityAnalysisContext>>["program"], plan: NonNullable<ReturnType<typeof buildEpisodeAudioComparisonPlan>>["sources"][number]) {
  const track = program.tracks.find((candidate) => candidate.assetId === plan.assetId && candidate.sourceId === plan.sourceId)!;
  const [asset, source] = await Promise.all([
    prisma.studioMediaAsset.findUnique({ where: { id: track.assetId }, include: { assetAttachments: { where: { projectId }, select: { metadataJson: true } } } }),
    prisma.studioVideoSource.findUnique({ where: { id: track.sourceId }, select: { id: true, url: true, providerSourceId: true } }),
  ]);
  const attached = asset?.assetAttachments?.some((attachment: any) => String(record(attachment.metadataJson).sourceId || "") === track.sourceId);
  if (!asset || asset.isProxy || !source?.providerSourceId || source.url !== `/api/ingest/media/${source.id}` || (asset.url !== source.url && !attached)) throw new EpisodeAudioPairCorrelationError("Pair analysis requires exact originals attached to this Nest.", 409, "EPISODE_AUDIO_PAIR_SOURCE_BINDING_INVALID");
  const binding = { assetId: asset.id, ...await inspectImmutableStudioMediaSource(source.providerSourceId, asset.mimeType) };
  return { track, plan, binding, providerSourceId: source.providerSourceId, mimeType: asset.mimeType };
}

function pairSource(entry: Awaited<ReturnType<typeof exactSource>>, role: "reference" | "observation") {
  return {
    role,
    productionRole: entry.track.role,
    participantId: entry.track.participantId,
    source: entry.binding,
    range: {
      programStartSeconds: entry.plan.sourceStartSeconds + entry.plan.programOffsetSeconds,
      programEndSeconds: entry.plan.sourceEndSeconds + entry.plan.programOffsetSeconds,
      sourceStartSeconds: entry.plan.sourceStartSeconds,
      sourceEndSeconds: entry.plan.sourceEndSeconds,
      alignment: entry.plan.alignment === "program-clock" ? "program-clock" as const : "qualified-candidate" as const,
      alignmentEvidenceJobId: entry.plan.alignment === "program-clock" ? null : entry.track.processing.alignment.jobId,
    },
  };
}

export function toPublicEpisodeAudioPairCorrelationStatus(row: any): PublicEpisodeAudioPairCorrelationStatus {
  let job: ReturnType<typeof parseAudioPairCorrelationJob> | null = null;
  let result: ReturnType<typeof parseAudioPairCorrelationResult> | null = null;
  try { job = parseAudioPairCorrelationJob(row.inputJson, row.id); } catch { /* fail closed */ }
  try { if (job) result = parseAudioPairCorrelationResult(record(row.resultJson).receipt, job); } catch { /* fail closed */ }
  const declared = ["queued", "processing", "output-ready", "completed", "failed"].includes(row.status) ? row.status as PublicEpisodeAudioPairCorrelationStatus["status"] : "failed";
  const integrityFailure = !job || (["output-ready", "completed"].includes(declared) && !result);
  return {
    jobId: String(row.id),
    status: integrityFailure ? "failed" : declared,
    analysisReceiptId: job?.analysisReceiptId ?? null,
    activityMomentId: job?.activityMomentId ?? null,
    referenceAssetId: job?.reference.source.assetId ?? null,
    observationAssetId: job?.observation.source.assetId ?? null,
    measurement: result?.measurement ?? null,
    segments: result?.segments ?? [],
    error: integrityFailure ? "Audio pair correlation evidence failed integrity validation." : typeof row.error === "string" ? row.error : null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    boundaries: { correlationIsNotCausation: true, measurementDoesNotClassifyBleedOrEcho: true, requiresProtectedPlaybackReview: true, createsNoTimelineOrMixChange: true },
  };
}

function emptyStatus(): PublicEpisodeAudioPairCorrelationStatus { return { jobId: null, status: "not-queued", analysisReceiptId: null, activityMomentId: null, referenceAssetId: null, observationAssetId: null, measurement: null, segments: [], error: null, updatedAt: null, boundaries: { correlationIsNotCausation: true, measurementDoesNotClassifyBleedOrEcho: true, requiresProtectedPlaybackReview: true, createsNoTimelineOrMixChange: true } }; }
function pairJobWhere(projectId: string, referenceAssetId: string, input: { analysisReceiptId: string; activityMomentId: string; observationAssetId: string }) { return { projectId, assetId: referenceAssetId, type: JOB_TYPE, AND: [{ inputJson: { path: ["analysisReceiptId"], equals: input.analysisReceiptId } }, { inputJson: { path: ["activityMomentId"], equals: input.activityMomentId } }, { inputJson: { path: ["observation", "source", "assetId"], equals: input.observationAssetId } }] }; }
function sameBinding(current: { sha256: string; generation: string; sizeBytes: number }, expected: { sha256: string; generation: string; sizeBytes: number }) { return current.sha256 === expected.sha256 && current.generation === expected.generation && current.sizeBytes === expected.sizeBytes; }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
