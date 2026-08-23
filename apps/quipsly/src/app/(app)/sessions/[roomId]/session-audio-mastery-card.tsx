"use client";

import { LoaderCircle, SlidersHorizontal, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioMasteryPlaybackReviewEvidence } from "@high-ground/quipsly-media-processing";

import { AudioMasteryAudition } from "../../editor/AudioMasteryAudition";
import type { AudioMasteryClientStatus } from "../../audio/audio-mastery-workspace-model";
import type { SessionSourceEvidence } from "./session-source-evidence-model";

type AudioMasteryCoordinates = NonNullable<SessionSourceEvidence["sources"][number]["audioMastery"]>;
type MasteryStatus = AudioMasteryClientStatus;

function payloadError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return fallback;
}

async function parseStatus(response: Response) {
  const payload = await response.json().catch(() => null) as ({ ok?: boolean } & Partial<MasteryStatus>) | null;
  if (!response.ok || !payload?.ok || !payload.status) {
    throw new Error(payloadError(payload, "Quipsly could not open the audio tools."));
  }
  return payload as { ok: true } & MasteryStatus;
}

export function SessionAudioMasteryCard({ coordinates }: { coordinates: AudioMasteryCoordinates }) {
  const [status, setStatus] = useState<MasteryStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const automaticAttempted = useRef(false);
  const operationInFlight = useRef(false);

  const statusUrl = useCallback(() => {
    const query = new URLSearchParams({
      projectId: coordinates.projectId,
      projectSlug: coordinates.projectSlug,
      assetId: coordinates.assetId,
    });
    return `/api/media-vault/audio-mastery?${query.toString()}`;
  }, [coordinates.assetId, coordinates.projectId, coordinates.projectSlug]);

  const operate = useCallback(async (action: "queue" | "reconcile") => {
    const response = await fetch("/api/media-vault/audio-mastery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        projectId: coordinates.projectId,
        projectSlug: coordinates.projectSlug,
        assetId: coordinates.assetId,
        sourceId: coordinates.sourceId,
        profileId: "apple-podcasts-dialogue-v1",
      }),
    });
    const next = await parseStatus(response);
    setStatus(next);
    return next;
  }, [coordinates]);

  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    fetch(statusUrl(), { signal: controller.signal })
      .then(parseStatus)
      .then((next) => {
        setStatus(next);
        setNotice(null);
        setRetryAvailable(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setNotice(error instanceof Error ? error.message : "Quipsly could not open the audio tools.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [statusUrl]);

  useEffect(() => {
    if (!status || !["queued", "processing", "output-ready"].includes(status.status) || busy) return;
    const timer = window.setTimeout(() => {
      operate("reconcile").catch((error) => {
        setNotice(error instanceof Error ? error.message : "Audio improvement is still processing.");
      });
    }, 2_500);
    return () => window.clearTimeout(timer);
  }, [busy, operate, status]);

  const improve = useCallback(async (options?: { automatic?: boolean }) => {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setBusy(true);
    setRetryAvailable(false);
    setNotice("Quipsly is checking the whole recording and preparing a balanced listening copy if it needs one.");
    try {
      const next = await operate("queue");
      if (next.status === "completed") {
        setNotice(next.derivative?.playbackUrl
          ? "Your improved listening copy is ready."
          : "This recording already meets the spoken-word target.");
      }
    } catch (error) {
      setRetryAvailable(true);
      setNotice(options?.automatic
        ? "Quipsly could not finish the audio check. Your original is safe; try again below."
        : error instanceof Error
          ? error.message
          : "Quipsly could not improve this audio.");
    } finally {
      operationInFlight.current = false;
      setBusy(false);
    }
  }, [operate]);

  const reviewImprovement = useCallback(async (
    decision: "approved" | "rejected",
    playbackEvidence: AudioMasteryPlaybackReviewEvidence,
    note: string | null,
  ) => {
    if (!status?.jobId) throw new Error("Refresh this Session before saving your audio choice.");
    setReviewing(true);
    try {
      const response = await fetch("/api/media-vault/audio-mastery/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: coordinates.projectId,
          projectSlug: coordinates.projectSlug,
          assetId: coordinates.assetId,
          sourceId: coordinates.sourceId,
          jobId: status.jobId,
          clientRequestId: crypto.randomUUID(),
          decision,
          playbackEvidence,
          note,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; review?: MasteryStatus["review"] } | null;
      if (!response.ok || !payload?.ok || !payload.review) {
        throw new Error(payload?.error || "Quipsly could not save your audio choice.");
      }
      setStatus((current) => current ? { ...current, review: payload.review! } : current);
    } finally {
      setReviewing(false);
    }
  }, [coordinates, status?.jobId]);

  useEffect(() => {
    if (checking || status?.status !== "not-queued" || busy || automaticAttempted.current) return;
    automaticAttempted.current = true;
    void improve({ automatic: true });
  }, [busy, checking, improve, status?.status]);

  const working = status && ["queued", "processing", "output-ready"].includes(status.status);
  const failed = status?.status === "failed" || status?.status === "blocked" || retryAvailable;
  const improvedUrl = status?.status === "completed" ? status.derivative?.playbackUrl : null;
  const audition = status?.status === "completed"
    && status.jobId
    && status.sourceMeasurement
    && status.derivative?.playbackUrl
    && status.derivative.measured
    && status.proposal
    ? {
        jobId: status.jobId,
        source: status.sourceMeasurement,
        masteredUrl: status.derivative.playbackUrl,
        mastered: status.derivative.measured,
        targetLufs: status.proposal.profile.integratedLufs,
        maximumTruePeakDbtp: status.proposal.profile.maximumTruePeakDbtp,
        diagnosis: status.signalDiagnosis,
        review: status.review,
      }
    : null;
  const alreadyBalanced = status?.status === "completed" && !improvedUrl;
  const qualityLabel = checking
    ? "Checking audio"
    : busy || working
      ? "Preparing audio"
      : improvedUrl
        ? "Improved copy ready"
        : alreadyBalanced
          ? "Audio is balanced"
          : failed
            ? "Audio check needs attention"
            : "Audio check starting";

  return (
    <section className="mt-3 rounded-xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-white p-4" aria-label="Audio improvement">
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-fuchsia-100 p-2 text-fuchsia-800">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-[#3d3122]">Audio quality</p>
            <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${failed ? "border-rose-200 bg-rose-50 text-rose-900" : improvedUrl || alreadyBalanced ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900"}`}>
              {qualityLabel}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">
            Quipsly checks spoken-word loudness automatically and prepares a balanced listening copy when useful. Your original stays untouched.
          </p>
        </div>
      </div>

      {checking ? (
        <p className="mt-3 flex items-center gap-2 text-xs font-black text-fuchsia-900">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking audio…
        </p>
      ) : audition ? (
        <AudioMasteryAudition
          masteryJobId={audition.jobId}
          sourceUrl={coordinates.sourceUrl}
          masteredUrl={audition.masteredUrl}
          source={audition.source}
          mastered={audition.mastered}
          targetLufs={audition.targetLufs}
          maximumTruePeakDbtp={audition.maximumTruePeakDbtp}
          diagnosis={audition.diagnosis}
          review={audition.review}
          isReviewing={reviewing}
          onReview={reviewImprovement}
          presentation="session"
        />
      ) : improvedUrl ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-[#eadfc9] bg-white p-3">
            <p className="text-xs font-black text-[#3d3122]">Original</p>
            {coordinates.sourceKind === "video" ? (
              <video controls preload="metadata" src={coordinates.sourceUrl} className="mt-2 w-full rounded-lg bg-black" />
            ) : (
              <audio controls preload="metadata" src={coordinates.sourceUrl} className="mt-2 w-full" />
            )}
          </div>
          <div className="rounded-lg border border-fuchsia-200 bg-white p-3">
            <p className="text-xs font-black text-fuchsia-950">Improved listening copy</p>
            <audio controls preload="metadata" src={improvedUrl} className="mt-2 w-full" />
          </div>
          <p className="text-xs font-bold leading-5 text-emerald-800 lg:col-span-2">
            Ready to compare. Quipsly has not replaced or published either version.
          </p>
        </div>
      ) : alreadyBalanced ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-black text-emerald-900">
          This recording already meets Quipsly&apos;s spoken-word loudness target, so no extra copy was needed.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void improve()}
          disabled={busy || Boolean(working)}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-fuchsia-800 px-4 py-2.5 text-xs font-black text-white disabled:cursor-wait disabled:opacity-60"
        >
          {busy || working ? (
            <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Improving audio…</>
          ) : (
            <><SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" /> {failed ? "Try again" : "Check audio now"}</>
          )}
        </button>
      )}

      {notice ? <p role="status" className={`mt-3 text-xs font-bold leading-5 ${failed ? "text-rose-800" : "text-fuchsia-900"}`}>{notice}</p> : null}
      {failed && status?.error ? (
        <details className="mt-3 text-xs text-rose-900">
          <summary className="cursor-pointer font-black">Why it did not finish</summary>
          <p className="mt-2 font-semibold leading-5">{status.error}</p>
        </details>
      ) : null}
    </section>
  );
}
