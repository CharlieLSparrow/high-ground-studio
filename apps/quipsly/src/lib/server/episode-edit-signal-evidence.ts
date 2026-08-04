import "server-only";

import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { canonicalEpisodeImportedMedia } from "@/lib/episode-production/imported-media";
import type { AiEditSignalVisualization } from "@/lib/editor/ai-edit-proposal-contract";
import { compactSignalWaveform, parseAudioSignalEvidence, type AudioTranscriptEvidence } from "@/lib/transcript-evidence";
import { mobileCaptureMediaProcessingGate } from "@/lib/server/mobile-capture-processing-gates";

type JsonRecord = Record<string, unknown>;
type ParsedSignal = NonNullable<AudioTranscriptEvidence["audio"]["signal"]>;

export type BoundEpisodeAudioSignalEvidence = {
  recordingAssetId: string;
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
    recordingAssetId: evidence.recordingAssetId,
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

function recordingAssetId(item: JsonRecord) {
  const metadata = object(item.metadata);
  const metadataSync = object(metadata.recordingSync);
  const sync = object(item.sync);
  const syncRecording = object(sync.recordingSync);
  return text(item.recordingAssetId)
    || text(metadataSync.recordingAssetId)
    || text(sync.recordingAssetId)
    || text(syncRecording.recordingAssetId);
}

function sourceSignal(recording: any): BoundEpisodeAudioSignalEvidence | null {
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
    recordingAssetId: text(recording.id),
    sourceSha256,
    storageGeneration: text(manifest.storageGeneration) || null,
    signalProfileSha256,
    signal,
    protectedPlayback,
  };
}

/**
 * Resolves decoded signal evidence only when one immutable, verified, released
 * Capture source is unambiguous for the episode. Multiple sources require an
 * explicit editor source selection; Quipsly never guesses which waveform owns
 * a transcript.
 */
export async function loadEpisodeEditSignalEvidence(input: {
  prisma: PrismaClient;
  projectId: string;
  projectSlug: string;
  episodeSlug: string;
}): Promise<EpisodeEditSignalEvidenceResolution> {
  const prisma = input.prisma as any;
  const production = await prisma.studioEpisodeProduction.findUnique({
    where: { projectId_slug: { projectId: input.projectId, slug: input.episodeSlug } },
    select: { productionJson: true, timelineJson: true },
  });
  if (!production) {
    return { status: "unavailable", reason: "The episode production record does not exist.", evidence: null, candidateCount: 0 };
  }

  const recordingAssetIds = [...new Set(
    canonicalEpisodeImportedMedia(production.productionJson, production.timelineJson)
      .map(recordingAssetId)
      .filter(Boolean),
  )];
  if (!recordingAssetIds.length) {
    return { status: "unavailable", reason: "No Capture recording is attached to this episode.", evidence: null, candidateCount: 0 };
  }

  const recordings = await prisma.recordingAsset.findMany({
    where: {
      id: { in: recordingAssetIds },
      room: {
        OR: [
          { projectId: input.projectId },
          { projectSlug: input.projectSlug },
          { nestSlug: input.projectSlug },
        ],
      },
    },
  });

  const candidates = recordings.flatMap((recording: any) => {
    const evidence = sourceSignal(recording);
    return evidence ? [{ recording, evidence }] : [];
  });
  if (!candidates.length) {
    return {
      status: "unavailable",
      reason: "Attached recordings do not have immutable decoded signal evidence yet.",
      evidence: null,
      candidateCount: 0,
    };
  }

  const released = [] as BoundEpisodeAudioSignalEvidence[];
  let heldCount = 0;
  for (const candidate of candidates) {
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
      candidateCount: candidates.length,
    };
  }
  if (released.length > 1) {
    return {
      status: "ambiguous",
      reason: "Multiple released signal-bearing recordings are attached. Select the transcript's source before signal corroboration.",
      evidence: null,
      candidateCount: released.length,
    };
  }

  return {
    status: "available",
    reason: "One immutable, verified, released Capture signal profile is bound to this episode.",
    evidence: released[0]!,
    candidateCount: 1,
  };
}
