import "server-only";

import { createHash } from "node:crypto";

import {
  evaluateTranscriptCandidate,
  parseTranscriptEvaluationCandidate,
  parseTranscriptEvaluationPolicyReceipt,
  type TranscriptEvaluationCandidate,
  type TranscriptEvaluationPolicyReceipt,
  type TranscriptEvaluationWord,
} from "@high-ground/quipsly-media-processing";

import { acquirePrismaAdvisoryTransactionLock } from "./prisma-advisory-lock.js";

export const TRANSCRIPT_EVALUATION_RUNNER_INPUT_SCHEMA =
  "quipsly-private-transcript-evaluation-runner-input-v1";
export const TRANSCRIPT_EVALUATION_CANDIDATE_SCHEMA =
  "quipsly-transcript-evaluation-candidate-v1";

const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const MAX_RAW_RESPONSE_BYTES = 2_000_000;
const MAX_REQUEST_CONFIG_BYTES = 64_000;
const MAX_OBSERVATION_BYTES = 64_000;

export type TranscriptEvaluationActor = {
  id: string;
  email?: string | null;
  isStaff: boolean;
};

export class TranscriptEvaluationCandidateError extends Error {
  constructor(
    message: string,
    public readonly code = "TRANSCRIPT_EVALUATION_CANDIDATE_INVALID",
    public readonly status = 400,
  ) {
    super(message);
    this.name = "TranscriptEvaluationCandidateError";
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256Value(value: unknown) {
  return sha256(stableJson(value));
}

function byteLength(value: unknown) {
  return Buffer.byteLength(stableJson(value), "utf8");
}

/**
 * Stable cross-window comparison identity for one provider configuration.
 *
 * The complete request receipt also contains inputMedia, whose checksum is
 * intentionally different for every evaluation window. Including that receipt
 * in provider identity would split one pinned provider build into a different
 * pseudo-provider per source and make workload-level thresholds impossible.
 * Exact request bytes remain preserved in requestConfigJson and are bound into
 * the append-only candidate key separately.
 */
export function transcriptProviderComparisonConfigSha256(value: unknown) {
  const providerConfig = object(object(value).provider);
  if (Object.keys(providerConfig).length === 0) {
    throw new TranscriptEvaluationCandidateError(
      "Provider request configuration must include a non-empty provider object.",
      "CANDIDATE_PROVIDER_CONFIG_INVALID",
    );
  }
  return sha256Value(providerConfig);
}

function boundedId(value: unknown, field: string) {
  const normalized = text(value);
  if (!SAFE_ID.test(normalized)) {
    throw new TranscriptEvaluationCandidateError(`${field} must be a stable 3–128 character identifier.`, "CANDIDATE_ID_INVALID");
  }
  return normalized;
}

function finiteInteger(value: unknown, field: string, maximum = 2_147_483_647) {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new TranscriptEvaluationCandidateError(`${field} must be a bounded non-negative integer.`, "CANDIDATE_MEASUREMENT_INVALID");
  }
  return Number(value);
}

function actorRoomAccess(actor: TranscriptEvaluationActor, requireWrite: boolean) {
  if (actor.isStaff) return {};
  const email = text(actor.email).toLowerCase();
  return {
    OR: [
      { createdByUserId: actor.id },
      { participants: { some: { userId: actor.id } } },
      { booking: { coachUserId: actor.id } },
      { booking: { clientUserId: actor.id } },
      ...(email ? [{ project: { accessGrants: { some: {
        email,
        status: "ACTIVE",
        ...(requireWrite ? { role: { in: ["OWNER", "EDITOR"] } } : {}),
      } } } }] : []),
    ],
  };
}

const windowSelect = {
  id: true,
  roomId: true,
  transcriptJobId: true,
  recordingAssetId: true,
  windowKeySha256: true,
  workload: true,
  conditionsJson: true,
  sourceStartSeconds: true,
  sourceEndSeconds: true,
  sourceDurationSeconds: true,
  sourceSha256: true,
  sourceGeneration: true,
  playbackSourceId: true,
  consentVersionSha256: true,
  referenceRevisionId: true,
  referenceContentSha256: true,
  referenceWordsJson: true,
  approvedByUserId: true,
  approvedAt: true,
  candidates: {
    orderBy: { createdAt: "asc" as const },
    include: {
      policy: true,
      corrections: { orderBy: { observedAt: "asc" as const } },
    },
  },
} as const;

async function authorizedWindow(input: {
  prisma: any;
  actor: TranscriptEvaluationActor;
  windowId: string;
  requireWrite: boolean;
}) {
  const window = await input.prisma.transcriptEvaluationWindow.findFirst({
    where: {
      id: input.windowId,
      room: actorRoomAccess(input.actor, input.requireWrite),
    },
    select: windowSelect,
  });
  if (!window) {
    throw new TranscriptEvaluationCandidateError(
      input.requireWrite
        ? "This account cannot append provider evidence to that evaluation window."
        : "Evaluation window not found or not accessible.",
      input.requireWrite ? "CANDIDATE_WRITE_FORBIDDEN" : "EVALUATION_WINDOW_NOT_FOUND",
      input.requireWrite ? 403 : 404,
    );
  }
  return window;
}

function policySnapshot(value: unknown, providerKey: string) {
  const row = object(value);
  const withoutClaimedHash = {
    sourceUrl: row.sourceUrl,
    capturedAt: row.capturedAt,
    trainingUsage: row.trainingUsage,
    retentionMode: row.retentionMode,
    retentionDays: row.retentionDays ?? null,
    processingRegion: row.processingRegion ?? null,
  };
  const receiptSha256 = sha256Value({ providerKey, ...withoutClaimedHash });
  return parseTranscriptEvaluationPolicyReceipt({ ...withoutClaimedHash, receiptSha256 });
}

function buildCandidate(input: {
  candidate: unknown;
  requestConfig: unknown;
  rawResponse: unknown;
  policy: unknown;
}) {
  if (!input.requestConfig || typeof input.requestConfig !== "object" || Array.isArray(input.requestConfig)) {
    throw new TranscriptEvaluationCandidateError("Provider request configuration must be a JSON object.", "CANDIDATE_CONFIG_INVALID");
  }
  if (!input.rawResponse || typeof input.rawResponse !== "object" || Array.isArray(input.rawResponse)) {
    throw new TranscriptEvaluationCandidateError("Raw provider evidence must be a JSON object.", "CANDIDATE_RESPONSE_INVALID");
  }
  if (byteLength(input.requestConfig) > MAX_REQUEST_CONFIG_BYTES) {
    throw new TranscriptEvaluationCandidateError("Provider request configuration exceeds 64 KB.", "CANDIDATE_CONFIG_TOO_LARGE", 413);
  }
  if (byteLength(input.rawResponse) > MAX_RAW_RESPONSE_BYTES) {
    throw new TranscriptEvaluationCandidateError("Raw provider evidence exceeds 2 MB.", "CANDIDATE_RESPONSE_TOO_LARGE", 413);
  }
  const candidate = object(input.candidate);
  const providerKey = text(candidate.providerKey);
  const policy = policySnapshot(input.policy, providerKey);
  const requestConfigSha256 = transcriptProviderComparisonConfigSha256(input.requestConfig);
  const requestEvidenceSha256 = sha256Value(input.requestConfig);
  const rawResponseSha256 = sha256Value(input.rawResponse);
  let parsed: TranscriptEvaluationCandidate;
  try {
    parsed = parseTranscriptEvaluationCandidate({
      ...candidate,
      requestConfigSha256,
      policy,
      ...(candidate.outcome === "succeeded" ? { providerReceiptSha256: rawResponseSha256 } : {}),
    });
  } catch (error) {
    throw new TranscriptEvaluationCandidateError(
      error instanceof Error ? error.message : "Provider candidate is invalid.",
      "CANDIDATE_CONTRACT_INVALID",
    );
  }
  if (parsed.elapsedMilliseconds > 2_147_483_647) {
    throw new TranscriptEvaluationCandidateError("Candidate latency exceeds the durable measurement range.", "CANDIDATE_MEASUREMENT_INVALID");
  }
  if (Date.parse(parsed.completedAt) > Date.now() + 5 * 60_000) {
    throw new TranscriptEvaluationCandidateError("Candidate completion time cannot be in the future.", "CANDIDATE_COMPLETED_AT_INVALID");
  }
  if (Date.parse(policy.capturedAt) > Date.now() + 5 * 60_000) {
    throw new TranscriptEvaluationCandidateError("Provider policy capture time cannot be in the future.", "POLICY_CAPTURED_AT_INVALID");
  }
  return { parsed, policy, requestConfigSha256, requestEvidenceSha256, rawResponseSha256 };
}

function validatedInputMedia(requestConfig: unknown, window: any) {
  const inputMedia = object(object(requestConfig).inputMedia);
  const valid = inputMedia.schema === "quipsly-transcript-evaluation-derivative-v1"
    && text(inputMedia.originalSourceSha256) === window.sourceSha256
    && Math.abs(Number(inputMedia.startSeconds) - Number(window.sourceStartSeconds)) <= 0.01
    && Math.abs(Number(inputMedia.endSeconds) - Number(window.sourceEndSeconds)) <= 0.01
    && Math.abs(Number(inputMedia.durationSeconds) - Number(window.sourceDurationSeconds)) <= 0.075
    && SHA256.test(text(inputMedia.sha256))
    && Number.isSafeInteger(inputMedia.byteSize)
    && Number(inputMedia.byteSize) > 44
    && Number(inputMedia.byteSize) <= 16_000_000
    && inputMedia.codec === "pcm_s16le"
    && Number(inputMedia.sampleRateHz) === 16_000
    && Number(inputMedia.channelCount) === 1
    && inputMedia.ffmpegArgumentsVersion === "mono-16khz-pcm-v1";
  if (!valid) {
    throw new TranscriptEvaluationCandidateError(
      "Provider evidence must name the exact verified Quipsly evaluation derivative for this source window.",
      "CANDIDATE_INPUT_MEDIA_INVALID",
      409,
    );
  }
  return inputMedia;
}

function publicCandidate(candidate: any) {
  const metrics = object(candidate.metricsJson);
  const inputMedia = object(object(candidate.requestConfigJson).inputMedia);
  return {
    id: candidate.id as string,
    windowId: candidate.windowId as string,
    runKey: candidate.runKey as string,
    providerKey: candidate.providerKey as string,
    providerName: candidate.providerName as string,
    model: candidate.model as string,
    adapterVersion: candidate.adapterVersion as string,
    requestConfigSha256: candidate.requestConfigSha256 as string,
    inputMediaSha256: SHA256.test(text(inputMedia.sha256)) ? text(inputMedia.sha256) : null,
    speakerAttribution: candidate.speakerAttribution as string,
    timingGranularity: candidate.timingGranularity as string,
    outcome: candidate.outcome as string,
    elapsedMilliseconds: candidate.elapsedMilliseconds as number,
    estimatedCostUsd: candidate.estimatedCostUsd as number | null,
    metrics: Object.keys(metrics).length ? metrics : null,
    errorCode: candidate.errorCode as string | null,
    retryable: candidate.retryable as boolean | null,
    policyReceiptSha256: candidate.policy?.receiptSha256 as string,
    correctionObservationCount: Array.isArray(candidate.corrections) ? candidate.corrections.length : 0,
    completedAt: candidate.completedAt instanceof Date ? candidate.completedAt.toISOString() : candidate.completedAt,
    createdAt: candidate.createdAt instanceof Date ? candidate.createdAt.toISOString() : candidate.createdAt,
  };
}

export async function appendTranscriptEvaluationCandidate(input: {
  prisma: any;
  actor: TranscriptEvaluationActor;
  windowId: string;
  clientRequestId: string;
  runKey: string;
  requestConfig: unknown;
  rawResponse: unknown;
  policy: unknown;
  candidate: unknown;
}) {
  const windowId = boundedId(input.windowId, "windowId");
  const clientRequestId = boundedId(input.clientRequestId, "clientRequestId");
  const runKey = boundedId(input.runKey, "runKey");
  const evidence = buildCandidate(input);
  const snapshot = {
    schema: TRANSCRIPT_EVALUATION_CANDIDATE_SCHEMA,
    submittedByUserId: input.actor.id,
    windowId,
    windowKeySha256: "",
    sourceSha256: "",
    referenceContentSha256: "",
    runKey,
    provider: {
      providerKey: evidence.parsed.providerKey,
      providerName: evidence.parsed.providerName,
      model: evidence.parsed.model,
      adapterVersion: evidence.parsed.adapterVersion,
      requestConfigSha256: evidence.requestConfigSha256,
      requestEvidenceSha256: evidence.requestEvidenceSha256,
      speakerAttribution: evidence.parsed.speakerAttribution,
      timingGranularity: evidence.parsed.timingGranularity,
    },
    outcome: evidence.parsed.outcome,
    candidateContractSha256: sha256Value(evidence.parsed),
    rawResponseSha256: evidence.rawResponseSha256,
    policyReceiptSha256: evidence.policy.receiptSha256,
  };
  const initial = await authorizedWindow({ prisma: input.prisma, actor: input.actor, windowId, requireWrite: true });
  const inputMedia = validatedInputMedia(input.requestConfig, initial);
  Object.assign(snapshot, {
    windowKeySha256: initial.windowKeySha256,
    sourceSha256: initial.sourceSha256,
    referenceContentSha256: initial.referenceContentSha256,
  });
  const candidateKeySha256 = sha256Value(snapshot);
  const replay = await input.prisma.transcriptEvaluationCandidate.findUnique({
    where: { submittedByUserId_clientRequestId: { submittedByUserId: input.actor.id, clientRequestId } },
    include: { policy: true, corrections: true },
  });
  if (replay) {
    if (replay.candidateKeySha256 !== candidateKeySha256) {
      throw new TranscriptEvaluationCandidateError("That operation ID is already bound to different provider evidence.", "CANDIDATE_OPERATION_CONFLICT", 409);
    }
    return { ok: true, idempotentReplay: true, candidate: publicCandidate(replay) };
  }

  try {
    const saved = await input.prisma.$transaction(async (tx: any) => {
      await acquirePrismaAdvisoryTransactionLock(tx, `transcript-evaluation-candidate:${windowId}:${runKey}`);
      const current = await authorizedWindow({ prisma: tx, actor: input.actor, windowId, requireWrite: true });
      if (
        current.windowKeySha256 !== initial.windowKeySha256
        || current.sourceSha256 !== initial.sourceSha256
        || current.referenceContentSha256 !== initial.referenceContentSha256
      ) {
        throw new TranscriptEvaluationCandidateError("The approved reference changed before candidate persistence.", "CANDIDATE_REFERENCE_CHANGED", 409);
      }
      validatedInputMedia(input.requestConfig, current);
      const conflictingDerivative = current.candidates.find((candidate: any) => {
        const prior = object(object(candidate.requestConfigJson).inputMedia);
        return SHA256.test(text(prior.sha256)) && text(prior.sha256) !== text(inputMedia.sha256);
      });
      if (conflictingDerivative) {
        throw new TranscriptEvaluationCandidateError(
          "This provider result used different audio bytes than the existing candidates for the same window.",
          "CANDIDATE_DERIVATIVE_MISMATCH",
          409,
        );
      }
      const policy = await tx.transcriptProviderPolicyReceipt.upsert({
        where: { receiptSha256: evidence.policy.receiptSha256 },
        create: {
          receiptSha256: evidence.policy.receiptSha256,
          providerKey: evidence.parsed.providerKey,
          capturedByUserId: input.actor.id,
          capturedByEmailSnapshot: text(input.actor.email) || null,
          policyJson: evidence.policy,
          capturedAt: new Date(evidence.policy.capturedAt),
        },
        update: {},
      });
      const words = evidence.parsed.outcome === "succeeded" ? evidence.parsed.words : [];
      const metrics = evidence.parsed.outcome === "succeeded"
        ? evaluateTranscriptCandidate(
          current.referenceWordsJson as TranscriptEvaluationWord[],
          words,
        )
        : null;
      return tx.transcriptEvaluationCandidate.create({
        data: {
          windowId,
          policyReceiptId: policy.id,
          submittedByUserId: input.actor.id,
          submittedByEmailSnapshot: text(input.actor.email) || null,
          clientRequestId,
          runKey,
          candidateKeySha256,
          windowKeySha256Snapshot: current.windowKeySha256,
          sourceSha256Snapshot: current.sourceSha256,
          referenceContentSha256: current.referenceContentSha256,
          providerKey: evidence.parsed.providerKey,
          providerName: evidence.parsed.providerName,
          model: evidence.parsed.model,
          adapterVersion: evidence.parsed.adapterVersion,
          requestConfigSha256: evidence.requestConfigSha256,
          requestConfigJson: input.requestConfig,
          speakerAttribution: evidence.parsed.speakerAttribution,
          timingGranularity: evidence.parsed.timingGranularity,
          outcome: evidence.parsed.outcome,
          providerRequestId: text(object(input.candidate).providerRequestId) || null,
          providerReceiptSha256: evidence.parsed.outcome === "succeeded" ? evidence.rawResponseSha256 : null,
          rawResponseSha256: evidence.rawResponseSha256,
          rawResponseJson: input.rawResponse,
          normalizedWordsJson: words,
          metricsJson: metrics,
          elapsedMilliseconds: Math.round(evidence.parsed.elapsedMilliseconds),
          estimatedCostUsd: evidence.parsed.estimatedCostUsd,
          errorCode: evidence.parsed.outcome === "failed" ? evidence.parsed.errorCode : null,
          retryable: evidence.parsed.outcome === "failed" ? evidence.parsed.retryable : null,
          completedAt: new Date(evidence.parsed.completedAt),
        },
        include: { policy: true, corrections: true },
      });
    }, { isolationLevel: "Serializable" });
    return { ok: true, idempotentReplay: false, candidate: publicCandidate(saved) };
  } catch (error) {
    const code = text(object(error).code);
    if (code !== "P2002" && code !== "P2034") throw error;
    const winner = await input.prisma.transcriptEvaluationCandidate.findFirst({
      where: { OR: [
        { submittedByUserId: input.actor.id, clientRequestId },
        { windowId, runKey },
        { candidateKeySha256 },
      ] },
      include: { policy: true, corrections: true },
    });
    if (!winner || winner.candidateKeySha256 !== candidateKeySha256) {
      throw new TranscriptEvaluationCandidateError("A different provider attempt already owns this run key.", "CANDIDATE_RUN_CONFLICT", 409);
    }
    return { ok: true, idempotentReplay: true, candidate: publicCandidate(winner) };
  }
}

export async function appendTranscriptEvaluationCorrectionObservation(input: {
  prisma: any;
  actor: TranscriptEvaluationActor;
  candidateId: string;
  clientRequestId: string;
  elapsedMilliseconds: unknown;
  operationCount: unknown;
  observedAt: unknown;
  observation: unknown;
}) {
  const candidateId = boundedId(input.candidateId, "candidateId");
  const clientRequestId = boundedId(input.clientRequestId, "clientRequestId");
  const elapsedMilliseconds = finiteInteger(input.elapsedMilliseconds, "elapsedMilliseconds");
  const operationCount = finiteInteger(input.operationCount, "operationCount", 100_000);
  if (byteLength(input.observation) > MAX_OBSERVATION_BYTES) {
    throw new TranscriptEvaluationCandidateError("Correction observation exceeds 64 KB.", "CORRECTION_OBSERVATION_TOO_LARGE", 413);
  }
  const observedAt = new Date(text(input.observedAt));
  if (!Number.isFinite(observedAt.getTime()) || observedAt.getTime() > Date.now() + 5 * 60_000) {
    throw new TranscriptEvaluationCandidateError("observedAt must be a valid past timestamp.", "CORRECTION_OBSERVED_AT_INVALID");
  }
  const candidate = await input.prisma.transcriptEvaluationCandidate.findUnique({
    where: { id: candidateId },
    include: { window: { select: { id: true } } },
  });
  if (!candidate) throw new TranscriptEvaluationCandidateError("Provider candidate not found.", "CANDIDATE_NOT_FOUND", 404);
  await authorizedWindow({ prisma: input.prisma, actor: input.actor, windowId: candidate.window.id, requireWrite: true });
  const replay = await input.prisma.transcriptEvaluationCorrectionObservation.findUnique({
    where: { reviewerUserId_clientRequestId: { reviewerUserId: input.actor.id, clientRequestId } },
  });
  const snapshot = {
    candidateId,
    candidateKeySha256: candidate.candidateKeySha256,
    referenceContentSha256: candidate.referenceContentSha256,
    elapsedMilliseconds,
    operationCount,
    observedAt: observedAt.toISOString(),
    observationSha256: sha256Value(input.observation),
  };
  if (replay) {
    if (sha256Value({
      candidateId: replay.candidateId,
      candidateKeySha256: replay.candidateKeySha256,
      referenceContentSha256: replay.referenceContentSha256,
      elapsedMilliseconds: replay.elapsedMilliseconds,
      operationCount: replay.operationCount,
      observedAt: replay.observedAt.toISOString(),
      observationSha256: sha256Value(replay.observationJson),
    }) !== sha256Value(snapshot)) {
      throw new TranscriptEvaluationCandidateError("That operation ID is already bound to a different correction observation.", "CORRECTION_OPERATION_CONFLICT", 409);
    }
    return { ok: true, idempotentReplay: true, observationId: replay.id };
  }
  try {
    const saved = await input.prisma.transcriptEvaluationCorrectionObservation.create({
      data: {
        candidateId,
        reviewerUserId: input.actor.id,
        reviewerEmailSnapshot: text(input.actor.email) || null,
        clientRequestId,
        candidateKeySha256: candidate.candidateKeySha256,
        referenceContentSha256: candidate.referenceContentSha256,
        elapsedMilliseconds,
        operationCount,
        observationJson: input.observation,
        observedAt,
      },
    });
    return { ok: true, idempotentReplay: false, observationId: saved.id };
  } catch (error) {
    if (text(object(error).code) !== "P2002") throw error;
    const winner = await input.prisma.transcriptEvaluationCorrectionObservation.findUnique({
      where: { reviewerUserId_clientRequestId: { reviewerUserId: input.actor.id, clientRequestId } },
    });
    if (!winner || sha256Value({
      candidateId: winner.candidateId,
      candidateKeySha256: winner.candidateKeySha256,
      referenceContentSha256: winner.referenceContentSha256,
      elapsedMilliseconds: winner.elapsedMilliseconds,
      operationCount: winner.operationCount,
      observedAt: winner.observedAt.toISOString(),
      observationSha256: sha256Value(winner.observationJson),
    }) !== sha256Value(snapshot)) {
      throw new TranscriptEvaluationCandidateError("A different correction observation won that operation ID.", "CORRECTION_OPERATION_CONFLICT", 409);
    }
    return { ok: true, idempotentReplay: true, observationId: winner.id };
  }
}

export async function readTranscriptEvaluationCandidates(input: {
  prisma: any;
  actor: TranscriptEvaluationActor;
  roomId: string;
}) {
  const roomId = boundedId(input.roomId, "roomId");
  const room = await input.prisma.callRoom.findFirst({
    where: { id: roomId, ...actorRoomAccess(input.actor, false) },
    select: {
      id: true,
      transcriptEvaluationWindows: {
        orderBy: { approvedAt: "asc" },
        select: windowSelect,
      },
    },
  });
  if (!room) throw new TranscriptEvaluationCandidateError("Session not found or not accessible.", "SESSION_NOT_FOUND", 404);
  return {
    schema: TRANSCRIPT_EVALUATION_CANDIDATE_SCHEMA,
    windowCount: room.transcriptEvaluationWindows.length,
    candidates: room.transcriptEvaluationWindows.flatMap((window: any) => window.candidates.map(publicCandidate)),
  };
}

export async function exportTranscriptEvaluationRunnerInput(input: {
  prisma: any;
  actor: TranscriptEvaluationActor;
  roomId: string;
}) {
  const roomId = boundedId(input.roomId, "roomId");
  const room = await input.prisma.callRoom.findFirst({
    where: { id: roomId, ...actorRoomAccess(input.actor, true) },
    select: {
      id: true,
      title: true,
      transcriptEvaluationWindows: {
        orderBy: { approvedAt: "asc" },
        select: windowSelect,
      },
    },
  });
  if (!room) throw new TranscriptEvaluationCandidateError("This account cannot export private evaluation evidence for that Session.", "PRIVATE_CORPUS_EXPORT_FORBIDDEN", 403);
  if (!room.transcriptEvaluationWindows.length) {
    throw new TranscriptEvaluationCandidateError("This Session has no approved evaluation windows.", "PRIVATE_CORPUS_EMPTY", 409);
  }
  const createdAt = new Date().toISOString();
  const windows = room.transcriptEvaluationWindows.map((window: any) => ({
    windowId: window.id,
    windowKeySha256: window.windowKeySha256,
    workload: window.workload,
    conditions: window.conditionsJson,
    source: {
      roomId: window.roomId,
      recordingAssetId: window.recordingAssetId,
      playbackSourceId: window.playbackSourceId,
      protectedPlaybackUrl: `/api/ingest/media/${window.playbackSourceId}`,
      startSeconds: window.sourceStartSeconds,
      endSeconds: window.sourceEndSeconds,
      durationSeconds: window.sourceDurationSeconds,
      sha256: window.sourceSha256,
      generation: window.sourceGeneration,
    },
    consentVersionSha256: window.consentVersionSha256,
    reference: {
      approvalStatus: "human-approved",
      revisionId: window.referenceRevisionId,
      contentSha256: window.referenceContentSha256,
      approvedAt: window.approvedAt instanceof Date ? window.approvedAt.toISOString() : window.approvedAt,
      approvedBy: window.approvedByUserId,
      words: window.referenceWordsJson,
    },
    priorCandidateReceipts: window.candidates.map((candidate: any) => ({
      candidateId: candidate.id,
      runKey: candidate.runKey,
      candidateKeySha256: candidate.candidateKeySha256,
      providerKey: candidate.providerKey,
      model: candidate.model,
      adapterVersion: candidate.adapterVersion,
      requestConfigSha256: candidate.requestConfigSha256,
      outcome: candidate.outcome,
      rawResponseSha256: candidate.rawResponseSha256,
    })),
  }));
  return {
    kind: TRANSCRIPT_EVALUATION_RUNNER_INPUT_SCHEMA,
    version: 1,
    roomId: room.id,
    roomTitle: room.title,
    createdAt,
    createdBy: input.actor.id,
    corpusRevisionSha256: sha256Value(windows.map((window: any) => ({
      windowId: window.windowId,
      windowKeySha256: window.windowKeySha256,
      referenceContentSha256: window.reference.contentSha256,
    }))),
    windows,
  };
}
