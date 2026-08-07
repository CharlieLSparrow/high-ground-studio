import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import {
  parseReviewedSpatialStitchMasterReceipt,
  reviewedSpatialStitchMasterCanonicalJson,
  SPATIAL_STITCH_PROFILE,
  type ReviewedSpatialStitchMasterReceipt,
} from "@high-ground/quipsly-media-processing";
import { Prisma, type PrismaClient } from "@prisma/client";

const JOB_TYPE = "spatial-stitch-master";
const JOB_SOURCE = "source-story.reviewed-studio-export";
const SHA256 = /^[0-9a-f]{64}$/;

export class SpatialStitchMasterRegistrationError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "SpatialStitchMasterRegistrationError";
  }
}

export async function registerReviewedSpatialStitchMaster(input: {
  prisma: PrismaClient;
  receipt: unknown;
  authorizedRoot: string;
}) {
  const receipt = parseReviewedSpatialStitchMasterReceipt(input.receipt);
  const canonicalReceiptSha256 = createHash("sha256").update(reviewedSpatialStitchMasterCanonicalJson(receipt)).digest("hex");
  if (canonicalReceiptSha256 !== receipt.receiptSha256) {
    throw new SpatialStitchMasterRegistrationError("spatial-stitch-receipt-digest-mismatch", "The reviewed stitch receipt changed after it was sealed.");
  }
  const outputPath = await authorizeOutputPath(input.authorizedRoot, receipt.output.locator);
  const output = await inspectFile(outputPath);
  if (output.sha256 !== receipt.output.sha256 || output.sizeBytes !== receipt.output.sizeBytes || receipt.output.generation !== `sha256:${output.sha256}`) {
    throw new SpatialStitchMasterRegistrationError("spatial-stitch-output-byte-mismatch", "The reviewed stitch master no longer matches its exact output receipt.");
  }

  return input.prisma.$transaction(async (transaction) => {
    const existingJob = await transaction.studioWorkflowJob.findUnique({ where: { id: receipt.receiptId } });
    if (existingJob) {
      const prior = record(existingJob.resultJson).receipt;
      const parsed = parseReviewedSpatialStitchMasterReceipt(prior);
      if (parsed.receiptSha256 !== receipt.receiptSha256 || existingJob.type !== JOB_TYPE || existingJob.source !== JOB_SOURCE) {
        throw new SpatialStitchMasterRegistrationError("spatial-stitch-request-reuse-conflict", "That reviewed stitch receipt identity is already bound to different evidence.", 409);
      }
      const derivative = await transaction.studioMediaDerivative.findUnique({ where: { workflowJobId: existingJob.id } });
      if (!derivative) throw new SpatialStitchMasterRegistrationError("spatial-stitch-replay-incomplete", "The prior stitch receipt exists without its derivative.", 409);
      return publicRegistration(derivative, receipt, true);
    }

    const sourceSet = await transaction.studioMediaSourceSet.findFirst({
      where: { id: receipt.sourceSetId, projectId: receipt.projectId },
      select: {
        id: true,
        identitySha256: true,
        sourceClockRevisionId: true,
        completeness: true,
        members: {
          where: { requiredForRender: true },
          orderBy: [{ role: "asc" }, { ordinal: "asc" }],
          select: {
            role: true,
            sourceRevision: {
              select: {
                id: true,
                contentSha256: true,
                sizeBytes: true,
                sourceState: true,
                externalReference: { select: { fileName: true } },
                mediaAsset: { select: { filename: true } },
              },
            },
          },
        },
      },
    });
    if (!sourceSet || sourceSet.completeness !== "complete" || sourceSet.identitySha256 !== receipt.sourceSetIdentitySha256 || sourceSet.sourceClockRevisionId !== receipt.sourceClockRevisionId) {
      throw new SpatialStitchMasterRegistrationError("spatial-stitch-source-set-mismatch", "The reviewed master no longer resolves to the same complete camera package.", 409);
    }
    const currentMembers = sourceSet.members.map((member) => ({
      sourceRevisionId: member.sourceRevision.id,
      role: member.role,
      fileName: member.sourceRevision.externalReference?.fileName ?? member.sourceRevision.mediaAsset?.filename ?? "",
      sha256: member.sourceRevision.contentSha256 ?? "",
      sizeBytes: member.sourceRevision.sizeBytes === null ? null : Number(member.sourceRevision.sizeBytes),
      sourceState: member.sourceRevision.sourceState,
    })).sort(compareMembers);
    const reviewedMembers = receipt.exactMembers.map((member) => ({ ...member, sourceState: "available" })).sort(compareMembers);
    if (
      currentMembers.length !== reviewedMembers.length
      || currentMembers.some((member, index) => {
        const reviewed = reviewedMembers[index];
        return !reviewed
          || member.sourceRevisionId !== reviewed.sourceRevisionId
          || member.role !== reviewed.role
          || member.fileName !== reviewed.fileName
          || member.sha256 !== reviewed.sha256
          || member.sizeBytes !== reviewed.sizeBytes
          || !SHA256.test(member.sha256)
          || !(member.sourceState === "available" || member.sourceState === "checksum-bound");
      })
    ) {
      throw new SpatialStitchMasterRegistrationError("spatial-stitch-package-drift", "The exact INSV package changed after the reviewed master was exported.", 409);
    }
    const existingDerivative = await transaction.studioMediaDerivative.findFirst({
      where: { sourceRevisionId: receipt.sourceClockRevisionId, kind: "spatial-stitch-master", profile: SPATIAL_STITCH_PROFILE, generation: receipt.output.generation },
    });
    if (existingDerivative) {
      const priorReceiptSha256 = record(existingDerivative.verificationJson).receiptSha256;
      if (priorReceiptSha256 !== receipt.receiptSha256) {
        throw new SpatialStitchMasterRegistrationError("spatial-stitch-output-receipt-conflict", "Those master bytes are already bound to a different reviewed handoff receipt.", 409);
      }
      return publicRegistration(existingDerivative, receipt, true);
    }

    await transaction.studioWorkflowJob.create({
      data: {
        id: receipt.receiptId,
        projectId: receipt.projectId,
        type: JOB_TYPE,
        status: "completed",
        source: JOB_SOURCE,
        priority: 50,
        requestedByEmail: receipt.review.reviewedByEmail,
        completedAt: new Date(receipt.review.reviewedAt),
        inputJson: prismaJson({
          sourceSetId: receipt.sourceSetId,
          sourceSetIdentitySha256: receipt.sourceSetIdentitySha256,
          exactMembers: receipt.exactMembers,
          clientRequestId: receipt.clientRequestId,
        }),
        resultJson: prismaJson({ state: "completed", receipt }),
      },
    });
    const derivative = await transaction.studioMediaDerivative.create({
      data: {
        id: `spatialstitch_${createHash("sha256").update(`${receipt.sourceSetId}:${receipt.output.sha256}`).digest("hex").slice(0, 40)}`,
        projectId: receipt.projectId,
        sourceRevisionId: receipt.sourceClockRevisionId,
        workflowJobId: receipt.receiptId,
        kind: "spatial-stitch-master",
        profile: SPATIAL_STITCH_PROFILE,
        storageProvider: "local",
        locator: outputPath,
        generation: receipt.output.generation,
        contentSha256: receipt.output.sha256,
        sizeBytes: BigInt(receipt.output.sizeBytes),
        mimeType: receipt.output.contentType,
        durationSeconds: receipt.output.durationSeconds,
        widthPixels: receipt.output.width,
        heightPixels: receipt.output.height,
        framesPerSecond: receipt.output.fps,
        status: "ready",
        verificationJson: prismaJson({ completeDecode: true, projection: receipt.output.projection, receiptSha256: receipt.receiptSha256 }),
        provenanceJson: prismaJson({ schema: receipt.kind, receiptSha256: receipt.receiptSha256, review: receipt.review, boundaries: receipt.boundaries, sourceSetIdentitySha256: receipt.sourceSetIdentitySha256 }),
        createdByUserId: receipt.review.reviewedByUserId,
      },
    });
    return publicRegistration(derivative, receipt, false);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function publicRegistration(derivative: { id: string; contentSha256: string; sizeBytes: bigint; durationSeconds: number | null; widthPixels: number | null; heightPixels: number | null; framesPerSecond: number | null; createdAt: Date }, receipt: ReviewedSpatialStitchMasterReceipt, replayed: boolean) {
  return {
    replayed,
    derivative: {
      id: derivative.id,
      kind: "spatial-stitch-master" as const,
      profile: SPATIAL_STITCH_PROFILE,
      contentSha256: derivative.contentSha256,
      sizeBytes: derivative.sizeBytes.toString(),
      durationSeconds: derivative.durationSeconds,
      widthPixels: derivative.widthPixels,
      heightPixels: derivative.heightPixels,
      framesPerSecond: derivative.framesPerSecond,
      createdAt: derivative.createdAt.toISOString(),
      playbackUrl: `/api/media/derivatives/${encodeURIComponent(derivative.id)}`,
    },
    receipt: { id: receipt.receiptId, sha256: receipt.receiptSha256, reviewedAt: receipt.review.reviewedAt, applicationVersion: receipt.review.applicationVersion },
  };
}

async function authorizeOutputPath(configuredRoot: string, locator: string) {
  const root = await realpath(configuredRoot).catch(() => "");
  const candidate = await realpath(locator).catch(() => "");
  if (!root || !candidate || !inside(root, candidate) || path.extname(candidate).toLowerCase() !== ".mp4") {
    throw new SpatialStitchMasterRegistrationError("spatial-stitch-output-path-rejected", "The reviewed stitch master is outside the authorized local media vault.");
  }
  return candidate;
}

async function inspectFile(filePath: string) {
  const details = await stat(filePath);
  if (!details.isFile() || details.size <= 0 || details.size > Number.MAX_SAFE_INTEGER) throw new SpatialStitchMasterRegistrationError("spatial-stitch-output-unavailable", "The reviewed stitch master is missing or empty.");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return { sizeBytes: details.size, sha256: hash.digest("hex") };
}

function compareMembers(left: { role: string; sourceRevisionId: string }, right: { role: string; sourceRevisionId: string }) { return left.role.localeCompare(right.role) || left.sourceRevisionId.localeCompare(right.sourceRevisionId); }
function inside(root: string, candidate: string) { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function prismaJson(value: unknown) { return value as Prisma.InputJsonValue; }
