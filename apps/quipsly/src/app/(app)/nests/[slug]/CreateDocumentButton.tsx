"use client";

import { useTransition } from "react";
import { FileInput, Plus } from "lucide-react";
import { createDocumentAction, createHgoEpisodeDraftShellAction, importHgoEpisodeSourceAction, type HgoSourceKey } from "./actions";

export function CreateDocumentButton({ projectSlug }: { projectSlug: string }) {
  const [isPending, startTransition] = useTransition();
  const options = [
    {
      kind: "draft" as const,
      label: "New Draft",
      help: "Exploratory prose, alternate passes, and sections you may promote later."
    },
    {
      kind: "note" as const,
      label: "New Note",
      help: "Quick thoughts, research hunches, admin notes, and connective tissue."
    },
    {
      kind: "study-source" as const,
      label: "New Study Source",
      help: "A fixed reference you tag and annotate over instead of silently rewriting."
    },
  ];
  const hgoSources: Array<{ key: HgoSourceKey; label: string }> = [
    { key: "episode-1", label: "Episode 1" },
    { key: "episode-2", label: "Episode 2" },
    { key: "episode-3", label: "Episode 3" },
    { key: "episode-4", label: "Episode 4" },
    { key: "episode-5", label: "Episode 5" },
    { key: "episode-6", label: "Episode 6" },
    { key: "episode-7", label: "Episode 7" },
    { key: "episode-8", label: "Episode 8" },
    { key: "episode-9", label: "Episode 9" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.kind}
            onClick={() => {
              startTransition(() => {
                createDocumentAction(projectSlug, option.kind);
              });
            }}
            disabled={isPending}
            className="group rounded-2xl border border-[#eadfca] bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-[#fff8eb] hover:shadow-md disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
              <Plus size={14} />
              {isPending ? "Creating..." : option.label}
            </span>
            <span className="mt-2 block text-xs leading-5 text-[#6b5b45]">
              {option.help}
            </span>
          </button>
        ))}
      </div>

      {projectSlug === "high-ground-odyssey-manuscript" ? (
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50/80 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-800">
                <FileInput size={14} />
                High Ground Odyssey Source Runway
              </div>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-[#4f6470]">
                Import episode prep as fixed Study Source documents. This copies source text into Nest for tagging and annotation; it does not overwrite the living manuscript.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {hgoSources.map((source) => (
              <button
                key={source.key}
                onClick={() => {
                  startTransition(() => {
                    importHgoEpisodeSourceAction(projectSlug, source.key);
                  });
                }}
                disabled={isPending}
                className="rounded-full border border-cyan-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-100 disabled:opacity-50"
              >
                {isPending ? "Working..." : `Import ${source.label}`}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800">
              Source-linked draft shells
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[#6f5a3e]">
              Create a separate draft/page workspace for episode copy, article ideas, manuscript notes, and platform descriptions. This is where drafting happens before anything is promoted.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {hgoSources.map((source) => (
                <button
                  key={`${source.key}-draft`}
                  onClick={() => {
                    startTransition(() => {
                      createHgoEpisodeDraftShellAction(projectSlug, source.key);
                    });
                  }}
                  disabled={isPending}
                  className="rounded-full border border-amber-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-amber-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-100 disabled:opacity-50"
                >
                  {isPending ? "Working..." : `Draft ${source.label}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
