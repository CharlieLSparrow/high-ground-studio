import "server-only";

import {
  SOURCE_AUDIO_NAVIGATION_PROFILE,
  newSourceAudioNavigationJob,
  parseSourceAudioNavigationJob,
  parseSourceAudioNavigationResult,
  sourceAudioNavigationIdentity,
} from "@high-ground/quipsly-media-processing";
import { sourceAudioNavigationJobId } from "@high-ground/quipsly-media-processing/source-navigation-identity";
import type { PrismaClient } from "@prisma/client";

import { compactEpisodeMixWaveform } from "@/lib/episode-mix-waveform";

export const SOURCE_AUDIO_NAVIGATION_JOB_TYPE = "source-audio-navigation";
export const SOURCE_AUDIO_NAVIGATION_JOB_SOURCE =
  "source-story.audio-navigation";

export class SourceAudioNavigationRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "SourceAudioNavigationRequestError";
  }
}

function cleanId(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(result)) {
    throw new SourceAudioNavigationRequestError(
      "invalid-id",
      `${field} is malformed.`,
    );
  }
  return result;
}

function requestId(value: unknown) {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      result,
    )
  ) {
    throw new SourceAudioNavigationRequestError(
      "invalid-request-id",
      "The request identity must be a UUID.",
    );
  }
  return result;
}

function safeNumber(value: bigint | null) {
  if (!value || value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    return 0;
  return Number(value);
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function requestSourceAudioNavigation(input: {
  prisma: PrismaClient;
  projectId: string;
  sourceRevisionId: string;
  actorUserId: string;
  actorEmail: string;
  clientRequestId: string;
  retryFailed?: boolean;
}) {
  const projectId = cleanId(input.projectId, "projectId");
  const sourceRevisionId = cleanId(input.sourceRevisionId, "sourceRevisionId");
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const clientRequestId = requestId(input.clientRequestId);
  const actorEmail = input.actorEmail.trim().toLowerCase();
  const source = await input.prisma.studioMediaSourceRevision.findFirst({
    where: { id: sourceRevisionId, projectId },
    include: {
      project: { select: { slug: true } },
      derivatives: {
        where: { status: "ready", kind: "collaboration-proxy" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!source) {
    throw new SourceAudioNavigationRequestError(
      "source-not-found",
      "That exact source revision is unavailable in this Nest.",
      404,
    );
  }
  if (!source.contentSha256 || !/^[0-9a-f]{64}$/.test(source.contentSha256)) {
    throw new SourceAudioNavigationRequestError(
      "source-bytes-unverified",
      "The exact source bytes must be checksum-bound before audio navigation can be retained.",
      409,
    );
  }
  const proxy = source.derivatives[0];
  if (
    !proxy ||
    proxy.storageProvider !== "local" ||
    !/^(audio|video)\//.test(proxy.mimeType)
  ) {
    throw new SourceAudioNavigationRequestError(
      "audio-navigation-input-unavailable",
      "Create or restore the verified collaboration proxy before decoding its waveform.",
      409,
    );
  }
  const durationSeconds = proxy.durationSeconds ?? source.durationSeconds ?? 0;
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    !safeNumber(proxy.sizeBytes)
  ) {
    throw new SourceAudioNavigationRequestError(
      "audio-navigation-input-unverified",
      "The proxy needs verified duration and byte evidence before audio navigation can be retained.",
      409,
    );
  }
  const identity = sourceAudioNavigationIdentity({
    projectId,
    sourceRevisionId,
    sourceIdentitySha256: source.identitySha256,
    inputGeneration: proxy.generation,
  });
  const jobId = sourceAudioNavigationJobId(identity);
  const manifest = newSourceAudioNavigationJob({
    jobId,
    projectId,
    projectSlug: source.project.slug,
    actorUserId,
    actorEmail,
    queuedAt: new Date().toISOString(),
    source: {
      sourceRevisionId,
      identitySha256: source.identitySha256,
      expectedContentSha256: source.contentSha256,
    },
    input: {
      derivativeId: proxy.id,
      provider: "local",
      locator: proxy.locator,
      generation: proxy.generation,
      contentSha256: proxy.contentSha256,
      sizeBytes: Number(proxy.sizeBytes),
      contentType: proxy.mimeType,
      durationSeconds,
    },
  });
  const existing = await input.prisma.studioWorkflowJob.findUnique({
    where: { id: jobId },
  });
  if (existing) {
    let existingManifest;
    try {
      existingManifest = parseSourceAudioNavigationJob(
        existing.inputJson,
        jobId,
      );
    } catch {
      throw new SourceAudioNavigationRequestError(
        "job-identity-conflict",
        "The audio-navigation identity is bound to different source intent.",
        409,
      );
    }
    if (
      JSON.stringify(existingManifest.source) !==
        JSON.stringify(manifest.source) ||
      JSON.stringify(existingManifest.input) !== JSON.stringify(manifest.input)
    ) {
      throw new SourceAudioNavigationRequestError(
        "job-identity-conflict",
        "The audio-navigation identity no longer matches its exact proxy generation.",
        409,
      );
    }
    if (existing.status === "output-ready" || existing.status === "completed") {
      try {
        parseSourceAudioNavigationResult(
          record(existing.resultJson).receipt,
          existingManifest,
        );
      } catch {
        throw new SourceAudioNavigationRequestError(
          "audio-navigation-integrity-failed",
          "The retained waveform failed its source-bound integrity check.",
          409,
        );
      }
      return { job: existing, replayed: true, state: "ready" as const };
    }
    if (existing.status === "failed" && input.retryFailed) {
      const previous = record(existing.resultJson);
      const history = Array.isArray(previous.failureHistory)
        ? previous.failureHistory
        : [];
      const failure = record(previous.failure);
      const retried = await input.prisma.studioWorkflowJob.update({
        where: { id: jobId },
        data: {
          status: "queued",
          error: null,
          completedAt: null,
          resultJson: {
            state: "queued",
            requestedBy: { actorUserId, actorEmail, clientRequestId },
            failureHistory: Object.keys(failure).length
              ? [...history, failure]
              : history,
            originalRemainsSourceTruth: true,
            inputDerivativeRemainsUnchanged: true,
            analysisDoesNotChangeMedia: true,
          },
        },
      });
      return {
        job: retried,
        replayed: false,
        state: "queued" as const,
      };
    }
    return {
      job: existing,
      replayed: true,
      state: existing.status,
    };
  }
  const job = await input.prisma.studioWorkflowJob.create({
    data: {
      id: jobId,
      projectId,
      type: SOURCE_AUDIO_NAVIGATION_JOB_TYPE,
      source: SOURCE_AUDIO_NAVIGATION_JOB_SOURCE,
      status: "queued",
      priority: 73,
      inputJson: manifest,
      resultJson: {
        state: "queued",
        requestedBy: { actorUserId, actorEmail, clientRequestId },
        originalRemainsSourceTruth: true,
        inputDerivativeRemainsUnchanged: true,
        analysisDoesNotChangeMedia: true,
      },
      requestedByEmail: actorEmail,
    },
  });
  return { job, replayed: false, state: "queued" as const };
}

export function publicSourceAudioNavigationStatus(job: {
  id: string;
  status: string;
  inputJson: unknown;
  resultJson: unknown;
  error: string | null;
  updatedAt: Date;
}) {
  let manifest: ReturnType<typeof parseSourceAudioNavigationJob> | null = null;
  let result: ReturnType<typeof parseSourceAudioNavigationResult> | null = null;
  try {
    manifest = parseSourceAudioNavigationJob(job.inputJson, job.id);
    if (job.status === "output-ready" || job.status === "completed") {
      result = parseSourceAudioNavigationResult(
        record(job.resultJson).receipt,
        manifest,
      );
    }
  } catch {
    manifest = null;
    result = null;
  }
  const failure = record(record(job.resultJson).failure);
  const integrityFailure =
    !manifest ||
    ((job.status === "output-ready" || job.status === "completed") && !result);
  return {
    id: job.id,
    status: integrityFailure ? "failed" : job.status,
    failureCode: integrityFailure
      ? "audio-navigation-integrity-failed"
      : typeof failure.code === "string"
        ? failure.code
        : null,
    error: integrityFailure
      ? "The retained waveform failed integrity validation."
      : job.error,
    updatedAt: job.updatedAt.toISOString(),
    profile: SOURCE_AUDIO_NAVIGATION_PROFILE,
    evidence: result
      ? {
          durationSeconds: result.audioSignal.durationSeconds,
          sampleRate: result.audioSignal.sampleRate,
          channelCount: result.audioSignal.channelCount,
          rmsDbfs: result.audioSignal.rmsDbfs,
          samplePeakDbfs: result.audioSignal.samplePeakDbfs,
          clippedFrameFraction: result.audioSignal.clippedFrameFraction,
          nearSilentFrameFraction: result.audioSignal.nearSilentFrameFraction,
          stereoBalanceDb: result.audioSignal.stereoBalanceDb,
          signalStatus: result.audioSignal.signalStatus,
          waveform: compactEpisodeMixWaveform(result.audioSignal.waveform, 360),
          observations: result.audioSignal.observations,
          frequencyBands: result.audioSignal.frequencyProfile?.bands ?? [],
          overallBandRmsDbfs:
            result.audioSignal.frequencyProfile?.overallBandRmsDbfs ?? [],
          source: {
            sourceRevisionId: result.source.sourceRevisionId,
            inputDerivativeId: result.input.derivativeId,
            inputGeneration: result.input.generation,
          },
          boundaries: result.boundaries,
        }
      : null,
  };
}
