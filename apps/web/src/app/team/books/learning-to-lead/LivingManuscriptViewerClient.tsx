"use client";

import { useMemo, useState } from "react";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import PaperCard from "@/components/ui/PaperCard";
import type {
  LivingManuscriptBlock,
  LivingManuscriptDocument,
} from "@/lib/server/living-manuscript";

type ViewerProps = {
  manuscript: LivingManuscriptDocument;
};

type FilterState = {
  chapters: string[];
  voices: string[];
  statuses: string[];
  types: string[];
  tags: string[];
};

function formatLabel(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toggleValue(items: string[], value: string) {
  return items.includes(value)
    ? items.filter((item) => item !== value)
    : [...items, value];
}

function SourceText({ body }: { body: string }) {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="space-y-5 text-[1rem] leading-7 text-[rgba(38,30,24,0.92)]">
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 18)}`} className="m-0 whitespace-pre-line">
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

function MetadataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.55)]">
        {label}
      </div>
      <div className="min-w-0 text-sm text-[rgba(38,30,24,0.82)]">{value}</div>
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
          <div>
            <div className="flex flex-wrap gap-2">
              <PageEyebrow>{formatLabel(block.chapter)}</PageEyebrow>
              <PageEyebrow>{formatLabel(block.type)}</PageEyebrow>
            </div>

            <h2 className="m-0 mt-2 text-[1.7rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
              {block.title}
            </h2>
          </div>

          <div className="rounded-full border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.45)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(38,30,24,0.7)]">
            {block.wordCount} words
          </div>
        </div>

        {showMetadata ? (
          <div className="mt-5 rounded-3xl border border-[rgba(37,28,20,0.1)] bg-[rgba(255,255,255,0.42)] px-4 py-4 sm:px-5">
            <div className="space-y-3">
              <MetadataRow label="ID" value={<code>{block.id}</code>} />
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

export default function LivingManuscriptViewerClient({ manuscript }: ViewerProps) {
  const [filters, setFilters] = useState<FilterState>({
    chapters: [],
    voices: [],
    statuses: [],
    types: [],
    tags: [],
  });
  const [showMetadata, setShowMetadata] = useState(false);
  const [collapsedChapters, setCollapsedChapters] = useState<string[]>([]);

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

      return true;
    });
  }, [filters, manuscript.blocks]);

  const visibleGroups = useMemo(() => {
    const groups = new Map<string, LivingManuscriptBlock[]>();

    for (const block of filteredBlocks) {
      const existing = groups.get(block.chapter) ?? [];
      existing.push(block);
      groups.set(block.chapter, existing);
    }

    return Array.from(groups.entries());
  }, [filteredBlocks]);

  const activeFilterCount =
    filters.chapters.length +
    filters.voices.length +
    filters.statuses.length +
    filters.types.length +
    filters.tags.length;

  function resetFilters() {
    setFilters({
      chapters: [],
      voices: [],
      statuses: [],
      types: [],
      tags: [],
    });
  }

  function toggleChapterGroup(chapter: string) {
    setCollapsedChapters((current) => toggleValue(current, chapter));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-6 xl:self-start">
        <GlassPanel className="p-5 text-[var(--text-light)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <PageEyebrow>Viewer Controls</PageEyebrow>
              <h2 className="m-0 text-[1.4rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                Living Manuscript Filters
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
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                Total Blocks
              </div>
              <div className="mt-1 text-lg font-semibold text-[rgba(245,239,230,0.96)]">
                {manuscript.blocks.length}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                Active Filters
              </div>
              <div className="mt-1 text-lg font-semibold text-[rgba(245,239,230,0.96)]">
                {activeFilterCount}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                Metadata
              </div>
              <div className="mt-1 text-sm text-[rgba(245,239,230,0.9)]">
                {showMetadata ? "Showing block metadata" : "Showing prose only"}
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
          <PageEyebrow>Outline</PageEyebrow>
          <h2 className="m-0 text-[1.3rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
            Chapter Groups
          </h2>

          <div className="mt-5 space-y-3">
            {visibleGroups.map(([chapter, blocks]) => {
              const collapsed = collapsedChapters.includes(chapter);

              return (
                <div key={chapter} className="rounded-2xl border border-white/10 bg-white/6 p-3">
                  <button
                    type="button"
                    onClick={() => toggleChapterGroup(chapter)}
                    className="flex w-full items-center justify-between gap-3 text-left text-[rgba(245,239,230,0.96)]"
                  >
                    <span className="text-sm font-semibold">{formatLabel(chapter)}</span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                      {blocks.length} {blocks.length === 1 ? "block" : "blocks"}
                    </span>
                  </button>

                  {!collapsed ? (
                    <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
                      {blocks.map((block) => (
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
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </GlassPanel>
      </aside>

      <div className="space-y-6">
        {filteredBlocks.length === 0 ? (
          <PaperCard>
            <h2 className="m-0 text-[1.8rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
              No manuscript blocks match the current filters.
            </h2>
            <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(38,30,24,0.82)]">
              Clear the current filters or widen one of the metadata categories to bring sections back into view.
            </p>
          </PaperCard>
        ) : (
          filteredBlocks.map((block) => (
            <BlockCard key={block.id} block={block} showMetadata={showMetadata} />
          ))
        )}
      </div>
    </div>
  );
}
