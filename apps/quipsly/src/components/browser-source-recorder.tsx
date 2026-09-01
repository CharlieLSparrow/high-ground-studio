"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  HardDrive,
  Layers3,
  LoaderCircle,
  Mic2,
  RefreshCw,
  ShieldCheck,
  Square,
  UploadCloud,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  QUIPSLY_BROWSER_SOURCE_CAPTURE_KIND,
  browserSourceCanBegin,
  browserSourceFileExtension,
  browserSourceNextUploadChunk,
  browserSourcePersistedBytes,
  browserSourceRecordingSegments,
  chooseBrowserSourceMimeType,
  type BrowserSourceCaptureLedger,
  type BrowserSourceCaptureMeterSummary,
  type BrowserSourceCaptureMeterSummaryV2,
  type BrowserSourceKind,
} from "@high-ground/quipsly-domain";
import {
  browserSourceVaultReadiness,
  createBrowserSourceDurableWriter,
  downloadBrowserSource,
  hashBrowserSourceFile,
  listBrowserSourceLedgersForParticipant,
  loadBrowserSourceFile,
  saveBrowserSourceLedger,
  type BrowserSourceDurableWriter,
} from "@/lib/browser-source-vault";
import { publishBrowserEndpointQueue } from "@/lib/browser-endpoint-queue";
import {
  browserMonotonicNanoseconds,
  mergeBrowserCaptureClockSamples,
  measureBrowserCaptureClockBurst,
} from "@/lib/browser-capture-clock";
import { dispatchQuipslyProductEvent } from "@/lib/product-analytics";
import {
  browserCaptureAutoHandoffAttempt,
  browserCaptureStudioHandoff,
  browserCaptureStudioReviewHref,
  type BrowserCaptureStudioHandoff,
} from "@/lib/browser-capture-studio-handoff";
import {
  analyseStudioAudioFrame,
  appendBrowserCaptureMeterAggregate,
  appendBrowserCaptureMeterFrame,
  createBrowserCaptureMeterSummary,
  finishBrowserCaptureMeterSummary,
  parseBrowserMeterWorkletAggregate,
  studioAudioSignalState,
} from "@/lib/studio-audio-meter";
import type {
  BrowserRetainedSourceGuardianEvidence,
  BrowserRetainedSourceIssue,
  BrowserRetainedSourceStatus,
} from "@/lib/session-guardian";
import { browserRetainedStorageIssue } from "@/lib/session-guardian";
import { browserRetainedStartFailure } from "@/lib/browser-retained-start-failure";
import {
  browserSourceTypeAfterConsentReadback,
  browserTranscriptionChoiceAfterConsentReadback,
  preferredBrowserSourceType,
  readBrowserSourcePreferences,
  writeBrowserSourcePreferences,
} from "@/lib/browser-source-preferences";
import {
  browserSourceInterruptedRecoveryCandidate,
  browserSourceLocalProofMatchesLedger,
  browserSourceExitSafety,
  browserSourceManualUploadRetryAvailable,
  browserSourcePostStopReceipt,
  browserSourceNextReviewAction,
  browserSourceReceiptExitStatus,
  browserSourceRecoverySummary,
  browserSourceSafetyLabel,
  browserSourceStopReceiptNeedsRepair,
  browserSourceUploadCanResumeAutomatically,
  browserSourceUploadRetryDelayMs,
  finalizeInterruptedBrowserSourceLedger,
  projectBrowserSourceFinalization,
  resumeBrowserSourceUploads,
} from "@/lib/browser-source-upload-recovery";
import {
  acknowledgeBrowserRecordingDirective,
  browserRecordingDirectiveCanRetry,
  browserRecordingDirectiveShouldAutoStart,
  browserRecordingDirectiveShouldDeferStart,
  issueBrowserRecordingDirective,
  projectBrowserRecordingHealth,
  readBrowserRecordingDirective,
  type BrowserRecordingDirective,
} from "@/lib/browser-recording-directive";
import { flushBrowserRecordingReceiptOutbox } from "@/lib/browser-recording-receipt-outbox";
import { useActiveMediaLifecycle } from "@/hooks/use-active-media-lifecycle";

type ConsentPolicy = {
  version: string;
  text: string;
  sha256: string;
  surface: string;
  presentationVersion: number;
};

type BrowserSourceUploadReservationResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  stage?: string;
  storageBackend?: string;
  finalizeUrl?: string;
  upload?: { url: string };
};

type BrowserSourceVerifiedLocalFile = {
  file: File;
  sizeBytes: number;
  sha256: string;
};

const IN_TAKE_CLOCK_SAMPLE_INTERVAL_MS = 5 * 60 * 1_000;
const RETAINED_SOURCE_STALL_MS = 10_000;
const RETAINED_SOURCE_MUTE_GRACE_MS = 5_000;
const RETAINED_SOURCE_SIGNAL_GRACE_MS = 5_000;
const STOP_RECEIPT_PENDING_PREFIX = "Session STOP receipt pending: ";
const FINALIZATION_IDENTITY_PENDING_PREFIX =
  "Exact bytes verified, but Quipsly has not returned the canonical recording identity yet.";

function safeTrackSettings(settings: MediaTrackSettings) {
  return Object.fromEntries(
    Object.entries(settings).filter(
      (entry): entry is [string, string | number | boolean] =>
        typeof entry[1] === "string" ||
        typeof entry[1] === "number" ||
        typeof entry[1] === "boolean",
    ),
  );
}

function formatBytes(bytes: number | null) {
  if (bytes == null) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function retainedRecorderStatusLabel(
  status: BrowserRetainedSourceStatus,
  elapsedSeconds: number,
) {
  if (status === "recording") return `Recording ${elapsedSeconds}s`;
  if (status === "checking") return "Getting ready";
  if (status === "starting") return "Starting";
  if (status === "stopping") return "Saving recording";
  if (status === "uploading") return "Uploading";
  if (status === "held") return "Saved on this device";
  if (status === "error") return "Needs attention";
  return "Ready";
}

function recordingEndpointStatus(state: string) {
  switch (state.toUpperCase()) {
    case "STARTED":
    case "RECORDING":
      return { label: "Recording", tone: "bg-rose-100 text-rose-950" };
    case "START_FAILED":
    case "STOP_FAILED":
    case "NEEDS_ATTENTION":
      return { label: "Needs attention", tone: "bg-amber-100 text-amber-950" };
    case "STOPPING":
      return { label: "Stopping", tone: "bg-amber-100 text-amber-950" };
    case "STOPPED":
    case "STOPPED_SAFELY":
      return {
        label: "Saved locally",
        tone: "bg-emerald-100 text-emerald-950",
      };
    default:
      return { label: "Getting ready", tone: "bg-violet-100 text-violet-950" };
  }
}

function formattedDbfs(value: number) {
  if (!Number.isFinite(value) || value <= -120) return "below −120 dBFS";
  return `${value.toFixed(1).replace("-", "−")} dBFS`;
}

function captureMeterDisplayEvidence(meter: BrowserSourceCaptureMeterSummary) {
  if (meter.contractKind === "quipsly-browser-source-meter-v2") {
    return {
      highestObservedRmsDbfs: meter.highestObservedRmsDbfs,
      nearFullScaleSampleCount: meter.nearFullScaleSampleCount,
      missingMessageCount: meter.missingMessageCount,
      tailLabel: meter.tailAggregateFlushed
        ? "tail flushed"
        : "tail not acknowledged",
    };
  }
  return {
    highestObservedRmsDbfs: meter.highestFrameRmsDbfs,
    nearFullScaleSampleCount: meter.clippedSampleCount,
    missingMessageCount: meter.missingMessageCount ?? 0,
    tailLabel: "meter v1 did not record a tail acknowledgement",
  };
}

function clockEvidenceLabel(ledger: BrowserSourceCaptureLedger) {
  const samples = ledger.sourceProfile.clockSamples ?? [];
  let hasLateSample = false;
  try {
    const started = BigInt(ledger.sourceProfile.monotonicStartedNanoseconds);
    hasLateSample = samples.some(
      (sample) =>
        BigInt(sample.deviceMonotonicSentNanoseconds) - started >=
        30_000_000_000n,
    );
  } catch {
    // Legacy malformed clock evidence remains visible as an opening-only count.
  }
  return `${samples.length} clock sample${samples.length === 1 ? "" : "s"} · ${hasLateSample ? "late drift evidence" : "opening only"}`;
}

function stoppedFileName(
  title: string,
  sourceType: BrowserSourceKind,
  mimeType: string,
  captureId: string,
) {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 72) || "quipsly-session";
  return `${slug}-${sourceType}-${captureId.slice(0, 8)}.${browserSourceFileExtension(mimeType)}`;
}

async function postRoomReceipt(input: {
  callRoomId: string;
  action: "OPEN" | "START_RECORDING" | "STOP_RECORDING";
  receiptId: string;
  captureId?: string;
  sourceType?: BrowserSourceKind;
  occurredAt: string;
}) {
  const response = await fetch("/api/mobile/capture/rooms/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, source: "web-local-source" }),
  });
  const packet = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok || packet.ok !== true)
    throw new Error(
      String(packet.error || "The durable room receipt could not be saved."),
    );
  return packet;
}

export function BrowserSourceRecorder({
  callRoomId,
  captureGroupId,
  sessionTitle,
  sessionKind,
  projectSlug = null,
  episodeSlug = null,
  microphoneId,
  microphoneLabel,
  cameraId,
  cameraLabel,
  conversationConnected = true,
  conversationEnded = false,
  callTransportInterrupted = false,
  stopRequestVersion = 0,
  onSourceLockChange,
  onGuardianEvidenceChange,
  onPreparationStateChange,
}: {
  callRoomId: string;
  captureGroupId: string;
  sessionTitle: string;
  sessionKind: "coaching" | "episode";
  projectSlug?: string | null;
  episodeSlug?: string | null;
  microphoneId: string;
  microphoneLabel: string;
  cameraId: string;
  cameraLabel: string;
  conversationConnected?: boolean;
  conversationEnded?: boolean;
  callTransportInterrupted?: boolean;
  stopRequestVersion?: number;
  onSourceLockChange?: (locked: boolean) => void;
  onGuardianEvidenceChange?: (
    evidence: BrowserRetainedSourceGuardianEvidence,
  ) => void;
  onPreparationStateChange?: (state: {
    participantReady: boolean;
    everyoneReady: boolean;
  }) => void;
}) {
  const [status, setStatus] = useState<BrowserRetainedSourceStatus>("checking");
  const [message, setMessage] = useState("Getting recording ready…");
  const [sourceType, setSourceType] = useState<BrowserSourceKind>(
    sessionKind === "episode" ? "video" : "audio",
  );
  const [headphonesAttested, setHeadphonesAttested] = useState(false);
  const [myAudioConsent, setMyAudioConsent] = useState(false);
  const [myVideoConsent, setMyVideoConsent] = useState(false);
  const [transcriptionAllowed, setTranscriptionAllowed] = useState(true);
  const [transcriptionChoiceDirty, setTranscriptionChoiceDirty] =
    useState(false);
  const transcriptionAllowedRef = useRef(true);
  const transcriptionChoiceDirtyRef = useRef(false);
  const transcriptionChoiceInputRef = useRef<HTMLInputElement>(null);
  const setTranscriptionChoice = useCallback((allowed: boolean) => {
    transcriptionAllowedRef.current = allowed;
    setTranscriptionAllowed(allowed);
  }, []);
  const chooseTranscriptionChoice = useCallback(
    (allowed: boolean) => {
      transcriptionChoiceDirtyRef.current = true;
      setTranscriptionChoiceDirty(true);
      setTranscriptionChoice(allowed);
    },
    [setTranscriptionChoice],
  );
  const chooseSourceType = useCallback(
    (next: BrowserSourceKind) => {
      setSourceType(next);
      writeBrowserSourcePreferences(
        sessionKind === "episode"
          ? { episodeSourceType: next }
          : { coachingSourceType: next },
      );
    },
    [sessionKind],
  );
  const chooseHeadphonesAttestation = useCallback((next: boolean) => {
    setHeadphonesAttested(next);
    writeBrowserSourcePreferences({ headphonesAttested: next });
  }, []);
  const [policy, setPolicy] = useState<ConsentPolicy | null>(null);
  const [consentId, setConsentId] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [allPartyAudioReady, setAllPartyAudioReady] = useState(false);
  const [allPartyVideoReady, setAllPartyVideoReady] = useState(false);
  const [allPartyTranscriptionReady, setAllPartyTranscriptionReady] =
    useState(false);
  const [roomStatus, setRoomStatus] = useState<string | null>(null);
  const [canControlRoom, setCanControlRoom] = useState(false);
  const [vaultAvailable, setVaultAvailable] = useState(false);
  const [vaultPersistent, setVaultPersistent] = useState(false);
  const [quotaBytes, setQuotaBytes] = useState<number | null>(null);
  const [usageBytes, setUsageBytes] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recoveryRows, setRecoveryRows] = useState<
    BrowserSourceCaptureLedger[]
  >([]);
  const [activeLedger, setActiveLedger] =
    useState<BrowserSourceCaptureLedger | null>(null);
  const [studioHandoff, setStudioHandoff] =
    useState<BrowserCaptureStudioHandoff | null>(null);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffMessage, setHandoffMessage] = useState(
    "Loading the canonical source set for this take…",
  );
  const [operationalIssue, setOperationalIssue] =
    useState<BrowserRetainedSourceIssue | null>(null);
  const [recordingDirective, setRecordingDirective] =
    useState<BrowserRecordingDirective | null>(null);
  const [directiveBusy, setDirectiveBusy] = useState(false);
  const [pendingCoordinationReceiptCount, setPendingCoordinationReceiptCount] =
    useState(0);
  const [coordinationReceiptError, setCoordinationReceiptError] = useState<
    string | null
  >(null);
  const recordingHealthProjection = recordingDirective
    ? projectBrowserRecordingHealth(recordingDirective)
    : null;
  const sourceLocked =
    status === "starting" || status === "recording" || status === "stopping";

  useEffect(() => {
    const preferences = readBrowserSourcePreferences();
    setHeadphonesAttested(preferences.headphonesAttested === true);
    setSourceType(preferredBrowserSourceType(sessionKind, preferences));
  }, [sessionKind]);
  useEffect(() => {
    transcriptionChoiceDirtyRef.current = false;
    setTranscriptionChoiceDirty(false);
  }, [callRoomId]);
  const protectedTransferActive =
    status === "uploading" ||
    recoveryRows.some((ledger) => ledger.state === "uploading");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const durableWriterRef = useRef<BrowserSourceDurableWriter | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const ledgerRef = useRef<BrowserSourceCaptureLedger | null>(null);
  const timerRef = useRef<number | null>(null);
  const clockTimerRef = useRef<number | null>(null);
  const monotonicStoppedNanosecondsRef = useRef<string | null>(null);
  const stopClockBurstRef = useRef<Promise<
    Awaited<ReturnType<typeof measureBrowserCaptureClockBurst>>
  > | null>(null);
  const retainedMeterContextRef = useRef<AudioContext | null>(null);
  const retainedMeterNodeRef = useRef<AudioNode | null>(null);
  const retainedMeterFrameRef = useRef<number | null>(null);
  const retainedMeterSequenceRef = useRef<number | null>(null);
  const autoHandoffAttemptRef = useRef<string | null>(null);
  const retainedMeterFlushResolverRef = useRef<(() => void) | null>(null);
  const retainedMeterSummaryRef =
    useRef<BrowserSourceCaptureMeterSummaryV2 | null>(null);
  const guardianCleanupRef = useRef<(() => void) | null>(null);
  const lastDurableChunkAtRef = useRef<number | null>(null);
  const endpointQueueTimerRef = useRef<number | null>(null);
  const activeCaptureOperationRef = useRef(false);
  const automaticUploadRecoveryInFlightRef = useRef(false);
  const automaticUploadRecoveryAttemptedRef = useRef(new Set<string>());
  const automaticStopReceiptRepairAttemptedRef = useRef(new Set<string>());
  const directiveHandlingRef = useRef(new Map<string, string>());
  const directiveInFlightRef = useRef(new Set<string>());
  const directiveBaselineEstablishedRef = useRef(false);
  const recordingDirectiveRef = useRef<BrowserRecordingDirective | null>(null);
  const handledStopRequestVersionRef = useRef(0);
  const callTransportGapStartedAtRef = useRef<string | null>(null);
  const callTransportGapWriteRef = useRef<Promise<void>>(Promise.resolve());
  const callTransportGapsRef = useRef<
    Array<{
      startedAt: string;
      stoppedAt: string;
      detail: string;
    }>
  >([]);

  const flushPendingMedia = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    try {
      recorder.requestData();
    } catch {
      // The periodic chunk journal remains the recovery boundary if the
      // encoder transitions state during this best-effort visibility flush.
    }
  }, []);

  useActiveMediaLifecycle({
    hasUnsavedMedia: sourceLocked || protectedTransferActive,
    keepScreenAwake: sourceLocked || protectedTransferActive,
    flushPendingMedia,
  });

  useEffect(() => {
    directiveBaselineEstablishedRef.current = false;
    directiveHandlingRef.current.clear();
    directiveInFlightRef.current.clear();
    setRecordingDirective(null);
    recordingDirectiveRef.current = null;
  }, [callRoomId]);

  useEffect(() => {
    recordingDirectiveRef.current = recordingDirective;
  }, [recordingDirective]);

  const flushRecordingReceipts = useCallback(async () => {
    if (!participantId) return null;
    try {
      const result = await flushBrowserRecordingReceiptOutbox({
        ownerParticipantId: participantId,
      });
      setPendingCoordinationReceiptCount(result.pendingCount);
      setCoordinationReceiptError(result.latestError);
      return result;
    } catch (error) {
      setCoordinationReceiptError(
        error instanceof Error
          ? error.message
          : "Recording status recovery needs attention.",
      );
      return null;
    }
  }, [participantId]);

  useEffect(() => {
    if (!participantId) return;
    const flush = () => void flushRecordingReceipts();
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flushRecordingReceipts, participantId]);

  const reconcileEndpointQueue = useCallback(() => {
    if (!participantId) return;
    if (endpointQueueTimerRef.current !== null)
      window.clearTimeout(endpointQueueTimerRef.current);
    endpointQueueTimerRef.current = window.setTimeout(() => {
      endpointQueueTimerRef.current = null;
      void publishBrowserEndpointQueue({
        callRoomId,
        captureGroupId,
        participantId,
      }).catch(() => undefined);
    }, 350);
  }, [callRoomId, captureGroupId, participantId]);

  useEffect(() => {
    reconcileEndpointQueue();
    return () => {
      if (endpointQueueTimerRef.current !== null)
        window.clearTimeout(endpointQueueTimerRef.current);
    };
  }, [reconcileEndpointQueue]);

  useEffect(() => {
    onSourceLockChange?.(sourceLocked);
    return () => onSourceLockChange?.(false);
  }, [onSourceLockChange, sourceLocked]);

  const refreshRecovery = useCallback(async () => {
    if (!participantId) {
      setRecoveryRows([]);
      return;
    }
    const rows = await listBrowserSourceLedgersForParticipant({
      callRoomId,
      participantId,
    }).catch(() => []);
    setRecoveryRows(rows);
  }, [callRoomId, participantId]);

  const refreshStudioHandoff = useCallback(
    async (announce = true) => {
      if (announce) setHandoffBusy(true);
      try {
        const response = await fetch("/api/mobile/capture/sessions", {
          cache: "no-store",
        });
        const packet = await response.json().catch(() => ({}));
        if (!response.ok || packet?.ok !== true) {
          throw new Error(
            packet?.error ||
              "The canonical Session source set could not be loaded.",
          );
        }
        const next = browserCaptureStudioHandoff(
          packet,
          callRoomId,
          captureGroupId,
        );
        setStudioHandoff(next);
        if (!next) {
          setHandoffMessage(
            "This Session is not visible in the signed-in workspace. The protected local source is unchanged.",
          );
        } else if (next.sourceCount === 0) {
          setHandoffMessage(
            "No server-verified sources have reached this take yet. Protected browser files remain available above.",
          );
        } else if (!next.ready) {
          setHandoffMessage(
            `${next.verifiedRequiredSourceCount} of ${next.requiredSourceCount} protected masters have exact-byte release evidence. Studio attachment stays held until the required take is ready.`,
          );
        } else if (next.complete) {
          setHandoffMessage(
            `All ${next.requiredSourceCount} required masters are attached to Studio. Provider media remains an optional witness; alignment remains a reviewable proposal.`,
          );
        } else {
          setHandoffMessage(
            `All ${next.requiredSourceCount} required masters are verified. Review this exact set, then attach the complete take to Studio.`,
          );
        }
        return next;
      } catch (error) {
        setStudioHandoff(null);
        setHandoffMessage(
          error instanceof Error
            ? error.message
            : "The canonical Session source set could not be loaded.",
        );
        return null;
      } finally {
        if (announce) setHandoffBusy(false);
      }
    },
    [callRoomId, captureGroupId],
  );

  useEffect(() => {
    void refreshStudioHandoff(false);
  }, [refreshStudioHandoff]);

  useEffect(() => {
    if (!conversationConnected || status === "recording") return;
    let cancelled = false;
    const refreshCurrentConsent = async () => {
      try {
        const response = await fetch(
          `/api/mobile/capture/consent?callRoomId=${encodeURIComponent(callRoomId)}`,
          { cache: "no-store" },
        );
        const packet = await response.json().catch(() => ({}));
        if (cancelled || !response.ok) return;
        const session = packet?.session ?? {};
        setConsentId(session.recordingConsentId ?? null);
        setMyAudioConsent(session.recordingConsentCanRecordAudio === true);
        setMyVideoConsent(session.recordingConsentCanRecordVideo === true);
        if (!transcriptionChoiceDirtyRef.current) {
          setTranscriptionChoice(
            session.recordingConsentCanTranscribe === true,
          );
        }
        setAllPartyAudioReady(
          session.allRegisteredParticipantConsentGranted === true,
        );
        setAllPartyVideoReady(
          session.allRegisteredParticipantVideoConsentGranted === true,
        );
        setAllPartyTranscriptionReady(
          session.allRegisteredParticipantTranscriptionConsentGranted === true,
        );
      } catch {
        // The explicit consent action and recording preflight remain
        // fail-closed. A transient background refresh must not interrupt the
        // live conversation or replace the last server-confirmed state.
      }
    };
    const interval = window.setInterval(
      () => void refreshCurrentConsent(),
      2_500,
    );
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [callRoomId, conversationConnected, status]);

  useEffect(() => {
    let cancelled = false;
    const policyRequest =
      typeof globalThis.fetch === "function"
        ? globalThis
            .fetch(
              `/api/mobile/capture/consent?callRoomId=${encodeURIComponent(callRoomId)}`,
              { cache: "no-store" },
            )
            .then((response) => response.json())
        : Promise.resolve({ currentPolicy: null });
    void Promise.all([browserSourceVaultReadiness(), policyRequest])
      .then(async ([vault, consentPacket]) => {
        const currentParticipantId =
          typeof consentPacket?.session?.participantId === "string"
            ? consentPacket.session.participantId
            : "";
        const rows = currentParticipantId
          ? await listBrowserSourceLedgersForParticipant({
              callRoomId,
              participantId: currentParticipantId,
            }).catch(() => [])
          : [];
        if (cancelled) return;
        const savedAudioConsent =
          consentPacket?.session?.recordingConsentCanRecordAudio === true;
        const savedVideoConsent =
          consentPacket?.session?.recordingConsentCanRecordVideo === true;
        const savedChoiceCoversDefault =
          sessionKind === "episode" ? savedVideoConsent : savedAudioConsent;
        setVaultAvailable(vault.available);
        setVaultPersistent(vault.persistent);
        setQuotaBytes(vault.quotaBytes);
        setUsageBytes(vault.usageBytes);
        setPolicy(consentPacket?.currentPolicy ?? null);
        setConsentId(consentPacket?.session?.recordingConsentId ?? null);
        setMyAudioConsent(savedAudioConsent);
        setMyVideoConsent(savedVideoConsent);
        setSourceType(
          browserSourceTypeAfterConsentReadback({
            sessionKind,
            preferences: readBrowserSourcePreferences(),
            consentStatus: consentPacket?.session?.recordingConsentStatus,
            canRecordVideo: savedVideoConsent,
          }),
        );
        setTranscriptionChoice(
          browserTranscriptionChoiceAfterConsentReadback({
            consentStatus: consentPacket?.session?.recordingConsentStatus,
            canTranscribe:
              consentPacket?.session?.recordingConsentCanTranscribe === true,
          }),
        );
        setParticipantId(currentParticipantId || null);
        setAllPartyAudioReady(
          consentPacket?.session?.allRegisteredParticipantConsentGranted ===
            true,
        );
        setAllPartyVideoReady(
          consentPacket?.session
            ?.allRegisteredParticipantVideoConsentGranted === true,
        );
        setAllPartyTranscriptionReady(
          consentPacket?.session
            ?.allRegisteredParticipantTranscriptionConsentGranted === true,
        );
        setRoomStatus(consentPacket?.session?.roomStatus ?? null);
        setCanControlRoom(consentPacket?.session?.canControlRoom === true);
        setRecoveryRows(rows);
        if (!automaticUploadRecoveryInFlightRef.current) {
          setStatus(
            vault.available && consentPacket?.currentPolicy ? "ready" : "held",
          );
          setMessage(
            vault.available
              ? savedChoiceCoversDefault
                ? "Ready to record when everyone is ready."
                : "Allow recording once, then record when everyone is ready."
              : "Recording is not supported in this browser. Use Quipsly Capture or a current desktop browser.",
          );
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Recording couldn't get ready.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [callRoomId, sessionKind, setTranscriptionChoice]);

  const consentReady =
    sourceType === "video" ? allPartyVideoReady : allPartyAudioReady;
  const myConsentCoversSource =
    sourceType === "video" ? myVideoConsent : myAudioConsent;
  useEffect(() => {
    onPreparationStateChange?.({
      participantReady: myConsentCoversSource,
      everyoneReady: consentReady,
    });
  }, [consentReady, myConsentCoversSource, onPreparationStateChange]);
  const readiness = useMemo(
    () =>
      browserSourceCanBegin({
        opfsAvailable: vaultAvailable,
        roomStatus,
        microphoneId,
        cameraId,
        sourceType,
        recordingConsentId: myConsentCoversSource ? consentId : null,
        allPartyConsentReady: consentReady,
      }),
    [
      cameraId,
      consentId,
      consentReady,
      microphoneId,
      myConsentCoversSource,
      roomStatus,
      sourceType,
      vaultAvailable,
    ],
  );
  const preflightStorageIssue = useMemo(
    () => browserRetainedStorageIssue(usageBytes, quotaBytes),
    [quotaBytes, usageBytes],
  );
  const retainedReadiness = useMemo(
    () =>
      preflightStorageIssue?.kind === "storage-critical"
        ? {
            ok: false,
            reason: `${preflightStorageIssue.detail} Free local space before recording.`,
          }
        : readiness,
    [preflightStorageIssue, readiness],
  );

  const guardianEvidence = useMemo<BrowserRetainedSourceGuardianEvidence>(
    () => ({
      status,
      sourceType,
      message,
      vaultAvailable,
      vaultPersistent,
      readinessOk: retainedReadiness.ok,
      readinessReason: retainedReadiness.reason,
      protectedRecoveryCount: recoveryRows.length,
      activeCaptureId: activeLedger?.captureId ?? null,
      activeSizeBytes: activeLedger?.sizeBytes ?? 0,
      issue: operationalIssue ?? preflightStorageIssue,
    }),
    [
      activeLedger?.captureId,
      activeLedger?.sizeBytes,
      message,
      operationalIssue,
      preflightStorageIssue,
      recoveryRows.length,
      retainedReadiness.ok,
      retainedReadiness.reason,
      sourceType,
      status,
      vaultAvailable,
      vaultPersistent,
    ],
  );

  useEffect(() => {
    onGuardianEvidenceChange?.(guardianEvidence);
  }, [guardianEvidence, onGuardianEvidenceChange]);

  const grantConsent = useCallback(async () => {
    if (!policy) {
      setMessage("Recording choices are still loading. Try again in a moment.");
      return;
    }
    setStatus("checking");
    const presentedAt = new Date().toISOString();
    const submittedTranscriptionChoice =
      transcriptionChoiceInputRef.current?.checked ??
      transcriptionAllowedRef.current;
    try {
      const response = await fetch("/api/mobile/capture/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          callRoomId,
          consentAction: "GRANT",
          canRecordAudio: true,
          canRecordVideo: sourceType === "video",
          canTranscribe: submittedTranscriptionChoice,
          allAudibleParticipantsNotifiedAndAgreed: true,
          consentPolicyVersion: policy.version,
          consentText: policy.text,
          consentTextHash: policy.sha256,
          clientKind: "web",
          deviceLabel: navigator.platform
            ? `Quipsly Web · ${navigator.platform}`
            : "Quipsly Web",
          presentationEvidence: {
            version: policy.presentationVersion,
            surface: policy.surface,
            presentedAt,
            recordingChoicePresented: true,
            transcriptionChoicePresented: true,
            audibleParticipantAttestationPresented: true,
          },
        }),
      });
      const packet = await response.json().catch(() => ({}));
      if (!response.ok || !packet?.ok)
        throw new Error(packet?.error || "Consent could not be saved.");
      const session = packet.session ?? {};
      setConsentId(session.recordingConsentId ?? null);
      setMyAudioConsent(session.recordingConsentCanRecordAudio === true);
      setMyVideoConsent(session.recordingConsentCanRecordVideo === true);
      setTranscriptionChoice(session.recordingConsentCanTranscribe === true);
      transcriptionChoiceDirtyRef.current = false;
      setTranscriptionChoiceDirty(false);
      setParticipantId(session.participantId ?? null);
      setAllPartyAudioReady(
        session.allRegisteredParticipantConsentGranted === true,
      );
      setAllPartyVideoReady(
        session.allRegisteredParticipantVideoConsentGranted === true,
      );
      setAllPartyTranscriptionReady(
        session.allRegisteredParticipantTranscriptionConsentGranted === true,
      );
      setRoomStatus(session.roomStatus ?? roomStatus);
      setCanControlRoom(session.canControlRoom === true || canControlRoom);
      setStatus("ready");
      setMessage(
        session.allRegisteredParticipantConsentGranted === true
          ? "Everyone is ready to record."
          : "Your choice is saved. Waiting for the other participant.",
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Consent could not be saved.",
      );
    }
  }, [
    callRoomId,
    canControlRoom,
    policy,
    roomStatus,
    sourceType,
    setTranscriptionChoice,
  ]);

  const reopenRoom = useCallback(async () => {
    setStatus("checking");
    setMessage("Reopening this Session for a new recorded take…");
    try {
      const receipt = await postRoomReceipt({
        callRoomId,
        action: "OPEN",
        receiptId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
      });
      setRoomStatus(
        String(
          (receipt.session as { status?: unknown } | undefined)?.status ??
            "OPEN",
        ),
      );
      setStatus("ready");
      setMessage(
        "Session reopened. Existing recording choices stay saved; record the next take when everyone is ready.",
      );
    } catch (error) {
      setStatus("held");
      setMessage(
        error instanceof Error
          ? error.message
          : "This Session could not be reopened.",
      );
    }
  }, [callRoomId]);

  const persistLedger = useCallback(
    async (ledger: BrowserSourceCaptureLedger) => {
      await saveBrowserSourceLedger(ledger);
      reconcileEndpointQueue();
    },
    [reconcileEndpointQueue],
  );

  const updateLedger = useCallback(
    async (ledger: BrowserSourceCaptureLedger) => {
      // Recovery and upload work may continue while this component owns a newer
      // recorder. Persist every capture independently, but never let an older
      // ledger replace the identity used by live MediaRecorder chunk writes.
      if (ledgerRef.current?.captureId === ledger.captureId) {
        ledgerRef.current = ledger;
        setActiveLedger(ledger);
      }
      await persistLedger(ledger);
    },
    [persistLedger],
  );

  const activateLedger = useCallback(
    async (ledger: BrowserSourceCaptureLedger) => {
      ledgerRef.current = ledger;
      setActiveLedger(ledger);
      await persistLedger(ledger);
    },
    [persistLedger],
  );

  const repairStopReceipt = useCallback(
    async (ledger: BrowserSourceCaptureLedger) => {
      if (!browserSourceStopReceiptNeedsRepair(ledger)) return ledger;
      const receipt = await postRoomReceipt({
        callRoomId,
        action: "STOP_RECORDING",
        receiptId: ledger.stopReceiptId,
        captureId: ledger.captureId,
        occurredAt: ledger.stoppedAt!,
      });
      if (receipt.receiptPersisted !== true) {
        throw new Error(
          "The Session accepted the request without confirming its durable STOP receipt.",
        );
      }
      const repaired = {
        ...ledger,
        stopReceiptPersisted: true,
        failureReason: ledger.failureReason?.startsWith(
          STOP_RECEIPT_PENDING_PREFIX,
        )
          ? null
          : ledger.failureReason,
        updatedAt: new Date().toISOString(),
      } satisfies BrowserSourceCaptureLedger;
      await updateLedger(repaired);
      return repaired;
    },
    [callRoomId, updateLedger],
  );

  const rememberStopReceiptFailure = useCallback(
    async (ledger: BrowserSourceCaptureLedger, error: unknown) => {
      const pending = {
        ...ledger,
        failureReason: `${STOP_RECEIPT_PENDING_PREFIX}${
          error instanceof Error ? error.message : "retry required"
        }`,
        updatedAt: new Date().toISOString(),
      } satisfies BrowserSourceCaptureLedger;
      await updateLedger(pending);
      return pending;
    },
    [updateLedger],
  );

  const closeCallTransportGap = useCallback(
    (stoppedAt: string, resolution: string) => {
      const startedAt = callTransportGapStartedAtRef.current;
      callTransportGapStartedAtRef.current = null;
      const current = ledgerRef.current;
      if (!startedAt || !current) return Promise.resolve();
      const durationSeconds = Math.max(
        0,
        (Date.parse(stoppedAt) - Date.parse(startedAt)) / 1_000,
      );
      const gap = {
        startedAt,
        stoppedAt,
        detail: `Call transport unavailable for ${durationSeconds.toFixed(2)} seconds. ${resolution}`,
      };
      callTransportGapsRef.current = [...callTransportGapsRef.current, gap];
      const next = {
        ...current,
        callTransportGaps: callTransportGapsRef.current,
        updatedAt: stoppedAt,
      } satisfies BrowserSourceCaptureLedger;
      const write = updateLedger(next);
      const guardedWrite = write.catch(() => undefined);
      callTransportGapWriteRef.current = guardedWrite;
      return guardedWrite;
    },
    [updateLedger],
  );

  useEffect(() => {
    const captureActive = status === "starting" || status === "recording";
    if (callTransportInterrupted && captureActive) {
      callTransportGapStartedAtRef.current ??= new Date().toISOString();
      return;
    }
    if (!callTransportInterrupted && callTransportGapStartedAtRef.current) {
      void closeCallTransportGap(
        new Date().toISOString(),
        "The call transport returned. Listen across this interval to verify what the retained browser source captured.",
      );
    }
  }, [callTransportInterrupted, closeCallTransportGap, status]);

  const startRetainedSourceMeter = useCallback(
    async (stream: MediaStream, startedAt: string) => {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;
      if (retainedMeterFrameRef.current !== null) {
        cancelAnimationFrame(retainedMeterFrameRef.current);
      }
      await retainedMeterContextRef.current?.close().catch(() => undefined);

      const context = new AudioContext();
      const settings = audioTrack.getSettings();
      const source = context.createMediaStreamSource(
        new MediaStream([audioTrack]),
      );
      const sourceChannelCount =
        typeof settings.channelCount === "number"
          ? Math.max(1, Math.round(settings.channelCount))
          : null;
      retainedMeterContextRef.current = context;
      retainedMeterSequenceRef.current = null;

      try {
        if (!context.audioWorklet || typeof AudioWorkletNode !== "function") {
          throw new Error("AudioWorklet is unavailable.");
        }
        await context.audioWorklet.addModule(
          "/audio/quipsly-capture-meter-worklet-v1.js",
        );
        const worklet = new AudioWorkletNode(
          context,
          "quipsly-capture-meter-v1",
          {
            numberOfInputs: 1,
            numberOfOutputs: 0,
            channelCountMode: "max",
          },
        );
        retainedMeterNodeRef.current = worklet;
        retainedMeterSummaryRef.current = createBrowserCaptureMeterSummary({
          startedAt,
          sampleRateHz: context.sampleRate,
          sourceChannelCount,
          measurement: "audio-worklet-render-quantum-aggregate",
        });
        worklet.port.onmessage = (event: MessageEvent<unknown>) => {
          if (
            event.data &&
            typeof event.data === "object" &&
            "kind" in event.data &&
            event.data.kind === "quipsly-capture-meter-flushed-v1"
          ) {
            if (retainedMeterSummaryRef.current) {
              retainedMeterSummaryRef.current = {
                ...retainedMeterSummaryRef.current,
                tailAggregateFlushed: true,
              };
            }
            retainedMeterFlushResolverRef.current?.();
            retainedMeterFlushResolverRef.current = null;
            return;
          }
          const aggregate = parseBrowserMeterWorkletAggregate(event.data);
          const current = retainedMeterSummaryRef.current;
          if (!aggregate || !current) return;
          retainedMeterSummaryRef.current = appendBrowserCaptureMeterAggregate(
            current,
            aggregate,
            new Date().toISOString(),
            retainedMeterSequenceRef.current,
          );
          retainedMeterSequenceRef.current = aggregate.sequence;
        };
        source.connect(worklet);
      } catch {
        const analyser = context.createAnalyser();
        analyser.fftSize = 2_048;
        analyser.channelCount = 1;
        analyser.channelCountMode = "explicit";
        source.connect(analyser);
        retainedMeterNodeRef.current = analyser;
        retainedMeterSummaryRef.current = createBrowserCaptureMeterSummary({
          startedAt,
          sampleRateHz: context.sampleRate,
          sourceChannelCount,
          measurement: "analyser-animation-frame-fallback",
        });
        const samples = new Float32Array(analyser.fftSize);
        const tick = () => {
          analyser.getFloatTimeDomainData(samples);
          const frame = analyseStudioAudioFrame(samples);
          const current = retainedMeterSummaryRef.current;
          if (!current) return;
          retainedMeterSummaryRef.current = appendBrowserCaptureMeterFrame(
            current,
            frame,
            new Date().toISOString(),
          );
          retainedMeterFrameRef.current = requestAnimationFrame(tick);
        };
        retainedMeterFrameRef.current = requestAnimationFrame(tick);
      }
      await context.resume();
    },
    [],
  );

  const stopRetainedSourceMeter = useCallback(async (stoppedAt: string) => {
    if (retainedMeterFrameRef.current !== null) {
      cancelAnimationFrame(retainedMeterFrameRef.current);
      retainedMeterFrameRef.current = null;
    }
    const activeNode = retainedMeterNodeRef.current;
    if (
      typeof AudioWorkletNode === "function" &&
      activeNode instanceof AudioWorkletNode
    ) {
      await Promise.race([
        new Promise<void>((resolve) => {
          retainedMeterFlushResolverRef.current = resolve;
          activeNode.port.postMessage({
            kind: "quipsly-capture-meter-flush-v1",
          });
        }),
        new Promise<void>((resolve) => window.setTimeout(resolve, 150)),
      ]);
      retainedMeterFlushResolverRef.current = null;
    }
    retainedMeterNodeRef.current?.disconnect();
    retainedMeterNodeRef.current = null;
    void retainedMeterContextRef.current?.close();
    retainedMeterContextRef.current = null;
    retainedMeterSequenceRef.current = null;
    const summary = retainedMeterSummaryRef.current;
    retainedMeterSummaryRef.current = null;
    return finishBrowserCaptureMeterSummary(summary, stoppedAt);
  }, []);

  const uploadLedger = useCallback(
    async (
      ledger: BrowserSourceCaptureLedger,
      suppliedProof?: BrowserSourceVerifiedLocalFile,
    ) => {
      if (
        !ledger.sha256 ||
        !ledger.stoppedAt ||
        !ledger.recordingConsentId ||
        !ledger.participantId
      ) {
        throw new Error(
          "This take is missing its completed checksum or consent binding.",
        );
      }
      setStatus("uploading");
      setMessage("Checking the protected local source before upload…");
      const file =
        suppliedProof?.file ??
        (await loadBrowserSourceFile(ledger.opfsFileName));
      if (ledger.sizeBytes <= 0 || file.size <= 0) {
        throw new Error(
          "No media bytes were captured. Check the selected device, reopen the Session if needed, and record a new take; this empty local entry was not uploaded.",
        );
      }
      const localProof =
        suppliedProof ??
        ({
          file,
          ...(await hashBrowserSourceFile(file)),
        } satisfies BrowserSourceVerifiedLocalFile);
      if (
        file.size !== localProof.sizeBytes ||
        !browserSourceLocalProofMatchesLedger(ledger, localProof)
      ) {
        throw new Error(
          "The protected local file no longer matches its durable size and checksum. Upload is held; download the unchanged local source for recovery.",
        );
      }
      setMessage("Creating an immutable resumable upload reservation…");
      let current: BrowserSourceCaptureLedger = {
        ...ledger,
        state: "uploading",
        updatedAt: new Date().toISOString(),
      };
      await updateLedger(current);
      const reservationRequest = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uploadSessionId: current.uploadSessionId,
          captureId: current.captureId,
          captureGroupId: current.captureGroupId,
          projectId: null,
          projectSlug: null,
          fileName: current.fileName,
          contentType: current.contentType,
          sourceType: current.sourceType,
          expectedSizeBytes: current.sizeBytes,
          sha256: current.sha256,
          episodeSlug: current.episodeSlug,
          trackId: current.sourceType === "video" ? "V1" : "A1",
          callRoomId: current.callRoomId,
          participantId: current.participantId,
          recordingConsentId: current.recordingConsentId,
          recordingAssetId: null,
          capturePurpose: `web-${sessionKind}-local-source`,
          sourceProfile: current.sourceProfile,
          startedAt: current.startedAt,
          stoppedAt: current.stoppedAt,
          recordingSegments: browserSourceRecordingSegments(current),
        }),
      } satisfies RequestInit;
      let manifestResponse: Response | null = null;
      let reservation: BrowserSourceUploadReservationResponse = {};
      for (let attempt = 0; attempt < 3; attempt += 1) {
        let requestFailure: unknown = null;
        try {
          manifestResponse = await fetch(
            "/api/mobile/capture/uploads/resumable",
            reservationRequest,
          );
          reservation = (await manifestResponse
            .json()
            .catch(() => ({}))) as BrowserSourceUploadReservationResponse;
        } catch (error) {
          requestFailure = error;
          manifestResponse = null;
          reservation = {};
        }
        const retryDelayMs = browserSourceUploadRetryDelayMs({
          status: manifestResponse?.status ?? null,
          retryAfter: manifestResponse?.headers.get("retry-after") ?? null,
          attempt,
        });
        if ((requestFailure || !manifestResponse?.ok) && retryDelayMs != null) {
          setMessage(
            "The recording is safe. Quipsly is retrying its upload automatically…",
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        }
        if (requestFailure) throw requestFailure;
        break;
      }
      if (!manifestResponse) {
        throw new Error(
          "Upload reservation could not reach Quipsly after automatic retries.",
        );
      }
      if (!manifestResponse.ok || !reservation?.ok) {
        const diagnostic = [reservation?.code, reservation?.stage]
          .filter(
            (value): value is string =>
              typeof value === "string" && value.length > 0,
          )
          .join(" · ");
        throw new Error(
          `${reservation?.error || "Upload reservation failed."} HTTP ${manifestResponse.status}.${diagnostic ? ` (${diagnostic})` : ""}`,
        );
      }
      if (reservation.upload) {
        setMessage(
          `Uploading ${formatBytes(current.sizeBytes)} from the protected local source…`,
        );
        const uploadUrl = new URL(
          reservation.upload.url,
          window.location.origin,
        );
        const localToken = uploadUrl.searchParams.get("token");
        if (reservation.storageBackend === "local-development") {
          const headers: Record<string, string> = {
            "content-type": current.contentType,
            "content-range": `bytes 0-${current.sizeBytes - 1}/${current.sizeBytes}`,
          };
          if (localToken)
            headers["x-quipsly-local-capture-capability"] = localToken;
          const uploadResponse = await fetch(uploadUrl.toString(), {
            method: "PUT",
            headers,
            body: file,
          });
          if (!uploadResponse.ok)
            throw new Error(
              `Durable byte upload failed (${uploadResponse.status}).`,
            );
          current = {
            ...current,
            uploadedBytes: current.sizeBytes,
            updatedAt: new Date().toISOString(),
          };
          await updateLedger(current);
        } else {
          const statusResponse = await fetch(uploadUrl.toString(), {
            method: "PUT",
            headers: { "content-range": `bytes */${current.sizeBytes}` },
            redirect: "manual",
          });
          let uploadedBytes = statusResponse.ok
            ? current.sizeBytes
            : statusResponse.status === 308
              ? browserSourcePersistedBytes(statusResponse.headers.get("range"))
              : 0;
          if (!statusResponse.ok && statusResponse.status !== 308) {
            throw new Error(
              `Resumable upload status failed (${statusResponse.status}).`,
            );
          }
          while (uploadedBytes < current.sizeBytes) {
            const chunk = browserSourceNextUploadChunk(
              current.sizeBytes,
              uploadedBytes,
            );
            if (!chunk)
              throw new Error("The resumable upload cursor is invalid.");
            setMessage(
              `Uploading protected source · ${Math.floor((uploadedBytes / current.sizeBytes) * 100)}% · local copy retained`,
            );
            const uploadResponse = await fetch(uploadUrl.toString(), {
              method: "PUT",
              headers: {
                "content-type": current.contentType,
                "content-range": `bytes ${chunk.start}-${chunk.endInclusive}/${current.sizeBytes}`,
              },
              body: file.slice(
                chunk.start,
                chunk.endExclusive,
                current.contentType,
              ),
              redirect: "manual",
            });
            if (!uploadResponse.ok && uploadResponse.status !== 308) {
              throw new Error(
                `Durable byte upload failed (${uploadResponse.status}).`,
              );
            }
            const acknowledged = uploadResponse.ok
              ? current.sizeBytes
              : browserSourcePersistedBytes(
                  uploadResponse.headers.get("range"),
                );
            if (
              acknowledged <= uploadedBytes ||
              acknowledged > current.sizeBytes
            ) {
              throw new Error(
                "The resumable upload did not acknowledge forward progress.",
              );
            }
            uploadedBytes = acknowledged;
            current = {
              ...current,
              uploadedBytes,
              updatedAt: new Date().toISOString(),
            };
            await updateLedger(current);
          }
        }
      }
      current = {
        ...current,
        state: "verifying",
        updatedAt: new Date().toISOString(),
      };
      await updateLedger(current);
      setMessage(
        "Source uploaded. Quipsly is verifying exact bytes and creating editor evidence…",
      );
      const finalizeResponse = await fetch(
        reservation.finalizeUrl ||
          "/api/mobile/capture/uploads/resumable/finalize",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ uploadSessionId: current.uploadSessionId }),
        },
      );
      const finalized = await finalizeResponse.json().catch(() => ({}));
      if (!finalizeResponse.ok || !finalized?.ok)
        throw new Error(
          finalized?.error || "Source verification needs a retry.",
        );
      const finalizationProjection =
        projectBrowserSourceFinalization(finalized);
      current = {
        ...current,
        state: finalizationProjection.state,
        serverRecordingAssetId: finalizationProjection.recordingAssetId,
        serverTranscriptJobId: finalizationProjection.transcriptJobId,
        failureReason:
          finalizationProjection.failureReason ??
          (current.failureReason?.startsWith(
            FINALIZATION_IDENTITY_PENDING_PREFIX,
          )
            ? null
            : current.failureReason),
        updatedAt: new Date().toISOString(),
      };
      await updateLedger(current);
      setStatus(current.state === "verified" ? "ready" : "uploading");
      if (current.state === "verified") {
        dispatchQuipslyProductEvent("recording_uploaded", {
          surface: "session_workspace",
          workflow: sessionKind === "episode" ? "podcast" : "coaching",
          client_kind: "browser",
          result: "success",
          recording_mode: "local",
          has_video: current.sourceType === "video",
        });
      }
      setMessage(
        current.state === "verified"
          ? !current.stopReceiptPersisted
            ? "Recording saved and verified. Quipsly will keep retrying the Session stop status automatically."
            : current.sourceProfile.interruptionRecovery
              ? "Recording saved. Quipsly is preparing it for reliable playback."
              : "Recording saved and verified in Quipsly."
          : "The source is durable and server verification is still running. Keep the local source and retry status later.",
      );
      await refreshRecovery();
      await refreshStudioHandoff(false);
    },
    [refreshRecovery, refreshStudioHandoff, sessionKind, updateLedger],
  );

  const promoteStudioHandoff = useCallback(async () => {
    if (
      !studioHandoff?.ready ||
      studioHandoff.complete ||
      studioHandoff.sources.length === 0
    ) {
      setHandoffMessage(
        "The exact source set must be fully verified and not already complete before Studio attachment.",
      );
      return;
    }
    const destinationProjectSlug = projectSlug || studioHandoff.projectSlug;
    if (!destinationProjectSlug) {
      setHandoffMessage(
        "Choose or bind a Nest before attaching this take to Studio.",
      );
      return;
    }
    setHandoffBusy(true);
    setHandoffMessage(
      `Attaching all ${studioHandoff.sources.length} reviewed sources as one take…`,
    );
    try {
      const response = await fetch("/api/mobile/capture/recordings/promote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId: callRoomId,
          captureGroupId,
          expectedRecordingAssetIds: studioHandoff.sources
            .filter(
              (source) => source.requiredForStudio || source.verifiedForStudio,
            )
            .map((source) => source.recordingAssetId),
          nestSlug: destinationProjectSlug,
          episodeSlug: episodeSlug || studioHandoff.episodeSlug,
        }),
      });
      const packet = await response.json().catch(() => ({}));
      const refreshed = await refreshStudioHandoff(false);
      const resultMessage = String(
        packet?.message ||
          packet?.error ||
          "Studio handoff returned without a readable receipt.",
      );
      if (!response.ok || packet?.ok !== true) {
        throw new Error(
          `${resultMessage}${refreshed?.promotedSourceCount ? ` ${refreshed.promotedSourceCount} source identities are already reusable; retrying will not duplicate them.` : ""}`,
        );
      }
      setHandoffMessage(
        `${resultMessage} Open the exact take to review clocks, waveforms, drift, and playback before approval.`,
      );
    } catch (error) {
      setHandoffMessage(
        error instanceof Error
          ? error.message
          : "The complete take could not be attached to Studio.",
      );
    } finally {
      setHandoffBusy(false);
    }
  }, [
    callRoomId,
    captureGroupId,
    episodeSlug,
    projectSlug,
    refreshStudioHandoff,
    studioHandoff,
  ]);

  useEffect(() => {
    if (handoffBusy) return;
    const attempt = browserCaptureAutoHandoffAttempt(
      studioHandoff,
      projectSlug,
    );
    if (!attempt || autoHandoffAttemptRef.current === attempt.key) return;
    autoHandoffAttemptRef.current = attempt.key;
    void promoteStudioHandoff();
  }, [handoffBusy, projectSlug, promoteStudioHandoff, studioHandoff]);

  const retryUploadLedger = useCallback(
    async (ledger: BrowserSourceCaptureLedger) => {
      let attempted = ledger;
      let localProof: BrowserSourceVerifiedLocalFile | undefined;
      try {
        if (
          browserSourceInterruptedRecoveryCandidate(
            attempted,
            recorderRef.current?.state === "recording"
              ? ledgerRef.current?.captureId
              : null,
          )
        ) {
          setStatus("uploading");
          setMessage(
            "Reconciling the recording protected before this browser stopped…",
          );
          const file = await loadBrowserSourceFile(attempted.opfsFileName);
          const hash = await hashBrowserSourceFile(file);
          localProof = { file, ...hash };
          attempted = finalizeInterruptedBrowserSourceLedger({
            ledger: attempted,
            sha256: hash.sha256,
            sizeBytes: hash.sizeBytes,
            recoveredAt: new Date().toISOString(),
          });
          await updateLedger(attempted);
        }
        try {
          attempted = await repairStopReceipt(attempted);
        } catch (error) {
          attempted = await rememberStopReceiptFailure(attempted, error);
        }
        if (
          attempted.state === "verified" &&
          attempted.serverRecordingAssetId?.trim()
        ) {
          setStatus("ready");
          setMessage(
            attempted.stopReceiptPersisted
              ? "Recording saved and its Session status is current."
              : "Recording remains verified. Quipsly will retry the Session stop status automatically.",
          );
          await refreshRecovery();
          return;
        }
        await uploadLedger(attempted, localProof);
      } catch (error) {
        const failureReason =
          error instanceof Error ? error.message : "Upload retry failed.";
        const current =
          ledgerRef.current?.captureId === attempted.captureId
            ? ledgerRef.current
            : attempted;
        await updateLedger({
          ...current,
          state: "held",
          failureReason,
          updatedAt: new Date().toISOString(),
        });
        setStatus("held");
        setMessage(failureReason);
        await refreshRecovery();
      }
    },
    [
      refreshRecovery,
      rememberStopReceiptFailure,
      repairStopReceipt,
      updateLedger,
      uploadLedger,
    ],
  );

  const resumeProtectedUploads = useCallback(
    async (resetAttempts = false) => {
      if (
        !participantId ||
        navigator.onLine === false ||
        activeCaptureOperationRef.current ||
        automaticUploadRecoveryInFlightRef.current
      )
        return;
      if (resetAttempts) {
        automaticUploadRecoveryAttemptedRef.current.clear();
        automaticStopReceiptRepairAttemptedRef.current.clear();
      }
      automaticUploadRecoveryInFlightRef.current = true;
      try {
        const ownedLedgers = await listBrowserSourceLedgersForParticipant({
          callRoomId,
          participantId,
        });
        for (const ledger of ownedLedgers.filter(
          (candidate) =>
            browserSourceStopReceiptNeedsRepair(candidate) &&
            !automaticStopReceiptRepairAttemptedRef.current.has(
              candidate.captureId,
            ),
        )) {
          automaticStopReceiptRepairAttemptedRef.current.add(ledger.captureId);
          try {
            await repairStopReceipt(ledger);
          } catch (error) {
            await rememberStopReceiptFailure(ledger, error);
          }
        }
        const interrupted = ownedLedgers.filter(
          (ledger) =>
            browserSourceInterruptedRecoveryCandidate(
              ledger,
              recorderRef.current?.state === "recording"
                ? ledgerRef.current?.captureId
                : null,
            ) &&
            !automaticUploadRecoveryAttemptedRef.current.has(ledger.captureId),
        );
        for (const ledger of interrupted) {
          automaticUploadRecoveryAttemptedRef.current.add(ledger.captureId);
          await retryUploadLedger(ledger);
        }
        await resumeBrowserSourceUploads({
          attemptedCaptureIds: automaticUploadRecoveryAttemptedRef.current,
          list: () =>
            listBrowserSourceLedgersForParticipant({
              callRoomId,
              participantId,
            }).catch(() => []),
          resume: async (ledger) => {
            setMessage("Finishing a recording already saved on this device…");
            await retryUploadLedger(ledger);
          },
        });
      } catch (error) {
        setStatus("held");
        setMessage(
          error instanceof Error
            ? `Automatic upload recovery paused: ${error.message}. The recording remains listed below; use Retry upload when ready.`
            : "Automatic upload recovery paused. The recording remains listed below; use Retry upload when ready.",
        );
      } finally {
        automaticUploadRecoveryInFlightRef.current = false;
      }
    },
    [
      callRoomId,
      participantId,
      rememberStopReceiptFailure,
      repairStopReceipt,
      retryUploadLedger,
      updateLedger,
    ],
  );

  useEffect(() => {
    void resumeProtectedUploads();
    const online = () => void resumeProtectedUploads(true);
    const visible = () => {
      if (document.visibilityState === "visible") void resumeProtectedUploads();
    };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [resumeProtectedUploads]);

  useEffect(() => {
    if (
      !participantId ||
      navigator.onLine === false ||
      activeCaptureOperationRef.current ||
      !recoveryRows.some(
        (ledger) =>
          browserSourceUploadCanResumeAutomatically(ledger) ||
          browserSourceStopReceiptNeedsRepair(ledger),
      )
    )
      return;
    const timer = window.setTimeout(
      () => void resumeProtectedUploads(true),
      15_000,
    );
    return () => window.clearTimeout(timer);
  }, [participantId, recoveryRows, resumeProtectedUploads]);

  const stop = useCallback(
    (reason?: string) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") return;
      monotonicStoppedNanosecondsRef.current = browserMonotonicNanoseconds(
        performance.now(),
      );
      stopClockBurstRef.current = measureBrowserCaptureClockBurst({
        callRoomId,
        captureGroupId,
      });
      void closeCallTransportGap(
        new Date().toISOString(),
        "The browser recording ended before the call transport returned.",
      );
      setStatus("stopping");
      setMessage(
        reason ||
          "Stopping cleanly, flushing the local file, then computing exact-byte evidence…",
      );
      recorder.stop();
    },
    [callRoomId, captureGroupId, closeCallTransportGap],
  );

  useEffect(() => {
    if (
      stopRequestVersion <= handledStopRequestVersionRef.current ||
      status !== "recording"
    )
      return;
    handledStopRequestVersionRef.current = stopRequestVersion;
    stop(
      "Stopping and protecting this local recording before leaving the call…",
    );
  }, [status, stop, stopRequestVersion]);

  const clearGuardianMonitoring = useCallback(() => {
    guardianCleanupRef.current?.();
    guardianCleanupRef.current = null;
    lastDurableChunkAtRef.current = null;
  }, []);

  const startGuardianMonitoring = useCallback(
    (stream: MediaStream) => {
      clearGuardianMonitoring();
      const cleanups: Array<() => void> = [];
      const muteTimers = new Map<string, number>();

      for (const track of stream.getTracks()) {
        const trackIdentity = `${track.kind}:${track.id}`;
        const onEnded = () => {
          const detail = `The selected retained ${track.kind} track ended (${track.label || "device unavailable"}).`;
          setOperationalIssue({ kind: "source-ended", detail });
          stop(
            `${detail} Quipsly is stopping safely and preserving every flushed chunk.`,
          );
        };
        const onMute = () => {
          const detail = `The selected retained ${track.kind} track stopped delivering media (${track.label || "device unavailable"}).`;
          setOperationalIssue({ kind: "source-muted", detail });
          const timer = window.setTimeout(() => {
            if (!track.muted || track.readyState === "ended") return;
            stop(
              `${detail} The interruption persisted for ${RETAINED_SOURCE_MUTE_GRACE_MS / 1_000} seconds, so Quipsly is stopping safely.`,
            );
          }, RETAINED_SOURCE_MUTE_GRACE_MS);
          muteTimers.set(trackIdentity, timer);
        };
        const onUnmute = () => {
          const timer = muteTimers.get(trackIdentity);
          if (timer) window.clearTimeout(timer);
          muteTimers.delete(trackIdentity);
          setOperationalIssue((current) =>
            current?.kind === "source-muted" ? null : current,
          );
        };
        track.addEventListener("ended", onEnded);
        track.addEventListener("mute", onMute);
        track.addEventListener("unmute", onUnmute);
        cleanups.push(() => {
          track.removeEventListener("ended", onEnded);
          track.removeEventListener("mute", onMute);
          track.removeEventListener("unmute", onUnmute);
        });
      }

      const healthTimer = window.setInterval(() => {
        const lastChunkAt = lastDurableChunkAtRef.current;
        if (
          lastChunkAt &&
          Date.now() - lastChunkAt >= RETAINED_SOURCE_STALL_MS
        ) {
          const detail = `No durable recorder chunk arrived for ${RETAINED_SOURCE_STALL_MS / 1_000} seconds.`;
          setOperationalIssue({ kind: "encoder-stalled", detail });
          stop(
            `${detail} Quipsly is stopping safely instead of implying that the master is still advancing.`,
          );
        }
      }, 2_000);
      cleanups.push(() => window.clearInterval(healthTimer));

      const signalTimer = window.setInterval(() => {
        const meter = retainedMeterSummaryRef.current;
        if (
          !meter ||
          Date.now() - Date.parse(meter.startedAt) <
            RETAINED_SOURCE_SIGNAL_GRACE_MS ||
          meter.observedSampleCount < meter.sampleRateHz * 2
        )
          return;
        const state = studioAudioSignalState(
          meter.highestObservedRmsDbfs,
          meter.samplePeakDbfs,
          meter.nearFullScaleSampleCount,
        );
        if (state === "no-signal") {
          const label =
            stream.getAudioTracks()[0]?.label || "selected microphone";
          const detail = `${label} delivered at least five seconds of retained-source samples, but Quipsly observed no useful program signal.`;
          setOperationalIssue((current) =>
            current && current.kind !== "source-no-signal"
              ? current
              : { kind: "source-no-signal", detail },
          );
        } else {
          setOperationalIssue((current) =>
            current?.kind === "source-no-signal" ? null : current,
          );
        }
      }, 1_000);
      cleanups.push(() => window.clearInterval(signalTimer));

      const storageTimer = window.setInterval(() => {
        void navigator.storage
          ?.estimate?.()
          .then((estimate) => {
            const nextUsage =
              typeof estimate.usage === "number" ? estimate.usage : null;
            const nextQuota =
              typeof estimate.quota === "number" ? estimate.quota : null;
            setUsageBytes(nextUsage);
            setQuotaBytes(nextQuota);
            const storageIssue = browserRetainedStorageIssue(
              nextUsage,
              nextQuota,
            );
            if (storageIssue?.kind === "storage-critical") {
              setOperationalIssue(storageIssue);
              stop(
                `${storageIssue.detail} Quipsly is stopping safely before the durable local write can exhaust storage.`,
              );
            } else if (storageIssue?.kind === "storage-low") {
              setOperationalIssue((current) =>
                current && current.kind !== "storage-low"
                  ? current
                  : storageIssue,
              );
            } else {
              setOperationalIssue((current) =>
                current?.kind === "storage-low" ? null : current,
              );
            }
          })
          .catch(() => undefined);
      }, 5_000);
      cleanups.push(() => window.clearInterval(storageTimer));

      guardianCleanupRef.current = () => {
        for (const cleanup of cleanups) cleanup();
        for (const timer of muteTimers.values()) window.clearTimeout(timer);
        muteTimers.clear();
      };
    },
    [clearGuardianMonitoring, stop],
  );

  useEffect(() => {
    if (status !== "recording") return;
    const captureId = ledgerRef.current?.captureId;
    if (!captureId) return;
    const collectInTakeSample = () => {
      void measureBrowserCaptureClockBurst({
        callRoomId,
        captureGroupId,
        sampleCount: 1,
      })
        .then((samples) => {
          if (!samples.length) return;
          writeQueueRef.current = writeQueueRef.current.then(async () => {
            const current = ledgerRef.current;
            if (
              !current ||
              current.captureId !== captureId ||
              current.state !== "recording"
            )
              return;
            await updateLedger({
              ...current,
              sourceProfile: {
                ...current.sourceProfile,
                clockSamples: mergeBrowserCaptureClockSamples(
                  current.sourceProfile.clockSamples,
                  samples,
                ),
              },
              updatedAt: new Date().toISOString(),
            });
          });
        })
        .catch(() => undefined);
    };
    clockTimerRef.current = window.setInterval(
      collectInTakeSample,
      IN_TAKE_CLOCK_SAMPLE_INTERVAL_MS,
    );
    return () => {
      if (clockTimerRef.current) window.clearInterval(clockTimerRef.current);
      clockTimerRef.current = null;
    };
  }, [callRoomId, captureGroupId, status, updateLedger]);

  useEffect(() => {
    if (status !== "recording") return;
    let cancelled = false;
    const verifyCurrentConsent = async () => {
      try {
        const response = await fetch(
          `/api/mobile/capture/consent?callRoomId=${encodeURIComponent(callRoomId)}`,
          { cache: "no-store" },
        );
        const packet = await response.json().catch(() => ({}));
        if (cancelled) return;
        const session = packet?.session ?? {};
        const audioReady =
          response.ok &&
          session.allRegisteredParticipantConsentGranted === true;
        const videoReady =
          response.ok &&
          session.allRegisteredParticipantVideoConsentGranted === true;
        setAllPartyAudioReady(audioReady);
        setAllPartyVideoReady(videoReady);
        if (sourceType === "video" ? !videoReady : !audioReady) {
          stop(
            "Consent changed or a new participant joined. Local recording is stopping and preserving the flushed source.",
          );
        }
      } catch {
        if (!cancelled)
          stop(
            "Consent readback became unavailable. Local recording is stopping safely and preserving the flushed source.",
          );
      }
    };
    const interval = window.setInterval(
      () => void verifyCurrentConsent(),
      2_500,
    );
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [callRoomId, sourceType, status, stop]);

  const start = useCallback(async () => {
    if (
      activeCaptureOperationRef.current ||
      automaticUploadRecoveryInFlightRef.current
    ) {
      setMessage(
        "Quipsly is finishing a protected recording on this device. Recording will be ready again as soon as that source is safe.",
      );
      return null;
    }
    if (!retainedReadiness.ok || !consentId) {
      setMessage(retainedReadiness.reason);
      return null;
    }
    activeCaptureOperationRef.current = true;
    setStatus("starting");
    setMessage("Opening your microphone and recording…");
    setOperationalIssue(null);
    const captureId = crypto.randomUUID();
    const uploadSessionId = crypto.randomUUID();
    const startReceiptId = crypto.randomUUID();
    const stopReceiptId = crypto.randomUUID();
    let stream: MediaStream | null = null;
    try {
      monotonicStoppedNanosecondsRef.current = null;
      stopClockBurstRef.current = null;
      const clockSamples = await measureBrowserCaptureClockBurst({
        callRoomId,
        captureGroupId,
      });
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: microphoneId },
          channelCount: { ideal: 2 },
          sampleRate: { ideal: 48_000 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video:
          sourceType === "video"
            ? {
                deviceId: { exact: cameraId },
                width: { ideal: 3840 },
                height: { ideal: 2160 },
                frameRate: { ideal: 30 },
              }
            : false,
      });
      streamRef.current = stream;
      const supportedMime = chooseBrowserSourceMimeType(sourceType, (value) =>
        MediaRecorder.isTypeSupported(value),
      );
      const recorder = new MediaRecorder(stream, {
        ...(supportedMime ? { mimeType: supportedMime } : {}),
        audioBitsPerSecond: 256_000,
        ...(sourceType === "video" ? { videoBitsPerSecond: 18_000_000 } : {}),
      });
      recorderRef.current = recorder;
      lastDurableChunkAtRef.current = Date.now();
      startGuardianMonitoring(stream);
      const contentType =
        recorder.mimeType ||
        supportedMime ||
        (sourceType === "video" ? "video/webm" : "audio/webm");
      const opfsFileName = `${captureId}.${browserSourceFileExtension(contentType)}.part`;
      durableWriterRef.current =
        await createBrowserSourceDurableWriter(opfsFileName);
      const startedAt = new Date().toISOString();
      callTransportGapStartedAtRef.current = callTransportInterrupted
        ? startedAt
        : null;
      callTransportGapWriteRef.current = Promise.resolve();
      callTransportGapsRef.current = [];
      const monotonicStartedNanoseconds = browserMonotonicNanoseconds(
        performance.now(),
      );
      const audioSettings = stream.getAudioTracks()[0]?.getSettings() ?? {};
      const videoSettings = stream.getVideoTracks()[0]?.getSettings() ?? {};
      const ledger: BrowserSourceCaptureLedger = {
        kind: QUIPSLY_BROWSER_SOURCE_CAPTURE_KIND,
        version: 1,
        captureId,
        captureGroupId,
        uploadSessionId,
        callRoomId,
        participantId,
        recordingConsentId: consentId,
        episodeSlug,
        fileName: stoppedFileName(
          sessionTitle,
          sourceType,
          contentType,
          captureId,
        ),
        opfsFileName,
        contentType,
        sourceType,
        sourceProfile: {
          contractKind: QUIPSLY_BROWSER_SOURCE_CAPTURE_KIND,
          schemaVersion: 4,
          clientKind: "web",
          sourceKind: sourceType,
          quality: "studio-source",
          browserMimeType: contentType,
          deviceId: sourceType === "video" ? cameraId : microphoneId,
          deviceLabel:
            sourceType === "video"
              ? `${cameraLabel} + ${microphoneLabel}`
              : microphoneLabel,
          trackSettings: {
            ...safeTrackSettings(audioSettings),
            ...Object.fromEntries(
              Object.entries(safeTrackSettings(videoSettings)).map(
                ([key, value]) => [`video.${key}`, value],
              ),
            ),
          },
          monotonicStartedNanoseconds,
          monotonicStoppedNanoseconds: null,
          clockSamples,
          processing: {
            echoCancellation:
              typeof audioSettings.echoCancellation === "boolean"
                ? audioSettings.echoCancellation
                : null,
            noiseSuppression:
              typeof audioSettings.noiseSuppression === "boolean"
                ? audioSettings.noiseSuppression
                : null,
            autoGainControl:
              typeof audioSettings.autoGainControl === "boolean"
                ? audioSettings.autoGainControl
                : null,
          },
          headphonesAttested,
          localVault: "opfs",
          localRetentionRequired: true,
        },
        state: "preparing",
        startedAt,
        stoppedAt: null,
        sizeBytes: 0,
        uploadedBytes: 0,
        sha256: null,
        chunks: [],
        pendingChunk: null,
        startReceiptId,
        stopReceiptId,
        startReceiptPersisted: false,
        stopReceiptPersisted: false,
        serverRecordingAssetId: null,
        serverTranscriptJobId: null,
        failureReason: null,
        updatedAt: startedAt,
      };
      await activateLedger(ledger);
      try {
        await startRetainedSourceMeter(stream, startedAt);
      } catch {
        // Capture-time metering is supporting evidence. A browser Web Audio
        // failure must not discard an otherwise valid consented local source.
        await stopRetainedSourceMeter(startedAt);
      }
      writeQueueRef.current = Promise.resolve();
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        writeQueueRef.current = writeQueueRef.current
          .then(async () => {
            const current = ledgerRef.current;
            const durableWriter = durableWriterRef.current;
            if (!current || !durableWriter)
              throw new Error("Local source writer disappeared.");
            const chunk = {
              index: current.chunks.length,
              byteOffset: current.sizeBytes,
              sizeBytes: event.data.size,
              recorderTimecodeMs: Number.isFinite(event.timecode)
                ? event.timecode
                : null,
              receivedAt: new Date().toISOString(),
            };
            await updateLedger({
              ...current,
              pendingChunk: chunk,
              updatedAt: chunk.receivedAt,
            });
            const committed = await durableWriter.write(
              event.data,
              current.sizeBytes,
            );
            const expectedSizeBytes = current.sizeBytes + event.data.size;
            if (committed.committedSizeBytes !== expectedSizeBytes) {
              throw new Error(
                `Local source committed ${committed.committedSizeBytes} bytes; expected ${expectedSizeBytes}.`,
              );
            }
            const acknowledged = ledgerRef.current;
            if (
              !acknowledged ||
              acknowledged.captureId !== current.captureId ||
              acknowledged.pendingChunk?.index !== chunk.index ||
              acknowledged.pendingChunk.byteOffset !== chunk.byteOffset ||
              acknowledged.pendingChunk.sizeBytes !== chunk.sizeBytes
            ) {
              throw new Error(
                "The local source chunk intent changed before durable acknowledgement.",
              );
            }
            await updateLedger({
              ...acknowledged,
              state: "recording",
              sizeBytes: committed.committedSizeBytes,
              chunks: [...acknowledged.chunks, chunk],
              pendingChunk: null,
              updatedAt: new Date().toISOString(),
            });
            lastDurableChunkAtRef.current = Date.now();
          })
          .catch((error) => {
            const detail =
              error instanceof Error
                ? error.message
                : "A local source chunk could not be persisted.";
            setOperationalIssue({ kind: "encoder-stalled", detail });
            if (recorder.state !== "inactive") {
              stop(
                `${detail} Quipsly is stopping safely and preserving every committed local chunk.`,
              );
            } else {
              // The final dataavailable event can fail after stop() has already
              // made MediaRecorder inactive. Keep the existing stopping lock;
              // onstop still owns writer close, hash, ledger, and recovery UI.
              setMessage(
                `${detail} Quipsly is still protecting the committed local source.`,
              );
            }
          });
      };
      recorder.onstop = () => {
        void (async () => {
          if (timerRef.current) window.clearInterval(timerRef.current);
          timerRef.current = null;
          clearGuardianMonitoring();
          const stoppedAt = new Date().toISOString();
          const captureMeterPromise = stopRetainedSourceMeter(stoppedAt).catch(
            () => null,
          );
          // MediaRecorder has stopped accepting input. Release browser hardware
          // before any durable queue or writer close can wait or fail; the
          // already-delivered blobs and OPFS ledger remain independently owned.
          streamRef.current?.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          await callTransportGapWriteRef.current;
          await writeQueueRef.current;
          const durableWriter = durableWriterRef.current;
          durableWriterRef.current = null;
          await durableWriter?.close();
          const monotonicStoppedNanoseconds =
            monotonicStoppedNanosecondsRef.current ??
            browserMonotonicNanoseconds(performance.now());
          const stopClockSamples = await (
            stopClockBurstRef.current ??
            measureBrowserCaptureClockBurst({ callRoomId, captureGroupId })
          ).catch(() => []);
          const captureMeter = await captureMeterPromise;
          const file = await loadBrowserSourceFile(opfsFileName);
          const hash = await hashBrowserSourceFile(file);
          let current = ledgerRef.current!;
          current = {
            ...current,
            state: "stopped",
            stoppedAt,
            callTransportGaps: callTransportGapsRef.current,
            sizeBytes: hash.sizeBytes,
            sha256: hash.sha256,
            sourceProfile: captureMeter
              ? {
                  ...current.sourceProfile,
                  monotonicStoppedNanoseconds,
                  clockSamples: mergeBrowserCaptureClockSamples(
                    current.sourceProfile.clockSamples,
                    stopClockSamples,
                  ),
                  captureMeter,
                }
              : {
                  ...current.sourceProfile,
                  monotonicStoppedNanoseconds,
                  clockSamples: mergeBrowserCaptureClockSamples(
                    current.sourceProfile.clockSamples,
                    stopClockSamples,
                  ),
                },
            updatedAt: stoppedAt,
          };
          await updateLedger(current);
          try {
            current = await repairStopReceipt(current);
          } catch (error) {
            // Coordination delivery must not withhold protected media. The
            // exact STOP request remains in this durable ledger and retries
            // independently while upload preserves the participant source.
            current = await rememberStopReceiptFailure(current, error);
          }
          const activeDirective = recordingDirectiveRef.current;
          if (activeDirective?.action === "START" && participantId) {
            await acknowledgeBrowserRecordingDirective({
              ownerParticipantId: participantId,
              roomId: callRoomId,
              directiveId: activeDirective.id,
              state: "STOPPED",
              captureId,
              detail:
                "This endpoint stopped its retained local source safely; upload recovery remains independent.",
            }).catch(() => undefined);
            directiveHandlingRef.current.set(activeDirective.id, "STOPPED");
          }
          setStatus("ready");
          setMessage(
            current.stopReceiptPersisted
              ? "Local source stopped cleanly and hashed. Quipsly is uploading and verifying it now."
              : "Local source is protected. Quipsly is uploading it while the Session stop status retries independently.",
          );
          await refreshRecovery();
          await uploadLedger(current, {
            file,
            sizeBytes: hash.sizeBytes,
            sha256: hash.sha256,
          });
        })()
          .catch(async (error) => {
            const current = ledgerRef.current;
            if (current)
              await updateLedger({
                ...current,
                state: "held",
                failureReason:
                  error instanceof Error
                    ? error.message
                    : "Finalization failed.",
                updatedAt: new Date().toISOString(),
              });
            setStatus("held");
            setMessage(
              error instanceof Error
                ? `Source protected locally: ${error.message}`
                : "Source protected locally; finalization needs attention.",
            );
            await refreshRecovery();
          })
          .finally(() => {
            activeCaptureOperationRef.current = false;
            void resumeProtectedUploads();
          });
      };
      recorder.onerror = () => {
        const detail = "The browser encoder reported an error.";
        setOperationalIssue({ kind: "encoder-stalled", detail });
        stop(
          `${detail} Quipsly is stopping safely and preserving every flushed local chunk.`,
        );
      };
      recorder.start(2_000);
      const startedReceipt = await postRoomReceipt({
        callRoomId,
        action: "START_RECORDING",
        receiptId: startReceiptId,
        captureId,
        sourceType,
        occurredAt: startedAt,
      });
      if (
        startedReceipt.stateApplied !== true &&
        startedReceipt.receiptPersisted !== true
      )
        throw new Error(
          "Recording START was not accepted into the durable room ledger.",
        );
      await updateLedger({
        ...ledgerRef.current!,
        state: "recording",
        startReceiptPersisted: true,
        updatedAt: new Date().toISOString(),
      });
      setElapsedSeconds(0);
      timerRef.current = window.setInterval(
        () =>
          setElapsedSeconds(
            Math.max(
              0,
              Math.floor((Date.now() - Date.parse(startedAt)) / 1000),
            ),
          ),
        250,
      );
      setStatus("recording");
      dispatchQuipslyProductEvent("recording_started", {
        surface: "session_workspace",
        workflow: sessionKind === "episode" ? "podcast" : "coaching",
        client_kind: "browser",
        result: "success",
        recording_mode: "local",
        has_video: sourceType === "video",
      });
      setMessage("Recording on this device. Your call continues normally.");
      return captureId;
    } catch (error) {
      const activeRecorder = recorderRef.current;
      const recorderWasActive = activeRecorder?.state === "recording";
      if (recorderWasActive) {
        activeRecorder.stop();
      } else {
        clearGuardianMonitoring();
        await stopRetainedSourceMeter(new Date().toISOString());
        stream?.getTracks().forEach((track) => track.stop());
        await durableWriterRef.current?.close().catch(() => undefined);
        durableWriterRef.current = null;
        activeCaptureOperationRef.current = false;
      }
      const failure = browserRetainedStartFailure(error, sourceType);
      setOperationalIssue({
        kind: "start-failed",
        detail: recorderWasActive
          ? "Quipsly could not confirm this recording with the Session, so it is stopping safely. Your call is still connected."
          : failure.message,
        technicalDetail: failure.technicalDetail,
      });
      setStatus(recorderWasActive ? "stopping" : "error");
      setMessage(
        recorderWasActive
          ? "Recording confirmation failed. Quipsly is protecting what was captured and stopping safely; your call is still connected."
          : failure.message,
      );
      return null;
    }
  }, [
    callRoomId,
    cameraId,
    cameraLabel,
    callTransportInterrupted,
    captureGroupId,
    clearGuardianMonitoring,
    consentId,
    episodeSlug,
    headphonesAttested,
    microphoneId,
    microphoneLabel,
    participantId,
    rememberStopReceiptFailure,
    repairStopReceipt,
    refreshRecovery,
    retainedReadiness,
    sessionTitle,
    sourceType,
    startGuardianMonitoring,
    startRetainedSourceMeter,
    stop,
    stopRetainedSourceMeter,
    activateLedger,
    resumeProtectedUploads,
    updateLedger,
    uploadLedger,
  ]);

  const issueDirective = useCallback(
    async (action: "START" | "STOP") => {
      if (directiveBusy) return;
      directiveBaselineEstablishedRef.current = true;
      setDirectiveBusy(true);
      try {
        const next = await issueBrowserRecordingDirective(callRoomId, action);
        setRecordingDirective(next);
        setMessage(
          action === "START"
            ? "Starting recording on each ready device…"
            : "Stopping recording on each device…",
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Recording coordination is temporarily unavailable.",
        );
      } finally {
        setDirectiveBusy(false);
      }
    },
    [callRoomId, directiveBusy],
  );

  const joinActiveRecording = useCallback(async () => {
    const directive = recordingDirective;
    if (
      directiveBusy ||
      directive?.action !== "START" ||
      !participantId ||
      !["ready", "error"].includes(status) ||
      !retainedReadiness.ok
    ) {
      return;
    }
    setDirectiveBusy(true);
    try {
      await acknowledgeBrowserRecordingDirective({
        ownerParticipantId: participantId,
        roomId: callRoomId,
        directiveId: directive.id,
        state: "OBSERVED",
        detail:
          status === "error"
            ? "The participant explicitly retried a failed local recording."
            : "The participant explicitly joined an active recording.",
      }).catch(() => undefined);
      const captureId = await start();
      const state = captureId
        ? ("STARTED" as const)
        : ("START_FAILED" as const);
      await acknowledgeBrowserRecordingDirective({
        ownerParticipantId: participantId,
        roomId: callRoomId,
        directiveId: directive.id,
        state,
        captureId,
        detail: captureId
          ? status === "error"
            ? "Durable local capture started after explicit recovery."
            : "Durable local capture started after explicit late-join confirmation."
          : "The local recorder could not start; no media success is claimed.",
      }).catch(() => undefined);
      directiveHandlingRef.current.set(directive.id, state);
    } finally {
      setDirectiveBusy(false);
    }
  }, [
    callRoomId,
    directiveBusy,
    participantId,
    recordingDirective,
    retainedReadiness.ok,
    start,
    status,
  ]);

  useEffect(() => {
    if (!conversationConnected) return;
    let cancelled = false;
    const coordinate = async () => {
      try {
        if (!participantId) return;
        await flushRecordingReceipts();
        const directive = await readBrowserRecordingDirective(callRoomId);
        if (cancelled) return;
        if (!directiveBaselineEstablishedRef.current) {
          directiveBaselineEstablishedRef.current = true;
          if (directive?.action === "START" && status !== "recording") {
            setRecordingDirective(directive);
            if (
              !browserRecordingDirectiveShouldAutoStart({
                action: directive.action,
                status,
                retainedReady: retainedReadiness.ok,
              })
            ) {
              directiveHandlingRef.current.set(directive.id, "JOIN_REQUIRED");
              setMessage(
                "Recording is already in progress. Quipsly will start your local recording after your Session choice is ready.",
              );
              return;
            }
          } else {
            return;
          }
        }
        if (!directive) return;
        setRecordingDirective(directive);
        let terminal = directiveHandlingRef.current.get(directive.id);
        if (terminal === "JOIN_REQUIRED") {
          if (
            !browserRecordingDirectiveShouldAutoStart({
              action: directive.action,
              status,
              retainedReady: retainedReadiness.ok,
              terminalState: terminal,
            })
          ) {
            return;
          }
          directiveHandlingRef.current.delete(directive.id);
          terminal = undefined;
        }
        if (
          directive.action === "START" &&
          ["STARTED", "START_FAILED", "STOPPED"].includes(terminal || "")
        )
          return;
        if (
          directive.action === "STOP" &&
          ["STOPPED", "STOP_FAILED"].includes(terminal || "")
        )
          return;
        if (
          browserRecordingDirectiveShouldDeferStart({
            action: directive.action,
            activeCaptureOperation: activeCaptureOperationRef.current,
            automaticUploadRecoveryInFlight:
              automaticUploadRecoveryInFlightRef.current,
          })
        ) {
          setMessage(
            "Finishing the protected recording already on this device before joining the active recording…",
          );
          return;
        }
        if (directiveInFlightRef.current.has(directive.id)) return;
        directiveInFlightRef.current.add(directive.id);
        try {
          if (directive.action === "START") {
            if (status === "recording") {
              const captureId = ledgerRef.current?.captureId ?? null;
              await acknowledgeBrowserRecordingDirective({
                ownerParticipantId: participantId,
                roomId: callRoomId,
                directiveId: directive.id,
                state: "STARTED",
                captureId,
              });
              directiveHandlingRef.current.set(directive.id, "STARTED");
            } else if (status === "ready" && retainedReadiness.ok) {
              await acknowledgeBrowserRecordingDirective({
                ownerParticipantId: participantId,
                roomId: callRoomId,
                directiveId: directive.id,
                state: "OBSERVED",
                detail:
                  "Ready browser endpoint accepted the coordinated START.",
              }).catch(() => undefined);
              const captureId = await start();
              const state = captureId
                ? ("STARTED" as const)
                : ("START_FAILED" as const);
              await acknowledgeBrowserRecordingDirective({
                ownerParticipantId: participantId,
                roomId: callRoomId,
                directiveId: directive.id,
                state,
                captureId,
                detail: captureId
                  ? "Durable local capture started."
                  : "The local recorder could not start; no media success is claimed.",
              }).catch(() => undefined);
              directiveHandlingRef.current.set(directive.id, state);
            } else if (
              ["error", "held"].includes(status) ||
              !retainedReadiness.ok
            ) {
              await acknowledgeBrowserRecordingDirective({
                ownerParticipantId: participantId,
                roomId: callRoomId,
                directiveId: directive.id,
                state: "START_FAILED",
                detail: retainedReadiness.reason,
              }).catch(() => undefined);
              directiveHandlingRef.current.set(directive.id, "START_FAILED");
            }
          } else if (status === "recording") {
            const captureId = ledgerRef.current?.captureId ?? null;
            await acknowledgeBrowserRecordingDirective({
              ownerParticipantId: participantId,
              roomId: callRoomId,
              directiveId: directive.id,
              state: "STOPPING",
              captureId,
            }).catch(() => undefined);
            directiveHandlingRef.current.set(directive.id, "STOPPING");
            stop("Stopping because the Session host ended recording…");
          } else if (!["starting", "stopping", "uploading"].includes(status)) {
            const captureId = ledgerRef.current?.captureId ?? null;
            await acknowledgeBrowserRecordingDirective({
              ownerParticipantId: participantId,
              roomId: callRoomId,
              directiveId: directive.id,
              state: "STOPPED",
              captureId,
              detail:
                "This endpoint is no longer recording; upload recovery continues independently.",
            }).catch(() => undefined);
            directiveHandlingRef.current.set(directive.id, "STOPPED");
          }
        } finally {
          directiveInFlightRef.current.delete(directive.id);
        }
      } catch {
        // A temporary readback failure never stops or deletes a local source.
      }
    };
    void coordinate();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void coordinate();
    }, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    callRoomId,
    conversationConnected,
    flushRecordingReceipts,
    participantId,
    retainedReadiness.ok,
    retainedReadiness.reason,
    start,
    status,
    stop,
  ]);

  useEffect(
    () => () => {
      clearGuardianMonitoring();
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      } else {
        void stopRetainedSourceMeter(new Date().toISOString());
        streamRef.current?.getTracks().forEach((track) => track.stop());
        void durableWriterRef.current?.close();
        durableWriterRef.current = null;
      }
    },
    [clearGuardianMonitoring, stopRetainedSourceMeter],
  );

  const recoverySummary = browserSourceRecoverySummary(recoveryRows);
  const exitSafety = browserSourceExitSafety(status, recoveryRows);
  const latestRecordingReceipt = activeLedger
    ? browserSourcePostStopReceipt(status, activeLedger)
    : null;
  const latestRecordingReviewAction = activeLedger
    ? browserSourceNextReviewAction(callRoomId, activeLedger)
    : null;
  const latestRecordingExit = latestRecordingReceipt
    ? browserSourceReceiptExitStatus(latestRecordingReceipt, exitSafety)
    : null;

  return (
    <section
      className={`rounded-2xl border p-4 ${status === "recording" ? "border-rose-400 bg-rose-50 ring-4 ring-rose-100" : "border-[#d8c7a7] bg-white"}`}
      aria-labelledby={`browser-source-${callRoomId}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-rose-800">
            <HardDrive size={14} />{" "}
            {conversationEnded
              ? "Your recording"
              : sessionKind === "coaching"
                ? "High-quality local recording"
                : "Retained local source"}
          </p>
          <h3
            id={`browser-source-${callRoomId}`}
            className="mt-1 font-serif text-2xl font-black text-[#3d3122]"
          >
            {conversationEnded
              ? exitSafety.label
              : sessionKind === "coaching"
                ? "Record this coaching Session"
                : "Record the selected studio source"}
          </h3>
          <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-[#765f40]">
            {conversationEnded
              ? exitSafety.detail
              : sessionKind === "coaching"
                ? "Joining never starts recording. Once everyone agrees, Record starts the high-quality copy on this device."
                : "Joining never starts recording. Record saves a high-quality copy on this device for the shared timeline."}
          </p>
          <details className="mt-2 text-[10px] font-bold leading-4 text-[#8a7354]">
            <summary className="cursor-pointer">
              How source protection works
            </summary>
            <p className="mt-2">
              Quipsly keeps the call and each participant-owned recording as
              separate evidence, then aligns verified sources with the shared
              Session clock without rewriting the originals.
            </p>
          </details>
        </div>
        <span
          className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${status === "recording" ? "bg-rose-700 text-white" : status === "error" || status === "held" ? "bg-amber-100 text-amber-950" : "bg-emerald-100 text-emerald-950"}`}
        >
          {conversationEnded
            ? exitSafety.label
            : retainedRecorderStatusLabel(status, elapsedSeconds)}
        </span>
      </div>

      {!conversationEnded && !myConsentCoversSource ? (
        <section
          className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-950"
          aria-label="Recording consent needed"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black">
                {sourceType === "video" ? "Camera and audio" : "Audio"} on this
                device ·{" "}
                {transcriptionAllowed ? "Transcript on" : "Transcript off"}
              </p>
              <p className="mt-1 text-[10px] font-semibold leading-4">
                Quipsly remembers your choice for this Session. Recording starts
                only when the coach or host presses Record.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void grantConsent()}
              disabled={!policy || status === "recording"}
              className="min-h-11 rounded-full bg-emerald-800 px-5 text-xs font-black text-white disabled:opacity-50"
            >
              <ShieldCheck size={14} className="mr-1 inline" /> Allow recording
            </button>
          </div>
        </section>
      ) : null}

      {!conversationEnded ? (
        <details className="mt-4 rounded-xl border border-[#e5d8c0] bg-[#fffaf0] p-3">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#5b472f]">
            Recording settings · {myConsentCoversSource ? "Saved" : "Review"}
          </summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-[#e5d8c0] bg-[#fffaf0] p-3">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-xs uppercase tracking-wide text-[#5b472f]">
                  Source
                </strong>
                <span className="text-[10px] font-bold text-[#8a7354]">
                  {microphoneLabel || "Choose a mic above"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={status === "recording"}
                  onClick={() => chooseSourceType("audio")}
                  className={`min-h-11 rounded-xl text-xs font-black ${sourceType === "audio" ? "bg-violet-800 text-white" : "border bg-white text-[#5b472f]"}`}
                >
                  <Mic2 size={15} className="mr-1 inline" /> Studio audio
                </button>
                <button
                  type="button"
                  disabled={status === "recording"}
                  onClick={() => chooseSourceType("video")}
                  className={`min-h-11 rounded-xl text-xs font-black ${sourceType === "video" ? "bg-violet-800 text-white" : "border bg-white text-[#5b472f]"}`}
                >
                  <Video size={15} className="mr-1 inline" /> Camera + audio
                </button>
              </div>
              {sourceType === "video" ? (
                <p className="mt-2 text-[10px] font-bold text-[#8a7354]">
                  Camera: {cameraLabel || "Choose a camera above"}. USB webcam
                  output may be lower quality than the camera's internal
                  recording; Quipsly preserves the measured profile instead of
                  calling it 4K.
                </p>
              ) : null}
              <label className="mt-3 flex items-start gap-2 text-xs font-bold leading-5 text-[#5b472f]">
                <input
                  type="checkbox"
                  checked={headphonesAttested}
                  onChange={(event) =>
                    chooseHeadphonesAttestation(event.target.checked)
                  }
                  className="mt-1 accent-violet-800"
                />{" "}
                I’m using headphones (recommended).
              </label>
              {!headphonesAttested ? (
                <p className="mt-1 text-[10px] font-semibold text-[#8a7354]">
                  You can still record without headphones. This choice is
                  remembered on this device.
                </p>
              ) : (
                <p className="mt-1 text-[10px] font-semibold text-[#8a7354]">
                  Remembered on this device.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-[#e5d8c0] bg-[#fffaf0] p-3">
              <strong className="text-xs uppercase tracking-wide text-[#5b472f]">
                Transcript
              </strong>
              <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">
                Quipsly remembers this Session’s saved choice. Change it only
                when you want a different source or transcript setting.
              </p>
              <label className="mt-2 flex items-start gap-2 text-xs font-bold leading-5 text-[#5b472f]">
                <input
                  ref={transcriptionChoiceInputRef}
                  type="checkbox"
                  checked={transcriptionAllowed}
                  disabled={
                    !policy || status === "checking" || status === "recording"
                  }
                  onChange={(event) =>
                    chooseTranscriptionChoice(event.target.checked)
                  }
                  className="mt-1 accent-violet-800"
                />{" "}
                Create a transcript and suggested notes/tasks
              </label>
              <p className="mt-2 text-[10px] font-semibold leading-4 text-[#8a7354]">
                Everyone chooses for themselves. If anyone else is nearby, let
                them know before recording.
              </p>
              {myConsentCoversSource ? (
                <button
                  type="button"
                  onClick={() => void grantConsent()}
                  disabled={!policy || status === "recording"}
                  className="mt-3 min-h-10 rounded-full border border-emerald-300 bg-emerald-50 px-4 text-[10px] font-black uppercase tracking-wide text-emerald-950 disabled:opacity-50"
                >
                  <ShieldCheck size={14} className="mr-1 inline" /> Update
                  choices
                </button>
              ) : null}
              <p className="mt-2 text-[10px] font-bold text-[#8a7354]">
                {consentReady
                  ? "Everyone is ready to record."
                  : consentId
                    ? "Your choice is saved. Waiting for the other participant."
                    : "Not agreed yet."}
              </p>
              {transcriptionAllowed ? (
                <p
                  className={`mt-1 text-[10px] font-bold leading-4 ${transcriptionChoiceDirty ? "text-amber-800" : allPartyTranscriptionReady ? "text-emerald-800" : "text-[#8a7354]"}`}
                  data-testid="transcription-readiness-message"
                >
                  {transcriptionChoiceDirty
                    ? "Choose Update choices to save this transcript setting."
                    : allPartyTranscriptionReady
                      ? "Everyone enabled the transcript and suggested follow-up."
                      : consentId
                        ? "Your choice is saved. The transcript starts after everyone allows it."
                        : "The transcript will be enabled when you allow recording."}
                </p>
              ) : null}
              <details className="mt-2 text-[10px] font-semibold leading-4 text-[#8a7354]">
                <summary className="cursor-pointer">
                  Recording and privacy details
                </summary>
                <p className="mt-2">{policy?.text || "Loading details…"}</p>
              </details>
            </div>
          </div>
        </details>
      ) : null}

      {!conversationConnected ? (
        conversationEnded ? (
          <section
            className={`mt-4 rounded-xl border p-4 ${exitSafety.state === "safe" || exitSafety.state === "idle" ? "border-emerald-300 bg-emerald-50 text-emerald-950" : exitSafety.state === "attention" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-violet-300 bg-violet-50 text-violet-950"}`}
            aria-label="Recording close status"
            aria-live="polite"
          >
            <p className="flex items-center gap-2 text-sm font-black">
              {exitSafety.state === "safe" || exitSafety.state === "idle" ? (
                <CheckCircle2 size={18} aria-hidden="true" />
              ) : exitSafety.state === "attention" ? (
                <AlertTriangle size={18} aria-hidden="true" />
              ) : (
                <LoaderCircle
                  size={18}
                  className="animate-spin"
                  aria-hidden="true"
                />
              )}
              {exitSafety.label}
            </p>
            <p className="mt-2 text-xs font-semibold leading-5">
              {exitSafety.detail}
            </p>
          </section>
        ) : (
          <p className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold leading-5 text-violet-950">
            Next, check your microphone and camera, then join the call. Joining
            does not start recording; the Record button appears after you join.
          </p>
        )
      ) : null}

      <div
        className={conversationConnected ? "" : "hidden"}
        aria-hidden={!conversationConnected}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {["ENDED", "CANCELED", "FAILED"].includes(
            roomStatus?.toUpperCase() ?? "",
          ) ? (
            canControlRoom ? (
              <button
                type="button"
                onClick={() => void reopenRoom()}
                disabled={status === "checking"}
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-violet-800 px-5 text-xs font-black uppercase tracking-wide text-white disabled:opacity-40"
              >
                <RefreshCw size={16} /> Reopen Session to record
              </button>
            ) : (
              <span className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-950">
                This Session is closed. Ask the coach or host to reopen it
                before recording another take.
              </span>
            )
          ) : null}
          {status === "recording" ||
          (canControlRoom && recordingDirective?.shouldRecord === true) ? (
            <>
              <button
                type="button"
                onClick={() =>
                  canControlRoom ? void issueDirective("STOP") : stop()
                }
                disabled={directiveBusy}
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-rose-800 px-5 text-xs font-black uppercase tracking-wide text-white"
              >
                <Square size={16} fill="currentColor" />{" "}
                {canControlRoom ? "Stop recording" : "Stop my recording"}
              </button>
              {canControlRoom &&
              recordingDirective &&
              ((status === "ready" &&
                retainedReadiness.ok &&
                directiveHandlingRef.current.get(recordingDirective.id) ===
                  "JOIN_REQUIRED") ||
                browserRecordingDirectiveCanRetry({
                  action: recordingDirective.action,
                  status,
                  retainedReady: retainedReadiness.ok,
                  terminalState: directiveHandlingRef.current.get(
                    recordingDirective.id,
                  ),
                })) ? (
                <button
                  type="button"
                  onClick={() => void joinActiveRecording()}
                  disabled={directiveBusy || !retainedReadiness.ok}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full border border-rose-300 bg-white px-5 text-xs font-black uppercase tracking-wide text-rose-950 disabled:opacity-40"
                >
                  <span className="h-3 w-3 rounded-full bg-rose-700" />{" "}
                  {status === "error"
                    ? "Try recording again"
                    : "Start my recording"}
                </button>
              ) : null}
            </>
          ) : canControlRoom ? (
            <button
              type="button"
              onClick={() => void issueDirective("START")}
              disabled={
                !retainedReadiness.ok ||
                directiveBusy ||
                ["starting", "stopping", "uploading"].includes(status) ||
                recordingDirective?.shouldRecord === true
              }
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-rose-800 px-5 text-xs font-black uppercase tracking-wide text-white disabled:opacity-40"
            >
              {status === "starting" ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <span className="h-3 w-3 rounded-full bg-white" />
              )}{" "}
              {sessionKind === "coaching" ? "Record" : "Record source"}
            </button>
          ) : recordingDirective?.shouldRecord &&
            recordingDirective &&
            ((status === "ready" &&
              retainedReadiness.ok &&
              directiveHandlingRef.current.get(recordingDirective.id) ===
                "JOIN_REQUIRED") ||
              browserRecordingDirectiveCanRetry({
                action: recordingDirective.action,
                status,
                retainedReady: retainedReadiness.ok,
                terminalState: directiveHandlingRef.current.get(
                  recordingDirective.id,
                ),
              })) ? (
            <button
              type="button"
              onClick={() => void joinActiveRecording()}
              disabled={directiveBusy || !retainedReadiness.ok}
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-rose-800 px-5 text-xs font-black uppercase tracking-wide text-white disabled:opacity-40"
            >
              <span className="h-3 w-3 rounded-full bg-white" />{" "}
              {status === "error"
                ? "Try recording again"
                : "Start my recording"}
            </button>
          ) : (
            <span className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs font-bold text-violet-950">
              {recordingDirective?.shouldRecord
                ? "Starting your recording…"
                : "Recording starts when the coach or host presses Record."}
            </span>
          )}
        </div>
        {status !== "recording" && !retainedReadiness.ok ? (
          <p
            data-testid="recording-readiness-message"
            role="status"
            className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-950"
          >
            {retainedReadiness.reason}
          </p>
        ) : null}
        {pendingCoordinationReceiptCount > 0 || coordinationReceiptError ? (
          <p
            role="status"
            aria-label="Recording status delivery"
            className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-950"
          >
            Room status is saved on this device and will retry automatically
            when the Session connection is ready. Any recording already captured
            remains protected separately.
          </p>
        ) : null}
        {recordingDirective &&
        recordingHealthProjection &&
        recordingDirective.participantStatuses.length ? (
          <section
            className={`mt-3 rounded-xl border p-3 ${
              recordingHealthProjection.tone === "ready"
                ? "border-emerald-200 bg-emerald-50/70"
                : recordingHealthProjection.tone === "attention"
                  ? "border-amber-300 bg-amber-50"
                  : "border-violet-200 bg-violet-50/60"
            }`}
            aria-label="Recording status"
            aria-live="polite"
          >
            <strong className="text-sm text-[#302316]">
              {recordingHealthProjection.title}
            </strong>
            <p className="mt-1 text-[11px] font-semibold leading-4 text-[#6d563a]">
              {recordingHealthProjection.detail}
            </p>
            <ul className="mt-2 space-y-2">
              {recordingHealthProjection.participants.map((participant) => {
                const participantStatus = recordingEndpointStatus(
                  participant.state,
                );
                return (
                  <li
                    key={participant.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#5b472f]"
                  >
                    <span>{participant.participantLabel}</span>
                    <span
                      className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${participantStatus.tone}`}
                    >
                      {participant.label}
                    </span>
                  </li>
                );
              })}
            </ul>
            {recordingHealthProjection.tone === "attention" ? (
              <p className="mt-2 rounded-lg bg-white px-3 py-2 text-[11px] font-bold leading-4 text-amber-950">
                Open Quipsly on the affected recording device. It will retry the
                protected recording automatically.
              </p>
            ) : null}
            <details className="mt-2 text-[10px] font-bold leading-4 text-[#725d43]">
              <summary className="cursor-pointer">
                Device details · {recordingDirective.endpointReceipts.length}
              </summary>
              <ul className="mt-2 space-y-2">
                {recordingDirective.endpointReceipts.map((receipt) => {
                  const endpointStatus = recordingEndpointStatus(receipt.state);
                  return (
                    <li
                      key={receipt.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2"
                    >
                      <span>
                        {receipt.participantLabel} · {receipt.deviceLabel}
                      </span>
                      <span>{endpointStatus.label}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2">
                Wait for Upload complete before closing a recording device.
                Source receipts and verification details remain available for
                support.
              </p>
            </details>
          </section>
        ) : null}
        <details
          className="mt-2 text-[10px] font-bold leading-4 text-[#8a7354]"
          open={
            !vaultAvailable ||
            Boolean(preflightStorageIssue) ||
            Boolean(operationalIssue)
          }
        >
          <summary className="cursor-pointer">
            Recording health ·{" "}
            {vaultAvailable && !preflightStorageIssue && !operationalIssue
              ? "Ready"
              : "Needs attention"}
          </summary>
          <p className="mt-2">
            On-device protection {vaultAvailable ? "ready" : "unavailable"} ·{" "}
            {vaultPersistent
              ? "persistent storage granted"
              : "browser-managed retention"}{" "}
            · {formatBytes(usageBytes)} / {formatBytes(quotaBytes)}
          </p>
          {operationalIssue?.technicalDetail ? (
            <p
              className="mt-2 break-words font-mono font-medium"
              data-testid="recording-technical-detail"
            >
              Technical detail: {operationalIssue.technicalDetail}
            </p>
          ) : null}
        </details>
        <p
          role="status"
          aria-live="assertive"
          className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold leading-5 ${status === "recording" ? "bg-rose-800 text-white" : status === "error" || status === "held" ? "bg-amber-100 text-amber-950" : "bg-violet-50 text-violet-950"}`}
        >
          {message}
        </p>

        {latestRecordingReceipt &&
        activeLedger &&
        !["checking", "starting", "recording"].includes(status) ? (
          <section
            aria-label="Latest recording receipt"
            aria-live="polite"
            data-testid="latest-recording-receipt"
            className={`mt-3 rounded-xl border p-3 ${
              latestRecordingReceipt.tone === "ready"
                ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                : latestRecordingReceipt.tone === "attention"
                  ? "border-amber-300 bg-amber-50 text-amber-950"
                  : "border-violet-200 bg-violet-50 text-violet-950"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-black">
                  {latestRecordingReceipt.tone === "ready" ? (
                    <CheckCircle2 size={18} aria-hidden="true" />
                  ) : latestRecordingReceipt.tone === "attention" ? (
                    <AlertTriangle size={18} aria-hidden="true" />
                  ) : (
                    <LoaderCircle
                      size={18}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {latestRecordingReceipt.title}
                </p>
                <p className="mt-1 text-xs font-semibold leading-5">
                  {latestRecordingReceipt.detail}
                </p>
                <p className="mt-1 truncate font-mono text-[10px] font-bold opacity-75">
                  {activeLedger.fileName} ·{" "}
                  {formatBytes(activeLedger.sizeBytes)}
                </p>
                {latestRecordingExit?.detail ? (
                  <p className="mt-1 text-[10px] font-bold leading-4">
                    {latestRecordingExit.detail}
                  </p>
                ) : null}
                {latestRecordingReviewAction ? (
                  <p className="mt-1 text-[10px] font-bold leading-4">
                    {latestRecordingReviewAction.detail}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide">
                  {latestRecordingExit?.label ?? "Keep open"}
                </span>
                {latestRecordingReviewAction ? (
                  <a
                    href={latestRecordingReviewAction.href}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full bg-violet-800 px-4 text-[10px] font-black uppercase tracking-wide text-white"
                  >
                    <ExternalLink size={14} aria-hidden="true" />{" "}
                    {latestRecordingReviewAction.label}
                  </a>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {activeLedger?.sourceProfile.captureMeter ? (
          <section
            className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sky-950"
            aria-label="Audio quality"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-[10px] uppercase tracking-wide">
                Audio quality
              </strong>
              <span className="font-mono text-[10px] font-bold">
                {(
                  activeLedger.sourceProfile.captureMeter.sampleRateHz / 1_000
                ).toFixed(1)}{" "}
                kHz ·{" "}
                {activeLedger.sourceProfile.captureMeter.sourceChannelCount ??
                  "?"}{" "}
                source ch
              </span>
            </div>
            <div className="mt-2 grid gap-2 text-xs font-bold sm:grid-cols-3">
              <span>
                Highest level
                <br />
                <span className="font-mono">
                  {formattedDbfs(
                    captureMeterDisplayEvidence(
                      activeLedger.sourceProfile.captureMeter,
                    ).highestObservedRmsDbfs,
                  )}
                </span>
              </span>
              <span>
                Peak
                <br />
                <span className="font-mono">
                  {formattedDbfs(
                    activeLedger.sourceProfile.captureMeter.samplePeakDbfs,
                  )}
                </span>
              </span>
              <span>
                Possible clipping
                <br />
                <span className="font-mono">
                  {captureMeterDisplayEvidence(
                    activeLedger.sourceProfile.captureMeter,
                  ).nearFullScaleSampleCount.toLocaleString()}
                </span>
              </span>
            </div>
            <details className="mt-2 text-[10px] font-bold leading-4 opacity-75">
              <summary className="cursor-pointer">
                How this was measured
              </summary>
              <p className="mt-2">
                {activeLedger.sourceProfile.captureMeter.measurement ===
                "audio-worklet-render-quantum-aggregate"
                  ? "Audio-render observations"
                  : "Animation-frame fallback observations"}{" "}
                are stored with this recording ·{" "}
                {
                  captureMeterDisplayEvidence(
                    activeLedger.sourceProfile.captureMeter,
                  ).missingMessageCount
                }{" "}
                sequence gaps ·{" "}
                {
                  captureMeterDisplayEvidence(
                    activeLedger.sourceProfile.captureMeter,
                  ).tailLabel
                }
                . Full loudness and true-peak analysis runs after capture.
              </p>
            </details>
          </section>
        ) : null}

        {recoveryRows.length ? (
          <details
            className="mt-4 border-t border-[#e5d8c0] pt-3"
            open={recoverySummary.shouldExpand || undefined}
          >
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wide text-[#5b472f]">
              <span className="flex items-center gap-2">
                <HardDrive size={14} /> Saved recordings · {recoveryRows.length}
              </span>
              <span>{recoverySummary.label}</span>
            </summary>
            <p className="mt-2 text-[10px] font-semibold leading-4 text-[#8a7354]">
              {recoverySummary.detail}
            </p>
            <div className="mt-2 space-y-2">
              {recoveryRows.slice(0, 6).map((ledger) => (
                <div
                  key={ledger.captureId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#fffaf0] px-3 py-2 text-xs font-bold text-[#5b472f]"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{ledger.fileName}</span>
                    <span className="text-[10px] text-[#8a7354]">
                      {browserSourceSafetyLabel(ledger)} ·{" "}
                      {formatBytes(ledger.sizeBytes)} ·{" "}
                      {clockEvidenceLabel(ledger)} ·{" "}
                      {new Date(ledger.startedAt).toLocaleString()}
                    </span>
                    {ledger.failureReason ? (
                      <span className="mt-1 block text-[10px] font-semibold leading-4 text-amber-800">
                        {ledger.failureReason}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void downloadBrowserSource(ledger)}
                      className="inline-flex min-h-9 items-center gap-1 rounded-full border bg-white px-3 text-[10px] uppercase"
                    >
                      <Download size={13} /> Download
                    </button>
                    {browserSourceManualUploadRetryAvailable(ledger) ||
                    browserSourceInterruptedRecoveryCandidate(
                      ledger,
                      recorderRef.current?.state === "recording"
                        ? ledgerRef.current?.captureId
                        : null,
                    ) ? (
                      <button
                        type="button"
                        onClick={() => void retryUploadLedger(ledger)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-full border border-violet-300 bg-violet-50 px-3 text-[10px] uppercase text-violet-950"
                      >
                        <UploadCloud size={13} />{" "}
                        {ledger.state === "verified" &&
                        browserSourceStopReceiptNeedsRepair(ledger)
                          ? "Retry Session status"
                          : browserSourceInterruptedRecoveryCandidate(
                                ledger,
                                recorderRef.current?.state === "recording"
                                  ? ledgerRef.current?.captureId
                                  : null,
                              )
                            ? "Recover recording"
                            : ledger.state === "verifying"
                              ? "Check verification"
                              : "Retry upload"}
                      </button>
                    ) : null}
                    {ledger.state === "verified" ? (
                      <CheckCircle2
                        size={18}
                        className="text-emerald-700"
                        aria-label="Verified"
                      />
                    ) : ledger.state === "uploading" ||
                      ledger.state === "verifying" ? (
                      <LoaderCircle
                        size={18}
                        className="animate-spin text-violet-700"
                        aria-label="Uploading"
                      />
                    ) : ledger.state === "recording" ||
                      ledger.state === "preparing" ||
                      ledger.state === "failed" ? (
                      <AlertTriangle
                        size={18}
                        className="text-amber-700"
                        aria-label="Recording needs attention"
                      />
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </details>
        ) : null}
        {studioHandoff?.complete && sessionKind === "coaching" ? (
          <a
            href={`/sessions/${encodeURIComponent(callRoomId)}?mode=recordings`}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 text-[10px] font-black uppercase tracking-wide text-white"
          >
            <ExternalLink size={15} /> Review recording
          </a>
        ) : null}
        {studioHandoff?.complete &&
        sessionKind === "episode" &&
        browserCaptureStudioReviewHref({
          projectSlug: projectSlug || studioHandoff.projectSlug,
          episodeSlug: episodeSlug || studioHandoff.episodeSlug,
          captureGroupId,
        }) ? (
          <a
            href={
              browserCaptureStudioReviewHref({
                projectSlug: projectSlug || studioHandoff.projectSlug,
                episodeSlug: episodeSlug || studioHandoff.episodeSlug,
                captureGroupId,
              })!
            }
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 text-[10px] font-black uppercase tracking-wide text-white"
          >
            <ExternalLink size={15} /> Edit recording
          </a>
        ) : null}
        <details className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-black text-violet-950">
            <span className="flex items-center gap-2">
              <Layers3 size={14} /> Recording processing
            </span>
            <span>
              {studioHandoff?.complete
                ? "Ready"
                : handoffBusy
                  ? "Finishing…"
                  : "In progress"}
            </span>
          </summary>
          <section
            className="mt-3"
            aria-labelledby={`studio-handoff-${callRoomId}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-violet-800">
                  <Layers3 size={14} /> Session take → Studio
                </p>
                <h4
                  id={`studio-handoff-${callRoomId}`}
                  className="mt-1 font-serif text-xl font-black text-violet-950"
                >
                  Keep every device in the same take
                </h4>
                <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-violet-900">
                  This server snapshot includes browser, iPhone, and reconciled
                  provider sources with the exact capture-group identity.
                  Refresh after another device finishes. Quipsly refuses a
                  changed or partially verified source set at the attachment
                  boundary.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshStudioHandoff()}
                disabled={handoffBusy}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-violet-300 bg-white px-4 text-[10px] font-black uppercase tracking-wide text-violet-950 disabled:opacity-50"
              >
                <RefreshCw
                  size={14}
                  className={handoffBusy ? "animate-spin" : ""}
                />{" "}
                Refresh source set
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide">
              <span className="rounded-full bg-white px-3 py-1.5 text-violet-950">
                Take {captureGroupId.slice(0, 8)}
              </span>
              <span className="rounded-full bg-white px-3 py-1.5 text-violet-950">
                {studioHandoff?.requiredSourceCount ?? 0} required masters
              </span>
              <span
                className={`rounded-full px-3 py-1.5 ${studioHandoff?.ready ? "bg-emerald-100 text-emerald-950" : "bg-amber-100 text-amber-950"}`}
              >
                {studioHandoff?.verifiedRequiredSourceCount ?? 0}/
                {studioHandoff?.requiredSourceCount ?? 0} masters verified
              </span>
              <span
                className={`rounded-full px-3 py-1.5 ${studioHandoff?.complete ? "bg-emerald-100 text-emerald-950" : "bg-white text-violet-950"}`}
              >
                {studioHandoff?.promotedRequiredSourceCount ?? 0}/
                {studioHandoff?.requiredSourceCount ?? 0} masters in Studio
              </span>
              {studioHandoff?.providerWitnessCount ? (
                <span className="rounded-full bg-sky-100 px-3 py-1.5 text-sky-950">
                  {studioHandoff.providerWitnessCount} provider witness
                </span>
              ) : null}
            </div>

            {studioHandoff?.sources.length ? (
              <div
                className="mt-3 space-y-2"
                aria-label="Exact Session take source roster"
              >
                {studioHandoff.sources.map((source) => (
                  <div
                    key={source.recordingAssetId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-100 bg-white px-3 py-2"
                  >
                    <span className="min-w-0 text-xs font-bold text-violet-950">
                      <span className="block truncate">{source.fileName}</span>
                      <span className="font-mono text-[10px] text-violet-700">
                        {source.kind.replaceAll("_", " ")} ·{" "}
                        {source.recordingAssetId.slice(0, 12)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1 text-[9px] font-black uppercase tracking-wide">
                      {source.providerWitness ? (
                        <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-950">
                          optional witness · never blocks masters
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full px-2 py-1 ${source.verifiedForStudio ? "bg-emerald-100 text-emerald-950" : "bg-amber-100 text-amber-950"}`}
                      >
                        {source.verifiedForStudio
                          ? "saved and ready"
                          : source.interruptionRepairRequired
                            ? "saved · preparing playback"
                            : `${source.recordingStatus} · ${source.processingDisposition}`}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 ${source.promotedToStudio ? "bg-violet-800 text-white" : "bg-violet-100 text-violet-950"}`}
                      >
                        {source.promotedToStudio
                          ? "ready to edit"
                          : "preparing"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-white px-3 py-3 text-xs font-bold leading-5 text-violet-900">
                No canonical source rows are visible for this exact take yet.
                Browser files remain protected in the local vault;
                upload/verification must finish before Studio attachment.
              </p>
            )}

            <p
              role="status"
              aria-live="polite"
              className="mt-3 text-xs font-bold leading-5 text-violet-950"
            >
              {handoffMessage}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!studioHandoff?.complete ? (
                <button
                  type="button"
                  onClick={() => void promoteStudioHandoff()}
                  disabled={handoffBusy || !studioHandoff?.ready}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-40"
                >
                  <UploadCloud size={15} /> Retry processing
                </button>
              ) : null}
              {sessionKind === "episode" &&
              studioHandoff?.complete &&
              browserCaptureStudioReviewHref({
                projectSlug: projectSlug || studioHandoff.projectSlug,
                episodeSlug: episodeSlug || studioHandoff.episodeSlug,
                captureGroupId,
              }) ? (
                <a
                  href={
                    browserCaptureStudioReviewHref({
                      projectSlug: projectSlug || studioHandoff.projectSlug,
                      episodeSlug: episodeSlug || studioHandoff.episodeSlug,
                      captureGroupId,
                    })!
                  }
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 text-[10px] font-black uppercase tracking-wide text-white"
                >
                  <ExternalLink size={15} /> Open exact take in editor
                </a>
              ) : null}
              {sessionKind === "coaching" && studioHandoff?.complete ? (
                <a
                  href={`/sessions/${encodeURIComponent(callRoomId)}?mode=recordings`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 text-[10px] font-black uppercase tracking-wide text-white"
                >
                  <ExternalLink size={15} /> Review Session recordings
                </a>
              ) : null}
            </div>
            <p className="mt-3 text-[10px] font-bold leading-4 text-violet-700">
              Attachment preserves immutable originals and source identities.
              Network clocks and rough anchors remain proposals; waveform,
              late-drift, and playback review still decide placement and the
              approved master.
            </p>
          </section>
          {activeLedger?.state === "verified" ? (
            <p className="mt-3 text-[10px] font-bold text-emerald-800">
              Verified editor evidence:{" "}
              {activeLedger.serverRecordingAssetId ||
                "recording receipt created"}
              . Session take {activeLedger.captureGroupId.slice(0, 8)} has{" "}
              {clockEvidenceLabel(activeLedger)}; clock drift remains a bounded
              proposal and waveform/listening review still decides final
              placement. Local deletion remains unavailable by design.
            </p>
          ) : null}
        </details>
      </div>
    </section>
  );
}
