"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import EpisodeProjectionView from "@/components/hgo/projection/EpisodeProjectionView";
import ProjectionReviewGatePanel from "@/components/hgo/projection/ProjectionReviewGatePanel";
import { createHgoProjectionReviewGate } from "@/lib/hgo/projection-review-gate";
import type { HgoEpisodeProjection } from "@/lib/hgo/projection-types";
import { validateHgoEpisodeProjection } from "@/lib/hgo/projection-validation";
import {
  assertHgoStagedProjectionArtifactIsBrowserOnlySafe,
  createHgoStagedProjectionArtifact,
  createHgoStagedProjectionArtifactFileName,
  summarizeHgoStagedProjectionArtifact,
  type HgoStagedProjectionArtifact,
} from "@/lib/hgo/staged-projection-artifact";

type ParsedProjection =
  | {
      state: "empty";
      errors: string[];
      warnings: string[];
      projection: null;
    }
  | {
      state: "invalid";
      errors: string[];
      warnings: string[];
      projection: null;
    }
  | {
      state: "valid";
      errors: string[];
      warnings: string[];
      projection: HgoEpisodeProjection;
    };

function parseProjectionJson(value: string): ParsedProjection {
  if (!value.trim()) {
    return {
      state: "empty",
      errors: [],
      warnings: [],
      projection: null,
    };
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    const validation = validateHgoEpisodeProjection(parsed);

    if (!validation.ok) {
      return {
        state: "invalid",
        errors: validation.errors,
        warnings: validation.warnings,
        projection: null,
      };
    }

    return {
      state: "valid",
      errors: [],
      warnings: validation.warnings,
      projection: parsed as HgoEpisodeProjection,
    };
  } catch (error) {
    return {
      state: "invalid",
      errors: [
        error instanceof Error
          ? `Invalid JSON: ${error.message}`
          : "Invalid JSON.",
      ],
      warnings: [],
      projection: null,
    };
  }
}

function ValidationList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "error" | "warning";
}) {
  if (!items.length) {
    return null;
  }

  const toneClassName =
    tone === "error"
      ? "border-rose-300/35 bg-rose-300/10 text-rose-100"
      : "border-amber-300/35 bg-amber-300/10 text-amber-100";

  return (
    <div className={`rounded-[20px] border p-4 ${toneClassName}`}>
      <p
        className="text-sm font-black uppercase"
        data-testid={`hgo-stage-import-${tone}-heading`}
      >
        {title}
      </p>
      <ul className="mt-3 grid gap-2 pl-5 text-sm leading-6">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ArtifactSummaryPanel({
  artifact,
  artifactJson,
  onGenerateArtifactJson,
  onDownloadArtifactJson,
}: {
  artifact: HgoStagedProjectionArtifact;
  artifactJson: string;
  onGenerateArtifactJson: () => void;
  onDownloadArtifactJson: () => void;
}) {
  const summary = summarizeHgoStagedProjectionArtifact(artifact);
  const safety = assertHgoStagedProjectionArtifactIsBrowserOnlySafe(artifact);

  return (
    <section
      className="mx-auto max-w-[1200px] px-5 pb-4 pt-10 md:px-8"
      data-testid="hgo-stage-import-artifact-summary"
    >
      <div className="rounded-[28px] border border-sky-300/25 bg-sky-300/10 p-5 text-sky-50 shadow-glass">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-black uppercase text-sky-100">
              Staged artifact contract
            </p>
            <h2 className="mt-2 text-3xl font-black leading-tight text-subject">
              Downloadable review artifact
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-subject-muted">
              This artifact is a browser-only review packet: projection plus
              validation warnings plus review-gate state. This file is not
              published. This file is not saved by HGO. A future private staged
              store may accept this artifact shape.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-flare/35 bg-flare/12 px-4 py-2 text-sm font-bold text-flare transition hover:bg-flare/18"
              data-testid="hgo-stage-import-generate-artifact"
              onClick={onGenerateArtifactJson}
            >
              Generate staged artifact JSON
            </button>
            <button
              type="button"
              className="rounded-full border border-sky-300/35 bg-sky-300/12 px-4 py-2 text-sm font-bold text-sky-100 transition hover:bg-sky-300/18"
              data-testid="hgo-stage-import-download-artifact"
              onClick={onDownloadArtifactJson}
            >
              Download staged artifact JSON
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
            <p className="text-xs font-bold uppercase text-subject-muted">
              Artifact id
            </p>
            <p className="mt-2 break-all font-mono text-xs text-subject">
              {summary.artifactId}
            </p>
          </div>
          <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
            <p className="text-xs font-bold uppercase text-subject-muted">
              Status
            </p>
            <p className="mt-2 text-2xl font-black">{summary.status}</p>
          </div>
          <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
            <p className="text-xs font-bold uppercase text-subject-muted">
              Recommended next action
            </p>
            <p className="mt-2 text-2xl font-black">
              {summary.recommendedNextAction}
            </p>
          </div>
          <div className="rounded-[18px] border border-rose-300/20 bg-rose-300/10 p-4">
            <p className="text-xs font-bold uppercase text-rose-100">Blockers</p>
            <p className="mt-2 text-3xl font-black">{summary.blockerCount}</p>
          </div>
          <div className="rounded-[18px] border border-amber-300/20 bg-amber-300/10 p-4">
            <p className="text-xs font-bold uppercase text-amber-100">Warnings</p>
            <p className="mt-2 text-3xl font-black">{summary.warningCount}</p>
          </div>
          <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
            <p className="text-xs font-bold uppercase text-subject-muted">
              Created at
            </p>
            <p className="mt-2 break-all font-mono text-xs text-subject">
              {summary.createdAt}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
            <p className="text-xs font-bold uppercase text-subject-muted">
              Persisted
            </p>
            <p className="mt-2 text-2xl font-black">
              {summary.persisted ? "Yes" : "No"}
            </p>
          </div>
          <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
            <p className="text-xs font-bold uppercase text-subject-muted">
              Published
            </p>
            <p className="mt-2 text-2xl font-black">
              {summary.published ? "Yes" : "No"}
            </p>
          </div>
          <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
            <p className="text-xs font-bold uppercase text-subject-muted">
              Real content
            </p>
            <p className="mt-2 text-2xl font-black">
              {artifact.safety.containsRealContent}
            </p>
          </div>
        </div>

        <p className="mt-5 rounded-[18px] border border-amber-300/25 bg-amber-300/10 p-4 text-sm font-bold leading-6 text-amber-100">
          {artifact.safety.operatorWarning}
        </p>

        {!safety.ok ? (
          <div className="mt-4 rounded-[18px] border border-rose-300/35 bg-rose-300/10 p-4 text-sm text-rose-100">
            <p className="font-black uppercase">Safety check failed</p>
            <ul className="mt-3 grid gap-2 pl-5 leading-6">
              {safety.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {artifactJson ? (
          <label className="mt-5 grid gap-2">
            <span className="text-xs font-black uppercase text-sky-100">
              Generated artifact JSON
            </span>
            <textarea
              readOnly
              className="min-h-[260px] w-full resize-y rounded-[18px] border border-white/12 bg-void-light/80 px-4 py-3 font-mono text-xs leading-6 text-subject outline-none"
              data-testid="hgo-stage-import-artifact-json"
              value={artifactJson}
            />
          </label>
        ) : null}
      </div>
    </section>
  );
}

export default function ImportProjectionStageClient() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [rawProjectionJson, setRawProjectionJson] = useState("");
  const [artifact, setArtifact] =
    useState<HgoStagedProjectionArtifact | null>(null);
  const [artifactJson, setArtifactJson] = useState("");
  const parsedProjection = useMemo(
    () => parseProjectionJson(rawProjectionJson),
    [rawProjectionJson],
  );
  const reviewGate = useMemo(
    () =>
      parsedProjection.projection
        ? createHgoProjectionReviewGate(parsedProjection.projection)
        : null,
    [parsedProjection.projection],
  );

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!parsedProjection.projection || !reviewGate) {
      setArtifact(null);
      setArtifactJson("");
      return;
    }

    setArtifact(
      createHgoStagedProjectionArtifact({
        projection: parsedProjection.projection,
        reviewGate,
        validationWarnings: parsedProjection.warnings,
        validationErrors: parsedProjection.errors,
        createdAt: new Date().toISOString(),
      }),
    );
    setArtifactJson("");
  }, [parsedProjection, reviewGate]);

  function generateArtifactJson() {
    if (!artifact) {
      return "";
    }

    const nextArtifactJson = JSON.stringify(artifact, null, 2);
    setArtifactJson(nextArtifactJson);
    return nextArtifactJson;
  }

  function downloadArtifactJson() {
    if (!artifact) {
      return;
    }

    const nextArtifactJson = artifactJson || generateArtifactJson();
    const blob = new Blob([nextArtifactJson], {
      type: "application/json;charset=utf-8",
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = href;
    link.download = createHgoStagedProjectionArtifactFileName(artifact);
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  }

  return (
    <div className="min-h-screen bg-void text-subject">
      {isHydrated ? (
        <span className="sr-only" data-testid="hgo-stage-import-hydrated">
          Staged import review is ready for browser input.
        </span>
      ) : null}
      <section className="border-b border-white/8 bg-[radial-gradient(circle_at_18%_10%,rgba(255,122,24,0.2),transparent_30%),linear-gradient(135deg,#050d10_0%,#10252a_58%,#1d1811_100%)]">
        <div className="mx-auto grid max-w-[1200px] gap-6 px-5 py-12 md:grid-cols-[0.95fr_1.05fr] md:px-8 md:py-16">
          <div>
            <p className="text-xs font-bold uppercase text-flare">
              Staged import review
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black leading-[1.02] md:text-6xl">
              Review pasted projection JSON before any future staging store.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-subject-muted md:text-lg">
              Paste a Studio-generated HGO projection draft to validate it, run
              the staged review gate, and render it through the shared HGO
              projection component. This route does not persist, publish, or
              write server state.
            </p>
            <div className="mt-5 grid gap-3 rounded-[24px] border border-amber-300/25 bg-amber-300/10 p-5 text-sm font-bold leading-6 text-amber-100">
              <p>This is staged review only, not a live HGO page.</p>
              <p>Real projection drafts may contain private/review-only content.</p>
              <p>Do not paste real drafts into public places.</p>
              <p>No persistence. No publish action. No replacement for `/episodes`.</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/projection-stage"
                className="inline-flex rounded-full border border-flare/35 bg-flare/12 px-4 py-2 text-sm font-bold text-flare no-underline transition hover:bg-flare/18"
              >
                Back to staged map
              </Link>
              <Link
                href="/projection-stage/review"
                className="inline-flex rounded-full border border-amber-300/35 bg-amber-300/12 px-4 py-2 text-sm font-bold text-amber-100 no-underline transition hover:bg-amber-300/18"
              >
                Review fixture gate
              </Link>
              <Link
                href="/projection-stage/artifact"
                className="inline-flex rounded-full border border-sky-300/35 bg-sky-300/12 px-4 py-2 text-sm font-bold text-sky-100 no-underline transition hover:bg-sky-300/18"
              >
                Inspect staged artifact JSON
              </Link>
              <Link
                href="/projection-stage/store-lab"
                className="inline-flex rounded-full border border-emerald-300/35 bg-emerald-300/12 px-4 py-2 text-sm font-bold text-emerald-100 no-underline transition hover:bg-emerald-300/18"
              >
                Session store lab
              </Link>
              <span className="inline-flex rounded-full border border-sky-300/25 bg-sky-300/8 px-3 py-1 text-xs font-bold text-sky-100">
                No persistence
              </span>
              <span className="inline-flex rounded-full border border-sky-300/25 bg-sky-300/8 px-3 py-1 text-xs font-bold text-sky-100">
                No publish action
              </span>
            </div>
          </div>

          <div className="grid gap-4 rounded-[28px] border border-white/12 bg-white/8 p-5 shadow-glass backdrop-blur">
            <label className="grid gap-2">
              <span className="text-sm font-black uppercase text-flare">
                Projection JSON
              </span>
              <textarea
                className="min-h-[300px] w-full resize-y rounded-[18px] border border-white/12 bg-void-light/80 px-4 py-3 font-mono text-xs leading-6 text-subject outline-none focus:border-flare/45"
                data-testid="hgo-stage-import-projection-json"
                value={rawProjectionJson}
                onChange={(event) => setRawProjectionJson(event.target.value)}
                onInput={(event) =>
                  setRawProjectionJson(event.currentTarget.value)
                }
                spellCheck={false}
              />
            </label>

            <div className="grid gap-3">
              <div data-testid="hgo-stage-import-validation-errors">
                <ValidationList
                  title="Errors"
                  items={parsedProjection.errors}
                  tone="error"
                />
              </div>
              <div data-testid="hgo-stage-import-validation-warnings">
                <ValidationList
                  title="Warnings"
                  items={parsedProjection.warnings}
                  tone="warning"
                />
              </div>
              {parsedProjection.state === "valid" &&
              !parsedProjection.warnings.length ? (
                <div className="rounded-[20px] border border-emerald-300/35 bg-emerald-300/10 p-4 text-sm font-bold text-emerald-100">
                  Projection shape is valid and ready for staged review.
                </div>
              ) : null}
              {parsedProjection.state === "empty" ? (
                <div className="rounded-[20px] border border-white/10 bg-void-light/55 p-4 text-sm font-bold leading-6 text-subject-muted">
                  Paste HGO projection JSON to run validation and review gate
                  checks in this browser session only.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {reviewGate ? (
        <section className="mx-auto max-w-[1200px] px-5 py-10 md:px-8">
          <ProjectionReviewGatePanel
            gate={reviewGate}
            testId="hgo-stage-import-review-gate"
          />
        </section>
      ) : null}

      {artifact ? (
        <ArtifactSummaryPanel
          artifact={artifact}
          artifactJson={artifactJson}
          onGenerateArtifactJson={generateArtifactJson}
          onDownloadArtifactJson={downloadArtifactJson}
        />
      ) : null}

      {parsedProjection.projection ? (
        <div data-testid="hgo-stage-import-rendered-projection">
          <EpisodeProjectionView
            key={parsedProjection.projection.id}
            projection={parsedProjection.projection}
            allProjections={[parsedProjection.projection]}
            projectionBasePath="/projection-stage"
            projectionMapHref="/projection-stage"
          />
        </div>
      ) : null}
    </div>
  );
}
