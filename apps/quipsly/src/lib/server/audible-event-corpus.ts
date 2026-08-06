import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { parseAudibleEventDetectorReceipt } from "@/lib/audio/audible-event-analysis";
import {
  activeAudibleEventTruthReceipts,
  audibleEventCorpusBoundaries,
  canonicalClassificationIdentifier,
  evaluateAudibleEventTruth,
  type AudibleEventCorpusStatus,
  type AudibleEventTruthEvaluationInput,
  type AudibleEventTruthSplit,
  type AudibleEventTruthVerdict,
  type AudibleEventTruthWorkload,
  type PublicAudibleEventTruthReceipt,
} from "@/lib/audio/audible-event-corpus";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

import { audibleEventDetectorConfigurationHash, loadAudibleEventContext } from "./audible-event-review";

type Actor = { id: string; email: string };
type Coordinates = { prisma: any; projectSlug: string; assetId: string; sourceId: string };

export class AudibleEventCorpusError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}

export async function readAudibleEventCorpusStatus(input: Coordinates): Promise<AudibleEventCorpusStatus> {
  const context = await loadAudibleEventContext(input);
  if (!context.analysis) return emptyStatus();
  const configurationSha256 = audibleEventDetectorConfigurationHash(context.analysis);
  const rows = await input.prisma.studioAudibleEventTruthReceipt.findMany({
    where: { projectId: context.project.id },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    take: 25_000,
  });
  const parsed = evaluationRows(rows);
  const active = activeAudibleEventTruthReceipts(parsed);
  const sourceReceipts = active
    .filter((row) => row.sourceId === context.source.id)
    .map(publicTruthReceipt)
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
  const currentConfiguration = active.filter((row) => row.detectorConfigurationSha256 === configurationSha256);
  return {
    available: true,
    sourceReceipts,
    projectQualification: {
      detector: {
        algorithm: context.analysis.algorithm,
        classifierIdentifier: context.analysis.classifierIdentifier,
        configurationSha256,
      },
      activeReceiptCount: currentConfiguration.length,
      supersededReceiptCount: parsed.length - active.length,
      sourceCount: new Set(currentConfiguration.map((row) => row.sourceId)).size,
      metrics: evaluateAudibleEventTruth({ receipts: active, detectorConfigurationSha256: configurationSha256 }),
    },
    boundaries: audibleEventCorpusBoundaries(),
  };
}

export async function appendAudibleEventTruth(input: Coordinates & {
  actor: Actor;
  clientRequestId: string;
  supersedesReceiptId?: string | null;
  verdict: AudibleEventTruthVerdict;
  workload: AudibleEventTruthWorkload;
  split: AudibleEventTruthSplit;
  classificationIdentifier: string;
  displayLabel: string;
  family: string;
  reviewStartSeconds: number;
  reviewEndSeconds: number;
  eventStartSeconds?: number | null;
  eventEndSeconds?: number | null;
  playbackEvidence: unknown;
  note: string;
}) {
  const actorEmail = requiredEmail(input.actor.email);
  const clientRequestId = requiredId(input.clientRequestId, "clientRequestId");
  const supersedesReceiptId = optionalId(input.supersedesReceiptId, "supersedesReceiptId");
  const classificationIdentifier = canonicalClassificationIdentifier(input.classificationIdentifier);
  if (!/^[a-z0-9][a-z0-9._-]{1,159}$/.test(classificationIdentifier)) invalid("Use the detector's stable classification identifier.");
  const displayLabel = requiredText(input.displayLabel, "displayLabel", 120);
  const family = requiredText(input.family, "family", 80).toLowerCase();
  const note = requiredText(input.note, "note", 2_000);
  if (input.verdict !== "positive" && input.verdict !== "absent") invalid("A positive or absent ground-truth verdict is required.");
  if (input.workload !== "podcast" && input.workload !== "coaching") invalid("A podcast or coaching workload is required.");
  if (input.split !== "calibration" && input.split !== "validation" && input.split !== "retained-challenge") invalid("A supported corpus split is required.");
  const reviewStartSeconds = finite(input.reviewStartSeconds, "reviewStartSeconds");
  const reviewEndSeconds = finite(input.reviewEndSeconds, "reviewEndSeconds");
  const eventStartSeconds = input.verdict === "positive" ? finite(input.eventStartSeconds, "eventStartSeconds") : null;
  const eventEndSeconds = input.verdict === "positive" ? finite(input.eventEndSeconds, "eventEndSeconds") : null;
  const context = await loadAudibleEventContext(input);
  if (!context.analysis) throw new AudibleEventCorpusError("This source does not have a completed source-bound detector analysis.", 409, "AUDIBLE_EVENT_ANALYSIS_REQUIRED");
  const analysis = context.analysis;
  validateRanges({ reviewStartSeconds, reviewEndSeconds, eventStartSeconds, eventEndSeconds, verdict: input.verdict, durationSeconds: analysis.durationSeconds });
  const playbackEvidence = validatePlaybackEvidence(input.playbackEvidence, context.source.id, reviewStartSeconds, reviewEndSeconds);
  const configurationSha256 = audibleEventDetectorConfigurationHash(analysis);
  const receiptId = `audible_truth_${randomUUID().replaceAll("-", "")}`;
  const occurredAt = new Date();
  const evidence = {
    schema: "quipsly-audible-event-truth-receipt-v1",
    receiptId,
    occurredAt: occurredAt.toISOString(),
    verdict: input.verdict,
    workload: input.workload,
    split: input.split,
    classification: { identifier: classificationIdentifier, displayLabel, family },
    source: context.sourceBinding,
    detector: {
      analysisId: analysis.analysisId,
      algorithm: analysis.algorithm,
      classifierIdentifier: analysis.classifierIdentifier,
      configurationSha256,
    },
    reviewRange: { startSeconds: reviewStartSeconds, endSeconds: reviewEndSeconds },
    eventRange: input.verdict === "positive" ? { startSeconds: eventStartSeconds, endSeconds: eventEndSeconds } : null,
    playbackEvidence,
    note,
    supersedesReceiptId,
    boundaries: audibleEventCorpusBoundaries(),
  } as const;
  const requestSha256 = hashJson({
    schema: "quipsly-audible-event-truth-request-v1",
    projectId: context.project.id,
    assetId: context.asset.id,
    sourceId: context.source.id,
    actorUserId: input.actor.id,
    actorEmail,
    clientRequestId,
    evidence: { ...evidence, receiptId: null, occurredAt: null },
  });
  const existing = await input.prisma.studioAudibleEventTruthReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } } });
  if (existing) return replayOrConflict(existing, requestSha256, input);

  const stored = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `audible-event-truth:${context.project.id}:${context.source.id}:${classificationIdentifier}`);
    const replay = await tx.studioAudibleEventTruthReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } } });
    if (replay) return replayOrConflict(replay, requestSha256, input, false);
    const current = await loadAudibleEventContext({ ...input, prisma: tx });
    if (!current.analysis || current.analysis.analysisId !== analysis.analysisId || audibleEventDetectorConfigurationHash(current.analysis) !== configurationSha256 || current.sourceBinding.sha256 !== context.sourceBinding.sha256) {
      throw new AudibleEventCorpusError("The detector or immutable source changed while the corpus label was being saved. Refresh and listen again.", 409, "AUDIBLE_EVENT_TRUTH_SOURCE_DRIFT");
    }
    const rows = await tx.studioAudibleEventTruthReceipt.findMany({ where: { projectId: current.project.id, sourceId: current.source.id, classificationIdentifier }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }], take: 10_000 });
    const active = activeAudibleEventTruthReceipts(rows);
    validateSupersessionAndContradictions({ active, supersedesReceiptId, verdict: input.verdict, reviewStartSeconds, reviewEndSeconds, eventStartSeconds, eventEndSeconds });
    return tx.studioAudibleEventTruthReceipt.create({ data: {
      id: receiptId,
      projectId: current.project.id,
      assetId: current.asset.id,
      sourceId: current.source.id,
      actorUserId: input.actor.id,
      actorEmail,
      clientRequestId,
      supersedesReceiptId,
      verdict: input.verdict === "positive" ? "POSITIVE" : "ABSENT",
      workload: input.workload === "podcast" ? "PODCAST" : "COACHING",
      split: input.split === "calibration" ? "CALIBRATION" : input.split === "validation" ? "VALIDATION" : "RETAINED_CHALLENGE",
      classificationIdentifier,
      displayLabel,
      family,
      detectorAnalysisId: current.analysis.analysisId,
      detectorAlgorithm: current.analysis.algorithm,
      classifierIdentifier: current.analysis.classifierIdentifier,
      detectorConfigurationSha256: configurationSha256,
      sourceSha256: current.sourceBinding.sha256,
      sourceGeneration: current.sourceBinding.generation,
      sourceDurationSeconds: current.analysis.durationSeconds,
      reviewStartSeconds,
      reviewEndSeconds,
      eventStartSeconds,
      eventEndSeconds,
      requestSha256,
      analysisJson: json(current.analysis),
      evidenceJson: json(evidence),
      note,
      occurredAt,
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (stored?.ok === true && stored.idempotentReplay === true) return { ...stored, status: await readAudibleEventCorpusStatus(input) };
  return { ok: true, idempotentReplay: false, receipt: publicTruthReceipt(rowToEvaluation(stored)!), status: await readAudibleEventCorpusStatus(input) };
}

function evaluationRows(rows: any[]): AudibleEventTruthEvaluationInput[] {
  const parsed = rows.map(rowToEvaluation);
  if (parsed.some((row) => row === null)) throw new AudibleEventCorpusError("Stored audible-event corpus evidence failed source or contract verification.", 500, "AUDIBLE_EVENT_TRUTH_RECEIPT_INVALID");
  return parsed as AudibleEventTruthEvaluationInput[];
}
function rowToEvaluation(row: any): AudibleEventTruthEvaluationInput | null {
  const analysis = parseAudibleEventDetectorReceipt(row.analysisJson);
  const verdict = row.verdict === "POSITIVE" ? "positive" : row.verdict === "ABSENT" ? "absent" : null;
  const workload = row.workload === "PODCAST" ? "podcast" : row.workload === "COACHING" ? "coaching" : null;
  const split = row.split === "CALIBRATION" ? "calibration" : row.split === "VALIDATION" ? "validation" : row.split === "RETAINED_CHALLENGE" ? "retained-challenge" : null;
  const reviewStartSeconds = Number(row.reviewStartSeconds);
  const reviewEndSeconds = Number(row.reviewEndSeconds);
  const eventStartSeconds = row.eventStartSeconds == null ? null : Number(row.eventStartSeconds);
  const eventEndSeconds = row.eventEndSeconds == null ? null : Number(row.eventEndSeconds);
  const sourceDurationSeconds = Number(row.sourceDurationSeconds);
  const configurationSha256 = String(row.detectorConfigurationSha256);
  if (
    !analysis
    || analysis.status !== "completed"
    || !verdict
    || !workload
    || !split
    || analysis.analysisId !== String(row.detectorAnalysisId)
    || analysis.sourceSHA256 !== String(row.sourceSha256)
    || Math.abs(analysis.durationSeconds - sourceDurationSeconds) > 0.001
    || analysis.algorithm !== String(row.detectorAlgorithm)
    || analysis.classifierIdentifier !== String(row.classifierIdentifier)
    || audibleEventDetectorConfigurationHash(analysis) !== configurationSha256
    || !Number.isFinite(reviewStartSeconds)
    || !Number.isFinite(reviewEndSeconds)
    || reviewStartSeconds < 0
    || reviewEndSeconds <= reviewStartSeconds
    || reviewEndSeconds > sourceDurationSeconds + 0.001
    || (verdict === "positive" && (eventStartSeconds === null || eventEndSeconds === null || eventEndSeconds <= eventStartSeconds || eventStartSeconds < reviewStartSeconds || eventEndSeconds > reviewEndSeconds))
    || (verdict === "absent" && (eventStartSeconds !== null || eventEndSeconds !== null))
  ) return null;
  return {
    id: String(row.id),
    sourceId: String(row.sourceId),
    detectorAnalysisId: String(row.detectorAnalysisId),
    classificationIdentifier: String(row.classificationIdentifier),
    displayLabel: String(row.displayLabel),
    family: String(row.family),
    verdict,
    workload,
    split,
    reviewStartSeconds,
    reviewEndSeconds,
    eventStartSeconds,
    eventEndSeconds,
    supersedesReceiptId: row.supersedesReceiptId == null ? null : String(row.supersedesReceiptId),
    note: String(row.note),
    occurredAt: row.occurredAt?.toISOString?.() ?? String(row.occurredAt),
    sourceSha256: String(row.sourceSha256),
    sourceDurationSeconds,
    detectorConfigurationSha256: configurationSha256,
    analysis,
  };
}
function publicTruthReceipt(row: AudibleEventTruthEvaluationInput): PublicAudibleEventTruthReceipt {
  return { id: row.id, sourceId: row.sourceId, detectorAnalysisId: row.detectorAnalysisId, classificationIdentifier: row.classificationIdentifier, displayLabel: row.displayLabel, family: row.family, verdict: row.verdict, workload: row.workload, split: row.split, reviewStartSeconds: row.reviewStartSeconds, reviewEndSeconds: row.reviewEndSeconds, eventStartSeconds: row.eventStartSeconds, eventEndSeconds: row.eventEndSeconds, supersedesReceiptId: row.supersedesReceiptId, note: row.note, occurredAt: row.occurredAt };
}
function replayOrConflict(existing: any, requestSha256: string, input: Coordinates, includeStatus = true): any {
  if (existing.requestSha256 !== requestSha256) throw new AudibleEventCorpusError("That request id is already bound to different corpus evidence.", 409, "AUDIBLE_EVENT_TRUTH_IDEMPOTENCY_CONFLICT");
  const row = rowToEvaluation(existing);
  if (!row) throw new AudibleEventCorpusError("The stored corpus receipt cannot be verified.", 500, "AUDIBLE_EVENT_TRUTH_RECEIPT_INVALID");
  return includeStatus
    ? readAudibleEventCorpusStatus(input).then((status) => ({ ok: true, idempotentReplay: true, receipt: publicTruthReceipt(row), status }))
    : { ok: true, idempotentReplay: true, receipt: publicTruthReceipt(row) };
}
function validateRanges(input: { reviewStartSeconds: number; reviewEndSeconds: number; eventStartSeconds: number | null; eventEndSeconds: number | null; verdict: AudibleEventTruthVerdict; durationSeconds: number }) {
  const reviewDuration = input.reviewEndSeconds - input.reviewStartSeconds;
  if (reviewDuration < 1 || reviewDuration > 180 || input.reviewEndSeconds > input.durationSeconds + 0.001) invalid("The fully reviewed corpus window must be 1–180 seconds inside the immutable source.");
  if (input.verdict === "positive" && (input.eventStartSeconds === null || input.eventEndSeconds === null || input.eventEndSeconds <= input.eventStartSeconds || input.eventStartSeconds < input.reviewStartSeconds || input.eventEndSeconds > input.reviewEndSeconds)) invalid("A positive event range must be non-empty and entirely inside its reviewed window.");
}
function validatePlaybackEvidence(value: unknown, sourceId: string, startSeconds: number, endSeconds: number) {
  const evidence = object(value);
  const bins = Array.isArray(evidence.listenedSecondBins) ? [...new Set(evidence.listenedSecondBins.filter((entry): entry is number => Number.isSafeInteger(entry) && entry >= 0))].sort((left, right) => left - right) : [];
  const required = secondBins(startSeconds, endSeconds);
  if (text(evidence.protectedPlaybackSourceId) !== sourceId || Math.abs(Number(evidence.contextStartSeconds) - startSeconds) > 0.001 || Math.abs(Number(evidence.contextEndSeconds) - endSeconds) > 0.001 || evidence.clientTrackedPlaybackIsNotProofOfAudibility !== true || !required.every((bin) => bins.includes(bin))) {
    throw new AudibleEventCorpusError("Listen through the complete protected-source corpus window before labeling it.", 409, "AUDIBLE_EVENT_TRUTH_PLAYBACK_INCOMPLETE");
  }
  return { protectedPlaybackSourceId: sourceId, contextStartSeconds: startSeconds, contextEndSeconds: endSeconds, listenedSecondBins: required, clientTrackedPlaybackIsNotProofOfAudibility: true as const };
}
function validateSupersessionAndContradictions(input: { active: any[]; supersedesReceiptId: string | null; verdict: AudibleEventTruthVerdict; reviewStartSeconds: number; reviewEndSeconds: number; eventStartSeconds: number | null; eventEndSeconds: number | null }) {
  const previous = input.supersedesReceiptId ? input.active.find((row) => row.id === input.supersedesReceiptId) : null;
  if (input.supersedesReceiptId && !previous) throw new AudibleEventCorpusError("Only a current corpus receipt can be superseded.", 409, "AUDIBLE_EVENT_TRUTH_SUPERSESSION_STALE");
  const remaining = input.active.filter((row) => row.id !== input.supersedesReceiptId);
  const duplicate = input.verdict === "positive"
    ? remaining.some((row) => row.verdict === "POSITIVE" && overlaps(input.eventStartSeconds!, input.eventEndSeconds!, Number(row.eventStartSeconds), Number(row.eventEndSeconds)))
    : remaining.some((row) => row.verdict === "ABSENT" && overlaps(input.reviewStartSeconds, input.reviewEndSeconds, Number(row.reviewStartSeconds), Number(row.reviewEndSeconds)));
  if (duplicate) throw new AudibleEventCorpusError("An active label already covers this class and range. Correct it with a superseding receipt instead of double-counting evidence.", 409, "AUDIBLE_EVENT_TRUTH_DUPLICATE");
  const contradictory = input.verdict === "positive"
    ? remaining.some((row) => row.verdict === "ABSENT" && overlaps(input.eventStartSeconds!, input.eventEndSeconds!, Number(row.reviewStartSeconds), Number(row.reviewEndSeconds)))
    : remaining.some((row) => row.verdict === "POSITIVE" && overlaps(input.reviewStartSeconds, input.reviewEndSeconds, Number(row.eventStartSeconds), Number(row.eventEndSeconds)));
  if (contradictory) throw new AudibleEventCorpusError("This label contradicts active ground truth for the same class and source. Supersede the incorrect receipt instead.", 409, "AUDIBLE_EVENT_TRUTH_CONTRADICTION");
}
function emptyStatus(): AudibleEventCorpusStatus { return { available: false, sourceReceipts: [], projectQualification: { detector: null, activeReceiptCount: 0, supersededReceiptCount: 0, sourceCount: 0, metrics: [] }, boundaries: audibleEventCorpusBoundaries() }; }
function overlaps(startA: number, endA: number, startB: number, endB: number) { return Math.min(endA, endB) - Math.max(startA, startB) > 0; }
function secondBins(startSeconds: number, endSeconds: number) { const start = Math.floor(startSeconds); const end = Math.max(start, Math.ceil(endSeconds) - 1); return Array.from({ length: end - start + 1 }, (_, index) => start + index); }
function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function finite(value: unknown, field: string) { const result = Number(value); if (!Number.isFinite(result) || result < 0) invalid(`${field} must be a non-negative number.`); return result; }
function requiredText(value: unknown, field: string, maximum: number) { const result = text(value); if (result.length < 2 || result.length > maximum) invalid(`${field} must be between 2 and ${maximum} characters.`); return result; }
function requiredId(value: unknown, field: string) { const result = text(value); if (!/^[A-Za-z0-9._-]{8,180}$/.test(result)) invalid(`${field} is invalid.`); return result; }
function optionalId(value: unknown, field: string) { return value == null || text(value) === "" ? null : requiredId(value, field); }
function requiredEmail(value: unknown) { const result = text(value).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) invalid("Actor email is invalid."); return result; }
function invalid(message: string): never { throw new AudibleEventCorpusError(message, 400, "AUDIBLE_EVENT_TRUTH_REQUEST_INVALID"); }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)])); }
function hashJson(value: unknown) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
