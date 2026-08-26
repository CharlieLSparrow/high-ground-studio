"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { QuipslySessionEntryReadiness } from "@high-ground/quipsly-domain/session-entry-readiness";

function signature(value: QuipslySessionEntryReadiness) {
  return JSON.stringify({
    stage: value.stage,
    action: value.primaryAction.id,
    permissions: value.permissions,
    participants: value.participantProgress,
    consent: value.consentProgress,
    blockers: value.blockers,
  });
}

function nextDelay(value: QuipslySessionEntryReadiness) {
  if (value.stage === "room-closed") return 60_000;
  if (value.permissions.canStartAudioRecording) return 20_000;
  return 6_000;
}

export function SessionEntryReadinessLive({
  roomId,
  initial,
}: {
  roomId: string;
  initial: QuipslySessionEntryReadiness;
}) {
  const router = useRouter();
  const [entry, setEntry] = useState(initial);
  const currentSignature = useRef(signature(initial));
  const entryRef = useRef(initial);

  useEffect(() => {
    const nextSignature = signature(initial);
    entryRef.current = initial;
    currentSignature.current = nextSignature;
    setEntry(initial);
  }, [initial]);

  useEffect(() => {
    let canceled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    async function refresh() {
      if (canceled) return;
      if (document.visibilityState !== "visible") {
        timeout = setTimeout(() => void refresh(), 15_000);
        return;
      }

      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(roomId)}/entry-readiness`,
          { cache: "no-store", signal: controller.signal },
        );
        const packet = await response.json() as {
          ok?: boolean;
          entryReadiness?: QuipslySessionEntryReadiness;
        };
        if (!canceled && response.ok && packet.ok && packet.entryReadiness) {
          const next = packet.entryReadiness;
          const nextSignature = signature(next);
          entryRef.current = next;
          setEntry(next);
          if (nextSignature !== currentSignature.current) {
            currentSignature.current = nextSignature;
            router.refresh();
          }
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // The server-rendered snapshot remains safe. A transient refresh
          // failure must not replace it with a generic error ceremony.
        }
      } finally {
        if (!canceled) {
          timeout = setTimeout(() => void refresh(), nextDelay(entryRef.current));
        }
      }
    }

    function becameVisible() {
      if (document.visibilityState !== "visible") return;
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => void refresh(), 250);
    }

    timeout = setTimeout(() => void refresh(), nextDelay(initial));
    document.addEventListener("visibilitychange", becameVisible);
    return () => {
      canceled = true;
      controller?.abort();
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", becameVisible);
    };
  }, [initial, roomId, router]);

  const href = useMemo(() => {
    if (entry.primaryAction.id === "confirm-consent") {
      return "#my-session-consent-heading";
    }
    if (entry.primaryAction.id === "join-call") {
      return `#live-room-${roomId}`;
    }
    return null;
  }, [entry.primaryAction.id, roomId]);

  const ready = entry.permissions.canJoinCall
    || entry.permissions.canStartAudioRecording;

  return (
    <div
      className={`mt-5 flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${ready ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}
      data-testid="session-entry-next-action"
      data-entry-stage={entry.stage}
      aria-live="polite"
    >
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#765f40]">
          Your next step
        </p>
        <p className="mt-1 text-xl font-black text-[#3d3122]">
          {entry.label}
        </p>
        <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-[#6b5538]">
          {entry.detail}
        </p>
      </div>
      {href ? (
        <a
          href={href}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[#2f6f62] px-5 py-3 text-xs font-black uppercase tracking-wide text-white"
        >
          {entry.primaryAction.label}
        </a>
      ) : (
        <span className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-current px-4 py-2 text-xs font-black uppercase tracking-wide text-[#765f40]">
          {entry.primaryAction.label}
        </span>
      )}
    </div>
  );
}
