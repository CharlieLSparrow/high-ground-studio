import "server-only";

import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";
import {
  newStudioSourceTranscriptJob,
  parseStudioSourceTranscriptJob,
  parseStudioSourceTranscriptResult,
  type StudioSourceTranscriptAuthorizationKind,
} from "@high-ground/quipsly-media-processing";

import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";

const JOB_TYPE = "source-transcript";
const ORIGINAL_ROLES = new Set(["spine-audio", "audio-source", "phone-audio", "camera-video", "episode-media"]);
const REFERENCE_ROLES = new Set(["reference-clip", "b-roll", "source-clip", "youtube-source-clip"]);

export type PublicStudioSourceTranscriptStatus = {
  jobId: string | null;
  transcriptJobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  provider: string | null;
  language: string | null;
  authorization: null | {
    kind: StudioSourceTranscriptAuthorizationKind;
    importRole: string;
    acceptedAt: string;
    acceptedByEmail: string;
  };
  coverage: null | {
    segmentCount: number;
    wordCount: number;
    timedWordCount: number;
    confidenceWordCount: number;
    speakerLabeledWordCount: number;
    transcriptStartSeconds: number;
    transcriptEndSeconds: number;
    correctionCount: number;
    playbackVerificationCount: number;
  };
  segmentPreview: {
    count: number;
    total: number;
    truncated: boolean;
  };
  segments: Array<{
    id: string;
    ordinal: number;
    startSeconds: number;
    endSeconds: number;
    speakerLabel: string | null;
    text: string;
    confidence: number | null;
  }>;
  capabilities: null | {
    segmentTiming: "provider";
    wordTiming: "provider";
    wordConfidence: "provider";
    segmentConfidence: "unavailable";
    speakerDiarization: "unavailable";
    alternatives: "unavailable";
  };
  error: string | null;
  updatedAt: string | null;
  boundaries: {
    originalRemainsSourceTruth: true;
    confidenceIsNotMeasuredAccuracy: true;
    correctionsRequirePlaybackReview: true;
    createsNoTasksGoalsOrEdits: true;
  };
};

export async function queueStudioSourceTranscript(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  assetId: string;
  sourceId: string;
  actorEmail: string;
  authorizationKind: StudioSourceTranscriptAuthorizationKind;
  authorizationAccepted: boolean;
  language?: string | null;
}) {
  if (!input.authorizationAccepted) throw new Error("Explicit transcription authorization is required.");
  const context = await loadContext(input);
  const expectedAuthorization = authorizationKindForRole(context.importRole);
  if (input.authorizationKind !== expectedAuthorization) {
    throw new Error(expectedAuthorization === "participant-consent-confirmed"
      ? "Original episode recordings require confirmation that participants consented to transcription."
      : "Reference material requires confirmation that it is licensed or permitted for transcription and review.");
  }
  const evidence = await inspectImmutableStudioMediaSource(context.source.providerSourceId, context.asset.mimeType);
  if (evidence.provider !== "local") throw new Error("Cloud episode transcription is not qualified yet. This release accepts local Nest media only.");
  const existing = await input.prisma.studioAssetProcessingJob.findFirst({
    where: { projectId: context.project.id, assetId: context.asset.id, type: JOB_TYPE },
    orderBy: { createdAt: "desc" },
  });
  if (existing && existing.status !== "failed") {
    try {
      const current = parseStudioSourceTranscriptJob(existing.inputJson, existing.id);
      if (
        current.episodeProductionId === context.production.id
        && current.source.sha256 === evidence.sha256
        && current.source.generation === evidence.generation
        && current.source.sizeBytes === evidence.sizeBytes
      ) return toPublicStudioSourceTranscriptStatus(input.prisma, existing);
    } catch {
      // A malformed or legacy row cannot own a new immutable transcript request.
    }
  }

  const now = new Date();
  const jobId = `studio_transcript_${randomUUID().replaceAll("-", "")}`;
  const transcriptJobId = `transcript_${randomUUID().replaceAll("-", "")}`;
  const contract = newStudioSourceTranscriptJob({
    jobId,
    transcriptJobId,
    projectId: context.project.id,
    episodeProductionId: context.production.id,
    episodeSlug: context.production.slug,
    sourceId: context.source.id,
    requestedByEmail: input.actorEmail,
    queuedAt: now.toISOString(),
    source: { assetId: context.asset.id, ...evidence },
    authorization: {
      kind: input.authorizationKind,
      statementVersion: "quipsly-studio-transcription-authorization-v1",
      accepted: true,
      acceptedAt: now.toISOString(),
      acceptedByEmail: input.actorEmail,
      importRole: context.importRole,
      purpose: "episode-production-transcription-and-review",
    },
    provider: {
      name: "openai-whisper-local",
      model: "large-v3-turbo",
      language: input.language?.trim() || "en",
      wordTimestamps: true,
      speakerDiarization: false,
    },
  });
  const saved = await input.prisma.$transaction(async (transaction: any) => {
    await transaction.transcriptJob.create({
      data: {
        id: transcriptJobId,
        roomId: null,
        assetId: null,
        studioMediaAssetId: context.asset.id,
        studioProjectId: context.project.id,
        episodeProductionId: context.production.id,
        status: "QUEUED",
        provider: "pending",
        language: contract.provider.language,
        requestedBy: input.actorEmail,
        sourceGeneration: evidence.generation,
        sourceSha256: evidence.sha256,
        resultJson: toPrismaJson({
          source: "studio-source-transcript",
          processingJobId: jobId,
          authorization: contract.authorization,
          immutableProviderEvidence: true,
          humanReviewed: false,
          createsNoTasksGoalsOrEdits: true,
        }),
      },
    });
    return transaction.studioAssetProcessingJob.create({
      data: {
        id: jobId,
        projectId: context.project.id,
        assetId: context.asset.id,
        type: JOB_TYPE,
        status: "queued",
        requestedByEmail: input.actorEmail,
        inputJson: toPrismaJson(contract),
      },
    });
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
  return toPublicStudioSourceTranscriptStatus(input.prisma, saved);
}

export async function readStudioSourceTranscriptStatus(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  assetId: string;
}) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true } });
  if (!project) return emptyStatus();
  const production = await input.prisma.studioEpisodeProduction.findUnique({
    where: { projectId_slug: { projectId: project.id, slug: input.episodeSlug } },
    select: { id: true },
  });
  if (!production) return emptyStatus();
  const attachment = await input.prisma.studioAssetAttachment.findUnique({
    where: { projectId_assetId: { projectId: project.id, assetId: input.assetId } },
    select: { id: true, metadataJson: true },
  });
  if (!attachment || jsonObject(attachment.metadataJson).episodeSlug !== input.episodeSlug) return emptyStatus();
  const job = await input.prisma.studioAssetProcessingJob.findFirst({
    where: { projectId: project.id, assetId: input.assetId, type: JOB_TYPE },
    orderBy: { createdAt: "desc" },
  });
  return job ? toPublicStudioSourceTranscriptStatus(input.prisma, job) : emptyStatus();
}

export async function reconcileStudioSourceTranscript(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  assetId: string;
  sourceId: string;
}) {
  const context = await loadContext(input);
  const row = await input.prisma.studioAssetProcessingJob.findFirst({
    where: { projectId: context.project.id, assetId: context.asset.id, type: JOB_TYPE },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.status !== "output-ready") return row ? toPublicStudioSourceTranscriptStatus(input.prisma, row) : emptyStatus();
  const job = parseStudioSourceTranscriptJob(row.inputJson, row.id);
  const result = parseStudioSourceTranscriptResult(jsonObject(row.resultJson).receipt, job);
  const current = await inspectImmutableStudioMediaSource(context.source.providerSourceId, context.asset.mimeType);
  if (
    current.sha256 !== job.source.sha256
    || current.generation !== job.source.generation
    || current.sizeBytes !== job.source.sizeBytes
    || result.source.sha256 !== current.sha256
  ) throw new Error("The immutable source changed before transcript registration.");

  await input.prisma.$transaction(async (transaction: any) => {
    const canonical = await transaction.transcriptJob.findUnique({
      where: { id: job.transcriptJobId },
      include: { _count: { select: { segments: true, words: true } } },
    });
    if (
      !canonical
      || canonical.status !== "QUEUED"
      || canonical.studioMediaAssetId !== context.asset.id
      || canonical.studioProjectId !== context.project.id
      || canonical.episodeProductionId !== context.production.id
      || canonical._count.segments !== 0
      || canonical._count.words !== 0
    ) throw new Error("Canonical transcript registration target changed after queueing.");
    const segmentIds = new Map<number, string>();
    for (const segment of result.segments) {
      const created = await transaction.transcriptSegment.create({
        data: {
          transcriptJobId: canonical.id,
          speakerLabel: segment.speakerLabel,
          startSeconds: segment.startSeconds,
          endSeconds: segment.endSeconds,
          text: segment.text,
          confidence: segment.confidence,
          metadataJson: toPrismaJson({
            source: "studio-source-transcript",
            processingJobId: job.jobId,
            providerSegmentOrdinal: segment.ordinal,
            providerCapabilities: result.provider.capabilities,
            immutableProviderEvidence: true,
            humanReviewed: false,
            confidenceIsNotMeasuredAccuracy: true,
          }),
        },
        select: { id: true },
      });
      segmentIds.set(segment.ordinal, created.id);
    }
    await transaction.transcriptWord.createMany({
      data: result.words.map((word) => ({
        transcriptJobId: canonical.id,
        segmentId: segmentIds.get(word.segmentOrdinal)!,
        providerWordIndex: word.index,
        startSeconds: word.startSeconds,
        endSeconds: word.endSeconds,
        word: word.word,
        punctuatedWord: word.punctuatedWord,
        confidence: word.confidence,
        speakerLabel: word.speakerLabel,
        channel: null,
        metadataJson: toPrismaJson({
          source: "studio-source-transcript",
          processingJobId: job.jobId,
          immutableProviderEvidence: true,
          confidenceIsNotMeasuredAccuracy: true,
        }),
      })),
    });
    await transaction.transcriptJob.update({
      where: { id: canonical.id },
      data: {
        status: "COMPLETED",
        provider: result.provider.name,
        language: result.language,
        completedAt: new Date(result.completedAt),
        errorMessage: null,
        sourceGeneration: result.source.generation,
        sourceSha256: result.source.sha256,
        providerResponseObject: result.provider.rawEvidenceLocator,
        workerBuildId: result.worker.buildId,
        resultJson: toPrismaJson({
          ...jsonObject(canonical.resultJson),
          completedAt: result.completedAt,
          provider: result.provider,
          coverage: result.coverage,
          worker: result.worker,
          immutableProviderEvidence: true,
          humanReviewed: false,
          confidenceIsNotMeasuredAccuracy: true,
          createsNoTasksGoalsOrEdits: true,
        }),
      },
    });
    await transaction.studioAssetProcessingJob.update({
      where: { id: row.id },
      data: {
        status: "completed",
        completedAt: new Date(result.completedAt),
        error: null,
        resultJson: toPrismaJson({
          state: "completed",
          receipt: result,
          registration: {
            transcriptJobId: canonical.id,
            segmentCount: result.segments.length,
            wordCount: result.words.length,
            originalRemainsSourceTruth: true,
            transcriptIsAppendOnlyProviderEvidence: true,
          },
        }),
      },
    });
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
  const updated = await input.prisma.studioAssetProcessingJob.findUnique({ where: { id: row.id } });
  return toPublicStudioSourceTranscriptStatus(input.prisma, updated);
}

async function loadContext(input: { prisma: any; projectSlug: string; episodeSlug: string; assetId: string; sourceId: string }) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true, slug: true } });
  if (!project) throw new Error("Nest not found for source transcription.");
  const production = await input.prisma.studioEpisodeProduction.findUnique({
    where: { projectId_slug: { projectId: project.id, slug: input.episodeSlug } },
    select: { id: true, slug: true, projectId: true },
  });
  if (!production) throw new Error("Episode production not found for source transcription.");
  const [asset, source] = await Promise.all([
    input.prisma.studioMediaAsset.findUnique({
      where: { id: input.assetId },
      include: { assetAttachments: { where: { projectId: project.id }, select: { role: true, metadataJson: true } } },
    }),
    input.prisma.studioVideoSource.findUnique({ where: { id: input.sourceId }, select: { id: true, url: true, providerSourceId: true } }),
  ]);
  const attachment = asset?.assetAttachments.find((candidate: any) => {
    const metadata = jsonObject(candidate.metadataJson);
    return metadata.sourceId === input.sourceId && metadata.episodeSlug === input.episodeSlug;
  });
  if (
    !asset || asset.isProxy || !attachment || !source?.providerSourceId
    || source.url !== `/api/ingest/media/${source.id}`
    || (asset.url !== source.url && jsonObject(attachment.metadataJson).sourceId !== source.id)
    || (!String(asset.mimeType || "").startsWith("audio/") && !String(asset.mimeType || "").startsWith("video/"))
  ) throw new Error("Source transcription requires the exact original episode media attached to this Nest.");
  const importRole = String(attachment.role || "episode-media").trim().toLowerCase();
  return { project, production, asset, source: source as { id: string; url: string; providerSourceId: string }, importRole };
}

function authorizationKindForRole(importRole: string): StudioSourceTranscriptAuthorizationKind {
  if (ORIGINAL_ROLES.has(importRole)) return "participant-consent-confirmed";
  if (REFERENCE_ROLES.has(importRole)) return "licensed-or-permitted-source";
  return "licensed-or-permitted-source";
}

export async function toPublicStudioSourceTranscriptStatus(prisma: any, job: any): Promise<PublicStudioSourceTranscriptStatus> {
  let contract: ReturnType<typeof parseStudioSourceTranscriptJob> | null = null;
  let result: ReturnType<typeof parseStudioSourceTranscriptResult> | null = null;
  try { contract = parseStudioSourceTranscriptJob(job.inputJson, job.id); } catch { /* malformed jobs fail closed */ }
  try { if (contract) result = parseStudioSourceTranscriptResult(jsonObject(job.resultJson).receipt, contract); } catch { /* output is private until its receipt validates */ }
  const transcript = contract ? await prisma.transcriptJob.findUnique({
    where: { id: contract.transcriptJobId },
    include: {
      segments: { orderBy: [{ startSeconds: "asc" }, { id: "asc" }], take: 240 },
      _count: { select: { segments: true, words: true, verifications: true } },
    },
  }) : null;
  const declared = ["queued", "processing", "output-ready", "completed", "failed"].includes(job.status)
    ? job.status as PublicStudioSourceTranscriptStatus["status"] : "failed";
  const integrityFailure = !contract || ((declared === "output-ready" || declared === "completed") && !result);
  const completed = declared === "completed" && transcript?.status === "COMPLETED" && Boolean(result);
  const correctionCount = transcript ? await prisma.transcriptCorrection.count({
    where: { segment: { transcriptJobId: transcript.id } },
  }) : 0;
  const segmentPreviewCount = completed ? transcript.segments.length : 0;
  const segmentTotal = completed ? transcript._count.segments : 0;
  return {
    jobId: String(job.id),
    transcriptJobId: contract?.transcriptJobId ?? null,
    status: integrityFailure ? "failed" : completed ? "completed" : declared,
    provider: transcript?.provider || result?.provider.name || contract?.provider.name || null,
    language: transcript?.language || result?.language || contract?.provider.language || null,
    authorization: contract ? {
      kind: contract.authorization.kind,
      importRole: contract.authorization.importRole,
      acceptedAt: contract.authorization.acceptedAt,
      acceptedByEmail: contract.authorization.acceptedByEmail,
    } : null,
    coverage: result ? {
      ...result.coverage,
      segmentCount: transcript?._count.segments ?? result.coverage.segmentCount,
      wordCount: transcript?._count.words ?? result.coverage.wordCount,
      correctionCount,
      playbackVerificationCount: transcript?._count.verifications ?? 0,
    } : null,
    segmentPreview: {
      count: segmentPreviewCount,
      total: segmentTotal,
      truncated: segmentPreviewCount < segmentTotal,
    },
    segments: completed ? transcript.segments.map((segment: any, ordinal: number) => ({
      id: segment.id,
      ordinal,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      speakerLabel: segment.speakerLabel,
      text: segment.text,
      confidence: segment.confidence,
    })) : [],
    capabilities: result?.provider.capabilities ?? null,
    error: integrityFailure ? "Transcript evidence failed integrity validation." : typeof job.error === "string" ? job.error : transcript?.errorMessage || null,
    updatedAt: job.updatedAt?.toISOString?.() ?? null,
    boundaries: transcriptBoundaries(),
  };
}

function emptyStatus(): PublicStudioSourceTranscriptStatus {
  return {
    jobId: null,
    transcriptJobId: null,
    status: "not-queued",
    provider: null,
    language: null,
    authorization: null,
    coverage: null,
    segmentPreview: { count: 0, total: 0, truncated: false },
    segments: [],
    capabilities: null,
    error: null,
    updatedAt: null,
    boundaries: transcriptBoundaries(),
  };
}
function transcriptBoundaries() { return { originalRemainsSourceTruth: true, confidenceIsNotMeasuredAccuracy: true, correctionsRequirePlaybackReview: true, createsNoTasksGoalsOrEdits: true } as const; }
function jsonObject(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function toPrismaJson(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
