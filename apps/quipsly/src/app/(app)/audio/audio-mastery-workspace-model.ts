import type {
  AudioDeliveryStatus,
  AudioMasterPromotionSummary,
  AudioMasteryMeasurement,
  AudioSignalDiagnosisSummary,
} from "../editor/AudioMasteryAudition";
import { parseAudioSignalEvidence, type AudioTranscriptEvidence } from "@/lib/transcript-evidence";
import type { AudioSignalProfileClientStatus } from "@/lib/media-workflow-client-status";

export type { AudioSignalProfileClientStatus, StudioSourceTranscriptClientStatus } from "@/lib/media-workflow-client-status";

export type AudioMasteryClientStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "blocked" | "failed";
  profileId: "apple-podcasts-dialogue-v1" | "ebu-r128-broadcast-v1" | null;
  sourceMeasurement: AudioMasteryMeasurement | null;
  signalDiagnosis: AudioSignalDiagnosisSummary | null;
  proposal: null | {
    action: "no-change" | "render-loudness-master";
    assessment: {
      integratedStatus: string;
      truePeakStatus: string;
      integratedDeltaLu: number;
      passes: boolean;
    };
    profile: {
      id: string;
      label: string;
      integratedLufs: number;
      maximumTruePeakDbtp: number;
      renderTruePeakDbtp: number;
    };
  };
  derivative: null | {
    playbackUrl: string | null;
    verification: {
      integratedStatus: string;
      truePeakStatus: string;
      integratedDeltaLu: number;
      passes: boolean;
    };
    measured: AudioMasteryMeasurement;
  };
  review: {
    latest: null | {
      id: string;
      jobId: string;
      decision: "approved" | "rejected";
      note: string | null;
      reviewedAt: string;
      actorEmail: string;
    };
    approvalCount: number;
    rejectionCount: number;
  };
  promotion: AudioMasterPromotionSummary;
  delivery: AudioDeliveryStatus;
  error: string | null;
  updatedAt: string | null;
  boundaries: {
    originalRemainsSourceTruth: true;
    outputIsUnpromotedPreview: true;
    explicitApprovalStillRequired: true;
  };
};

export type AudioWorkspaceEpisodeOption = {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
};

export type AudioWorkspaceProjectOption = {
  id: string;
  slug: string;
  name: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  episodes: AudioWorkspaceEpisodeOption[];
};

export type AudioWorkspaceAsset = {
  id: string;
  sourceId: string;
  originalName: string;
  kind: string | null;
  contentType: string | null;
  importRole: string | null;
  recordingAssetId: string | null;
  unresolvedRecordingReference: boolean;
  syncStatus: string | null;
  playbackUrl: string;
  safeNextAction: string;
  sourceSafe: boolean;
  mediaProcessingReleased: boolean | null;
  transcriptProcessingReleased: boolean | null;
  canProcess: boolean;
  canTranscribe: boolean;
};

export type AudioWorkspaceInventory = {
  ok: true;
  project: { id: string; slug: string; name: string };
  episode: {
    found: boolean;
    id?: string;
    slug: string;
    title?: string;
    status?: string;
    updatedAt?: string | null;
  };
  importedMedia: Array<Record<string, unknown>>;
  summary: {
    importedMediaCount: number;
    audioCount?: number;
    videoCount?: number;
    mediaHeldCount?: number;
    transcriptHeldCount?: number;
    activeAudioMasterCandidateCount?: number;
    verifiedAudioDeliveryArtifactCount?: number;
    approvedAudioDeliveryArtifactCount?: number;
  };
  safeNextActions: string[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function audioWorkspaceAssets(inventory: AudioWorkspaceInventory | null) {
  if (!inventory) return [];

  return inventory.importedMedia.flatMap((raw): AudioWorkspaceAsset[] => {
    const storage = record(raw.storage);
    const asset = record(raw.asset);
    const recording = record(raw.recording);
    const assetReadiness = record(asset.readiness);
    const recordingReadiness = record(recording.readiness);
    const id = text(raw.id);
    const sourceId = text(raw.sourceId);
    const playbackUrl = text(storage.playbackUrl);
    const kind = text(raw.kind) || null;
    const contentType = text(raw.contentType) || null;
    const hasAudio = kind === "audio"
      || kind === "video"
      || Boolean(contentType?.startsWith("audio/"))
      || Boolean(contentType?.startsWith("video/"));

    if (!id || !sourceId || !playbackUrl || !hasAudio) return [];

    const sourceSafe = assetReadiness.sourceSafe !== false;
    const mediaProcessingReleased = Object.keys(recording).length
      ? recordingReadiness.mediaProcessingReleased === true
      : null;
    const transcriptProcessingReleased = Object.keys(recording).length
      ? recordingReadiness.transcriptProcessingReleased === true
      : null;

    return [{
      id,
      sourceId,
      originalName: text(raw.originalName) || "Unnamed source",
      kind,
      contentType,
      importRole: text(raw.importRole) || null,
      recordingAssetId: text(raw.recordingAssetId) || null,
      unresolvedRecordingReference: raw.unresolvedRecordingReference === true,
      syncStatus: text(raw.syncStatus) || null,
      playbackUrl,
      safeNextAction: text(raw.safeNextAction) || "Review this source before processing.",
      sourceSafe,
      mediaProcessingReleased,
      transcriptProcessingReleased,
      canProcess: sourceSafe
        && raw.unresolvedRecordingReference !== true
        && mediaProcessingReleased !== false,
      canTranscribe: sourceSafe
        && raw.unresolvedRecordingReference !== true
        && transcriptProcessingReleased !== false,
    }];
  });
}

export function audioWorkspaceSignal(
  status: AudioSignalProfileClientStatus | null,
  maximumWaveformPoints = 1_200,
): AudioTranscriptEvidence["audio"]["signal"] {
  return parseAudioSignalEvidence(status?.audioSignal, { maximumWaveformPoints });
}

export function audioMasteryLifecycle(status: AudioMasteryClientStatus | null) {
  const previewReady = Boolean(status?.status === "completed" && status.derivative?.playbackUrl);
  const approved = status?.review.latest?.decision === "approved";
  const promoted = Boolean(
    status?.promotion.active
    && status.jobId
    && status.promotion.activePromotion?.jobId === status.jobId,
  );
  const deliveryReady = status?.delivery.status === "completed" && Boolean(status.delivery.output?.playbackUrl);
  const deliveryApproved = status?.delivery.review.latest?.decision === "approved";

  return [
    { id: "measure", label: "Measure", complete: status?.status === "completed", detail: "Complete source decode" },
    { id: "audition", label: "Audition", complete: previewReady ? approved : status?.proposal?.action === "no-change", detail: previewReady ? "Source and preview" : "Target decision" },
    { id: "promote", label: "Promote", complete: promoted, detail: "Approved candidate" },
    { id: "deliver", label: "Deliver", complete: deliveryReady, detail: "Verified encoded bytes" },
    { id: "proof", label: "Proof-listen", complete: deliveryApproved, detail: "Human playback receipt" },
  ] as const;
}
