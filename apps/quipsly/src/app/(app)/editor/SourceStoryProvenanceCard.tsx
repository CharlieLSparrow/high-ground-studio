import Link from "next/link";

import type { SourceStoryTimelineBinding } from "@high-ground/quipsly-domain";

function clock(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${minutes}:${remainder.toFixed(3).padStart(6, "0")}`;
}

export function sourceStoryReturnHref(projectSlug: string, binding: SourceStoryTimelineBinding) {
  const params = new URLSearchParams();
  if (binding.sourceSetId) params.set("set", binding.sourceSetId);
  else if (binding.externalReferenceId) params.set("external", binding.externalReferenceId);
  else if (binding.mediaAssetId) params.set("asset", binding.mediaAssetId);
  if (binding.originBoardId) params.set("board", binding.originBoardId);
  params.set("card", binding.cardId);
  return `/nests/${encodeURIComponent(projectSlug)}/story?${params.toString()}#story-card-${encodeURIComponent(binding.cardId)}`;
}

export function SourceStoryProvenanceCard({
  projectSlug,
  binding,
  currentSourceStart,
  currentSourceEnd,
}: {
  projectSlug: string;
  binding: SourceStoryTimelineBinding;
  currentSourceStart: number;
  currentSourceEnd: number;
}) {
  const retainedStart = binding.sourceRangeStartSeconds;
  const retainedEnd = binding.sourceRangeEndSeconds;
  const recipe = binding.reframeRecipe;
  return (
    <section className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-3 text-violet-950" aria-label="Source Story provenance">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">Source Story placement</div>
          <div className="mt-1 font-black">Exact source provenance is attached</div>
        </div>
        <span className="rounded-full border border-violet-200 bg-white px-2 py-1 font-mono text-[10px]">card r{binding.cardRevision}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] font-bold leading-5">
        {retainedStart !== undefined && retainedEnd !== undefined ? <>
          <dt className="text-violet-700">Retained card range</dt>
          <dd className="text-right font-mono">{clock(retainedStart)}–{clock(retainedEnd)}</dd>
        </> : null}
        <dt className="text-violet-700">This edit uses</dt>
        <dd className="text-right font-mono">{clock(currentSourceStart)}–{clock(currentSourceEnd)}</dd>
        <dt className="text-violet-700">Browse media</dt>
        <dd className="text-right">{binding.browseDerivative ? "verified proxy" : "retained source"}</dd>
        <dt className="text-violet-700">Final conform</dt>
        <dd className="text-right">exact checksum-bound source</dd>
        {recipe ? <>
          <dt className="text-violet-700">360° framing</dt>
          <dd className="text-right">{recipe.aspectRatio} · {recipe.keyframes.length} keyframe{recipe.keyframes.length === 1 ? "" : "s"}</dd>
        </> : null}
      </dl>
      <p className="mt-2 text-[10px] font-semibold leading-4 text-violet-800">
        Moving or trimming this clip updates the Episode placement ledger; it never changes the Story card or original media.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link href={sourceStoryReturnHref(projectSlug, binding)} className="rounded-md border border-violet-300 bg-white px-3 py-1.5 text-[11px] font-black text-violet-900 hover:bg-violet-100">
          Open exact Story card
        </Link>
        <button type="button" onClick={() => void navigator.clipboard?.writeText(binding.selectorSha256)} className="rounded-md border border-violet-200 px-3 py-1.5 text-[11px] font-black text-violet-800 hover:bg-violet-100">
          Copy selector proof
        </button>
      </div>
    </section>
  );
}
