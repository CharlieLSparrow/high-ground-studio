"use client";

import { LoaderCircle, SlidersHorizontal, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { SessionSourceEvidence } from "./session-source-evidence-model";

type AudioMasteryCoordinates = NonNullable<SessionSourceEvidence["sources"][number]["audioMastery"]>;
type MasteryState = "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "blocked" | "failed";
type MasteryStatus = {
  status: MasteryState;
  derivative?: { playbackUrl: string | null } | null;
  proposal?: { action: "no-change" | "render-loudness-master"; profile: { integratedLufs: number; maximumTruePeakDbtp: number } } | null;
  error?: string | null;
};

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
  const [notice, setNotice] = useState<string | null>(null);

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

  const improve = async () => {
    if (busy) return;
    setBusy(true);
    setNotice("Quipsly is measuring the whole recording and preparing a balanced listening copy.");
    try {
      const next = await operate("queue");
      if (next.status === "completed") {
        setNotice(next.derivative?.playbackUrl
          ? "Your improved listening copy is ready."
          : "This recording already meets the spoken-word target.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Quipsly could not improve this audio.");
    } finally {
      setBusy(false);
    }
  };

  const working = status && ["queued", "processing", "output-ready"].includes(status.status);
  const failed = status?.status === "failed" || status?.status === "blocked";
  const improvedUrl = status?.status === "completed" ? status.derivative?.playbackUrl : null;
  const alreadyBalanced = status?.status === "completed" && !improvedUrl;

  return (
    <section className="mt-3 rounded-xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-white p-4" aria-label="Audio improvement">
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-fuchsia-100 p-2 text-fuchsia-800">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-black text-[#3d3122]">Audio polish</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">
            Balance spoken-word loudness and prepare a clearer listening copy. Your original recording stays untouched.
          </p>
        </div>
      </div>

      {checking ? (
        <p className="mt-3 flex items-center gap-2 text-xs font-black text-fuchsia-900">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking audio…
        </p>
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
          onClick={improve}
          disabled={busy || Boolean(working)}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-fuchsia-800 px-4 py-2.5 text-xs font-black text-white disabled:cursor-wait disabled:opacity-60"
        >
          {busy || working ? (
            <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Improving audio…</>
          ) : (
            <><SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" /> {failed ? "Try audio polish again" : "Improve audio"}</>
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
