import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import { buildEpisodeAudioActivityMap } from "@/lib/episode-audio-activity-map";
import { episodeAudioProcessingEvidence, episodeAudioSignalActivityEvidence, episodeAudioTranscriptActivityEvidence } from "@/lib/episode-audio-processing-evidence";
import { buildEpisodeAudioProgram, type EpisodeAudioProgram } from "@/lib/episode-audio-program";
import { canonicalEpisodeImportedMedia } from "@/lib/episode-production/imported-media";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { episodeAudioProgramFingerprint, projectEpisodeAudioTrackDecisions } from "@/lib/server/episode-audio-track-decisions";

type Actor = { id: string; email: string };
type JsonRecord = Record<string, unknown>;

export class EpisodeAudioActivityAnalysisError extends Error {
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

function importedAssetId(item: JsonRecord) {
  return text(item.id) || text(item.assetId) || text(item.mediaAssetId);
}

function importedRecordingAssetId(item: JsonRecord) {
  const metadata = object(item.metadata);
  const metadataSync = object(metadata.recordingSync);
  const sync = object(item.sync);
  const syncRecording = object(sync.recordingSync);
  return text(item.recordingAssetId) || text(metadataSync.recordingAssetId) || text(sync.recordingAssetId) || text(syncRecording.recordingAssetId);
}

function activeDecisionIds(value: unknown) {
  const row = object(value);
  const decisions = object(row.decisions);
  const active = Array.isArray(row.active) ? row.active : Array.isArray(decisions.active) ? decisions.active : [];
  return active.map((entry) => text(object(entry).id)).filter(Boolean).sort();
}

export function episodeAudioActivityAnalysisInput(program: EpisodeAudioProgram, map = buildEpisodeAudioActivityMap(program)) {
  return {
    schema: "quipsly-episode-audio-activity-analysis-input-v1",
    algorithm: "quipsly-shared-clock-energy-topology-v1",
    configuration: {
      cellCount: map.resolution.cellCount,
      energyThreshold: "max(p20+9,p70-12,near-silence+12), bounded -56..-22 dBFS",
      energyIsNotSpeech: true,
    },
    programFingerprintSha256: program.fingerprintSha256,
    activeDecisionReceiptIds: program.activeDecisions.map((decision) => decision.id).sort(),
    tracks: program.tracks.map((track) => {
      const lane = map.lanes.find((candidate) => candidate.assetId === track.assetId && candidate.sourceId === track.sourceId)!;
      return {
        assetId: track.assetId,
        sourceId: track.sourceId,
        role: track.role,
        participantId: track.participantId,
        mixDisposition: track.mixDisposition,
        alignment: {
          kind: lane.alignment,
          jobId: track.processing.alignment.jobId,
          spineAssetId: track.processing.alignment.spineAssetId,
          qualifiedForReview: track.processing.alignment.qualifiedForReview,
          openingOffsetSeconds: lane.programOffsetSeconds,
        },
        signalProfile: track.activityEvidence ? {
          jobId: track.activityEvidence.jobId,
          sourceSha256: track.activityEvidence.sourceSha256,
          sourceGeneration: track.activityEvidence.sourceGeneration,
          sourceSizeBytes: track.activityEvidence.sourceSizeBytes,
          durationSeconds: track.activityEvidence.durationSeconds,
          windowDurationSeconds: track.activityEvidence.windowDurationSeconds,
        } : null,
        transcriptTiming: track.transcriptActivityEvidence ? {
          jobId: track.transcriptActivityEvidence.jobId,
          transcriptJobId: track.transcriptActivityEvidence.transcriptJobId,
          sourceSha256: track.transcriptActivityEvidence.source.sha256,
          sourceGeneration: track.transcriptActivityEvidence.source.generation,
          sourceSizeBytes: track.transcriptActivityEvidence.source.sizeBytes,
          provider: track.transcriptActivityEvidence.provider,
          timedWordCount: track.transcriptActivityEvidence.timedWordCount,
          transcriptStartSeconds: track.transcriptActivityEvidence.transcriptStartSeconds,
          transcriptEndSeconds: track.transcriptActivityEvidence.transcriptEndSeconds,
        } : null,
      };
    }).sort((left, right) => `${left.assetId}:${left.sourceId}`.localeCompare(`${right.assetId}:${right.sourceId}`)),
  };
}

function analysisSnapshot(map: ReturnType<typeof buildEpisodeAudioActivityMap>) {
  return {
    schema: "quipsly-episode-audio-activity-analysis-v1",
    programFingerprintSha256: map.programFingerprintSha256,
    programClock: map.programClock,
    programDurationSeconds: map.programDurationSeconds,
    resolution: map.resolution,
    coverage: map.coverage,
    summary: map.summary,
    transcriptEnergyAgreement: map.transcriptEnergyAgreement,
    lanes: map.lanes.map((lane) => ({
      assetId: lane.assetId,
      sourceId: lane.sourceId,
      title: lane.title,
      kind: lane.kind,
      role: lane.role,
      participantId: lane.participantId,
      participantLabel: lane.participantLabel,
      mixDisposition: lane.mixDisposition,
      alignment: lane.alignment,
      programOffsetSeconds: lane.programOffsetSeconds,
      sourceDurationSeconds: lane.sourceDurationSeconds,
      activityThresholdDbfs: lane.activityThresholdDbfs,
      evidenceJobId: lane.evidenceJobId,
      transcriptEvidenceJobId: lane.transcriptEvidenceJobId,
      transcriptWordCount: lane.transcriptWordCount,
      agreement: lane.agreement,
      cells: lane.cells.map((cell) => ({ index: cell.index, programStartSeconds: cell.programStartSeconds, programEndSeconds: cell.programEndSeconds, sourceSeconds: cell.sourceSeconds, rmsDbfs: cell.rmsDbfs, energyActive: cell.energyActive, clippingObserved: cell.clippingObserved, providerWordActive: cell.providerWordActive })),
    })),
    moments: map.moments,
    boundaries: { ...map.boundaries, suggestionsRequireProtectedListening: true, analysisDoesNotAuthorizeReviewDecision: true },
  };
}

export async function loadEpisodeAudioActivityAnalysisContext(input: { prisma: any; projectSlug: string; episodeProductionId: string }) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true, slug: true } });
  if (!project) throw new EpisodeAudioActivityAnalysisError("Nest not found for Episode audio analysis.", 404, "EPISODE_AUDIO_ANALYSIS_PROJECT_NOT_FOUND");
  const episode = await input.prisma.studioEpisodeProduction.findFirst({
    where: { id: input.episodeProductionId, projectId: project.id },
    select: { id: true, slug: true, projectId: true, productionJson: true, timelineJson: true },
  });
  if (!episode) throw new EpisodeAudioActivityAnalysisError("The canonical Episode was not found in this Nest.", 404, "EPISODE_AUDIO_ANALYSIS_EPISODE_NOT_FOUND");
  const importedMedia = canonicalEpisodeImportedMedia(episode.productionJson, episode.timelineJson);
  const programFingerprintSha256 = episodeAudioProgramFingerprint({ episodeProductionId: episode.id, importedMedia });
  const assetIds = [...new Set(importedMedia.map(importedAssetId).filter(Boolean))];
  const sourceIds = [...new Set(importedMedia.map((item) => text(item.sourceId)).filter(Boolean))];
  const recordingIds = [...new Set(importedMedia.map(importedRecordingAssetId).filter(Boolean))];
  const [decisionRows, participants, assets, sources, recordings] = await Promise.all([
    input.prisma.studioEpisodeAudioTrackDecisionReceipt.findMany({ where: { episodeProductionId: episode.id }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }], take: 500 }),
    input.prisma.callParticipant.findMany({ where: { room: { episodeProductionId: episode.id } }, select: { id: true, displayName: true, email: true, role: true, deviceLabel: true, roomId: true }, take: 100 }),
    assetIds.length ? input.prisma.studioMediaAsset.findMany({ where: { id: { in: assetIds }, isProxy: false }, select: { id: true, filename: true, url: true, mimeType: true, duration: true, isProxy: true, assetAttachments: { where: { projectId: project.id }, select: { metadataJson: true } }, processingJobs: { where: { type: { in: ["audio-signal-profile", "source-transcript", "audio-alignment"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 25 }, transcriptJobs: { where: { episodeProductionId: episode.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10, select: { id: true, status: true, _count: { select: { segments: true, words: true } } } } } }) : [],
    sourceIds.length ? input.prisma.studioVideoSource.findMany({ where: { id: { in: sourceIds } }, select: { id: true, url: true, providerSourceId: true } }) : [],
    recordingIds.length ? input.prisma.recordingAsset.findMany({ where: { id: { in: recordingIds } }, select: { id: true, participantId: true, participant: { select: { id: true, displayName: true, email: true } } } }) : [],
  ]);
  const decisionLedger = projectEpisodeAudioTrackDecisions(decisionRows, programFingerprintSha256);
  const assetById = new Map(assets.map((asset: any) => [asset.id, asset]));
  const sourceById = new Map(sources.map((source: any) => [source.id, source]));
  const recordingById = new Map(recordings.map((recording: any) => [recording.id, recording]));
  const publicImported = importedMedia.flatMap((item) => {
    const assetId = importedAssetId(item);
    const sourceId = text(item.sourceId);
    const asset: any = assetById.get(assetId);
    const source: any = sourceById.get(sourceId);
    const attachmentNamesSource = asset?.assetAttachments?.some((attachment: any) => text(object(attachment.metadataJson).sourceId) === sourceId);
    if (!asset || !source?.providerSourceId || source.url !== `/api/ingest/media/${source.id}` || (asset.url !== source.url && !attachmentNamesSource)) {
      throw new EpisodeAudioActivityAnalysisError("Episode analysis requires every analyzed track to remain bound to its exact retained original.", 409, "EPISODE_AUDIO_ANALYSIS_SOURCE_BINDING_INVALID");
    }
    const recordingId = importedRecordingAssetId(item);
    const recording: any = recordingId ? recordingById.get(recordingId) : null;
    return [{
      ...item,
      id: assetId,
      sourceId,
      originalName: text(item.originalName) || asset.filename,
      contentType: text(item.contentType) || asset.mimeType,
      recording: recording ? { participantId: recording.participantId, participant: recording.participant, readiness: { mediaProcessingReleased: true } } : null,
      asset: {
        duration: asset.duration,
        readiness: { sourceSafe: true },
        audioProcessingEvidence: episodeAudioProcessingEvidence(asset.processingJobs, asset.transcriptJobs),
        audioSignalActivityEvidence: episodeAudioSignalActivityEvidence(asset.processingJobs),
        audioTranscriptActivityEvidence: episodeAudioTranscriptActivityEvidence(asset.processingJobs, asset.transcriptJobs),
      },
    }];
  });
  const program = buildEpisodeAudioProgram({
    importedMedia: publicImported,
    audioProgram: {
      fingerprintSha256: programFingerprintSha256,
      decisions: decisionLedger,
      participants: participants.map((participant: any) => ({ ...participant, role: text(participant.role).toLowerCase() || null })),
    },
  });
  const map = buildEpisodeAudioActivityMap(program);
  const analysisInput = episodeAudioActivityAnalysisInput(program, map);
  return { project, episode, importedMedia, programFingerprintSha256, decisionLedger, program, map, analysisInput };
}

function publicReceipt(row: any, context: { fingerprint: string; activeDecisionReceiptIds: string[] }) {
  const input = object(row.inputJson);
  const analysis = object(row.analysisJson);
  const recordedDecisionIds = (Array.isArray(input.activeDecisionReceiptIds) ? input.activeDecisionReceiptIds : []).map((value) => text(value)).filter(Boolean).sort();
  const stale = row.programFingerprintSha256 !== context.fingerprint || stableJson(recordedDecisionIds) !== stableJson(context.activeDecisionReceiptIds);
  return {
    id: String(row.id),
    algorithm: String(row.algorithm),
    programFingerprintSha256: String(row.programFingerprintSha256),
    inputSha256: String(row.inputSha256),
    configurationSha256: String(row.configurationSha256),
    stale,
    coverage: object(analysis.coverage),
    summary: object(analysis.summary),
    transcriptEnergyAgreement: object(analysis.transcriptEnergyAgreement),
    momentCount: Array.isArray(analysis.moments) ? analysis.moments.length : 0,
    actorEmail: String(row.actorEmail),
    analyzedAt: row.analyzedAt?.toISOString?.() ?? String(row.analyzedAt),
    supersedesAnalysisId: row.supersedesAnalysisId ? String(row.supersedesAnalysisId) : null,
    boundaries: { immutableReceipt: true as const, suggestionsRequireProtectedListening: true as const, noTimelineOrMixMutation: true as const },
  };
}

export async function registerEpisodeAudioActivityAnalysis(input: {
  prisma: any;
  actor: Actor;
  projectSlug: string;
  episodeProductionId: string;
  programFingerprintSha256: string;
  clientRequestId: string;
}) {
  const actorUserId = text(input.actor.id, 240);
  const actorEmail = text(input.actor.email, 320).toLowerCase();
  const clientRequestId = text(input.clientRequestId, 160);
  if (!actorUserId || !actorEmail) throw new EpisodeAudioActivityAnalysisError("A signed-in actor is required.", 401, "EPISODE_AUDIO_ANALYSIS_ACTOR_REQUIRED");
  if (!clientRequestId) throw new EpisodeAudioActivityAnalysisError("A stable request id is required.", 400, "EPISODE_AUDIO_ANALYSIS_REQUEST_ID_REQUIRED");
  const context = await loadEpisodeAudioActivityAnalysisContext(input);
  if (text(input.programFingerprintSha256) !== context.programFingerprintSha256) throw new EpisodeAudioActivityAnalysisError("The Episode source set changed. Refresh before analyzing.", 409, "EPISODE_AUDIO_ANALYSIS_PROGRAM_CHANGED");
  const configurationSha256 = sha256(context.analysisInput.configuration);
  const inputSha256 = sha256(context.analysisInput);
  const snapshot = analysisSnapshot(context.map);
  const request = { schema: "quipsly-episode-audio-activity-analysis-request-v1", projectId: context.project.id, episodeProductionId: context.episode.id, actorUserId, actorEmail, clientRequestId, programFingerprintSha256: context.programFingerprintSha256, configurationSha256, inputSha256 };
  const requestSha256 = sha256(request);
  const currentProjection = { fingerprint: context.programFingerprintSha256, activeDecisionReceiptIds: context.program.activeDecisions.map((decision) => decision.id).sort() };
  const stored = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `episode-audio-analysis:${context.episode.id}`);
    const replay = await tx.studioEpisodeAudioAnalysisReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } } });
    if (replay) {
      if (replay.requestSha256 !== requestSha256) throw new EpisodeAudioActivityAnalysisError("That request id belongs to a different Episode audio analysis.", 409, "EPISODE_AUDIO_ANALYSIS_IDEMPOTENCY_CONFLICT");
      return { row: replay, idempotentReplay: true, reusedInput: false };
    }
    const sameInput = await tx.studioEpisodeAudioAnalysisReceipt.findUnique({ where: { episodeProductionId_inputSha256: { episodeProductionId: context.episode.id, inputSha256 } } });
    if (sameInput) return { row: sameInput, idempotentReplay: true, reusedInput: true };
    const freshEpisode = await tx.studioEpisodeProduction.findUnique({ where: { id: context.episode.id }, select: { productionJson: true, timelineJson: true } });
    const freshImported = freshEpisode ? canonicalEpisodeImportedMedia(freshEpisode.productionJson, freshEpisode.timelineJson) : [];
    if (!freshEpisode || episodeAudioProgramFingerprint({ episodeProductionId: context.episode.id, importedMedia: freshImported }) !== context.programFingerprintSha256) throw new EpisodeAudioActivityAnalysisError("The Episode source set changed during analysis registration.", 409, "EPISODE_AUDIO_ANALYSIS_PROGRAM_CHANGED");
    const freshDecisions = await tx.studioEpisodeAudioTrackDecisionReceipt.findMany({ where: { episodeProductionId: context.episode.id }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }], take: 500 });
    const freshLedger = projectEpisodeAudioTrackDecisions(freshDecisions, context.programFingerprintSha256);
    if (stableJson(activeDecisionIds(freshLedger)) !== stableJson(currentProjection.activeDecisionReceiptIds)) throw new EpisodeAudioActivityAnalysisError("Canonical track decisions changed during analysis registration.", 409, "EPISODE_AUDIO_ANALYSIS_DECISIONS_CHANGED");
    const previous = await tx.studioEpisodeAudioAnalysisReceipt.findFirst({ where: { episodeProductionId: context.episode.id }, orderBy: [{ analyzedAt: "desc" }, { id: "desc" }] });
    const now = new Date();
    const row = await tx.studioEpisodeAudioAnalysisReceipt.create({ data: {
      projectId: context.project.id,
      episodeProductionId: context.episode.id,
      supersedesAnalysisId: previous?.id ?? null,
      actorUserId,
      actorEmail,
      clientRequestId,
      programFingerprintSha256: context.programFingerprintSha256,
      algorithm: context.analysisInput.algorithm,
      configurationSha256,
      inputSha256,
      requestSha256,
      inputJson: json(context.analysisInput),
      analysisJson: json(snapshot),
      analyzedAt: now,
    } });
    return { row, idempotentReplay: false, reusedInput: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ok: true, idempotentReplay: stored.idempotentReplay, reusedInput: stored.reusedInput, analysis: publicReceipt(stored.row, currentProjection), snapshot: stored.row.analysisJson };
}

export async function readEpisodeAudioActivityAnalyses(input: { prisma: any; projectSlug: string; episodeProductionId: string }) {
  const context = await loadEpisodeAudioActivityAnalysisContext(input);
  const rows = await input.prisma.studioEpisodeAudioAnalysisReceipt.findMany({ where: { episodeProductionId: context.episode.id }, orderBy: [{ analyzedAt: "desc" }, { id: "desc" }], take: 20 });
  const projection = { fingerprint: context.programFingerprintSha256, activeDecisionReceiptIds: context.program.activeDecisions.map((decision) => decision.id).sort() };
  return {
    schema: "quipsly-episode-audio-activity-analysis-ledger-v1" as const,
    currentInputSha256: sha256(context.analysisInput),
    analyses: rows.map((row: any) => publicReceipt(row, projection)),
    latest: rows[0] ? publicReceipt(rows[0], projection) : null,
    boundaries: { appendOnly: true as const, sourcesRemainImmutable: true as const, suggestionsRequireProtectedListening: true as const, noTimelineOrMixMutation: true as const },
  };
}
