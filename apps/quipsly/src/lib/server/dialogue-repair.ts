import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Prisma } from "@prisma/client";
import {
  newDialogueRepairCandidate,
  newDialogueRepairAuditionReceipt,
  newDialogueRepairJob,
  newDialogueRepairProposal,
  newDialogueRepairReviewReceipt,
  buildDialogueRepairTargetLocator,
  buildDialogueRepairCloudManifestObjectName,
  buildDialogueRepairCloudResultObjectName,
  parseAudioMasteryJob,
  parseAudioMasteryResult,
  parseDialogueRepairCandidate,
  parseDialogueRepairCloudManifest,
  parseDialogueRepairJob,
  parseDialogueRepairResult,
  parseDialogueRepairReviewReceipt,
  type DialogueRepairCandidate,
  type DialogueRepairAuditionDecision,
  type DialogueRepairAuditionReceipt,
  type DialogueRepairLabel,
  type DialogueRepairReviewReceipt,
} from "@high-ground/quipsly-media-processing";

import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { getMediaBucket } from "@/lib/server/gcs";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { resolveAllowedLocalStudioMediaPath } from "@/lib/server/studio-media-location-security";

import { publicSignalDiagnosis } from "./audio-mastery";
import { ensureDialogueRepairCloudQueued } from "./dialogue-repair-cloud";

type Actor = { id: string; email: string };
type Coordinates = { prisma: any; projectSlug: string; assetId: string; sourceId: string };

export class DialogueRepairError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}

export type PublicDialogueRepairStatus = {
  available: boolean;
  sourceDurationSeconds: number | null;
  candidates: Array<{
    candidate: DialogueRepairCandidate;
    latestReview: null | {
      id: string;
      decision: DialogueRepairReviewReceipt["decision"];
      actorEmail: string;
      note: string | null;
      occurredAt: string;
    };
    reviewCounts: { confirmed: number; falsePositive: number; needsComparison: number };
    experiment: null | {
      jobId: string;
      status: "queued" | "processing" | "output-ready" | "completed" | "blocked" | "failed";
      authorizingReviewReceiptId: string;
      playbackUrl: string | null;
      error: string | null;
      verification: null | {
        sourceDurationSeconds: number;
        outputDurationSeconds: number;
        durationDeltaSeconds: number;
        sourceChannelCount: number;
        outputChannelCount: number;
        completeOutputDecode: true;
        passes: true;
      };
      derivative: null | {
        durationSeconds: number;
        measured: ReturnType<typeof publicMeasurement>;
        diagnosis: ReturnType<typeof publicSignalDiagnosis>;
      };
      latestAudition: null | {
        id: string;
        decision: DialogueRepairAuditionDecision;
        actorEmail: string;
        note: string | null;
        occurredAt: string;
      };
      auditionCounts: { repairPreferred: number; sourcePreferred: number; indistinguishable: number; needsWork: number };
    };
  }>;
  boundaries: {
    originalRemainsSourceTruth: true;
    candidateStateComesFromAppendOnlyReceipts: true;
    detectorSuggestionsRequireHumanListening: true;
    confirmedCandidateAuthorizesExperimentOnly: true;
  };
};

export async function readDialogueRepairStatus(input: Coordinates): Promise<PublicDialogueRepairStatus> {
  const context = await loadDialogueRepairContext(input);
  const [rows, jobRows] = await Promise.all([
    input.prisma.studioDialogueRepairCandidate.findMany({
      where: { projectId: context.project.id, assetId: context.asset.id, sourceId: context.source.id },
      include: {
        reviews: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }] },
        auditions: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }] },
      },
      orderBy: [{ startSeconds: "asc" }, { id: "asc" }],
      take: 200,
    }),
    input.prisma.studioAssetProcessingJob.findMany({
      where: { projectId: context.project.id, assetId: context.asset.id, type: "dialogue-repair" },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  const latestJobByCandidate = new Map<string, any>();
  for (const row of jobRows) {
    try {
      const job = parseDialogueRepairJob(row.inputJson, row.id);
      if (!latestJobByCandidate.has(job.proposal.candidate.candidateId)) latestJobByCandidate.set(job.proposal.candidate.candidateId, row);
    } catch {
      // Invalid rows never acquire candidate ownership.
    }
  }
  return {
    available: true,
    sourceDurationSeconds: context.masteryResult.sourceMeasurement.durationSeconds,
    candidates: rows.map((row: any) => publicCandidate(row, latestJobByCandidate.get(row.id) ?? null)),
    boundaries: boundaries(),
  };
}

export async function createDialogueRepairCandidate(input: Coordinates & {
  actor: Actor;
  clientRequestId: string;
  label: DialogueRepairLabel;
  startSeconds: number;
  endSeconds: number;
  auditionPreRollSeconds?: number;
  auditionPostRollSeconds?: number;
}) {
  const clientRequestId = requiredId(input.clientRequestId, "clientRequestId");
  const context = await loadDialogueRepairContext(input);
  const actorEmail = requiredEmail(input.actor.email);
  const range = {
    startSeconds: finite(input.startSeconds, "startSeconds"),
    endSeconds: finite(input.endSeconds, "endSeconds"),
    auditionPreRollSeconds: finite(input.auditionPreRollSeconds ?? 1.5, "auditionPreRollSeconds"),
    auditionPostRollSeconds: finite(input.auditionPostRollSeconds ?? 1.5, "auditionPostRollSeconds"),
    sourceDurationSeconds: context.masteryResult.sourceMeasurement.durationSeconds,
  };
  const contextStart = Math.max(0, range.startSeconds - range.auditionPreRollSeconds);
  const contextEnd = Math.min(range.sourceDurationSeconds, range.endSeconds + range.auditionPostRollSeconds);
  const transcript = await input.prisma.transcriptJob.findFirst({
    where: { studioProjectId: context.project.id, studioMediaAssetId: context.asset.id, status: "COMPLETED", sourceSha256: context.sourceBinding.sha256, sourceGeneration: context.sourceBinding.generation },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const words = transcript ? await input.prisma.transcriptWord.findMany({
    where: { transcriptJobId: transcript.id, startSeconds: { lt: contextEnd }, endSeconds: { gt: contextStart } },
    orderBy: [{ startSeconds: "asc" }, { providerWordIndex: "asc" }],
    take: 64,
  }) : [];
  const request = {
    schema: "quipsly-dialogue-repair-candidate-request-v1",
    projectId: context.project.id,
    assetId: context.asset.id,
    sourceId: context.source.id,
    actorUserId: input.actor.id,
    actorEmail,
    clientRequestId,
    label: input.label,
    source: context.sourceBinding,
    range,
    transcriptWords: words.map((word: any) => ({ id: word.id, startSeconds: word.startSeconds, endSeconds: word.endSeconds, text: word.punctuatedWord, speakerLabel: word.speakerLabel ?? null })),
  };
  const requestSha256 = hashJson(request);
  const existing = await input.prisma.studioDialogueRepairCandidate.findUnique({ where: { projectId_createdByEmail_clientRequestId: { projectId: context.project.id, createdByEmail: actorEmail, clientRequestId } }, include: { reviews: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }] } } });
  if (existing) {
    if (existing.requestSha256 !== requestSha256) throw new DialogueRepairError("That request id is already bound to a different dialogue event.", 409, "DIALOGUE_REPAIR_CANDIDATE_IDEMPOTENCY_CONFLICT");
    return { ok: true, idempotentReplay: true, ...publicCandidate(existing) };
  }
  const occurredAt = new Date();
  let candidate: DialogueRepairCandidate;
  try {
    candidate = newDialogueRepairCandidate({
      candidateId: `dialogue_candidate_${randomUUID().replaceAll("-", "")}`,
      createdAt: occurredAt.toISOString(),
      createdByEmail: actorEmail,
      label: input.label,
      source: context.sourceBinding,
      range,
      origin: { kind: "human-marked" },
      context: {
        speakerId: null,
        speakerLabel: singleSpeaker(words),
        transcriptWordAnchors: words.map((word: any) => ({ wordId: word.id, startSeconds: word.startSeconds, endSeconds: word.endSeconds, text: word.punctuatedWord, speakerId: null, speakerLabel: word.speakerLabel ?? null })),
      },
    });
  } catch (error) {
    throw new DialogueRepairError(error instanceof Error ? error.message : "Dialogue repair candidate is invalid.", 400, "DIALOGUE_REPAIR_CANDIDATE_INVALID");
  }
  const row = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `dialogue-candidate:${context.project.id}:${actorEmail}`);
    const replay = await tx.studioDialogueRepairCandidate.findUnique({ where: { projectId_createdByEmail_clientRequestId: { projectId: context.project.id, createdByEmail: actorEmail, clientRequestId } }, include: { reviews: true } });
    if (replay) {
      if (replay.requestSha256 !== requestSha256) throw new DialogueRepairError("That request id won a race with different dialogue evidence.", 409, "DIALOGUE_REPAIR_CANDIDATE_IDEMPOTENCY_CONFLICT");
      return replay;
    }
    return tx.studioDialogueRepairCandidate.create({
      data: {
        id: candidate.candidateId,
        projectId: context.project.id,
        assetId: context.asset.id,
        sourceId: context.source.id,
        createdByUserId: input.actor.id,
        createdByEmail: actorEmail,
        clientRequestId,
        label: candidate.label,
        sourceSha256: candidate.source.sha256,
        sourceGeneration: candidate.source.generation,
        startSeconds: candidate.range.startSeconds,
        endSeconds: candidate.range.endSeconds,
        requestSha256,
        candidateJson: json(candidate),
        occurredAt,
      },
      include: { reviews: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ok: true, idempotentReplay: false, ...publicCandidate(row) };
}

export async function appendDialogueRepairReview(input: Coordinates & {
  actor: Actor;
  candidateId: string;
  clientRequestId: string;
  decision: DialogueRepairReviewReceipt["decision"];
  playbackEvidence: unknown;
  note?: string | null;
}) {
  const candidateId = requiredId(input.candidateId, "candidateId");
  const clientRequestId = requiredId(input.clientRequestId, "clientRequestId");
  const actorEmail = requiredEmail(input.actor.email);
  const note = optionalText(input.note, 2_000);
  const context = await loadDialogueRepairContext(input);
  const candidateRow = await input.prisma.studioDialogueRepairCandidate.findFirst({ where: { id: candidateId, projectId: context.project.id, assetId: context.asset.id, sourceId: context.source.id } });
  if (!candidateRow) throw new DialogueRepairError("Dialogue repair candidate was not found for this exact source.", 404, "DIALOGUE_REPAIR_CANDIDATE_NOT_FOUND");
  const candidate = parseDialogueRepairCandidate(candidateRow.candidateJson);
  if (candidate.source.sha256 !== context.sourceBinding.sha256 || candidate.source.generation !== context.sourceBinding.generation) throw new DialogueRepairError("The dialogue candidate no longer matches the immutable source.", 409, "DIALOGUE_REPAIR_SOURCE_DRIFT");
  if (input.decision !== "confirmed" && !note) throw new DialogueRepairError("False-positive and needs-comparison decisions require a short note.", 409, "DIALOGUE_REPAIR_REVIEW_NOTE_REQUIRED");
  let receipt: DialogueRepairReviewReceipt;
  try {
    receipt = newDialogueRepairReviewReceipt({ receiptId: `dialogue_review_${randomUUID().replaceAll("-", "")}`, occurredAt: new Date().toISOString(), actorEmail, decision: input.decision, candidate, evidence: input.playbackEvidence as DialogueRepairReviewReceipt["evidence"], note });
  } catch (error) {
    throw new DialogueRepairError(error instanceof Error ? error.message : "Dialogue repair review evidence is invalid.", 400, "DIALOGUE_REPAIR_REVIEW_INVALID");
  }
  if (receipt.evidence.protectedPlaybackSourceId !== context.source.id) throw new DialogueRepairError("Playback evidence does not name this exact protected source.", 409, "DIALOGUE_REPAIR_PLAYBACK_SOURCE_MISMATCH");
  const receiptIntent = reviewIntent(receipt);
  const request = { schema: "quipsly-dialogue-repair-review-request-v1", projectId: context.project.id, assetId: context.asset.id, sourceId: context.source.id, actorUserId: input.actor.id, actorEmail, clientRequestId, receipt: receiptIntent };
  const requestSha256 = hashJson(request);
  const existing = await input.prisma.studioDialogueRepairReviewReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } } });
  if (existing) {
    if (existing.requestSha256 !== requestSha256) throw new DialogueRepairError("That request id is already bound to a different dialogue review.", 409, "DIALOGUE_REPAIR_REVIEW_IDEMPOTENCY_CONFLICT");
    return { ok: true, idempotentReplay: true, receipt: publicReview(existing), status: await readDialogueRepairStatus(input) };
  }
  const stored = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `dialogue-review:${candidate.candidateId}:${actorEmail}`);
    const replay = await tx.studioDialogueRepairReviewReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } } });
    if (replay) {
      if (replay.requestSha256 !== requestSha256) throw new DialogueRepairError("That request id won a race with different review evidence.", 409, "DIALOGUE_REPAIR_REVIEW_IDEMPOTENCY_CONFLICT");
      return replay;
    }
    return tx.studioDialogueRepairReviewReceipt.create({ data: {
      id: receipt.receiptId,
      projectId: context.project.id,
      assetId: context.asset.id,
      candidateId: candidate.candidateId,
      actorUserId: input.actor.id,
      actorEmail,
      clientRequestId,
      decision: decisionToDatabase(receipt.decision),
      sourceSha256: receipt.source.sha256,
      sourceGeneration: receipt.source.generation,
      requestSha256,
      evidenceJson: json(receipt),
      note,
      occurredAt: new Date(receipt.occurredAt),
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ok: true, idempotentReplay: false, receipt: publicReview(stored), status: await readDialogueRepairStatus(input) };
}

export async function queueDialogueRepairExperiment(input: Coordinates & {
  actor: Actor;
  candidateId: string;
}) {
  const candidateId = requiredId(input.candidateId, "candidateId");
  const actorEmail = requiredEmail(input.actor.email);
  const context = await loadDialogueRepairContext(input);
  const candidateRow = await input.prisma.studioDialogueRepairCandidate.findFirst({
    where: { id: candidateId, projectId: context.project.id, assetId: context.asset.id, sourceId: context.source.id },
    include: { reviews: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 1 } },
  });
  if (!candidateRow) throw new DialogueRepairError("Dialogue repair candidate was not found for this exact source.", 404, "DIALOGUE_REPAIR_CANDIDATE_NOT_FOUND");
  const candidate = parseDialogueRepairCandidate(candidateRow.candidateJson);
  const latestReviewRow = candidateRow.reviews[0];
  if (!latestReviewRow) throw new DialogueRepairError("Listen to and confirm the protected source context before rendering.", 409, "DIALOGUE_REPAIR_CONFIRMATION_REQUIRED");
  let reviewReceipt: DialogueRepairReviewReceipt;
  try {
    reviewReceipt = parseDialogueRepairReviewReceipt(latestReviewRow.evidenceJson, candidate);
  } catch (error) {
    throw new DialogueRepairError(error instanceof Error ? `The latest review receipt is invalid: ${error.message}` : "The latest review receipt is invalid.", 409, "DIALOGUE_REPAIR_REVIEW_INVALID");
  }
  if (reviewReceipt.decision !== "confirmed") throw new DialogueRepairError("The latest review does not confirm this event for treatment.", 409, "DIALOGUE_REPAIR_CONFIRMATION_REQUIRED");
  if (candidate.source.sha256 !== context.sourceBinding.sha256 || candidate.source.generation !== context.sourceBinding.generation) throw new DialogueRepairError("The confirmed candidate no longer matches the immutable source.", 409, "DIALOGUE_REPAIR_SOURCE_DRIFT");

  const queued = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `dialogue-repair-render:${candidate.candidateId}`);
    const existingRows = await tx.studioAssetProcessingJob.findMany({
      where: { projectId: context.project.id, assetId: context.asset.id, type: "dialogue-repair" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    for (const row of existingRows) {
      try {
        const existing = parseDialogueRepairJob(row.inputJson, row.id);
        if (
          existing.proposal.candidate.candidateId === candidate.candidateId
          && existing.proposal.authorizingReviewReceiptId === reviewReceipt.receiptId
          && existing.source.sha256 === context.sourceBinding.sha256
          && row.status !== "failed"
        ) return { idempotentReplay: true, row };
      } catch {
        // Malformed rows cannot own this confirmed source-bound request.
      }
    }
    const queuedAt = new Date().toISOString();
    const proposal = newDialogueRepairProposal({ proposalId: `dialogue_proposal_${randomUUID().replaceAll("-", "")}`, createdAt: queuedAt, candidate, reviewReceipt });
    const jobId = `dialogue_repair_${randomUUID().replaceAll("-", "")}`;
    const job = newDialogueRepairJob({
      jobId,
      projectId: context.project.id,
      requestedByEmail: actorEmail,
      queuedAt,
      source: context.sourceBinding,
      proposal,
      target: {
        provider: context.sourceBinding.provider,
        locator: buildDialogueRepairTargetLocator({ assetId: context.asset.id, sourceSha256: context.sourceBinding.sha256, candidateId: candidate.candidateId, range: candidate.range }),
        contentType: "audio/wav",
        codec: "pcm_s24le",
        sampleRateHz: 48_000,
        variantKind: "dialogue-repair-preview",
      },
    });
    const row = await tx.studioAssetProcessingJob.create({
      data: { id: job.jobId, projectId: context.project.id, assetId: context.asset.id, type: "dialogue-repair", status: "queued", requestedByEmail: actorEmail, inputJson: json(job) },
    });
    return { idempotentReplay: false, row };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (context.sourceBinding.provider === "gcs") {
    const cloud = await ensureDialogueRepairCloudQueued({ prisma: input.prisma, processingJob: queued.row });
    const refreshed = await input.prisma.studioAssetProcessingJob.findUnique({ where: { id: queued.row.id } });
    const row = refreshed ?? queued.row;
    const experiment = publicExperiment(row);
    return {
      ok: true,
      idempotentReplay: queued.idempotentReplay,
      experiment: cloud.status === "configuration-required"
        ? { ...experiment, status: "blocked" as const, error: "Cloud Dialogue Repair is retained, but media processing is not configured." }
        : experiment,
    };
  }
  return { ok: true, idempotentReplay: queued.idempotentReplay, experiment: publicExperiment(queued.row) };
}

export async function reconcileDialogueRepairExperiment(input: Coordinates & { candidateId: string; jobId: string }) {
  const candidateId = requiredId(input.candidateId, "candidateId");
  const jobId = requiredId(input.jobId, "jobId");
  const context = await loadDialogueRepairContext(input);
  const row = await input.prisma.studioAssetProcessingJob.findFirst({ where: { id: jobId, projectId: context.project.id, assetId: context.asset.id, type: "dialogue-repair" } });
  if (!row) throw new DialogueRepairError("Dialogue Repair experiment was not found.", 404, "DIALOGUE_REPAIR_JOB_NOT_FOUND");
  if (row.status !== "output-ready") return { ok: true, experiment: publicExperiment(row) };
  let job: ReturnType<typeof parseDialogueRepairJob>;
  let result: ReturnType<typeof parseDialogueRepairResult>;
  try {
    job = parseDialogueRepairJob(row.inputJson, row.id);
    if (job.source.provider === "gcs") {
      return reconcileCloudDialogueRepair(input, row, job, context, candidateId);
    }
    result = parseDialogueRepairResult(object(row.resultJson).receipt, job);
  } catch (error) {
    throw new DialogueRepairError(error instanceof Error ? `Dialogue Repair output evidence is invalid: ${error.message}` : "Dialogue Repair output evidence is invalid.", 409, "DIALOGUE_REPAIR_OUTPUT_INVALID");
  }
  if (job.proposal.candidate.candidateId !== candidateId) throw new DialogueRepairError("The experiment does not belong to this candidate.", 409, "DIALOGUE_REPAIR_JOB_CANDIDATE_MISMATCH");
  const current = await inspectImmutableStudioMediaSource(context.source.providerSourceId, context.asset.mimeType);
  if (current.sha256 !== job.source.sha256 || current.generation !== job.source.generation || current.sizeBytes !== job.source.sizeBytes) throw new DialogueRepairError("The immutable source changed before Dialogue Repair registration.", 409, "DIALOGUE_REPAIR_SOURCE_DRIFT");

  const root = path.resolve(process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT || path.join(tmpdir(), "quipsly-media-ingest"));
  const candidatePath = path.resolve(root, result.derivative.locator);
  const outputPath = await resolveAllowedLocalStudioMediaPath(candidatePath);
  if (!outputPath) throw new DialogueRepairError("Dialogue Repair output escaped the authorized local media root.", 409, "DIALOGUE_REPAIR_OUTPUT_PATH_INVALID");
  const outputStat = await stat(outputPath);
  const outputEvidence = await inspectImmutableStudioMediaSource(outputPath, "audio/wav");
  if (!outputStat.isFile() || outputEvidence.sha256 !== result.derivative.sha256 || outputEvidence.sizeBytes !== result.derivative.sizeBytes) throw new DialogueRepairError("Dialogue Repair output no longer matches its verified receipt.", 409, "DIALOGUE_REPAIR_OUTPUT_DRIFT");

  let derivedSource = await input.prisma.studioVideoSource.findFirst({ where: { providerSourceId: outputPath } });
  if (!derivedSource) derivedSource = await input.prisma.studioVideoSource.create({ data: { provider: "local-dialogue-repair-worker", providerSourceId: outputPath, url: "/api/ingest/media/pending", title: `${context.asset.filename} Dialogue Repair experiment` } });
  const playbackUrl = `/api/ingest/media/${derivedSource.id}`;
  if (derivedSource.url !== playbackUrl) await input.prisma.studioVideoSource.update({ where: { id: derivedSource.id }, data: { url: playbackUrl } });
  await input.prisma.studioAssetVariant.upsert({
    where: { assetId_kind_url: { assetId: context.asset.id, kind: "dialogue-repair-preview", url: playbackUrl } },
    create: { assetId: context.asset.id, kind: "dialogue-repair-preview", url: playbackUrl, mimeType: "audio/wav", duration: result.derivative.diagnosis.durationSeconds, sizeBytes: BigInt(result.derivative.sizeBytes), metadataJson: json(dialogueRegistration(result, derivedSource.id, outputPath)) },
    update: { duration: result.derivative.diagnosis.durationSeconds, sizeBytes: BigInt(result.derivative.sizeBytes), metadataJson: json(dialogueRegistration(result, derivedSource.id, outputPath)) },
  });
  const updated = await input.prisma.studioAssetProcessingJob.update({
    where: { id: row.id },
    data: { status: "completed", completedAt: new Date(result.completedAt), resultJson: json({ state: "completed", receipt: result, registration: { playbackUrl, sourceId: derivedSource.id, originalRemainsSourceTruth: true, outputIsUnpromotedExperiment: true } }) },
  });
  return { ok: true, experiment: publicExperiment(updated) };
}

async function reconcileCloudDialogueRepair(
  input: Coordinates & { candidateId: string; jobId: string },
  row: any,
  job: ReturnType<typeof parseDialogueRepairJob>,
  context: Awaited<ReturnType<typeof loadDialogueRepairContext>>,
  candidateId: string,
) {
  if (job.proposal.candidate.candidateId !== candidateId) {
    throw new DialogueRepairError("The experiment does not belong to this candidate.", 409, "DIALOGUE_REPAIR_JOB_CANDIDATE_MISMATCH");
  }
  const cloud = await ensureDialogueRepairCloudQueued({ prisma: input.prisma, processingJob: row });
  const refreshed = await input.prisma.studioAssetProcessingJob.findUnique({ where: { id: row.id } });
  const currentRow = refreshed ?? row;
  if (cloud.status === "configuration-required") {
    return { ok: true, experiment: { ...publicExperiment(currentRow), status: "blocked" as const, error: "Cloud Dialogue Repair is retained, but media processing is not configured." } };
  }
  if (cloud.status === "failed") return { ok: true, experiment: publicExperiment(currentRow) };
  const bucket = getMediaBucket(cloud.bucketName);
  const storedManifest = await loadGcsJsonIfPresent(bucket, buildDialogueRepairCloudManifestObjectName(job.jobId));
  if (!storedManifest) return { ok: true, experiment: publicExperiment(currentRow) };
  const manifest = parseDialogueRepairCloudManifest(storedManifest.value, job.jobId);
  if (manifest.status === "failed-terminal") {
    const failed = await input.prisma.studioAssetProcessingJob.update({
      where: { id: job.jobId },
      data: {
        status: "failed",
        error: `${manifest.failure?.code || "dialogue-repair-worker-failed"}: ${manifest.failure?.message || "Cloud Dialogue Repair failed terminal."}`.slice(0, 4_000),
        completedAt: new Date(manifest.failure?.failedAt || manifest.updatedAt),
      },
    });
    return { ok: true, experiment: publicExperiment(failed) };
  }
  if (manifest.status !== "completed") return { ok: true, experiment: publicExperiment(currentRow) };
  const storedResult = await loadGcsJsonIfPresent(bucket, buildDialogueRepairCloudResultObjectName(job.jobId));
  if (!storedResult) return { ok: true, experiment: publicExperiment(currentRow) };
  let result: ReturnType<typeof parseDialogueRepairResult>;
  try {
    result = parseDialogueRepairResult(storedResult.value, job);
  } catch (error) {
    throw new DialogueRepairError(error instanceof Error ? `Cloud Dialogue Repair output evidence is invalid: ${error.message}` : "Cloud Dialogue Repair output evidence is invalid.", 409, "DIALOGUE_REPAIR_OUTPUT_INVALID");
  }
  const currentSource = await inspectImmutableStudioMediaSource(context.source.providerSourceId, context.asset.mimeType);
  if (
    currentSource.provider !== "gcs"
    || currentSource.locator !== job.source.locator
    || currentSource.sha256 !== job.source.sha256
    || currentSource.generation !== job.source.generation
    || currentSource.sizeBytes !== job.source.sizeBytes
  ) throw new DialogueRepairError("The immutable cloud source changed before Dialogue Repair registration.", 409, "DIALOGUE_REPAIR_SOURCE_DRIFT");

  const outputLocation = exactGcsLocation(result.derivative.locator, result.derivative.generation);
  if (outputLocation.bucketName !== cloud.bucketName || outputLocation.objectName !== job.target.locator) {
    throw new DialogueRepairError("Cloud Dialogue Repair output escaped its deterministic target binding.", 409, "DIALOGUE_REPAIR_OUTPUT_PATH_INVALID");
  }
  await assertCloudDialogueRepairOutput(bucket, job, result);
  const providerSourceId = result.derivative.locator;
  let derivedSource = await input.prisma.studioVideoSource.findFirst({ where: { providerSourceId } });
  if (!derivedSource) {
    derivedSource = await input.prisma.studioVideoSource.create({
      data: { provider: "dialogue-repair-worker", providerSourceId, url: "/api/ingest/media/pending", title: `${context.asset.filename} Dialogue Repair experiment` },
    });
  }
  const playbackUrl = `/api/ingest/media/${derivedSource.id}`;
  if (derivedSource.url !== playbackUrl) await input.prisma.studioVideoSource.update({ where: { id: derivedSource.id }, data: { url: playbackUrl } });
  await input.prisma.studioAssetVariant.upsert({
    where: { assetId_kind_url: { assetId: context.asset.id, kind: "dialogue-repair-preview", url: playbackUrl } },
    create: { assetId: context.asset.id, kind: "dialogue-repair-preview", url: playbackUrl, mimeType: "audio/wav", duration: result.derivative.diagnosis.durationSeconds, sizeBytes: BigInt(result.derivative.sizeBytes), metadataJson: json(dialogueRegistration(result, derivedSource.id, providerSourceId)) },
    update: { duration: result.derivative.diagnosis.durationSeconds, sizeBytes: BigInt(result.derivative.sizeBytes), metadataJson: json(dialogueRegistration(result, derivedSource.id, providerSourceId)) },
  });
  const completed = await input.prisma.studioAssetProcessingJob.update({
    where: { id: job.jobId },
    data: {
      status: "completed",
      error: null,
      completedAt: new Date(result.completedAt),
      resultJson: json({
        state: "completed",
        receipt: result,
        registration: {
          playbackUrl,
          sourceId: derivedSource.id,
          providerSourceId,
          originalRemainsSourceTruth: true,
          outputIsUnpromotedExperiment: true,
          cloudManifestObjectName: cloud.manifestObjectName,
          cloudManifestGeneration: storedManifest.generation,
          cloudResultObjectName: cloud.resultObjectName,
          cloudResultGeneration: storedResult.generation,
        },
      }),
    },
  });
  return { ok: true, experiment: publicExperiment(completed) };
}

export async function appendDialogueRepairAudition(input: Coordinates & {
  actor: Actor;
  candidateId: string;
  jobId: string;
  clientRequestId: string;
  decision: DialogueRepairAuditionDecision;
  playbackEvidence: unknown;
  note?: string | null;
}) {
  const candidateId = requiredId(input.candidateId, "candidateId");
  const jobId = requiredId(input.jobId, "jobId");
  const clientRequestId = requiredId(input.clientRequestId, "clientRequestId");
  const actorEmail = requiredEmail(input.actor.email);
  const note = optionalText(input.note, 2_000);
  const context = await loadDialogueRepairContext(input);
  const [candidateRow, jobRow] = await Promise.all([
    input.prisma.studioDialogueRepairCandidate.findFirst({ where: { id: candidateId, projectId: context.project.id, assetId: context.asset.id, sourceId: context.source.id } }),
    input.prisma.studioAssetProcessingJob.findFirst({ where: { id: jobId, projectId: context.project.id, assetId: context.asset.id, type: "dialogue-repair", status: "completed" } }),
  ]);
  if (!candidateRow) throw new DialogueRepairError("Dialogue repair candidate was not found for this exact source.", 404, "DIALOGUE_REPAIR_CANDIDATE_NOT_FOUND");
  if (!jobRow) throw new DialogueRepairError("Only a completed Dialogue Repair experiment can receive a matched audition.", 409, "DIALOGUE_REPAIR_AUDITION_EXPERIMENT_REQUIRED");
  let candidate: DialogueRepairCandidate;
  let job: ReturnType<typeof parseDialogueRepairJob>;
  let result: ReturnType<typeof parseDialogueRepairResult>;
  try {
    candidate = parseDialogueRepairCandidate(candidateRow.candidateJson);
    job = parseDialogueRepairJob(jobRow.inputJson, jobRow.id);
    result = parseDialogueRepairResult(object(jobRow.resultJson).receipt, job);
  } catch (error) {
    throw new DialogueRepairError(error instanceof Error ? `The Dialogue Repair audition subject is invalid: ${error.message}` : "The Dialogue Repair audition subject is invalid.", 409, "DIALOGUE_REPAIR_AUDITION_SUBJECT_INVALID");
  }
  if (job.proposal.candidate.candidateId !== candidate.candidateId) throw new DialogueRepairError("The experiment does not belong to this dialogue candidate.", 409, "DIALOGUE_REPAIR_JOB_CANDIDATE_MISMATCH");

  const registration = object(object(jobRow.resultJson).registration);
  if (typeof registration.playbackUrl !== "string") throw new DialogueRepairError("The verified repair preview is not playable.", 409, "DIALOGUE_REPAIR_AUDITION_PREVIEW_UNAVAILABLE");
  if (result.derivative.provider === "gcs") {
    const output = exactGcsLocation(result.derivative.locator, result.derivative.generation);
    await assertCloudDialogueRepairOutput(getMediaBucket(output.bucketName), job, result);
  } else {
    const root = path.resolve(process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT || path.join(tmpdir(), "quipsly-media-ingest"));
    const previewPath = await resolveAllowedLocalStudioMediaPath(path.resolve(root, result.derivative.locator));
    if (!previewPath) throw new DialogueRepairError("The Dialogue Repair preview escaped the authorized media root.", 409, "DIALOGUE_REPAIR_OUTPUT_PATH_INVALID");
    const [previewStat, previewEvidence] = await Promise.all([stat(previewPath), inspectImmutableStudioMediaSource(previewPath, "audio/wav")]);
    if (!previewStat.isFile() || previewEvidence.sha256 !== result.derivative.sha256 || previewEvidence.sizeBytes !== result.derivative.sizeBytes) {
      throw new DialogueRepairError("The Dialogue Repair preview no longer matches its verified receipt.", 409, "DIALOGUE_REPAIR_OUTPUT_DRIFT");
    }
  }

  const occurredAt = new Date();
  let receipt: DialogueRepairAuditionReceipt;
  try {
    receipt = newDialogueRepairAuditionReceipt({
      receiptId: `dialogue_audition_${randomUUID().replaceAll("-", "")}`,
      occurredAt: occurredAt.toISOString(),
      actorEmail,
      decision: input.decision,
      candidate,
      job,
      result,
      evidence: input.playbackEvidence as DialogueRepairAuditionReceipt["evidence"],
      note,
    });
  } catch (error) {
    throw new DialogueRepairError(error instanceof Error ? error.message : "Dialogue Repair matched-audition evidence is invalid.", 400, "DIALOGUE_REPAIR_AUDITION_INVALID");
  }
  if (receipt.evidence.protectedPlaybackSourceId !== context.source.id || receipt.evidence.protectedPlaybackJobId !== job.jobId) {
    throw new DialogueRepairError("Matched-audition playback evidence does not name the exact source and repair job.", 409, "DIALOGUE_REPAIR_AUDITION_PLAYBACK_MISMATCH");
  }
  const intent = auditionIntent(receipt);
  const request = { schema: "quipsly-dialogue-repair-audition-request-v1", projectId: context.project.id, assetId: context.asset.id, actorUserId: input.actor.id, actorEmail, clientRequestId, receipt: intent };
  const requestSha256 = hashJson(request);
  const existing = await input.prisma.studioDialogueRepairAuditionReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } } });
  if (existing) {
    if (existing.requestSha256 !== requestSha256) throw new DialogueRepairError("That request id is already bound to a different matched audition.", 409, "DIALOGUE_REPAIR_AUDITION_IDEMPOTENCY_CONFLICT");
    return { ok: true, idempotentReplay: true, receipt: publicAudition(existing), status: await readDialogueRepairStatus(input) };
  }
  const stored = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `dialogue-audition:${job.jobId}:${actorEmail}`);
    const replay = await tx.studioDialogueRepairAuditionReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } } });
    if (replay) {
      if (replay.requestSha256 !== requestSha256) throw new DialogueRepairError("That request id won a race with different audition evidence.", 409, "DIALOGUE_REPAIR_AUDITION_IDEMPOTENCY_CONFLICT");
      return replay;
    }
    return tx.studioDialogueRepairAuditionReceipt.create({ data: {
      id: receipt.receiptId,
      projectId: context.project.id,
      assetId: context.asset.id,
      candidateId: candidate.candidateId,
      repairJobId: job.jobId,
      actorUserId: input.actor.id,
      actorEmail,
      clientRequestId,
      decision: auditionDecisionToDatabase(receipt.decision),
      sourceSha256: receipt.source.sha256,
      sourceGeneration: receipt.source.generation,
      previewSha256: receipt.experiment.previewSha256,
      previewGeneration: receipt.experiment.previewGeneration,
      requestSha256,
      evidenceJson: json(receipt),
      note,
      occurredAt,
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ok: true, idempotentReplay: false, receipt: publicAudition(stored), status: await readDialogueRepairStatus(input) };
}

export async function loadDialogueRepairContext(input: Coordinates) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true, slug: true } });
  if (!project) throw new DialogueRepairError("Nest not found for dialogue repair.", 404, "DIALOGUE_REPAIR_PROJECT_NOT_FOUND");
  const [asset, source, masteryRow] = await Promise.all([
    input.prisma.studioMediaAsset.findUnique({ where: { id: input.assetId }, include: { assetAttachments: { where: { projectId: project.id }, select: { metadataJson: true } } } }),
    input.prisma.studioVideoSource.findUnique({ where: { id: input.sourceId }, select: { id: true, url: true, providerSourceId: true } }),
    input.prisma.studioAssetProcessingJob.findFirst({ where: { projectId: project.id, assetId: input.assetId, type: "audio-mastery", status: "completed" }, orderBy: { createdAt: "desc" } }),
  ]);
  const attachmentNamesSource = asset?.assetAttachments.some((attachment: any) => object(attachment.metadataJson).sourceId === input.sourceId);
  if (!asset || asset.isProxy || asset.assetAttachments.length === 0 || !source?.providerSourceId || source.url !== `/api/ingest/media/${source.id}` || (asset.url !== source.url && !attachmentNamesSource) || (!String(asset.mimeType || "").startsWith("audio/") && !String(asset.mimeType || "").startsWith("video/"))) {
    throw new DialogueRepairError("Dialogue repair requires the exact original media source attached to this Nest.", 409, "DIALOGUE_REPAIR_SOURCE_MISMATCH");
  }
  if (!masteryRow) throw new DialogueRepairError("Complete source measurement before marking dialogue events.", 409, "DIALOGUE_REPAIR_MASTERY_REQUIRED");
  let masteryJob: ReturnType<typeof parseAudioMasteryJob>;
  let masteryResult: ReturnType<typeof parseAudioMasteryResult>;
  try {
    masteryJob = parseAudioMasteryJob(masteryRow.inputJson, masteryRow.id);
    masteryResult = parseAudioMasteryResult(object(masteryRow.resultJson).receipt, masteryJob);
  } catch (error) {
    throw new DialogueRepairError(error instanceof Error ? `The completed Audio Mastery evidence is invalid: ${error.message}` : "The completed Audio Mastery evidence is invalid.", 409, "DIALOGUE_REPAIR_MASTERY_INVALID");
  }
  const immutable = await inspectImmutableStudioMediaSource(source.providerSourceId, asset.mimeType);
  if (masteryJob.source.sha256 !== immutable.sha256 || masteryJob.source.generation !== immutable.generation || masteryJob.source.sizeBytes !== immutable.sizeBytes) throw new DialogueRepairError("The measured source bytes changed. Dialogue review is held.", 409, "DIALOGUE_REPAIR_SOURCE_DRIFT");
  return { project, asset, source: source as { id: string; url: string; providerSourceId: string }, masteryJob, masteryResult, sourceBinding: masteryJob.source };
}

function publicCandidate(row: any, jobRow: any = null) {
  const candidate = parseDialogueRepairCandidate(row.candidateJson);
  const reviews = Array.isArray(row.reviews) ? row.reviews : [];
  const latest = reviews[0] ?? null;
  return {
    candidate,
    latestReview: latest ? publicReview(latest) : null,
    reviewCounts: {
      confirmed: reviews.filter((review: any) => review.decision === "CONFIRMED").length,
      falsePositive: reviews.filter((review: any) => review.decision === "FALSE_POSITIVE").length,
      needsComparison: reviews.filter((review: any) => review.decision === "NEEDS_COMPARISON").length,
    },
    experiment: jobRow ? publicExperiment(jobRow, Array.isArray(row.auditions) ? row.auditions : []) : null,
  };
}

function publicExperiment(row: any, auditionRows: any[] = []): NonNullable<PublicDialogueRepairStatus["candidates"][number]["experiment"]> {
  let job: ReturnType<typeof parseDialogueRepairJob> | null = null;
  let result: ReturnType<typeof parseDialogueRepairResult> | null = null;
  try { job = parseDialogueRepairJob(row.inputJson, row.id); } catch { /* surfaced below */ }
  try { if (job && object(row.resultJson).receipt) result = parseDialogueRepairResult(object(row.resultJson).receipt, job); } catch { /* surfaced below */ }
  const declared = ["queued", "processing", "output-ready", "completed", "blocked", "failed"].includes(row.status) ? row.status as "queued" | "processing" | "output-ready" | "completed" | "blocked" | "failed" : "failed";
  const integrityFailure = !job || ((declared === "output-ready" || declared === "completed") && !result);
  const registration = object(object(row.resultJson).registration);
  const matchingAuditions = auditionRows.filter((audition) => audition.repairJobId === row.id);
  return {
    jobId: String(row.id),
    status: integrityFailure ? "failed" : declared,
    authorizingReviewReceiptId: job?.proposal.authorizingReviewReceiptId ?? "invalid-review-receipt",
    playbackUrl: typeof registration.playbackUrl === "string" ? registration.playbackUrl : null,
    error: integrityFailure ? "Dialogue Repair evidence failed integrity validation." : typeof row.error === "string" ? row.error : null,
    verification: result ? { ...result.verification, completeOutputDecode: true, passes: true } : null,
    derivative: result ? { durationSeconds: result.derivative.diagnosis.durationSeconds, measured: publicMeasurement(result.derivative.measurement), diagnosis: publicSignalDiagnosis(result.derivative.diagnosis) } : null,
    latestAudition: matchingAuditions[0] ? publicAudition(matchingAuditions[0]) : null,
    auditionCounts: {
      repairPreferred: matchingAuditions.filter((audition) => audition.decision === "REPAIR_PREFERRED").length,
      sourcePreferred: matchingAuditions.filter((audition) => audition.decision === "SOURCE_PREFERRED").length,
      indistinguishable: matchingAuditions.filter((audition) => audition.decision === "INDISTINGUISHABLE").length,
      needsWork: matchingAuditions.filter((audition) => audition.decision === "NEEDS_WORK").length,
    },
  };
}

function publicReview(row: any) {
  return { id: String(row.id), decision: databaseToDecision(row.decision), actorEmail: String(row.actorEmail), note: typeof row.note === "string" ? row.note : null, occurredAt: row.occurredAt?.toISOString?.() ?? String(row.occurredAt) };
}
function publicAudition(row: any) {
  return { id: String(row.id), decision: databaseToAuditionDecision(row.decision), actorEmail: String(row.actorEmail), note: typeof row.note === "string" ? row.note : null, occurredAt: row.occurredAt?.toISOString?.() ?? String(row.occurredAt) };
}
function publicMeasurement(value: ReturnType<typeof parseDialogueRepairResult>["derivative"]["measurement"]) {
  return { measuredAt: value.measuredAt, durationSeconds: value.durationSeconds, integratedLufs: value.integratedLufs, truePeakDbtp: value.truePeakDbtp, loudnessRangeLu: value.loudnessRangeLu, thresholdLufs: value.thresholdLufs, seriesResolutionMs: value.seriesResolutionMs, series: value.series };
}
function dialogueRegistration(result: ReturnType<typeof parseDialogueRepairResult>, sourceId: string, outputPath: string) {
  return { schema: "quipsly-dialogue-repair-registration-v1", sourceId, providerSourceId: outputPath, proposal: result.proposal, sourceMeasurement: result.sourceMeasurement, sourceDiagnosis: result.sourceDiagnosis, verification: result.verification, derivative: result.derivative, worker: result.worker, originalRemainsSourceTruth: true, outputIsUnpromotedExperiment: true, outputIsNotAMasteredDeliveryFile: true, matchedAuditionRequired: true, promotionRequiresSeparateApproval: true };
}
async function assertCloudDialogueRepairOutput(
  bucket: any,
  job: ReturnType<typeof parseDialogueRepairJob>,
  result: ReturnType<typeof parseDialogueRepairResult>,
) {
  const output = exactGcsLocation(result.derivative.locator, result.derivative.generation);
  if (output.objectName !== job.target.locator) throw new DialogueRepairError("Cloud Dialogue Repair output escaped its target binding.", 409, "DIALOGUE_REPAIR_OUTPUT_PATH_INVALID");
  const outputEvidence = await inspectImmutableStudioMediaSource(result.derivative.locator, "audio/wav");
  const [metadata] = await bucket.file(output.objectName, { generation: output.generation }).getMetadata();
  const custom = Object.fromEntries(Object.entries(metadata.metadata ?? {}).map(([key, value]) => [key, String(value)]));
  if (
    outputEvidence.provider !== "gcs"
    || outputEvidence.locator !== result.derivative.locator
    || outputEvidence.generation !== result.derivative.generation
    || outputEvidence.sha256 !== result.derivative.sha256
    || outputEvidence.sizeBytes !== result.derivative.sizeBytes
    || custom.quipslyKind !== "dialogue-repair-preview-v1"
    || custom.quipslyDialogueRepairJobId !== job.jobId
    || custom.quipslyCandidateId !== job.proposal.candidate.candidateId
    || custom.quipslyReviewReceiptId !== job.proposal.authorizingReviewReceiptId
    || custom.quipslySourceGeneration !== job.source.generation
    || custom.quipslySourceSha256 !== job.source.sha256
    || custom.quipslyOutputSha256 !== result.derivative.sha256
    || custom.quipslyOutputSizeBytes !== String(result.derivative.sizeBytes)
    || custom.quipslyOriginalRemainsSourceTruth !== "true"
    || custom.quipslyMatchedAuditionRequired !== "true"
    || custom.quipslyPromotionRequiresSeparateApproval !== "true"
  ) throw new DialogueRepairError("Cloud Dialogue Repair preview no longer matches its worker and object receipts.", 409, "DIALOGUE_REPAIR_OUTPUT_DRIFT");
}

async function loadGcsJsonIfPresent(bucket: any, objectName: string) {
  try {
    const [metadata] = await bucket.file(objectName).getMetadata();
    const generation = String(metadata.generation ?? "");
    if (!/^[1-9][0-9]*$/.test(generation)) throw new Error("Dialogue Repair cloud object lacks an immutable generation.");
    const [raw] = await bucket.file(objectName, { generation }).download({ validation: "crc32c" });
    return { value: JSON.parse(raw.toString("utf8")) as unknown, generation };
  } catch (error) {
    if (Number((error as { code?: unknown }).code) === 404) return null;
    throw error;
  }
}

function exactGcsLocation(locator: string, generation: string) {
  const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(media-vault\/.+)\?generation=([1-9][0-9]*)$/.exec(locator);
  if (!match || match[3] !== generation || match[2].split("/").some((part) => !part || part === "." || part === "..")) {
    throw new DialogueRepairError("Dialogue Repair output is not generation-bound to the media vault.", 409, "DIALOGUE_REPAIR_OUTPUT_PATH_INVALID");
  }
  return { bucketName: match[1], objectName: match[2], generation: match[3] };
}
function reviewIntent(receipt: DialogueRepairReviewReceipt) {
  return {
    kind: receipt.kind,
    version: receipt.version,
    candidateId: receipt.candidateId,
    source: receipt.source,
    candidateRange: receipt.candidateRange,
    actorEmail: receipt.actorEmail,
    decision: receipt.decision,
    evidence: receipt.evidence,
    note: receipt.note,
  };
}
function auditionIntent(receipt: DialogueRepairAuditionReceipt) {
  return {
    kind: receipt.kind,
    version: receipt.version,
    candidateId: receipt.candidateId,
    jobId: receipt.jobId,
    source: receipt.source,
    candidateRange: receipt.candidateRange,
    experiment: receipt.experiment,
    actorEmail: receipt.actorEmail,
    decision: receipt.decision,
    evidence: receipt.evidence,
    note: receipt.note,
  };
}
function decisionToDatabase(decision: DialogueRepairReviewReceipt["decision"]) { return decision === "confirmed" ? "CONFIRMED" : decision === "false-positive" ? "FALSE_POSITIVE" : "NEEDS_COMPARISON"; }
function databaseToDecision(decision: unknown): DialogueRepairReviewReceipt["decision"] { return decision === "CONFIRMED" ? "confirmed" : decision === "FALSE_POSITIVE" ? "false-positive" : "needs-comparison"; }
function auditionDecisionToDatabase(decision: DialogueRepairAuditionDecision) { return decision === "repair-preferred" ? "REPAIR_PREFERRED" : decision === "source-preferred" ? "SOURCE_PREFERRED" : decision === "indistinguishable" ? "INDISTINGUISHABLE" : "NEEDS_WORK"; }
function databaseToAuditionDecision(decision: unknown): DialogueRepairAuditionDecision { return decision === "REPAIR_PREFERRED" ? "repair-preferred" : decision === "SOURCE_PREFERRED" ? "source-preferred" : decision === "INDISTINGUISHABLE" ? "indistinguishable" : "needs-work"; }
function boundaries(): PublicDialogueRepairStatus["boundaries"] { return { originalRemainsSourceTruth: true, candidateStateComesFromAppendOnlyReceipts: true, detectorSuggestionsRequireHumanListening: true, confirmedCandidateAuthorizesExperimentOnly: true }; }
function singleSpeaker(words: any[]) { const labels = [...new Set(words.map((word) => typeof word.speakerLabel === "string" ? word.speakerLabel.trim() : "").filter(Boolean))]; return labels.length === 1 ? labels[0] : null; }
function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)])); }
function hashJson(value: unknown) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
function requiredId(value: unknown, field: string) { const result = typeof value === "string" ? value.trim() : ""; if (!/^[A-Za-z0-9_-]{8,160}$/.test(result)) throw new DialogueRepairError(`${field} is invalid.`, 400, "DIALOGUE_REPAIR_REQUEST_INVALID"); return result; }
function requiredEmail(value: unknown) { const result = typeof value === "string" ? value.trim().toLowerCase() : ""; if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new DialogueRepairError("Actor email is invalid.", 400, "DIALOGUE_REPAIR_REQUEST_INVALID"); return result; }
function finite(value: unknown, field: string) { const result = Number(value); if (!Number.isFinite(result) || result < 0) throw new DialogueRepairError(`${field} is invalid.`, 400, "DIALOGUE_REPAIR_REQUEST_INVALID"); return result; }
function optionalText(value: unknown, maximum: number) { const result = typeof value === "string" ? value.trim().slice(0, maximum) : ""; return result || null; }
