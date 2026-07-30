import "server-only";

import {
  buildCaptureTranscriptManifestObjectName,
  buildCaptureTranscriptResultObjectName,
  parseCaptureTranscriptManifest,
  parseCaptureTranscriptResult,
  type CaptureTranscriptResult,
} from "@high-ground/quipsly-media-processing";

import { getMediaBucket } from "@/lib/server/gcs";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";

export type CaptureTranscriptReconciliation =
  | {
      status: "completed";
      transcriptJobId: string;
      segmentCount: number;
      wordCount: number;
      alreadyCompleted: boolean;
    }
  | {
      status: "pending" | "held" | "failed";
      transcriptJobId: string;
      message: string | null;
    };

/**
 * Projects immutable worker receipts into canonical DB rows. This is safe to
 * invoke from every polling/read boundary: completion is append-once and the
 * consent gate is evaluated again immediately before any transcript text is
 * made visible in Nest or Studio.
 */
export async function reconcileCaptureTranscriptJob(input: {
  prisma: any;
  transcriptJobId: string;
}): Promise<CaptureTranscriptReconciliation> {
  const job = await input.prisma.transcriptJob.findUnique({
    where: { id: input.transcriptJobId },
    include: {
      asset: true,
      _count: { select: { segments: true, words: true } },
    },
  });
  if (!job) {
    return {
      status: "failed",
      transcriptJobId: input.transcriptJobId,
      message: "Transcript job was not found.",
    };
  }
  if (job.status === "COMPLETED") {
    return {
      status: "completed",
      transcriptJobId: job.id,
      segmentCount: job._count.segments,
      wordCount: job._count.words,
      alreadyCompleted: true,
    };
  }
  if (!job.asset) {
    return failJob(
      input.prisma,
      job,
      "Transcript job has no recording asset.",
    );
  }
  const manifestObjectName = job.processingManifestObject;
  if (!manifestObjectName || !job.asset.storageBucket) {
    return {
      status: job.status === "HELD" ? "held" : "pending",
      transcriptJobId: job.id,
      message: job.errorMessage,
    };
  }
  if (
    manifestObjectName !== buildCaptureTranscriptManifestObjectName(job.id)
  ) {
    return failJob(
      input.prisma,
      job,
      "Transcript manifest path does not match the canonical job.",
    );
  }

  const bucket = getMediaBucket(job.asset.storageBucket);
  const storedManifest = await loadJsonOrNull(bucket, manifestObjectName);
  if (!storedManifest) {
    return {
      status: "pending",
      transcriptJobId: job.id,
      message: "Transcript worker manifest has not arrived yet.",
    };
  }
  let manifest;
  try {
    manifest = parseCaptureTranscriptManifest(storedManifest, job.id);
  } catch {
    return failJob(
      input.prisma,
      job,
      "Transcript worker manifest failed integrity validation.",
    );
  }
  if (
    manifest.source.recordingAssetId !== job.asset.id
    || manifest.source.roomId !== job.roomId
    || manifest.source.bucketName !== job.asset.storageBucket
    || manifest.source.objectName !== job.asset.storageObjectPath
    || manifest.source.generation !== job.sourceGeneration
    || manifest.source.sha256 !== job.sourceSha256
  ) {
    return failJob(
      input.prisma,
      job,
      "Transcript worker source binding no longer matches the canonical job.",
    );
  }
  if (manifest.status === "failed-terminal") {
    return failJob(
      input.prisma,
      job,
      manifest.failure?.message || "Transcript worker failed terminal.",
    );
  }
  if (manifest.status !== "completed") {
    return {
      status: "pending",
      transcriptJobId: job.id,
      message: null,
    };
  }

  const resultObjectName = buildCaptureTranscriptResultObjectName(job.id);
  if (manifest.resultObjectName !== resultObjectName) {
    return failJob(
      input.prisma,
      job,
      "Transcript result path does not match the completed manifest.",
    );
  }
  const storedResult = await loadJsonOrNull(bucket, resultObjectName);
  if (!storedResult) {
    return {
      status: "pending",
      transcriptJobId: job.id,
      message: "Transcript result receipt has not arrived yet.",
    };
  }
  let result: CaptureTranscriptResult;
  try {
    result = parseCaptureTranscriptResult(storedResult, manifest);
  } catch {
    return failJob(
      input.prisma,
      job,
      "Transcript result receipt failed integrity validation.",
    );
  }

  const gate = await mobileCaptureTranscriptProcessingGate({
    prisma: input.prisma,
    recordingAsset: job.asset,
  });
  if (!gate.allowed) {
    const prior = jsonObject(job.resultJson);
    await input.prisma.transcriptJob.update({
      where: { id: job.id },
      data: {
        status: "HELD",
        provider: "processing-hold",
        errorMessage: gate.error,
        processingResultObject: resultObjectName,
        resultJson: {
          ...prior,
          source: "capture-transcript-background-worker",
          hold: {
            code: gate.errorCode,
            message: gate.error,
            heldAt: new Date().toISOString(),
            workerResultPreservedPrivately: true,
            transcriptTextProjected: false,
            explicitReleaseRequired: true,
          },
        },
      },
    });
    return {
      status: "held",
      transcriptJobId: job.id,
      message: gate.error,
    };
  }

  return commitResult(input.prisma, job, result, resultObjectName);
}

async function commitResult(
  prisma: any,
  job: any,
  result: CaptureTranscriptResult,
  resultObjectName: string,
): Promise<CaptureTranscriptReconciliation> {
  return prisma.$transaction(async (tx: any) => {
    const locked = await tx.transcriptJob.findUnique({
      where: { id: job.id },
      include: {
        _count: { select: { segments: true, words: true } },
      },
    });
    if (!locked) throw new Error("Transcript job disappeared.");
    if (locked.status === "COMPLETED") {
      return {
        status: "completed",
        transcriptJobId: locked.id,
        segmentCount: locked._count.segments,
        wordCount: locked._count.words,
        alreadyCompleted: true,
      } as const;
    }
    if (locked._count.segments > 0 || locked._count.words > 0) {
      throw new Error(
        "Transcript version already contains immutable provider evidence.",
      );
    }

    const segmentIds: string[] = [];
    for (const segment of result.segments) {
      const created = await tx.transcriptSegment.create({
        data: {
          transcriptJobId: locked.id,
          speakerLabel: segment.speakerLabel,
          startSeconds: segment.startSeconds,
          endSeconds: segment.endSeconds,
          text: segment.text,
          confidence: segment.confidence,
          metadataJson: {
            source: "capture-transcript-background-worker",
            providerShape: segment.providerShape,
            providerSegmentOrdinal: segment.ordinal,
            wordStartIndex: segment.wordStartIndex,
            wordEndIndexExclusive: segment.wordEndIndexExclusive,
            channel: segment.channel,
          },
        },
        select: { id: true },
      });
      segmentIds.push(created.id);
    }
    const wordRows = result.words.map((word) => {
      const segment = result.segments.find(
        (candidate) => word.index >= candidate.wordStartIndex
          && word.index < candidate.wordEndIndexExclusive,
      );
      if (!segment) {
        throw new Error("Transcript word is not covered by a segment.");
      }
      return {
        transcriptJobId: locked.id,
        segmentId: segmentIds[segment.ordinal]!,
        providerWordIndex: word.index,
        startSeconds: word.startSeconds,
        endSeconds: word.endSeconds,
        word: word.word,
        punctuatedWord: word.punctuatedWord,
        confidence: word.confidence,
        speakerLabel: word.speakerLabel,
        channel: word.channel,
        metadataJson: {
          source: "capture-transcript-background-worker",
          provider: result.provider.name,
          providerRequestId: result.provider.requestId,
        },
      };
    });
    await tx.transcriptWord.createMany({ data: wordRows });

    const prior = jsonObject(locked.resultJson);
    await tx.transcriptJob.update({
      where: { id: locked.id },
      data: {
        status: "COMPLETED",
        provider: result.provider.name,
        completedAt: new Date(result.completedAt),
        errorMessage: null,
        processingResultObject: resultObjectName,
        providerRequestId: result.provider.requestId,
        providerResponseObject: result.rawProviderResponse.objectName,
        workerBuildId: result.worker.buildId,
        resultJson: {
          ...prior,
          source: "capture-transcript-background-worker",
          provider: result.provider.name,
          model: result.provider.model,
          providerRequestId: result.provider.requestId,
          segmentCount: result.segments.length,
          wordCount: result.words.length,
          durationSeconds: result.provider.durationSeconds,
          channels: result.provider.channels,
          immutableSource: result.source,
          providerResponseReceipt: result.rawProviderResponse,
          worker: result.worker,
          completedAt: result.completedAt,
        },
      },
    });
    return {
      status: "completed",
      transcriptJobId: locked.id,
      segmentCount: result.segments.length,
      wordCount: result.words.length,
      alreadyCompleted: false,
    } as const;
  }, { isolationLevel: "Serializable" });
}

async function failJob(
  prisma: any,
  job: any,
  message: string,
): Promise<CaptureTranscriptReconciliation> {
  await prisma.transcriptJob.update({
    where: { id: job.id },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage: message,
      resultJson: {
        ...jsonObject(job.resultJson),
        source: "capture-transcript-background-worker",
        failure: {
          message,
          failedAt: new Date().toISOString(),
          immutableRecordingPreserved: true,
        },
      },
    },
  });
  return {
    status: "failed",
    transcriptJobId: job.id,
    message,
  };
}

async function loadJsonOrNull(bucket: any, objectName: string) {
  try {
    const [raw] = await bucket
      .file(objectName)
      .download({ validation: "crc32c" });
    return JSON.parse(raw.toString("utf8")) as unknown;
  } catch (error) {
    if (Number((error as { code?: unknown }).code) === 404) return null;
    throw error;
  }
}

function jsonObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}
