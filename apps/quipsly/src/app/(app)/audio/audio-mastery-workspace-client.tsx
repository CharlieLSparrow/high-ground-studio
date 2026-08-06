"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Circle,
  FileAudio2,
  FileText,
  Gauge,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  Waves,
} from "lucide-react";

import type { AudioMasteryPlaybackReviewEvidence } from "@high-ground/quipsly-media-processing";

import { AudioMasteryLoudnessGraph } from "@/components/audio/AudioMasteryLoudnessGraph";
import { EpisodeAudioActivityMap } from "@/components/audio/EpisodeAudioActivityMap";
import { EpisodeAudioMatchedAudition } from "@/components/audio/EpisodeAudioMatchedAudition";
import { EpisodeAudioProgramMap } from "@/components/audio/EpisodeAudioProgramMap";
import {
  buildEpisodeAudioActivityMap,
  type EpisodeAudioActivityMoment,
} from "@/lib/episode-audio-activity-map";
import {
  buildEpisodeAudioComparisonPlan,
  type EpisodeAudioComparisonPlan,
} from "@/lib/episode-audio-comparison";
import {
  buildEpisodeAudioProgram,
  type EpisodeAudioProgramDecision,
  type EpisodeAudioProgramTrack,
} from "@/lib/episode-audio-program";
import { AudioMasteryAudition } from "../editor/AudioMasteryAudition";
import { DialogueRepairDesk } from "../editor/DialogueRepairDesk";
import { StudioTranscriptReviewDesk } from "../editor/StudioTranscriptReviewDesk";
import {
  audioMasteryLifecycle,
  audioWorkspaceAssets,
  audioWorkspaceSignal,
  type AudioSignalProfileClientStatus,
  type AudioMasteryClientStatus,
  type AudioWorkspaceAsset,
  type AudioWorkspaceInventory,
  type AudioWorkspaceProjectOption,
  type StudioSourceTranscriptClientStatus,
} from "./audio-mastery-workspace-model";

type BusyOperation = "signal" | "transcript" | "mastery" | "review" | "promotion" | "delivery" | "delivery-review" | null;

type EpisodeAudioAnalysisLedgerClient = {
  currentInputSha256: string;
  latest: null | { id: string; stale: boolean; inputSha256: string; analyzedAt: string; momentCount: number };
};

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback;
}

function statusTone(status: AudioMasteryClientStatus | null) {
  if (!status || status.status === "not-queued") return "border-slate-700 bg-slate-900 text-slate-300";
  if (status.status === "failed" || status.status === "blocked") return "border-rose-700 bg-rose-950 text-rose-100";
  if (status.status === "completed") return "border-emerald-700 bg-emerald-950 text-emerald-100";
  return "border-amber-700 bg-amber-950 text-amber-100";
}

function selectionHref(projectId: string, projectSlug: string, episodeSlug: string, assetId?: string | null, sourceSeconds?: number | null) {
  const query = new URLSearchParams();
  if (projectId) query.set("projectId", projectId);
  if (projectSlug) query.set("project", projectSlug);
  if (episodeSlug) query.set("episode", episodeSlug);
  if (assetId) query.set("asset", assetId);
  if (sourceSeconds !== null && sourceSeconds !== undefined && Number.isFinite(sourceSeconds) && sourceSeconds >= 0) query.set("at", sourceSeconds.toFixed(3));
  return `/audio?${query.toString()}`;
}

function editorHref(projectSlug: string, episodeSlug: string, assetId?: string | null) {
  const query = new URLSearchParams({ project: projectSlug, episode: episodeSlug });
  if (assetId) query.set("asset", assetId);
  return `/editor?${query.toString()}`;
}

function episodeRoomHref(projectSlug: string, episodeSlug: string) {
  return `/nests/${encodeURIComponent(projectSlug)}/episodes/${encodeURIComponent(episodeSlug)}`;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function AudioMasteryWorkspaceClient({
  projects,
  initialProjectId = "",
  initialProjectSlug,
  initialEpisodeSlug,
  initialAssetId,
  initialFocusSeconds = null,
  initialFocusId = null,
  loadError = null,
}: {
  projects: AudioWorkspaceProjectOption[];
  initialProjectId?: string;
  initialProjectSlug: string;
  initialEpisodeSlug: string;
  initialAssetId: string | null;
  initialFocusSeconds?: number | null;
  initialFocusId?: string | null;
  loadError?: string | null;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(initialProjectId);
  const [projectSlug, setProjectSlug] = useState(initialProjectSlug);
  const [episodeSlug, setEpisodeSlug] = useState(initialEpisodeSlug);
  const [selectedAssetId, setSelectedAssetId] = useState(initialAssetId);
  const [comparisonPlan, setComparisonPlan] = useState<EpisodeAudioComparisonPlan | null>(null);
  const [inventory, setInventory] = useState<AudioWorkspaceInventory | null>(null);
  const [inventoryState, setInventoryState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [inventoryError, setInventoryError] = useState<string | null>(loadError);
  const [status, setStatus] = useState<AudioMasteryClientStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [signalStatus, setSignalStatus] = useState<AudioSignalProfileClientStatus | null>(null);
  const [signalStatusLoading, setSignalStatusLoading] = useState(false);
  const [transcriptStatus, setTranscriptStatus] = useState<StudioSourceTranscriptClientStatus | null>(null);
  const [transcriptStatusLoading, setTranscriptStatusLoading] = useState(false);
  const [operation, setOperation] = useState<BusyOperation>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusRefreshToken, setStatusRefreshToken] = useState(0);
  const [inventoryRefreshToken, setInventoryRefreshToken] = useState(0);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const [analysisLedger, setAnalysisLedger] = useState<EpisodeAudioAnalysisLedgerClient | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisRefreshToken, setAnalysisRefreshToken] = useState(0);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const operationSequence = useRef(0);
  const immutableSourceRef = useRef<HTMLMediaElement | null>(null);
  const sourceClockFocusAppliedRef = useRef("");

  const selectedProject = useMemo(
    () => projectId
      ? projects.find((project) => project.id === projectId && project.slug === projectSlug) ?? null
      : projects.find((project) => project.slug === projectSlug) ?? null,
    [projectId, projectSlug, projects],
  );
  const projectEpisodes = selectedProject?.episodes ?? [];
  const activeProjectId = selectedProject?.id ?? projectId;
  const selectedEpisode = projectEpisodes.find((episode) => episode.slug === episodeSlug) ?? null;
  const assets = useMemo(() => audioWorkspaceAssets(inventory), [inventory]);
  const audioProgram = useMemo(() => buildEpisodeAudioProgram(inventory), [inventory]);
  const audioActivityMap = useMemo(() => buildEpisodeAudioActivityMap(audioProgram), [audioProgram]);
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId || asset.sourceId === selectedAssetId)
    ?? assets[0]
    ?? null;
  const lifecycle = useMemo(() => audioMasteryLifecycle(status), [status]);
  const audioSignal = useMemo(
    () => audioWorkspaceSignal(signalStatus),
    [signalStatus?.audioSignal],
  );

  const applyInitialSourceClockFocus = useCallback((media: HTMLMediaElement) => {
    if (initialFocusSeconds === null || !selectedAsset) return;
    const key = `${selectedAsset.sourceId}:${initialFocusSeconds}`;
    if (sourceClockFocusAppliedRef.current === key) return;
    const duration = Number.isFinite(media.duration) ? media.duration : initialFocusSeconds;
    media.currentTime = Math.max(0, Math.min(initialFocusSeconds, Math.max(0, duration - 0.001)));
    sourceClockFocusAppliedRef.current = key;
  }, [initialFocusSeconds, selectedAsset]);

  useEffect(() => {
    const media = immutableSourceRef.current;
    if (!media || media.readyState < 1) return;
    applyInitialSourceClockFocus(media);
  }, [applyInitialSourceClockFocus]);

  const replaceSelection = useCallback((nextProjectId: string, nextProjectSlug: string, nextEpisode: string, nextAsset?: string | null) => {
    setComparisonPlan(null);
    setProjectId(nextProjectId);
    setProjectSlug(nextProjectSlug);
    setEpisodeSlug(nextEpisode);
    setSelectedAssetId(nextAsset ?? null);
    router.replace(selectionHref(nextProjectId, nextProjectSlug, nextEpisode, nextAsset));
  }, [router]);

  useEffect(() => {
    if (selectedProject && selectedEpisode) return;
    if (projectId && !selectedProject) return;
    const fallbackProject = projects.find((project) => project.episodes.length > 0) ?? projects[0];
    const fallbackEpisode = fallbackProject?.episodes[0];
    if (!fallbackProject || !fallbackEpisode) return;
    replaceSelection(fallbackProject.id, fallbackProject.slug, fallbackEpisode.slug, initialAssetId);
  }, [initialAssetId, projectId, projects, replaceSelection, selectedEpisode, selectedProject]);

  useEffect(() => {
    if (!selectedProject || !projectSlug || !episodeSlug) {
      setInventory(null);
      setInventoryState("idle");
      return;
    }

    const controller = new AbortController();
    setInventoryState("loading");
    setInventoryError(null);
    setNotice(null);
    const query = new URLSearchParams({ projectId: activeProjectId, projectSlug, episodeSlug });

    void fetch(`/api/media-vault/episode-inventory?${query.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as (AudioWorkspaceInventory & { error?: string }) | null;
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || `Episode media inventory returned HTTP ${response.status}.`);
        }
        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setInventory(payload);
        setInventoryState("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setInventory(null);
        setInventoryState("error");
        setInventoryError(errorMessage(error, "Quipsly could not load the episode media inventory."));
      });

    return () => controller.abort();
  }, [activeProjectId, episodeSlug, inventoryRefreshToken, projectSlug, selectedProject]);

  useEffect(() => {
    if (!selectedEpisode || !projectSlug) {
      setAnalysisLedger(null);
      setAnalysisLoading(false);
      setAnalysisError(null);
      return;
    }
    const controller = new AbortController();
    setAnalysisLoading(true);
    setAnalysisError(null);
    const query = new URLSearchParams({ projectId: activeProjectId, projectSlug, episodeProductionId: selectedEpisode.id });
    void fetch(`/api/media-vault/episode-audio-program/analysis?${query.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; ledger?: EpisodeAudioAnalysisLedgerClient } | null;
        if (!response.ok || !payload?.ok || !payload.ledger) throw new Error(payload?.error || `Episode analysis ledger returned HTTP ${response.status}.`);
        return payload.ledger;
      })
      .then((ledger) => { if (!controller.signal.aborted) setAnalysisLedger(ledger); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setAnalysisLedger(null);
        setAnalysisError(errorMessage(error, "Quipsly could not load the Episode analysis ledger."));
      })
      .finally(() => { if (!controller.signal.aborted) setAnalysisLoading(false); });
    return () => controller.abort();
  }, [activeProjectId, analysisRefreshToken, inventoryRefreshToken, projectSlug, selectedEpisode]);

  useEffect(() => {
    if (assets.length === 0) {
      setSelectedAssetId(null);
      return;
    }
    if (selectedAssetId && assets.some((asset) => asset.id === selectedAssetId || asset.sourceId === selectedAssetId)) return;
    setSelectedAssetId(assets[0].id);
  }, [assets, selectedAssetId]);

  useEffect(() => {
    if (!selectedAsset || !projectSlug) {
      setStatus(null);
      setStatusLoading(false);
      return;
    }

    const controller = new AbortController();
    setStatusLoading(true);
    setStatus(null);
    const query = new URLSearchParams({ projectId: activeProjectId, projectSlug, assetId: selectedAsset.id });
    void fetch(`/api/media-vault/audio-mastery?${query.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<AudioMasteryClientStatus>) | null;
        if (!response.ok || !payload?.ok || !payload.status) {
          throw new Error(payload?.error || `Audio Mastery returned HTTP ${response.status}.`);
        }
        return payload as { ok: true } & AudioMasteryClientStatus;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setStatus(payload);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setStatus(null);
        setNotice(errorMessage(error, "Quipsly could not load Audio Mastery evidence."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setStatusLoading(false);
      });

    return () => controller.abort();
  }, [activeProjectId, projectSlug, selectedAsset, statusRefreshToken]);

  useEffect(() => {
    if (!selectedAsset || !projectSlug) {
      setSignalStatus(null);
      setSignalStatusLoading(false);
      return;
    }

    const controller = new AbortController();
    setSignalStatusLoading(true);
    setSignalStatus(null);
    const query = new URLSearchParams({ projectId: activeProjectId, projectSlug, assetId: selectedAsset.id });
    void fetch(`/api/media-vault/audio-signal-profile?${query.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<AudioSignalProfileClientStatus>) | null;
        if (!response.ok || !payload?.ok || !payload.status) {
          throw new Error(payload?.error || `Audio signal profile returned HTTP ${response.status}.`);
        }
        return payload as { ok: true } & AudioSignalProfileClientStatus;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setSignalStatus(payload);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setSignalStatus(null);
        setNotice(errorMessage(error, "Quipsly could not load decoded signal evidence."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSignalStatusLoading(false);
      });

    return () => controller.abort();
  }, [activeProjectId, projectSlug, selectedAsset, statusRefreshToken]);

  useEffect(() => {
    if (!selectedAsset || !projectSlug || !episodeSlug) {
      setTranscriptStatus(null);
      setTranscriptStatusLoading(false);
      return;
    }

    const controller = new AbortController();
    setTranscriptStatusLoading(true);
    setTranscriptStatus(null);
    const query = new URLSearchParams({ projectId: activeProjectId, projectSlug, episodeSlug, assetId: selectedAsset.id });
    void fetch(`/api/media-vault/source-transcript?${query.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<StudioSourceTranscriptClientStatus>) | null;
        if (!response.ok || !payload?.ok || !payload.status) {
          throw new Error(payload?.error || `Source transcript returned HTTP ${response.status}.`);
        }
        return payload as { ok: true } & StudioSourceTranscriptClientStatus;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setTranscriptStatus(payload);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setTranscriptStatus(null);
        setNotice(errorMessage(error, "Quipsly could not load the source transcript ledger."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setTranscriptStatusLoading(false);
      });

    return () => controller.abort();
  }, [activeProjectId, episodeSlug, projectSlug, selectedAsset, statusRefreshToken]);

  const updateStatus = useCallback((next: AudioMasteryClientStatus) => {
    setStatus(next);
  }, []);

  const requestMastery = useCallback(async (asset: AudioWorkspaceAsset, action: "queue" | "reconcile") => {
    const response = await fetch("/api/media-vault/audio-mastery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        projectId: activeProjectId,
        projectSlug,
        assetId: asset.id,
        sourceId: asset.sourceId,
        profileId: "apple-podcasts-dialogue-v1",
      }),
    });
    const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<AudioMasteryClientStatus>) | null;
    if (!response.ok || !payload?.ok || !payload.status) {
      throw new Error(payload?.error || `Audio Mastery returned HTTP ${response.status}.`);
    }
    const next = payload as { ok: true } & AudioMasteryClientStatus;
    updateStatus(next);
    return next;
  }, [activeProjectId, projectSlug, updateStatus]);

  const runMastery = useCallback(async () => {
    if (!selectedAsset || !selectedAsset.canProcess || operation) return;
    const sequence = ++operationSequence.current;
    setOperation("mastery");
    setNotice(`Measuring ${selectedAsset.originalName} from a complete decode. The source remains unchanged.`);
    try {
      let next = await requestMastery(selectedAsset, "queue");
      for (let attempt = 0; attempt < 300 && next.status !== "completed"; attempt += 1) {
        if (next.status === "failed" || next.status === "blocked") {
          throw new Error(next.error || `Audio Mastery ${next.status}.`);
        }
        await sleep(2_000);
        if (operationSequence.current !== sequence) return;
        next = await requestMastery(selectedAsset, "reconcile");
      }
      if (next.status !== "completed") throw new Error("Audio Mastery is still processing. Resume it from this source.");
      setInventoryRefreshToken((value) => value + 1);
      setNotice(next.derivative
        ? "Verified mastering preview ready. Listen and approve before promotion."
        : "The source already meets the selected profile. No derivative was created.");
    } catch (error) {
      setNotice(errorMessage(error, "Audio Mastery could not finish."));
    } finally {
      if (operationSequence.current === sequence) setOperation(null);
    }
  }, [operation, requestMastery, selectedAsset]);

  const requestSignalProfile = useCallback(async (asset: AudioWorkspaceAsset, action: "queue" | "reconcile") => {
    const response = await fetch("/api/media-vault/audio-signal-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, projectId: activeProjectId, projectSlug, assetId: asset.id, sourceId: asset.sourceId }),
    });
    const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<AudioSignalProfileClientStatus>) | null;
    if (!response.ok || !payload?.ok || !payload.status) {
      throw new Error(payload?.error || `Audio signal profile returned HTTP ${response.status}.`);
    }
    const next = payload as { ok: true } & AudioSignalProfileClientStatus;
    setSignalStatus(next);
    return next;
  }, [activeProjectId, projectSlug]);

  const runSignalProfile = useCallback(async () => {
    if (!selectedAsset || !selectedAsset.canProcess || operation) return;
    const sequence = ++operationSequence.current;
    setOperation("signal");
    setNotice(`Decoding ${selectedAsset.originalName} into bounded waveform and frequency evidence. The source remains unchanged.`);
    try {
      let next = await requestSignalProfile(selectedAsset, "queue");
      for (let attempt = 0; attempt < 300 && next.status !== "completed"; attempt += 1) {
        if (next.status === "failed" || next.status === "blocked") {
          throw new Error(next.error || `Audio signal profiling ${next.status}.`);
        }
        await sleep(2_000);
        if (operationSequence.current !== sequence) return;
        next = await requestSignalProfile(selectedAsset, "reconcile");
      }
      if (next.status !== "completed" || !next.audioSignal) {
        throw new Error("Decoded signal profiling is still processing. Resume it from this source.");
      }
      setNotice("Verified source-clock waveform and broad-band evidence are ready for transcript and audio review.");
    } catch (error) {
      setNotice(errorMessage(error, "Decoded signal profiling could not finish."));
    } finally {
      if (operationSequence.current === sequence) setOperation(null);
    }
  }, [operation, requestSignalProfile, selectedAsset]);

  const requestSourceTranscript = useCallback(async (
    asset: AudioWorkspaceAsset,
    action: "queue" | "reconcile",
    authorizationKind: "participant-consent-confirmed" | "licensed-or-permitted-source",
  ) => {
    const response = await fetch("/api/media-vault/source-transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        projectId: activeProjectId,
        projectSlug,
        episodeSlug,
        assetId: asset.id,
        sourceId: asset.sourceId,
        ...(action === "queue" ? { authorizationKind, authorizationAccepted: true, language: "en" } : {}),
      }),
    });
    const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<StudioSourceTranscriptClientStatus>) | null;
    if (!response.ok || !payload?.ok || !payload.status) {
      throw new Error(payload?.error || `Source transcript returned HTTP ${response.status}.`);
    }
    const next = payload as { ok: true } & StudioSourceTranscriptClientStatus;
    setTranscriptStatus(next);
    return next;
  }, [activeProjectId, episodeSlug, projectSlug]);

  const runSourceTranscript = useCallback(async () => {
    if (!selectedAsset || !selectedAsset.canTranscribe || operation) return;
    const referenceRoles = new Set(["reference-clip", "b-roll", "source-clip", "youtube-source-clip"]);
    const isReference = referenceRoles.has(String(selectedAsset.importRole || "episode-media").toLowerCase());
    const authorizationKind = isReference ? "licensed-or-permitted-source" : "participant-consent-confirmed";
    const authorizationCopy = isReference
      ? `Transcribe ${selectedAsset.originalName}?\n\nConfirm that Quipsly is licensed or otherwise permitted to transcribe this reference material for production and review. This does not publish or edit the source.`
      : `Transcribe ${selectedAsset.originalName}?\n\nConfirm that the recorded participants consented to transcription for this episode. Quipsly keeps immutable timed provider evidence and creates no tasks, goals, edits, or publications.`;
    if (!window.confirm(authorizationCopy)) {
      setNotice("Transcription was not queued because authorization was not confirmed.");
      return;
    }

    const sequence = ++operationSequence.current;
    setOperation("transcript");
    setNotice(`Queueing immutable timed transcription for ${selectedAsset.originalName}.`);
    try {
      let next = await requestSourceTranscript(selectedAsset, "queue", authorizationKind);
      for (let attempt = 0; attempt < 900 && next.status !== "completed"; attempt += 1) {
        if (next.status === "failed") throw new Error(next.error || "Source transcription failed.");
        await sleep(2_000);
        if (operationSequence.current !== sequence) return;
        next = await requestSourceTranscript(selectedAsset, "reconcile", authorizationKind);
      }
      if (next.status !== "completed") {
        throw new Error("Source transcription is still processing. Resume it from this source.");
      }
      setInventoryRefreshToken((value) => value + 1);
      setNotice("Canonical timed transcript ready. Confidence remains provider evidence, and corrections require protected playback review.");
    } catch (error) {
      setNotice(errorMessage(error, "Source transcription could not finish."));
    } finally {
      if (operationSequence.current === sequence) setOperation(null);
    }
  }, [operation, requestSourceTranscript, selectedAsset]);

  const reviewMastery = useCallback(async (
    decision: "approved" | "rejected",
    playbackEvidence: AudioMasteryPlaybackReviewEvidence,
    note: string | null,
  ) => {
    if (!selectedAsset || !status?.jobId) throw new Error("Refresh this source before reviewing its preview.");
    setOperation("review");
    try {
      const response = await fetch("/api/media-vault/audio-mastery/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: activeProjectId,
          projectSlug,
          assetId: selectedAsset.id,
          sourceId: selectedAsset.sourceId,
          jobId: status.jobId,
          clientRequestId: crypto.randomUUID(),
          decision,
          playbackEvidence,
          note,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        error?: string;
        review?: AudioMasteryClientStatus["review"];
      } | null;
      if (!response.ok || !payload?.ok || !payload.review) {
        throw new Error(payload?.error || `Mastering review returned HTTP ${response.status}.`);
      }
      setStatus((current) => current ? { ...current, review: payload.review! } : current);
      setNotice(`${decision === "approved" ? "Approved" : "Rejected"} as heard. Promotion remains a separate operation.`);
    } finally {
      setOperation(null);
    }
  }, [activeProjectId, projectSlug, selectedAsset, status?.jobId]);

  const changePromotion = useCallback(async (
    action: "promote" | "withdraw",
    reviewReceiptId: string | null,
    reason: string | null,
  ) => {
    if (!selectedAsset || !status?.jobId) throw new Error("Refresh this source before changing its promotion.");
    const jobId = action === "withdraw"
      ? status.promotion.activePromotion?.jobId || status.jobId
      : status.jobId;
    setOperation("promotion");
    try {
      const response = await fetch("/api/media-vault/audio-mastery/promotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: activeProjectId,
          projectSlug,
          assetId: selectedAsset.id,
          sourceId: selectedAsset.sourceId,
          jobId,
          clientRequestId: crypto.randomUUID(),
          operation: action,
          reviewReceiptId,
          reason,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        error?: string;
        promotion?: AudioMasteryClientStatus["promotion"];
      } | null;
      if (!response.ok || !payload?.ok || !payload.promotion) {
        throw new Error(payload?.error || `Mastering promotion returned HTTP ${response.status}.`);
      }
      setStatus((current) => current ? { ...current, promotion: payload.promotion! } : current);
      setInventoryRefreshToken((value) => value + 1);
      setNotice(action === "promote"
        ? "Approved preview promoted as a delivery candidate. The episode spine and source remain unchanged."
        : "Delivery candidate withdrawn. Decision history and bytes remain available.");
    } finally {
      setOperation(null);
    }
  }, [activeProjectId, projectSlug, selectedAsset, status]);

  const createDelivery = useCallback(async () => {
    if (!selectedAsset || !status?.jobId) throw new Error("Refresh this source before creating delivery bytes.");
    if (!status.promotion.active || status.promotion.activePromotion?.jobId !== status.jobId) {
      throw new Error("Promote this exact approved preview before delivery encoding.");
    }
    setOperation("delivery");
    const request = async (action: "queue" | "reconcile") => {
      const response = await fetch("/api/media-vault/audio-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          projectId: activeProjectId,
          projectSlug,
          assetId: selectedAsset.id,
          sourceId: selectedAsset.sourceId,
          masteryJobId: status.jobId,
          profileId: "apple-podcasts-aac-stereo-v1",
        }),
      });
      const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<AudioMasteryClientStatus["delivery"]>) | null;
      if (!response.ok || !payload?.ok || !payload.status) {
        throw new Error(payload?.error || `Audio delivery returned HTTP ${response.status}.`);
      }
      const delivery = payload as { ok: true } & AudioMasteryClientStatus["delivery"];
      setStatus((current) => current ? { ...current, delivery } : current);
      return delivery;
    };
    try {
      let delivery = await request("queue");
      for (let attempt = 0; attempt < 300 && delivery.status !== "completed"; attempt += 1) {
        if (delivery.status === "failed") throw new Error(delivery.error || "Audio delivery encoding failed.");
        await sleep(2_000);
        delivery = await request("reconcile");
      }
      if (delivery.status !== "completed") throw new Error("Audio delivery is still processing. Resume it from this source.");
      setInventoryRefreshToken((value) => value + 1);
      setNotice("Verified AAC delivery bytes are ready. Proof-listen the actual encoded artifact before output packaging.");
    } finally {
      setOperation(null);
    }
  }, [activeProjectId, projectSlug, selectedAsset, status]);

  const reviewDelivery = useCallback(async (
    decision: "approved" | "rejected",
    playbackEvidence: {
      schema: "quipsly-audio-delivery-playback-review-v1";
      listenedSecondBins: number[];
      completedAt: string;
    },
    note: string | null,
  ) => {
    if (!selectedAsset || !status?.delivery.jobId) throw new Error("Refresh this source before reviewing delivery bytes.");
    setOperation("delivery-review");
    try {
      const response = await fetch("/api/media-vault/audio-delivery/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: activeProjectId,
          projectSlug,
          assetId: selectedAsset.id,
          sourceId: selectedAsset.sourceId,
          deliveryJobId: status.delivery.jobId,
          clientRequestId: crypto.randomUUID(),
          decision,
          playbackEvidence,
          note,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        error?: string;
        review?: AudioMasteryClientStatus["delivery"]["review"];
      } | null;
      if (!response.ok || !payload?.ok || !payload.review) {
        throw new Error(payload?.error || `Delivery review returned HTTP ${response.status}.`);
      }
      setStatus((current) => current
        ? { ...current, delivery: { ...current.delivery, review: payload.review! } }
        : current);
      setInventoryRefreshToken((value) => value + 1);
      setNotice(`${decision === "approved" ? "Approved" : "Rejected"} the encoded delivery bytes as heard.`);
    } finally {
      setOperation(null);
    }
  }, [activeProjectId, projectSlug, selectedAsset, status?.delivery.jobId]);

  const changeProject = (nextProjectId: string) => {
    const nextProject = projects.find((project) => project.id === nextProjectId);
    if (!nextProject) return;
    replaceSelection(nextProject.id, nextProject.slug, nextProject.episodes[0]?.slug ?? "");
  };

  const changeEpisode = (nextSlug: string) => {
    replaceSelection(selectedProject?.id ?? projectId, projectSlug, nextSlug);
  };

  const setTrackDecision = useCallback(async (
    track: EpisodeAudioProgramTrack,
    kind: EpisodeAudioProgramDecision["kind"],
    value: string,
  ) => {
    if (!selectedEpisode?.id || !audioProgram.fingerprintSha256 || decisionBusy) return;
    setDecisionBusy(true);
    setDecisionNotice("Recording canonical Episode audio truth…");
    try {
      const response = await fetch("/api/media-vault/episode-audio-program/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set",
          projectId: activeProjectId,
          projectSlug,
          episodeProductionId: selectedEpisode.id,
          assetId: track.assetId,
          sourceId: track.sourceId,
          kind,
          value,
          programFingerprintSha256: audioProgram.fingerprintSha256,
          clientRequestId: crypto.randomUUID(),
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Audio decision returned HTTP ${response.status}.`);
      setDecisionNotice("Decision recorded. The previous value remains in the append-only history.");
      setInventoryRefreshToken((current) => current + 1);
    } catch (error) {
      setDecisionNotice(errorMessage(error, "Quipsly could not record this audio decision."));
    } finally {
      setDecisionBusy(false);
    }
  }, [activeProjectId, audioProgram.fingerprintSha256, decisionBusy, projectSlug, selectedEpisode?.id]);

  const withdrawTrackDecision = useCallback(async (decision: EpisodeAudioProgramDecision, reason: string) => {
    if (!selectedEpisode?.id || !audioProgram.fingerprintSha256 || decisionBusy) return;
    setDecisionBusy(true);
    setDecisionNotice("Withdrawing the active decision while preserving its history…");
    try {
      const response = await fetch("/api/media-vault/episode-audio-program/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "withdraw",
          projectId: activeProjectId,
          projectSlug,
          episodeProductionId: selectedEpisode.id,
          decisionId: decision.id,
          programFingerprintSha256: audioProgram.fingerprintSha256,
          clientRequestId: crypto.randomUUID(),
          reason,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Audio decision withdrawal returned HTTP ${response.status}.`);
      setDecisionNotice("Decision withdrawn. Its receipt remains available for audit and rollback reasoning.");
      setInventoryRefreshToken((current) => current + 1);
    } catch (error) {
      setDecisionNotice(errorMessage(error, "Quipsly could not withdraw this audio decision."));
    } finally {
      setDecisionBusy(false);
    }
  }, [activeProjectId, audioProgram.fingerprintSha256, decisionBusy, projectSlug, selectedEpisode?.id]);

  const inspectActivityMoment = useCallback((moment: EpisodeAudioActivityMoment) => {
    const nextComparisonPlan = buildEpisodeAudioComparisonPlan({
      map: audioActivityMap,
      moment,
      playbackSources: assets.map((asset) => ({ assetId: asset.id, sourceId: asset.sourceId, playbackUrl: asset.playbackUrl })),
    });
    setComparisonPlan(nextComparisonPlan);
    const preferredAssetId = moment.assetIds.find((assetId) => audioActivityMap.lanes.some((lane) => lane.assetId === assetId))
      ?? audioActivityMap.programClock?.assetId
      ?? null;
    const lane = audioActivityMap.lanes.find((candidate) => candidate.assetId === preferredAssetId) ?? null;
    if (!lane || !selectedEpisode) return;
    const cell = lane.cells.find((candidate) => moment.startSeconds >= candidate.programStartSeconds && moment.startSeconds < candidate.programEndSeconds) ?? null;
    const sourceSeconds = cell?.sourceSeconds ?? null;
    setSelectedAssetId(lane.assetId);
    sourceClockFocusAppliedRef.current = "";
    if (selectedAsset?.id === lane.assetId && sourceSeconds !== null && immutableSourceRef.current) {
      immutableSourceRef.current.currentTime = sourceSeconds;
    }
    setNotice(nextComparisonPlan
      ? `Prepared a ${nextComparisonPlan.durationSeconds.toFixed(2)}s matched-source audition for ${moment.label.toLowerCase()}. Playback remains a deliberate human action.`
      : `Opened ${moment.label.toLowerCase()} at program ${moment.startSeconds.toFixed(3)}s${sourceSeconds !== null ? ` · source ${sourceSeconds.toFixed(3)}s` : ""}. A matched audition is unavailable until protected aligned sources overlap this region.`);
    router.replace(selectionHref(selectedProject?.id ?? projectId, projectSlug, selectedEpisode.slug, lane.assetId, sourceSeconds));
  }, [assets, audioActivityMap, projectId, projectSlug, router, selectedAsset?.id, selectedEpisode, selectedProject?.id]);

  const registerActivityAnalysis = useCallback(async () => {
    if (analysisBusy || !selectedEpisode || !audioProgram.fingerprintSha256 || selectedProject?.role === "VIEWER") return;
    setAnalysisBusy(true);
    setDecisionNotice(null);
    try {
      const response = await fetch("/api/media-vault/episode-audio-program/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: activeProjectId, projectSlug, episodeProductionId: selectedEpisode.id, programFingerprintSha256: audioProgram.fingerprintSha256, clientRequestId: crypto.randomUUID() }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; reusedInput?: boolean; analysis?: { momentCount?: number } } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Episode analysis registration returned HTTP ${response.status}.`);
      setDecisionNotice(payload.reusedInput ? "The exact current analysis receipt already exists; Quipsly reused it without duplicating machine evidence." : `Registered the exact current analysis with ${payload.analysis?.momentCount ?? audioActivityMap.moments.length} listen point${(payload.analysis?.momentCount ?? audioActivityMap.moments.length) === 1 ? "" : "s"}. No classification, timeline edit, or mix was authorized.`);
      setAnalysisRefreshToken((current) => current + 1);
    } catch (error) {
      setDecisionNotice(errorMessage(error, "Quipsly could not register the current Episode analysis."));
    } finally {
      setAnalysisBusy(false);
    }
  }, [activeProjectId, analysisBusy, audioActivityMap.moments.length, audioProgram.fingerprintSha256, projectSlug, selectedEpisode, selectedProject?.role]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 pb-16 text-[#3d3122]">
      <header className="overflow-hidden rounded-[2rem] border border-fuchsia-200 bg-[radial-gradient(circle_at_top_right,_rgba(232,121,249,0.25),_transparent_38%),linear-gradient(135deg,#171020,#27143a_54%,#10283c)] p-6 text-white shadow-xl shadow-fuchsia-950/10 md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-fuchsia-200">
              <Waves className="h-4 w-4" aria-hidden="true" /> Quipsly Audio Studio
            </div>
            <h1 className="mt-3 font-serif text-4xl font-black tracking-tight md:text-6xl">Hear the evidence. Keep the source.</h1>
            <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-slate-200 md:text-base">
              Measure complete source decodes, inspect source-clock dialogue events, compare matched previews, and prepare verified delivery bytes. Every operation is reversible and every approval stays bound to the exact retained source.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {projectSlug && episodeSlug ? (
              <>
                <Link href={episodeRoomHref(projectSlug, episodeSlug)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-black hover:bg-white/20">
                  Episode room <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href={editorHref(projectSlug, episodeSlug, selectedAsset?.id)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-fuchsia-200 px-4 py-2 text-xs font-black text-fuchsia-950 hover:bg-fuchsia-100">
                  Open video editor <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-[#dfcba6] bg-white p-4 shadow-sm" aria-labelledby="audio-context-heading">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 id="audio-context-heading" className="text-sm font-black">Working context</h2>
            <p className="mt-1 text-xs font-semibold text-[#7a654e]">Choose one canonical episode. Sources come from its permission-filtered media inventory.</p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2 xl:max-w-3xl">
            <label className="text-[10px] font-black uppercase tracking-[0.12em] text-[#765f40]">
              Nest
              <select aria-label="Audio Studio Nest" value={selectedProject?.id ?? ""} onChange={(event) => changeProject(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border-2 border-[#d9c7a5] bg-white px-3 text-sm font-bold normal-case tracking-normal outline-none focus:border-fuchsia-600">
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.role.toLowerCase()}</option>)}
              </select>
            </label>
            <label className="text-[10px] font-black uppercase tracking-[0.12em] text-[#765f40]">
              Episode or production
              <select aria-label="Audio Studio episode" value={episodeSlug} onChange={(event) => changeEpisode(event.target.value)} disabled={projectEpisodes.length === 0} className="mt-1 block min-h-11 w-full rounded-xl border-2 border-[#d9c7a5] bg-white px-3 text-sm font-bold normal-case tracking-normal outline-none focus:border-fuchsia-600 disabled:bg-stone-100">
                {projectEpisodes.length ? projectEpisodes.map((episode) => <option key={episode.id} value={episode.slug}>{episode.title}</option>) : <option value="">No episode productions yet</option>}
              </select>
            </label>
          </div>
        </div>
      </section>

      {inventoryError ? (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-bold text-rose-950" role="alert">
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><div><div className="font-black">Audio inventory unavailable</div><p className="mt-1 leading-6">{inventoryError}</p></div></div>
          <button type="button" onClick={() => setInventoryRefreshToken((value) => value + 1)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 text-xs font-black"><RefreshCcw className="h-4 w-4" aria-hidden="true" />Retry inventory</button>
        </div>
      ) : null}

      {projects.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-[#d9c7a5] bg-white p-8 text-center">
          <FileAudio2 className="mx-auto h-10 w-10 text-[#a88b64]" aria-hidden="true" />
          <h2 className="mt-3 text-xl font-black">No accessible episode workspace yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-[#765f40]">Create or join a Nest, then attach a retained recording to an episode. Audio Studio never substitutes demonstration media for your source inventory.</p>
          <Link href="/projects" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#3d3122] px-5 text-xs font-black text-white">Open Nests</Link>
        </section>
      ) : inventoryState === "loading" ? (
        <div className="rounded-2xl border border-[#dfcba6] bg-white p-8 text-center text-sm font-black" role="status">Loading retained source evidence…</div>
      ) : inventoryState === "ready" && assets.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-[#d9c7a5] bg-white p-8 text-center">
          <FileAudio2 className="mx-auto h-10 w-10 text-[#a88b64]" aria-hidden="true" />
          <h2 className="mt-3 text-xl font-black">This episode has no playable retained audio</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#765f40]">Attach a verified recording or imported source with canonical asset and source identities. Held or unresolved recordings remain visible in the episode inventory, but Audio Studio will not process them as if they were released.</p>
          {projectSlug && episodeSlug ? <Link href={episodeRoomHref(projectSlug, episodeSlug)} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#3d3122] px-5 text-xs font-black text-white">Open episode room</Link> : null}
        </section>
      ) : selectedAsset ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(260px,0.72fr)_minmax(0,2.1fr)]">
          <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start" aria-label="Episode audio sources">
            <section className="rounded-2xl border border-[#dfcba6] bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2 px-2 pb-2">
                <div>
                  <h2 className="text-sm font-black">Retained sources</h2>
                  <p className="mt-0.5 text-[10px] font-bold text-[#806a4d]">{assets.length} playable source{assets.length === 1 ? "" : "s"}</p>
                </div>
                <ShieldCheck className="h-5 w-5 text-emerald-700" aria-label="Permission-filtered inventory" />
              </div>
              <ul className="max-h-[52vh] space-y-1 overflow-y-auto pr-1">
                {assets.map((asset) => {
                  const active = asset.id === selectedAsset.id;
                  return (
                    <li key={asset.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setSelectedAssetId(asset.id);
                          router.replace(selectionHref(selectedProject?.id ?? projectId, projectSlug, episodeSlug, asset.id));
                        }}
                        className={`w-full rounded-xl border px-3 py-3 text-left transition ${active ? "border-fuchsia-400 bg-fuchsia-50 shadow-sm" : "border-transparent bg-[#fffaf0] hover:border-[#d9c7a5]"}`}
                      >
                        <span className="block truncate text-xs font-black">{asset.originalName}</span>
                        <span className="mt-1 flex flex-wrap gap-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#806a4d]">
                          <span>{asset.importRole || asset.kind || "media"}</span><span>·</span><span>{asset.syncStatus || "not synced"}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
            {inventory?.safeNextActions?.length ? (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                <h2 className="text-xs font-black">Inventory attention</h2>
                <ul className="mt-2 space-y-2 text-[11px] font-semibold leading-5">
                  {inventory.safeNextActions.slice(0, 4).map((action) => <li key={action}>• {action}</li>)}
                </ul>
              </section>
            ) : null}
          </aside>

          <main className="min-w-0 space-y-4">
            <EpisodeAudioProgramMap
              program={audioProgram}
              selectedAssetId={selectedAsset.id}
              onSelectTrack={(assetId) => {
                setSelectedAssetId(assetId);
                router.replace(selectionHref(selectedProject?.id ?? projectId, projectSlug, episodeSlug, assetId));
              }}
              decisionBusy={decisionBusy}
              decisionNotice={decisionNotice}
              onSetDecision={(track, kind, value) => void setTrackDecision(track, kind, value)}
              onWithdrawDecision={(decision, reason) => void withdrawTrackDecision(decision, reason)}
            />
            <EpisodeAudioActivityMap
              map={audioActivityMap}
              selectedAssetId={selectedAsset.id}
              onSelectTrack={(assetId) => {
                setSelectedAssetId(assetId);
                router.replace(selectionHref(selectedProject?.id ?? projectId, projectSlug, episodeSlug, assetId));
              }}
              onInspectMoment={inspectActivityMoment}
              analysisReceipt={analysisLedger?.latest ? { ...analysisLedger.latest, currentInputSha256: analysisLedger.currentInputSha256, stale: analysisLedger.latest.stale || analysisLedger.latest.inputSha256 !== analysisLedger.currentInputSha256 } : null}
              analysisBusy={analysisBusy || analysisLoading}
              canRegisterAnalysis={Boolean(audioProgram.fingerprintSha256 && selectedEpisode && selectedProject?.role !== "VIEWER")}
              onRegisterAnalysis={() => void registerActivityAnalysis()}
              analysisError={analysisError}
            />
            {comparisonPlan ? (
              <EpisodeAudioMatchedAudition
                plan={comparisonPlan}
                onClose={() => setComparisonPlan(null)}
                onPausePrimarySource={() => immutableSourceRef.current?.pause()}
              />
            ) : null}
            <section id="selected-source" className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-white shadow-xl sm:p-5" aria-labelledby="selected-source-heading">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-[0.14em] text-fuchsia-200"><FileAudio2 className="h-4 w-4" aria-hidden="true" /> Immutable source</div>
                  <h2 id="selected-source-heading" className="mt-2 break-words text-xl font-black sm:text-2xl">{selectedAsset.originalName}</h2>
                  <p className="mt-2 max-w-3xl text-xs font-semibold leading-5 text-slate-400">{selectedAsset.safeNextAction}</p>
                </div>
                <span className={`self-start rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] ${statusTone(status)}`}>
                  {statusLoading ? "reading evidence" : status?.status?.replaceAll("-", " ") || "not measured"}
                </span>
              </div>
              {initialFocusSeconds !== null ? <div className="mt-3 rounded-lg border border-cyan-700 bg-cyan-950/40 px-3 py-2 text-[10px] font-black text-cyan-100" role="status">Opened at exact source time {initialFocusSeconds.toFixed(3)}s{initialFocusId ? ` for ${initialFocusId}` : ""}. Playback remains a deliberate human action.</div> : null}
              <audio ref={(node) => { immutableSourceRef.current = node; }} src={selectedAsset.playbackUrl} controls preload="metadata" className="mt-4 w-full" aria-label={`Immutable source audio for ${selectedAsset.originalName}`} onLoadedMetadata={(event) => applyInitialSourceClockFocus(event.currentTarget)} />
              <div className="mt-4 grid gap-2 sm:grid-cols-5" aria-label="Audio delivery lifecycle">
                {lifecycle.map((step) => (
                  <div key={step.id} className={`rounded-xl border px-3 py-3 ${step.complete ? "border-emerald-700 bg-emerald-950" : "border-slate-700 bg-slate-900"}`}>
                    <div className="flex items-center gap-2 text-[10px] font-black">{step.complete ? <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />}{step.label}</div>
                    <div className="mt-1 text-[9px] font-semibold text-slate-400">{step.detail}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                <span className="rounded-full border border-slate-700 px-2 py-1">Asset {selectedAsset.id}</span>
                <span className="rounded-full border border-slate-700 px-2 py-1">Source {selectedAsset.sourceId}</span>
                {selectedAsset.recordingAssetId ? <span className="rounded-full border border-slate-700 px-2 py-1">Capture linked</span> : null}
              </div>
            </section>

            {notice ? <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold leading-6 text-sky-950" role="status" aria-live="polite">{notice}</div> : null}
            {status?.error ? <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-950" role="alert">{status.error}</div> : null}

            <section className="rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-indigo-50 p-4 shadow-sm sm:p-5" aria-labelledby="measurement-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-fuchsia-800"><Gauge className="h-4 w-4" aria-hidden="true" /> Source measurement</div>
                  <h2 id="measurement-heading" className="mt-1 text-xl font-black">Loudness and decoded signal truth</h2>
                  <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-fuchsia-950/70">Apple dialogue profile: −16 LUFS integrated, preview ceiling −1.5 dBTP. Measurement does not certify subjective quality.</p>
                </div>
                <button type="button" onClick={() => setStatusRefreshToken((value) => value + 1)} disabled={statusLoading || operation !== null} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-fuchsia-300 bg-white px-4 text-xs font-black text-fuchsia-950 hover:bg-fuchsia-100 disabled:opacity-50"><RefreshCcw className="h-4 w-4" aria-hidden="true" />Refresh evidence</button>
              </div>

              {status?.sourceMeasurement ? (
                <div className="mt-4">
                  <AudioMasteryLoudnessGraph measurement={status.sourceMeasurement} />
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs font-bold sm:grid-cols-4">
                    <div className="rounded-xl bg-white px-3 py-3"><div className="font-mono text-lg font-black">{status.sourceMeasurement.integratedLufs.toFixed(1)}</div><div className="text-[10px] text-[#765f40]">Integrated LUFS</div></div>
                    <div className="rounded-xl bg-white px-3 py-3"><div className="font-mono text-lg font-black">{status.sourceMeasurement.truePeakDbtp.toFixed(1)}</div><div className="text-[10px] text-[#765f40]">True peak dBTP</div></div>
                    <div className="rounded-xl bg-white px-3 py-3"><div className="font-mono text-lg font-black">{status.sourceMeasurement.loudnessRangeLu.toFixed(1)}</div><div className="text-[10px] text-[#765f40]">Loudness range</div></div>
                    <div className="rounded-xl bg-white px-3 py-3"><div className="font-mono text-lg font-black">{status.signalDiagnosis?.observations.length ?? "—"}</div><div className="text-[10px] text-[#765f40]">Signal attention points</div></div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-fuchsia-300 bg-white/70 p-5 text-center text-sm font-bold text-fuchsia-950/70">No complete source measurement is registered yet.</div>
              )}

              <button type="button" onClick={() => void runMastery()} disabled={!selectedAsset.canProcess || operation !== null || statusLoading || (status?.status === "completed" && status.signalDiagnosis !== null)} className="mt-4 w-full rounded-xl border border-fuchsia-400 bg-fuchsia-200 px-4 py-3 text-left text-sm font-black text-fuchsia-950 hover:bg-fuchsia-100 disabled:cursor-default disabled:opacity-60">
                {!selectedAsset.canProcess ? "Processing held — resolve source release evidence" : operation === "mastery" ? "Measuring, rendering, and independently verifying…" : status?.status === "completed" ? status.signalDiagnosis === null ? "Add decoded signal diagnosis" : status.derivative ? "Verified mastering preview ready" : "Source already meets profile" : status?.status === "failed" ? "Retry Audio Mastery" : status && ["queued", "processing", "output-ready"].includes(status.status) ? "Resume Audio Mastery" : "Measure and prepare mastering preview"}
                <span className="mt-1 block text-[10px] font-semibold leading-4 opacity-75">{selectedAsset.canProcess ? "Original bytes are never changed. This automatic pass excludes denoise, EQ, de-essing, silence removal, and editorial cuts." : "The source remains visible as inventory evidence, but Quipsly will not derive new media until its current release ledger authorizes processing."}</span>
              </button>
            </section>

            <section className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-50 p-4 shadow-sm sm:p-5" aria-labelledby="source-clock-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-800"><FileText className="h-4 w-4" aria-hidden="true" /> Shared source clock</div>
                  <h2 id="source-clock-heading" className="mt-1 text-xl font-black">Waveform, words, and attention at the same time</h2>
                  <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-cyan-950/70">A complete decoded signal map and canonical timed transcript stay bound to this immutable source. Provider confidence helps triage review; it is never presented as measured accuracy.</p>
                </div>
                <button type="button" onClick={() => setStatusRefreshToken((value) => value + 1)} disabled={statusLoading || signalStatusLoading || transcriptStatusLoading || operation !== null} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-300 bg-white px-4 text-xs font-black text-cyan-950 hover:bg-cyan-100 disabled:opacity-50"><RefreshCcw className="h-4 w-4" aria-hidden="true" />Refresh source clock</button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <article className="rounded-xl border border-cyan-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><div className="text-sm font-black">Decoded signal map</div><div className="mt-1 text-[10px] font-semibold leading-4 text-cyan-950/65">Complete-decode waveform, broad frequency bands, and listen-required signal observations.</div></div>
                    <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 font-mono text-[9px] font-black uppercase tracking-[0.1em] text-cyan-900">{signalStatusLoading ? "loading" : signalStatus?.status?.replaceAll("-", " ") || "not queued"}</span>
                  </div>
                  {audioSignal ? (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-cyan-50 px-2 py-2"><div className="font-mono text-sm font-black">{audioSignal.durationSeconds.toFixed(1)}s</div><div className="text-[9px] font-bold">Decoded</div></div>
                      <div className="rounded-lg bg-cyan-50 px-2 py-2"><div className="font-mono text-sm font-black">{audioSignal.waveform.length}</div><div className="text-[9px] font-bold">Windows</div></div>
                      <div className="rounded-lg bg-cyan-50 px-2 py-2"><div className="font-mono text-sm font-black">{audioSignal.observations.length}</div><div className="text-[9px] font-bold">Attention</div></div>
                    </div>
                  ) : <p className="mt-3 text-[11px] font-semibold leading-5 text-cyan-950/70">No verified decoded signal map is registered for this exact source yet.</p>}
                  {signalStatus?.error ? <p className="mt-2 text-[11px] font-bold text-rose-800" role="alert">{signalStatus.error}</p> : null}
                  <button type="button" onClick={() => void runSignalProfile()} disabled={!selectedAsset.canProcess || operation !== null || signalStatusLoading || Boolean(audioSignal)} className="mt-3 w-full rounded-lg border border-cyan-300 bg-cyan-100 px-3 py-2 text-left text-xs font-black text-cyan-950 hover:bg-cyan-50 disabled:cursor-default disabled:opacity-60">
                    {!selectedAsset.canProcess ? "Signal analysis held by media release" : operation === "signal" ? "Decoding and verifying source evidence…" : audioSignal ? "Verified signal map ready" : signalStatus && ["queued", "processing", "output-ready"].includes(signalStatus.status) ? "Resume signal map" : signalStatus?.status === "failed" || signalStatus?.status === "blocked" ? "Retry signal map" : "Build signal map"}
                  </button>
                </article>

                <article className="rounded-xl border border-cyan-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><div className="text-sm font-black">Canonical source transcript</div><div className="mt-1 text-[10px] font-semibold leading-4 text-cyan-950/65">Timed provider words plus non-destructive correction and playback-verification receipts.</div></div>
                    <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 font-mono text-[9px] font-black uppercase tracking-[0.1em] text-cyan-900">{transcriptStatusLoading ? "loading" : transcriptStatus?.status?.replaceAll("-", " ") || "not queued"}</span>
                  </div>
                  {transcriptStatus?.coverage ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                      <div className="rounded-lg bg-cyan-50 px-2 py-2"><div className="font-mono text-sm font-black">{transcriptStatus.coverage.segmentCount}</div><div className="text-[9px] font-bold">Segments</div></div>
                      <div className="rounded-lg bg-cyan-50 px-2 py-2"><div className="font-mono text-sm font-black">{transcriptStatus.coverage.timedWordCount}</div><div className="text-[9px] font-bold">Timed words</div></div>
                      <div className="rounded-lg bg-cyan-50 px-2 py-2"><div className="font-mono text-sm font-black">{transcriptStatus.coverage.correctionCount}</div><div className="text-[9px] font-bold">Corrections</div></div>
                      <div className="rounded-lg bg-cyan-50 px-2 py-2"><div className="font-mono text-sm font-black">{transcriptStatus.coverage.playbackVerificationCount}</div><div className="text-[9px] font-bold">Heard checks</div></div>
                    </div>
                  ) : <p className="mt-3 text-[11px] font-semibold leading-5 text-cyan-950/70">Transcription requires an explicit participant-consent or licensed-source authorization receipt.</p>}
                  {transcriptStatus?.error ? <p className="mt-2 text-[11px] font-bold text-rose-800" role="alert">{transcriptStatus.error}</p> : null}
                  <button type="button" onClick={() => void runSourceTranscript()} disabled={!selectedAsset.canTranscribe || operation !== null || transcriptStatusLoading || transcriptStatus?.status === "completed"} className="mt-3 w-full rounded-lg border border-cyan-300 bg-cyan-100 px-3 py-2 text-left text-xs font-black text-cyan-950 hover:bg-cyan-50 disabled:cursor-default disabled:opacity-60">
                    {!selectedAsset.canTranscribe ? "Transcription held — consent release required" : operation === "transcript" ? "Transcribing and verifying immutable timing…" : transcriptStatus?.status === "completed" ? "Canonical timed transcript ready" : transcriptStatus && ["queued", "processing", "output-ready"].includes(transcriptStatus.status) ? "Resume source transcription" : transcriptStatus?.status === "failed" ? "Retry source transcription" : "Transcribe canonical source"}
                  </button>
                </article>
              </div>

              {transcriptStatus?.status === "completed" && (transcriptStatus.coverage?.segmentCount ?? 0) > 0 ? (
                <div className="mt-4">
                  <StudioTranscriptReviewDesk
                    projectId={activeProjectId}
                    projectSlug={projectSlug}
                    episodeSlug={episodeSlug}
                    assetId={selectedAsset.id}
                    sourceId={selectedAsset.sourceId}
                    audioSignal={audioSignal}
                    audioSignalStatus={signalStatus?.status ?? "not-queued"}
                    audioSignalError={signalStatus?.error ?? null}
                    isAudioSignalWorking={operation === "signal"}
                    onRequestAudioSignal={() => void runSignalProfile()}
                    processingEvidenceMarkers={(status?.signalDiagnosis?.observations ?? []).map((observation, index) => ({
                      id: `mastery-source-${observation.kind}-${observation.startSeconds}-${index}`,
                      category: "mastery" as const,
                      startSeconds: observation.startSeconds,
                      endSeconds: observation.endSeconds,
                      label: `Mastery source scan · ${observation.kind.replaceAll("-", " ")}`,
                      detail: observation.detail,
                      severity: observation.severity,
                    }))}
                    loudnessEvidence={status?.sourceMeasurement ? {
                      integratedLufs: status.sourceMeasurement.integratedLufs,
                      truePeakDbtp: status.sourceMeasurement.truePeakDbtp,
                      targetLufs: status.proposal?.profile.integratedLufs ?? null,
                      points: status.sourceMeasurement.series.map((point) => ({
                        timeSeconds: point.timeMs / 1_000,
                        momentaryLufs: point.momentaryLufs,
                        shortTermLufs: point.shortTermLufs,
                        integratedLufs: point.integratedLufs,
                        truePeakDbtp: point.truePeakDbtp,
                      })),
                    } : null}
                  />
                </div>
              ) : transcriptStatus?.status === "completed" ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-950">The provider completed this source without timed segments. Keep the receipt, inspect the source, and retry only after the capture or provider issue is understood.</div>
              ) : null}
            </section>

            {selectedAsset.canProcess && status?.sourceMeasurement ? (
              <DialogueRepairDesk projectId={activeProjectId} projectSlug={projectSlug} assetId={selectedAsset.id} sourceId={selectedAsset.sourceId} sourceUrl={selectedAsset.playbackUrl} sourceMeasurement={status.sourceMeasurement} audioSignal={audioSignal} audibleEventAnalysis={selectedAsset.audibleEventAnalysis} />
            ) : null}

            {selectedAsset.canProcess && status?.derivative?.playbackUrl && status.proposal ? (
              <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-white shadow-xl sm:p-5" aria-labelledby="audition-heading">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-fuchsia-200"><SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Review and delivery</div>
                <h2 id="audition-heading" className="mt-1 text-xl font-black">Matched source-to-preview audition</h2>
                <AudioMasteryAudition
                  masteryJobId={status.jobId}
                  sourceUrl={selectedAsset.playbackUrl}
                  masteredUrl={status.derivative.playbackUrl}
                  source={status.sourceMeasurement!}
                  mastered={status.derivative.measured}
                  targetLufs={status.proposal.profile.integratedLufs}
                  maximumTruePeakDbtp={status.proposal.profile.maximumTruePeakDbtp}
                  diagnosis={status.signalDiagnosis}
                  review={status.review}
                  promotion={status.promotion}
                  delivery={status.delivery}
                  isReviewing={operation === "review"}
                  isPromoting={operation === "promotion"}
                  isDelivering={operation === "delivery" || operation === "delivery-review"}
                  onReview={reviewMastery}
                  onPromotion={changePromotion}
                  onDelivery={createDelivery}
                  onDeliveryReview={reviewDelivery}
                />
              </section>
            ) : null}
          </main>
        </div>
      ) : null}
    </div>
  );
}
