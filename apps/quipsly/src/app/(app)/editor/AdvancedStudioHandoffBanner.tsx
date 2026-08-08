"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { EpisodeEditDeskPayload } from "@/lib/editor/program-edit-contract";
import {
  advancedStudioReturnHref,
  type AdvancedStudioHandoffRequest,
  type AdvancedStudioHandoffValidation,
  validateAdvancedStudioHandoff,
} from "@/lib/editor/advanced-studio-handoff";

type HandoffState =
  | { status: "checking" }
  | { status: "verified"; request: AdvancedStudioHandoffRequest; payload: EpisodeEditDeskPayload }
  | Exclude<AdvancedStudioHandoffValidation, { status: "verified" }>
  | { status: "error"; reason: string };

export type VerifiedAdvancedStudioHandoff = {
  request: AdvancedStudioHandoffRequest;
  payload: EpisodeEditDeskPayload;
};

export function AdvancedStudioHandoffBanner({
  request,
  malformed = false,
  fallbackReturnHref = "/projects",
  onVerified,
}: {
  request: AdvancedStudioHandoffRequest | null;
  malformed?: boolean;
  fallbackReturnHref?: string;
  onVerified(context: VerifiedAdvancedStudioHandoff): void;
}) {
  const [state, setState] = useState<HandoffState>({ status: "checking" });
  const deliveredRef = useRef("");

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    setState({ status: "checking" });
    const params = new URLSearchParams({ episode: request.episodeSlug });
    void fetch(
      `/api/nests/${encodeURIComponent(request.projectSlug)}/episode-editor?${params.toString()}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | EpisodeEditDeskPayload
          | { error?: string }
          | null;
        if (!response.ok) {
          const reason =
            payload && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "The canonical Episode handoff could not be checked.";
          throw new Error(reason);
        }
        const episodePayload = payload as EpisodeEditDeskPayload;
        const validation = validateAdvancedStudioHandoff(
          request,
          episodePayload,
        );
        return validation.status === "verified"
          ? { ...validation, payload: episodePayload }
          : validation;
      })
      .then((validation) => {
        if (!controller.signal.aborted) setState(validation);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          reason:
            error instanceof Error
              ? error.message
              : "The canonical Episode handoff could not be checked.",
        });
      });
    return () => controller.abort();
  }, [request]);

  useEffect(() => {
    if (!request || state.status !== "verified") return;
    const key = [
      request.branchId,
      request.branchRevision,
      request.branchFingerprint,
      request.timelineFingerprintSha256,
      request.sourceProjectionFingerprint,
      request.sequenceAtSeconds,
    ].join(":");
    if (deliveredRef.current === key) return;
    deliveredRef.current = key;
    onVerified({ request, payload: state.payload });
  }, [onVerified, request, state]);

  if (!request && !malformed) return null;
  if (!request) {
    return (
      <section
        className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-950"
        role="alert"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-black uppercase tracking-[0.14em]">
              Episode handoff malformed
            </p>
            <p className="mt-1 font-bold">
              Required revision evidence is missing or invalid. Advanced Studio
              did not apply a sequence focus.
            </p>
          </div>
          <Link
            href={fallbackReturnHref}
            className="inline-flex min-h-10 items-center rounded-lg border border-rose-300 bg-white px-3 font-black"
          >
            Return to Episode editor
          </Link>
        </div>
      </section>
    );
  }
  const returnHref = advancedStudioReturnHref(request);
  if (state.status === "checking") {
    return (
      <section
        className="border-b border-sky-200 bg-sky-50 px-4 py-3 text-xs font-bold text-sky-950"
        role="status"
      >
        Checking the exact shared-edit revision before applying Episode context…
      </section>
    );
  }
  if (state.status === "verified") {
    return (
      <section
        className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-950"
        role="status"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-black uppercase tracking-[0.14em]">
              Episode handoff verified
            </p>
            <p className="mt-1 font-bold">
              Shared edit revision {request.branchRevision} and its canonical
              timeline and source projection match. Advanced Studio opened the Episode sequence at{" "}
              {request.sequenceAtSeconds.toFixed(2)} seconds without applying an
              edit decision.
            </p>
          </div>
          <Link
            href={returnHref}
            className="inline-flex min-h-10 items-center rounded-lg border border-emerald-300 bg-white px-3 font-black"
          >
            Return to Episode editor
          </Link>
        </div>
      </section>
    );
  }
  return (
    <section
      className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-950"
      role="alert"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-black uppercase tracking-[0.14em]">
            Episode handoff not applied
          </p>
          <p className="mt-1 font-bold">{state.reason}</p>
        </div>
        <Link
          href={returnHref}
          className="inline-flex min-h-10 items-center rounded-lg border border-rose-300 bg-white px-3 font-black"
        >
          Reopen current Episode edit
        </Link>
      </div>
    </section>
  );
}
