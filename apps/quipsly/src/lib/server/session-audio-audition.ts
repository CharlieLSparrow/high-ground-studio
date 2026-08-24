import "server-only";

import { createHash } from "node:crypto";

import {
  SESSION_AUDIO_AUDITION_PROFILE,
  SESSION_AUDIO_AUDITION_QUEUE_KIND,
  buildSessionAudioAuditionManifestObjectName,
  buildSessionAudioAuditionQueueObjectName,
  buildSessionAudioAuditionResultObjectName,
  buildSessionAudioAuditionTargetObjectName,
  newSessionAudioAuditionManifest,
  parseSessionAudioAuditionManifest,
  parseSessionAudioAuditionQueueReceipt,
  parseSessionAudioAuditionResult,
  type SessionAudioAuditionManifest,
  type SessionAudioAuditionQueueReceipt,
  type SessionAudioAuditionResult,
} from "@high-ground/quipsly-media-processing";

import { getMediaBucket, requireMediaBucketName } from "@/lib/server/gcs";
import {
  mediaProcessorEnabled,
  mediaProcessorExecutionRequestIsRecent,
  requestMediaProcessorExecution,
} from "@/lib/server/media-processor-control";
import { sessionAccessWhere } from "@/lib/server/session-access";
import {
  sessionProtectedPlaybackBinding,
  type SessionProtectedPlaybackBinding,
} from "@/lib/server/session-protected-playback";

export class SessionAudioAuditionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SessionAudioAuditionError";
  }
}

export type SessionAudioAuditionPublicState = {
  state: "NOT_REQUIRED" | "QUEUED" | "PROCESSING" | "READY" | "HELD" | "FAILED";
  recordingAssetId: string;
  jobId: string | null;
  reason: string | null;
  derivative: null | {
    schema: "quipsly-session-audio-audition-v1";
    profile: typeof SESSION_AUDIO_AUDITION_PROFILE;
    recordingAssetId: string;
    sourceSha256: string;
    sourceGeneration: string;
    url: string;
    sha256: string;
    byteSize: number;
    durationSeconds: number;
    contentType: "audio/mp4";
  };
};

type Actor = {
  id: string;
  email?: string | null;
  primaryEmail?: string | null;
};

export async function prepareSessionAudioAudition(input: {
  prisma: any;
  roomId: string;
  recordingAssetId: string;
  actor: Actor;
}) {
  const context = await loadContext(input);
  if (context.playback.kind === "audio") return notRequired(context.playback);

  const desired = desiredManifest({
    playback: context.playback,
    sourceDurationSeconds: context.asset.durationSeconds,
    finalizationUploadSessionId: context.receipt.uploadSessionId,
    actor: input.actor,
  });
  const existing = await input.prisma.sessionAudioAuditionJob.findUnique({
    where: { id: desired.jobId },
  });
  if (existing) assertDatabaseBinding(existing, desired);
  else {
    try {
      await input.prisma.sessionAudioAuditionJob.create({
        data: {
          id: desired.jobId,
          roomId: desired.roomId,
          recordingAssetId: desired.source.recordingAssetId,
          requestedByUserId: desired.requestedByUserId,
          requestedByEmail: desired.requestedByEmail,
          status: "queued",
          inputJson: desired,
        },
      });
    } catch (error) {
      const raced = await input.prisma.sessionAudioAuditionJob.findUnique({
        where: { id: desired.jobId },
      });
      if (!raced) throw error;
      assertDatabaseBinding(raced, desired);
    }
  }
  await ensureCloudQueued({ prisma: input.prisma, manifest: desired });
  return reconcileSessionAudioAudition(input);
}

export async function reconcileSessionAudioAudition(input: {
  prisma: any;
  roomId: string;
  recordingAssetId: string;
  actor: Actor;
}): Promise<SessionAudioAuditionPublicState> {
  const context = await loadContext(input);
  if (context.playback.kind === "audio") return notRequired(context.playback);
  const jobId = jobIdFor(context.playback);
  const row = await input.prisma.sessionAudioAuditionJob.findFirst({
    where: {
      id: jobId,
      roomId: context.room.id,
      recordingAssetId: context.asset.id,
    },
  });
  if (!row)
    return {
      state: "HELD",
      recordingAssetId: context.asset.id,
      jobId,
      reason: "Prepare the compact audio review copy first.",
      derivative: null,
    };
  const manifest = parseSessionAudioAuditionManifest(row.inputJson, row.id);
  assertManifestMatchesCurrentSource(
    manifest,
    context.playback,
    context.receipt.uploadSessionId,
    context.asset.durationSeconds,
  );
  const queued = await ensureCloudQueued({ prisma: input.prisma, manifest });
  const refreshed =
    (await input.prisma.sessionAudioAuditionJob.findUnique({
      where: { id: row.id },
    })) ?? row;
  if (queued.status === "configuration-required")
    return publicRow(
      refreshed,
      "HELD",
      "The private media worker is not configured.",
    );

  const bucket = getMediaBucket(manifest.source.bucketName);
  const storedManifest = await loadJson(
    bucket,
    buildSessionAudioAuditionManifestObjectName(manifest.jobId),
  );
  const cloudManifest = parseSessionAudioAuditionManifest(
    storedManifest.value,
    manifest.jobId,
  );
  if (cloudManifest.status === "failed-terminal") {
    const failed = await input.prisma.sessionAudioAuditionJob.update({
      where: { id: row.id },
      data: {
        status: "failed",
        error:
          `${cloudManifest.failure?.code}: ${cloudManifest.failure?.message}`.slice(
            0,
            4_000,
          ),
        completedAt: new Date(
          cloudManifest.failure?.failedAt || cloudManifest.updatedAt,
        ),
      },
    });
    return publicRow(
      failed,
      "FAILED",
      failed.error || "Audio review preparation failed.",
    );
  }
  if (cloudManifest.status !== "completed")
    return publicRow(
      refreshed,
      cloudManifest.status === "processing" ? "PROCESSING" : "QUEUED",
      null,
    );

  const storedResult = await loadJson(
    bucket,
    buildSessionAudioAuditionResultObjectName(manifest.jobId),
  );
  const result = parseSessionAudioAuditionResult(
    storedResult.value,
    cloudManifest,
  );
  assertManifestMatchesCurrentSource(
    cloudManifest,
    context.playback,
    context.receipt.uploadSessionId,
    context.asset.durationSeconds,
  );
  const completed = await input.prisma.sessionAudioAuditionJob.update({
    where: { id: row.id },
    data: {
      status: "completed",
      error: null,
      completedAt: new Date(result.completedAt),
      resultJson: {
        schema: "quipsly-session-audio-audition-registration-v1",
        receipt: result,
        manifestGeneration: storedManifest.generation,
        resultGeneration: storedResult.generation,
        originalRemainsSourceTruth: true,
      },
    },
  });
  return readyState(completed, result);
}

export async function resolveSessionAudioAuditionBinding(input: {
  prisma: any;
  roomId: string;
  recordingAssetId: string;
  actor: Actor;
}) {
  const context = await loadContext(input);
  if (context.playback.kind !== "video")
    throw new SessionAudioAuditionError(
      409,
      "AUDITION_NOT_REQUIRED",
      "This source is already audio-only.",
    );
  const row = await input.prisma.sessionAudioAuditionJob.findUnique({
    where: { id: jobIdFor(context.playback) },
  });
  if (!row || row.status !== "completed")
    throw new SessionAudioAuditionError(
      409,
      "AUDITION_NOT_READY",
      "The compact audio review copy is still being prepared.",
    );
  const manifest = parseSessionAudioAuditionManifest(row.inputJson, row.id);
  assertManifestMatchesCurrentSource(
    manifest,
    context.playback,
    context.receipt.uploadSessionId,
    context.asset.durationSeconds,
  );
  const registration = object(row.resultJson);
  const result = parseSessionAudioAuditionResult(
    object(registration.receipt),
    manifest,
  );
  return { context, manifest, result };
}

function desiredManifest(input: {
  playback: SessionProtectedPlaybackBinding;
  sourceDurationSeconds: number;
  finalizationUploadSessionId: string;
  actor: Actor;
}) {
  const requestedByEmail = text(
    input.actor.email || input.actor.primaryEmail,
  ).toLowerCase();
  if (!requestedByEmail)
    throw new SessionAudioAuditionError(
      401,
      "ACTOR_EMAIL_REQUIRED",
      "A verified account email is required.",
    );
  const jobId = jobIdFor(input.playback);
  const now = new Date().toISOString();
  return newSessionAudioAuditionManifest({
    jobId,
    roomId: input.playback.roomId,
    requestedByUserId: input.actor.id,
    requestedByEmail,
    source: {
      bucketName: input.playback.bucketName,
      objectName: input.playback.objectName,
      generation: input.playback.generation,
      sizeBytes: input.playback.byteSize,
      sha256: input.playback.sha256,
      contentType: input.playback.contentType,
      durationSeconds: input.sourceDurationSeconds,
      roomId: input.playback.roomId,
      recordingAssetId: input.playback.recordingAssetId,
      finalizationUploadSessionId: input.finalizationUploadSessionId,
    },
    target: {
      bucketName: input.playback.bucketName,
      objectName: buildSessionAudioAuditionTargetObjectName({
        roomId: input.playback.roomId,
        recordingAssetId: input.playback.recordingAssetId,
        jobId,
      }),
      contentType: "audio/mp4",
      profile: SESSION_AUDIO_AUDITION_PROFILE,
    },
    queuedAt: now,
    updatedAt: now,
  });
}

async function loadContext(input: {
  prisma: any;
  roomId: string;
  recordingAssetId: string;
  actor: Actor;
}) {
  const room = await input.prisma.callRoom.findFirst({
    where: sessionAccessWhere(input.roomId, input.actor),
    select: {
      id: true,
      recordingAssets: {
        where: { id: input.recordingAssetId },
        take: 1,
        select: {
          id: true,
          roomId: true,
          status: true,
          contentType: true,
          byteSize: true,
          durationSeconds: true,
          storageBucket: true,
          storageObjectPath: true,
          checksum: true,
          verifiedAt: true,
          localManifestJson: true,
        },
      },
    },
  });
  const asset = room?.recordingAssets?.[0];
  if (!room || !asset)
    throw new SessionAudioAuditionError(
      404,
      "SOURCE_NOT_FOUND",
      "This private Session recording is unavailable.",
    );
  if (!Number.isFinite(asset.durationSeconds) || asset.durationSeconds <= 0)
    throw new SessionAudioAuditionError(
      409,
      "SOURCE_DURATION_REQUIRED",
      "The retained camera source does not yet have verified duration evidence.",
    );
  const receipt = await input.prisma.mobileCaptureFinalizationReceipt.findFirst(
    {
      where: { roomId: room.id, recordingAssetId: asset.id },
      orderBy: { updatedAt: "desc" },
      select: {
        roomId: true,
        recordingAssetId: true,
        uploadSessionId: true,
        processingDisposition: true,
        metadataJson: true,
      },
    },
  );
  const playback = sessionProtectedPlaybackBinding({
    roomId: room.id,
    asset,
    receipt,
  });
  if (!playback)
    throw new SessionAudioAuditionError(
      409,
      "SOURCE_EVIDENCE_MISMATCH",
      "The retained source no longer matches its exact finalization receipt.",
    );
  if (playback.bucketName !== requireMediaBucketName())
    throw new SessionAudioAuditionError(
      409,
      "SOURCE_VAULT_MISMATCH",
      "The retained source is outside the configured private media vault.",
    );
  return { room, asset, receipt, playback };
}

async function ensureCloudQueued(input: {
  prisma: any;
  manifest: SessionAudioAuditionManifest;
}) {
  const bucket = getMediaBucket(input.manifest.source.bucketName);
  const manifestObjectName = buildSessionAudioAuditionManifestObjectName(
    input.manifest.jobId,
  );
  const queueObjectName = buildSessionAudioAuditionQueueObjectName(
    input.manifest.jobId,
  );
  const stored = await saveIfAbsent(
    bucket,
    manifestObjectName,
    input.manifest,
    { quipslyKind: input.manifest.kind, quipslyJobId: input.manifest.jobId },
  );
  const canonical = parseSessionAudioAuditionManifest(
    stored.value,
    input.manifest.jobId,
  );
  assertSameManifestBinding(canonical, input.manifest);
  if (
    canonical.status !== "completed" &&
    canonical.status !== "failed-terminal"
  ) {
    const receipt: SessionAudioAuditionQueueReceipt = {
      kind: SESSION_AUDIO_AUDITION_QUEUE_KIND,
      version: 1,
      jobId: canonical.jobId,
      manifestObjectName,
      manifestGeneration: stored.generation,
      enqueuedAt: canonical.queuedAt,
    };
    const queue = await saveIfAbsent(bucket, queueObjectName, receipt, {
      quipslyKind: receipt.kind,
      quipslyJobId: receipt.jobId,
    });
    const canonicalQueue = parseSessionAudioAuditionQueueReceipt(queue.value);
    if (canonicalQueue.manifestObjectName !== manifestObjectName)
      throw new Error(
        "Session audio audition queue points at a different manifest.",
      );
  }
  const row = await input.prisma.sessionAudioAuditionJob.findUnique({
    where: { id: canonical.jobId },
  });
  const inputJson = object(row?.inputJson);
  const control = object(inputJson.processingControl);
  await input.prisma.sessionAudioAuditionJob.update({
    where: { id: canonical.jobId },
    data: {
      status:
        canonical.status === "completed"
          ? "completed"
          : canonical.status === "failed-terminal"
            ? "failed"
            : canonical.status,
      error: canonical.failure
        ? `${canonical.failure.code}: ${canonical.failure.message}`.slice(
            0,
            4_000,
          )
        : null,
      inputJson: {
        ...inputJson,
        processingControl: {
          version: 1,
          manifestObjectName,
          manifestGeneration: stored.generation,
          queueObjectName,
          resultObjectName: buildSessionAudioAuditionResultObjectName(
            canonical.jobId,
          ),
          executionRequestedAt: text(control.executionRequestedAt) || null,
          exactSourceGenerationBound: true,
          originalRemainsSourceTruth: true,
        },
      },
    },
  });
  if (
    canonical.status === "completed" ||
    canonical.status === "failed-terminal"
  )
    return { status: canonical.status, executionRequested: false };
  if (!mediaProcessorEnabled())
    return {
      status: "configuration-required" as const,
      executionRequested: false,
    };
  if (
    mediaProcessorExecutionRequestIsRecent(
      text(control.executionRequestedAt) || null,
    )
  )
    return { status: canonical.status, executionRequested: false };
  await requestMediaProcessorExecution();
  const executionRequestedAt = new Date().toISOString();
  await input.prisma.sessionAudioAuditionJob.update({
    where: { id: canonical.jobId },
    data: {
      inputJson: {
        ...inputJson,
        processingControl: {
          version: 1,
          manifestObjectName,
          manifestGeneration: stored.generation,
          queueObjectName,
          resultObjectName: buildSessionAudioAuditionResultObjectName(
            canonical.jobId,
          ),
          executionRequestedAt,
          exactSourceGenerationBound: true,
          originalRemainsSourceTruth: true,
        },
      },
    },
  });
  return { status: canonical.status, executionRequested: true };
}

function jobIdFor(binding: SessionProtectedPlaybackBinding) {
  return `session_audition_${createHash("sha256").update([binding.roomId, binding.recordingAssetId, binding.generation, binding.sha256, SESSION_AUDIO_AUDITION_PROFILE].join("|")).digest("hex").slice(0, 40)}`;
}

function assertManifestMatchesCurrentSource(
  manifest: SessionAudioAuditionManifest,
  playback: SessionProtectedPlaybackBinding,
  uploadSessionId: string,
  sourceDurationSeconds: number,
) {
  if (
    manifest.roomId !== playback.roomId ||
    manifest.source.recordingAssetId !== playback.recordingAssetId ||
    manifest.source.bucketName !== playback.bucketName ||
    manifest.source.objectName !== playback.objectName ||
    manifest.source.generation !== playback.generation ||
    manifest.source.sizeBytes !== playback.byteSize ||
    manifest.source.sha256 !== playback.sha256 ||
    manifest.source.contentType !== playback.contentType ||
    Math.abs(manifest.source.durationSeconds - sourceDurationSeconds) > 0.001 ||
    manifest.source.finalizationUploadSessionId !== uploadSessionId
  ) {
    throw new SessionAudioAuditionError(
      409,
      "AUDITION_SOURCE_CHANGED",
      "The source changed before its audio review derivative could be used.",
    );
  }
}

function assertDatabaseBinding(
  row: any,
  desired: SessionAudioAuditionManifest,
) {
  const existing = parseSessionAudioAuditionManifest(row.inputJson, row.id);
  assertSameManifestBinding(existing, desired);
  if (
    row.roomId !== desired.roomId ||
    row.recordingAssetId !== desired.source.recordingAssetId
  )
    throw new Error("Session audio audition database binding drifted.");
}

function assertSameManifestBinding(
  left: SessionAudioAuditionManifest,
  right: SessionAudioAuditionManifest,
) {
  if (
    left.jobId !== right.jobId ||
    left.roomId !== right.roomId ||
    JSON.stringify(left.source) !== JSON.stringify(right.source) ||
    JSON.stringify(left.target) !== JSON.stringify(right.target)
  )
    throw new Error(
      "Existing Session audio audition manifest has a different immutable binding.",
    );
}

function notRequired(
  playback: SessionProtectedPlaybackBinding,
): SessionAudioAuditionPublicState {
  return {
    state: "NOT_REQUIRED",
    recordingAssetId: playback.recordingAssetId,
    jobId: null,
    reason: "The exact Session source is already audio-only.",
    derivative: null,
  };
}

function publicRow(
  row: any,
  state: SessionAudioAuditionPublicState["state"],
  reason: string | null,
): SessionAudioAuditionPublicState {
  return {
    state,
    recordingAssetId: row.recordingAssetId,
    jobId: row.id,
    reason,
    derivative: null,
  };
}

function readyState(
  row: any,
  result: SessionAudioAuditionResult,
): SessionAudioAuditionPublicState {
  return {
    state: "READY",
    recordingAssetId: row.recordingAssetId,
    jobId: row.id,
    reason: null,
    derivative: {
      schema: "quipsly-session-audio-audition-v1",
      profile: SESSION_AUDIO_AUDITION_PROFILE,
      recordingAssetId: row.recordingAssetId,
      sourceSha256: result.source.sha256,
      sourceGeneration: result.source.generation,
      url: `/api/sessions/${encodeURIComponent(row.roomId)}/recordings/${encodeURIComponent(row.recordingAssetId)}/audition/media`,
      sha256: result.output.sha256,
      byteSize: result.output.sizeBytes,
      durationSeconds: result.output.metadata.durationSeconds,
      contentType: "audio/mp4",
    },
  };
}

async function saveIfAbsent(
  bucket: any,
  name: string,
  value: unknown,
  metadata: Record<string, string>,
) {
  try {
    await bucket
      .file(name)
      .save(JSON.stringify(value), {
        resumable: false,
        validation: "crc32c",
        contentType: "application/json; charset=utf-8",
        metadata: { cacheControl: "private, no-store", metadata },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
  } catch (error) {
    if (
      ![409, 412].includes(
        Number(
          (error as { code?: unknown; status?: unknown }).code ??
            (error as { status?: unknown }).status,
        ),
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
      "Session audition control object lacks an immutable generation.",
    );
  const [raw] = await bucket
    .file(name, { generation })
    .download({ validation: "crc32c" });
  return { value: JSON.parse(raw.toString("utf8")) as unknown, generation };
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
