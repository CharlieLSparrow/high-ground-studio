import type {
  AudioDeliveryStatus,
  AudioMasterPromotionSummary,
  AudioMasteryMeasurement,
  AudioSignalDiagnosisSummary,
} from "../editor/AudioMasteryAudition";
import { parseAudioSignalEvidence, type AudioTranscriptEvidence } from "@/lib/transcript-evidence";
import { parseAudibleEventDetectorReceipt, type AudibleEventDetectorReceipt } from "@/lib/audio/audible-event-analysis";
import type { AudioSignalProfileClientStatus, StudioSourceTranscriptClientStatus } from "@/lib/media-workflow-client-status";

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
    sha256: string;
    sizeBytes: number;
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
  audibleEventAnalysis: AudibleEventDetectorReceipt | null;
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
    const sync = record(raw.sync);
    const recordingSync = record(sync.recordingSync);
    const reportedSourceProfile = record(recordingSync.reportedSourceProfile);
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
      audibleEventAnalysis: parseAudibleEventDetectorReceipt(reportedSourceProfile.audibleEventAnalysis),
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

export type AudioWorkspaceGuideState = "complete" | "attention" | "available" | "held";

export type AudioWorkspaceGuideItem = {
  id: "source" | "program" | "evidence" | "finish";
  label: string;
  href: string;
  state: AudioWorkspaceGuideState;
  statusLabel: string;
  detail: string;
};

export type AudioWorkspaceGuide = {
  items: AudioWorkspaceGuideItem[];
  next: {
    href: string;
    label: string;
    detail: string;
  };
};

export function audioWorkspaceGuide({
  asset,
  program,
  signalStatus,
  transcriptStatus,
  masteryStatus,
}: {
  asset: Pick<AudioWorkspaceAsset, "canProcess" | "canTranscribe" | "sourceSafe" | "safeNextAction">;
  program: {
    includedTrackCount: number;
    alignedIncludedTrackCount: number;
    hasProgramClock: boolean;
  };
  signalStatus: AudioSignalProfileClientStatus | null;
  transcriptStatus: StudioSourceTranscriptClientStatus | null;
  masteryStatus: AudioMasteryClientStatus | null;
}): AudioWorkspaceGuide {
  const sourceHeld = !asset.sourceSafe || (!asset.canProcess && !asset.canTranscribe);
  const sourceLimited = !sourceHeld && (!asset.canProcess || !asset.canTranscribe);
  const sourceDetail = sourceHeld
    ? asset.safeNextAction
    : sourceLimited
      ? `${asset.canProcess ? "Media processing released" : "Media processing held"} · ${asset.canTranscribe ? "transcription released" : "transcription held"}.`
      : "Immutable playback and source identity are available.";
  const programReady = program.includedTrackCount > 0
    && program.hasProgramClock
    && program.alignedIncludedTrackCount >= program.includedTrackCount;
  const signalReady = signalStatus?.status === "completed" && Boolean(signalStatus.audioSignal);
  const transcriptReady = transcriptStatus?.status === "completed" && (transcriptStatus.coverage?.segmentCount ?? 0) > 0;
  const transcriptNeedsReview = transcriptStatus?.quality?.disposition === "review-required";
  const evidenceFailed = signalStatus?.status === "failed"
    || signalStatus?.status === "blocked"
    || transcriptStatus?.status === "failed";
  const lifecycle = audioMasteryLifecycle(masteryStatus);
  const finishedCount = lifecycle.filter((step) => step.complete).length;
  const deliveryComplete = lifecycle.every((step) => step.complete);
  const finishNeedsReview = Boolean(
    masteryStatus?.status === "failed"
    || masteryStatus?.status === "blocked"
    || (masteryStatus?.derivative?.playbackUrl && masteryStatus.review.latest?.decision !== "approved")
    || (masteryStatus?.delivery.status === "completed" && masteryStatus.delivery.review.latest?.decision !== "approved"),
  );

  const items: AudioWorkspaceGuideItem[] = [
    {
      id: "source",
      label: "Source",
      href: "#selected-source",
      state: sourceHeld ? "held" : sourceLimited ? "attention" : "complete",
      statusLabel: sourceHeld ? "Held" : sourceLimited ? "Partially released" : "Retained",
      detail: sourceDetail,
    },
    {
      id: "program",
      label: "Map & align",
      href: "#audio-program",
      state: programReady ? "complete" : "attention",
      statusLabel: programReady ? "Shared clock ready" : "Needs decisions",
      detail: `${program.alignedIncludedTrackCount}/${program.includedTrackCount} included tracks aligned${program.hasProgramClock ? "" : " · no program clock"}.`,
    },
    {
      id: "evidence",
      label: "Inspect",
      href: "#source-clock",
      state: evidenceFailed || transcriptNeedsReview ? "attention" : signalReady && transcriptReady ? "complete" : sourceHeld ? "held" : "available",
      statusLabel: evidenceFailed
        ? "Retry evidence"
        : transcriptNeedsReview
          ? "Listen first"
          : signalReady && transcriptReady
            ? "Evidence assembled"
            : "Available",
      detail: transcriptNeedsReview
        ? "Provider timing or confidence triage requires protected listening."
        : `${signalReady ? "Signal map ready" : "Signal map pending"} · ${transcriptReady ? "timed transcript ready" : "transcript pending"}.`,
    },
    {
      id: "finish",
      label: "Finish & prove",
      href: masteryStatus?.derivative?.playbackUrl ? "#mastery-audition" : "#source-measurement",
      state: deliveryComplete ? "complete" : finishNeedsReview ? "attention" : !asset.canProcess ? "held" : "available",
      statusLabel: deliveryComplete ? "Proof complete" : finishNeedsReview ? "Human review due" : !asset.canProcess ? "Media held" : "Available",
      detail: `${finishedCount}/${lifecycle.length} source-to-delivery gates complete.`,
    },
  ];

  let next = {
    href: "#audio-program",
    label: "Map the retained tracks",
    detail: "Choose the program clock and make every included source's role explicit.",
  };
  if (sourceHeld) {
    next = { href: "#selected-source", label: "Resolve the source hold", detail: asset.safeNextAction };
  } else if (!programReady) {
    next = {
      href: "#audio-program",
      label: program.hasProgramClock ? "Finish source alignment" : "Choose the program clock",
      detail: `${program.alignedIncludedTrackCount}/${program.includedTrackCount} included tracks currently share qualified alignment evidence.`,
    };
  } else if (!asset.canProcess) {
    next = { href: "#selected-source", label: "Release media processing", detail: asset.safeNextAction };
  } else if (!signalReady) {
    next = { href: "#source-clock", label: "Build the decoded signal map", detail: "Measure the complete source before interpreting or treating it." };
  } else if (!asset.canTranscribe) {
    next = { href: "#selected-source", label: "Resolve the transcription hold", detail: asset.safeNextAction };
  } else if (!transcriptReady) {
    next = { href: "#source-clock", label: "Create the timed transcript", detail: "Keep provider words and confidence attached to the same immutable source clock." };
  } else if (transcriptNeedsReview) {
    next = { href: "#source-clock", label: "Review suspicious transcript evidence", detail: "Listen to the deterministic attention queue before trusting or correcting provider output." };
  } else if (masteryStatus?.status !== "completed") {
    next = { href: "#source-measurement", label: "Measure and prepare a mastering preview", detail: "Create a verified, reversible proposal from the complete source decode." };
  } else if (masteryStatus.derivative?.playbackUrl && masteryStatus.review.latest?.decision !== "approved") {
    next = { href: "#mastery-audition", label: "Compare source and preview", detail: "Use matched-level playback before approving or rejecting the candidate." };
  } else if (!deliveryComplete) {
    next = { href: "#mastery-audition", label: "Finish the delivery proof", detail: `${finishedCount}/${lifecycle.length} gates are complete; continue from the first open gate.` };
  } else {
    next = { href: "#mastery-audition", label: "Delivery proof is complete", detail: "The exact encoded output has an explicit human playback receipt." };
  }

  return { items, next };
}
