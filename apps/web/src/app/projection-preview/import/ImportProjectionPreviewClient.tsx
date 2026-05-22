"use client";

import { useMemo, useState } from "react";

import EpisodeProjectionView from "@/components/hgo/projection/EpisodeProjectionView";
import type { HgoEpisodeProjection } from "@/lib/hgo/projection-types";
import { validateHgoEpisodeProjection } from "@/lib/hgo/projection-validation";

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
        data-testid={`hgo-import-${tone}-heading`}
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

export default function ImportProjectionPreviewClient() {
  const [rawProjectionJson, setRawProjectionJson] = useState("");
  const parsedProjection = useMemo(
    () => parseProjectionJson(rawProjectionJson),
    [rawProjectionJson],
  );

  return (
    <div className="min-h-screen bg-void text-subject">
      <section className="border-b border-white/8 bg-[radial-gradient(circle_at_18%_10%,rgba(255,122,24,0.2),transparent_30%),linear-gradient(135deg,#050d10_0%,#10252a_58%,#1d1811_100%)]">
        <div className="mx-auto grid max-w-[1200px] gap-6 px-5 py-12 md:grid-cols-[0.95fr_1.05fr] md:px-8 md:py-16">
          <div>
            <p className="text-xs font-bold uppercase text-flare">
              Browser-only import
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black leading-[1.02] md:text-6xl">
              Paste a Studio HGO projection draft.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-subject-muted md:text-lg">
              This preview parses projection JSON in the browser and renders it
              with the same HGO episode projection component. It does not save,
              stage, publish, or persist anything.
            </p>
            <p className="mt-4 max-w-2xl text-sm font-bold leading-6 text-amber-100">
              Treat real Studio projection drafts as private staged review
              material until citation and public-safety review is complete.
            </p>
          </div>

          <div className="grid gap-4 rounded-[28px] border border-white/12 bg-white/8 p-5 shadow-glass backdrop-blur">
            <label className="grid gap-2">
              <span className="text-sm font-black uppercase text-flare">
                Projection JSON
              </span>
              <textarea
                className="min-h-[280px] w-full resize-y rounded-[18px] border border-white/12 bg-void-light/80 px-4 py-3 font-mono text-xs leading-6 text-subject outline-none focus:border-flare/45"
                data-testid="hgo-import-projection-json"
                value={rawProjectionJson}
                onChange={(event) => setRawProjectionJson(event.target.value)}
                spellCheck={false}
              />
            </label>

            <div className="grid gap-3">
              <div data-testid="hgo-import-validation-errors">
                <ValidationList
                  title="Errors"
                  items={parsedProjection.errors}
                  tone="error"
                />
              </div>
              <div data-testid="hgo-import-validation-warnings">
                <ValidationList
                  title="Warnings"
                  items={parsedProjection.warnings}
                  tone="warning"
                />
              </div>
              {parsedProjection.state === "valid" &&
              !parsedProjection.warnings.length ? (
                <div className="rounded-[20px] border border-emerald-300/35 bg-emerald-300/10 p-4 text-sm font-bold text-emerald-100">
                  Projection shape is valid for preview.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {parsedProjection.projection ? (
        <div data-testid="hgo-import-rendered-projection">
          <EpisodeProjectionView
            key={parsedProjection.projection.id}
            projection={parsedProjection.projection}
            allProjections={[parsedProjection.projection]}
          />
        </div>
      ) : null}
    </div>
  );
}
