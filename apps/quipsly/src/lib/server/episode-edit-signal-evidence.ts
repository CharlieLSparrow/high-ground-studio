import "server-only";

import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { parseAudioSignalProfileJob, parseAudioSignalProfileResult } from "@high-ground/quipsly-media-processing";

import { canonicalEpisodeImportedMedia } from "@/lib/episode-production/imported-media";
import type { AiEditMediaAssetKind, AiEditSignalVisualization } from "@/lib/editor/ai-edit-proposal-contract";
import { compactSignalWaveform, parseAudioSignalEvidence, type AudioTranscriptEvidence } from "@/lib/transcript-evidence";
import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { mobileCaptureMediaProcessingGate } from "@/lib/server/mobile-capture-processing-gates";

type JsonRecord = Record<string, unknown>;
type ParsedSignal = NonNullable<AudioTranscriptEvidence["audio"]["signal"]>;

export type BoundEpisodeAudioSignalEvidence = {
  mediaAssetKind: AiEditMediaAssetKind;
  mediaAssetId: string;
  sourceSha256: string;
  storageGeneration: string | null;
  signalProfileSha256: string;
  signal: ParsedSignal;
  protectedPlayback: AiEditSignalVisualization["protectedPlayback"];
};

export type EpisodeEditSignalEvidenceResolution = {
  status: "available" | "unavailable" | "ambiguous" | "held";
  reason: string;
  evidence: BoundEpisodeAudioSignalEvidence | null;
  candidateCount: number;
};

export function episodeEditSignalVisualization(
  evidence: BoundEpisodeAudioSignalEvidence,
  maximumWaveformPoints = 180,
): AiEditSignalVisualization {
  const maximum = Math.max(1, Math.min(360, Math.trunc(maximumWaveformPoints)));
  return {
    mediaAssetKind: evidence.mediaAssetKind,
    mediaAssetId: evidence.mediaAssetId,
    sourceSha256: evidence.sourceSha256,
    storageGeneration: evidence.storageGeneration,
    signalProfileSha256: evidence.signalProfileSha256,
    algorithm: evidence.signal.algorithm,
    durationSeconds: evidence.signal.durationSeconds,
    nearSilenceDbfs: evidence.signal.thresholds.nearSilenceDbfs,
    surroundingSignalDbfs: evidence.signal.thresholds.surroundingSignalDbfs,
    protectedPlayback: evidence.protectedPlayback,
    waveform: compactSignalWaveform(evidence.signal.waveform, maximum),
  };
}

const SHA256 = /^[0-9a-f]{64}$/;

function object(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function captureRecordingAssetId(item: JsonRecord) {
  const metadata = object(item.metadata);
  const metadataSync = object(metadata.recordingSync);
  const sync = object(item.sync);
  const syncRecording = object(sync.recordingSync);
  return text(item.recordingAssetId)
    || text(metadataSync.recordingAssetId)
    || text(sync.recordingAssetId)
    || text(syncRecording.recordingAssetId);
}

function captureSourceSignal(recording: any): BoundEpisodeAudioSignalEvidence | null {
  if (recording?.status !== "VERIFIED") return null;
  const manifest = object(recording?.localManifestJson);
  const profile = object(manifest.reportedSourceProfile);
  // Edit evidence keeps the on-device bounded waveform at its full validated
  // resolution. The 180-point projection remains appropriate for UI display,
  // but exact gap corroboration must not infer coverage across compacted spans.
  const signal = parseAudioSignalEvidence(profile.audioSignal, { maximumWaveformPoints: 1_200 });
  const sourceSha256 = (text(manifest.checksumSha256) || text(recording?.checksum)).toLowerCase();
  if (!signal || !SHA256.test(sourceSha256)) return null;
  const signalProfileSha256 = createHash("sha256")
    .update(JSON.stringify(signal))
    .digest("hex");
  const promotion = object(manifest.promotion);
  const sourceId = text(promotion.sourceId);
  const playbackUrl = text(promotion.playbackUrl);
  const protectedPlayback = sourceId && playbackUrl === `/api/ingest/media/${sourceId}`
    ? {
      sourceId,
      url: playbackUrl,
      kind: text(promotion.mediaKind) === "video" ? "video" as const : "audio" as const,
      label: text(recording.fileName) || "Protected Capture source",
      durationSeconds: typeof recording.durationSeconds === "number" ? recording.durationSeconds : null,
    }
    : null;
  return {
    mediaAssetKind: "capture-recording",
    mediaAssetId: text(recording.id),
    sourceSha256,
    storageGeneration: text(manifest.storageGeneration) || null,
    signalProfileSha256,
    signal,
    protectedPlayback,
  };
}

function studioMediaCoordinates(item: JsonRecord) {
  return {
    assetId: text(item.id) || text(item.assetId),
    sourceId: text(item.sourceId),
  };
}

function matchesSelectedMedia(item: JsonRecord, selectedMediaAssetId: string) {
  if (!selectedMediaAssetId) return true;
  const studio = studioMediaCoordinates(item);
  return [studio.assetId, studio.sourceId, captureRecordingAssetId(item)].includes(selectedMediaAssetId);
}

function studioParsedSignal(profile: ReturnType<typeof parseAudioSignalProfileResult>["audioSignal"]): ParsedSignal {
  const parsed = parseAudioSignalEvidence(profile, { maximumWaveformPoints: 1_200 });
  if (!parsed) throw new Error("Completed Studio signal evidence could not be projected into the shared source-clock model.");
  return parsed;
}

async function loadStudioSignalCandidates(input: {
  prisma: any;
  projectId: string;
  items: JsonRecord[];
}) {
  const coordinates = input.items.map(studioMediaCoordinates).filter((item) => item.assetId && item.sourceId);
  if (!coordinates.length) return { evidence: [] as BoundEpisodeAudioSignalEvidence[], heldCount: 0 };
  const assetIds = [...new Set(coordinates.map((item) => item.assetId))];
  const sourceIds = [...new Set(coordinates.map((item) => item.sourceId))];
  const [jobs, assets, sources] = await Promise.all([
    input.prisma.studioAssetProcessingJob.findMany({
      where: { projectId: input.projectId, assetId: { in: assetIds }, type: "audio-signal-profile", status: "completed" },
      orderBy: { createdAt: "desc" },
    }),
    input.prisma.studioMediaAsset.findMany({
      where: { id: { in: assetIds } },
      include: { assetAttachments: { where: { projectId: input.projectId }, select: { metadataJson: true } } },
    }),
    input.prisma.studioVideoSource.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, url: true, providerSourceId: true },
    }),
  ]);
  const jobByAsset = new Map<string, any>();
  for (const job of jobs) if (!jobByAsset.has(job.assetId)) jobByAsset.set(job.assetId, job);
  const assetById = new Map<string, any>(assets.map((asset: any) => [asset.id, asset]));
  const sourceById = new Map<string, any>(sources.map((source: any) => [source.id, source]));
  const evidence: BoundEpisodeAudioSignalEvidence[] = [];
  let heldCount = 0;

  for (const coordinate of coordinates) {
    const jobRow = jobByAsset.get(coordinate.assetId);
    const asset = assetById.get(coordinate.assetId);
    const source = sourceById.get(coordinate.sourceId);
    const attachmentNamesSource = asset?.assetAttachments?.some((attachment: any) => object(attachment.metadataJson).sourceId === coordinate.sourceId);
    if (!jobRow || !asset || asset.isProxy || !asset.assetAttachments?.length || !source?.providerSourceId || source.url !== `/api/ingest/media/${source.id}` || (asset.url !== source.url && !attachmentNamesSource)) continue;
    try {
      const job = parseAudioSignalProfileJob(jobRow.inputJson, jobRow.id);
      const result = parseAudioSignalProfileResult(object(jobRow.resultJson).receipt, job);
      const current = await inspectImmutableStudioMediaSource(source.providerSourceId, asset.mimeType);
      if (job.source.assetId !== asset.id || current.sha256 !== job.source.sha256 || current.generation !== job.source.generation || current.sizeBytes !== job.source.sizeBytes) {
        heldCount += 1;
        continue;
      }
      const signal = studioParsedSignal(result.audioSignal);
      evidence.push({
        mediaAssetKind: "studio-media",
        mediaAssetId: asset.id,
        sourceSha256: current.sha256,
        storageGeneration: current.generation,
        signalProfileSha256: createHash("sha256").update(JSON.stringify(signal)).digest("hex"),
        signal,
        protectedPlayback: {
          sourceId: source.id,
          url: source.url,
          kind: String(asset.mimeType || "").startsWith("video/") ? "video" : "audio",
          label: text(asset.filename) || "Protected Studio source",
          durationSeconds: result.media.durationSeconds,
        },
      });
    } catch {
      heldCount += 1;
    }
  }
  return { evidence, heldCount };
}

/**
 * Resolves decoded signal evidence from either Capture or Studio media only
 * when one immutable source is explicit or unambiguous. Quipsly never guesses
 * which waveform owns a transcript in a multi-source episode.
 */
export async function loadEpisodeEditSignalEvidence(input: {
  prisma: PrismaClient;
  projectId: string;
  projectSlug: string;
  episodeSlug: string;
  selectedMediaAssetId?: string | null;
}): Promise<EpisodeEditSignalEvidenceResolution> {
  const prisma = input.prisma as any;
  const production = await prisma.studioEpisodeProduction.findUnique({
    where: { projectId_slug: { projectId: input.projectId, slug: input.episodeSlug } },
    select: { productionJson: true, timelineJson: true },
  });
  if (!production) {
    return { status: "unavailable", reason: "The episode production record does not exist.", evidence: null, candidateCount: 0 };
  }

  const selectedMediaAssetId = text(input.selectedMediaAssetId);
  const imported = canonicalEpisodeImportedMedia(production.productionJson, production.timelineJson);
  const selectedItems = imported.filter((item) => matchesSelectedMedia(item, selectedMediaAssetId));
  if (selectedMediaAssetId && !selectedItems.length) {
    return { status: "unavailable", reason: "The selected edit source is not attached to this episode.", evidence: null, candidateCount: 0 };
  }
  if (!selectedItems.length) {
    return { status: "unavailable", reason: "No episode media is attached for edit evidence.", evidence: null, candidateCount: 0 };
  }

  const recordingAssetIds = [...new Set(selectedItems.map(captureRecordingAssetId).filter(Boolean))];
  const recordings = recordingAssetIds.length ? await prisma.recordingAsset.findMany({
    where: { id: { in: recordingAssetIds }, room: { OR: [{ projectId: input.projectId }, { projectSlug: input.projectSlug }, { nestSlug: input.projectSlug }] } },
  }) : [];
  const captureCandidates = recordings.flatMap((recording: any) => {
    const candidate = captureSourceSignal(recording);
    return candidate ? [{ recording, evidence: candidate }] : [];
  });
  const studioCandidates = await loadStudioSignalCandidates({ prisma, projectId: input.projectId, items: selectedItems });
  if (!captureCandidates.length && !studioCandidates.evidence.length) {
    return {
      status: studioCandidates.heldCount ? "held" : "unavailable",
      reason: studioCandidates.heldCount
        ? "Attached Studio signal evidence no longer matches its immutable source receipt."
        : "Attached media does not have immutable decoded signal evidence yet.",
      evidence: null,
      candidateCount: studioCandidates.heldCount,
    };
  }

  const released = [...studioCandidates.evidence];
  let heldCount = studioCandidates.heldCount;
  for (const candidate of captureCandidates) {
    const gate = await mobileCaptureMediaProcessingGate({ prisma, recordingAsset: candidate.recording })
      .catch(() => ({ allowed: false }));
    if (gate.allowed) released.push(candidate.evidence);
    else heldCount += 1;
  }

  if (!released.length) {
    return {
      status: heldCount ? "held" : "unavailable",
      reason: heldCount
        ? "Decoded signal evidence exists, but normalized media processing release is still held."
        : "No released decoded signal evidence is available.",
      evidence: null,
      candidateCount: heldCount,
    };
  }
  const uniqueReleased = released.filter((candidate, index) => released.findIndex((other) => other.sourceSha256 === candidate.sourceSha256) === index);
  if (uniqueReleased.length > 1) {
    return {
      status: "ambiguous",
      reason: "Multiple signal-bearing media sources are attached. Select the transcript's exact source before analysis.",
      evidence: null,
      candidateCount: uniqueReleased.length,
    };
  }

  return {
    status: "available",
    reason: `One immutable ${uniqueReleased[0]!.mediaAssetKind === "studio-media" ? "Studio" : "Capture"} signal profile is bound to this edit analysis.`,
    evidence: uniqueReleased[0]!,
    candidateCount: 1,
  };
}
