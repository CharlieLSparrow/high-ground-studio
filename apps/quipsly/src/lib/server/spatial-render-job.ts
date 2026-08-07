import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import {
  newSpatialRenderJob,
  parseReviewedSpatialStitchMasterReceipt,
  parseSpatialRenderJob,
  parseSpatialRenderResult,
  spatialRecipeCanonicalJson,
  spatialRenderManifestCanonicalJson,
  type SpatialRenderJob,
  type SpatialRenderProfileId,
} from "@high-ground/quipsly-media-processing";
import { Prisma, type PrismaClient } from "@prisma/client";

import { episodeTimelineContentFingerprint, timelineStateFromEpisodeArtifact } from "@/app/(app)/episode-production/episodeArtifact";

const JOB_TYPE = "spatial-reframe";
const JOB_SOURCE = "source-story.spatial-reframe";

export class SpatialRenderQueueError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = "SpatialRenderQueueError";
  }
}

export async function queueSpatialReframe(input: {
  prisma: PrismaClient;
  projectId: string;
  timelinePlacementId: string;
  profile: SpatialRenderProfileId;
  requestedByUserId: string;
  requestedByEmail: string;
  clientRequestId: string;
  localMediaRoot: string;
}) {
  const existing = await input.prisma.studioWorkflowJob.findFirst({
    where: {
      type: JOB_TYPE,
      source: JOB_SOURCE,
      projectId: input.projectId,
      requestedByEmail: input.requestedByEmail.toLowerCase(),
      inputJson: { path: ["clientRequestId"], equals: input.clientRequestId },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (existing) {
    const manifest = parseSpatialRenderJob(existing.inputJson);
    if (manifest.timelinePlacementId !== input.timelinePlacementId || manifest.reframe.profile !== input.profile || manifest.requestedByUserId !== input.requestedByUserId) {
      throw new SpatialRenderQueueError("spatial-reframe-request-reuse-conflict", "That render request identity is already bound to different timeline evidence.");
    }
    return publicQueue(existing, manifest, true);
  }

  const placement = await input.prisma.studioStoryTimelinePlacement.findFirst({
    where: { id: input.timelinePlacementId, projectId: input.projectId },
    select: {
      id: true,
      projectId: true,
      episodeProductionId: true,
      sourceRangeId: true,
      status: true,
      clipId: true,
      sourceRange: {
        select: {
          selectorSha256: true,
          startSeconds: true,
          endSeconds: true,
          reframeRecipeJson: true,
          sourceSet: {
            select: {
              id: true,
              identitySha256: true,
              completeness: true,
              sourceClockRevisionId: true,
              sourceClockRevision: {
                select: {
                  derivatives: {
                    where: { kind: "spatial-stitch-master", status: "ready" },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { id: true, workflowJobId: true, locator: true, generation: true, contentSha256: true, sizeBytes: true, durationSeconds: true, widthPixels: true, heightPixels: true, framesPerSecond: true, verificationJson: true, provenanceJson: true, workflowJob: { select: { resultJson: true } } },
                  },
                },
              },
              members: {
                where: { requiredForRender: true },
                orderBy: [{ role: "asc" }, { ordinal: "asc" }],
                select: { role: true, sourceRevision: { select: { id: true, contentSha256: true, sizeBytes: true, sourceState: true, externalReference: { select: { fileName: true, mimeType: true, provider: true, providerLocatorJson: true } } } } },
              },
            },
          },
        },
      },
      episodeProduction: { select: { timelineJson: true } },
    },
  });
  if (!placement || placement.status !== "active") throw new SpatialRenderQueueError("spatial-reframe-placement-unavailable", "That active Episode placement no longer exists.", 404);
  const sourceSet = placement.sourceRange.sourceSet;
  if (!sourceSet || sourceSet.completeness !== "complete") throw new SpatialRenderQueueError("spatial-reframe-source-set-incomplete", "This select is not bound to a complete spatial camera package.");
  const master = sourceSet.sourceClockRevision.derivatives[0];
  if (!master || master.widthPixels !== 5760 || master.heightPixels !== 2880 || !master.durationSeconds) {
    throw new SpatialRenderQueueError("spatial-reframe-master-required", "Register a reviewed 5.7K Insta360 Studio master before rendering this spatial select.");
  }
  const masterReceipt = parseReviewedSpatialStitchMasterReceipt(record(master.workflowJob.resultJson).receipt);
  const verification = record(master.verificationJson);
  if (
    masterReceipt.sourceSetId !== sourceSet.id
    || masterReceipt.sourceSetIdentitySha256 !== sourceSet.identitySha256
    || masterReceipt.sourceClockRevisionId !== sourceSet.sourceClockRevisionId
    || masterReceipt.output.sha256 !== master.contentSha256
    || masterReceipt.output.generation !== master.generation
    || masterReceipt.receiptSha256 !== verification.receiptSha256
  ) throw new SpatialRenderQueueError("spatial-reframe-master-evidence-mismatch", "The registered stitch master no longer matches its source package receipt.");

  const recipe = parseRecipe(placement.sourceRange.reframeRecipeJson);
  const timeline = timelineStateFromEpisodeArtifact(placement.episodeProduction.timelineJson);
  if (!timeline.clips.some((clip) => clip.id === placement.clipId)) throw new SpatialRenderQueueError("spatial-reframe-placement-stale", "The promoted card is no longer present in the canonical Episode timeline.");
  const timelineFingerprintSha256 = digest(episodeTimelineContentFingerprint(timeline));
  const members = sourceSet.members.map(({ role, sourceRevision }) => {
    const reference = sourceRevision.externalReference;
    const locator = record(reference?.providerLocatorJson).localPath;
    if (!reference || reference.provider !== "local-file-vault" || typeof locator !== "string" || !sourceRevision.contentSha256 || sourceRevision.sizeBytes === null || !(sourceRevision.sourceState === "available" || sourceRevision.sourceState === "checksum-bound")) {
      throw new SpatialRenderQueueError("spatial-reframe-source-member-unavailable", "An exact INSV render member is unavailable or no longer checksum-bound.");
    }
    return { sourceRevisionId: sourceRevision.id, role: role as "primary-original" | "secondary-original", fileName: reference.fileName, provider: "local" as const, locator, generation: `sha256:${sourceRevision.contentSha256}`, sha256: sourceRevision.contentSha256, sizeBytes: Number(sourceRevision.sizeBytes), contentType: reference.mimeType || "video/mp4", requiredForRender: true as const };
  });
  const jobId = `spatialrender_${randomUUID()}`;
  const root = path.resolve(input.localMediaRoot);
  const raw: Omit<SpatialRenderJob, "kind" | "version" | "boundaries"> = {
    jobId,
    projectId: placement.projectId,
    episodeProductionId: placement.episodeProductionId,
    timelinePlacementId: placement.id,
    timelineFingerprintSha256,
    requestedByUserId: input.requestedByUserId,
    requestedByEmail: input.requestedByEmail.toLowerCase(),
    clientRequestId: input.clientRequestId,
    queuedAt: new Date().toISOString(),
    sourcePackage: { sourceSetId: sourceSet.id, sourceSetIdentitySha256: sourceSet.identitySha256, sourceClockRevisionId: sourceSet.sourceClockRevisionId, sourceContentSha256: sourceSet.identitySha256, members },
    selection: { sourceRangeId: placement.sourceRangeId, selectorSha256: placement.sourceRange.selectorSha256, startSeconds: placement.sourceRange.startSeconds, endSeconds: placement.sourceRange.endSeconds },
    recipe,
    recipeSha256: "0".repeat(64),
    stitch: {
      profile: "insta360-flowstate-equirectangular-master-v1",
      adapter: "insta360-studio-reviewed-export",
      minimumMajorVersion: 3,
      scope: "complete-source",
      stitchType: "ai-flow",
      outputProjection: "equirectangular",
      width: 5760,
      height: 2880,
      videoCodec: "h265",
      target: { provider: "local", locator: master.locator, contentType: "video/mp4" },
      reviewedMaster: { derivativeId: master.id, workflowJobId: master.workflowJobId, receiptSha256: masterReceipt.receiptSha256, adapterVersion: masterReceipt.review.applicationVersion, generation: master.generation, sha256: master.contentSha256, sizeBytes: Number(master.sizeBytes), durationSeconds: master.durationSeconds, fps: master.framesPerSecond ?? masterReceipt.output.fps, videoCodec: masterReceipt.output.videoCodec },
    },
    reframe: { adapter: "ffmpeg-v360", profile: input.profile, commandResolution: "output-frame", target: { provider: "local", locator: path.join(root, "spatial", "reframes", `${jobId}.mp4`), contentType: "video/mp4" } },
    manifestSha256: "0".repeat(64),
  };
  const recipeUnsealed = newSpatialRenderJob(raw);
  const recipeSealed = { ...raw, recipeSha256: digest(spatialRecipeCanonicalJson(recipeUnsealed)) };
  const unsealed = newSpatialRenderJob(recipeSealed);
  const manifest = newSpatialRenderJob({ ...recipeSealed, manifestSha256: digest(spatialRenderManifestCanonicalJson(unsealed)) });
  const created = await input.prisma.studioWorkflowJob.create({ data: { id: jobId, projectId: placement.projectId, type: JOB_TYPE, status: "queued", source: JOB_SOURCE, priority: 50, requestedByEmail: input.requestedByEmail.toLowerCase(), inputJson: manifest as unknown as Prisma.InputJsonValue } });
  return publicQueue(created, manifest, false);
}

export async function registerSpatialReframeResult(input: { prisma: PrismaClient; projectId: string; jobId: string; authorizedRoot: string }) {
  const row = await input.prisma.studioWorkflowJob.findFirst({ where: { id: input.jobId, projectId: input.projectId } });
  if (!row || row.type !== JOB_TYPE || row.source !== JOB_SOURCE) throw new SpatialRenderQueueError("spatial-reframe-job-not-found", "That spatial render job does not exist.", 404);
  const job = parseSpatialRenderJob(row.inputJson);
  if (row.status === "completed") {
    const derivative = await input.prisma.studioMediaDerivative.findUnique({ where: { workflowJobId: row.id } });
    if (!derivative) throw new SpatialRenderQueueError("spatial-reframe-registration-incomplete", "The completed spatial job is missing its derivative.");
    return publicRegistration(derivative, job, true);
  }
  if (row.status !== "output-ready") throw new SpatialRenderQueueError("spatial-reframe-output-not-ready", row.status === "failed" ? row.error || "The spatial render failed." : "The local spatial worker has not completed this render.");
  const receipt = parseSpatialRenderResult(record(row.resultJson).receipt, job);
  const outputPath = await authorizeResultPath(input.authorizedRoot, receipt.reframe.output.locator);
  const output = await inspectResult(outputPath);
  if (output.sha256 !== receipt.reframe.output.sha256 || output.sizeBytes !== receipt.reframe.output.sizeBytes || receipt.reframe.output.generation !== `sha256:${output.sha256}`) throw new SpatialRenderQueueError("spatial-reframe-output-byte-mismatch", "The spatial render output changed before registration.");

  return input.prisma.$transaction(async (transaction) => {
    const locked = await transaction.studioWorkflowJob.findUnique({ where: { id: row.id } });
    if (!locked) throw new SpatialRenderQueueError("spatial-reframe-job-not-found", "The spatial render job disappeared.", 404);
    const existing = await transaction.studioMediaDerivative.findUnique({ where: { workflowJobId: row.id } });
    if (locked.status === "completed" && existing) return publicRegistration(existing, job, true);
    if (locked.status !== "output-ready") throw new SpatialRenderQueueError("spatial-reframe-registration-race", "The spatial render changed before registration.");
    const derivative = await transaction.studioMediaDerivative.create({
      data: {
        id: `spatialreframe_${digest(`${job.jobId}:${receipt.reframe.output.sha256}`).slice(0, 40)}`,
        projectId: job.projectId,
        sourceRevisionId: job.sourcePackage.sourceClockRevisionId,
        workflowJobId: job.jobId,
        kind: receipt.reframe.output.variantKind,
        profile: job.reframe.profile,
        storageProvider: "local",
        locator: outputPath,
        generation: receipt.reframe.output.generation,
        contentSha256: receipt.reframe.output.sha256,
        sizeBytes: BigInt(receipt.reframe.output.sizeBytes),
        mimeType: "video/mp4",
        durationSeconds: receipt.reframe.output.durationSeconds,
        widthPixels: receipt.reframe.output.width,
        heightPixels: receipt.reframe.output.height,
        framesPerSecond: receipt.reframe.output.fps,
        status: "ready",
        verificationJson: receipt.reframe as unknown as Prisma.InputJsonValue,
        provenanceJson: { schema: receipt.kind, timelinePlacementId: job.timelinePlacementId, timelineFingerprintSha256: job.timelineFingerprintSha256, sourceRangeId: job.selection.sourceRangeId, selectorSha256: job.selection.selectorSha256, recipeSha256: job.recipeSha256, stitchMasterReceiptSha256: job.stitch.reviewedMaster?.receiptSha256 ?? null },
        createdByUserId: job.requestedByUserId,
      },
    });
    await transaction.studioWorkflowJob.update({ where: { id: row.id }, data: { status: "completed", completedAt: new Date(receipt.completedAt), resultJson: { state: "completed", receipt } as unknown as Prisma.InputJsonValue } });
    return publicRegistration(derivative, job, false);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function publicQueue(job: { id: string; status: string }, manifest: SpatialRenderJob, replayed: boolean) {
  return { replayed, job: { id: job.id, status: job.status, timelinePlacementId: manifest.timelinePlacementId, timelineFingerprintSha256: manifest.timelineFingerprintSha256, profile: manifest.reframe.profile, sourceRange: [manifest.selection.startSeconds, manifest.selection.endSeconds], stitchMasterReceiptSha256: manifest.stitch.reviewedMaster?.receiptSha256 ?? null } };
}
function publicRegistration(derivative: { id: string; kind: string; profile: string; contentSha256: string; sizeBytes: bigint; durationSeconds: number | null; widthPixels: number | null; heightPixels: number | null; framesPerSecond: number | null; createdAt: Date }, job: SpatialRenderJob, replayed: boolean) { return { replayed, derivative: { id: derivative.id, kind: derivative.kind, profile: derivative.profile, contentSha256: derivative.contentSha256, sizeBytes: derivative.sizeBytes.toString(), durationSeconds: derivative.durationSeconds, widthPixels: derivative.widthPixels, heightPixels: derivative.heightPixels, framesPerSecond: derivative.framesPerSecond, createdAt: derivative.createdAt.toISOString(), playbackUrl: `/api/media/derivatives/${encodeURIComponent(derivative.id)}` }, binding: { timelinePlacementId: job.timelinePlacementId, timelineFingerprintSha256: job.timelineFingerprintSha256, sourceRangeId: job.selection.sourceRangeId, recipeSha256: job.recipeSha256 } }; }
async function authorizeResultPath(configuredRoot: string, locator: string) { const root = await realpath(configuredRoot).catch(() => ""); const output = await realpath(locator).catch(() => ""); if (!root || !output || !inside(root, output) || path.extname(output).toLowerCase() !== ".mp4") throw new SpatialRenderQueueError("spatial-reframe-output-path-rejected", "The spatial result escaped its authorized local media vault."); return output; }
async function inspectResult(filePath: string) { const file = await stat(filePath); if (!file.isFile() || file.size <= 0) throw new SpatialRenderQueueError("spatial-reframe-output-unavailable", "The spatial render output is unavailable."); const hash = createHash("sha256"); for await (const chunk of createReadStream(filePath)) hash.update(chunk); return { sizeBytes: file.size, sha256: hash.digest("hex") }; }
function inside(root: string, candidate: string) { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
function parseRecipe(value: unknown): SpatialRenderJob["recipe"] { const row = record(value); const keyframes = Array.isArray(row.keyframes) ? row.keyframes : []; return { schema: "quipsly-360-reframe-v1", projection: "equirectangular", aspectRatio: row.aspectRatio as SpatialRenderJob["recipe"]["aspectRatio"], stabilization: row.stabilization as SpatialRenderJob["recipe"]["stabilization"], horizonLock: row.horizonLock as boolean, keyframes: keyframes as SpatialRenderJob["recipe"]["keyframes"] }; }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
