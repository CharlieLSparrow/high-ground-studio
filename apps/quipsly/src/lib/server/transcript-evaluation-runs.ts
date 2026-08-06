import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  LOCAL_WHISPER_EVALUATION_ADAPTER_VERSION,
  LOCAL_WHISPER_TRANSCRIPT_PROVIDER,
} from "@high-ground/quipsly-media-processing";

import { acquirePrismaAdvisoryTransactionLock } from "./prisma-advisory-lock.js";
import {
  exportTranscriptEvaluationRunnerInput,
  transcriptProviderBaseConfigSha256,
  type TranscriptEvaluationActor,
} from "./transcript-evaluation-candidates.js";

export const TRANSCRIPT_EVALUATION_RUN_SCHEMA =
  "quipsly-transcript-evaluation-run-v1" as const;
export const TRANSCRIPT_EVALUATION_RUNNER_LEASE_SCHEMA =
  "quipsly-transcript-evaluation-runner-lease-v1" as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DEFAULT_LEASE_SECONDS = 30 * 60;
const MAX_WINDOWS = 12;

export class TranscriptEvaluationRunError extends Error {
  constructor(
    message: string,
    public readonly code = "TRANSCRIPT_EVALUATION_RUN_INVALID",
    public readonly status = 400,
  ) {
    super(message);
    this.name = "TranscriptEvaluationRunError";
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

function sha256Value(value: unknown) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function safeId(value: unknown, field: string) {
  const normalized = text(value);
  if (!SAFE_ID.test(normalized)) {
    throw new TranscriptEvaluationRunError(`${field} must be a stable 2–128 character identifier.`, "TRANSCRIPT_EVALUATION_RUN_ID_INVALID");
  }
  return normalized;
}

function uuid(value: unknown, field: string) {
  const normalized = text(value).toLowerCase();
  if (!UUID.test(normalized)) {
    throw new TranscriptEvaluationRunError(`${field} must be a UUID.`, "TRANSCRIPT_EVALUATION_RUN_REQUEST_ID_INVALID");
  }
  return normalized;
}

function actorRoomAccess(actor: TranscriptEvaluationActor, requireWrite: boolean) {
  if (actor.isStaff) return {};
  const email = text(actor.email).toLowerCase();
  return {
    OR: [
      { createdByUserId: actor.id },
      { participants: { some: { userId: actor.id, accessStatus: "ACTIVE" } } },
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

function runActorAccess(actor: TranscriptEvaluationActor) {
  return actor.isStaff ? {} : { requestedByUserId: actor.id };
}

function publicRun(run: any) {
  return {
    schema: TRANSCRIPT_EVALUATION_RUN_SCHEMA,
    id: run.id,
    roomId: run.roomId,
    runKey: run.runKey,
    comparisonKey: run.comparisonKey,
    experimentKind: run.experimentKind,
    providerKey: run.providerKey,
    providerName: run.providerName,
    model: run.model,
    adapterVersion: run.adapterVersion,
    language: run.language,
    corpusRevisionSha256: run.corpusRevisionSha256,
    status: run.status,
    attemptCount: run.attemptCount,
    maxAttempts: run.maxAttempts,
    leaseOwner: run.status === "PROCESSING" ? run.leaseOwner : null,
    leaseExpiresAt: run.status === "PROCESSING" ? run.leaseExpiresAt?.toISOString?.() ?? run.leaseExpiresAt : null,
    lastHeartbeatAt: run.lastHeartbeatAt?.toISOString?.() ?? run.lastHeartbeatAt ?? null,
    startedAt: run.startedAt?.toISOString?.() ?? run.startedAt ?? null,
    completedAt: run.completedAt?.toISOString?.() ?? run.completedAt ?? null,
    failedAt: run.failedAt?.toISOString?.() ?? run.failedAt ?? null,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt?.toISOString?.() ?? run.createdAt,
    updatedAt: run.updatedAt?.toISOString?.() ?? run.updatedAt,
    windows: (run.windows ?? []).map((window: any) => ({
      id: window.id,
      windowId: window.windowId,
      ordinal: window.ordinal,
      status: window.status,
      baselineCandidateId: window.baselineCandidateId,
      terminologyCandidateId: window.terminologyCandidateId,
      derivativeSha256: window.derivativeSha256,
      completedAt: window.completedAt?.toISOString?.() ?? window.completedAt ?? null,
      errorCode: window.errorCode,
      errorMessage: window.errorMessage,
    })),
  };
}

const runInclude = {
  windows: { orderBy: { ordinal: "asc" as const } },
} as const;

export async function queueTranscriptTerminologyEvaluationRun(input: {
  prisma: any;
  actor: TranscriptEvaluationActor;
  roomId: string;
  requestId: string;
  windowIds?: readonly string[];
  model?: string;
  language?: string;
}) {
  const roomId = safeId(input.roomId, "roomId");
  const requestId = uuid(input.requestId, "requestId");
  const model = safeId(input.model || "large-v3-turbo", "model");
  const language = text(input.language) || "en";
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(language)) {
    throw new TranscriptEvaluationRunError("language must be a bounded language code.", "TRANSCRIPT_EVALUATION_RUN_LANGUAGE_INVALID");
  }
  const room = await input.prisma.callRoom.findFirst({
    where: { id: roomId, ...actorRoomAccess(input.actor, true) },
    select: { id: true },
  });
  if (!room) {
    throw new TranscriptEvaluationRunError("This account cannot queue private provider evaluation for that Session.", "TRANSCRIPT_EVALUATION_RUN_FORBIDDEN", 403);
  }
  const runnerInput = await exportTranscriptEvaluationRunnerInput({
    prisma: input.prisma,
    actor: input.actor,
    roomId,
  });
  const requestedWindowIds = input.windowIds?.length
    ? [...new Set(input.windowIds.map((value) => safeId(value, "windowId")))]
    : null;
  const selectedWindows = runnerInput.windows.filter((window: any) => (
    (!requestedWindowIds || requestedWindowIds.includes(window.windowId))
    && window.terminologyExperiment?.schema === "quipsly-transcript-terminology-experiment-v1"
    && Number(window.terminologyExperiment.referenceOccurrenceCount) > 0
  ));
  if (requestedWindowIds && selectedWindows.length !== requestedWindowIds.length) {
    throw new TranscriptEvaluationRunError("One or more selected windows are unavailable, stale, or contain no reviewed critical term.", "TRANSCRIPT_EVALUATION_RUN_WINDOW_INVALID", 409);
  }
  if (!selectedWindows.length) {
    throw new TranscriptEvaluationRunError("Approve a playback-reviewed window containing frozen project terminology before queueing this experiment.", "TRANSCRIPT_EVALUATION_RUN_WINDOW_REQUIRED", 409);
  }
  if (selectedWindows.length > MAX_WINDOWS) {
    throw new TranscriptEvaluationRunError(`A matched run is limited to ${MAX_WINDOWS} windows.`, "TRANSCRIPT_EVALUATION_RUN_TOO_LARGE", 409);
  }
  const requestSnapshot = {
    schema: TRANSCRIPT_EVALUATION_RUN_SCHEMA,
    roomId,
    requestId,
    experimentKind: "terminology",
    providerKey: LOCAL_WHISPER_TRANSCRIPT_PROVIDER,
    providerName: "OpenAI Whisper local",
    model,
    adapterVersion: LOCAL_WHISPER_EVALUATION_ADAPTER_VERSION,
    language,
    corpusRevisionSha256: runnerInput.corpusRevisionSha256,
    windows: selectedWindows.map((window: any) => ({
      windowId: window.windowId,
      windowKeySha256: window.windowKeySha256,
      sourceSha256: window.source.sha256,
      referenceContentSha256: window.reference.contentSha256,
      termsSha256: window.terminologyExperiment.termsSha256,
    })),
  };
  const requestSha256 = sha256Value(requestSnapshot);
  const existing = await input.prisma.transcriptEvaluationRun.findUnique({
    where: { requestedByUserId_requestId: { requestedByUserId: input.actor.id, requestId } },
    include: runInclude,
  });
  if (existing) {
    if (existing.requestSha256 !== requestSha256) {
      throw new TranscriptEvaluationRunError("That request ID already belongs to different evaluation intent.", "TRANSCRIPT_EVALUATION_RUN_REQUEST_CONFLICT", 409);
    }
    return { ok: true, idempotentReplay: true, run: publicRun(existing) };
  }
  const runUuid = randomUUID();
  const runKey = `terminology-${runUuid}`;
  try {
    const created = await input.prisma.transcriptEvaluationRun.create({
      data: {
        requestId,
        requestSha256,
        roomId,
        requestedByUserId: input.actor.id,
        runKey,
        comparisonKey: runKey,
        experimentKind: "terminology",
        providerKey: LOCAL_WHISPER_TRANSCRIPT_PROVIDER,
        providerName: "OpenAI Whisper local",
        model,
        adapterVersion: LOCAL_WHISPER_EVALUATION_ADAPTER_VERSION,
        language,
        corpusRevisionSha256: runnerInput.corpusRevisionSha256,
        requestConfigJson: requestSnapshot,
        resultJson: {
          providerSecretsPersisted: false,
          productionRoutingChanged: false,
          transcriptMutationAllowed: false,
        },
        windows: {
          create: selectedWindows.map((window: any, ordinal: number) => ({
            windowId: window.windowId,
            ordinal,
            baselineRunKey: `${runKey}-w${ordinal}-baseline`,
            terminologyRunKey: `${runKey}-w${ordinal}-project-terminology`,
          })),
        },
      },
      include: runInclude,
    });
    return { ok: true, idempotentReplay: false, run: publicRun(created) };
  } catch (error) {
    if (text(object(error).code) !== "P2002") throw error;
    const winner = await input.prisma.transcriptEvaluationRun.findUnique({
      where: { requestedByUserId_requestId: { requestedByUserId: input.actor.id, requestId } },
      include: runInclude,
    });
    if (!winner || winner.requestSha256 !== requestSha256) {
      throw new TranscriptEvaluationRunError("A different evaluation request won that operation ID.", "TRANSCRIPT_EVALUATION_RUN_REQUEST_CONFLICT", 409);
    }
    return { ok: true, idempotentReplay: true, run: publicRun(winner) };
  }
}

export async function readTranscriptEvaluationRuns(input: {
  prisma: any;
  actor: TranscriptEvaluationActor;
  roomId: string;
}) {
  const roomId = safeId(input.roomId, "roomId");
  const room = await input.prisma.callRoom.findFirst({
    where: { id: roomId, ...actorRoomAccess(input.actor, false) },
    select: { id: true },
  });
  if (!room) throw new TranscriptEvaluationRunError("Session not found or not accessible.", "SESSION_NOT_FOUND", 404);
  const runs = await input.prisma.transcriptEvaluationRun.findMany({
    where: { roomId },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: runInclude,
  });
  return { schema: TRANSCRIPT_EVALUATION_RUN_SCHEMA, runs: runs.map(publicRun) };
}

export async function claimTranscriptEvaluationRun(input: {
  prisma: any;
  actor: TranscriptEvaluationActor;
  workerId: string;
  leaseSeconds?: number;
}) {
  const workerId = safeId(input.workerId, "workerId");
  const leaseSeconds = input.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 60 || leaseSeconds > 60 * 60) {
    throw new TranscriptEvaluationRunError("leaseSeconds must be between 60 and 3600.", "TRANSCRIPT_EVALUATION_RUN_LEASE_INVALID");
  }
  const leaseToken = randomUUID();
  const now = new Date();
  const claimed = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `transcript-evaluation-run-claim:${input.actor.id}`);
    const claimable = await tx.transcriptEvaluationRun.findMany({
      where: {
        ...runActorAccess(input.actor),
        status: { in: ["QUEUED", "PROCESSING"] },
        OR: [
          { status: "QUEUED" },
          { status: "PROCESSING", leaseExpiresAt: { lte: now } },
        ],
      },
      orderBy: [{ createdAt: "asc" }],
      take: 50,
      include: runInclude,
    });
    for (const exhausted of claimable.filter((run: any) => run.attemptCount >= run.maxAttempts)) {
      const errorCode = "evaluation-lease-retry-exhausted";
      const errorMessage = "The worker lease expired after the run exhausted its retry budget. Queue a new explicit experiment to continue.";
      await tx.transcriptEvaluationRun.update({
        where: { id: exhausted.id },
        data: {
          status: "FAILED",
          leaseToken: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          failedAt: now,
          errorCode,
          errorMessage,
          windows: {
            updateMany: {
              where: { status: { in: ["QUEUED", "PROCESSING"] } },
              data: { status: "FAILED", failedAt: now, errorCode, errorMessage },
            },
          },
        },
      });
    }
    const candidate = claimable.find((run: any) => run.attemptCount < run.maxAttempts);
    if (!candidate) return null;
    await acquirePrismaAdvisoryTransactionLock(tx, `transcript-evaluation-run:${candidate.id}`);
    const updated = await tx.transcriptEvaluationRun.update({
      where: { id: candidate.id },
      data: {
        status: "PROCESSING",
        attemptCount: { increment: 1 },
        leaseToken,
        leaseOwner: workerId,
        leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000),
        lastHeartbeatAt: now,
        startedAt: candidate.startedAt || now,
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        windows: {
          updateMany: {
            where: { status: { in: ["QUEUED", "PROCESSING", "FAILED"] } },
            data: { status: "PROCESSING", startedAt: now, failedAt: null, errorCode: null, errorMessage: null },
          },
        },
      },
      include: runInclude,
    });
    return updated;
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 20_000 });
  if (!claimed) return { ok: true, lease: null };
  const runnerInput = await exportTranscriptEvaluationRunnerInput({
    prisma: input.prisma,
    actor: input.actor,
    roomId: claimed.roomId,
  });
  const byWindow = new Map<string, any>(claimed.windows.map((window: any) => [window.windowId, window]));
  const selectedWindows = runnerInput.windows.filter((window: any) => byWindow.has(window.windowId)).map((window: any) => {
    const control = byWindow.get(window.windowId)!;
    return {
      ...window,
      runControl: {
        schema: TRANSCRIPT_EVALUATION_RUNNER_LEASE_SCHEMA,
        runId: claimed.id,
        comparisonKey: claimed.comparisonKey,
        baselineRunKey: control.baselineRunKey,
        terminologyRunKey: control.terminologyRunKey,
      },
    };
  });
  if (selectedWindows.length !== claimed.windows.length) {
    throw new TranscriptEvaluationRunError("A claimed run no longer matches its immutable evaluation windows.", "TRANSCRIPT_EVALUATION_RUN_WINDOW_DRIFT", 409);
  }
  return {
    ok: true,
    lease: {
      schema: TRANSCRIPT_EVALUATION_RUNNER_LEASE_SCHEMA,
      run: publicRun(claimed),
      token: leaseToken,
      workerId,
      expiresAt: claimed.leaseExpiresAt!.toISOString(),
      runnerInput: { ...runnerInput, windows: selectedWindows },
    },
  };
}

async function ownedProcessingRun(input: {
  prisma: any;
  actor: TranscriptEvaluationActor;
  runId: string;
  leaseToken: string;
}) {
  const runId = safeId(input.runId, "runId");
  const leaseToken = uuid(input.leaseToken, "leaseToken");
  const run = await input.prisma.transcriptEvaluationRun.findFirst({
    where: { id: runId, ...runActorAccess(input.actor) },
    include: runInclude,
  });
  if (!run) throw new TranscriptEvaluationRunError("Evaluation run not found or not claimable by this account.", "TRANSCRIPT_EVALUATION_RUN_NOT_FOUND", 404);
  if (run.status !== "PROCESSING" || run.leaseToken !== leaseToken) {
    throw new TranscriptEvaluationRunError("The evaluation worker no longer owns this lease.", "TRANSCRIPT_EVALUATION_RUN_LEASE_LOST", 409);
  }
  if (!run.leaseExpiresAt || run.leaseExpiresAt.getTime() <= Date.now()) {
    throw new TranscriptEvaluationRunError("The evaluation worker lease expired and must be reclaimed.", "TRANSCRIPT_EVALUATION_RUN_LEASE_EXPIRED", 409);
  }
  return run;
}

export async function heartbeatTranscriptEvaluationRun(input: {
  prisma: any;
  actor: TranscriptEvaluationActor;
  runId: string;
  leaseToken: string;
  leaseSeconds?: number;
}) {
  const run = await ownedProcessingRun(input);
  const leaseSeconds = input.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 60 || leaseSeconds > 60 * 60) {
    throw new TranscriptEvaluationRunError("leaseSeconds must be between 60 and 3600.", "TRANSCRIPT_EVALUATION_RUN_LEASE_INVALID");
  }
  const now = new Date();
  const updated = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `transcript-evaluation-run:${run.id}`);
    const current = await tx.transcriptEvaluationRun.findUnique({ where: { id: run.id }, include: runInclude });
    if (!current || current.status !== "PROCESSING" || current.leaseToken !== run.leaseToken) {
      throw new TranscriptEvaluationRunError("The evaluation worker no longer owns this lease.", "TRANSCRIPT_EVALUATION_RUN_LEASE_LOST", 409);
    }
    if (!current.leaseExpiresAt || current.leaseExpiresAt.getTime() <= now.getTime()) {
      throw new TranscriptEvaluationRunError("The evaluation worker lease expired and must be reclaimed.", "TRANSCRIPT_EVALUATION_RUN_LEASE_EXPIRED", 409);
    }
    return tx.transcriptEvaluationRun.update({
      where: { id: current.id },
      data: { lastHeartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000) },
      include: runInclude,
    });
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 20_000 });
  return { ok: true, run: publicRun(updated) };
}

function experimentReceipt(candidate: any) {
  return object(object(candidate.requestConfigJson).terminologyExperiment);
}

function inputMedia(candidate: any) {
  return object(object(candidate.requestConfigJson).inputMedia);
}

export async function completeTranscriptEvaluationRun(input: {
  prisma: any;
  actor: TranscriptEvaluationActor;
  runId: string;
  leaseToken: string;
}) {
  const run = await ownedProcessingRun(input);
  const completed = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `transcript-evaluation-run:${run.id}`);
    const current = await tx.transcriptEvaluationRun.findUnique({ where: { id: run.id }, include: runInclude });
    if (!current || current.status !== "PROCESSING" || current.leaseToken !== run.leaseToken) {
      throw new TranscriptEvaluationRunError("The evaluation worker lost its lease before completion.", "TRANSCRIPT_EVALUATION_RUN_LEASE_LOST", 409);
    }
    if (!current.leaseExpiresAt || current.leaseExpiresAt.getTime() <= Date.now()) {
      throw new TranscriptEvaluationRunError("The evaluation worker lease expired before completion and must be reclaimed.", "TRANSCRIPT_EVALUATION_RUN_LEASE_EXPIRED", 409);
    }
    const bindings = [];
    for (const window of current.windows) {
      const [baseline, terminology] = await Promise.all([
        tx.transcriptEvaluationCandidate.findUnique({
          where: { windowId_runKey: { windowId: window.windowId, runKey: window.baselineRunKey } },
        }),
        tx.transcriptEvaluationCandidate.findUnique({
          where: { windowId_runKey: { windowId: window.windowId, runKey: window.terminologyRunKey } },
        }),
      ]);
      if (!baseline || !terminology) {
        throw new TranscriptEvaluationRunError("Both immutable candidate arms must be appended before completion.", "TRANSCRIPT_EVALUATION_RUN_INCOMPLETE", 409);
      }
      const baselineExperiment = experimentReceipt(baseline);
      const terminologyExperiment = experimentReceipt(terminology);
      const baselineMedia = inputMedia(baseline);
      const terminologyMedia = inputMedia(terminology);
      const derivativeSha256 = text(baselineMedia.sha256);
      const valid = baselineExperiment.comparisonKey === current.comparisonKey
        && terminologyExperiment.comparisonKey === current.comparisonKey
        && baselineExperiment.arm === "baseline"
        && terminologyExperiment.arm === "project-terminology"
        && baselineExperiment.termsSha256 === terminologyExperiment.termsSha256
        && SHA256.test(derivativeSha256)
        && derivativeSha256 === text(terminologyMedia.sha256)
        && baseline.providerKey === current.providerKey
        && terminology.providerKey === current.providerKey
        && baseline.model === current.model
        && terminology.model === current.model
        && baseline.adapterVersion === current.adapterVersion
        && terminology.adapterVersion === current.adapterVersion
        && transcriptProviderBaseConfigSha256(baseline.requestConfigJson) === transcriptProviderBaseConfigSha256(terminology.requestConfigJson);
      if (!valid) {
        throw new TranscriptEvaluationRunError("Candidate arms do not satisfy the queued byte-matched experiment contract.", "TRANSCRIPT_EVALUATION_RUN_EVIDENCE_MISMATCH", 409);
      }
      bindings.push({ window, baseline, terminology, derivativeSha256 });
    }
    const now = new Date();
    for (const binding of bindings) {
      await tx.transcriptEvaluationRunWindow.update({
        where: { id: binding.window.id },
        data: {
          status: "COMPLETED",
          baselineCandidateId: binding.baseline.id,
          terminologyCandidateId: binding.terminology.id,
          derivativeSha256: binding.derivativeSha256,
          completedAt: now,
          failedAt: null,
          errorCode: null,
          errorMessage: null,
        },
      });
    }
    return tx.transcriptEvaluationRun.update({
      where: { id: current.id },
      data: {
        status: "COMPLETED",
        completedAt: now,
        failedAt: null,
        leaseToken: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        errorCode: null,
        errorMessage: null,
        resultJson: {
          schema: TRANSCRIPT_EVALUATION_RUN_SCHEMA,
          completedWindowCount: bindings.length,
          succeededArmCount: bindings.flatMap((binding) => [binding.baseline, binding.terminology]).filter((candidate) => candidate.outcome === "succeeded").length,
          failedArmCount: bindings.flatMap((binding) => [binding.baseline, binding.terminology]).filter((candidate) => candidate.outcome === "failed").length,
          providerSecretsPersisted: false,
          productionRoutingChanged: false,
          transcriptMutationAllowed: false,
        },
      },
      include: runInclude,
    });
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
  return { ok: true, run: publicRun(completed) };
}

export async function failTranscriptEvaluationRun(input: {
  prisma: any;
  actor: TranscriptEvaluationActor;
  runId: string;
  leaseToken: string;
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
}) {
  const run = await ownedProcessingRun(input);
  const errorCode = safeId(input.errorCode, "errorCode");
  const errorMessage = text(input.errorMessage).slice(0, 2_000);
  if (!errorMessage) throw new TranscriptEvaluationRunError("errorMessage is required.", "TRANSCRIPT_EVALUATION_RUN_FAILURE_INVALID");
  const now = new Date();
  const result = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `transcript-evaluation-run:${run.id}`);
    const current = await tx.transcriptEvaluationRun.findUnique({ where: { id: run.id }, include: runInclude });
    if (!current || current.status !== "PROCESSING" || current.leaseToken !== run.leaseToken) {
      throw new TranscriptEvaluationRunError("The evaluation worker no longer owns this lease.", "TRANSCRIPT_EVALUATION_RUN_LEASE_LOST", 409);
    }
    if (!current.leaseExpiresAt || current.leaseExpiresAt.getTime() <= now.getTime()) {
      throw new TranscriptEvaluationRunError("The evaluation worker lease expired and must be reclaimed.", "TRANSCRIPT_EVALUATION_RUN_LEASE_EXPIRED", 409);
    }
    const retry = input.retryable && current.attemptCount < current.maxAttempts;
    const updated = await tx.transcriptEvaluationRun.update({
      where: { id: current.id },
      data: {
        status: retry ? "QUEUED" : "FAILED",
        leaseToken: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        failedAt: retry ? null : now,
        errorCode,
        errorMessage,
        windows: {
          updateMany: {
            where: { status: "PROCESSING" },
            data: {
              status: retry ? "QUEUED" : "FAILED",
              failedAt: retry ? null : now,
              errorCode,
              errorMessage,
            },
          },
        },
      },
      include: runInclude,
    });
    return { retry, updated };
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 20_000 });
  return { ok: true, retryQueued: result.retry, run: publicRun(result.updated) };
}

export async function retryTranscriptEvaluationRun(input: {
  prisma: any;
  actor: TranscriptEvaluationActor;
  runId: string;
}) {
  const runId = safeId(input.runId, "runId");
  const existing = await input.prisma.transcriptEvaluationRun.findFirst({
    where: { id: runId, ...runActorAccess(input.actor) },
    include: runInclude,
  });
  if (!existing) throw new TranscriptEvaluationRunError("Evaluation run not found or not retryable by this account.", "TRANSCRIPT_EVALUATION_RUN_NOT_FOUND", 404);
  if (existing.status !== "FAILED") throw new TranscriptEvaluationRunError("Only a failed run can be requeued.", "TRANSCRIPT_EVALUATION_RUN_NOT_FAILED", 409);
  if (existing.attemptCount >= existing.maxAttempts) throw new TranscriptEvaluationRunError("This run exhausted its retry budget; queue a new explicit experiment.", "TRANSCRIPT_EVALUATION_RUN_RETRY_EXHAUSTED", 409);
  const updated = await input.prisma.transcriptEvaluationRun.update({
    where: { id: existing.id },
    data: {
      status: "QUEUED",
      failedAt: null,
      errorCode: null,
      errorMessage: null,
      windows: { updateMany: { where: { status: "FAILED" }, data: { status: "QUEUED", failedAt: null, errorCode: null, errorMessage: null } } },
    },
    include: runInclude,
  });
  return { ok: true, run: publicRun(updated) };
}
