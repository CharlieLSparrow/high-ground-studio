#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, open, stat } from "node:fs/promises";
import path from "node:path";

import {
  INTERRUPTION_REPAIR_RESULT_KIND,
  buildInterruptionRepairManifestObjectName,
  buildInterruptionRepairTargetObjectName,
  newInterruptionRepairManifest,
  parseInterruptionRepairResult,
} from "../packages/quipsly-media-processing/src/interruption-repair.ts";
import { FfmpegInterruptionRepairEngine } from "../apps/quipsly-media-processor/src/interruption-repair-ffmpeg.ts";

if (process.env.QUIPSLY_LOCAL_INTERRUPTION_REPAIR_OPERATION !== "1") {
  throw new Error(
    "Set QUIPSLY_LOCAL_INTERRUPTION_REPAIR_OPERATION=1 to authorize local retained repair artifacts.",
  );
}
process.env.DATABASE_URL ||=
  "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
process.env.NODE_ENV ||= "development";

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const { promoteRepairedMobileCaptureDatabaseEvidence } =
  await import("../apps/quipsly/src/lib/server/mobile-capture-resumable-finalization.ts");
const prisma = getPrismaClient();
const requestedRecordingAssetId =
  process.env.QUIPSLY_LOCAL_INTERRUPTION_REPAIR_RECORDING_ASSET_ID?.trim() ||
  null;

try {
  const jobs = await prisma.studioWorkflowJob.findMany({
    where: {
      type: "capture-interruption-repair",
      source: "mobile-capture-finalization",
      status: { in: ["queued", "blocked"] },
    },
    orderBy: { createdAt: "desc" },
  });
  const job = jobs.find(
    (candidate) =>
      candidate.inputJson?.source?.storageBackend === "local-development" &&
      (!requestedRecordingAssetId ||
        candidate.inputJson?.recordingAssetId === requestedRecordingAssetId),
  );
  assert(job, "No queued local interruption repair job is available.");
  const input = job.inputJson;
  const source = input.source;
  const capture = input.capture;
  assert(
    capture && typeof capture === "object",
    "Local repair job predates the complete promotion binding; rerun recorder crash recovery first.",
  );
  const originalPath = path.resolve(source.localFilePath);
  const objectBoundary = `${path.sep}objects${path.sep}`;
  const boundaryIndex = originalPath.indexOf(objectBoundary);
  assert(
    boundaryIndex > 0,
    "Local repair source is outside the Capture vault object boundary.",
  );
  const objectsRoot = originalPath.slice(
    0,
    boundaryIndex + objectBoundary.length - 1,
  );
  const targetObjectName = buildInterruptionRepairTargetObjectName({
    projectSlug: input.projectSlug,
    recordingAssetId: input.recordingAssetId,
    jobId: job.id,
  });
  const repairedPath = path.resolve(objectsRoot, targetObjectName);
  const relative = path.relative(objectsRoot, repairedPath);
  assert(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    "Local repair target escaped the Capture vault.",
  );
  await mkdir(path.dirname(repairedPath), { recursive: true });
  const originalHashBefore = await hashFile(originalPath);
  assert(
    originalHashBefore.sizeBytes === source.sizeBytes,
    "Local repair source size changed before processing.",
  );
  assert(
    originalHashBefore.sha256 === source.sha256,
    "Local repair source SHA-256 changed before processing.",
  );

  const repaired = await new FfmpegInterruptionRepairEngine().repair(
    originalPath,
    repairedPath,
  );
  const completedAt = new Date().toISOString();
  const manifest = newInterruptionRepairManifest({
    jobId: job.id,
    projectId: input.projectId,
    projectSlug: input.projectSlug,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    captureId: input.captureId,
    captureGroupId: input.captureGroupId,
    source: {
      bucketName: source.bucketName,
      objectName: source.objectName,
      generation: source.generation,
      sizeBytes: source.sizeBytes,
      sha256: source.sha256,
      contentType: source.contentType,
      recordingAssetId: input.recordingAssetId,
      uploadSessionId: input.uploadSessionId,
    },
    target: {
      bucketName: source.bucketName,
      objectName: targetObjectName,
      contentType: source.contentType,
      profile: "lossless-container-remux-v1",
    },
    queuedAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  });
  const result = parseInterruptionRepairResult(
    {
      kind: INTERRUPTION_REPAIR_RESULT_KIND,
      version: 1,
      jobId: job.id,
      manifestObjectName: buildInterruptionRepairManifestObjectName(job.id),
      source: manifest.source,
      output: {
        ...manifest.target,
        generation: String(Date.now()),
        sizeBytes: repaired.sizeBytes,
        sha256: repaired.sha256,
        crc32c: "local-development-full-hash-verified",
        metadata: repaired.technical,
      },
      worker: {
        executionId: "local-retained-operation",
        buildId: "local-worktree",
        imageDigest: null,
        attempt: 1,
      },
      completedAt,
      originalRemainsSourceTruth: true,
    },
    manifest,
  );
  await promoteRepairedMobileCaptureDatabaseEvidence({
    prisma,
    workflow: job,
    result,
    repairedLocalFilePath: repairedPath,
  });

  const [completedJob, recording, receipt] = await Promise.all([
    prisma.studioWorkflowJob.findUnique({ where: { id: job.id } }),
    prisma.recordingAsset.findUnique({ where: { id: input.recordingAssetId } }),
    prisma.mobileCaptureFinalizationReceipt.findUnique({
      where: { uploadSessionId: input.uploadSessionId },
    }),
  ]);
  const originalHashAfter = await hashFile(originalPath);
  assert(
    completedJob?.status === "completed",
    "Repair workflow did not complete.",
  );
  assert(
    recording?.localManifestJson?.interruptionRepair?.status === "verified",
    "RecordingAsset repair did not become verified.",
  );
  assert(
    receipt?.sourceId && receipt?.mediaAssetId,
    "Repaired source was not promoted into Studio.",
  );
  assert(
    originalHashAfter.sha256 === originalHashBefore.sha256,
    "Repair mutated the immutable original.",
  );
  assert(
    originalHashAfter.sizeBytes === originalHashBefore.sizeBytes,
    "Repair changed the immutable original size.",
  );
  assert(
    (await stat(repairedPath)).size === repaired.sizeBytes,
    "Promoted repair derivative changed after verification.",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        localOnly: true,
        humanAcceptanceSatisfied: false,
        jobId: job.id,
        recordingAssetId: input.recordingAssetId,
        sourceId: receipt.sourceId,
        mediaAssetId: receipt.mediaAssetId,
        repairStatus: recording.localManifestJson.interruptionRepair.status,
        originalSha256: originalHashAfter.sha256,
        originalSizeBytes: originalHashAfter.sizeBytes,
        derivativeSha256: repaired.sha256,
        derivativeSizeBytes: repaired.sizeBytes,
        durationSeconds: repaired.technical.durationSeconds,
        packetPayloadReencoded: repaired.technical.packetPayloadReencoded,
        originalRemainsSourceTruth: true,
        secretsPrinted: false,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  const handle = await open(filePath, "r");
  let sizeBytes = 0;
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    while (true) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        buffer.length,
        sizeBytes,
      );
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      sizeBytes += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return { sha256: hash.digest("hex"), sizeBytes };
}
