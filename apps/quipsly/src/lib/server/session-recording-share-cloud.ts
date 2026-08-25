import "server-only";

import {
  SESSION_RECORDING_SHARE_CLOUD_QUEUE_KIND,
  assertSessionRecordingShareCloudResult,
  buildSessionRecordingShareCloudManifestObjectName,
  buildSessionRecordingShareCloudQueueObjectName,
  buildSessionRecordingShareCloudResultObjectName,
  newSessionRecordingShareCloudManifest,
  parseSessionRecordingShareCloudManifest,
  parseSessionRecordingShareCloudQueueReceipt,
  parseSessionRecordingShareJob,
  type SessionRecordingShareCloudQueueReceipt,
} from "@high-ground/quipsly-media-processing";

import { getMediaBucket, requireMediaBucketName } from "@/lib/server/gcs";
import {
  mediaProcessorEnabled,
  mediaProcessorExecutionRequestIsRecent,
  requestMediaProcessorExecution,
} from "@/lib/server/media-processor-control";

export async function ensureSessionRecordingShareCloudQueued(input: {
  prisma: any;
  workflowJob: any;
}) {
  const job = parseSessionRecordingShareJob(input.workflowJob.inputJson);
  if (
    input.workflowJob.id !== job.jobId ||
    input.workflowJob.type !== "session-recording-share" ||
    input.workflowJob.source !== "session-recording-share"
  )
    throw new Error(
      "Session recording share workflow row drifted from its cloud job.",
    );
  const desired = newSessionRecordingShareCloudManifest(job);
  if (job.target.bucketName !== requireMediaBucketName())
    throw new Error(
      "Session recording share target is outside the configured private media vault.",
    );
  const bucket = getMediaBucket(job.target.bucketName);
  const manifestObjectName = buildSessionRecordingShareCloudManifestObjectName(
    job.jobId,
  );
  const queueObjectName = buildSessionRecordingShareCloudQueueObjectName(
    job.jobId,
  );
  const resultObjectName = buildSessionRecordingShareCloudResultObjectName(
    job.jobId,
  );
  const storedManifest = await saveIfAbsent(
    bucket,
    manifestObjectName,
    desired,
  );
  const manifest = parseSessionRecordingShareCloudManifest(
    storedManifest.value,
    job.jobId,
  );
  if (JSON.stringify(manifest.job) !== JSON.stringify(desired.job))
    throw new Error(
      "Existing Session recording share cloud manifest has a different immutable job binding.",
    );
  if (
    manifest.status !== "completed" &&
    manifest.status !== "failed-terminal"
  ) {
    const receipt: SessionRecordingShareCloudQueueReceipt = {
      kind: SESSION_RECORDING_SHARE_CLOUD_QUEUE_KIND,
      version: 1,
      jobId: job.jobId,
      manifestObjectName,
      manifestGeneration: storedManifest.generation,
      enqueuedAt: manifest.queuedAt,
    };
    const storedQueue = await saveIfAbsent(bucket, queueObjectName, receipt);
    const canonicalQueue = parseSessionRecordingShareCloudQueueReceipt(
      storedQueue.value,
    );
    if (canonicalQueue.manifestGeneration !== storedManifest.generation)
      throw new Error(
        "Session recording share queue points at a different immutable manifest generation.",
      );
  }
  const row = await input.prisma.studioWorkflowJob.findUnique({
    where: { id: job.jobId },
  });
  const currentInput = object(row?.inputJson);
  const previousControl = object(currentInput.processingControl);
  const control = {
    version: 1,
    provider: "gcs",
    bucketName: job.target.bucketName,
    manifestObjectName,
    manifestGeneration: storedManifest.generation,
    queueObjectName,
    resultObjectName,
    executionRequestedAt: text(previousControl.executionRequestedAt) || null,
    originalsRemainImmutable: true,
    outputPrivateUntilRelease: true,
  };
  await input.prisma.studioWorkflowJob.update({
    where: { id: job.jobId },
    data: {
      status:
        manifest.status === "failed-terminal"
          ? "failed"
          : manifest.status === "completed"
            ? "completed"
            : manifest.status,
      error: manifest.failure
        ? `${manifest.failure.code}: ${manifest.failure.message}`.slice(
            0,
            4_000,
          )
        : null,
      inputJson: { ...currentInput, processingControl: control },
      ...(manifest.status === "failed-terminal"
        ? { completedAt: new Date(manifest.failure!.failedAt) }
        : {}),
    },
  });
  if (["completed", "failed-terminal"].includes(manifest.status))
    return { manifest, executionRequested: false };
  if (!mediaProcessorEnabled())
    return { manifest, executionRequested: false, configurationRequired: true };
  if (mediaProcessorExecutionRequestIsRecent(control.executionRequestedAt))
    return { manifest, executionRequested: false };
  await requestMediaProcessorExecution();
  await input.prisma.studioWorkflowJob.update({
    where: { id: job.jobId },
    data: {
      inputJson: {
        ...currentInput,
        processingControl: {
          ...control,
          executionRequestedAt: new Date().toISOString(),
        },
      },
    },
  });
  return { manifest, executionRequested: true };
}

export async function reconcileSessionRecordingShareCloudJob(input: {
  prisma: any;
  workflowJob: any;
}) {
  const queued = await ensureSessionRecordingShareCloudQueued(input);
  const job = queued.manifest.job;
  if (queued.manifest.status === "failed-terminal")
    return input.prisma.studioWorkflowJob.findUnique({
      where: { id: job.jobId },
    });
  if (queued.manifest.status !== "completed")
    return input.prisma.studioWorkflowJob.findUnique({
      where: { id: job.jobId },
    });
  const bucket = getMediaBucket(job.target.bucketName);
  const result = assertSessionRecordingShareCloudResult(
    (
      await loadJson(
        bucket,
        buildSessionRecordingShareCloudResultObjectName(job.jobId),
      )
    ).value,
    job,
  );
  return input.prisma.studioWorkflowJob.update({
    where: { id: job.jobId },
    data: {
      status: "completed",
      resultJson: result,
      error: null,
      completedAt: new Date(result.completedAt),
    },
  });
}

async function saveIfAbsent(bucket: any, name: string, value: unknown) {
  try {
    await bucket
      .file(name)
      .save(JSON.stringify(value), {
        resumable: false,
        validation: "crc32c",
        contentType: "application/json; charset=utf-8",
        metadata: { cacheControl: "private, no-store" },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
  } catch (error) {
    if (
      ![409, 412].includes(
        Number((error as any)?.code ?? (error as any)?.status),
      )
    )
      throw error;
  }
  return loadJson(bucket, name);
}
async function loadJson(bucket: any, name: string) {
  const file = bucket.file(name);
  const [metadata] = await file.getMetadata();
  const generation = String(metadata.generation ?? "");
  if (!/^[1-9][0-9]*$/.test(generation))
    throw new Error(
      "Session recording share control object lacks an immutable generation.",
    );
  const [raw] = await bucket
    .file(name, { generation })
    .download({ validation: "crc32c" });
  return { value: JSON.parse(raw.toString("utf8")), generation };
}
function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
