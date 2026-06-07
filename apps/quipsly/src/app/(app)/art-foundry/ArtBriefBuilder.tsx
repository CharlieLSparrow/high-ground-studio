"use client";

import { useMemo, useState } from "react";
import {
  Copy,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  QUIPSLY_ART_ROLE_RECIPES,
  normalizeQuipslyArtRole,
  type QuipslyArtBrief,
  type QuipslyArtRole,
} from "@high-ground/quipsly-domain/art-recipes";
import { QUIPSLY_OUTPUT_CATALOG } from "@high-ground/quipsly-domain/output-catalog";

type BriefState =
  | { status: "idle"; brief?: undefined; error?: undefined }
  | { status: "loading"; brief?: undefined; error?: undefined }
  | { status: "ready"; brief: QuipslyArtBrief; error?: undefined }
  | { status: "error"; brief?: undefined; error: string };

const defaultSubjects: Record<QuipslyArtRole, string> = {
  librarian: "finding examples in a writer's source library",
  scribe: "helping an author organize a living manuscript without writing it for them",
  producer: "Homer and Charlie recording High Ground Odyssey with show notes and clip cues",
  "quote-curator": "sorting verified quote cards into a warm QuipLore archive",
  publisher: "preparing public-safe publishing packets for YouTube, Patreon, podcast RSS, and owned sites",
  teacher: "turning source material into a mobile-friendly lesson with quiz cards",
  "gallery-guide": "helping a photography client review favorites and leave notes",
};

function readInitialBriefForm() {
  if (typeof window === "undefined") {
    return {
      outputId: "",
      role: "librarian" as QuipslyArtRole,
      subject: defaultSubjects.librarian,
      mood: "curious, cheerful, useful",
      surface: "Quipsly Nest and marketing",
    };
  }

  const params = new URLSearchParams(window.location.search);
  const outputId = params.get("outputId") || "";
  const output = QUIPSLY_OUTPUT_CATALOG.find((item) => item.id === outputId);
  const role = normalizeQuipslyArtRole(params.get("role") || output?.visualRoles[0]);
  return {
    outputId,
    role,
    subject:
      params.get("subject") ||
      (output ? `a ${output.title} helper that understands ${output.sourceInputs.slice(0, 3).join(", ")}` : defaultSubjects[role]),
    mood: params.get("mood") || "curious, cheerful, useful",
    surface: params.get("surface") || output?.title || "Quipsly Nest and marketing",
  };
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-2 rounded-full border border-[#e8dcc4] bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-[#8c6b4a] shadow-sm transition hover:bg-[#fff8ec]"
    >
      <Copy size={13} />
      {copied ? "Copied" : label}
    </button>
  );
}

export function ArtBriefBuilder() {
  const roles = Object.entries(QUIPSLY_ART_ROLE_RECIPES) as Array<[QuipslyArtRole, { label: string; prompt: string }]>;
  const [initialForm] = useState(readInitialBriefForm);
  const [outputId, setOutputId] = useState(initialForm.outputId);
  const [role, setRole] = useState<QuipslyArtRole>(initialForm.role);
  const [subject, setSubject] = useState(initialForm.subject);
  const [mood, setMood] = useState(initialForm.mood);
  const [surface, setSurface] = useState(initialForm.surface);
  const [state, setState] = useState<BriefState>({ status: "idle" });

  const selectedRecipe = useMemo(() => QUIPSLY_ART_ROLE_RECIPES[role], [role]);

  async function generateBrief() {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/quipsly-art/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputId: outputId || undefined, role, subject, mood, surface }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok || !payload?.brief) {
        throw new Error(payload?.error || "Could not create art brief.");
      }
      setState({ status: "ready", brief: payload.brief });
    } catch (error) {
      setState({
        status: "error",
        error: error instanceof Error ? error.message : "Could not create art brief.",
      });
    }
  }

  return (
    <section className="mt-8 rounded-[2rem] border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#8c6b4a]">
            <Wand2 size={14} />
            Browser prompt builder
          </div>
          <h2 className="mt-2 font-serif text-3xl font-black">Make a new Quipsly brief</h2>
          <p className="mt-2 text-sm leading-6 text-[#6b5b45]">
            This does not mutate the manuscript or publish an image. It creates a clean prompt brief you can use in ComfyUI, ChatGPT image generation, or another art workflow.
          </p>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Start from an output type</span>
              <select
                value={outputId}
                onChange={(event) => {
                  const nextOutputId = event.target.value;
                  setOutputId(nextOutputId);
                  const output = QUIPSLY_OUTPUT_CATALOG.find((item) => item.id === nextOutputId);
                  if (!output) return;
                  const nextRole = output.visualRoles[0] ?? "librarian";
                  setRole(nextRole);
                  setSubject(`a ${output.title} helper that understands ${output.sourceInputs.slice(0, 3).join(", ")}`);
                  setSurface(output.title);
                  setMood("useful, calm, production-ready");
                }}
                className="rounded-xl border border-[#e8dcc4] bg-[#fffaf3] px-4 py-3 text-sm font-bold text-[#3d3122] outline-none focus:border-amber-500"
              >
                <option value="">Custom Quipsly brief</option>
                {QUIPSLY_OUTPUT_CATALOG.map((output) => (
                  <option key={output.id} value={output.id}>{output.title}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Role</span>
              <select
                value={role}
                onChange={(event) => {
                  const nextRole = event.target.value as QuipslyArtRole;
                  setRole(nextRole);
                  setSubject(defaultSubjects[nextRole]);
                }}
                className="rounded-xl border border-[#e8dcc4] bg-[#fffaf3] px-4 py-3 text-sm font-bold text-[#3d3122] outline-none focus:border-amber-500"
              >
                {roles.map(([value, recipe]) => (
                  <option key={value} value={value}>{recipe.label}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Specific subject</span>
              <textarea
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                rows={3}
                className="rounded-xl border border-[#e8dcc4] bg-[#fffaf3] px-4 py-3 text-sm font-bold leading-6 text-[#3d3122] outline-none focus:border-amber-500"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Mood</span>
                <input
                  value={mood}
                  onChange={(event) => setMood(event.target.value)}
                  className="rounded-xl border border-[#e8dcc4] bg-[#fffaf3] px-4 py-3 text-sm font-bold text-[#3d3122] outline-none focus:border-amber-500"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Surface</span>
                <input
                  value={surface}
                  onChange={(event) => setSurface(event.target.value)}
                  className="rounded-xl border border-[#e8dcc4] bg-[#fffaf3] px-4 py-3 text-sm font-bold text-[#3d3122] outline-none focus:border-amber-500"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4 text-sm leading-6 text-[#6b5b45]">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Role seed</div>
              <p className="mt-2">{selectedRecipe.prompt}</p>
            </div>

            <button
              type="button"
              onClick={generateBrief}
              disabled={state.status === "loading"}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3d3122] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-white shadow-sm transition hover:bg-[#5a442e] disabled:cursor-wait disabled:opacity-70"
            >
              {state.status === "loading" ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
              Generate brief
            </button>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-[#eadfca] bg-[#fffaf3] p-4">
          {state.status === "idle" ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[1.1rem] border border-dashed border-[#dec9a5] bg-white/60 p-8 text-center">
              <Sparkles className="h-10 w-10 text-[#a96735]" />
              <h3 className="mt-4 font-serif text-2xl font-black">Your generated brief appears here.</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#7d6a50]">
                Generate a prompt, copy it into ComfyUI or another image tool, then ingest the approved output into the shared Quipsly art manifest.
              </p>
            </div>
          ) : state.status === "error" ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold leading-6 text-rose-800">
              {state.error}
            </div>
          ) : state.status === "loading" ? (
            <div className="flex min-h-[420px] items-center justify-center text-sm font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
              Generating brief...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-[#a96735]">{state.brief.roleLabel}</div>
                  <h3 className="font-serif text-2xl font-black">Ready prompt brief</h3>
                </div>
                <CopyButton value={JSON.stringify(state.brief, null, 2)} label="Copy JSON" />
              </div>

              <div className="rounded-2xl border border-[#e8dcc4] bg-white p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Prompt</span>
                  <CopyButton value={state.brief.prompt} label="Copy prompt" />
                </div>
                <p className="text-sm leading-6 text-[#3d3122]">{state.brief.prompt}</p>
              </div>

              <div className="rounded-2xl border border-[#e8dcc4] bg-white p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Negative prompt</span>
                  <CopyButton value={state.brief.negativePrompt} label="Copy negative" />
                </div>
                <p className="text-sm leading-6 text-[#6b5b45]">{state.brief.negativePrompt}</p>
              </div>

              <div className="rounded-2xl border border-[#e8dcc4] bg-white p-4 text-xs font-bold leading-6 text-[#6b5b45]">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">After generation</div>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>Save the approved PNG.</li>
                  <li>Run <code>pnpm quipsly:art:ingest -- --count 1 --hint &quot;ChatGPT Image&quot;</code> or copy it into both public folders.</li>
                  <li>Add a semantic entry to <code>{state.brief.manifestPath}</code>.</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
