"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import EpisodeProjectionView from "@/components/hgo/projection/EpisodeProjectionView";
import ProjectionReviewGatePanel from "@/components/hgo/projection/ProjectionReviewGatePanel";
import {
  parseHgoStagedProjectionArtifactJson,
  summarizeHgoStagedProjectionArtifactImport,
  type HgoStagedProjectionArtifact,
} from "@/lib/hgo/staged-projection-artifact";

type ParsedArtifact =
  | {
      state: "empty";
      errors: string[];
      warnings: string[];
      artifact: null;
    }
  | {
      state: "invalid";
      errors: string[];
      warnings: string[];
      artifact: null;
    }
  | {
      state: "valid";
      errors: string[];
      warnings: string[];
      artifact: HgoStagedProjectionArtifact;
    }
  | {
      state: "warning";
      errors: string[];
      warnings: string[];
      artifact: HgoStagedProjectionArtifact;
    };

function parseArtifactJson(value: string): ParsedArtifact {
  if (!value.trim()) {
    return {
      state: "empty",
      errors: [],
      warnings: [],
      artifact: null,
    };
  }

  const result = parseHgoStagedProjectionArtifactJson(value);

  if (!result.ok || !result.artifact) {
    return {
      state: "invalid",
      errors: result.errors,
      warnings: result.warnings,
      artifact: null,
    };
  }

  return {
    state: result.state === "warning" ? "warning" : "valid",
    errors: [],
    warnings: result.warnings,
    artifact: result.artifact,
  };
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
        data-testid={`hgo-stage-artifact-${tone}-heading`}
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

function SummaryCell({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "warning" | "blocker";
}) {
  const toneClassName =
    tone === "blocker"
      ? "border-rose-300/20 bg-rose-300/10"
      : tone === "warning"
        ? "border-amber-300/20 bg-amber-300/10"
        : "border-white/10 bg-void-light/55";

  return (
    <div className={`rounded-[18px] border p-4 ${toneClassName}`}>
      <p className="text-xs font-bold uppercase text-subject-muted">{label}</p>
      <div className="mt-2 break-words text-2xl font-black">{value}</div>
    </div>
  );
}

function ArtifactImportSummaryPanel({
  artifact,
}: {
  artifact: HgoStagedProjectionArtifact;
}) {
  const summary = summarizeHgoStagedProjectionArtifactImport(artifact);

  return (
    <section
      className="mx-auto max-w-[1200px] px-5 py-10 md:px-8"
      data-testid="hgo-stage-artifact-summary"
    >
      <div className="rounded-[28px] border border-sky-300/25 bg-sky-300/10 p-5 text-sky-50 shadow-glass">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase text-sky-100">
              Artifact validation passed
            </p>
            <h2 className="mt-2 text-3xl font-black leading-tight text-subject">
              Embedded staged review packet
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-subject-muted">
              This inspection reads a browser-created artifact shape: projection,
              validation state, review gate, and safety flags. It does not
              persist, publish, or verify public safety.
            </p>
          </div>
          <div className="grid gap-2 text-sm font-bold text-sky-100">
            <span>No persistence</span>
            <span>No publish action</span>
            <span>Artifact inspection only</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
          <SummaryCell
            label="Artifact id"
            value={<span className="font-mono text-xs">{summary.artifactId}</span>}
          />
          <SummaryCell label="Artifact status" value={summary.status} />
          <SummaryCell
            label="Recommended next action"
            value={summary.recommendedNextAction}
          />
          <SummaryCell
            label="Projection"
            value={<span className="font-mono text-xs">{summary.projectionSlug}</span>}
          />
          <SummaryCell
            label="Projection status"
            value={summary.projectionStatus}
          />
          <SummaryCell
            label="Projection visibility"
            value={summary.projectionVisibility}
          />
          <SummaryCell
            label="Blockers"
            value={summary.blockerCount}
            tone="blocker"
          />
          <SummaryCell
            label="Warnings"
            value={summary.warningCount}
            tone="warning"
          />
          <SummaryCell
            label="Validation warnings"
            value={summary.validationWarningCount}
            tone="warning"
          />
          <SummaryCell
            label="Validation errors"
            value={summary.validationErrorCount}
            tone="blocker"
          />
          <SummaryCell label="Persisted" value={summary.persisted ? "Yes" : "No"} />
          <SummaryCell label="Published" value={summary.published ? "Yes" : "No"} />
          <SummaryCell
            label="Real content"
            value={summary.containsRealContent}
            tone="warning"
          />
          <SummaryCell
            label="Source kind"
            value={summary.sourceKind}
          />
          <SummaryCell
            label="Bridge version"
            value={summary.sourceBridgeVersion ?? "not supplied"}
          />
          <SummaryCell
            label="Created at"
            value={<span className="font-mono text-xs">{summary.createdAt}</span>}
          />
        </div>

        <p className="mt-5 rounded-[18px] border border-amber-300/25 bg-amber-300/10 p-4 text-sm font-bold leading-6 text-amber-100">
          {artifact.safety.operatorWarning}
        </p>
      </div>
    </section>
  );
}

export default function ArtifactProjectionStageClient() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [rawArtifactJson, setRawArtifactJson] = useState("");
  const parsedArtifact = useMemo(
    () => parseArtifactJson(rawArtifactJson),
    [rawArtifactJson],
  );

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return (
    <div className="min-h-screen bg-void text-subject">
      {isHydrated ? (
        <span className="sr-only" data-testid="hgo-stage-artifact-hydrated">
          Staged artifact inspection is ready for browser input.
        </span>
      ) : null}

      <section className="border-b border-white/8 bg-[radial-gradient(circle_at_18%_10%,rgba(82,190,176,0.2),transparent_30%),linear-gradient(135deg,#050d10_0%,#10252a_58%,#1d1811_100%)]">
        <div className="mx-auto grid max-w-[1200px] gap-6 px-5 py-12 md:grid-cols-[0.95fr_1.05fr] md:px-8 md:py-16">
          <div>
            <p className="text-xs font-bold uppercase text-flare">
              Staged artifact inspection
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black leading-[1.02] md:text-6xl">
              Validate a browser-created staged artifact before any future store.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-subject-muted md:text-lg">
              Paste a staged artifact JSON file to validate its contract, inspect
              embedded safety flags, review the saved gate state, and render the
              embedded projection through the shared HGO component.
            </p>
            <div className="mt-5 grid gap-3 rounded-[24px] border border-amber-300/25 bg-amber-300/10 p-5 text-sm font-bold leading-6 text-amber-100">
              <p>This does not persist artifact JSON.</p>
              <p>This does not publish or verify public safety.</p>
              <p>This is artifact inspection only.</p>
              <p>Future private staged store may accept this shape.</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/projection-stage/import"
                className="inline-flex rounded-full border border-sky-300/35 bg-sky-300/12 px-4 py-2 text-sm font-bold text-sky-100 no-underline transition hover:bg-sky-300/18"
              >
                Create staged artifact JSON
              </Link>
              <Link
                href="/projection-stage/review"
                className="inline-flex rounded-full border border-amber-300/35 bg-amber-300/12 px-4 py-2 text-sm font-bold text-amber-100 no-underline transition hover:bg-amber-300/18"
              >
                Review fixture gate
              </Link>
              <Link
                href="/projection-stage"
                className="inline-flex rounded-full border border-flare/35 bg-flare/12 px-4 py-2 text-sm font-bold text-flare no-underline transition hover:bg-flare/18"
              >
                Back to staged map
              </Link>
            </div>
          </div>

          <div className="grid gap-4 rounded-[28px] border border-white/12 bg-white/8 p-5 shadow-glass backdrop-blur">
            <label className="grid gap-2">
              <span className="text-sm font-black uppercase text-flare">
                Staged artifact JSON
              </span>
              <textarea
                className="min-h-[300px] w-full resize-y rounded-[18px] border border-white/12 bg-void-light/80 px-4 py-3 font-mono text-xs leading-6 text-subject outline-none focus:border-flare/45"
                data-testid="hgo-stage-artifact-json"
                value={rawArtifactJson}
                onChange={(event) => setRawArtifactJson(event.target.value)}
                onInput={(event) =>
                  setRawArtifactJson(event.currentTarget.value)
                }
                spellCheck={false}
              />
            </label>

            <div className="grid gap-3">
              <div data-testid="hgo-stage-artifact-validation-errors">
                <ValidationList
                  title="Artifact errors"
                  items={parsedArtifact.errors}
                  tone="error"
                />
              </div>
              <div data-testid="hgo-stage-artifact-validation-warnings">
                <ValidationList
                  title="Artifact warnings"
                  items={parsedArtifact.warnings}
                  tone="warning"
                />
              </div>
              {parsedArtifact.artifact ? (
                <div className="rounded-[20px] border border-emerald-300/35 bg-emerald-300/10 p-4 text-sm font-bold text-emerald-100">
                  Artifact contract is valid for browser-only staged inspection.
                </div>
              ) : null}
              {parsedArtifact.state === "empty" ? (
                <div className="rounded-[20px] border border-white/10 bg-void-light/55 p-4 text-sm font-bold leading-6 text-subject-muted">
                  Paste HGO staged artifact JSON to inspect it in this browser
                  session only. Nothing is saved by this route.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {parsedArtifact.artifact ? (
        <>
          <ArtifactImportSummaryPanel artifact={parsedArtifact.artifact} />

          <section className="mx-auto max-w-[1200px] px-5 pb-10 md:px-8">
            <ProjectionReviewGatePanel
              gate={parsedArtifact.artifact.reviewGate}
              testId="hgo-stage-artifact-review-gate"
            />
          </section>

          <div data-testid="hgo-stage-artifact-rendered-projection">
            <EpisodeProjectionView
              key={parsedArtifact.artifact.projection.id}
              projection={parsedArtifact.artifact.projection}
              allProjections={[parsedArtifact.artifact.projection]}
              projectionBasePath="/projection-stage"
              projectionMapHref="/projection-stage"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
