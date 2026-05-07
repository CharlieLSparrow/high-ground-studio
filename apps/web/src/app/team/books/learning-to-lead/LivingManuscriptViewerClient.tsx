"use client";

import { useMemo, useState } from "react";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import PaperCard from "@/components/ui/PaperCard";
import type {
  EpisodeProductionEpisode,
  EpisodeVirtualSplitChunk,
  EpisodeVirtualSplitPlan,
  EpisodeVirtualSplitState,
  SeasonOneEpisodeProductionState,
} from "@/lib/server/episode-production";
import type {
  LivingManuscriptBlock,
  LivingManuscriptBookArrangement,
  LivingManuscriptBookChapter,
  LivingManuscriptDocument,
  LivingManuscriptPodcastArrangement,
} from "@/lib/server/living-manuscript";

type ViewerProps = {
  manuscript: LivingManuscriptDocument;
  bookArrangement: LivingManuscriptBookArrangement;
  podcastArrangement: LivingManuscriptPodcastArrangement;
  episodeProductionState: SeasonOneEpisodeProductionState;
  episodeVirtualSplitState: EpisodeVirtualSplitState;
};

type FilterState = {
  chapters: string[];
  voices: string[];
  statuses: string[];
  types: string[];
  tags: string[];
};

type ViewerPreset =
  | "show-all"
  | "homer-only"
  | "charlie-only"
  | "needs-citation"
  | "episode-4";

type ViewMode = "book" | "story" | "episode";
type EpisodeViewMode = "everything" | "draft" | "playground";

type ChapterGroup = {
  key: string;
  label: string;
  totalBlocks: LivingManuscriptBlock[];
  visibleBlocks: LivingManuscriptBlock[];
};

type EpisodeGroup = {
  key: string;
  arrangementKey: string;
  title: string;
  status: string;
  totalBlocks: LivingManuscriptBlock[];
  visibleBlocks: LivingManuscriptBlock[];
  missingBlockIds: string[];
  warnings: string[];
  primaryChapter: string | null;
  totalWordCount: number;
};

type EpisodeProductionPanel = {
  production: EpisodeProductionEpisode;
  arrangement: EpisodeGroup | null;
  virtualSplitPlan: EpisodeVirtualSplitPlan | null;
};

type PlaygroundCopyKind = "arrangement" | "draft" | "story-checklist" | `stub:${string}`;

const EMPTY_FILTERS: FilterState = {
  chapters: [],
  voices: [],
  statuses: [],
  types: [],
  tags: [],
};

function formatLabel(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function toggleValue(items: string[], value: string) {
  return items.includes(value)
    ? items.filter((item) => item !== value)
    : [...items, value];
}

function getCharlieBlockLabel(block: LivingManuscriptBlock) {
  if (block.voice !== "charlie") {
    return null;
  }

  switch (block.type) {
    case "research-bridge":
      return "Research Bridge";
    case "charlie-reflection":
      return "Charlie Reflection";
    case "pop-culture-bridge":
      return "Pop Culture Bridge";
    case "clip-candidate":
      return "Clip Candidate";
    default:
      return "Charlie Sidebar";
  }
}

function getBlockPresentation(block: LivingManuscriptBlock) {
  const charlieLabel = getCharlieBlockLabel(block);

  if (block.voice !== "charlie") {
    return {
      charlieLabel,
      cardClassName: "min-w-0 px-6 py-8 sm:px-8 sm:py-10",
      metadataClassName:
        "rounded-3xl border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.42)] px-4 py-4 sm:px-5",
      wordCountClassName:
        "rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.45)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.7)]",
      calloutClassName: "",
      calloutLabelClassName: "",
      calloutDescription:
        "Homer baseline manuscript block preserved from source.",
      stampClassName:
        "rounded-[28px] border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.42)] p-4 shadow-[0_16px_40px_rgba(25,18,12,0.08)]",
      stampChipClassName:
        "inline-flex rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.76)]",
      sidebarLinkClassName:
        "block rounded-2xl border border-transparent px-3 py-2 text-sm text-[rgba(245,239,230,0.88)] no-underline transition hover:border-white/10 hover:bg-white/6 hover:text-[var(--text-light)]",
      sidebarMetaClassName:
        "mt-1 text-[11px] uppercase tracking-[0.08em] text-[rgba(245,239,230,0.62)]",
      sourceTextTone: "homer" as const,
    };
  }

  if (block.type === "charlie-reflection") {
    return {
      charlieLabel,
      cardClassName:
        "min-w-0 border-[rgba(126,78,52,0.16)] bg-[linear-gradient(180deg,rgba(247,236,230,0.98),rgba(240,228,220,0.98))] px-6 py-8 sm:px-8 sm:py-10",
      metadataClassName:
        "rounded-3xl border border-[rgba(126,78,52,0.14)] bg-[rgba(255,247,242,0.65)] px-4 py-4 sm:px-5",
      wordCountClassName:
        "rounded-full border border-[rgba(126,78,52,0.16)] bg-[rgba(255,246,239,0.78)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#7a4024]",
      calloutClassName:
        "rounded-[24px] border border-[rgba(126,78,52,0.12)] bg-[rgba(255,247,242,0.72)] px-4 py-4",
      calloutLabelClassName:
        "inline-flex rounded-full border border-[rgba(126,78,52,0.16)] bg-[rgba(210,124,84,0.12)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#8a4528]",
      calloutDescription:
        "Charlie voice layered into the manuscript as a warm, personal close.",
      stampClassName:
        "rounded-[28px] border border-[rgba(126,78,52,0.16)] bg-[linear-gradient(180deg,rgba(247,236,230,0.96),rgba(240,228,220,0.98))] p-4 shadow-[0_16px_40px_rgba(25,18,12,0.08)]",
      stampChipClassName:
        "inline-flex rounded-full border border-[rgba(126,78,52,0.16)] bg-[rgba(210,124,84,0.12)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a4528]",
      sidebarLinkClassName:
        "block rounded-2xl border border-[rgba(210,124,84,0.14)] bg-[rgba(210,124,84,0.08)] px-3 py-2 text-sm text-[rgba(245,239,230,0.92)] no-underline transition hover:border-[rgba(210,124,84,0.28)] hover:bg-[rgba(210,124,84,0.12)] hover:text-[var(--text-light)]",
      sidebarMetaClassName:
        "mt-1 text-[11px] uppercase tracking-[0.08em] text-[rgba(255,223,204,0.72)]",
      sourceTextTone: "charlie" as const,
    };
  }

  return {
    charlieLabel,
    cardClassName:
      "min-w-0 border-[rgba(111,80,42,0.16)] bg-[linear-gradient(180deg,rgba(246,240,229,0.98),rgba(236,228,216,0.98))] px-6 py-8 sm:px-8 sm:py-10",
    metadataClassName:
      "rounded-3xl border border-[rgba(111,80,42,0.12)] bg-[rgba(255,250,242,0.62)] px-4 py-4 sm:px-5",
    wordCountClassName:
      "rounded-full border border-[rgba(111,80,42,0.16)] bg-[rgba(255,248,237,0.78)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#7b4b12]",
    calloutClassName:
      "rounded-[24px] border border-[rgba(111,80,42,0.12)] bg-[rgba(255,250,242,0.72)] px-4 py-4",
    calloutLabelClassName:
      "inline-flex rounded-full border border-[rgba(111,80,42,0.16)] bg-[rgba(179,138,70,0.12)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#7b4b12]",
    calloutDescription:
      "Charlie field notes layered into the manuscript as research and framing.",
    stampClassName:
      "rounded-[28px] border border-[rgba(111,80,42,0.16)] bg-[linear-gradient(180deg,rgba(246,240,229,0.96),rgba(236,228,216,0.98))] p-4 shadow-[0_16px_40px_rgba(25,18,12,0.08)]",
    stampChipClassName:
      "inline-flex rounded-full border border-[rgba(111,80,42,0.16)] bg-[rgba(179,138,70,0.12)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#7b4b12]",
    sidebarLinkClassName:
      "block rounded-2xl border border-[rgba(179,138,70,0.12)] bg-[rgba(179,138,70,0.08)] px-3 py-2 text-sm text-[rgba(245,239,230,0.92)] no-underline transition hover:border-[rgba(179,138,70,0.24)] hover:bg-[rgba(179,138,70,0.12)] hover:text-[var(--text-light)]",
    sidebarMetaClassName:
      "mt-1 text-[11px] uppercase tracking-[0.08em] text-[rgba(255,230,194,0.72)]",
    sourceTextTone: "charlie" as const,
  };
}

function matchesPreset(preset: ViewerPreset, filters: FilterState, search: string) {
  if (search) {
    return false;
  }

  const noOtherFilters =
    filters.chapters.length === 0 &&
    filters.statuses.length === 0 &&
    filters.types.length === 0;

  switch (preset) {
    case "show-all":
      return (
        filters.chapters.length === 0 &&
        filters.voices.length === 0 &&
        filters.statuses.length === 0 &&
        filters.types.length === 0 &&
        filters.tags.length === 0
      );
    case "homer-only":
      return (
        noOtherFilters &&
        filters.tags.length === 0 &&
        filters.voices.length === 1 &&
        filters.voices[0] === "homer"
      );
    case "charlie-only":
      return (
        noOtherFilters &&
        filters.tags.length === 0 &&
        filters.voices.length === 1 &&
        filters.voices[0] === "charlie"
      );
    case "needs-citation":
      return (
        noOtherFilters &&
        filters.voices.length === 0 &&
        filters.tags.length === 1 &&
        filters.tags[0] === "needs-citation"
      );
    case "episode-4":
      return (
        noOtherFilters &&
        filters.voices.length === 0 &&
        filters.tags.length === 1 &&
        filters.tags[0] === "episode-04"
      );
    default:
      return false;
  }
}

function SourceText({
  body,
  tone = "homer",
}: {
  body: string;
  tone?: "homer" | "charlie";
}) {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const textClassName =
    tone === "charlie"
      ? "space-y-5 text-[1rem] leading-7 text-[rgba(43,33,26,0.92)]"
      : "space-y-5 text-[1rem] leading-7 text-[rgba(38,30,24,0.92)]";

  return (
    <div className={textClassName}>
      {paragraphs.map((paragraph, index) => (
        /^###\s+/.test(paragraph) ? (
          <h3
            key={`${index}-${paragraph.slice(0, 18)}`}
            className="m-0 text-[0.98rem] font-bold uppercase tracking-[0.08em] text-[rgba(111,80,42,0.82)]"
          >
            {paragraph.replace(/^###\s+/, "")}
          </h3>
        ) : (
          <p
            key={`${index}-${paragraph.slice(0, 18)}`}
            className="m-0 whitespace-pre-line"
          >
            {paragraph}
          </p>
        )
      ))}
    </div>
  );
}

function getPreviewBody(body: string, maxCharacters = 720, maxParagraphs = 3) {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const selected: string[] = [];
  let characterCount = 0;

  for (const paragraph of paragraphs) {
    if (selected.length >= maxParagraphs) {
      break;
    }

    const nextLength = characterCount + paragraph.length;

    if (selected.length > 0 && nextLength > maxCharacters) {
      break;
    }

    if (paragraph.length > maxCharacters && selected.length === 0) {
      selected.push(`${paragraph.slice(0, maxCharacters).trim()}...`);
      characterCount = maxCharacters;
      break;
    }

    selected.push(paragraph);
    characterCount = nextLength;
  }

  const preview = selected.join("\n\n");
  const normalizedBody = body.trim();
  const truncated =
    preview.length < normalizedBody.length || paragraphs.length > selected.length;

  return {
    body: truncated && !preview.endsWith("...") ? `${preview}...` : preview,
    truncated,
  };
}

function getBlockSourceLabel(block: LivingManuscriptBlock) {
  if (block.voice === "homer") {
    return "Homer text";
  }

  if (block.type === "charlie-reflection") {
    return "Charlie reflection";
  }

  return "Charlie support";
}

function getBlockSizeCue(block: LivingManuscriptBlock) {
  if (block.wordCount > 1800) {
    return "Likely too large";
  }

  if (block.wordCount > 700) {
    return "Maybe split";
  }

  return null;
}

function BlockSizeCue({ block }: { block: LivingManuscriptBlock }) {
  const cue = getBlockSizeCue(block);

  if (!cue) {
    return null;
  }

  return (
    <span className="inline-flex rounded-full border border-[rgba(179,42,42,0.18)] bg-[rgba(179,42,42,0.08)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(94,26,26,0.86)]">
      {cue}
    </span>
  );
}

function BookTextSnippet({ block }: { block: LivingManuscriptBlock }) {
  const preview = getPreviewBody(block.body, 260, 1);

  return (
    <div
      className={[
        "mt-2 rounded-2xl border px-3 py-3 text-xs leading-5",
        block.voice === "homer"
          ? "border-[rgba(255,215,160,0.18)] bg-[rgba(255,248,232,0.08)] text-[rgba(245,239,230,0.84)]"
          : "border-[rgba(210,124,84,0.16)] bg-[rgba(210,124,84,0.08)] text-[rgba(245,239,230,0.74)]",
      ].join(" ")}
    >
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.62)]">
        {getBlockSourceLabel(block)}
      </div>
      <div>{preview.body.replace(/\s+/g, " ")}</div>
    </div>
  );
}

function BookTextPreview({
  block,
  compact = false,
}: {
  block: LivingManuscriptBlock;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = getPreviewBody(block.body, compact ? 560 : 760, compact ? 2 : 3);
  const tone = block.voice === "charlie" ? "charlie" : "homer";

  return (
    <div
      className={[
        "rounded-[26px] border px-4 py-4",
        block.voice === "homer"
          ? "border-[rgba(96,62,28,0.16)] bg-[linear-gradient(180deg,rgba(255,249,236,0.78),rgba(250,239,217,0.66))]"
          : "border-[rgba(126,78,52,0.14)] bg-[rgba(255,247,242,0.62)]",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={[
              "rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]",
              block.voice === "homer"
                ? "border-[rgba(96,62,28,0.18)] bg-[rgba(255,255,255,0.5)] text-[#6f3f16]"
                : "border-[rgba(126,78,52,0.16)] bg-[rgba(210,124,84,0.1)] text-[#8a4528]",
            ].join(" ")}
          >
            {getBlockSourceLabel(block)}
          </span>
          <span className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.48)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)]">
            {block.wordCount} words
          </span>
          <BlockSizeCue block={block} />
        </div>

        {preview.truncated ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[#8f3a00]"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
      </div>

      <div
        className={[
          "mt-3",
          compact
            ? "text-[0.94rem] leading-6"
            : "text-[1rem] leading-7",
        ].join(" ")}
      >
        <SourceText body={expanded ? block.body : preview.body} tone={tone} />
      </div>
    </div>
  );
}

function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-start gap-3 text-sm leading-6 text-[rgba(245,239,230,0.9)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 rounded border-white/20 bg-white/10 text-flare"
      />
      <span>{label}</span>
    </label>
  );
}

function PresetButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] transition",
        active
          ? "border-flare/40 bg-flare/16 text-[var(--text-light)]"
          : "border-white/12 bg-white/8 text-[rgba(245,239,230,0.88)] hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function ViewModeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-4 py-2 text-sm font-semibold transition",
        active
          ? "border-flare/40 bg-flare/16 text-[var(--text-light)]"
          : "border-white/12 bg-white/8 text-[rgba(245,239,230,0.88)] hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 lg:grid-cols-[140px_minmax(0,1fr)] lg:gap-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.55)]">
        {label}
      </div>
      <div className="min-w-0 text-sm leading-6 text-[rgba(38,30,24,0.84)]">
        {value}
      </div>
    </div>
  );
}

function MetadataTagList({ values }: { values: string[] }) {
  if (values.length === 0) {
    return <span className="text-[rgba(38,30,24,0.58)]">None</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span
          key={value}
          className="inline-flex rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.5)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.82)]"
        >
          {formatLabel(value)}
        </span>
      ))}
    </div>
  );
}

function CopyControls({
  blockId,
  anchorId,
  title,
  compact = false,
}: {
  blockId: string;
  anchorId: string;
  title: string;
  compact?: boolean;
}) {
  const [copiedState, setCopiedState] = useState<"id" | "link" | null>(null);

  async function copyValue(kind: "id" | "link") {
    const value =
      kind === "id"
        ? blockId
        : typeof window !== "undefined"
          ? `${window.location.origin}${window.location.pathname}#${anchorId}`
          : `#${anchorId}`;

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setCopiedState(kind);
        window.setTimeout(() => setCopiedState(null), 1400);
      }
    } catch {
      setCopiedState(null);
    }
  }

  const buttonClass = compact
    ? "rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[#8f3a00]"
    : "rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.45)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[#8f3a00]";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!compact ? (
        <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.45)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)]">
          <span>ID</span>
          <code className="normal-case tracking-normal text-[rgba(38,30,24,0.88)]">
            {blockId}
          </code>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => copyValue("id")}
        className={buttonClass}
        aria-label={`Copy block id for ${title}`}
      >
        {copiedState === "id" ? "Copied ID" : "Copy ID"}
      </button>

      <button
        type="button"
        onClick={() => copyValue("link")}
        className={buttonClass}
        aria-label={`Copy anchor link for ${title}`}
      >
        {copiedState === "link" ? "Copied Link" : "Copy Link"}
      </button>
    </div>
  );
}

function BlockCard({
  block,
  showMetadata,
}: {
  block: LivingManuscriptBlock;
  showMetadata: boolean;
}) {
  const presentation = getBlockPresentation(block);

  return (
    <article id={block.id} className="scroll-mt-6">
      <PaperCard className={presentation.cardClassName}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <PageEyebrow>{formatLabel(block.chapter)}</PageEyebrow>
              <PageEyebrow>{formatLabel(block.type)}</PageEyebrow>
              <PageEyebrow>{formatLabel(block.voice)}</PageEyebrow>
              <PageEyebrow>{formatLabel(block.status)}</PageEyebrow>
            </div>

            <h2 className="m-0 mt-2 text-[1.7rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
              <a
                href={`#${block.id}`}
                className="text-inherit no-underline transition hover:text-[#8f3a00]"
              >
                {block.title}
              </a>
            </h2>
          </div>

          <div className={presentation.wordCountClassName}>
            {block.wordCount} words
          </div>
        </div>

        {presentation.charlieLabel ? (
          <div className={`mt-5 ${presentation.calloutClassName}`}>
            <div className={presentation.calloutLabelClassName}>
              {presentation.charlieLabel}
            </div>
            <div className="mt-2 max-w-[58ch] text-sm leading-6 text-[rgba(43,33,26,0.78)]">
              {presentation.calloutDescription}
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <CopyControls blockId={block.id} anchorId={block.id} title={block.title} />
        </div>

        {showMetadata ? (
          <div className={`mt-5 ${presentation.metadataClassName}`}>
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.55)]">
              Block Metadata
            </div>

            <div className="space-y-3">
              <MetadataRow label="ID" value={<code>{block.id}</code>} />
              <MetadataRow label="Title" value={block.title} />
              <MetadataRow label="Type" value={formatLabel(block.type)} />
              <MetadataRow label="Voice" value={formatLabel(block.voice)} />
              <MetadataRow label="Status" value={formatLabel(block.status)} />
              <MetadataRow label="Chapter" value={formatLabel(block.chapter)} />
              <MetadataRow label="Tags" value={<MetadataTagList values={block.tags} />} />
              <MetadataRow label="Source" value={block.source} />
              <MetadataRow
                label="Pairs With"
                value={
                  block.pairsWith.length > 0 ? (
                    <MetadataTagList values={block.pairsWith} />
                  ) : (
                    <span className="text-[rgba(38,30,24,0.58)]">None</span>
                  )
                }
              />
              <MetadataRow
                label="Quote Refs"
                value={
                  block.quoteRefs.length > 0 ? (
                    <MetadataTagList values={block.quoteRefs} />
                  ) : (
                    <span className="text-[rgba(38,30,24,0.58)]">None</span>
                  )
                }
              />
              <MetadataRow
                label="Notes"
                value={
                  block.notes ? (
                    block.notes
                  ) : (
                    <span className="text-[rgba(38,30,24,0.58)]">None</span>
                  )
                }
              />
              <MetadataRow label="Word Count" value={String(block.wordCount)} />
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <SourceText body={block.body} tone={presentation.sourceTextTone} />
        </div>
      </PaperCard>
    </article>
  );
}

function EpisodeBlockStamp({
  block,
  position,
  showMetadata,
  episodeKey,
  crossChapter,
}: {
  block: LivingManuscriptBlock;
  position: number;
  showMetadata: boolean;
  episodeKey: string;
  crossChapter: boolean;
}) {
  const anchorId = `episode-${episodeKey}-${block.id}`;
  const needsCitation = block.tags.includes("needs-citation");
  const presentation = getBlockPresentation(block);

  return (
    <article id={anchorId} className={presentation.stampClassName}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className={presentation.stampChipClassName}>Block {position}</div>
          {presentation.charlieLabel ? (
            <div className={presentation.stampChipClassName}>
              {presentation.charlieLabel}
            </div>
          ) : null}
        </div>

        <CopyControls
          blockId={block.id}
          anchorId={anchorId}
          title={block.title}
          compact
        />
      </div>

      <h3 className="m-0 mt-4 text-[1.1rem] leading-tight tracking-[-0.02em] text-[#1d1712]">
        <a
          href={`#${anchorId}`}
          className="text-inherit no-underline transition hover:text-[#8f3a00]"
        >
          {block.title}
        </a>
      </h3>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className={presentation.stampChipClassName}>
          {formatLabel(block.voice)}
        </span>
        <span className={presentation.stampChipClassName}>
          {formatLabel(block.type)}
        </span>
        <span className={presentation.stampChipClassName}>
          {formatLabel(block.chapter)}
        </span>
        <span className={presentation.stampChipClassName}>
          {formatLabel(block.status)}
        </span>
        <span className={presentation.stampChipClassName}>
          {block.wordCount} words
        </span>
        {crossChapter ? (
          <span className="inline-flex rounded-full border border-[rgba(255,122,24,0.24)] bg-[rgba(255,122,24,0.12)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#8f3a00]">
            Cross-chapter
          </span>
        ) : null}
        {needsCitation ? (
          <span className="inline-flex rounded-full border border-[rgba(179,42,42,0.24)] bg-[rgba(179,42,42,0.1)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#8c1f1f]">
            Needs citation
          </span>
        ) : null}
        <BlockSizeCue block={block} />
      </div>

      <div className="mt-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.55)]">
          Block ID
        </div>
        <div className="mt-1 break-all font-mono text-sm text-[rgba(38,30,24,0.84)]">
          {block.id}
        </div>
      </div>

      <div className="mt-4">
        <MetadataTagList values={block.tags} />
      </div>

      <div className="mt-4">
        <BookTextPreview block={block} compact />
      </div>

      {showMetadata ? (
        <div className={`mt-4 ${presentation.metadataClassName}`}>
          <div className="space-y-3">
            <MetadataRow label="Source" value={block.source} />
            <MetadataRow
              label="Pairs With"
              value={
                block.pairsWith.length > 0 ? (
                  <MetadataTagList values={block.pairsWith} />
                ) : (
                  <span className="text-[rgba(38,30,24,0.58)]">None</span>
                )
              }
            />
            <MetadataRow
              label="Quote Refs"
              value={
                block.quoteRefs.length > 0 ? (
                  <MetadataTagList values={block.quoteRefs} />
                ) : (
                  <span className="text-[rgba(38,30,24,0.58)]">None</span>
                )
              }
            />
            <MetadataRow
              label="Notes"
              value={
                block.notes ? (
                  block.notes
                ) : (
                  <span className="text-[rgba(38,30,24,0.58)]">None</span>
                )
              }
            />
          </div>
        </div>
      ) : null}
    </article>
  );
}

function EpisodeCard({
  episode,
  showMetadata,
}: {
  episode: EpisodeGroup;
  showMetadata: boolean;
}) {
  const homerBlocks = episode.totalBlocks.filter((block) => block.voice === "homer");
  const firstHomerBlock = homerBlocks[0] ?? null;
  const brainstormScaffold = episode.status === "brainstorm";

  return (
    <section id={`episode-${episode.key}`} className="scroll-mt-6">
      <PaperCard className="min-w-0 px-6 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <PageEyebrow>Episode View</PageEyebrow>
              <PageEyebrow>{formatLabel(episode.status)}</PageEyebrow>
              <PageEyebrow>{episode.key}</PageEyebrow>
              {episode.primaryChapter ? (
                <PageEyebrow>{formatLabel(episode.primaryChapter)}</PageEyebrow>
              ) : null}
            </div>

            <h2 className="m-0 mt-2 text-[1.7rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
              {episode.title}
            </h2>
          </div>

          <div className="grid gap-2 rounded-3xl border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.4)] px-4 py-3 text-sm text-[rgba(38,30,24,0.84)] sm:grid-cols-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.55)]">
                Visible Blocks
              </div>
              <div className="mt-1 font-semibold">
                {episode.visibleBlocks.length}/{episode.totalBlocks.length}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.55)]">
                Total Words
              </div>
              <div className="mt-1 font-semibold">{episode.totalWordCount}</div>
            </div>
          </div>
        </div>

        {episode.missingBlockIds.length > 0 ? (
          <div className="mt-5 rounded-3xl border border-[rgba(179,42,42,0.2)] bg-[rgba(179,42,42,0.08)] px-4 py-4 text-[rgba(94,26,26,0.92)]">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em]">
              Missing arrangement references
            </div>
            <div className="mt-2 text-sm leading-6">
              {episode.missingBlockIds.join(", ")}
            </div>
          </div>
        ) : null}

        {firstHomerBlock ? (
          <div className="mt-5 rounded-[30px] border border-[rgba(96,62,28,0.14)] bg-[rgba(255,248,232,0.52)] px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <PageEyebrow>Book Backbone</PageEyebrow>
              <span className="rounded-full border border-[rgba(96,62,28,0.16)] bg-[rgba(255,255,255,0.5)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6f3f16]">
                Book seed
              </span>
              <span className="rounded-full border border-[rgba(96,62,28,0.16)] bg-[rgba(255,255,255,0.5)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6f3f16]">
                Homer chapter block
              </span>
              {brainstormScaffold ? (
                <span className="rounded-full border border-[rgba(96,62,28,0.16)] bg-[rgba(255,255,255,0.5)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6f3f16]">
                  Brainstorm scaffold
                </span>
              ) : null}
              <BlockSizeCue block={firstHomerBlock} />
            </div>
            <h3 className="m-0 mt-3 text-[1.25rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
              {firstHomerBlock.title}
            </h3>
            <div className="mt-4">
              <BookTextPreview block={firstHomerBlock} />
            </div>
          </div>
        ) : null}

        {episode.visibleBlocks.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.38)] px-4 py-4 text-[rgba(38,30,24,0.76)]">
            No visible blocks in this episode for the current search and filters.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {episode.visibleBlocks.map((block, index) => (
              <EpisodeBlockStamp
                key={`${episode.key}-${block.id}`}
                block={block}
                position={index + 1}
                showMetadata={showMetadata}
                episodeKey={episode.key}
                crossChapter={
                  Boolean(episode.primaryChapter) &&
                  block.chapter !== episode.primaryChapter
                }
              />
            ))}
          </div>
        )}
      </PaperCard>
    </section>
  );
}

function CharlieBookBlock({ block }: { block: LivingManuscriptBlock }) {
  const presentation = getBlockPresentation(block);
  const quoteClassName = `${presentation.cardClassName.replace(
    "px-6 py-8 sm:px-8 sm:py-10",
    "px-5 py-5 my-8",
  )} border-l-4`;

  return (
    <blockquote className={quoteClassName}>
      <div className={presentation.calloutLabelClassName}>
        {presentation.charlieLabel}
      </div>
      <h3 className="m-0 mt-3 text-[1.1rem] leading-tight tracking-[-0.02em] text-[#1d1712]">
        {block.title}
      </h3>
      <div className="mt-4">
        <SourceText body={block.body} tone="charlie" />
      </div>
    </blockquote>
  );
}

function BookChapterView({ chapter }: { chapter: LivingManuscriptBookChapter }) {
  return (
    <section id={`chapter-${chapter.key}`} className="scroll-mt-6">
      <PaperCard className="px-6 py-8 sm:px-8 sm:py-10">
        <PageEyebrow>{formatLabel(chapter.key)}</PageEyebrow>
        <h2 className="m-0 mt-2 text-4xl font-semibold leading-tight tracking-[-0.03em] text-[#1d1712]">
          {chapter.title}
        </h2>
        <div className="mt-8">
          {chapter.blocks.map((block) =>
            block.voice === "homer" ? (
              <SourceText key={block.id} body={block.body} tone="homer" />
            ) : (
              <CharlieBookBlock key={block.id} block={block} />
            ),
          )}
        </div>
      </PaperCard>
    </section>
  );
}

function BookView({ arrangement }: { arrangement: LivingManuscriptBookArrangement }) {
  if (arrangement.chapters.length === 0) {
    return (
      <PaperCard>
        <h2 className="m-0 text-[1.8rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
          No book arrangement data is available.
        </h2>
        <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(38,30,24,0.82)]">
          Book View depends on `book-v1.yml`. The viewer did not find a usable
          arrangement file for this project.
        </p>
        {arrangement.warnings.length > 0 ? (
          <ul className="mb-0 mt-5 space-y-2 text-sm leading-6 text-[rgba(38,30,24,0.78)]">
            {arrangement.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </PaperCard>
    );
  }

  return (
    <div className="space-y-6">
      {arrangement.chapters.map((chapter) => (
        <BookChapterView key={chapter.key} chapter={chapter} />
      ))}
    </div>
  );
}

function ProductionMetric({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.42)] px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.55)]">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold leading-6 text-[rgba(38,30,24,0.86)]">
        {value}
      </div>
    </div>
  );
}

function ProductionList({
  title,
  items,
  emptyLabel = "None recorded.",
}: {
  title: string;
  items: string[];
  emptyLabel?: string;
}) {
  return (
    <div className="rounded-[28px] border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.38)] px-4 py-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.55)]">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="mt-2 text-sm leading-6 text-[rgba(38,30,24,0.66)]">
          {emptyLabel}
        </div>
      ) : (
        <ul className="mb-0 mt-3 space-y-2 pl-5 text-sm leading-6 text-[rgba(38,30,24,0.82)]">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductionWarningList({
  episode,
}: {
  episode: EpisodeProductionEpisode;
}) {
  const warnings = [...episode.warnings, ...episode.sourceWarnings];

  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[28px] border border-[rgba(179,42,42,0.2)] bg-[rgba(179,42,42,0.08)] px-4 py-4 text-[rgba(94,26,26,0.92)]">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em]">
        Warnings
      </div>
      <ul className="mb-0 mt-3 space-y-2 pl-5 text-sm leading-6">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

function getUniqueBlockIds(ids: string[]) {
  const seen = new Set<string>();
  const uniqueIds: string[] = [];

  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    uniqueIds.push(id);
  }

  return uniqueIds;
}

function getDraftSourceBlockIds(
  episode: EpisodeProductionEpisode,
  blockById: Map<string, LivingManuscriptBlock>,
) {
  return getUniqueBlockIds(
    episode.draftSelectedItems
      .map((item) => item.source)
      .filter((source): source is string => Boolean(source && blockById.has(source))),
  );
}

function buildPlaygroundCandidatePool({
  episode,
  arrangement,
  blocks,
  blockById,
}: {
  episode: EpisodeProductionEpisode;
  arrangement: EpisodeGroup | null;
  blocks: LivingManuscriptBlock[];
  blockById: Map<string, LivingManuscriptBlock>;
}) {
  const pool: LivingManuscriptBlock[] = [];
  const seen = new Set<string>();

  function addBlock(block: LivingManuscriptBlock | null | undefined) {
    if (!block || seen.has(block.id)) {
      return;
    }

    seen.add(block.id);
    pool.push(block);
  }

  for (const block of arrangement?.totalBlocks ?? []) {
    addBlock(block);
  }

  for (const blockId of getDraftSourceBlockIds(episode, blockById)) {
    addBlock(blockById.get(blockId));
  }

  for (const block of blocks) {
    if (block.tags.includes(episode.key)) {
      addBlock(block);
    }
  }

  return pool;
}

function getPlaygroundDraftStartIds({
  episode,
  arrangement,
  blockById,
}: {
  episode: EpisodeProductionEpisode;
  arrangement: EpisodeGroup | null;
  blockById: Map<string, LivingManuscriptBlock>;
}) {
  const draftIds = getDraftSourceBlockIds(episode, blockById);

  if (draftIds.length > 0) {
    return draftIds;
  }

  return getUniqueBlockIds((arrangement?.totalBlocks ?? []).map((block) => block.id));
}

function buildArrangementYaml({
  key,
  title,
  blockIds,
}: {
  key: string;
  title: string;
  blockIds: string[];
}) {
  const blockLines =
    blockIds.length > 0
      ? blockIds.map((id) => `    - ${id}`).join("\n")
      : "    # Add block IDs here";

  return `${key}:\n  title: "${title}"\n  status: "draft"\n  blocks:\n${blockLines}\n`;
}

function buildDraftSelectedItemsYaml({
  sequence,
}: {
  sequence: LivingManuscriptBlock[];
}) {
  if (sequence.length === 0) {
    return "draftSelectedItems: []\n";
  }

  const lines = sequence.flatMap((block) => [
    `  - label: "${block.title.replaceAll('"', '\\"')}"`,
    `    kind: "manuscript-block"`,
    `    source: "${block.id}"`,
    `    classification: "${formatLabel(block.voice)} ${formatLabel(block.type)}"`,
    `    notes: "Playground candidate; review before committing to production state."`,
  ]);

  return `draftSelectedItems:\n${lines.join("\n")}\n`;
}

function buildVirtualSplitChecklist(plan: EpisodeVirtualSplitPlan) {
  if (plan.chunks.length === 0) {
    return `# ${plan.episodeKey} story candidate checklist\n\nNo Story Candidates recorded yet.\n`;
  }

  const lines = plan.chunks.flatMap((chunk, index) => [
    `- [ ] ${index + 1}. ${chunk.title}`,
    `  - future block ID: \`${chunk.id}\``,
    `  - source block: \`${chunk.sourceBlockId}\``,
    `  - placement: ${chunk.recommendedPlacement}`,
    `  - recommendation: ${chunk.splitRecommendation}`,
    `  - summary: ${chunk.sourceRangeSummary}`,
  ]);

  return [
    `# ${plan.episodeKey} story candidate checklist`,
    "",
    `Source block: \`${plan.sourceBlockId}\``,
    `Status: ${plan.status}`,
    "",
    ...lines,
    "",
    "Planning only. These Story Candidates are not ManuscriptBlock IDs yet.",
  ].join("\n");
}

function buildVirtualChunkStub(chunk: EpisodeVirtualSplitChunk) {
  return [
    `Proposed future block ID: ${chunk.id}`,
    `Title: ${chunk.title}`,
    `Source block ID: ${chunk.sourceBlockId}`,
    "",
    `Summary: ${chunk.sourceRangeSummary}`,
    `Role: ${chunk.role}`,
    `Recommended placement: ${chunk.recommendedPlacement}`,
    `Split recommendation: ${chunk.splitRecommendation}`,
    `Charlie support opportunity: ${chunk.charlieSupportOpportunity}`,
    `Notes: ${chunk.notes}`,
    "",
    "Warning: this is a Story Candidate planning stub only. No ManuscriptBlock has been created yet.",
  ].join("\n");
}

async function copyText(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function EpisodeProductionEverythingView({
  episode,
  arrangement,
  showMetadata,
}: {
  episode: EpisodeProductionEpisode;
  arrangement: EpisodeGroup | null;
  showMetadata: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ProductionMetric
          label="Arrangement Blocks"
          value={
            arrangement
              ? `${arrangement.totalBlocks.length} blocks`
              : "No matching arrangement"
          }
        />
        <ProductionMetric
          label="Intake References"
          value={`${episode.intakeFileStatuses.length} files`}
        />
        <ProductionMetric
          label="Draft Picks"
          value={`${episode.draftSelectedItems.length} selected`}
        />
        <ProductionMetric
          label="Decisions"
          value={`${episode.unresolvedDecisions.length} unresolved`}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <div className="rounded-[28px] border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.38)] px-4 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.55)]">
              Source / Intake References
            </div>
            <div className="mt-3 space-y-2">
              {episode.intakeFileStatuses.map((reference) => (
                <div
                  key={reference.path}
                  className="rounded-2xl border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.42)] px-3 py-3"
                >
                  <div className="break-all font-mono text-xs text-[rgba(38,30,24,0.82)]">
                    {reference.path}
                  </div>
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.58)]">
                    {reference.exists ? "Found" : "Missing"}
                  </div>
                  {reference.warning ? (
                    <div className="mt-1 text-sm leading-6 text-[rgba(94,26,26,0.9)]">
                      {reference.warning}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <ProductionList
            title="Unresolved Decisions"
            items={episode.unresolvedDecisions}
            emptyLabel="No unresolved decisions recorded for this episode."
          />

          <ProductionWarningList episode={episode} />
        </div>

        <div className="space-y-5">
          <ProductionList
            title="Recording Notes"
            items={episode.recordingNotes}
            emptyLabel="No recording notes have been selected."
          />
          <ProductionList
            title="Show Notes"
            items={episode.showNotes}
            emptyLabel="No public-safe show notes have been selected."
          />
          <ProductionList
            title="Next Action"
            items={[episode.nextAction]}
            emptyLabel="No next action recorded."
          />
        </div>
      </div>

      {arrangement ? (
        <EpisodeCard episode={arrangement} showMetadata={showMetadata} />
      ) : (
        <PaperCard className="px-6 py-8 sm:px-8 sm:py-10">
          <PageEyebrow>Arrangement</PageEyebrow>
          <h3 className="m-0 mt-2 text-[1.45rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
            No matching podcast arrangement yet.
          </h3>
          <p className="mb-0 mt-4 text-sm leading-6 text-[rgba(38,30,24,0.78)]">
            Everything View can still show intake references and decisions. A later
            arrangement pass can replace the broad candidate sequence with a
            precise episode sequence.
          </p>
        </PaperCard>
      )}
    </div>
  );
}

function EpisodeProductionDraftView({
  episode,
  blocks,
}: {
  episode: EpisodeProductionEpisode;
  blocks: LivingManuscriptBlock[];
}) {
  const blockById = useMemo(
    () => new Map(blocks.map((block) => [block.id, block])),
    [blocks],
  );

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.42)] px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.55)]">
              Draft Status
            </div>
            <div className="mt-1 text-lg font-semibold text-[rgba(38,30,24,0.88)]">
              {formatLabel(episode.draftStatus)}
            </div>
          </div>
          <div className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.68)]">
            {episode.draftSelectedItems.length} selected items
          </div>
        </div>
      </div>

      {episode.draftSelectedItems.length === 0 ? (
        <PaperCard className="px-6 py-8 sm:px-8 sm:py-10">
          <h3 className="m-0 text-[1.45rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
            No curated Draft View selections yet.
          </h3>
          <p className="mb-0 mt-4 text-sm leading-6 text-[rgba(38,30,24,0.78)]">
            Use Everything View as the candidate inventory until a human-selected
            sequence is captured in the production state file.
          </p>
        </PaperCard>
      ) : (
        <div className="space-y-4">
          {episode.draftSelectedItems.map((item, index) => {
            const sourceBlock = item.source ? blockById.get(item.source) : null;

            return (
              <article
                key={`${item.label}-${index}`}
                className="rounded-[28px] border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.46)] px-4 py-4 shadow-[0_16px_40px_rgba(25,18,12,0.08)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)]">
                    Draft {index + 1}
                  </span>
                  <span className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)]">
                    {formatLabel(item.kind)}
                  </span>
                  {sourceBlock ? <BlockSizeCue block={sourceBlock} /> : null}
                </div>
                <h3 className="m-0 mt-3 text-[1.25rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
                  {item.label}
                </h3>
                {item.classification ? (
                  <div className="mt-3 text-sm leading-6 text-[rgba(38,30,24,0.78)]">
                    <strong>Classification:</strong> {item.classification}
                  </div>
                ) : null}
                {item.source ? (
                  <div className="mt-3 break-all font-mono text-xs text-[rgba(38,30,24,0.66)]">
                    {item.source}
                  </div>
                ) : null}
                {sourceBlock ? (
                  <div className="mt-4">
                    <BookTextPreview block={sourceBlock} compact />
                  </div>
                ) : null}
                {item.notes ? (
                  <div className="mt-3 rounded-2xl border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.45)] px-3 py-3 text-sm leading-6 text-[rgba(38,30,24,0.78)]">
                    {item.notes}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <ProductionList
          title="Recording Notes"
          items={episode.recordingNotes}
          emptyLabel="No recording notes have been selected."
        />
        <ProductionList
          title="Show Notes"
          items={episode.showNotes}
          emptyLabel="No public-safe show notes have been selected."
        />
      </div>

      <ProductionWarningList episode={episode} />
    </div>
  );
}

function EpisodeProductionPlaygroundView({
  episode,
  arrangement,
  blocks,
  virtualSplitPlan,
}: {
  episode: EpisodeProductionEpisode;
  arrangement: EpisodeGroup | null;
  blocks: LivingManuscriptBlock[];
  virtualSplitPlan: EpisodeVirtualSplitPlan | null;
}) {
  const blockById = useMemo(
    () => new Map(blocks.map((block) => [block.id, block])),
    [blocks],
  );
  const draftStartIds = useMemo(
    () => getPlaygroundDraftStartIds({ episode, arrangement, blockById }),
    [arrangement, blockById, episode],
  );
  const arrangementStartIds = useMemo(
    () => getUniqueBlockIds((arrangement?.totalBlocks ?? []).map((block) => block.id)),
    [arrangement],
  );
  const candidatePool = useMemo(
    () =>
      buildPlaygroundCandidatePool({
        episode,
        arrangement,
        blocks,
        blockById,
      }),
    [arrangement, blockById, blocks, episode],
  );
  const [sequenceIds, setSequenceIds] = useState(() => draftStartIds);
  const [copiedKind, setCopiedKind] = useState<PlaygroundCopyKind | null>(null);
  const sequenceBlocks = sequenceIds
    .map((id) => blockById.get(id))
    .filter((block): block is LivingManuscriptBlock => Boolean(block));
  const sequenceIdSet = new Set(sequenceIds);
  const sequenceWordCount = sequenceBlocks.reduce(
    (total, block) => total + block.wordCount,
    0,
  );
  const playgroundArrangementKey =
    episode.arrangementKeys[0] ? `${episode.arrangementKeys[0]}-playground` : `${episode.key}-playground`;
  const playgroundArrangementTitle = `${episode.title} Playground`;
  const arrangementYaml = buildArrangementYaml({
    key: playgroundArrangementKey,
    title: playgroundArrangementTitle,
    blockIds: sequenceIds,
  });
  const draftSelectedItemsYaml = buildDraftSelectedItemsYaml({
    sequence: sequenceBlocks,
  });
  const virtualSplitChecklist = virtualSplitPlan
    ? buildVirtualSplitChecklist(virtualSplitPlan)
    : "";

  function addBlock(blockId: string) {
    setSequenceIds((current) =>
      current.includes(blockId) ? current : [...current, blockId],
    );
  }

  function removeBlock(blockId: string) {
    setSequenceIds((current) => current.filter((id) => id !== blockId));
  }

  function moveBlock(blockId: string, direction: -1 | 1) {
    setSequenceIds((current) => {
      const index = current.indexOf(blockId);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  async function copyPlaygroundText(kind: PlaygroundCopyKind, value: string) {
    const copied = await copyText(value);

    if (copied) {
      setCopiedKind(kind);
      window.setTimeout(() => setCopiedKind(null), 1400);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.42)] px-4 py-4">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-start">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.55)]">
              Non-Canonical Playground
            </div>
            <h3 className="m-0 mt-2 text-[1.35rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
              Try the shape before committing the shape.
            </h3>
            <p className="mb-0 mt-3 max-w-[760px] text-sm leading-6 text-[rgba(38,30,24,0.78)]">
              Book text is the backbone. Arrange Homer first, then layer Charlie
              support, clips, and discussion. Playground lets you test block order
              in the browser only; it does not save canonical files. Split large
              Homer sections only after review.
            </p>
          </div>

          <div className="grid gap-2 rounded-3xl border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.45)] px-4 py-3 text-sm text-[rgba(38,30,24,0.84)] sm:grid-cols-3 xl:min-w-[360px]">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.55)]">
                Pool
              </div>
              <div className="mt-1 font-semibold">{candidatePool.length} blocks</div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.55)]">
                Sequence
              </div>
              <div className="mt-1 font-semibold">{sequenceBlocks.length} blocks</div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.55)]">
                Words
              </div>
              <div className="mt-1 font-semibold">{sequenceWordCount}</div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSequenceIds(draftStartIds)}
            className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[#8f3a00]"
          >
            Reset from Draft
          </button>
          <button
            type="button"
            onClick={() => setSequenceIds(arrangementStartIds)}
            disabled={arrangementStartIds.length === 0}
            className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[#8f3a00] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Reset from Arrangement
          </button>
          <button
            type="button"
            onClick={() => setSequenceIds([])}
            className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[#8f3a00]"
          >
            Clear Playground
          </button>
          <button
            type="button"
            onClick={() => copyPlaygroundText("arrangement", arrangementYaml)}
            className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[#8f3a00]"
          >
            {copiedKind === "arrangement"
              ? "Copied Arrangement"
              : "Copy arrangement YAML"}
          </button>
          <button
            type="button"
            onClick={() => copyPlaygroundText("draft", draftSelectedItemsYaml)}
            className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[#8f3a00]"
          >
            {copiedKind === "draft"
              ? "Copied Draft Items"
              : "Copy draftSelectedItems YAML"}
          </button>
          {virtualSplitPlan ? (
            <button
              type="button"
              onClick={() =>
                copyPlaygroundText("story-checklist", virtualSplitChecklist)
              }
              className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[#8f3a00]"
            >
              {copiedKind === "story-checklist"
                ? "Copied Story Checklist"
                : "Copy story checklist"}
            </button>
          ) : null}
        </div>
      </div>

      {virtualSplitPlan ? (
        <section className="space-y-4 rounded-[32px] border border-[rgba(96,62,28,0.14)] bg-[rgba(255,248,232,0.5)] px-4 py-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <PageEyebrow>Story Candidate Plan</PageEyebrow>
              <h3 className="m-0 mt-2 text-[1.35rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
                Movable story units to test before touching the manuscript.
              </h3>
              <p className="mb-0 mt-2 max-w-[760px] text-sm leading-6 text-[rgba(38,30,24,0.76)]">
                Story Candidates sit between giant chapter blocks and tiny
                paragraphs. They are not manuscript blocks and cannot be added
                to the canonical sequence until a later approved split pass.
              </p>
            </div>

            <div className="rounded-3xl border border-[rgba(96,62,28,0.14)] bg-[rgba(255,255,255,0.5)] px-4 py-3 text-sm text-[rgba(38,30,24,0.8)]">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.55)]">
                Source Block
              </div>
              <div className="mt-1 break-all font-mono text-xs">
                {virtualSplitPlan.sourceBlockId}
              </div>
              <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.55)]">
                {virtualSplitPlan.chunks.length} story candidates ·{" "}
                {formatLabel(virtualSplitPlan.status)}
              </div>
            </div>
          </div>

          {virtualSplitPlan.sourceWarnings.length > 0 ? (
            <div className="rounded-[24px] border border-[rgba(179,42,42,0.2)] bg-[rgba(179,42,42,0.08)] px-4 py-4 text-sm leading-6 text-[rgba(94,26,26,0.9)]">
              {virtualSplitPlan.sourceWarnings.join(" ")}
            </div>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-2">
            {virtualSplitPlan.chunks.map((chunk, index) => {
              const stubKind: PlaygroundCopyKind = `stub:${chunk.id}`;

              return (
                <article
                  key={chunk.id}
                  className="rounded-[28px] border border-[rgba(96,62,28,0.14)] bg-[rgba(255,255,255,0.55)] px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-[rgba(96,62,28,0.16)] bg-[rgba(255,248,232,0.7)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6f3f16]">
                          Story candidate
                        </span>
                        <span className="rounded-full border border-[rgba(96,62,28,0.16)] bg-[rgba(255,248,232,0.7)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6f3f16]">
                          Not a manuscript block
                        </span>
                        <span className="rounded-full border border-[rgba(96,62,28,0.16)] bg-[rgba(255,248,232,0.7)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6f3f16]">
                          Planning only
                        </span>
                      </div>
                      <h4 className="m-0 mt-3 text-[1.12rem] leading-tight tracking-[-0.02em] text-[#1d1712]">
                        {index + 1}. {chunk.title}
                      </h4>
                      <div className="mt-2 break-all font-mono text-xs text-[rgba(38,30,24,0.62)]">
                        {chunk.id}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        copyPlaygroundText(stubKind, buildVirtualChunkStub(chunk))
                      }
                      className="shrink-0 rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.6)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[#8f3a00]"
                    >
                      {copiedKind === stubKind
                        ? "Copied Stub"
                        : "Copy future story block stub"}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm leading-6 text-[rgba(38,30,24,0.78)]">
                    <MetadataRow label="Source" value={<code>{chunk.sourceBlockId}</code>} />
                    <MetadataRow label="Range" value={chunk.sourceRangeSummary} />
                    <MetadataRow label="Role" value={chunk.role} />
                    <MetadataRow label="Placement" value={chunk.recommendedPlacement} />
                    <MetadataRow
                      label="Split"
                      value={formatLabel(chunk.splitRecommendation)}
                    />
                    <MetadataRow
                      label="Charlie Fit"
                      value={chunk.charlieSupportOpportunity}
                    />
                    <MetadataRow label="Notes" value={chunk.notes} />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-4">
          <div>
            <PageEyebrow>Candidate Pool</PageEyebrow>
            <h3 className="m-0 mt-2 text-[1.35rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
              Useful first-pass pieces
            </h3>
            <p className="mb-0 mt-2 text-sm leading-6 text-[rgba(38,30,24,0.72)]">
              Pool includes matched arrangement blocks, draft item block sources,
              and manuscript blocks tagged `{episode.key}`.
            </p>
          </div>

          {candidatePool.length === 0 ? (
            <div className="rounded-[28px] border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.4)] px-4 py-4 text-sm leading-6 text-[rgba(38,30,24,0.72)]">
              No candidate blocks found for this episode yet.
            </div>
          ) : (
            <div className="space-y-3">
              {candidatePool.map((block) => {
                const alreadyAdded = sequenceIdSet.has(block.id);
                const primaryMaterial = block.voice === "homer";

                return (
                  <article
                    key={block.id}
                    className={[
                      "rounded-[28px] border px-4 py-4",
                      primaryMaterial
                        ? "border-[rgba(96,62,28,0.16)] bg-[rgba(255,248,232,0.56)] shadow-[0_16px_40px_rgba(96,62,28,0.08)]"
                        : "border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.46)]",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap gap-2">
                          {primaryMaterial ? (
                            <span className="rounded-full border border-[rgba(96,62,28,0.16)] bg-[rgba(255,255,255,0.5)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6f3f16]">
                              Book backbone
                            </span>
                          ) : (
                            <span className="rounded-full border border-[rgba(126,78,52,0.16)] bg-[rgba(210,124,84,0.1)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a4528]">
                              Support layer
                            </span>
                          )}
                          <BlockSizeCue block={block} />
                        </div>
                        <h4 className="m-0 text-[1.05rem] leading-tight tracking-[-0.02em] text-[#1d1712]">
                          {block.title}
                        </h4>
                        <div className="mt-2 break-all font-mono text-xs text-[rgba(38,30,24,0.62)]">
                          {block.id}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => addBlock(block.id)}
                        disabled={alreadyAdded}
                        className="shrink-0 rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[#8f3a00] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {alreadyAdded ? "Added" : "Add"}
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)]">
                        {formatLabel(block.voice)}
                      </span>
                      <span className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)]">
                        {formatLabel(block.type)}
                      </span>
                      <span className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)]">
                        {formatLabel(block.status)}
                      </span>
                      <span className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)]">
                        {block.wordCount} words
                      </span>
                    </div>

                    <div className="mt-3">
                      <MetadataTagList values={block.tags} />
                    </div>

                    <div className="mt-4">
                      <BookTextPreview block={block} compact />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <PageEyebrow>Playground Sequence</PageEyebrow>
            <h3 className="m-0 mt-2 text-[1.35rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
              Browser-only test order
            </h3>
            <p className="mb-0 mt-2 text-sm leading-6 text-[rgba(38,30,24,0.72)]">
              Move, remove, and copy a possible next arrangement. Copying only puts
              text on your clipboard; it does not update any source file.
            </p>
          </div>

          {sequenceBlocks.length === 0 ? (
            <div className="rounded-[28px] border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.4)] px-4 py-4 text-sm leading-6 text-[rgba(38,30,24,0.72)]">
              Playground is empty. Add blocks from the candidate pool or reset from
              Draft/Arrangement.
            </div>
          ) : (
            <div className="space-y-3">
              {sequenceBlocks.map((block, index) => (
                <article
                  key={`${block.id}-${index}`}
                  className={[
                    "rounded-[28px] border px-4 py-4 shadow-[0_16px_40px_rgba(25,18,12,0.08)]",
                    block.voice === "homer"
                      ? "border-[rgba(96,62,28,0.16)] bg-[rgba(255,248,232,0.6)]"
                      : "border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.52)]",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)]">
                        Sequence {index + 1}
                      </div>
                      <h4 className="m-0 mt-3 text-[1.05rem] leading-tight tracking-[-0.02em] text-[#1d1712]">
                        {block.title}
                      </h4>
                      <div className="mt-2 break-all font-mono text-xs text-[rgba(38,30,24,0.62)]">
                        {block.id}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => moveBlock(block.id, -1)}
                        disabled={index === 0}
                        className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[#8f3a00] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Move Up
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBlock(block.id, 1)}
                        disabled={index === sequenceBlocks.length - 1}
                        className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[#8f3a00] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Move Down
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBlock(block.id)}
                        className="rounded-full border border-[rgba(179,42,42,0.16)] bg-[rgba(179,42,42,0.08)] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(94,26,26,0.86)] transition hover:border-[rgba(179,42,42,0.32)]"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {block.voice === "homer" ? (
                      <span className="rounded-full border border-[rgba(96,62,28,0.16)] bg-[rgba(255,255,255,0.5)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6f3f16]">
                        Book backbone
                      </span>
                    ) : (
                      <span className="rounded-full border border-[rgba(126,78,52,0.16)] bg-[rgba(210,124,84,0.1)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a4528]">
                        Support layer
                      </span>
                    )}
                    <span className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)]">
                      {formatLabel(block.voice)}
                    </span>
                    <span className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)]">
                      {formatLabel(block.type)}
                    </span>
                    <span className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)]">
                      {block.wordCount} words
                    </span>
                    <BlockSizeCue block={block} />
                  </div>

                  <div className="mt-4">
                    <BookTextPreview block={block} compact />
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EpisodeProductionCockpit({
  panel,
  viewMode,
  showMetadata,
  blocks,
}: {
  panel: EpisodeProductionPanel;
  viewMode: EpisodeViewMode;
  showMetadata: boolean;
  blocks: LivingManuscriptBlock[];
}) {
  const { production, arrangement } = panel;
  const homerAnchor =
    arrangement?.totalBlocks.find((block) => block.voice === "homer") ?? null;

  return (
    <PaperCard className="px-6 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <PageEyebrow>Episode Production</PageEyebrow>
            <PageEyebrow>{production.lifecycleStatus}</PageEyebrow>
            <PageEyebrow>{production.key}</PageEyebrow>
            {production.publicSlug ? (
              <PageEyebrow>{production.publicSlug}</PageEyebrow>
            ) : null}
          </div>

          <h2 className="m-0 mt-2 text-[1.9rem] leading-tight tracking-[-0.04em] text-[#1d1712]">
            Episode {production.episodeNumber ?? "?"}: {production.title}
          </h2>
          <p className="mb-0 mt-3 max-w-[780px] text-sm leading-6 text-[rgba(38,30,24,0.78)]">
            Everything View shows source references, unresolved decisions, warnings,
            and the current arrangement snapshot. Draft View shows the selected
            read-only sequence stored in `season-one.yml`. Playground is a
            browser-only test bench for trying sequence changes before committing
            them anywhere.
          </p>
        </div>

        <div className="grid min-w-[260px] gap-3 text-sm text-[rgba(38,30,24,0.84)] sm:grid-cols-2 lg:grid-cols-1">
          <ProductionMetric label="Recording" value={production.recordingStatus} />
          <ProductionMetric label="Confidence" value={production.sourceConfidence} />
          <ProductionMetric
            label="Unresolved"
            value={`${production.unresolvedDecisions.length} decisions`}
          />
          <ProductionMetric
            label="Warnings"
            value={`${production.warnings.length + production.sourceWarnings.length} warnings`}
          />
        </div>
      </div>

      {homerAnchor ? (
        <div className="mt-6 rounded-[30px] border border-[rgba(96,62,28,0.14)] bg-[rgba(255,248,232,0.52)] px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <PageEyebrow>Book Backbone</PageEyebrow>
            <span className="rounded-full border border-[rgba(96,62,28,0.16)] bg-[rgba(255,255,255,0.5)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6f3f16]">
              Arrange Homer first
            </span>
            {production.lifecycleStatus === "Brainstorm" ? (
              <span className="rounded-full border border-[rgba(96,62,28,0.16)] bg-[rgba(255,255,255,0.5)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6f3f16]">
                Brainstorm scaffold
              </span>
            ) : null}
            <BlockSizeCue block={homerAnchor} />
          </div>
          <h3 className="m-0 mt-3 text-[1.35rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
            {homerAnchor.title}
          </h3>
          <div className="mt-4">
            <BookTextPreview block={homerAnchor} />
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        {viewMode === "everything" ? (
          <EpisodeProductionEverythingView
            episode={production}
            arrangement={arrangement}
            showMetadata={showMetadata}
          />
        ) : viewMode === "draft" ? (
          <EpisodeProductionDraftView episode={production} blocks={blocks} />
        ) : (
          <EpisodeProductionPlaygroundView
            key={production.key}
            episode={production}
            arrangement={arrangement}
            blocks={blocks}
            virtualSplitPlan={panel.virtualSplitPlan}
          />
        )}
      </div>
    </PaperCard>
  );
}

export default function LivingManuscriptViewerClient({
  manuscript,
  bookArrangement,
  podcastArrangement,
  episodeProductionState,
  episodeVirtualSplitState,
}: ViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("book");
  const [episodeViewMode, setEpisodeViewMode] =
    useState<EpisodeViewMode>("everything");
  const [selectedProductionEpisodeKey, setSelectedProductionEpisodeKey] = useState(
    episodeProductionState.episodes[4]?.key ??
      episodeProductionState.episodes[0]?.key ??
      "",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showMetadata, setShowMetadata] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);

  const filterOptions = useMemo(() => {
    const chapters = new Set<string>();
    const voices = new Set<string>();
    const statuses = new Set<string>();
    const types = new Set<string>();
    const tags = new Set<string>();

    for (const block of manuscript.blocks) {
      chapters.add(block.chapter);
      voices.add(block.voice);
      statuses.add(block.status);
      types.add(block.type);
      for (const tag of block.tags) {
        tags.add(tag);
      }
    }

    return {
      chapters: Array.from(chapters),
      voices: Array.from(voices),
      statuses: Array.from(statuses),
      types: Array.from(types),
      tags: Array.from(tags).sort((left, right) => left.localeCompare(right)),
    };
  }, [manuscript.blocks]);

  const normalizedSearch = useMemo(() => normalizeSearch(searchQuery), [searchQuery]);

  const filteredBlocks = useMemo(() => {
    return manuscript.blocks.filter((block) => {
      if (filters.chapters.length > 0 && !filters.chapters.includes(block.chapter)) {
        return false;
      }

      if (filters.voices.length > 0 && !filters.voices.includes(block.voice)) {
        return false;
      }

      if (filters.statuses.length > 0 && !filters.statuses.includes(block.status)) {
        return false;
      }

      if (filters.types.length > 0 && !filters.types.includes(block.type)) {
        return false;
      }

      if (
        filters.tags.length > 0 &&
        !block.tags.some((tag) => filters.tags.includes(tag))
      ) {
        return false;
      }

      if (normalizedSearch) {
        const searchTarget = [
          block.id,
          block.title,
          block.body,
          block.tags.join(" "),
          block.type,
          block.voice,
          block.status,
          block.chapter,
        ]
          .join(" ")
          .toLowerCase();

        if (!searchTarget.includes(normalizedSearch)) {
          return false;
        }
      }

      return true;
    });
  }, [filters, manuscript.blocks, normalizedSearch]);

  const filteredBlockIds = useMemo(
    () => new Set(filteredBlocks.map((block) => block.id)),
    [filteredBlocks],
  );

  const chapterGroups = useMemo<ChapterGroup[]>(() => {
    return filterOptions.chapters.map((chapter) => ({
      key: `chapter:${chapter}`,
      label: formatLabel(chapter),
      totalBlocks: manuscript.blocks.filter((block) => block.chapter === chapter),
      visibleBlocks: filteredBlocks.filter((block) => block.chapter === chapter),
    }));
  }, [filterOptions.chapters, filteredBlocks, manuscript.blocks]);

  const episodeGroups = useMemo<EpisodeGroup[]>(() => {
    return podcastArrangement.episodes.map((episode) => ({
      key: `episode:${episode.key}`,
      arrangementKey: episode.key,
      title: episode.title,
      status: episode.status,
      totalBlocks: episode.blocks,
      visibleBlocks: episode.blocks.filter((block) => filteredBlockIds.has(block.id)),
      missingBlockIds: episode.missingBlockIds,
      warnings: episode.warnings,
      primaryChapter: episode.primaryChapter,
      totalWordCount: episode.totalWordCount,
    }));
  }, [filteredBlockIds, podcastArrangement.episodes]);

  const productionEpisodePanels = useMemo<EpisodeProductionPanel[]>(() => {
    const arrangementByKey = new Map(
      episodeGroups.map((episode) => [episode.arrangementKey, episode]),
    );
    const virtualSplitByEpisodeKey = new Map(
      episodeVirtualSplitState.episodes.map((episode) => [
        episode.episodeKey,
        episode,
      ]),
    );

    return episodeProductionState.episodes.map((production) => {
      const arrangement =
        production.arrangementKeys
          .map((key) => arrangementByKey.get(key))
          .find((episode): episode is EpisodeGroup => Boolean(episode)) ?? null;

      return {
        production,
        arrangement,
        virtualSplitPlan: virtualSplitByEpisodeKey.get(production.key) ?? null,
      };
    });
  }, [episodeGroups, episodeProductionState.episodes, episodeVirtualSplitState.episodes]);

  const selectedProductionPanel =
    productionEpisodePanels.find(
      (panel) => panel.production.key === selectedProductionEpisodeKey,
    ) ??
    productionEpisodePanels[0] ??
    null;

  const activeFilterCount =
    filters.chapters.length +
    filters.voices.length +
    filters.statuses.length +
    filters.types.length +
    filters.tags.length +
    (normalizedSearch ? 1 : 0);

  function resetFilters() {
    setSearchQuery("");
    setFilters(EMPTY_FILTERS);
  }

  function toggleGroup(groupKey: string) {
    setCollapsedGroups((current) => toggleValue(current, groupKey));
  }

  function applyPreset(preset: ViewerPreset) {
    setSearchQuery("");

    switch (preset) {
      case "show-all":
        setFilters(EMPTY_FILTERS);
        break;
      case "homer-only":
        setFilters({ ...EMPTY_FILTERS, voices: ["homer"] });
        break;
      case "charlie-only":
        setFilters({ ...EMPTY_FILTERS, voices: ["charlie"] });
        break;
      case "needs-citation":
        setFilters({ ...EMPTY_FILTERS, tags: ["needs-citation"] });
        break;
      case "episode-4":
        setFilters({ ...EMPTY_FILTERS, tags: ["episode-04"] });
        break;
    }
  }

  return (
    <div className="space-y-6">
      <GlassPanel className="p-5 text-[var(--text-light)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <PageEyebrow>Viewer Mode</PageEyebrow>
            <h2 className="m-0 text-[1.4rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
              Book, Story, and Episode Views
            </h2>
            <p className="mb-0 mt-3 max-w-[760px] text-sm leading-6 text-[rgba(245,239,230,0.82)]">
              Book View provides a seamless reading experience. Story View shows modular
              manuscript blocks. Episode View now adds a read-only production cockpit
              over the arrangement and episode state files.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <ViewModeButton
              label="Book View"
              active={viewMode === "book"}
              onClick={() => setViewMode("book")}
            />
            <ViewModeButton
              label="Story View"
              active={viewMode === "story"}
              onClick={() => setViewMode("story")}
            />
            <ViewModeButton
              label="Episode View"
              active={viewMode === "episode"}
              onClick={() => setViewMode("episode")}
            />
          </div>
        </div>
        {viewMode === "episode" ? (
          <div className="mt-4 border-t border-white/10 pt-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
              Episode Display Mode
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <PresetButton
                label="Everything"
                active={episodeViewMode === "everything"}
                onClick={() => setEpisodeViewMode("everything")}
              />
              <PresetButton
                label="Draft"
                active={episodeViewMode === "draft"}
                onClick={() => setEpisodeViewMode("draft")}
              />
              <PresetButton
                label="Playground"
                active={episodeViewMode === "playground"}
                onClick={() => setEpisodeViewMode("playground")}
              />
            </div>
          </div>
        ) : null}
      </GlassPanel>

      <div
        className={
          viewMode === "book"
            ? "grid gap-6"
            : "grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]"
        }
      >
        {viewMode !== "book" ? (
          <aside className="space-y-6 xl:self-start">
            <GlassPanel className="p-5 text-[var(--text-light)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <PageEyebrow>Viewer Controls</PageEyebrow>
                  <h2 className="m-0 text-[1.4rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                    {viewMode === "episode"
                      ? "Episode Arrangement Filters"
                      : "Manuscript Filters"}
                  </h2>
                </div>

              <button
                type="button"
                onClick={resetFilters}
                className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-[var(--text-light)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
              >
                Clear filters
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                  Visible Blocks
                </div>
                <div className="mt-1 text-lg font-semibold text-[rgba(245,239,230,0.96)]">
                  {filteredBlocks.length}
                </div>
                <div className="mt-1 text-xs text-[rgba(245,239,230,0.62)]">
                  of {manuscript.blocks.length} total
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                  Search
                </div>
                <div className="mt-1 text-lg font-semibold text-[rgba(245,239,230,0.96)]">
                  {normalizedSearch ? "Active" : "Off"}
                </div>
                <div className="mt-1 text-xs text-[rgba(245,239,230,0.62)]">
                  {normalizedSearch ? `“${searchQuery.trim()}”` : "No text filter"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                  Active Filters
                </div>
                <div className="mt-1 text-lg font-semibold text-[rgba(245,239,230,0.96)]">
                  {activeFilterCount}
                </div>
                <div className="mt-1 text-xs text-[rgba(245,239,230,0.62)]">
                  search + metadata filters
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
              <label className="block">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                  Search Manuscript
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search title, id, tags, or body text"
                  className="mt-3 w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.45)] focus:border-[rgba(255,122,24,0.35)]"
                />
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                Quick Presets
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <PresetButton
                  label="Show all"
                  active={matchesPreset("show-all", filters, normalizedSearch)}
                  onClick={() => applyPreset("show-all")}
                />
                <PresetButton
                  label="Homer only"
                  active={matchesPreset("homer-only", filters, normalizedSearch)}
                  onClick={() => applyPreset("homer-only")}
                />
                <PresetButton
                  label="Charlie only"
                  active={matchesPreset("charlie-only", filters, normalizedSearch)}
                  onClick={() => applyPreset("charlie-only")}
                />
                <PresetButton
                  label="Needs citation"
                  active={matchesPreset("needs-citation", filters, normalizedSearch)}
                  onClick={() => applyPreset("needs-citation")}
                />
                <PresetButton
                  label="Episode 4"
                  active={matchesPreset("episode-4", filters, normalizedSearch)}
                  onClick={() => applyPreset("episode-4")}
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                  Metadata
                </div>
                <div className="mt-1 text-sm text-[rgba(245,239,230,0.9)]">
                  {showMetadata
                    ? "Showing detailed block metadata panels"
                    : "Showing compact content-first summaries"}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowMetadata((current) => !current)}
                className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-[var(--text-light)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
              >
                {showMetadata ? "Hide metadata" : "Show metadata"}
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                  Chapter
                </div>
                <div className="space-y-2">
                  {filterOptions.chapters.map((chapter) => (
                    <FilterCheckbox
                      key={chapter}
                      label={formatLabel(chapter)}
                      checked={filters.chapters.includes(chapter)}
                      onChange={() =>
                        setFilters((current) => ({
                          ...current,
                          chapters: toggleValue(current.chapters, chapter),
                        }))
                      }
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                  Voice
                </div>
                <div className="space-y-2">
                  {filterOptions.voices.map((voice) => (
                    <FilterCheckbox
                      key={voice}
                      label={formatLabel(voice)}
                      checked={filters.voices.includes(voice)}
                      onChange={() =>
                        setFilters((current) => ({
                          ...current,
                          voices: toggleValue(current.voices, voice),
                        }))
                      }
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                  Status
                </div>
                <div className="space-y-2">
                  {filterOptions.statuses.map((status) => (
                    <FilterCheckbox
                      key={status}
                      label={formatLabel(status)}
                      checked={filters.statuses.includes(status)}
                      onChange={() =>
                        setFilters((current) => ({
                          ...current,
                          statuses: toggleValue(current.statuses, status),
                        }))
                      }
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                  Type
                </div>
                <div className="space-y-2">
                  {filterOptions.types.map((type) => (
                    <FilterCheckbox
                      key={type}
                      label={formatLabel(type)}
                      checked={filters.types.includes(type)}
                      onChange={() =>
                        setFilters((current) => ({
                          ...current,
                          types: toggleValue(current.types, type),
                        }))
                      }
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                  Tags
                </div>
                <div className="space-y-2">
                  {filterOptions.tags.map((tag) => (
                    <FilterCheckbox
                      key={tag}
                      label={formatLabel(tag)}
                      checked={filters.tags.includes(tag)}
                      onChange={() =>
                        setFilters((current) => ({
                          ...current,
                          tags: toggleValue(current.tags, tag),
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="p-5 text-[var(--text-light)]">
            <PageEyebrow>
              {viewMode === "story" ? "Chapters" : "Production"}
            </PageEyebrow>
            <h2 className="m-0 text-[1.3rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
              {viewMode === "story" ? "Chapter Groups" : "Season One Episodes"}
            </h2>
            <p className="mb-0 mt-3 text-sm leading-6 text-[rgba(245,239,230,0.82)]">
              {viewMode === "story"
                ? "Chapter groups show visible manuscript blocks against each chapter total."
                : "Episode state shows lifecycle status, draft selections, source confidence, and unresolved decisions."}
            </p>

            <div className="mt-5 space-y-3">
              {viewMode === "story"
                ? chapterGroups.map((group) => {
                    const collapsed = collapsedGroups.includes(group.key);

                    return (
                      <div
                        key={group.key}
                        className="rounded-2xl border border-white/10 bg-white/6 p-3"
                      >
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.key)}
                          className="flex w-full items-center justify-between gap-3 text-left text-[rgba(245,239,230,0.96)]"
                        >
                          <span className="text-sm font-semibold">{group.label}</span>
                          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                            {group.visibleBlocks.length}/{group.totalBlocks.length}
                          </span>
                        </button>

                        {!collapsed ? (
                          <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
                            {group.visibleBlocks.length === 0 ? (
                              <div className="rounded-2xl border border-white/8 bg-white/4 px-3 py-2 text-sm text-[rgba(245,239,230,0.66)]">
                                No visible blocks in this chapter.
                              </div>
                            ) : (
                              group.visibleBlocks.map((block) => (
                                <a
                                  key={block.id}
                                  href={`#${block.id}`}
                                  className={getBlockPresentation(block).sidebarLinkClassName}
                                >
                                  <div className="font-semibold">{block.title}</div>
                                  <div
                                    className={getBlockPresentation(block).sidebarMetaClassName}
                                  >
                                    {formatLabel(block.type)} · {formatLabel(block.voice)}
                                  </div>
                                </a>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                : productionEpisodePanels.map((panel) => {
                    const { production, arrangement } = panel;
                    const active =
                      selectedProductionPanel?.production.key === production.key;
                    const warningCount =
                      production.warnings.length + production.sourceWarnings.length;
                    const homerAnchor =
                      arrangement?.totalBlocks.find((block) => block.voice === "homer") ??
                      null;

                    return (
                      <button
                        key={production.key}
                        type="button"
                        onClick={() =>
                          setSelectedProductionEpisodeKey(production.key)
                        }
                        className={[
                          "block w-full rounded-2xl border p-3 text-left transition",
                          active
                            ? "border-flare/35 bg-flare/12 text-[rgba(245,239,230,0.98)]"
                            : "border-white/10 bg-white/6 text-[rgba(245,239,230,0.9)] hover:border-[rgba(255,122,24,0.28)] hover:bg-white/8",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">
                              {production.episodeNumber
                                ? `Episode ${production.episodeNumber}: `
                                : ""}
                              {production.title}
                            </div>
                            <div className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[rgba(245,239,230,0.62)]">
                              {production.lifecycleStatus} ·{" "}
                              {formatLabel(production.sourceConfidence)}
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full border border-white/10 bg-white/8 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                            {production.unresolvedDecisions.length}
                          </span>
                        </div>

                        <div className="mt-3 grid gap-2 text-[11px] uppercase tracking-[0.08em] text-[rgba(245,239,230,0.64)]">
                          <div>
                            Draft: {formatLabel(production.draftStatus)}
                          </div>
                          <div>
                            Arrangement:{" "}
                            {arrangement
                              ? arrangement.arrangementKey
                              : "not matched"}
                          </div>
                          <div>
                            {production.draftSelectedItems.length} draft items ·{" "}
                            {warningCount} warnings
                          </div>
                        </div>

                        {homerAnchor ? (
                          <div className="mt-3 border-t border-white/8 pt-3">
                            <div className="flex flex-wrap gap-2">
                              <span className="rounded-full border border-white/10 bg-white/8 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                                Book seed
                              </span>
                              {production.lifecycleStatus === "Brainstorm" ? (
                                <span className="rounded-full border border-white/10 bg-white/8 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                                  Needs split review
                                </span>
                              ) : null}
                              <BlockSizeCue block={homerAnchor} />
                            </div>
                            <div className="mt-2 text-sm font-semibold leading-5 text-[rgba(245,239,230,0.94)]">
                              {homerAnchor.title}
                            </div>
                            <div className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[rgba(245,239,230,0.62)]">
                              {homerAnchor.wordCount} words · Homer chapter block
                            </div>
                            <BookTextSnippet block={homerAnchor} />
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
            </div>
          </GlassPanel>
        </aside>
      ) : null}

      <div className="space-y-6">
          {viewMode === "book" ? (
            <BookView arrangement={bookArrangement} />
          ) : viewMode === "story" ? (
            filteredBlocks.length === 0 ? (
              <PaperCard>
                <h2 className="m-0 text-[1.8rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
                  No blocks match the current search and filters.
                </h2>
                <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(38,30,24,0.82)]">
                  Nothing is wrong with the manuscript. The current search text or
                  metadata filters are simply narrowing the view to zero blocks.
                </p>
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.45)] px-4 py-2 text-sm font-semibold text-[rgba(38,30,24,0.82)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[#8f3a00]"
                  >
                    Clear filters and search
                  </button>
                </div>
              </PaperCard>
            ) : (
              filteredBlocks.map((block) => (
                <BlockCard key={block.id} block={block} showMetadata={showMetadata} />
              ))
            )
          ) : podcastArrangement.episodes.length === 0 &&
            productionEpisodePanels.length === 0 ? (
            <PaperCard>
              <h2 className="m-0 text-[1.8rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
                No episode production data is available.
              </h2>
              <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(38,30,24,0.82)]">
                Episode View can read `episode-production/season-one.yml` and
                `podcast-season-1.yml`. The viewer did not find usable production
                or arrangement data for this project.
              </p>
              {[
                ...podcastArrangement.warnings,
                ...episodeProductionState.warnings,
              ].length > 0 ? (
                <ul className="mb-0 mt-5 space-y-2 text-sm leading-6 text-[rgba(38,30,24,0.78)]">
                  {[...podcastArrangement.warnings, ...episodeProductionState.warnings].map(
                    (warning) => (
                      <li key={warning}>{warning}</li>
                    ),
                  )}
                </ul>
              ) : null}
            </PaperCard>
          ) : (
            <>
              {podcastArrangement.warnings.length > 0 ? (
                <PaperCard>
                  <h2 className="m-0 text-[1.5rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
                    Podcast arrangement warnings
                  </h2>
                  <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(38,30,24,0.82)]">
                    The episode arrangement loaded, but some references need attention.
                  </p>
                  <ul className="mb-0 mt-5 space-y-2 text-sm leading-6 text-[rgba(38,30,24,0.78)]">
                    {podcastArrangement.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </PaperCard>
              ) : null}

              {episodeProductionState.warnings.length > 0 ? (
                <PaperCard>
                  <h2 className="m-0 text-[1.5rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
                    Episode production state warnings
                  </h2>
                  <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(38,30,24,0.82)]">
                    The production state loaded, but some source references need
                    attention.
                  </p>
                  <ul className="mb-0 mt-5 space-y-2 text-sm leading-6 text-[rgba(38,30,24,0.78)]">
                    {episodeProductionState.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </PaperCard>
              ) : null}

              {selectedProductionPanel ? (
                <EpisodeProductionCockpit
                  panel={selectedProductionPanel}
                  viewMode={episodeViewMode}
                  showMetadata={showMetadata}
                  blocks={manuscript.blocks}
                />
              ) : episodeGroups.length > 0 ? (
                episodeGroups.map((episode) => (
                  <EpisodeCard
                    key={episode.key}
                    episode={episode}
                    showMetadata={showMetadata}
                  />
                ))
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
