import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import { canonicalEpisodeImportedMedia } from "@/lib/episode-production/imported-media";
import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

export type EpisodeAudioDecisionKind = "track-role" | "participant" | "program-clock" | "mix-disposition";

type Actor = { id: string; email: string };
type JsonRecord = Record<string, unknown>;

const ROLE_VALUES = new Map([
  ["dialogue-primary", "Primary dialogue"],
  ["dialogue-backup", "Dialogue backup"],
  ["camera-scratch", "Camera scratch audio"],
  ["reference", "Reference media"],
  ["music", "Music"],
  ["sound-effect", "Sound effect"],
  ["program-master", "Program master"],
]);
const MIX_VALUES = new Map([
  ["include", "Include in mix"],
  ["exclude", "Exclude from mix"],
  ["backup", "Backup only"],
  ["reference-only", "Reference only"],
]);
const DB_KIND = {
  "track-role": "TRACK_ROLE",
  participant: "PARTICIPANT",
  "program-clock": "PROGRAM_CLOCK",
  "mix-disposition": "MIX_DISPOSITION",
} as const;

export class EpisodeAudioTrackDecisionError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

function text(value: unknown, maximum = Number.POSITIVE_INFINITY) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function object(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
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

function importedAssetId(item: JsonRecord) {
  return text(item.id) || text(item.assetId) || text(item.mediaAssetId);
}

function importedRecordingAssetId(item: JsonRecord) {
  const metadata = object(item.metadata);
  const metadataSync = object(metadata.recordingSync);
  const sync = object(item.sync);
  const syncRecording = object(sync.recordingSync);
  return text(item.recordingAssetId)
    || text(metadataSync.recordingAssetId)
    || text(sync.recordingAssetId)
    || text(syncRecording.recordingAssetId);
}

export function episodeAudioProgramFingerprint(input: {
  episodeProductionId: string;
  importedMedia: JsonRecord[];
}) {
  const tracks = input.importedMedia.map((item) => ({
    assetId: importedAssetId(item),
    sourceId: text(item.sourceId),
    recordingAssetId: importedRecordingAssetId(item) || null,
    role: text(item.importRole) || text(object(item.sync).suggestedRole) || null,
    kind: text(item.kind) || null,
    contentType: text(item.contentType) || null,
  })).filter((track) => track.assetId && track.sourceId)
    .sort((left, right) => `${left.assetId}:${left.sourceId}`.localeCompare(`${right.assetId}:${right.sourceId}`));
  return sha256({
    schema: "quipsly-episode-audio-program-fingerprint-v1",
    episodeProductionId: input.episodeProductionId,
    tracks,
  });
}

function publicReceipt(receipt: any, currentFingerprint: string) {
  return {
    id: String(receipt.id),
    operation: receipt.operation === "SET" ? "set" as const : "withdrawn" as const,
    kind: String(receipt.decisionKind).toLowerCase().replaceAll("_", "-") as EpisodeAudioDecisionKind,
    assetId: String(receipt.assetId),
    sourceId: String(receipt.sourceId),
    value: String(receipt.decisionValue),
    label: text(receipt.decisionLabel) || null,
    targetReceiptId: receipt.targetReceiptId ? String(receipt.targetReceiptId) : null,
    programFingerprintSha256: String(receipt.programFingerprintSha256),
    stale: receipt.programFingerprintSha256 !== currentFingerprint,
    source: {
      sha256: String(receipt.sourceSha256),
      generation: String(receipt.sourceGeneration),
      sizeBytes: String(receipt.sourceSizeBytes),
    },
    reason: text(receipt.reason) || null,
    actorEmail: String(receipt.actorEmail),
    occurredAt: receipt.occurredAt?.toISOString?.() ?? String(receipt.occurredAt),
  };
}

function decisionKey(receipt: ReturnType<typeof publicReceipt>) {
  return receipt.kind === "program-clock"
    ? "program-clock"
    : `${receipt.assetId}:${receipt.sourceId}:${receipt.kind}`;
}

export function projectEpisodeAudioTrackDecisions(receipts: any[], currentFingerprint: string) {
  const history = (Array.isArray(receipts) ? receipts : []).map((receipt) => publicReceipt(receipt, currentFingerprint));
  const activeByKey = new Map<string, (typeof history)[number]>();
  for (const receipt of history) {
    if (receipt.stale) continue;
    const key = decisionKey(receipt);
    if (receipt.operation === "set") {
      activeByKey.set(key, receipt);
      continue;
    }
    const active = activeByKey.get(key);
    if (active && active.id === receipt.targetReceiptId) activeByKey.delete(key);
  }
  const active = [...activeByKey.values()];
  return {
    schema: "quipsly-episode-audio-track-decision-ledger-v1" as const,
    programFingerprintSha256: currentFingerprint,
    active,
    history: [...history].reverse().slice(0, 100),
    summary: {
      activeCount: active.length,
      staleCount: history.filter((receipt) => receipt.stale).length,
      withdrawnCount: history.filter((receipt) => receipt.operation === "withdrawn").length,
      hasProgramClock: active.some((receipt) => receipt.kind === "program-clock"),
    },
    boundaries: {
      appendOnly: true as const,
      sourceBytesImmutable: true as const,
      decisionsAreProgramFingerprintBound: true as const,
      timelinePlacementUnchanged: true as const,
      mixNotRendered: true as const,
    },
  };
}

async function loadEpisode(input: { prisma: any; projectSlug: string; episodeProductionId: string }) {
  const project = await input.prisma.studioProject.findFirst({
    where: { slug: input.projectSlug },
    select: { id: true, slug: true },
  });
  if (!project) throw new EpisodeAudioTrackDecisionError("Nest not found for the Episode audio program.", 404, "EPISODE_AUDIO_PROJECT_NOT_FOUND");
  const episode = await input.prisma.studioEpisodeProduction.findFirst({
    where: { id: input.episodeProductionId, projectId: project.id },
    select: { id: true, slug: true, projectId: true, productionJson: true, timelineJson: true },
  });
  if (!episode) throw new EpisodeAudioTrackDecisionError("The canonical Episode was not found in this Nest.", 404, "EPISODE_AUDIO_EPISODE_NOT_FOUND");
  const importedMedia = canonicalEpisodeImportedMedia(episode.productionJson, episode.timelineJson);
  const programFingerprintSha256 = episodeAudioProgramFingerprint({ episodeProductionId: episode.id, importedMedia });
  return { project, episode, importedMedia, programFingerprintSha256 };
}

async function loadTrack(input: {
  prisma: any;
  projectId: string;
  importedMedia: JsonRecord[];
  assetId: string;
  sourceId: string;
}) {
  const imported = input.importedMedia.find((item) => importedAssetId(item) === input.assetId && text(item.sourceId) === input.sourceId);
  if (!imported) throw new EpisodeAudioTrackDecisionError("That exact source is not attached to the current Episode audio program.", 409, "EPISODE_AUDIO_TRACK_NOT_ATTACHED");
  const [asset, source] = await Promise.all([
    input.prisma.studioMediaAsset.findFirst({
      where: {
        id: input.assetId,
        isProxy: false,
        OR: [
          { projects: { some: { id: input.projectId } } },
          { assetAttachments: { some: { projectId: input.projectId } } },
        ],
      },
      select: { id: true, mimeType: true, url: true, assetAttachments: { where: { projectId: input.projectId }, select: { metadataJson: true } } },
    }),
    input.prisma.studioVideoSource.findUnique({ where: { id: input.sourceId }, select: { id: true, url: true, providerSourceId: true } }),
  ]);
  const attachmentNamesSource = asset?.assetAttachments.some((attachment: any) => object(attachment.metadataJson).sourceId === input.sourceId);
  if (!asset || !source?.providerSourceId || source.url !== `/api/ingest/media/${source.id}` || (asset.url !== source.url && !attachmentNamesSource)) {
    throw new EpisodeAudioTrackDecisionError("Track decisions require the exact retained original attached to this Nest and Episode.", 409, "EPISODE_AUDIO_SOURCE_BINDING_INVALID");
  }
  return { imported, asset, source };
}

async function normalizeDecision(input: {
  prisma: any;
  episodeProductionId: string;
  kind: EpisodeAudioDecisionKind;
  value: string;
}) {
  const value = syntacticDecisionValue(input.kind, input.value);
  if (input.kind === "track-role") {
    const label = ROLE_VALUES.get(value);
    if (!label) throw new EpisodeAudioTrackDecisionError("Choose a supported production role for this track.", 400, "EPISODE_AUDIO_ROLE_INVALID");
    return { value, label };
  }
  if (input.kind === "mix-disposition") {
    const label = MIX_VALUES.get(value);
    if (!label) throw new EpisodeAudioTrackDecisionError("Choose include, exclude, backup, or reference-only for this track.", 400, "EPISODE_AUDIO_MIX_DISPOSITION_INVALID");
    return { value, label };
  }
  if (input.kind === "program-clock") {
    if (value !== "primary") throw new EpisodeAudioTrackDecisionError("The program clock decision value must be primary.", 400, "EPISODE_AUDIO_CLOCK_VALUE_INVALID");
    return { value, label: "Program clock" };
  }
  const match = /^call-participant:([A-Za-z0-9_-]{8,240})$/.exec(value);
  if (!match) throw new EpisodeAudioTrackDecisionError("Choose a canonical participant from this Episode session.", 400, "EPISODE_AUDIO_PARTICIPANT_INVALID");
  const participant = await input.prisma.callParticipant.findFirst({
    where: { id: match[1], room: { episodeProductionId: input.episodeProductionId } },
    select: { id: true, displayName: true, email: true },
  });
  if (!participant) throw new EpisodeAudioTrackDecisionError("That participant does not belong to a session for this Episode.", 409, "EPISODE_AUDIO_PARTICIPANT_NOT_IN_EPISODE");
  return { value: `call-participant:${participant.id}`, label: text(participant.displayName) || text(participant.email) || "Episode participant" };
}

function syntacticDecisionValue(kind: EpisodeAudioDecisionKind, rawValue: string) {
  const value = text(rawValue, 240).toLowerCase();
  if (kind === "track-role" && !ROLE_VALUES.has(value)) {
    throw new EpisodeAudioTrackDecisionError("Choose a supported production role for this track.", 400, "EPISODE_AUDIO_ROLE_INVALID");
  }
  if (kind === "mix-disposition" && !MIX_VALUES.has(value)) {
    throw new EpisodeAudioTrackDecisionError("Choose include, exclude, backup, or reference-only for this track.", 400, "EPISODE_AUDIO_MIX_DISPOSITION_INVALID");
  }
  if (kind === "program-clock" && value !== "primary") {
    throw new EpisodeAudioTrackDecisionError("The program clock decision value must be primary.", 400, "EPISODE_AUDIO_CLOCK_VALUE_INVALID");
  }
  if (kind === "participant" && !/^call-participant:[A-Za-z0-9_-]{8,240}$/.test(value)) {
    throw new EpisodeAudioTrackDecisionError("Choose a canonical participant from this Episode session.", 400, "EPISODE_AUDIO_PARTICIPANT_INVALID");
  }
  return value;
}

async function ledger(prisma: any, episodeProductionId: string, fingerprint: string) {
  const receipts = await prisma.studioEpisodeAudioTrackDecisionReceipt.findMany({
    where: { episodeProductionId },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    take: 500,
  });
  return projectEpisodeAudioTrackDecisions(receipts, fingerprint);
}

export async function readEpisodeAudioTrackDecisions(input: {
  prisma: any;
  projectSlug: string;
  episodeProductionId: string;
}) {
  const context = await loadEpisode(input);
  return ledger(input.prisma, context.episode.id, context.programFingerprintSha256);
}

export async function setEpisodeAudioTrackDecision(input: {
  prisma: any;
  actor: Actor;
  projectSlug: string;
  episodeProductionId: string;
  assetId: string;
  sourceId: string;
  kind: EpisodeAudioDecisionKind;
  value: string;
  programFingerprintSha256: string;
  clientRequestId: string;
}) {
  const actorEmail = text(input.actor.email, 320).toLowerCase();
  const actorUserId = text(input.actor.id, 240);
  const clientRequestId = text(input.clientRequestId, 160);
  if (!actorEmail || !actorUserId) throw new EpisodeAudioTrackDecisionError("A signed-in actor identity is required.", 401, "EPISODE_AUDIO_ACTOR_REQUIRED");
  if (!clientRequestId) throw new EpisodeAudioTrackDecisionError("A stable client request id is required.", 400, "EPISODE_AUDIO_REQUEST_ID_REQUIRED");
  const context = await loadEpisode(input);
  if (text(input.programFingerprintSha256) !== context.programFingerprintSha256) {
    throw new EpisodeAudioTrackDecisionError("The Episode source set changed. Refresh the Mix Map before recording this decision.", 409, "EPISODE_AUDIO_PROGRAM_CHANGED");
  }
  const existing = await input.prisma.studioEpisodeAudioTrackDecisionReceipt.findUnique({
    where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } },
  });
  if (existing) {
    const replayValue = syntacticDecisionValue(input.kind, input.value);
    const existingKind = publicReceipt(existing, context.programFingerprintSha256).kind;
    if (
      existing.operation !== "SET"
      || existingKind !== input.kind
      || existing.assetId !== input.assetId
      || existing.sourceId !== input.sourceId
      || existing.decisionValue !== replayValue
    ) {
      throw new EpisodeAudioTrackDecisionError("That request id belongs to a different Episode audio decision.", 409, "EPISODE_AUDIO_IDEMPOTENCY_CONFLICT");
    }
    const replayRequest = requestPayload({
      action: "SET",
      context,
      input,
      actorUserId,
      actorEmail,
      clientRequestId,
      normalized: { value: replayValue, label: String(existing.decisionLabel) },
      source: { sha256: existing.sourceSha256, generation: existing.sourceGeneration, sizeBytes: Number(existing.sourceSizeBytes) },
      targetReceiptId: null,
      reason: null,
    });
    if (existing.requestSha256 !== sha256(replayRequest)) {
      throw new EpisodeAudioTrackDecisionError("That request id belongs to a different Episode audio decision.", 409, "EPISODE_AUDIO_IDEMPOTENCY_CONFLICT");
    }
    return { ok: true, idempotentReplay: true, decision: publicReceipt(existing, context.programFingerprintSha256), ledger: await ledger(input.prisma, context.episode.id, context.programFingerprintSha256) };
  }
  const normalized = await normalizeDecision({ prisma: input.prisma, episodeProductionId: context.episode.id, kind: input.kind, value: input.value });
  const track = await loadTrack({ prisma: input.prisma, projectId: context.project.id, importedMedia: context.importedMedia, assetId: input.assetId, sourceId: input.sourceId });
  const sourceEvidence = await inspectImmutableStudioMediaSource(track.source.providerSourceId, track.asset.mimeType);
  const request = requestPayload({ action: "SET", context, input, actorUserId, actorEmail, clientRequestId, normalized, source: sourceEvidence, targetReceiptId: null, reason: null });
  const requestSha256 = sha256(request);
  const created = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `episode-audio-decisions:${context.episode.id}`);
    const fresh = await tx.studioEpisodeProduction.findUnique({ where: { id: context.episode.id }, select: { productionJson: true, timelineJson: true } });
    const freshImported = fresh ? canonicalEpisodeImportedMedia(fresh.productionJson, fresh.timelineJson) : [];
    if (!fresh || episodeAudioProgramFingerprint({ episodeProductionId: context.episode.id, importedMedia: freshImported }) !== context.programFingerprintSha256) {
      throw new EpisodeAudioTrackDecisionError("The Episode source set changed before this decision could be committed.", 409, "EPISODE_AUDIO_PROGRAM_CHANGED");
    }
    const replay = await tx.studioEpisodeAudioTrackDecisionReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } } });
    if (replay) {
      if (replay.requestSha256 !== requestSha256) throw new EpisodeAudioTrackDecisionError("That request id won a race with a different audio decision.", 409, "EPISODE_AUDIO_IDEMPOTENCY_CONFLICT");
      return replay;
    }
    return tx.studioEpisodeAudioTrackDecisionReceipt.create({
      data: {
        projectId: context.project.id,
        episodeProductionId: context.episode.id,
        assetId: input.assetId,
        sourceId: input.sourceId,
        actorUserId,
        actorEmail,
        clientRequestId,
        operation: "SET",
        decisionKind: DB_KIND[input.kind],
        decisionValue: normalized.value,
        decisionLabel: normalized.label,
        programFingerprintSha256: context.programFingerprintSha256,
        sourceSha256: sourceEvidence.sha256,
        sourceGeneration: sourceEvidence.generation,
        sourceSizeBytes: BigInt(sourceEvidence.sizeBytes),
        requestSha256,
        evidenceJson: json({ schema: "quipsly-episode-audio-track-decision-evidence-v1", exactSourceBytesBound: true, sourceProvider: sourceEvidence.provider, sourceLocator: sourceEvidence.locator, importedRoleSnapshot: text(track.imported.importRole) || null, timelinePlacementUnchanged: true, mixNotRendered: true }),
        occurredAt: new Date(),
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ok: true, idempotentReplay: false, decision: publicReceipt(created, context.programFingerprintSha256), ledger: await ledger(input.prisma, context.episode.id, context.programFingerprintSha256) };
}

export async function withdrawEpisodeAudioTrackDecision(input: {
  prisma: any;
  actor: Actor;
  projectSlug: string;
  episodeProductionId: string;
  decisionId: string;
  programFingerprintSha256: string;
  clientRequestId: string;
  reason: string;
}) {
  const actorEmail = text(input.actor.email, 320).toLowerCase();
  const actorUserId = text(input.actor.id, 240);
  const clientRequestId = text(input.clientRequestId, 160);
  const reason = text(input.reason, 2_000);
  if (!actorEmail || !actorUserId) throw new EpisodeAudioTrackDecisionError("A signed-in actor identity is required.", 401, "EPISODE_AUDIO_ACTOR_REQUIRED");
  if (!clientRequestId) throw new EpisodeAudioTrackDecisionError("A stable client request id is required.", 400, "EPISODE_AUDIO_REQUEST_ID_REQUIRED");
  if (reason.length < 3) throw new EpisodeAudioTrackDecisionError("Withdrawing an audio decision requires a short reason.", 409, "EPISODE_AUDIO_WITHDRAW_REASON_REQUIRED");
  const context = await loadEpisode(input);
  if (text(input.programFingerprintSha256) !== context.programFingerprintSha256) throw new EpisodeAudioTrackDecisionError("The Episode source set changed. Refresh before withdrawing a decision.", 409, "EPISODE_AUDIO_PROGRAM_CHANGED");
  const existing = await input.prisma.studioEpisodeAudioTrackDecisionReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } } });
  if (existing) {
    const existingDecision = publicReceipt(existing, context.programFingerprintSha256);
    if (existing.operation !== "WITHDRAW" || existing.targetReceiptId !== input.decisionId || existing.reason !== reason) {
      throw new EpisodeAudioTrackDecisionError("That request id belongs to a different Episode audio decision.", 409, "EPISODE_AUDIO_IDEMPOTENCY_CONFLICT");
    }
    const replayInput = { ...input, assetId: existingDecision.assetId, sourceId: existingDecision.sourceId, kind: existingDecision.kind, value: existingDecision.value };
    const replayRequest = requestPayload({
      action: "WITHDRAW",
      context,
      input: replayInput,
      actorUserId,
      actorEmail,
      clientRequestId,
      normalized: { value: existingDecision.value, label: existingDecision.label || existingDecision.value },
      source: { sha256: existingDecision.source.sha256, generation: existingDecision.source.generation, sizeBytes: Number(existingDecision.source.sizeBytes) },
      targetReceiptId: input.decisionId,
      reason,
    });
    if (existing.requestSha256 !== sha256(replayRequest)) {
      throw new EpisodeAudioTrackDecisionError("That request id belongs to a different Episode audio decision.", 409, "EPISODE_AUDIO_IDEMPOTENCY_CONFLICT");
    }
    return { ok: true, idempotentReplay: true, decision: existingDecision, ledger: await ledger(input.prisma, context.episode.id, context.programFingerprintSha256) };
  }
  const currentLedger = await ledger(input.prisma, context.episode.id, context.programFingerprintSha256);
  const target = currentLedger.active.find((decision) => decision.id === input.decisionId);
  if (!target) throw new EpisodeAudioTrackDecisionError("That decision is no longer active for the current Episode program.", 409, "EPISODE_AUDIO_DECISION_NOT_ACTIVE");
  const source = { sha256: target.source.sha256, generation: target.source.generation, sizeBytes: Number(target.source.sizeBytes) };
  const normalized = { value: target.value, label: target.label || target.value };
  const replayInput = { ...input, assetId: target.assetId, sourceId: target.sourceId, kind: target.kind, value: target.value };
  const request = requestPayload({ action: "WITHDRAW", context, input: replayInput, actorUserId, actorEmail, clientRequestId, normalized, source, targetReceiptId: target.id, reason });
  const requestSha256 = sha256(request);
  const created = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `episode-audio-decisions:${context.episode.id}`);
    const receipts = await tx.studioEpisodeAudioTrackDecisionReceipt.findMany({ where: { episodeProductionId: context.episode.id }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }], take: 500 });
    const lockedLedger = projectEpisodeAudioTrackDecisions(receipts, context.programFingerprintSha256);
    if (!lockedLedger.active.some((decision) => decision.id === target.id)) throw new EpisodeAudioTrackDecisionError("The active audio decision changed before withdrawal.", 409, "EPISODE_AUDIO_DECISION_CHANGED");
    return tx.studioEpisodeAudioTrackDecisionReceipt.create({
      data: {
        projectId: context.project.id,
        episodeProductionId: context.episode.id,
        assetId: target.assetId,
        sourceId: target.sourceId,
        actorUserId,
        actorEmail,
        clientRequestId,
        operation: "WITHDRAW",
        decisionKind: DB_KIND[target.kind],
        decisionValue: target.value,
        decisionLabel: target.label,
        targetReceiptId: target.id,
        programFingerprintSha256: context.programFingerprintSha256,
        sourceSha256: target.source.sha256,
        sourceGeneration: target.source.generation,
        sourceSizeBytes: BigInt(target.source.sizeBytes),
        requestSha256,
        evidenceJson: json({ schema: "quipsly-episode-audio-track-decision-withdrawal-v1", targetReceiptId: target.id, sourceBytesUnchanged: true, timelinePlacementUnchanged: true, mixNotRendered: true }),
        reason,
        occurredAt: new Date(),
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ok: true, idempotentReplay: false, decision: publicReceipt(created, context.programFingerprintSha256), ledger: await ledger(input.prisma, context.episode.id, context.programFingerprintSha256) };
}

function requestPayload(input: {
  action: "SET" | "WITHDRAW";
  context: Awaited<ReturnType<typeof loadEpisode>>;
  input: { assetId: string; sourceId: string; kind: EpisodeAudioDecisionKind; programFingerprintSha256: string };
  actorUserId: string;
  actorEmail: string;
  clientRequestId: string;
  normalized: { value: string; label: string };
  source: { sha256: string; generation: string; sizeBytes: number };
  targetReceiptId: string | null;
  reason: string | null;
}) {
  return {
    schema: "quipsly-episode-audio-track-decision-request-v1",
    action: input.action,
    projectId: input.context.project.id,
    episodeProductionId: input.context.episode.id,
    assetId: input.input.assetId,
    sourceId: input.input.sourceId,
    decisionKind: input.input.kind,
    decisionValue: input.normalized.value,
    decisionLabel: input.normalized.label,
    targetReceiptId: input.targetReceiptId,
    programFingerprintSha256: input.context.programFingerprintSha256,
    sourceSha256: input.source.sha256,
    sourceGeneration: input.source.generation,
    sourceSizeBytes: input.source.sizeBytes,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    clientRequestId: input.clientRequestId,
    reason: input.reason,
  };
}
