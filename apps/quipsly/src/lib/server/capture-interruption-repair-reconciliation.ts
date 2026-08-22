import "server-only";

import { getMediaBucket } from "@/lib/server/gcs";
import {
  ensureInterruptionRepairWorkflowQueued,
  InterruptionRepairOutboxError,
} from "@/lib/server/capture-interruption-repair-processing";
import {
  promoteRepairedMobileCaptureDatabaseEvidence,
} from "@/lib/server/mobile-capture-resumable-finalization";
import {
  buildInterruptionRepairManifestObjectName,
  buildInterruptionRepairResultObjectName,
  parseInterruptionRepairManifest,
  parseInterruptionRepairResult,
} from "@high-ground/quipsly-media-processing";

export type InterruptionRepairReconciliationResult = {
  checked: number;
  completed: number;
  failed: number;
  blocked: number;
};

export async function reconcileInterruptionRepairResults(input: {
  prisma: any;
  projectIds: string[];
  limit?: number;
}): Promise<InterruptionRepairReconciliationResult> {
  const projectIds = [...new Set(input.projectIds.map((value) => value.trim()).filter(Boolean))];
  const limit = Math.max(1, Math.min(10, input.limit ?? 4));
  if (projectIds.length === 0) return { checked: 0, completed: 0, failed: 0, blocked: 0 };
  const jobs = await input.prisma.studioWorkflowJob.findMany({
    where: {
      projectId: { in: projectIds },
      type: "capture-interruption-repair",
      source: "mobile-capture-finalization",
      status: { in: ["queued", "processing", "blocked"] },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const summary = { checked: jobs.length, completed: 0, failed: 0, blocked: 0 };
  for (const job of jobs) {
    const outcome = await reconcileOne(input.prisma, job);
    summary[outcome] += 1;
  }
  return summary;
}

async function reconcileOne(prisma: any, job: any): Promise<"completed" | "failed" | "blocked"> {
  try {
    const row = object(job.inputJson);
    const source = object(row.source);
    if (string(source.storageBackend) === "local-development") return "blocked";
    const control = object(row.processingControl);
    const bucketName = string(control.bucketName || source.bucketName);
    if (!bucketName || !string(control.manifestObjectName)) {
      try {
        await ensureInterruptionRepairWorkflowQueued({ prisma, workflow: job });
        return "blocked";
      } catch (error) {
        if (!(error instanceof InterruptionRepairOutboxError)) throw error;
        await markFailed(prisma, job, "repair-outbox-invalid", error.message);
        return "failed";
      }
    }
    const bucket = getMediaBucket(bucketName);
    const manifestObjectName = string(control.manifestObjectName)
      || buildInterruptionRepairManifestObjectName(job.id);
    const storedManifest = await loadJsonIfPresent(bucket, manifestObjectName);
    if (!storedManifest) return "blocked";
    const manifest = parseInterruptionRepairManifest(storedManifest.value, job.id);
    if (
      manifest.projectId !== job.projectId
      || manifest.source.recordingAssetId !== row.recordingAssetId
      || manifest.source.bucketName !== bucketName
      || manifest.target.bucketName !== bucketName
    ) {
      await markFailed(prisma, job, "repair-manifest-binding-mismatch",
        "Repair manifest no longer matches its workflow and RecordingAsset.");
      return "failed";
    }
    if (manifest.status === "failed-terminal") {
      await markFailed(prisma, job, manifest.failure?.code || "repair-worker-failed",
        manifest.failure?.message || "Repair worker failed terminal.");
      return "failed";
    }
    if (manifest.status !== "completed") return "blocked";
    const storedResult = await loadJsonIfPresent(
      bucket,
      buildInterruptionRepairResultObjectName(job.id),
    );
    if (!storedResult) return "blocked";
    const result = parseInterruptionRepairResult(storedResult.value, manifest);
    await assertStoredOutput(bucket, result);
    await promoteRepairedMobileCaptureDatabaseEvidence({
      prisma,
      workflow: job,
      result,
    });
    return "completed";
  } catch (error) {
    if (isNotFound(error)) return "blocked";
    console.error("[Capture Repair] reconciliation remains retryable", {
      jobId: job.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    await prisma.studioWorkflowJob.update({
      where: { id: job.id },
      data: {
        status: "blocked",
        error: `repair-reconciliation-retry: ${error instanceof Error ? error.message : "Temporary repair reconciliation failure."}`,
      },
    });
    return "blocked";
  }
}

async function assertStoredOutput(bucket: any, result: ReturnType<typeof parseInterruptionRepairResult>) {
  const file = bucket.file(result.output.objectName, { generation: result.output.generation });
  const [metadata] = await file.getMetadata();
  const custom = object(metadata.metadata);
  if (
    String(metadata.generation || "") !== result.output.generation
    || Number(metadata.size) !== result.output.sizeBytes
    || String(metadata.crc32c || "") !== result.output.crc32c
    || String(metadata.contentType || "").toLowerCase() !== result.output.contentType
    || string(custom.outputSha256) !== result.output.sha256
    || string(custom.sourceSha256) !== result.source.sha256
    || string(custom.sourceGeneration) !== result.source.generation
    || string(custom.originalRemainsSourceTruth) !== "true"
  ) throw new Error("Stored repair derivative no longer matches immutable worker evidence.");
}

async function markFailed(prisma: any, job: any, code: string, message: string) {
  await prisma.$transaction(async (transaction: any) => {
    await transaction.studioWorkflowJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        error: `${code}: ${message}`,
        completedAt: new Date(),
      },
    });
    const recordingAssetId = string(object(job.inputJson).recordingAssetId);
    if (!recordingAssetId) return;
    const recording = await transaction.recordingAsset.findUnique({
      where: { id: recordingAssetId },
      select: { localManifestJson: true },
    });
    if (!recording) return;
    const manifest = object(recording.localManifestJson);
    const repair = object(manifest.interruptionRepair);
    await transaction.recordingAsset.update({
      where: { id: recordingAssetId },
      data: {
        localManifestJson: {
          ...manifest,
          interruptionRepair: {
            ...repair,
            status: "failed",
            errorCode: code,
            error: message,
            failedAt: new Date().toISOString(),
            originalRemainsSourceTruth: true,
          },
        },
      },
    });
  });
}

async function loadJsonIfPresent(bucket: any, objectName: string) {
  try {
    const file = bucket.file(objectName);
    const [metadata] = await file.getMetadata();
    const [raw] = await bucket.file(objectName, { generation: metadata.generation }).download({ validation: "crc32c" });
    return { value: JSON.parse(raw.toString("utf8")), generation: String(metadata.generation) };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isNotFound(error: unknown) {
  return Number((error as { code?: unknown; status?: unknown })?.code
    ?? (error as { status?: unknown })?.status) === 404;
}

