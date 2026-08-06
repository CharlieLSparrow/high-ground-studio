import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import {
  audibleEventDetectorReceiptMatchesSource,
  parseAudibleEventDetectorReceipt,
  type AudibleEventDetectorReceipt,
  type AudibleEventDetectorSuggestion,
} from "@/lib/audio/audible-event-analysis";
import type {
  AudibleEventPlaybackEvidence,
  AudibleEventReviewDecision,
  AudibleEventReviewStatus,
  PublicAudibleEventReview,
} from "@/lib/audio/audible-event-review";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

import { loadDialogueRepairContext } from "./dialogue-repair";

type Actor = { id: string; email: string };
type Coordinates = { prisma: any; projectSlug: string; assetId: string; sourceId: string };

export class AudibleEventReviewError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}

export async function readAudibleEventReviewStatus(input: Coordinates): Promise<AudibleEventReviewStatus> {
  const context = await loadAudibleEventContext(input);
  if (!context.analysis) return emptyStatus();
  const rows = await input.prisma.studioAudibleEventReviewReceipt.findMany({
    where: {
      projectId: context.project.id,
      assetId: context.asset.id,
      sourceId: context.source.id,
      analysisId: context.analysis.analysisId,
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: 5_000,
  });
  return statusFrom(context.analysis, rows);
}

export async function appendAudibleEventReview(input: Coordinates & {
  actor: Actor;
  analysisId: string;
  eventId: string;
  clientRequestId: string;
  decision: AudibleEventReviewDecision;
  playbackEvidence: unknown;
  note?: string | null;
}) {
  const analysisId = requiredId(input.analysisId, "analysisId");
  const eventId = requiredId(input.eventId, "eventId");
  const clientRequestId = requiredId(input.clientRequestId, "clientRequestId");
  const actorEmail = requiredEmail(input.actor.email);
  const note = optionalText(input.note, 2_000);
  if (input.decision !== "confirmed" && input.decision !== "false-positive" && input.decision !== "needs-comparison") {
    throw new AudibleEventReviewError("A supported listening decision is required.", 400, "AUDIBLE_EVENT_REVIEW_DECISION_INVALID");
  }
  if (input.decision !== "confirmed" && !note) {
    throw new AudibleEventReviewError("False-positive and needs-comparison decisions require a short listening note.", 409, "AUDIBLE_EVENT_REVIEW_NOTE_REQUIRED");
  }
  const context = await loadAudibleEventContext(input);
  const analysis = context.analysis;
  if (!analysis || analysis.analysisId !== analysisId) {
    throw new AudibleEventReviewError("That detector analysis is not the current source-bound receipt.", 409, "AUDIBLE_EVENT_ANALYSIS_STALE");
  }
  const suggestion = analysis.suggestions.find((candidate) => candidate.eventId === eventId);
  if (!suggestion) {
    throw new AudibleEventReviewError("That detector suggestion is not present in the immutable analysis receipt.", 404, "AUDIBLE_EVENT_SUGGESTION_NOT_FOUND");
  }
  const playbackEvidence = validatePlaybackEvidence(input.playbackEvidence, context.source.id, suggestion, analysis.durationSeconds);
  const occurredAt = new Date();
  const detectorConfigurationSha256 = detectorConfigurationHash(analysis);
  const receipt = {
    schema: "quipsly-audible-event-review-receipt-v1",
    receiptId: `audible_review_${randomUUID().replaceAll("-", "")}`,
    occurredAt: occurredAt.toISOString(),
    actorEmail,
    decision: input.decision,
    note,
    source: context.sourceBinding,
    detector: {
      analysisId: analysis.analysisId,
      eventId: suggestion.eventId,
      algorithm: analysis.algorithm,
      classifierIdentifier: analysis.classifierIdentifier,
      configurationSha256: detectorConfigurationSha256,
      analyzedAt: analysis.analyzedAt,
    },
    suggestion,
    playbackEvidence,
    boundaries: reviewBoundaries(),
  } as const;
  const request = {
    schema: "quipsly-audible-event-review-request-v1",
    projectId: context.project.id,
    assetId: context.asset.id,
    sourceId: context.source.id,
    actorUserId: input.actor.id,
    actorEmail,
    clientRequestId,
    receipt: {
      ...receipt,
      receiptId: null,
      occurredAt: null,
    },
  };
  const requestSha256 = hashJson(request);
  const existing = await input.prisma.studioAudibleEventReviewReceipt.findUnique({
    where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } },
  });
  if (existing) {
    if (existing.requestSha256 !== requestSha256) {
      throw new AudibleEventReviewError("That request id is already bound to different listening evidence.", 409, "AUDIBLE_EVENT_REVIEW_IDEMPOTENCY_CONFLICT");
    }
    return { ok: true, idempotentReplay: true, receipt: publicReview(existing), status: await readAudibleEventReviewStatus(input) };
  }
  const stored = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `audible-event-review:${analysis.analysisId}:${suggestion.eventId}:${actorEmail}`);
    const replay = await tx.studioAudibleEventReviewReceipt.findUnique({
      where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } },
    });
    if (replay) {
      if (replay.requestSha256 !== requestSha256) {
        throw new AudibleEventReviewError("That request id won a race with different listening evidence.", 409, "AUDIBLE_EVENT_REVIEW_IDEMPOTENCY_CONFLICT");
      }
      return replay;
    }
    return tx.studioAudibleEventReviewReceipt.create({ data: {
      id: receipt.receiptId,
      projectId: context.project.id,
      assetId: context.asset.id,
      sourceId: context.source.id,
      analysisId: analysis.analysisId,
      eventId: suggestion.eventId,
      actorUserId: input.actor.id,
      actorEmail,
      clientRequestId,
      decision: decisionToDatabase(input.decision),
      classificationIdentifier: suggestion.classificationIdentifier,
      displayLabel: suggestion.displayLabel,
      family: suggestion.family,
      detectorAlgorithm: analysis.algorithm,
      classifierIdentifier: analysis.classifierIdentifier,
      detectorConfigurationSha256,
      sourceSha256: context.sourceBinding.sha256,
      sourceGeneration: context.sourceBinding.generation,
      startSeconds: suggestion.startSeconds,
      endSeconds: suggestion.endSeconds,
      confidence: suggestion.confidence,
      requestSha256,
      evidenceJson: json(receipt),
      note,
      occurredAt,
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ok: true, idempotentReplay: false, receipt: publicReview(stored), status: await readAudibleEventReviewStatus(input) };
}

async function loadAudibleEventContext(input: Coordinates) {
  const context = await loadDialogueRepairContext(input);
  const productions = await input.prisma.studioEpisodeProduction.findMany({
    where: { projectId: context.project.id },
    select: { productionJson: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  const analysis = selectSourceBoundAnalysis({
    productions,
    assetId: context.asset.id,
    sourceId: context.source.id,
    sourceSha256: context.sourceBinding.sha256,
    sourceByteCount: context.sourceBinding.sizeBytes,
  });
  return { ...context, analysis };
}

export function selectSourceBoundAnalysis(input: {
  productions: Array<{ productionJson: unknown; updatedAt?: Date | string | null }>;
  assetId: string;
  sourceId: string;
  sourceSha256: string;
  sourceByteCount: number;
}): AudibleEventDetectorReceipt | null {
  const receipts: AudibleEventDetectorReceipt[] = [];
  for (const production of input.productions) {
    const productionJson = object(production.productionJson);
    const importedMedia = Array.isArray(productionJson.importedMedia) ? productionJson.importedMedia : [];
    for (const rawEntry of importedMedia) {
      const entry = object(rawEntry);
      if ((text(entry.id) || text(entry.assetId) || text(entry.mediaAssetId)) !== input.assetId) continue;
      if (text(entry.sourceId) !== input.sourceId) continue;
      for (const profile of reportedSourceProfiles(entry)) {
        const candidate = parseAudibleEventDetectorReceipt(profile.audibleEventAnalysis);
        if (candidate && candidate.status === "completed" && audibleEventDetectorReceiptMatchesSource(candidate, input.sourceSha256, input.sourceByteCount)) receipts.push(candidate);
      }
    }
  }
  return receipts.sort((left, right) => Date.parse(right.analyzedAt) - Date.parse(left.analyzedAt) || right.analysisId.localeCompare(left.analysisId))[0] ?? null;
}

function reportedSourceProfiles(entry: Record<string, unknown>) {
  const metadata = object(entry.metadata);
  const sync = object(entry.sync);
  const candidates = [
    object(object(metadata.recordingSync).reportedSourceProfile),
    object(object(sync.recordingSync).reportedSourceProfile),
    object(object(entry.recordingSync).reportedSourceProfile),
    object(entry.reportedSourceProfile),
  ];
  return candidates.filter((candidate) => Object.keys(candidate).length > 0);
}

function validatePlaybackEvidence(value: unknown, sourceId: string, suggestion: AudibleEventDetectorSuggestion, durationSeconds: number): AudibleEventPlaybackEvidence {
  const evidence = object(value);
  const contextStartSeconds = finite(evidence.contextStartSeconds);
  const contextEndSeconds = finite(evidence.contextEndSeconds);
  const expectedStart = Math.max(0, suggestion.startSeconds - 1);
  const expectedEnd = Math.min(durationSeconds, suggestion.endSeconds + 1);
  const listenedSecondBins = Array.isArray(evidence.listenedSecondBins)
    ? [...new Set(evidence.listenedSecondBins.filter((item): item is number => Number.isSafeInteger(item) && item >= 0))].sort((left, right) => left - right)
    : [];
  const requiredBins = secondBins(expectedStart, expectedEnd);
  if (
    text(evidence.protectedPlaybackSourceId) !== sourceId
    || contextStartSeconds === null
    || contextEndSeconds === null
    || Math.abs(contextStartSeconds - expectedStart) > 0.001
    || Math.abs(contextEndSeconds - expectedEnd) > 0.001
    || evidence.clientTrackedPlaybackIsNotProofOfAudibility !== true
    || !requiredBins.every((bin) => listenedSecondBins.includes(bin))
  ) {
    throw new AudibleEventReviewError("Listen through the complete bounded protected-source context before recording a decision.", 409, "AUDIBLE_EVENT_REVIEW_INCOMPLETE");
  }
  return {
    protectedPlaybackSourceId: sourceId,
    contextStartSeconds: expectedStart,
    contextEndSeconds: expectedEnd,
    listenedSecondBins: requiredBins,
    clientTrackedPlaybackIsNotProofOfAudibility: true,
  };
}

function statusFrom(analysis: AudibleEventDetectorReceipt, rows: any[]): AudibleEventReviewStatus {
  const byEvent = new Map<string, any[]>();
  for (const row of rows) {
    if (!byEvent.has(row.eventId)) byEvent.set(row.eventId, []);
    byEvent.get(row.eventId)?.push(row);
  }
  const entries = analysis.suggestions.map((suggestion) => {
    const reviews = byEvent.get(suggestion.eventId) ?? [];
    return {
      suggestion,
      latestReview: reviews[0] ? publicReview(reviews[0]) : null,
      reviewCounts: reviewCounts(reviews),
    };
  });
  const latestDecisions = entries.map((entry) => entry.latestReview?.decision ?? null);
  return {
    available: true,
    analysis,
    entries,
    summary: {
      suggestionCount: entries.length,
      reviewedSuggestionCount: latestDecisions.filter(Boolean).length,
      confirmedSuggestionCount: latestDecisions.filter((decision) => decision === "confirmed").length,
      falsePositiveSuggestionCount: latestDecisions.filter((decision) => decision === "false-positive").length,
      needsComparisonSuggestionCount: latestDecisions.filter((decision) => decision === "needs-comparison").length,
      pendingSuggestionCount: latestDecisions.filter((decision) => decision === null).length,
    },
    boundaries: reviewBoundaries(),
  };
}

function emptyStatus(): AudibleEventReviewStatus {
  return {
    available: false,
    analysis: null,
    entries: [],
    summary: { suggestionCount: 0, reviewedSuggestionCount: 0, confirmedSuggestionCount: 0, falsePositiveSuggestionCount: 0, needsComparisonSuggestionCount: 0, pendingSuggestionCount: 0 },
    boundaries: reviewBoundaries(),
  };
}

function reviewBoundaries(): AudibleEventReviewStatus["boundaries"] {
  return { detectorOutputIsListeningTriageOnly: true, humanStateComesFromAppendOnlyReceipts: true, reviewDoesNotAuthorizeRepairOrEdit: true, sourceIdentityIsReverifiedServerSide: true, surfacedSuggestionsAloneCannotMeasureRecall: true };
}
function reviewCounts(rows: any[]) { return { confirmed: rows.filter((row) => row.decision === "CONFIRMED").length, falsePositive: rows.filter((row) => row.decision === "FALSE_POSITIVE").length, needsComparison: rows.filter((row) => row.decision === "NEEDS_COMPARISON").length }; }
function publicReview(row: any): PublicAudibleEventReview { return { id: String(row.id), analysisId: String(row.analysisId), eventId: String(row.eventId), decision: databaseToDecision(row.decision), actorEmail: String(row.actorEmail), note: typeof row.note === "string" ? row.note : null, occurredAt: row.occurredAt?.toISOString?.() ?? String(row.occurredAt) }; }
function detectorConfigurationHash(analysis: AudibleEventDetectorReceipt) { return hashJson({ algorithm: analysis.algorithm, classifierIdentifier: analysis.classifierIdentifier, requestedWindowDurationSeconds: analysis.requestedWindowDurationSeconds, effectiveWindowDurationSeconds: analysis.effectiveWindowDurationSeconds, overlapFactor: analysis.overlapFactor, minimumCandidateConfidence: analysis.minimumCandidateConfidence, knownClassificationCount: analysis.knownClassificationCount, knownClassificationsSHA256: analysis.knownClassificationsSHA256 }); }
function decisionToDatabase(decision: AudibleEventReviewDecision) { return decision === "confirmed" ? "CONFIRMED" : decision === "false-positive" ? "FALSE_POSITIVE" : "NEEDS_COMPARISON"; }
function databaseToDecision(decision: unknown): AudibleEventReviewDecision { return decision === "CONFIRMED" ? "confirmed" : decision === "FALSE_POSITIVE" ? "false-positive" : "needs-comparison"; }
function secondBins(startSeconds: number, endSeconds: number) { const start = Math.floor(startSeconds); const end = Math.max(start, Math.ceil(endSeconds) - 1); return Array.from({ length: end - start + 1 }, (_, index) => start + index); }
function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function finite(value: unknown) { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : null; }
function optionalText(value: unknown, maximum: number) { const result = typeof value === "string" ? value.trim().slice(0, maximum) : ""; return result || null; }
function requiredId(value: unknown, field: string) { const result = text(value); if (!/^[A-Za-z0-9._-]{8,180}$/.test(result)) throw new AudibleEventReviewError(`${field} is invalid.`, 400, "AUDIBLE_EVENT_REVIEW_REQUEST_INVALID"); return result; }
function requiredEmail(value: unknown) { const result = text(value).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new AudibleEventReviewError("Actor email is invalid.", 400, "AUDIBLE_EVENT_REVIEW_REQUEST_INVALID"); return result; }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)])); }
function hashJson(value: unknown) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
