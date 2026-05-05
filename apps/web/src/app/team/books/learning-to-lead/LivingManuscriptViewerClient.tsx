"use client";

import { useMemo, useState } from "react";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import PaperCard from "@/components/ui/PaperCard";
import type {
  LivingManuscriptBlock,
  LivingManuscriptDocument,
  LivingManuscriptPodcastArrangement,
} from "@/lib/server/living-manuscript";

type ViewerProps = {
  manuscript: LivingManuscriptDocument;
  podcastArrangement: LivingManuscriptPodcastArrangement;
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

type ViewMode = "book" | "episode";

type ChapterGroup = {
  key: string;
  label: string;
  totalBlocks: LivingManuscriptBlock[];
  visibleBlocks: LivingManuscriptBlock[];
};

type EpisodeGroup = {
  key: string;
  title: string;
  status: string;
  totalBlocks: LivingManuscriptBlock[];
  visibleBlocks: LivingManuscriptBlock[];
  missingBlockIds: string[];
  warnings: string[];
  primaryChapter: string | null;
  totalWordCount: number;
};

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

function SourceText({ body }: { body: string }) {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="space-y-5 text-[1rem] leading-7 text-[rgba(38,30,24,0.92)]">
      {paragraphs.map((paragraph, index) => (
        <p
          key={`${index}-${paragraph.slice(0, 18)}`}
          className="m-0 whitespace-pre-line"
        >
          {paragraph}
        </p>
      ))}
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
  return (
    <article id={block.id} className="scroll-mt-6">
      <PaperCard className="min-w-0 px-6 py-8 sm:px-8 sm:py-10">
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

          <div className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.45)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.7)]">
            {block.wordCount} words
          </div>
        </div>

        <div className="mt-4">
          <CopyControls blockId={block.id} anchorId={block.id} title={block.title} />
        </div>

        {showMetadata ? (
          <div className="mt-5 rounded-3xl border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.42)] px-4 py-4 sm:px-5">
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
          <SourceText body={block.body} />
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

  return (
    <article
      id={anchorId}
      className="rounded-[28px] border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.42)] p-4 shadow-[0_16px_40px_rgba(25,18,12,0.08)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.72)]">
          Block {position}
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
        <span className="inline-flex rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.76)]">
          {formatLabel(block.voice)}
        </span>
        <span className="inline-flex rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.76)]">
          {formatLabel(block.type)}
        </span>
        <span className="inline-flex rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.76)]">
          {formatLabel(block.chapter)}
        </span>
        <span className="inline-flex rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.76)]">
          {formatLabel(block.status)}
        </span>
        <span className="inline-flex rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.55)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.76)]">
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

      {showMetadata ? (
        <div className="mt-4 rounded-3xl border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.38)] px-4 py-4">
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

export default function LivingManuscriptViewerClient({
  manuscript,
  podcastArrangement,
}: ViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("book");
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
              Book View and Episode View
            </h2>
            <p className="mb-0 mt-3 max-w-[760px] text-sm leading-6 text-[rgba(245,239,230,0.82)]">
              Book View keeps manuscript order by chapter. Episode View arranges the same blocks using `podcast-season-1.yml` so cross-chapter episode construction is visible without changing source prose.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <ViewModeButton
              label="Book View"
              active={viewMode === "book"}
              onClick={() => setViewMode("book")}
            />
            <ViewModeButton
              label="Episode View"
              active={viewMode === "episode"}
              onClick={() => setViewMode("episode")}
            />
          </div>
        </div>
      </GlassPanel>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-6 xl:self-start">
          <GlassPanel className="p-5 text-[var(--text-light)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <PageEyebrow>Viewer Controls</PageEyebrow>
                <h2 className="m-0 text-[1.4rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                  {viewMode === "book"
                    ? "Living Manuscript Filters"
                    : "Episode Arrangement Filters"}
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
            <PageEyebrow>{viewMode === "book" ? "Chapters" : "Episodes"}</PageEyebrow>
            <h2 className="m-0 text-[1.3rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
              {viewMode === "book" ? "Chapter Groups" : "Podcast Episode Groups"}
            </h2>
            <p className="mb-0 mt-3 text-sm leading-6 text-[rgba(245,239,230,0.82)]">
              {viewMode === "book"
                ? "Chapter groups show visible manuscript blocks against each chapter total."
                : "Episode groups show arranged production order with visible block counts, warnings, and cross-chapter composition."}
            </p>

            <div className="mt-5 space-y-3">
              {viewMode === "book"
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
                                  className="block rounded-2xl border border-transparent px-3 py-2 text-sm text-[rgba(245,239,230,0.88)] no-underline transition hover:border-white/10 hover:bg-white/6 hover:text-[var(--text-light)]"
                                >
                                  <div className="font-semibold">{block.title}</div>
                                  <div className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[rgba(245,239,230,0.62)]">
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
                : episodeGroups.map((episode) => {
                    const collapsed = collapsedGroups.includes(episode.key);

                    return (
                      <div
                        key={episode.key}
                        className="rounded-2xl border border-white/10 bg-white/6 p-3"
                      >
                        <button
                          type="button"
                          onClick={() => toggleGroup(episode.key)}
                          className="flex w-full items-center justify-between gap-3 text-left text-[rgba(245,239,230,0.96)]"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">
                              {episode.title}
                            </div>
                            <div className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[rgba(245,239,230,0.62)]">
                              {episode.key}
                            </div>
                          </div>
                          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                            {episode.visibleBlocks.length}/{episode.totalBlocks.length}
                          </span>
                        </button>

                        {!collapsed ? (
                          <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
                            {episode.missingBlockIds.length > 0 ? (
                              <div className="rounded-2xl border border-[rgba(255,122,24,0.22)] bg-[rgba(255,122,24,0.08)] px-3 py-2 text-sm text-[rgba(255,229,190,0.9)]">
                                {episode.missingBlockIds.length} missing block reference{episode.missingBlockIds.length === 1 ? "" : "s"}
                              </div>
                            ) : null}

                            {episode.visibleBlocks.length === 0 ? (
                              <div className="rounded-2xl border border-white/8 bg-white/4 px-3 py-2 text-sm text-[rgba(245,239,230,0.66)]">
                                No visible blocks in this episode.
                              </div>
                            ) : (
                              episode.visibleBlocks.map((block) => (
                                <a
                                  key={`${episode.key}-${block.id}`}
                                  href={`#episode-${episode.key}-${block.id}`}
                                  className="block rounded-2xl border border-transparent px-3 py-2 text-sm text-[rgba(245,239,230,0.88)] no-underline transition hover:border-white/10 hover:bg-white/6 hover:text-[var(--text-light)]"
                                >
                                  <div className="font-semibold">{block.title}</div>
                                  <div className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[rgba(245,239,230,0.62)]">
                                    {formatLabel(block.chapter)} · {formatLabel(block.voice)}
                                  </div>
                                </a>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
            </div>
          </GlassPanel>
        </aside>

        <div className="space-y-6">
          {viewMode === "book" ? (
            filteredBlocks.length === 0 ? (
              <PaperCard>
                <h2 className="m-0 text-[1.8rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
                  No blocks match the current search and filters.
                </h2>
                <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(38,30,24,0.82)]">
                  Nothing is wrong with the manuscript. The current search text or metadata filters are simply narrowing the view to zero blocks.
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
          ) : podcastArrangement.episodes.length === 0 ? (
            <PaperCard>
              <h2 className="m-0 text-[1.8rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
                No podcast arrangement data is available.
              </h2>
              <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(38,30,24,0.82)]">
                Episode View depends on `podcast-season-1.yml`. The viewer did not find a usable arrangement file for this project.
              </p>
              {podcastArrangement.warnings.length > 0 ? (
                <ul className="mb-0 mt-5 space-y-2 text-sm leading-6 text-[rgba(38,30,24,0.78)]">
                  {podcastArrangement.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
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

              {episodeGroups.map((episode) => (
                <EpisodeCard
                  key={episode.key}
                  episode={episode}
                  showMetadata={showMetadata}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
