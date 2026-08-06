import "server-only";

import { createHash } from "node:crypto";

import { Prisma, StudioEpisodeAudioReviewDecision } from "@prisma/client";

import {
  episodeAudioReviewDecisionOptions,
  episodeAudioReviewDecisionRequiresNote,
  episodeAudioReviewPlaybackCoverage,
  episodeAudioReviewPlaybackReady,
  type EpisodeAudioReviewDecision,
  type EpisodeAudioReviewPlaybackEvidence,
} from "@/lib/episode-audio-review";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { loadEpisodeAudioActivityAnalysisContext } from "@/lib/server/episode-audio-activity-analysis";
import { projectEpisodeAudioTrackDecisions } from "@/lib/server/episode-audio-track-decisions";

type Actor = { id: string; email: string };
type JsonRecord = Record<string, unknown>;

export class EpisodeAudioActivityReviewError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

function text(value: unknown, maximum = Number.POSITIVE_INFINITY) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function object(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    const row = value as JsonRecord;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function close(left: number, right: number) {
  return Math.abs(left - right) <= 0.002;
}

function comparisonGeometry(input: { moment: JsonRecord; lanes: JsonRecord[]; programDurationSeconds: number }) {
  const eventStart = number(input.moment.startSeconds);
  const eventEnd = number(input.moment.endSeconds);
  if (eventStart === null || eventEnd === null || eventEnd <= eventStart) return null;
  const requestedAssetIds = Array.isArray(input.moment.assetIds) ? input.moment.assetIds.map((value) => text(value)).filter(Boolean) : [];
  const requested = new Set(requestedAssetIds);
  const candidates = input.lanes.filter((lane) => requestedAssetIds.length
    ? requested.has(text(lane.assetId))
    : text(lane.kind) === "dialogue" && text(lane.mixDisposition) === "include");
  const eligible = candidates.filter((lane) => number(lane.programOffsetSeconds) !== null && (number(lane.sourceDurationSeconds) ?? 0) > 0).sort((left, right) => {
    const leftClock = text(left.alignment) === "program-clock" ? 0 : 1;
    const rightClock = text(right.alignment) === "program-clock" ? 0 : 1;
    return leftClock - rightClock || (text(left.participantLabel) || text(left.title)).localeCompare(text(right.participantLabel) || text(right.title));
  }).slice(0, 4);
  if (!eligible.length || (["possible-participant-overlap", "same-participant-multidevice"].includes(text(input.moment.kind)) && eligible.length < 2)) return null;
  const requestedDuration = Math.min(12, Math.max(2, eventEnd - eventStart + 3));
  const center = (eventStart + eventEnd) / 2;
  const requestedStart = Math.max(0, center - requestedDuration / 2);
  const requestedEnd = Math.min(input.programDurationSeconds, requestedStart + requestedDuration);
  const startSeconds = Math.max(requestedStart, ...eligible.map((lane) => number(lane.programOffsetSeconds)!));
  const endSeconds = Math.min(requestedEnd, ...eligible.map((lane) => number(lane.programOffsetSeconds)! + number(lane.sourceDurationSeconds)!));
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds - startSeconds < 0.5) return null;
  return { lanes: eligible, startSeconds: Number(startSeconds.toFixed(3)), endSeconds: Number(endSeconds.toFixed(3)) };
}

const DATABASE_DECISION: Record<EpisodeAudioReviewDecision, StudioEpisodeAudioReviewDecision> = {
  "confirmed-overlap": StudioEpisodeAudioReviewDecision.CONFIRMED_OVERLAP,
  "intentional-overlap": StudioEpisodeAudioReviewDecision.INTENTIONAL_OVERLAP,
  "same-participant-redundancy": StudioEpisodeAudioReviewDecision.SAME_PARTICIPANT_REDUNDANCY,
  "mic-bleed": StudioEpisodeAudioReviewDecision.MIC_BLEED,
  "confirmed-dialogue-gap": StudioEpisodeAudioReviewDecision.CONFIRMED_DIALOGUE_GAP,
  "false-positive": StudioEpisodeAudioReviewDecision.FALSE_POSITIVE,
  "needs-comparison": StudioEpisodeAudioReviewDecision.NEEDS_COMPARISON,
};

const PUBLIC_DECISION = Object.fromEntries(Object.entries(DATABASE_DECISION).map(([key, value]) => [value, key])) as Record<StudioEpisodeAudioReviewDecision, EpisodeAudioReviewDecision>;

function activeDecisionIds(value: unknown) {
  const row = object(value);
  const decisions = object(row.decisions);
  const values = Array.isArray(row.activeDecisionReceiptIds)
    ? row.activeDecisionReceiptIds
    : Array.isArray(row.active)
      ? row.active
      : Array.isArray(decisions.active)
        ? decisions.active
        : [];
  return values.map((entry) => typeof entry === "string" ? text(entry) : text(object(entry).id)).filter(Boolean).sort();
}

function parsePlaybackEvidence(value: unknown): EpisodeAudioReviewPlaybackEvidence {
  const row = object(value);
  const coverage = object(row.coverage);
  const boundaries = object(row.boundaries);
  const sources = Array.isArray(row.sources) ? row.sources.map(object) : [];
  const solo = Array.isArray(coverage.soloMonitorBins) ? coverage.soloMonitorBins.map(object) : [];
  const parsed: EpisodeAudioReviewPlaybackEvidence = {
    schema: text(row.schema) as EpisodeAudioReviewPlaybackEvidence["schema"],
    analysisId: text(row.analysisId),
    eventId: text(row.eventId),
    programStartSeconds: number(row.programStartSeconds) ?? Number.NaN,
    programEndSeconds: number(row.programEndSeconds) ?? Number.NaN,
    sources: sources.map((source) => ({
      assetId: text(source.assetId),
      sourceId: text(source.sourceId),
      sourceStartSeconds: number(source.sourceStartSeconds) ?? Number.NaN,
      sourceEndSeconds: number(source.sourceEndSeconds) ?? Number.NaN,
    })),
    coverage: {
      binDurationSeconds: number(coverage.binDurationSeconds) as 0.25,
      totalBinCount: number(coverage.totalBinCount) ?? Number.NaN,
      allMonitorBins: Array.isArray(coverage.allMonitorBins) ? coverage.allMonitorBins.map(number).filter((entry): entry is number => entry !== null) : [],
      soloMonitorBins: solo.map((entry) => ({ assetId: text(entry.assetId), bins: Array.isArray(entry.bins) ? entry.bins.map(number).filter((bin): bin is number => bin !== null) : [] })),
    },
    completedAt: text(row.completedAt),
    boundaries: {
      clientObservedPlaybackOnly: (boundaries.clientObservedPlaybackOnly === true) as true,
      playbackIsNotClassification: (boundaries.playbackIsNotClassification === true) as true,
      sourceBytesUnchanged: (boundaries.sourceBytesUnchanged === true) as true,
      timelineAndMixUnchanged: (boundaries.timelineAndMixUnchanged === true) as true,
    },
  };
  if (
    parsed.schema !== "quipsly-episode-audio-review-playback-v1"
    || !parsed.analysisId
    || !parsed.eventId
    || !Number.isFinite(parsed.programStartSeconds)
    || !Number.isFinite(parsed.programEndSeconds)
    || parsed.programEndSeconds <= parsed.programStartSeconds
    || parsed.coverage.binDurationSeconds !== 0.25
    || !Number.isInteger(parsed.coverage.totalBinCount)
    || parsed.coverage.totalBinCount < 1
    || parsed.sources.length < 1
    || parsed.sources.some((source) => !source.assetId || !source.sourceId || !Number.isFinite(source.sourceStartSeconds) || !Number.isFinite(source.sourceEndSeconds))
    || !parsed.completedAt
    || !Object.values(parsed.boundaries).every(Boolean)
  ) throw new EpisodeAudioActivityReviewError("Playback evidence is incomplete or malformed.", 400, "EPISODE_AUDIO_REVIEW_PLAYBACK_INVALID");
  const completedAt = Date.parse(parsed.completedAt);
  if (!Number.isFinite(completedAt) || completedAt > Date.now() + 60_000) throw new EpisodeAudioActivityReviewError("Playback completion time is invalid.", 400, "EPISODE_AUDIO_REVIEW_PLAYBACK_INVALID");
  const bins = [parsed.coverage.allMonitorBins, ...parsed.coverage.soloMonitorBins.map((entry) => entry.bins)];
  if (bins.some((values) => values.some((bin) => !Number.isInteger(bin) || bin < 0 || bin >= parsed.coverage.totalBinCount) || new Set(values).size !== values.length)) throw new EpisodeAudioActivityReviewError("Playback coverage bins are invalid.", 400, "EPISODE_AUDIO_REVIEW_PLAYBACK_INVALID");
  return parsed;
}

function publicReview(row: any) {
  return {
    id: String(row.id),
    analysisId: String(row.analysisId),
    eventId: String(row.eventId),
    eventKind: String(row.eventKind),
    decision: PUBLIC_DECISION[row.decision as StudioEpisodeAudioReviewDecision],
    startSeconds: Number(row.startSeconds),
    endSeconds: Number(row.endSeconds),
    involvedAssetIds: Array.isArray(row.involvedAssetIdsJson) ? row.involvedAssetIdsJson.map((value: unknown) => text(value)).filter(Boolean) : [],
    note: row.note ? String(row.note) : null,
    actorEmail: String(row.actorEmail),
    occurredAt: row.occurredAt?.toISOString?.() ?? String(row.occurredAt),
    playbackCoverage: episodeAudioReviewPlaybackCoverage(row.playbackEvidenceJson as EpisodeAudioReviewPlaybackEvidence),
    boundaries: { immutableReceipt: true as const, mediaTimelineAndMixUnchanged: true as const },
  };
}

export async function registerEpisodeAudioActivityReview(input: {
  prisma: any;
  actor: Actor;
  projectSlug: string;
  episodeProductionId: string;
  analysisId: string;
  eventId: string;
  decision: EpisodeAudioReviewDecision;
  note?: string | null;
  playbackEvidence: unknown;
  clientRequestId: string;
}) {
  const actorUserId = text(input.actor.id, 240);
  const actorEmail = text(input.actor.email, 320).toLowerCase();
  const analysisId = text(input.analysisId, 240);
  const eventId = text(input.eventId, 240);
  const clientRequestId = text(input.clientRequestId, 160);
  const note = text(input.note, 2_000) || null;
  if (!actorUserId || !actorEmail) throw new EpisodeAudioActivityReviewError("A signed-in actor is required.", 401, "EPISODE_AUDIO_REVIEW_ACTOR_REQUIRED");
  if (!analysisId || !eventId || !clientRequestId || !DATABASE_DECISION[input.decision]) throw new EpisodeAudioActivityReviewError("Analysis, event, decision, and stable request identity are required.", 400, "EPISODE_AUDIO_REVIEW_REQUEST_INVALID");
  if (episodeAudioReviewDecisionRequiresNote(input.decision) && (!note || note.length < 3)) throw new EpisodeAudioActivityReviewError("This listening conclusion requires a short evidence note.", 400, "EPISODE_AUDIO_REVIEW_NOTE_REQUIRED");
  const evidence = parsePlaybackEvidence(input.playbackEvidence);
  if (evidence.analysisId !== analysisId || evidence.eventId !== eventId) throw new EpisodeAudioActivityReviewError("Playback evidence belongs to another analysis or event.", 409, "EPISODE_AUDIO_REVIEW_EVIDENCE_MISMATCH");

  const context = await loadEpisodeAudioActivityAnalysisContext(input);
  const analysis = await input.prisma.studioEpisodeAudioAnalysisReceipt.findFirst({ where: { id: analysisId, episodeProductionId: context.episode.id, projectId: context.project.id } });
  if (!analysis) throw new EpisodeAudioActivityReviewError("The immutable Episode audio analysis was not found.", 404, "EPISODE_AUDIO_REVIEW_ANALYSIS_NOT_FOUND");
  const currentInputSha256 = sha256(context.analysisInput);
  if (analysis.programFingerprintSha256 !== context.programFingerprintSha256 || analysis.inputSha256 !== currentInputSha256 || stableJson(activeDecisionIds(analysis.inputJson)) !== stableJson(context.program.activeDecisions.map((decision: { id: string }) => decision.id).sort())) throw new EpisodeAudioActivityReviewError("The Episode or its canonical audio decisions changed after this analysis. Re-analyze before reviewing.", 409, "EPISODE_AUDIO_REVIEW_ANALYSIS_STALE");
  const completedAt = Date.parse(evidence.completedAt);
  const analyzedAt = analysis.analyzedAt instanceof Date ? analysis.analyzedAt.getTime() : Date.parse(String(analysis.analyzedAt));
  if (Number.isFinite(analyzedAt) && completedAt < analyzedAt - 1_000) throw new EpisodeAudioActivityReviewError("Playback coverage predates this immutable analysis.", 409, "EPISODE_AUDIO_REVIEW_PLAYBACK_PREDATES_ANALYSIS");

  const snapshot = object(analysis.analysisJson);
  const moments = Array.isArray(snapshot.moments) ? snapshot.moments.map(object) : [];
  const lanes = Array.isArray(snapshot.lanes) ? snapshot.lanes.map(object) : [];
  const moment = moments.find((candidate) => text(candidate.id) === eventId);
  if (!moment) throw new EpisodeAudioActivityReviewError("The selected event is absent from the immutable analysis.", 404, "EPISODE_AUDIO_REVIEW_EVENT_NOT_FOUND");
  const eventKind = text(moment.kind);
  const eventStart = number(moment.startSeconds);
  const eventEnd = number(moment.endSeconds);
  const programDurationSeconds = number(snapshot.programDurationSeconds);
  const geometry = programDurationSeconds === null ? null : comparisonGeometry({ moment, lanes, programDurationSeconds });
  if (eventStart === null || eventEnd === null || !geometry || !close(evidence.programStartSeconds, geometry.startSeconds) || !close(evidence.programEndSeconds, geometry.endSeconds)) throw new EpisodeAudioActivityReviewError("Playback evidence does not match the deterministic comparison window around this analyzed event.", 409, "EPISODE_AUDIO_REVIEW_EVENT_MISMATCH");
  const allowedDecisions = episodeAudioReviewDecisionOptions(eventKind as Parameters<typeof episodeAudioReviewDecisionOptions>[0]).map((option) => option.value);
  if (!allowedDecisions.includes(input.decision)) throw new EpisodeAudioActivityReviewError("That conclusion is not valid for this event type.", 400, "EPISODE_AUDIO_REVIEW_DECISION_INVALID");
  const eventAssetIds = geometry.lanes.map((lane) => text(lane.assetId)).sort();
  const evidenceAssetIds = evidence.sources.map((source) => source.assetId).sort();
  if (stableJson(eventAssetIds) !== stableJson(evidenceAssetIds)) throw new EpisodeAudioActivityReviewError("Playback evidence does not include the exact analyzed source set.", 409, "EPISODE_AUDIO_REVIEW_SOURCE_MISMATCH");
  for (const source of evidence.sources) {
    const lane = lanes.find((candidate) => text(candidate.assetId) === source.assetId && text(candidate.sourceId) === source.sourceId);
    const offset = lane ? number(lane.programOffsetSeconds) : null;
    const duration = lane ? number(lane.sourceDurationSeconds) : null;
    if (!lane || offset === null || !close(source.sourceStartSeconds, geometry.startSeconds - offset) || !close(source.sourceEndSeconds, geometry.endSeconds - offset) || source.sourceStartSeconds < -0.002 || (duration !== null && source.sourceEndSeconds > duration + 0.002)) throw new EpisodeAudioActivityReviewError("Playback evidence does not match the immutable source-clock mapping.", 409, "EPISODE_AUDIO_REVIEW_SOURCE_MAPPING_INVALID");
  }
  const expectedBinCount = Math.max(1, Math.ceil((geometry.endSeconds - geometry.startSeconds) / 0.25));
  if (evidence.coverage.totalBinCount !== expectedBinCount || !episodeAudioReviewPlaybackReady(evidence, input.decision)) throw new EpisodeAudioActivityReviewError("Required matched-source listening coverage is incomplete.", 409, "EPISODE_AUDIO_REVIEW_LISTENING_INCOMPLETE");
  const request = { schema: "quipsly-episode-audio-review-request-v1", projectId: context.project.id, episodeProductionId: context.episode.id, analysisId, eventId, actorUserId, actorEmail, clientRequestId, decision: input.decision, note, playbackEvidence: evidence };
  const requestSha256 = sha256(request);
  const stored = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `episode-audio-decisions:${context.episode.id}`);
    await acquirePrismaAdvisoryTransactionLock(tx, `episode-audio-review:${analysisId}:${eventId}`);
    const replay = await tx.studioEpisodeAudioReviewReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } } });
    if (replay) {
      if (replay.requestSha256 !== requestSha256) throw new EpisodeAudioActivityReviewError("That request id belongs to a different listening conclusion.", 409, "EPISODE_AUDIO_REVIEW_IDEMPOTENCY_CONFLICT");
      return { row: replay, idempotentReplay: true };
    }
    const freshAnalysis = await tx.studioEpisodeAudioAnalysisReceipt.findUnique({ where: { id: analysisId }, select: { inputSha256: true, programFingerprintSha256: true } });
    if (!freshAnalysis || freshAnalysis.inputSha256 !== currentInputSha256 || freshAnalysis.programFingerprintSha256 !== context.programFingerprintSha256) throw new EpisodeAudioActivityReviewError("The analysis changed before the conclusion was recorded.", 409, "EPISODE_AUDIO_REVIEW_ANALYSIS_STALE");
    const freshDecisionRows = await tx.studioEpisodeAudioTrackDecisionReceipt.findMany({ where: { episodeProductionId: context.episode.id }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }], take: 500 });
    const freshDecisionLedger = projectEpisodeAudioTrackDecisions(freshDecisionRows, context.programFingerprintSha256);
    if (stableJson(activeDecisionIds(freshDecisionLedger)) !== stableJson(context.program.activeDecisions.map((decision: { id: string }) => decision.id).sort())) throw new EpisodeAudioActivityReviewError("Canonical audio decisions changed before the conclusion was recorded.", 409, "EPISODE_AUDIO_REVIEW_ANALYSIS_STALE");
    const row = await tx.studioEpisodeAudioReviewReceipt.create({ data: {
      projectId: context.project.id,
      episodeProductionId: context.episode.id,
      analysisId,
      eventId,
      actorUserId,
      actorEmail,
      clientRequestId,
      decision: DATABASE_DECISION[input.decision],
      programFingerprintSha256: context.programFingerprintSha256,
      eventKind,
      startSeconds: eventStart,
      endSeconds: eventEnd,
      involvedAssetIdsJson: json(eventAssetIds),
      playbackEvidenceJson: json(evidence),
      requestSha256,
      note,
      occurredAt: new Date(),
    } });
    return { row, idempotentReplay: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ok: true, idempotentReplay: stored.idempotentReplay, review: publicReview(stored.row) };
}

export async function readEpisodeAudioActivityReviews(input: { prisma: any; projectSlug: string; episodeProductionId: string }) {
  const context = await loadEpisodeAudioActivityAnalysisContext(input);
  const rows = await input.prisma.studioEpisodeAudioReviewReceipt.findMany({ where: { episodeProductionId: context.episode.id }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 200 });
  const latestByEvent = new Map<string, ReturnType<typeof publicReview>>();
  for (const row of rows) if (!latestByEvent.has(row.eventId)) latestByEvent.set(row.eventId, publicReview(row));
  return {
    schema: "quipsly-episode-audio-review-ledger-v1" as const,
    reviews: rows.map(publicReview),
    latestByEvent: Object.fromEntries(latestByEvent),
    boundaries: { appendOnly: true as const, humanListeningRequired: true as const, sourcesRemainImmutable: true as const, noTimelineOrMixMutation: true as const },
  };
}
