import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  newSessionRecordingShareJob,
  parseSessionRecordingShareResult,
} from "@high-ground/quipsly-media-processing";

import { localMobileCaptureObjectPath, MOBILE_CAPTURE_LOCAL_VAULT_BUCKET } from "./mobile-capture-local-vault";
import {
  sessionActorAccessWhere,
  sessionInvitationAccessWhere,
  type SessionAccessActor,
} from "./session-access";

export const SESSION_RECORDING_SHARE_SCHEMA = "quipsly-session-recording-share-v2";
export const SESSION_RECORDING_SHARE_MANIFEST_SCHEMA = "quipsly-session-recording-share-manifest-v1";

type RestoreClient = any;

export class SessionRecordingShareError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: Record<string, unknown>) {
    super(message);
  }
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function json<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function localRenderTarget(objectName: string) {
  try {
    return localMobileCaptureObjectPath(objectName);
  } catch {
    return null;
  }
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const OUTPUT_SELECT = {
  id: true,
  roomId: true,
  createdByUserId: true,
  recipientUserId: true,
  kind: true,
  status: true,
  title: true,
  bodyJson: true,
  sourceManifestJson: true,
  contentSha256: true,
  revision: true,
  releasedAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
  recipient: { select: { id: true, name: true, primaryEmail: true } },
  createdBy: { select: { id: true, name: true, primaryEmail: true } },
  deliveries: {
    orderBy: { occurredAt: "asc" as const },
    select: { id: true, kind: true, status: true, destination: true, occurredAt: true, contentSha256: true },
  },
};

function serializeOutput(output: any) {
  if (!output) return null;
  const body = object(output.bodyJson);
  const render = object(body.render);
  return {
    id: output.id,
    roomId: output.roomId,
    status: output.status,
    title: output.title,
    contentSha256: output.contentSha256,
    revision: output.revision,
    releasedAt: output.releasedAt?.toISOString?.() ?? output.releasedAt ?? null,
    revokedAt: output.revokedAt?.toISOString?.() ?? output.revokedAt ?? null,
    createdAt: output.createdAt.toISOString(),
    updatedAt: output.updatedAt.toISOString(),
    recipient: { id: output.recipient.id, label: output.recipient.name || output.recipient.primaryEmail || "Client" },
    createdBy: { id: output.createdBy.id, label: output.createdBy.name || output.createdBy.primaryEmail || "Coach" },
    body,
    sourceManifest: object(output.sourceManifestJson),
    render: {
      jobId: clean(render.jobId, 240) || null,
      status: clean(render.status, 40) || "NOT_REQUESTED",
      recordingAssetId: clean(render.recordingAssetId, 240) || null,
      durationSeconds: Number.isFinite(Number(render.durationSeconds)) ? Number(render.durationSeconds) : null,
      sizeBytes: Number.isSafeInteger(Number(render.sizeBytes)) ? Number(render.sizeBytes) : null,
      sha256: clean(render.sha256, 64) || null,
      completedAt: clean(render.completedAt, 80) || null,
    },
    mediaUrl: render.recordingAssetId ? `/api/sessions/${encodeURIComponent(output.roomId)}/recording-share/media/${encodeURIComponent(output.id)}` : null,
    deliveryEvents: (output.deliveries || []).map((event: any) => ({ ...event, occurredAt: event.occurredAt.toISOString() })),
  };
}

async function loadRoom(client: RestoreClient, roomId: string, actor: SessionAccessActor, authority: "read" | "release") {
  const room = await client.callRoom.findFirst({
    where: authority === "release" ? sessionInvitationAccessWhere(roomId, actor) : { id: roomId, ...sessionActorAccessWhere(actor) },
    select: {
      id: true,
      title: true,
      booking: {
        select: {
          coachUserId: true,
          clientUserId: true,
          coachUser: { select: { id: true, name: true, primaryEmail: true } },
          clientUser: { select: { id: true, name: true, primaryEmail: true } },
        },
      },
    },
  });
  if (!room?.booking?.clientUserId) {
    throw new SessionRecordingShareError(404, "RECORDING_SHARE_UNAVAILABLE", "This coaching Session does not have a recipient-bound recording workspace.");
  }
  return room;
}

function participantLabel(source: any, index: number) {
  return clean(source.participant?.displayName, 160)
    || clean(source.participant?.user?.name, 160)
    || clean(source.participant?.email, 160)
    || `Participant ${index + 1}`;
}

export function newestCoherentRecordingTake<T extends { recordedStartedAt: Date }>(rows: T[], maximumStartGapMs = 30_000) {
  const clusters: T[][] = [];
  for (const row of [...rows].sort((left, right) => left.recordedStartedAt.getTime() - right.recordedStartedAt.getTime())) {
    const latest = clusters.at(-1);
    const latestStartedAt = latest?.at(-1)?.recordedStartedAt.getTime() ?? Number.NEGATIVE_INFINITY;
    if (!latest || row.recordedStartedAt.getTime() - latestStartedAt > maximumStartGapMs) clusters.push([row]);
    else latest.push(row);
  }
  return clusters.at(-1) || [];
}

async function loadSources(client: RestoreClient, roomId: string) {
  const rows = await client.recordingAsset.findMany({
    where: {
      roomId,
      kind: { in: ["LOCAL_AUDIO", "LOCAL_VIDEO"] },
      status: "VERIFIED",
      participantId: { not: null },
      storageBucket: { not: null },
      storageObjectPath: { not: null },
      checksum: { not: null },
      byteSize: { not: null },
      recordedStartedAt: { not: null },
      recordedStoppedAt: { not: null },
    },
    orderBy: [{ recordedStartedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      participantId: true,
      kind: true,
      status: true,
      fileName: true,
      contentType: true,
      byteSize: true,
      checksum: true,
      storageBucket: true,
      storageObjectPath: true,
      recordedStartedAt: true,
      recordedStoppedAt: true,
      localManifestJson: true,
      createdAt: true,
      participant: {
        select: { id: true, userId: true, displayName: true, email: true, user: { select: { name: true } } },
      },
    },
  });
  const verified = rows.filter((row: any) => {
    const manifest = object(row.localManifestJson);
    return manifest.exactBytesVerified === true
      && /^[a-f0-9]{64}$/.test(clean(row.checksum, 64).toLowerCase())
      && Number(row.byteSize) > 0
      && row.recordedStoppedAt > row.recordedStartedAt;
  });
  // captureGroupId identifies the durable Session capture boundary and can be
  // reused across reconnects or repeated takes. A shareable take is the newest
  // time-coherent cluster of participant masters, not every source ever
  // recorded in that room. Thirty seconds tolerates normal endpoint startup
  // skew without merging separate rehearsals or calls.
  return newestCoherentRecordingTake(verified);
}

function sourceSummary(rows: any[]) {
  if (!rows.length) return { programDurationSeconds: 0, sources: [] as any[] };
  const originMs = Math.min(...rows.map((row) => row.recordedStartedAt.getTime()));
  const endMs = Math.max(...rows.map((row) => row.recordedStoppedAt.getTime()));
  return {
    programDurationSeconds: Math.max(0, (endMs - originMs) / 1_000),
    sources: rows.map((row, index) => ({
      id: row.id,
      participantId: row.participantId,
      participantLabel: participantLabel(row, index),
      kind: row.kind,
      fileName: row.fileName,
      contentType: row.contentType,
      sizeBytes: Number(row.byteSize),
      sha256: clean(row.checksum, 64).toLowerCase(),
      startedAt: row.recordedStartedAt.toISOString(),
      stoppedAt: row.recordedStoppedAt.toISOString(),
      programOffsetSeconds: (row.recordedStartedAt.getTime() - originMs) / 1_000,
    })),
  };
}

export type RecordingShareTranscriptSegment = {
  transcriptJobId: string;
  segmentId: string;
  sourceRecordingAssetId: string;
  providerTextSha256: string;
  speakerLabel: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
  cutStartSeconds: number;
  cutEndSeconds: number;
  timingFingerprint: string;
  timingBasis: "provider-words" | "provider-segment";
  cutSafety: "safe" | "timing-unavailable" | "overlapping-speech";
  cutSafetyReason: string;
};

export function classifyRecordingShareTranscriptCutSafety(
  segments: RecordingShareTranscriptSegment[],
): RecordingShareTranscriptSegment[] {
  return segments.map((segment) => {
    if (segment.cutSafety !== "safe") return { ...segment };
    const overlapsOtherSpeech = segments.some((other) => (
      other.sourceRecordingAssetId !== segment.sourceRecordingAssetId
      && Math.min(segment.cutEndSeconds, other.endSeconds) - Math.max(segment.cutStartSeconds, other.startSeconds) > 0.05
    ));
    return overlapsOtherSpeech
      ? {
          ...segment,
          cutSafety: "overlapping-speech",
          cutSafetyReason: "Another participant is speaking here. Keep the passage or use a source-aware editor so their voice is not cut.",
        }
      : { ...segment };
  });
}

async function loadTranscriptEditSegments(client: RestoreClient, roomId: string, sources: any[]): Promise<RecordingShareTranscriptSegment[]> {
  if (!sources.length) return [];
  const sourceById = new Map(sources.map((source: any, index: number) => [source.id, { source, label: participantLabel(source, index) }]));
  const originMs = Math.min(...sources.map((source: any) => source.recordedStartedAt.getTime()));
  const jobs = await client.transcriptJob.findMany({
    where: { roomId, status: "COMPLETED", assetId: { in: [...sourceById.keys()] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      assetId: true,
      sourceSha256: true,
      segments: {
        orderBy: [{ startSeconds: "asc" }, { id: "asc" }],
        select: {
          id: true,
          speakerLabel: true,
          startSeconds: true,
          endSeconds: true,
          text: true,
          words: {
            orderBy: [{ providerWordIndex: "asc" }, { id: "asc" }],
            select: {
              id: true,
              providerWordIndex: true,
              startSeconds: true,
              endSeconds: true,
              word: true,
              punctuatedWord: true,
              confidence: true,
            },
          },
          corrections: {
            where: { status: "accepted" },
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: { correctedText: true, correctedSpeakerLabel: true, baseTextSha256: true },
          },
        },
      },
    },
  });
  const chosenAssets = new Set<string>();
  const projected: RecordingShareTranscriptSegment[] = [];
  for (const job of jobs) {
    const binding = job.assetId ? sourceById.get(job.assetId) : null;
    if (!binding || chosenAssets.has(job.assetId) || clean(job.sourceSha256, 64).toLowerCase() !== clean(binding.source.checksum, 64).toLowerCase()) continue;
    chosenAssets.add(job.assetId);
    const offsetSeconds = (binding.source.recordedStartedAt.getTime() - originMs) / 1_000;
    for (const segment of job.segments) {
      const providerTextSha256 = sha256(segment.text);
      const correction = segment.corrections[0]?.baseTextSha256 === providerTextSha256 ? segment.corrections[0] : null;
      const startSeconds = offsetSeconds + Number(segment.startSeconds);
      const endSeconds = offsetSeconds + Number(segment.endSeconds);
      if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) continue;
      const providerWords = (segment.words || []).filter((word: any, index: number, words: any[]) => (
        Number.isFinite(Number(word.startSeconds))
        && Number.isFinite(Number(word.endSeconds))
        && Number(word.startSeconds) >= Number(segment.startSeconds) - 0.1
        && Number(word.endSeconds) <= Number(segment.endSeconds) + 0.1
        && Number(word.endSeconds) > Number(word.startSeconds)
        && (index === 0 || Number(word.startSeconds) >= Number(words[index - 1]?.startSeconds) - 0.02)
      ));
      const hasExactWordTiming = providerWords.length > 0 && providerWords.length === (segment.words || []).length;
      const sourceCutStartSeconds = hasExactWordTiming ? Number(providerWords[0].startSeconds) : Number(segment.startSeconds);
      const sourceCutEndSeconds = hasExactWordTiming ? Number(providerWords.at(-1).endSeconds) : Number(segment.endSeconds);
      const cutStartSeconds = offsetSeconds + sourceCutStartSeconds;
      const cutEndSeconds = offsetSeconds + sourceCutEndSeconds;
      const timingBasis = hasExactWordTiming ? "provider-words" as const : "provider-segment" as const;
      const timingFingerprint = sha256({
        schema: "quipsly-transcript-cut-timing-v1",
        transcriptJobId: job.id,
        segmentId: segment.id,
        sourceRecordingAssetId: job.assetId,
        sourceSha256: clean(job.sourceSha256, 64).toLowerCase(),
        providerTextSha256,
        timingBasis,
        sourceCutStartSeconds,
        sourceCutEndSeconds,
        words: providerWords.map((word: any) => ({
          id: word.id,
          providerWordIndex: word.providerWordIndex,
          startSeconds: Number(word.startSeconds),
          endSeconds: Number(word.endSeconds),
          word: word.word,
          punctuatedWord: word.punctuatedWord,
          confidence: word.confidence,
        })),
      });
      projected.push({
        transcriptJobId: job.id,
        segmentId: segment.id,
        sourceRecordingAssetId: job.assetId,
        providerTextSha256,
        speakerLabel: clean(correction?.correctedSpeakerLabel, 160) || clean(segment.speakerLabel, 160) || binding.label,
        text: clean(correction?.correctedText, 20_000) || clean(segment.text, 20_000),
        startSeconds,
        endSeconds,
        cutStartSeconds,
        cutEndSeconds,
        timingFingerprint,
        timingBasis,
        cutSafety: hasExactWordTiming ? "safe" : "timing-unavailable",
        cutSafetyReason: hasExactWordTiming
          ? "Word timing is bound to this exact source recording."
          : "Precise word timing is unavailable, so Quipsly will not ripple-delete this passage.",
      });
    }
  }
  return classifyRecordingShareTranscriptCutSafety(projected)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.segmentId.localeCompare(right.segmentId));
}

export function buildSessionRecordingShareEdit(input: {
  startSeconds: number;
  endSeconds: number;
  transcriptSegments: RecordingShareTranscriptSegment[];
  excludedTranscriptSegments: Array<{ transcriptJobId: string; segmentId: string; providerTextSha256: string; timingFingerprint: string }>;
}) {
  const requested = input.excludedTranscriptSegments.map((item) => ({
    transcriptJobId: clean(item.transcriptJobId, 240),
    segmentId: clean(item.segmentId, 240),
    providerTextSha256: clean(item.providerTextSha256, 64).toLowerCase(),
    timingFingerprint: clean(item.timingFingerprint, 64).toLowerCase(),
  }));
  const requestedKeys = requested.map((item) => `${item.transcriptJobId}:${item.segmentId}`);
  if (requested.length > 500 || new Set(requestedKeys).size !== requested.length) {
    throw new SessionRecordingShareError(400, "TEXT_EDIT_INVALID", "Refresh the transcript before preparing this text edit.");
  }
  const available = new Map(input.transcriptSegments.map((segment) => [`${segment.transcriptJobId}:${segment.segmentId}`, segment]));
  const transcriptExclusions = requested.map((item) => {
    const segment = available.get(`${item.transcriptJobId}:${item.segmentId}`);
    if (!segment || segment.providerTextSha256 !== item.providerTextSha256 || segment.timingFingerprint !== item.timingFingerprint) {
      throw new SessionRecordingShareError(409, "TRANSCRIPT_EDIT_STALE", "The transcript changed since this edit was chosen. Refresh before preparing the recording.");
    }
    if (segment.cutSafety !== "safe") {
      throw new SessionRecordingShareError(409, "TRANSCRIPT_EDIT_UNSAFE", segment.cutSafetyReason);
    }
    const startSeconds = Math.max(input.startSeconds, segment.cutStartSeconds);
    const endSeconds = Math.min(input.endSeconds, segment.cutEndSeconds);
    if (endSeconds <= startSeconds) {
      throw new SessionRecordingShareError(400, "TEXT_EDIT_OUTSIDE_RANGE", "A removed transcript passage is outside the selected recording range.");
    }
    return { ...segment, startSeconds, endSeconds };
  });
  const merged: Array<{ startSeconds: number; endSeconds: number }> = [];
  for (const exclusion of [...transcriptExclusions].sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)) {
    const current = merged.at(-1);
    if (current && exclusion.startSeconds <= current.endSeconds + 0.02) current.endSeconds = Math.max(current.endSeconds, exclusion.endSeconds);
    else merged.push({ startSeconds: exclusion.startSeconds, endSeconds: exclusion.endSeconds });
  }
  const kept: Array<{ startSeconds: number; endSeconds: number }> = [];
  let cursor = input.startSeconds;
  for (const exclusion of merged) {
    if (exclusion.startSeconds - cursor >= 0.05) kept.push({ startSeconds: cursor, endSeconds: exclusion.startSeconds });
    cursor = Math.max(cursor, exclusion.endSeconds);
  }
  if (input.endSeconds - cursor >= 0.05) kept.push({ startSeconds: cursor, endSeconds: input.endSeconds });
  if (!kept.length) {
    throw new SessionRecordingShareError(400, "TEXT_EDIT_REMOVES_ALL", "Keep at least one passage in the shared recording.");
  }
  const keptRanges = kept.map((range) => ({
    id: `kept_range_${sha256({ startSeconds: range.startSeconds, endSeconds: range.endSeconds }).slice(0, 24)}`,
    ...range,
  }));
  return {
    startSeconds: input.startSeconds,
    endSeconds: input.endSeconds,
    keptRanges,
    transcriptExclusions: transcriptExclusions.map((segment) => ({
      transcriptJobId: segment.transcriptJobId,
      segmentId: segment.segmentId,
      sourceRecordingAssetId: segment.sourceRecordingAssetId,
      providerTextSha256: segment.providerTextSha256,
      timingFingerprint: segment.timingFingerprint,
      timingBasis: segment.timingBasis,
      cutSafety: "safe" as const,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
    })),
    joinCrossfadeSeconds: keptRanges.length > 1 ? 0.01 : 0,
  };
}

async function reconcileRender(client: RestoreClient, output: any) {
  if (!output) return null;
  const body = object(output.bodyJson);
  const render = object(body.render);
  if (render.status === "VERIFIED" || !clean(render.jobId, 240)) return output;
  const job = await client.studioWorkflowJob.findUnique({ where: { id: render.jobId }, select: { id: true, status: true, inputJson: true, resultJson: true, error: true } });
  if (!job) return output;
  if (job.status === "failed") {
    if (render.status === "FAILED") return output;
    const nextBody = json({ ...body, render: { ...render, status: "FAILED", error: clean(job.error, 1_000) || "The derived recording could not be verified." } });
    return client.$transaction(async (tx: any) => {
      const nextRevision = output.revision + 1;
      const changed = await tx.sessionOutput.updateMany({
        where: { id: output.id, revision: output.revision, status: "DRAFT" },
        data: { bodyJson: nextBody, contentSha256: sha256(nextBody), revision: nextRevision },
      });
      if (changed.count !== 1) return tx.sessionOutput.findUnique({ where: { id: output.id }, select: OUTPUT_SELECT });
      await tx.sessionOutputRevision.create({
        data: {
          id: randomUUID(),
          outputId: output.id,
          revision: nextRevision,
          operation: "RENDER_FAILED",
          actorUserId: output.createdByUserId,
          snapshotJson: { body: nextBody, jobId: job.id, error: clean(job.error, 1_000) || null },
        },
      });
      return tx.sessionOutput.findUnique({ where: { id: output.id }, select: OUTPUT_SELECT });
    });
  }
  if (job.status !== "completed") return output;
  let result;
  try {
    result = parseSessionRecordingShareResult(job.resultJson);
  } catch {
    throw new SessionRecordingShareError(409, "RENDER_RECEIPT_INVALID", "The recording render completed without a trustworthy immutable receipt.");
  }
  const input = object(job.inputJson);
  if (
    result.jobId !== job.id
    || result.roomId !== output.roomId
    || result.outputId !== output.id
    || result.outputRevision !== Number(render.sourceOutputRevision)
    || result.sourceSetSha256 !== clean(input.sourceSetSha256, 64)
  ) {
    throw new SessionRecordingShareError(409, "RENDER_RECEIPT_MISMATCH", "The recording render receipt does not match the reviewed edit decision.");
  }
  const derivedAssetId = `recording-share-asset-${createHash("sha256").update(job.id).digest("hex").slice(0, 40)}`;
  const existingAsset = await client.recordingAsset.findUnique({ where: { id: derivedAssetId }, select: { id: true } });
  const nextBody = json({
    ...body,
    render: {
      ...render,
      status: "VERIFIED",
      recordingAssetId: existingAsset?.id || null,
      provider: result.output.provider,
      bucketName: result.output.bucketName,
      objectName: result.output.objectName,
      generation: result.output.generation,
      sha256: result.output.sha256,
      sizeBytes: result.output.sizeBytes,
      durationSeconds: result.output.durationSeconds,
      completedAt: result.completedAt,
      worker: result.worker,
      completeDecode: true,
    },
  });
  return client.$transaction(async (tx: any) => {
    let assetId = existingAsset?.id;
    if (!assetId) {
      const asset = await tx.recordingAsset.upsert({
        where: { id: derivedAssetId },
        update: {},
        create: {
          id: derivedAssetId,
          roomId: output.roomId,
          kind: "SERVER_MIX",
          status: "VERIFIED",
          fileName: `${output.id}.m4a`,
          contentType: "audio/mp4",
          byteSize: BigInt(result.output.sizeBytes),
          durationSeconds: result.output.durationSeconds,
          storageBucket: result.output.bucketName,
          storageObjectPath: result.output.objectName,
          checksum: result.output.sha256,
          uploadedAt: new Date(result.completedAt),
          verifiedAt: new Date(result.completedAt),
          localManifestJson: json({
            exactBytesVerified: true,
            source: "session-recording-share",
            storageGeneration: result.output.generation,
            sessionRecordingShare: {
              schema: SESSION_RECORDING_SHARE_SCHEMA,
              outputId: output.id,
              sourceOutputRevision: result.outputRevision,
              jobId: job.id,
              sourceSetSha256: result.sourceSetSha256,
              sourceRecordingAssetIds: result.sourceRecordingAssetIds,
              edit: result.edit,
              worker: result.worker,
              originalsRemainImmutable: true,
            },
          }),
        },
        select: { id: true },
      });
      assetId = asset.id;
    }
    nextBody.render.recordingAssetId = assetId;
    const changed = await tx.sessionOutput.updateMany({
      where: { id: output.id, revision: output.revision, status: "DRAFT" },
      data: { bodyJson: nextBody, contentSha256: sha256(nextBody), revision: output.revision + 1 },
    });
    if (changed.count !== 1) return tx.sessionOutput.findUnique({ where: { id: output.id }, select: OUTPUT_SELECT });
    await tx.sessionOutputRevision.create({
      data: {
        id: randomUUID(),
        outputId: output.id,
        revision: output.revision + 1,
        operation: "RENDER_VERIFIED",
        actorUserId: output.createdByUserId,
        snapshotJson: { body: nextBody, result, recordingAssetId: assetId },
      },
    });
    return tx.sessionOutput.findUnique({ where: { id: output.id }, select: OUTPUT_SELECT });
  });
}

export async function readSessionRecordingShare(client: RestoreClient, input: { roomId: string; actor: SessionAccessActor }) {
  const room = await loadRoom(client, input.roomId, input.actor, "read");
  const canPrepare = Boolean(await client.callRoom.findFirst({ where: sessionInvitationAccessWhere(input.roomId, input.actor), select: { id: true } }));
  const isRecipient = room.booking.clientUserId === input.actor.id;
  let output = await client.sessionOutput.findFirst({
    where: isRecipient
      ? { roomId: room.id, kind: "RECORDING_SHARE", recipientUserId: input.actor.id, status: "RELEASED" }
      : canPrepare
        ? { roomId: room.id, kind: "RECORDING_SHARE", status: { in: ["DRAFT", "RELEASED"] } }
        : { id: "recording-share-not-visible-to-collaborator" },
    orderBy: [{ releasedAt: "desc" }, { updatedAt: "desc" }],
    select: OUTPUT_SELECT,
  });
  if (canPrepare && output?.status === "DRAFT") output = await reconcileRender(client, output);
  const sourceRows = canPrepare ? await loadSources(client, room.id) : [];
  const transcriptSegments = canPrepare ? await loadTranscriptEditSegments(client, room.id, sourceRows) : [];
  return {
    role: canPrepare ? "COACH" as const : isRecipient ? "CLIENT" as const : "COLLABORATOR" as const,
    room: {
      id: room.id,
      title: room.title || "Coaching Session",
      coach: room.booking.coachUser
        ? { id: room.booking.coachUser.id, label: room.booking.coachUser.name || room.booking.coachUser.primaryEmail || "Coach" }
        : null,
      client: { id: room.booking.clientUser.id, label: room.booking.clientUser.name || room.booking.clientUser.primaryEmail || "Client" },
    },
    available: { ...sourceSummary(sourceRows), transcriptSegments },
    output: serializeOutput(output),
    readiness: {
      canPrepare,
      hasVerifiedParticipantSources: sourceRows.length > 0,
      localRendererAvailable: Boolean(localRenderTarget("session-exports/probe.m4a")),
      cloudRendererAvailable: false,
    },
    boundaries: {
      regressionFixtureSatisfiesHumanAcceptance: false,
      sourceFilesMutated: false,
      draftVisibleToClient: false,
      externalMessageSent: false,
    },
  };
}

export async function prepareSessionRecordingShare(client: RestoreClient, input: {
  roomId: string;
  actor: SessionAccessActor;
  clientRequestId: string;
  sourceIds: string[];
  startSeconds: number;
  endSeconds: number;
  title: string;
  excludedTranscriptSegments: Array<{ transcriptJobId: string; segmentId: string; providerTextSha256: string; timingFingerprint: string }>;
}) {
  const room = await loadRoom(client, input.roomId, input.actor, "release");
  const allSources = await loadSources(client, room.id);
  const requested = [...new Set(input.sourceIds.map((id) => clean(id, 240)).filter(Boolean))];
  const selected = requested.length ? allSources.filter((row: any) => requested.includes(row.id)) : allSources;
  if (!selected.length || (requested.length && selected.length !== requested.length)) {
    throw new SessionRecordingShareError(409, "RECORDING_SOURCES_CHANGED", "One or more selected participant masters are no longer verified. Refresh before preparing the recording.");
  }
  const summary = sourceSummary(selected);
  if (!Number.isFinite(input.startSeconds) || !Number.isFinite(input.endSeconds) || input.startSeconds < 0 || input.endSeconds <= input.startSeconds || input.endSeconds > summary.programDurationSeconds + 0.05) {
    throw new SessionRecordingShareError(400, "EDIT_RANGE_INVALID", "Choose a recording range within the verified participant masters.");
  }
  const transcriptSegments = await loadTranscriptEditSegments(client, room.id, selected);
  const edit = buildSessionRecordingShareEdit({
    startSeconds: input.startSeconds,
    endSeconds: input.endSeconds,
    transcriptSegments,
    excludedTranscriptSegments: input.excludedTranscriptSegments,
  });
  const targetProbe = localRenderTarget("session-exports/probe.m4a");
  if (!targetProbe) {
    throw new SessionRecordingShareError(503, "RECORDING_RENDERER_UNAVAILABLE", "The production recording renderer is not deployed yet. No draft or release was created.");
  }
  const outputId = `recording-share-${createHash("sha256").update(`${input.actor.id}|${room.id}|${input.clientRequestId}`).digest("hex").slice(0, 40)}`;
  const jobId = randomUUID();
  const objectName = `session-exports/${room.id}/${jobId}.m4a`;
  const target = localRenderTarget(objectName);
  if (!target) throw new SessionRecordingShareError(503, "RECORDING_RENDERER_UNAVAILABLE", "The local recording renderer is unavailable.");
  const originMs = Math.min(...selected.map((row: any) => row.recordedStartedAt.getTime()));
  const sources = selected.map((row: any, index: number) => {
    const manifest = object(row.localManifestJson);
    const bucketName = clean(row.storageBucket, 500);
    const objectName = clean(row.storageObjectPath, 2_000);
    const locator = bucketName === MOBILE_CAPTURE_LOCAL_VAULT_BUCKET ? localRenderTarget(objectName) : null;
    if (!locator) throw new SessionRecordingShareError(503, "RECORDING_SOURCE_PROVIDER_UNAVAILABLE", "This renderer cannot read one of the verified participant masters.");
    return {
      recordingAssetId: row.id,
      participantId: row.participantId,
      participantLabel: participantLabel(row, index),
      provider: "local" as const,
      bucketName,
      objectName,
      locator,
      generation: clean(manifest.storageGeneration, 240) || "unknown",
      sha256: clean(row.checksum, 64).toLowerCase(),
      sizeBytes: Number(row.byteSize),
      contentType: row.contentType || (row.kind === "LOCAL_VIDEO" ? "video/mp4" : "audio/webm"),
      programOffsetSeconds: (row.recordedStartedAt.getTime() - originMs) / 1_000,
    };
  });
  const sourceManifest = json({
    schema: SESSION_RECORDING_SHARE_MANIFEST_SCHEMA,
    roomId: room.id,
    recipientUserId: room.booking.clientUserId,
    sources: sources.map((source: typeof sources[number]) => {
      const { locator: _locator, ...safeSource } = source;
      return safeSource;
    }),
    boundaries: { originalSourcesRemainImmutable: true, editIsNonDestructive: true, draftVisibleToClient: false },
  });
  const sourceSetSha256 = sha256(sourceManifest.sources);
  const title = clean(input.title, 500) || `${room.title || "Coaching Session"} recording`;
  const body = json({
    schema: SESSION_RECORDING_SHARE_SCHEMA,
    edit,
    render: { jobId, status: "QUEUED", sourceOutputRevision: 1 },
    recipient: { userId: room.booking.clientUserId },
    boundaries: { originalSourcesRemainImmutable: true, editIsNonDestructive: true, clientVisibility: "PRIVATE_UNTIL_RELEASE" },
  });
  const job = newSessionRecordingShareJob({
    jobId,
    roomId: room.id,
    outputId,
    outputRevision: 1,
    requestedAt: new Date().toISOString(),
    sourceSetSha256,
    edit: body.edit,
    sources,
    target: {
      provider: "local",
      bucketName: MOBILE_CAPTURE_LOCAL_VAULT_BUCKET,
      objectName,
      locator: target,
      contentType: "audio/mp4",
      codec: "aac-lc",
      sampleRateHz: 48_000,
      channels: 2,
    },
  });
  try {
    const output = await client.$transaction(async (tx: any) => {
      const created = await tx.sessionOutput.create({
        data: {
          id: outputId,
          roomId: room.id,
          createdByUserId: input.actor.id,
          recipientUserId: room.booking.clientUserId,
          kind: "RECORDING_SHARE",
          status: "DRAFT",
          title,
          bodyJson: body,
          sourceManifestJson: sourceManifest,
          contentSha256: sha256(body),
          revision: 1,
          revisions: { create: { id: input.clientRequestId, revision: 1, operation: "DRAFT_RENDER_QUEUED", actorUserId: input.actor.id, snapshotJson: { body, sourceManifest, sourceSetSha256 } } },
        },
        select: OUTPUT_SELECT,
      });
      await tx.studioWorkflowJob.create({ data: { id: jobId, type: "session-recording-share", source: "session-recording-share", status: "queued", requestedByEmail: input.actor.primaryEmail || input.actor.email || null, inputJson: job } });
      return created;
    });
    return { output: serializeOutput(output), idempotentReplay: false };
  } catch (error: any) {
    if (error?.code !== "P2002") throw error;
    const revision = await client.sessionOutputRevision.findUnique({ where: { id: input.clientRequestId }, select: { outputId: true, actorUserId: true } });
    if (!revision || revision.outputId !== outputId || revision.actorUserId !== input.actor.id) {
      throw new SessionRecordingShareError(409, "REQUEST_ID_CONFLICT", "That request identity already belongs to a different recording decision.");
    }
    const existing = await client.sessionOutput.findUnique({ where: { id: outputId }, select: OUTPUT_SELECT });
    return { output: serializeOutput(existing), idempotentReplay: true };
  }
}

export async function transitionSessionRecordingShare(client: RestoreClient, input: {
  roomId: string;
  outputId: string;
  actor: SessionAccessActor;
  clientRequestId: string;
  expectedRevision: number;
  action: "RELEASE" | "REVOKE";
}) {
  const room = await loadRoom(client, input.roomId, input.actor, "release");
  let current = await client.sessionOutput.findFirst({ where: { id: input.outputId, roomId: room.id, kind: "RECORDING_SHARE", recipientUserId: room.booking.clientUserId }, select: OUTPUT_SELECT });
  if (!current) throw new SessionRecordingShareError(404, "RECORDING_SHARE_NOT_FOUND", "That prepared recording is unavailable.");
  const expectedStatus = input.action === "RELEASE" ? "DRAFT" : "RELEASED";
  const nextStatus = input.action === "RELEASE" ? "RELEASED" : "REVOKED";
  const eventKind = input.action === "RELEASE" ? "RELEASED_IN_APP" : "REVOKED";
  if (current.status === nextStatus) {
    const replay = await client.deliveryEvent.findUnique({
      where: { actorUserId_clientRequestId: { actorUserId: input.actor.id, clientRequestId: input.clientRequestId } },
      select: { outputId: true, roomId: true, kind: true, contentSha256: true },
    });
    if (!replay || replay.outputId !== current.id || replay.roomId !== room.id || replay.kind !== eventKind || replay.contentSha256 !== current.contentSha256) {
      throw new SessionRecordingShareError(409, "REQUEST_ID_CONFLICT", "That visibility request identity belongs to a different recording decision.");
    }
    return { output: serializeOutput(current), idempotentReplay: true };
  }
  current = await reconcileRender(client, current);
  if (!current) throw new SessionRecordingShareError(404, "RECORDING_SHARE_NOT_FOUND", "That prepared recording is unavailable.");
  const render = object(object(current.bodyJson).render);
  if (input.action === "RELEASE" && (render.status !== "VERIFIED" || !clean(render.recordingAssetId, 240))) {
    throw new SessionRecordingShareError(409, "RECORDING_NOT_VERIFIED", "Preview is not ready. Quipsly will not release an unverified derived recording.");
  }
  if (current.status !== expectedStatus || current.revision !== input.expectedRevision) {
    throw new SessionRecordingShareError(409, "STALE_RECORDING_SHARE", "The prepared recording changed before this visibility decision. Refresh and review it again.");
  }
  const now = new Date();
  const nextRevision = current.revision + 1;
  const updated = await client.$transaction(async (tx: any) => {
    const changed = await tx.sessionOutput.updateMany({
      where: { id: current.id, status: expectedStatus, revision: current.revision },
      data: { status: nextStatus, revision: nextRevision, releasedAt: input.action === "RELEASE" ? now : current.releasedAt, revokedAt: input.action === "REVOKE" ? now : null },
    });
    if (changed.count !== 1) throw new SessionRecordingShareError(409, "STALE_RECORDING_SHARE", "The prepared recording changed before this visibility decision.");
    await tx.sessionOutputRevision.create({ data: { id: randomUUID(), outputId: current.id, revision: nextRevision, operation: input.action, actorUserId: input.actor.id, snapshotJson: { status: nextStatus, contentSha256: current.contentSha256 } } });
    await tx.deliveryEvent.create({ data: { id: randomUUID(), outputId: current.id, roomId: room.id, actorUserId: input.actor.id, recipientUserId: room.booking.clientUserId, kind: eventKind, destination: "quipsly-session-recording", status: "CONFIRMED", contentSha256: current.contentSha256, clientRequestId: input.clientRequestId, occurredAt: now, metadataJson: { externalMessageSent: false, publicationPerformed: false } } });
    return tx.sessionOutput.findUnique({ where: { id: current.id }, select: OUTPUT_SELECT });
  });
  return { output: serializeOutput(updated), idempotentReplay: false };
}

export async function authorizeSessionRecordingShareMedia(client: RestoreClient, input: { roomId: string; outputId: string; actor: SessionAccessActor }) {
  const room = await loadRoom(client, input.roomId, input.actor, "read");
  const canPrepare = Boolean(await client.callRoom.findFirst({ where: sessionInvitationAccessWhere(input.roomId, input.actor), select: { id: true } }));
  const output = await client.sessionOutput.findFirst({
    where: {
      id: input.outputId,
      roomId: room.id,
      kind: "RECORDING_SHARE",
      ...(canPrepare ? {} : { recipientUserId: input.actor.id, status: "RELEASED" }),
    },
    select: OUTPUT_SELECT,
  });
  if (!output) throw new SessionRecordingShareError(404, "RECORDING_SHARE_NOT_FOUND", "This recording is not available to this account.");
  const render = object(object(output.bodyJson).render);
  if (render.status !== "VERIFIED" || !clean(render.recordingAssetId, 240)) throw new SessionRecordingShareError(404, "RECORDING_SHARE_NOT_READY", "This recording preview is not ready.");
  const asset = await client.recordingAsset.findFirst({
    where: { id: render.recordingAssetId, roomId: room.id, kind: "SERVER_MIX", status: "VERIFIED" },
    select: { id: true, fileName: true, contentType: true, byteSize: true, checksum: true, storageBucket: true, storageObjectPath: true },
  });
  if (!asset?.storageBucket || !asset.storageObjectPath || !asset.checksum || !asset.byteSize) throw new SessionRecordingShareError(404, "RECORDING_SHARE_NOT_READY", "This recording does not have a complete immutable storage receipt.");
  return asset;
}
