import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  buildAudioAlignmentCloudManifestObjectName,
  buildAudioAlignmentCloudResultObjectName,
  newSessionAudioAlignmentJob,
  parseAudioAlignmentCloudManifest,
  parseAudioAlignmentResult,
  parseSessionAudioAlignmentJob,
  type AudioAlignmentEvidence,
  type SessionAudioAlignmentJob,
} from "@high-ground/quipsly-media-processing";

import { getMediaBucket } from "@/lib/server/gcs";
import { sessionMutationActorAccessWhere, sessionActorAccessWhere } from "@/lib/server/session-access";
import { ensureSessionAudioSourceAlignmentCloudQueued } from "@/lib/server/audio-source-alignment-cloud";
import {
  sessionProtectedPlaybackBinding,
  type SessionProtectedPlaybackBinding,
} from "@/lib/server/session-protected-playback";

const STATUS = ["queued", "processing", "output-ready", "completed", "failed"] as const;

export class SessionSourceAlignmentError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SessionSourceAlignmentError";
  }
}

export type SessionSourceAlignmentPlan = {
  captureGroupId: string;
  spineRecordingAssetId: string;
  targetRecordingAssetId: string;
  clockAuthority: "capture-clock-proposal" | "reported-wall-clock-fallback";
  initialOffsetSeconds: number;
  overlapStartSeconds: number;
  overlapEndSeconds: number;
  proposal: SessionAudioAlignmentJob["proposal"];
  boundaries: {
    exactSourceBytesBound: true;
    sourceTimesMutated: false;
    sampleAccurateClaimed: false;
    resultIsReviewEvidenceOnly: true;
  };
};

export type PublicSessionSourceAlignment = {
  jobId: string;
  status: "queued" | "processing" | "output-ready" | "completed" | "blocked" | "failed";
  spineRecordingAssetId: string;
  targetRecordingAssetId: string;
  clockAuthority: SessionSourceAlignmentPlan["clockAuthority"] | null;
  evidence: AudioAlignmentEvidence | null;
  error: string | null;
  updatedAt: string | null;
  boundaries: {
    exactSourceBytesBound: true;
    sourceBytesImmutable: true;
    sourceTimesMutated: false;
    placementApplied: false;
    placementRequiresSeparateReview: true;
    sampleAccurateClaimed: false;
  };
};

type Actor = {
  id: string;
  email?: string | null;
  primaryEmail?: string | null;
  isStaff?: boolean;
};

type Candidate = {
  id: string;
  roomId: string;
  durationSeconds: number | null;
  recordedStartedAt: Date | string | null;
  localManifestJson: unknown;
  playback: SessionProtectedPlaybackBinding;
};

export function buildSessionSourceAlignmentPlan(input: {
  captureGroupId: string;
  spine: Candidate;
  target: Candidate;
}): SessionSourceAlignmentPlan {
  if (input.spine.id === input.target.id) {
    throw new SessionSourceAlignmentError(400, "ALIGNMENT_SOURCES_IDENTICAL", "Choose two different participant recordings.");
  }
  if (input.spine.roomId !== input.target.roomId) {
    throw new SessionSourceAlignmentError(409, "ALIGNMENT_ROOM_MISMATCH", "Both recordings must belong to the same private Session.");
  }
  const spineDuration = positive(input.spine.durationSeconds);
  const targetDuration = positive(input.target.durationSeconds);
  if (spineDuration === null || targetDuration === null) {
    throw new SessionSourceAlignmentError(409, "ALIGNMENT_DURATION_REQUIRED", "Both verified recordings need measured duration before waveform alignment.");
  }
  const spineClock = captureClock(input.spine.localManifestJson, input.captureGroupId);
  const targetClock = captureClock(input.target.localManifestJson, input.captureGroupId);
  const spineWall = dateMilliseconds(input.spine.recordedStartedAt);
  const targetWall = dateMilliseconds(input.target.recordedStartedAt);
  const clockAuthority = spineClock !== null && targetClock !== null
    ? "capture-clock-proposal" as const
    : "reported-wall-clock-fallback" as const;
  const spineStart = spineClock?.startedAtMilliseconds ?? spineWall;
  const targetStart = targetClock?.startedAtMilliseconds ?? targetWall;
  if (spineStart === null || targetStart === null) {
    throw new SessionSourceAlignmentError(409, "ALIGNMENT_CLOCK_REQUIRED", "The Session needs a capture-clock proposal or retained source start times before correlation.");
  }

  // For a target window at t, the matching spine window is expected at
  // t + initialOffset. A positive value means the target began later.
  const initialOffsetSeconds = rounded((targetStart - spineStart) / 1_000);
  const windowSeconds = Math.min(6, Math.max(2, Math.floor(Math.min(spineDuration, targetDuration) / 6)));
  const uncertaintyMilliseconds = Math.max(
    spineClock?.uncertaintyMilliseconds ?? 1_000,
    targetClock?.uncertaintyMilliseconds ?? 1_000,
  );
  const searchRadiusSeconds = rounded(Math.min(30, Math.max(1, uncertaintyMilliseconds / 1_000 + 0.75)));
  const overlapStartSeconds = Math.max(0, -initialOffsetSeconds);
  const overlapEndSeconds = Math.min(targetDuration, spineDuration - initialOffsetSeconds);
  const usableStart = overlapStartSeconds + Math.min(1, Math.max(0, (overlapEndSeconds - overlapStartSeconds) / 20));
  const usableEnd = overlapEndSeconds - windowSeconds;
  if (usableEnd - usableStart < Math.max(2, windowSeconds / 2)) {
    throw new SessionSourceAlignmentError(409, "ALIGNMENT_OVERLAP_TOO_SHORT", "The retained sources do not share enough verified duration for two separated waveform checks.");
  }
  const openingTargetSeconds = rounded(usableStart);
  const laterTargetSeconds = rounded(Math.max(
    openingTargetSeconds + Math.max(2, windowSeconds / 2),
    usableEnd - Math.min(1, Math.max(0, (usableEnd - usableStart) / 20)),
  ));
  return {
    captureGroupId: input.captureGroupId,
    spineRecordingAssetId: input.spine.id,
    targetRecordingAssetId: input.target.id,
    clockAuthority,
    initialOffsetSeconds,
    overlapStartSeconds: rounded(overlapStartSeconds),
    overlapEndSeconds: rounded(overlapEndSeconds),
    proposal: {
      initialOffsetSeconds,
      openingTargetSeconds,
      laterTargetSeconds,
      windowSeconds,
      searchRadiusSeconds,
      sampleRate: 12_000,
      minimumCorrelation: 0.78,
      minimumPeakMargin: 0.04,
    },
    boundaries: {
      exactSourceBytesBound: true,
      sourceTimesMutated: false,
      sampleAccurateClaimed: false,
      resultIsReviewEvidenceOnly: true,
    },
  };
}

export async function readSessionSourceAlignments(input: {
  prisma: any;
  roomId: string;
  actor: Actor;
}) {
  const room = await input.prisma.callRoom.findFirst({
    where: { id: input.roomId, ...sessionActorAccessWhere(input.actor) },
    select: { id: true, captureGroupId: true },
  });
  if (!room) throw new SessionSourceAlignmentError(404, "SESSION_NOT_FOUND", "This private Session is unavailable to this account.");
  const rows = await input.prisma.sessionAudioAlignmentJob.findMany({
    where: { roomId: room.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
  });
  return {
    captureGroupId: room.captureGroupId,
    alignments: rows.map(publicStatus),
    boundaries: readBoundaries(),
  };
}

export async function queueSessionSourceAlignment(input: {
  prisma: any;
  roomId: string;
  spineRecordingAssetId: string;
  targetRecordingAssetId: string;
  actor: Actor;
}) {
  const context = await loadContext(input);
  const plan = buildSessionSourceAlignmentPlan({
    captureGroupId: context.room.captureGroupId,
    spine: context.spine,
    target: context.target,
  });
  const jobId = `session_alignment_${randomUUID().replaceAll("-", "")}`;
  const job = newSessionAudioAlignmentJob({
    jobId,
    roomId: context.room.id,
    captureGroupId: context.room.captureGroupId,
    requestedByUserId: input.actor.id,
    requestedByEmail: actorEmail(input.actor),
    queuedAt: new Date().toISOString(),
    spine: sourceBinding(context.spine.playback),
    target: sourceBinding(context.target.playback),
    proposal: plan.proposal,
  });
  const recent = await input.prisma.sessionAudioAlignmentJob.findFirst({
    where: {
      roomId: context.room.id,
      spineRecordingAssetId: context.spine.id,
      targetRecordingAssetId: context.target.id,
      status: { not: "failed" },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (recent) {
    try {
      const existing = parseSessionAudioAlignmentJob(recent.inputJson, recent.id);
      if (sameRequest(existing, job)) return queueCloud(input.prisma, recent, plan.clockAuthority);
    } catch {
      // A malformed or differently bound row cannot own this exact request.
    }
  }
  const saved = await input.prisma.sessionAudioAlignmentJob.create({
    data: {
      id: job.jobId,
      roomId: context.room.id,
      spineRecordingAssetId: context.spine.id,
      targetRecordingAssetId: context.target.id,
      requestedByUserId: input.actor.id,
      requestedByEmail: actorEmail(input.actor),
      status: "queued",
      inputJson: json({ ...job, sessionPlan: plan }),
    },
  });
  return queueCloud(input.prisma, saved, plan.clockAuthority);
}

export async function reconcileSessionSourceAlignment(input: {
  prisma: any;
  roomId: string;
  jobId: string;
  actor: Actor;
}) {
  const room = await input.prisma.callRoom.findFirst({
    where: { id: input.roomId, ...sessionMutationActorAccessWhere(input.actor) },
    select: { id: true },
  });
  if (!room) throw new SessionSourceAlignmentError(404, "SESSION_NOT_FOUND", "This private Session is unavailable to this account.");
  const row = await input.prisma.sessionAudioAlignmentJob.findFirst({ where: { id: input.jobId, roomId: room.id } });
  if (!row) throw new SessionSourceAlignmentError(404, "ALIGNMENT_NOT_FOUND", "That Session alignment job is unavailable.");
  const job = parseSessionAudioAlignmentJob(row.inputJson, row.id);
  const cloud = await ensureSessionAudioSourceAlignmentCloudQueued({ prisma: input.prisma, processingJob: row });
  const refreshed = await input.prisma.sessionAudioAlignmentJob.findUnique({ where: { id: row.id } }) ?? row;
  if (cloud.status === "configuration-required" || cloud.status === "failed") return publicStatus(refreshed, cloud.status === "configuration-required");
  const bucket = getMediaBucket(cloud.bucketName);
  const storedManifest = await loadGcsJson(bucket, buildAudioAlignmentCloudManifestObjectName(job.jobId));
  if (!storedManifest) return publicStatus(refreshed);
  const manifest = parseAudioAlignmentCloudManifest(storedManifest.value, job.jobId);
  if (manifest.status === "failed-terminal") {
    const failed = await input.prisma.sessionAudioAlignmentJob.update({
      where: { id: job.jobId },
      data: { status: "failed", error: `${manifest.failure?.code}: ${manifest.failure?.message}`.slice(0, 4_000), completedAt: new Date(manifest.failure?.failedAt || manifest.updatedAt) },
    });
    return publicStatus(failed);
  }
  if (manifest.status !== "completed") return publicStatus(refreshed);
  const storedResult = await loadGcsJson(bucket, buildAudioAlignmentCloudResultObjectName(job.jobId));
  if (!storedResult) return publicStatus(refreshed);
  const result = parseAudioAlignmentResult(storedResult.value, job);
  const context = await loadContext({
    prisma: input.prisma,
    roomId: input.roomId,
    spineRecordingAssetId: job.spine.assetId,
    targetRecordingAssetId: job.target.assetId,
    actor: input.actor,
  });
  if (!sameBinding(job.spine, sourceBinding(context.spine.playback)) || !sameBinding(job.target, sourceBinding(context.target.playback))) {
    throw new SessionSourceAlignmentError(409, "ALIGNMENT_SOURCE_CHANGED", "A retained Session source changed before alignment evidence registration.");
  }
  const completed = await input.prisma.sessionAudioAlignmentJob.update({
    where: { id: job.jobId },
    data: {
      status: "completed",
      completedAt: new Date(result.completedAt),
      error: null,
      resultJson: json({
        state: "completed",
        receipt: result,
        registration: {
          exactSourceBytesBound: true,
          sourceTimesMutated: false,
          placementApplied: false,
          placementRequiresSeparateReview: true,
          cloudManifestGeneration: storedManifest.generation,
          cloudResultGeneration: storedResult.generation,
        },
      }),
    },
  });
  return publicStatus(completed);
}

async function loadContext(input: {
  prisma: any;
  roomId: string;
  spineRecordingAssetId: string;
  targetRecordingAssetId: string;
  actor: Actor;
}) {
  const room = await input.prisma.callRoom.findFirst({
    where: { id: input.roomId, ...sessionMutationActorAccessWhere(input.actor) },
    select: { id: true, captureGroupId: true },
  });
  if (!room) throw new SessionSourceAlignmentError(404, "SESSION_NOT_FOUND", "This private Session is unavailable to this account.");
  const assetIds = [...new Set([input.spineRecordingAssetId, input.targetRecordingAssetId])];
  if (assetIds.length !== 2 || assetIds.some((id) => !text(id))) {
    throw new SessionSourceAlignmentError(400, "ALIGNMENT_SOURCES_REQUIRED", "Choose two different verified Session sources.");
  }
  const [assets, receipts] = await Promise.all([
    input.prisma.recordingAsset.findMany({
      where: { id: { in: assetIds }, roomId: room.id },
      select: {
        id: true, roomId: true, durationSeconds: true, recordedStartedAt: true,
        localManifestJson: true, status: true, contentType: true, byteSize: true,
        checksum: true, storageBucket: true, storageObjectPath: true, verifiedAt: true,
      },
    }),
    input.prisma.mobileCaptureFinalizationReceipt.findMany({
      where: { recordingAssetId: { in: assetIds }, processingDisposition: "RELEASED" },
      orderBy: [{ releasedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const candidate = (assetId: string): Candidate => {
    const asset = assets.find((row: any) => row.id === assetId);
    const receipt = receipts.find((row: any) => row.recordingAssetId === assetId);
    const playback = asset ? sessionProtectedPlaybackBinding({ roomId: room.id, asset, receipt }) : null;
    if (!asset || !playback) {
      throw new SessionSourceAlignmentError(409, "ALIGNMENT_SOURCE_UNVERIFIED", "Waveform alignment requires two released, exact-byte-verified Session recordings.");
    }
    const manifest = object(asset.localManifestJson);
    const sourceCaptureGroupId = text(manifest.captureGroupId) || text(object(manifest.alignment).captureGroupId);
    if (sourceCaptureGroupId !== room.captureGroupId) {
      throw new SessionSourceAlignmentError(409, "ALIGNMENT_TAKE_MISMATCH", "Both recordings must belong to this exact Session take before waveform alignment.");
    }
    return { ...asset, playback };
  };
  return {
    room,
    spine: candidate(input.spineRecordingAssetId),
    target: candidate(input.targetRecordingAssetId),
  };
}

async function queueCloud(prisma: any, row: any, clockAuthority: SessionSourceAlignmentPlan["clockAuthority"]) {
  const cloud = await ensureSessionAudioSourceAlignmentCloudQueued({ prisma, processingJob: row });
  const refreshed = await prisma.sessionAudioAlignmentJob.findUnique({ where: { id: row.id } }) ?? row;
  const value = publicStatus(refreshed, cloud.status === "configuration-required");
  return { ...value, clockAuthority };
}

function publicStatus(row: any, blocked = false): PublicSessionSourceAlignment {
  let job: SessionAudioAlignmentJob | null = null;
  let result: ReturnType<typeof parseAudioAlignmentResult> | null = null;
  try { job = parseSessionAudioAlignmentJob(row.inputJson, row.id); } catch { /* fail closed */ }
  try { if (job) result = parseAudioAlignmentResult(object(row.resultJson).receipt, job); } catch { /* fail closed */ }
  const declared = STATUS.includes(row.status) ? row.status : "failed";
  const integrityFailure = !job || ((declared === "output-ready" || declared === "completed") && !result);
  const plan = object(object(row.inputJson).sessionPlan);
  return {
    jobId: text(row.id),
    status: integrityFailure ? "failed" : blocked ? "blocked" : declared,
    spineRecordingAssetId: job?.spine.assetId ?? text(row.spineRecordingAssetId),
    targetRecordingAssetId: job?.target.assetId ?? text(row.targetRecordingAssetId),
    clockAuthority: plan.clockAuthority === "capture-clock-proposal" || plan.clockAuthority === "reported-wall-clock-fallback" ? plan.clockAuthority : null,
    evidence: result?.evidence ?? null,
    error: integrityFailure
      ? "Session audio alignment evidence failed integrity validation."
      : blocked
        ? "Exact-source alignment is retained, but the media processor execution control is not configured."
        : text(row.error) || null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    boundaries: readBoundaries(),
  };
}

function sourceBinding(binding: SessionProtectedPlaybackBinding) {
  return {
    assetId: binding.recordingAssetId,
    provider: "gcs" as const,
    locator: `gcs://${binding.bucketName}/${binding.objectName}?generation=${binding.generation}`,
    generation: binding.generation,
    sha256: binding.sha256,
    sizeBytes: binding.byteSize,
    contentType: binding.contentType,
  };
}

function captureClock(value: unknown, captureGroupId: string) {
  const alignment = object(object(value).alignment);
  const startedAtMilliseconds = dateMilliseconds(alignment.estimatedServerStartedAt);
  const uncertaintyMilliseconds = finiteNonnegative(alignment.uncertaintyMilliseconds);
  if (
    alignment.schema !== "quipsly-capture-alignment-proposal-v1"
    || alignment.status !== "proposal-ready"
    || text(alignment.captureGroupId) !== captureGroupId
    || startedAtMilliseconds === null
    || uncertaintyMilliseconds === null
    || alignment.sampleAccurateClaimed !== false
    || alignment.reviewRequired !== true
  ) return null;
  return { startedAtMilliseconds, uncertaintyMilliseconds };
}

function sameRequest(left: SessionAudioAlignmentJob, right: SessionAudioAlignmentJob) {
  return JSON.stringify({ spine: left.spine, target: left.target, proposal: left.proposal })
    === JSON.stringify({ spine: right.spine, target: right.target, proposal: right.proposal });
}

function sameBinding(left: SessionAudioAlignmentJob["spine"], right: SessionAudioAlignmentJob["spine"]) {
  return left.assetId === right.assetId && left.provider === right.provider && left.locator === right.locator
    && left.generation === right.generation && left.sha256 === right.sha256
    && left.sizeBytes === right.sizeBytes && left.contentType === right.contentType;
}

async function loadGcsJson(bucket: any, objectName: string) {
  try {
    const [metadata] = await bucket.file(objectName).getMetadata();
    const generation = text(metadata.generation);
    if (!/^[1-9][0-9]*$/.test(generation)) throw new Error("Session alignment cloud object lacks an immutable generation.");
    const [raw] = await bucket.file(objectName, { generation }).download({ validation: "crc32c" });
    return { value: JSON.parse(raw.toString("utf8")) as unknown, generation };
  } catch (error) {
    if (Number((error as { code?: unknown }).code) === 404) return null;
    throw error;
  }
}

function readBoundaries() {
  return {
    exactSourceBytesBound: true as const,
    sourceBytesImmutable: true as const,
    sourceTimesMutated: false as const,
    placementApplied: false as const,
    placementRequiresSeparateReview: true as const,
    sampleAccurateClaimed: false as const,
  };
}

function actorEmail(actor: Actor) {
  const value = text(actor.primaryEmail || actor.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new SessionSourceAlignmentError(409, "ACTOR_EMAIL_REQUIRED", "This account needs a verified email before requesting private media processing.");
  }
  return value;
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function positive(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function finiteNonnegative(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
function dateMilliseconds(value: unknown) { const parsed = value instanceof Date ? value.getTime() : Date.parse(text(value)); return Number.isFinite(parsed) ? parsed : null; }
function rounded(value: number) { return Math.round(value * 1_000_000) / 1_000_000; }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
