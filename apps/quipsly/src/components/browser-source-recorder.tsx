"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  HardDrive,
  LoaderCircle,
  Mic2,
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
  createBrowserSourceFile,
  downloadBrowserSource,
  hashBrowserSourceFile,
  listBrowserSourceLedgers,
  loadBrowserSourceFile,
  saveBrowserSourceLedger,
} from "@/lib/browser-source-vault";
import {
  browserMonotonicNanoseconds,
  measureBrowserCaptureClockBurst,
} from "@/lib/browser-capture-clock";
import {
  analyseStudioAudioFrame,
  appendBrowserCaptureMeterAggregate,
  appendBrowserCaptureMeterFrame,
  createBrowserCaptureMeterSummary,
  finishBrowserCaptureMeterSummary,
  parseBrowserMeterWorkletAggregate,
} from "@/lib/studio-audio-meter";

type ConsentPolicy = {
  version: string;
  text: string;
  sha256: string;
  surface: string;
  presentationVersion: number;
};

type RecorderStatus = "checking" | "ready" | "starting" | "recording" | "stopping" | "uploading" | "held" | "error";

function safeTrackSettings(settings: MediaTrackSettings) {
  return Object.fromEntries(Object.entries(settings).filter((entry): entry is [string, string | number | boolean] => (
    typeof entry[1] === "string" || typeof entry[1] === "number" || typeof entry[1] === "boolean"
  )));
}

function formatBytes(bytes: number | null) {
  if (bytes == null) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
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
      tailLabel: meter.tailAggregateFlushed ? "tail flushed" : "tail not acknowledged",
    };
  }
  return {
    highestObservedRmsDbfs: meter.highestFrameRmsDbfs,
    nearFullScaleSampleCount: meter.clippedSampleCount,
    missingMessageCount: meter.missingMessageCount ?? 0,
    tailLabel: "meter v1 did not record a tail acknowledgement",
  };
}

function stoppedFileName(title: string, sourceType: BrowserSourceKind, mimeType: string, captureId: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "quipsly-session";
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
  const packet = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || packet.ok !== true) throw new Error(String(packet.error || "The durable room receipt could not be saved."));
  return packet;
}

export function BrowserSourceRecorder({
  callRoomId,
  captureGroupId,
  sessionTitle,
  sessionKind,
  episodeSlug = null,
  microphoneId,
  microphoneLabel,
  cameraId,
  cameraLabel,
  onSourceLockChange,
}: {
  callRoomId: string;
  captureGroupId: string;
  sessionTitle: string;
  sessionKind: "coaching" | "episode";
  episodeSlug?: string | null;
  microphoneId: string;
  microphoneLabel: string;
  cameraId: string;
  cameraLabel: string;
  onSourceLockChange?: (locked: boolean) => void;
}) {
  const [status, setStatus] = useState<RecorderStatus>("checking");
  const [message, setMessage] = useState("Checking durable browser storage and consent…");
  const [sourceType, setSourceType] = useState<BrowserSourceKind>(sessionKind === "episode" ? "video" : "audio");
  const [headphonesAttested, setHeadphonesAttested] = useState(false);
  const [audibleConsentAttested, setAudibleConsentAttested] = useState(false);
  const [transcriptionAllowed, setTranscriptionAllowed] = useState(true);
  const [policy, setPolicy] = useState<ConsentPolicy | null>(null);
  const [consentId, setConsentId] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [allPartyAudioReady, setAllPartyAudioReady] = useState(false);
  const [allPartyVideoReady, setAllPartyVideoReady] = useState(false);
  const [vaultAvailable, setVaultAvailable] = useState(false);
  const [vaultPersistent, setVaultPersistent] = useState(false);
  const [quotaBytes, setQuotaBytes] = useState<number | null>(null);
  const [usageBytes, setUsageBytes] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recoveryRows, setRecoveryRows] = useState<BrowserSourceCaptureLedger[]>([]);
  const [activeLedger, setActiveLedger] = useState<BrowserSourceCaptureLedger | null>(null);
  const sourceLocked = status === "starting" || status === "recording" || status === "stopping";

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const writableRef = useRef<FileSystemWritableFileStream | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const ledgerRef = useRef<BrowserSourceCaptureLedger | null>(null);
  const timerRef = useRef<number | null>(null);
  const retainedMeterContextRef = useRef<AudioContext | null>(null);
  const retainedMeterNodeRef = useRef<AudioNode | null>(null);
  const retainedMeterFrameRef = useRef<number | null>(null);
  const retainedMeterSequenceRef = useRef<number | null>(null);
  const retainedMeterFlushResolverRef = useRef<(() => void) | null>(null);
  const retainedMeterSummaryRef = useRef<BrowserSourceCaptureMeterSummaryV2 | null>(null);

  useEffect(() => {
    onSourceLockChange?.(sourceLocked);
    return () => onSourceLockChange?.(false);
  }, [onSourceLockChange, sourceLocked]);

  const refreshRecovery = useCallback(async () => {
    const rows = await listBrowserSourceLedgers(callRoomId).catch(() => []);
    setRecoveryRows(rows);
  }, [callRoomId]);

  useEffect(() => {
    let cancelled = false;
    const policyRequest = typeof globalThis.fetch === "function"
      ? globalThis.fetch(`/api/mobile/capture/consent?callRoomId=${encodeURIComponent(callRoomId)}`, { cache: "no-store" }).then((response) => response.json())
      : Promise.resolve({ currentPolicy: null });
    void Promise.all([
      browserSourceVaultReadiness(),
      policyRequest,
      listBrowserSourceLedgers(callRoomId).catch(() => []),
    ]).then(([vault, consentPacket, rows]) => {
      if (cancelled) return;
      setVaultAvailable(vault.available);
      setVaultPersistent(vault.persistent);
      setQuotaBytes(vault.quotaBytes);
      setUsageBytes(vault.usageBytes);
      setPolicy(consentPacket?.currentPolicy ?? null);
      setConsentId(consentPacket?.session?.recordingConsentId ?? null);
      setParticipantId(consentPacket?.session?.participantId ?? null);
      setAllPartyAudioReady(consentPacket?.session?.allRegisteredParticipantConsentGranted === true);
      setAllPartyVideoReady(consentPacket?.session?.allRegisteredParticipantVideoConsentGranted === true);
      setRecoveryRows(rows);
      setStatus(vault.available && consentPacket?.currentPolicy ? "ready" : "held");
      setMessage(vault.available
        ? "Durable local source vault is ready. Review consent and retain the selected source when everyone is ready."
        : "This browser cannot provide Quipsly's durable local vault. Use Quipsly Capture or a supported desktop browser.");
    }).catch((error) => {
      if (cancelled) return;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Browser source preflight failed.");
    });
    return () => { cancelled = true; };
  }, [callRoomId]);

  const consentReady = sourceType === "video" ? allPartyVideoReady : allPartyAudioReady;
  const readiness = useMemo(() => browserSourceCanBegin({
    opfsAvailable: vaultAvailable,
    microphoneId,
    cameraId,
    sourceType,
    recordingConsentId: consentId,
    allPartyConsentReady: consentReady,
    headphonesAttested,
  }), [cameraId, consentId, consentReady, headphonesAttested, microphoneId, sourceType, vaultAvailable]);

  const grantConsent = useCallback(async () => {
    if (!policy || !audibleConsentAttested) {
      setMessage("Confirm that every audible participant was notified and agreed before saving consent.");
      return;
    }
    setStatus("checking");
    const presentedAt = new Date().toISOString();
    try {
      const response = await fetch("/api/mobile/capture/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          callRoomId,
          consentAction: "GRANT",
          canRecordAudio: true,
          canRecordVideo: sourceType === "video",
          canTranscribe: transcriptionAllowed,
          allAudibleParticipantsNotifiedAndAgreed: true,
          consentPolicyVersion: policy.version,
          consentText: policy.text,
          consentTextHash: policy.sha256,
          clientKind: "web",
          deviceLabel: navigator.platform ? `Quipsly Web · ${navigator.platform}` : "Quipsly Web",
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
      if (!response.ok || !packet?.ok) throw new Error(packet?.error || "Consent could not be saved.");
      const session = packet.session ?? {};
      setConsentId(session.recordingConsentId ?? null);
      setParticipantId(session.participantId ?? null);
      setAllPartyAudioReady(session.allRegisteredParticipantConsentGranted === true);
      setAllPartyVideoReady(session.allRegisteredParticipantVideoConsentGranted === true);
      setStatus("ready");
      setMessage(session.nextAction || "Consent receipt saved.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Consent could not be saved.");
    }
  }, [audibleConsentAttested, callRoomId, policy, sourceType, transcriptionAllowed]);

  const updateLedger = useCallback(async (ledger: BrowserSourceCaptureLedger) => {
    ledgerRef.current = ledger;
    setActiveLedger(ledger);
    await saveBrowserSourceLedger(ledger);
  }, []);

  const startRetainedSourceMeter = useCallback(async (
    stream: MediaStream,
    startedAt: string,
  ) => {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;
    if (retainedMeterFrameRef.current !== null) {
      cancelAnimationFrame(retainedMeterFrameRef.current);
    }
    await retainedMeterContextRef.current?.close().catch(() => undefined);

    const context = new AudioContext();
    const settings = audioTrack.getSettings();
    const source = context.createMediaStreamSource(new MediaStream([audioTrack]));
    const sourceChannelCount = typeof settings.channelCount === "number"
      ? Math.max(1, Math.round(settings.channelCount))
      : null;
    retainedMeterContextRef.current = context;
    retainedMeterSequenceRef.current = null;

    try {
      if (!context.audioWorklet || typeof AudioWorkletNode !== "function") {
        throw new Error("AudioWorklet is unavailable.");
      }
      await context.audioWorklet.addModule("/audio/quipsly-capture-meter-worklet-v1.js");
      const worklet = new AudioWorkletNode(context, "quipsly-capture-meter-v1", {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCountMode: "max",
      });
      retainedMeterNodeRef.current = worklet;
      retainedMeterSummaryRef.current = createBrowserCaptureMeterSummary({
        startedAt,
        sampleRateHz: context.sampleRate,
        sourceChannelCount,
        measurement: "audio-worklet-render-quantum-aggregate",
      });
      worklet.port.onmessage = (event: MessageEvent<unknown>) => {
        if (
          event.data
          && typeof event.data === "object"
          && "kind" in event.data
          && event.data.kind === "quipsly-capture-meter-flushed-v1"
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
  }, []);

  const stopRetainedSourceMeter = useCallback(async (stoppedAt: string) => {
    if (retainedMeterFrameRef.current !== null) {
      cancelAnimationFrame(retainedMeterFrameRef.current);
      retainedMeterFrameRef.current = null;
    }
    const activeNode = retainedMeterNodeRef.current;
    if (typeof AudioWorkletNode === "function" && activeNode instanceof AudioWorkletNode) {
      await Promise.race([
        new Promise<void>((resolve) => {
          retainedMeterFlushResolverRef.current = resolve;
          activeNode.port.postMessage({ kind: "quipsly-capture-meter-flush-v1" });
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

  const uploadLedger = useCallback(async (ledger: BrowserSourceCaptureLedger) => {
    if (!ledger.sha256 || !ledger.stoppedAt || !ledger.recordingConsentId || !ledger.participantId) {
      throw new Error("This take is missing its completed checksum or consent binding.");
    }
    setStatus("uploading");
    setMessage("Creating an immutable resumable upload reservation…");
    let current: BrowserSourceCaptureLedger = { ...ledger, state: "uploading", updatedAt: new Date().toISOString() };
    await updateLedger(current);
    const file = await loadBrowserSourceFile(current.opfsFileName);
    const manifestResponse = await fetch("/api/mobile/capture/uploads/resumable", {
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
    });
    const reservation = await manifestResponse.json().catch(() => ({}));
    if (!manifestResponse.ok || !reservation?.ok) {
      const diagnostic = [reservation?.code, reservation?.stage]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .join(" · ");
      throw new Error(`${reservation?.error || "Upload reservation failed."}${diagnostic ? ` (${diagnostic})` : ""}`);
    }
    if (reservation.upload) {
      setMessage(`Uploading ${formatBytes(current.sizeBytes)} from the protected local source…`);
      const uploadUrl = new URL(reservation.upload.url, window.location.origin);
      const localToken = uploadUrl.searchParams.get("token");
      if (reservation.storageBackend === "local-development") {
        const headers: Record<string, string> = {
          "content-type": current.contentType,
          "content-range": `bytes 0-${current.sizeBytes - 1}/${current.sizeBytes}`,
        };
        if (localToken) headers["x-quipsly-local-capture-capability"] = localToken;
        const uploadResponse = await fetch(uploadUrl.toString(), { method: "PUT", headers, body: file });
        if (!uploadResponse.ok) throw new Error(`Durable byte upload failed (${uploadResponse.status}).`);
        current = { ...current, uploadedBytes: current.sizeBytes, updatedAt: new Date().toISOString() };
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
          throw new Error(`Resumable upload status failed (${statusResponse.status}).`);
        }
        while (uploadedBytes < current.sizeBytes) {
          const chunk = browserSourceNextUploadChunk(current.sizeBytes, uploadedBytes);
          if (!chunk) throw new Error("The resumable upload cursor is invalid.");
          setMessage(`Uploading protected source · ${Math.floor((uploadedBytes / current.sizeBytes) * 100)}% · local copy retained`);
          const uploadResponse = await fetch(uploadUrl.toString(), {
            method: "PUT",
            headers: {
              "content-type": current.contentType,
              "content-range": `bytes ${chunk.start}-${chunk.endInclusive}/${current.sizeBytes}`,
            },
            body: file.slice(chunk.start, chunk.endExclusive, current.contentType),
            redirect: "manual",
          });
          if (!uploadResponse.ok && uploadResponse.status !== 308) {
            throw new Error(`Durable byte upload failed (${uploadResponse.status}).`);
          }
          const acknowledged = uploadResponse.ok
            ? current.sizeBytes
            : browserSourcePersistedBytes(uploadResponse.headers.get("range"));
          if (acknowledged <= uploadedBytes || acknowledged > current.sizeBytes) {
            throw new Error("The resumable upload did not acknowledge forward progress.");
          }
          uploadedBytes = acknowledged;
          current = { ...current, uploadedBytes, updatedAt: new Date().toISOString() };
          await updateLedger(current);
        }
      }
    }
    current = { ...current, state: "verifying", updatedAt: new Date().toISOString() };
    await updateLedger(current);
    setMessage("Source uploaded. Quipsly is verifying exact bytes and creating editor evidence…");
    const finalizeResponse = await fetch(reservation.finalizeUrl || "/api/mobile/capture/uploads/resumable/finalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadSessionId: current.uploadSessionId }),
    });
    const finalized = await finalizeResponse.json().catch(() => ({}));
    if (!finalizeResponse.ok || !finalized?.ok) throw new Error(finalized?.error || "Source verification needs a retry.");
    const verification = finalized.verification ?? {};
    const finalization = finalized.finalization ?? {};
    current = {
      ...current,
      state: finalized.uploadStage === "verified" || verification.status === "verified" ? "verified" : "verifying",
      serverRecordingAssetId: finalization.recordingAssetId ?? verification.recordingAssetId ?? null,
      serverTranscriptJobId: finalization.transcriptJobId ?? verification.transcriptJobId ?? null,
      updatedAt: new Date().toISOString(),
    };
    await updateLedger(current);
    setStatus(current.state === "verified" ? "ready" : "uploading");
    setMessage(current.state === "verified"
      ? "Exact bytes verified. The local source remains protected and the editor evidence is ready."
      : "The source is durable and server verification is still running. Keep the local source and retry status later.");
    await refreshRecovery();
  }, [refreshRecovery, sessionKind, updateLedger]);

  const retryUploadLedger = useCallback(async (ledger: BrowserSourceCaptureLedger) => {
    try {
      await uploadLedger(ledger);
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : "Upload retry failed.";
      const current = ledgerRef.current?.captureId === ledger.captureId
        ? ledgerRef.current
        : ledger;
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
  }, [refreshRecovery, updateLedger, uploadLedger]);

  const stop = useCallback((reason?: string) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setStatus("stopping");
    setMessage(reason || "Stopping cleanly, flushing the local file, then computing exact-byte evidence…");
    recorder.stop();
  }, []);

  useEffect(() => {
    if (status !== "recording") return;
    let cancelled = false;
    const verifyCurrentConsent = async () => {
      try {
        const response = await fetch(`/api/mobile/capture/consent?callRoomId=${encodeURIComponent(callRoomId)}`, { cache: "no-store" });
        const packet = await response.json().catch(() => ({}));
        if (cancelled) return;
        const session = packet?.session ?? {};
        const audioReady = response.ok && session.allRegisteredParticipantConsentGranted === true;
        const videoReady = response.ok && session.allRegisteredParticipantVideoConsentGranted === true;
        setAllPartyAudioReady(audioReady);
        setAllPartyVideoReady(videoReady);
        if (sourceType === "video" ? !videoReady : !audioReady) {
          stop("Consent changed or a new participant joined. Local recording is stopping and preserving the flushed source.");
        }
      } catch {
        if (!cancelled) stop("Consent readback became unavailable. Local recording is stopping safely and preserving the flushed source.");
      }
    };
    const interval = window.setInterval(() => void verifyCurrentConsent(), 2_500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [callRoomId, sourceType, status, stop]);

  const start = useCallback(async () => {
    if (!readiness.ok || !consentId) {
      setMessage(readiness.reason);
      return;
    }
    setStatus("starting");
    setMessage("Opening the selected source and durable local file…");
    const captureId = crypto.randomUUID();
    const uploadSessionId = crypto.randomUUID();
    const startReceiptId = crypto.randomUUID();
    const stopReceiptId = crypto.randomUUID();
    let stream: MediaStream | null = null;
    try {
      await postRoomReceipt({ callRoomId, action: "OPEN", receiptId: crypto.randomUUID(), occurredAt: new Date().toISOString() });
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
        video: sourceType === "video" ? {
          deviceId: { exact: cameraId },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          frameRate: { ideal: 30 },
        } : false,
      });
      streamRef.current = stream;
      const supportedMime = chooseBrowserSourceMimeType(sourceType, (value) => MediaRecorder.isTypeSupported(value));
      const recorder = new MediaRecorder(stream, {
        ...(supportedMime ? { mimeType: supportedMime } : {}),
        audioBitsPerSecond: 256_000,
        ...(sourceType === "video" ? { videoBitsPerSecond: 18_000_000 } : {}),
      });
      const contentType = recorder.mimeType || supportedMime || (sourceType === "video" ? "video/webm" : "audio/webm");
      const opfsFileName = `${captureId}.${browserSourceFileExtension(contentType)}.part`;
      const { writable } = await createBrowserSourceFile(opfsFileName);
      writableRef.current = writable;
      const startedAt = new Date().toISOString();
      const monotonicStartedNanoseconds = browserMonotonicNanoseconds(performance.now());
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
        fileName: stoppedFileName(sessionTitle, sourceType, contentType, captureId),
        opfsFileName,
        contentType,
        sourceType,
        sourceProfile: {
          contractKind: QUIPSLY_BROWSER_SOURCE_CAPTURE_KIND,
          schemaVersion: 3,
          clientKind: "web",
          sourceKind: sourceType,
          quality: "studio-source",
          browserMimeType: contentType,
          deviceId: sourceType === "video" ? cameraId : microphoneId,
          deviceLabel: sourceType === "video" ? `${cameraLabel} + ${microphoneLabel}` : microphoneLabel,
          trackSettings: { ...safeTrackSettings(audioSettings), ...Object.fromEntries(Object.entries(safeTrackSettings(videoSettings)).map(([key, value]) => [`video.${key}`, value])) },
          monotonicStartedNanoseconds,
          clockSamples,
          processing: {
            echoCancellation: typeof audioSettings.echoCancellation === "boolean" ? audioSettings.echoCancellation : null,
            noiseSuppression: typeof audioSettings.noiseSuppression === "boolean" ? audioSettings.noiseSuppression : null,
            autoGainControl: typeof audioSettings.autoGainControl === "boolean" ? audioSettings.autoGainControl : null,
          },
          headphonesAttested: true,
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
        startReceiptId,
        stopReceiptId,
        startReceiptPersisted: false,
        stopReceiptPersisted: false,
        serverRecordingAssetId: null,
        serverTranscriptJobId: null,
        failureReason: null,
        updatedAt: startedAt,
      };
      await updateLedger(ledger);
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
        writeQueueRef.current = writeQueueRef.current.then(async () => {
          const current = ledgerRef.current;
          const writableFile = writableRef.current;
          if (!current || !writableFile) throw new Error("Local source writer disappeared.");
          const chunk = {
            index: current.chunks.length,
            byteOffset: current.sizeBytes,
            sizeBytes: event.data.size,
            recorderTimecodeMs: Number.isFinite(event.timecode) ? event.timecode : null,
            receivedAt: new Date().toISOString(),
          };
          await writableFile.write(event.data);
          await updateLedger({
            ...current,
            state: "recording",
            sizeBytes: current.sizeBytes + event.data.size,
            chunks: [...current.chunks, chunk],
            updatedAt: chunk.receivedAt,
          });
        }).catch((error) => {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "A local source chunk could not be persisted.");
          if (recorder.state !== "inactive") recorder.stop();
        });
      };
      recorder.onstop = () => {
        void (async () => {
          if (timerRef.current) window.clearInterval(timerRef.current);
          timerRef.current = null;
          await writeQueueRef.current;
          await writableRef.current?.close();
          writableRef.current = null;
          streamRef.current?.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          const stoppedAt = new Date().toISOString();
          const captureMeter = await stopRetainedSourceMeter(stoppedAt);
          const file = await loadBrowserSourceFile(opfsFileName);
          const hash = await hashBrowserSourceFile(file);
          let current = ledgerRef.current!;
          current = {
            ...current,
            state: "stopped",
            stoppedAt,
            sizeBytes: hash.sizeBytes,
            sha256: hash.sha256,
            sourceProfile: captureMeter
              ? { ...current.sourceProfile, captureMeter }
              : current.sourceProfile,
            updatedAt: stoppedAt,
          };
          await updateLedger(current);
          try {
            await postRoomReceipt({ callRoomId, action: "STOP_RECORDING", receiptId: stopReceiptId, captureId, occurredAt: stoppedAt });
            current = { ...current, stopReceiptPersisted: true, updatedAt: new Date().toISOString() };
            await updateLedger(current);
          } catch (error) {
            current = { ...current, state: "held", failureReason: error instanceof Error ? error.message : "STOP receipt needs retry.", updatedAt: new Date().toISOString() };
            await updateLedger(current);
          }
          setStatus(current.state === "held" ? "held" : "ready");
          setMessage(current.state === "held"
            ? "The source is protected locally, but its STOP receipt needs attention. It was not uploaded."
            : "Local source stopped cleanly and hashed. Upload it now, or keep it protected for recovery.");
          await refreshRecovery();
          if (current.state === "stopped") await uploadLedger(current);
        })().catch(async (error) => {
          const current = ledgerRef.current;
          if (current) await updateLedger({ ...current, state: "held", failureReason: error instanceof Error ? error.message : "Finalization failed.", updatedAt: new Date().toISOString() });
          setStatus("held");
          setMessage(error instanceof Error ? `Source protected locally: ${error.message}` : "Source protected locally; finalization needs attention.");
          await refreshRecovery();
        });
      };
      recorder.onerror = () => {
        setMessage("The browser encoder reported an error. Quipsly is preserving every flushed local chunk.");
      };
      recorderRef.current = recorder;
      recorder.start(2_000);
      const startedReceipt = await postRoomReceipt({ callRoomId, action: "START_RECORDING", receiptId: startReceiptId, captureId, sourceType, occurredAt: startedAt });
      if (startedReceipt.stateApplied !== true && startedReceipt.receiptPersisted !== true) throw new Error("Recording START was not accepted into the durable room ledger.");
      await updateLedger({ ...ledgerRef.current!, state: "recording", startReceiptPersisted: true, updatedAt: new Date().toISOString() });
      setElapsedSeconds(0);
      timerRef.current = window.setInterval(() => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000))), 250);
      setStatus("recording");
      setMessage("LOCAL SOURCE RECORDING · durable chunks are being written on this device. The call feed remains separate.");
    } catch (error) {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      } else {
        await stopRetainedSourceMeter(new Date().toISOString());
        stream?.getTracks().forEach((track) => track.stop());
      }
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The browser source could not start.");
    }
  }, [callRoomId, cameraId, cameraLabel, captureGroupId, consentId, episodeSlug, microphoneId, microphoneLabel, participantId, readiness, refreshRecovery, sessionTitle, sourceType, startRetainedSourceMeter, stopRetainedSourceMeter, updateLedger, uploadLedger]);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    } else {
      void stopRetainedSourceMeter(new Date().toISOString());
      streamRef.current?.getTracks().forEach((track) => track.stop());
    }
  }, [stopRetainedSourceMeter]);

  return (
    <section className={`rounded-2xl border p-4 ${status === "recording" ? "border-rose-400 bg-rose-50 ring-4 ring-rose-100" : "border-[#d8c7a7] bg-white"}`} aria-labelledby={`browser-source-${callRoomId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-rose-800"><HardDrive size={14} /> Retained local source</p>
          <h3 id={`browser-source-${callRoomId}`} className="mt-1 font-serif text-2xl font-black text-[#3d3122]">Record the selected studio source</h3>
          <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-[#765f40]">This is independent from the live call. Chunks go to a private on-device file, survive refreshes, receive START/STOP and consent receipts, then use the same verified upload path as iPhone Capture. Every source in this Session shares one take identity while preserving its own clock and immutable bytes.</p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${status === "recording" ? "bg-rose-700 text-white" : status === "error" || status === "held" ? "bg-amber-100 text-amber-950" : "bg-emerald-100 text-emerald-950"}`}>{status === "recording" ? `Recording ${elapsedSeconds}s` : status}</span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-[#e5d8c0] bg-[#fffaf0] p-3">
          <div className="flex items-center justify-between gap-2"><strong className="text-xs uppercase tracking-wide text-[#5b472f]">1 · Source</strong><span className="text-[10px] font-bold text-[#8a7354]">{microphoneLabel || "Choose a mic above"}</span></div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={status === "recording"} onClick={() => setSourceType("audio")} className={`min-h-11 rounded-xl text-xs font-black ${sourceType === "audio" ? "bg-violet-800 text-white" : "border bg-white text-[#5b472f]"}`}><Mic2 size={15} className="mr-1 inline" /> Studio audio</button>
            <button type="button" disabled={status === "recording"} onClick={() => setSourceType("video")} className={`min-h-11 rounded-xl text-xs font-black ${sourceType === "video" ? "bg-violet-800 text-white" : "border bg-white text-[#5b472f]"}`}><Video size={15} className="mr-1 inline" /> Camera + audio</button>
          </div>
          {sourceType === "video" ? <p className="mt-2 text-[10px] font-bold text-[#8a7354]">Camera: {cameraLabel || "Choose a camera above"}. USB webcam output may be lower quality than the camera's internal recording; Quipsly preserves the measured profile instead of calling it 4K.</p> : null}
          <label className="mt-3 flex items-start gap-2 text-xs font-bold leading-5 text-[#5b472f]"><input type="checkbox" checked={headphonesAttested} onChange={(event) => setHeadphonesAttested(event.target.checked)} className="mt-1 accent-violet-800" /> I am monitoring through headphones, so the retained mic source will not capture speaker echo.</label>
        </div>

        <div className="rounded-xl border border-[#e5d8c0] bg-[#fffaf0] p-3">
          <strong className="text-xs uppercase tracking-wide text-[#5b472f]">2 · Consent</strong>
          <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">{policy?.text || "Loading the current recording policy…"}</p>
          <label className="mt-2 flex items-start gap-2 text-xs font-bold leading-5 text-[#5b472f]"><input type="checkbox" checked={audibleConsentAttested} onChange={(event) => setAudibleConsentAttested(event.target.checked)} className="mt-1 accent-violet-800" /> Every audible participant was notified and agreed to the selected recording.</label>
          <label className="mt-2 flex items-start gap-2 text-xs font-bold leading-5 text-[#5b472f]"><input type="checkbox" checked={transcriptionAllowed} onChange={(event) => setTranscriptionAllowed(event.target.checked)} className="mt-1 accent-violet-800" /> I separately agree to transcription and transcript-derived notes/tasks.</label>
          <button type="button" onClick={() => void grantConsent()} disabled={!policy || !audibleConsentAttested || status === "recording"} className="mt-3 min-h-10 rounded-full border border-emerald-300 bg-emerald-50 px-4 text-[10px] font-black uppercase tracking-wide text-emerald-950 disabled:opacity-50"><ShieldCheck size={14} className="mr-1 inline" /> Save my consent receipt</button>
          <p className="mt-2 text-[10px] font-bold text-[#8a7354]">{consentReady ? "All currently signed-in participants are ready for this source." : consentId ? "Your receipt is saved; another signed-in participant may still need to consent." : "No current browser consent receipt."}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {status === "recording" ? (
          <button type="button" onClick={() => stop()} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-rose-800 px-5 text-xs font-black uppercase tracking-wide text-white"><Square size={16} fill="currentColor" /> Stop local source</button>
        ) : (
          <button type="button" onClick={() => void start()} disabled={!readiness.ok || ["starting", "stopping", "uploading"].includes(status)} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-rose-800 px-5 text-xs font-black uppercase tracking-wide text-white disabled:opacity-40">{status === "starting" ? <LoaderCircle size={16} className="animate-spin" /> : <span className="h-3 w-3 rounded-full bg-white" />} Record local source</button>
        )}
        <span className="text-[10px] font-bold text-[#8a7354]">Vault {vaultAvailable ? "ready" : "unavailable"} · {vaultPersistent ? "persistent storage granted" : "browser-managed retention"} · {formatBytes(usageBytes)} / {formatBytes(quotaBytes)}</span>
      </div>
      <p role="status" aria-live="assertive" className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold leading-5 ${status === "recording" ? "bg-rose-800 text-white" : status === "error" || status === "held" ? "bg-amber-100 text-amber-950" : "bg-violet-50 text-violet-950"}`}>{message}</p>

      {activeLedger?.sourceProfile.captureMeter ? <section className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sky-950" aria-label="Retained source capture-time meter evidence">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-[10px] uppercase tracking-wide">Capture-time meter receipt</strong><span className="font-mono text-[10px] font-bold">{(activeLedger.sourceProfile.captureMeter.sampleRateHz / 1_000).toFixed(1)} kHz · {activeLedger.sourceProfile.captureMeter.sourceChannelCount ?? "?"} source ch</span></div>
        <div className="mt-2 grid gap-2 text-xs font-bold sm:grid-cols-3">
          <span>Highest observed RMS<br /><span className="font-mono">{formattedDbfs(captureMeterDisplayEvidence(activeLedger.sourceProfile.captureMeter).highestObservedRmsDbfs)}</span></span>
          <span>Sample peak<br /><span className="font-mono">{formattedDbfs(activeLedger.sourceProfile.captureMeter.samplePeakDbfs)}</span></span>
          <span>Near-full-scale samples<br /><span className="font-mono">{captureMeterDisplayEvidence(activeLedger.sourceProfile.captureMeter).nearFullScaleSampleCount.toLocaleString()}</span></span>
        </div>
        <p className="mt-2 text-[10px] font-bold leading-4 opacity-75">{activeLedger.sourceProfile.captureMeter.measurement === "audio-worklet-render-quantum-aggregate" ? "Audio-render observations" : "Animation-frame fallback observations"} are stored with this source profile · {captureMeterDisplayEvidence(activeLedger.sourceProfile.captureMeter).missingMessageCount} sequence gaps · {captureMeterDisplayEvidence(activeLedger.sourceProfile.captureMeter).tailLabel}. This is not a complete decode, integrated loudness, or true-peak result; those belong to verified post-capture analysis.</p>
      </section> : null}

      {recoveryRows.length ? <div className="mt-4 border-t border-[#e5d8c0] pt-3">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-[#5b472f]"><HardDrive size={14} /> Protected takes on this browser · {recoveryRows.length}</div>
        <div className="mt-2 space-y-2">{recoveryRows.slice(0, 6).map((ledger) => <div key={ledger.captureId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#fffaf0] px-3 py-2 text-xs font-bold text-[#5b472f]">
          <span className="min-w-0"><span className="block truncate">{ledger.fileName}</span><span className="text-[10px] text-[#8a7354]">{ledger.state} · {formatBytes(ledger.sizeBytes)} · {ledger.sourceProfile.clockSamples?.length ?? 0}/3 clock samples · {new Date(ledger.startedAt).toLocaleString()}</span></span>
          <span className="flex gap-2">
            <button type="button" onClick={() => void downloadBrowserSource(ledger)} className="inline-flex min-h-9 items-center gap-1 rounded-full border bg-white px-3 text-[10px] uppercase"><Download size={13} /> Download</button>
            {["stopped", "held", "failed", "uploading", "verifying"].includes(ledger.state) && ledger.sha256 ? <button type="button" onClick={() => void retryUploadLedger(ledger)} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-violet-300 bg-violet-50 px-3 text-[10px] uppercase text-violet-950"><UploadCloud size={13} /> Retry handoff</button> : null}
            {ledger.state === "verified" ? <CheckCircle2 size={18} className="text-emerald-700" aria-label="Verified" /> : ledger.state === "recording" || ledger.state === "preparing" ? <AlertTriangle size={18} className="text-amber-700" aria-label="Interrupted take needs recovery" /> : null}
          </span>
        </div>)}</div>
      </div> : null}
      {activeLedger?.state === "verified" ? <p className="mt-3 text-[10px] font-bold text-emerald-800">Verified editor evidence: {activeLedger.serverRecordingAssetId || "recording receipt created"}. Session take {activeLedger.captureGroupId.slice(0, 8)} has {activeLedger.sourceProfile.clockSamples?.length ?? 0}/3 network clock samples; waveform and late-drift review still decide final placement. Local deletion remains unavailable by design.</p> : null}
    </section>
  );
}
