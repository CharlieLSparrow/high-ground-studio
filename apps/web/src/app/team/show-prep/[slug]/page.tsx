import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import DocsVideoEmbed from "@/components/docs/DocsVideoEmbed";
import BackLink from "@/components/ui/BackLink";
import GlassPanel from "@/components/ui/GlassPanel";
import PaperCard from "@/components/ui/PaperCard";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { getShowPrepPacket, type ShowPrepPacket } from "@/lib/server/show-prep";

const inlinePattern = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|_([^_]+)_|`([^`]+)`)/g;

function formatLabel(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractYouTubeId(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  const directMatch = trimmed.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (directMatch) {
    return directMatch[1];
  }

  const shortMatch = trimmed.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (shortMatch) {
    return shortMatch[1];
  }

  const embedMatch = trimmed.match(/embed\/([A-Za-z0-9_-]{11})/);
  if (embedMatch) {
    return embedMatch[1];
  }

  return "";
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(inlinePattern)) {
    const [raw, , linkLabel, linkHref, strongText, italicText, codeText] = match;
    const index = match.index ?? 0;

    if (index > cursor) {
      nodes.push(text.slice(cursor, index));
    }

    if (linkLabel && linkHref) {
      const external = /^https?:\/\//.test(linkHref);
      nodes.push(
        <a
          key={`${keyPrefix}-${index}`}
          href={linkHref}
          {...(external
            ? { target: "_blank", rel: "noreferrer noopener" }
            : {})}
        >
          {linkLabel}
        </a>,
      );
    } else if (strongText) {
      nodes.push(<strong key={`${keyPrefix}-${index}`}>{strongText}</strong>);
    } else if (italicText) {
      nodes.push(<em key={`${keyPrefix}-${index}`}>{italicText}</em>);
    } else if (codeText) {
      nodes.push(<code key={`${keyPrefix}-${index}`}>{codeText}</code>);
    }

    cursor = index + raw.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

function MarkdownSection({ content }: { content: string }) {
  const blocks = content
    .trim()
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="prose-hgo max-w-none">
      {blocks.map((block, blockIndex) => {
        const lines = block.split(/\r?\n/);

        if (lines.length === 1 && lines[0].startsWith("### ")) {
          return (
            <h3 key={`h3-${blockIndex}`}>
              {renderInline(lines[0].replace(/^###\s+/, ""), `h3-${blockIndex}`)}
            </h3>
          );
        }

        if (lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
          return (
            <ul key={`ul-${blockIndex}`}>
              {lines.map((line, lineIndex) => (
                <li key={`ul-${blockIndex}-${lineIndex}`}>
                  {renderInline(
                    line.replace(/^[-*]\s+/, "").trim(),
                    `ul-${blockIndex}-${lineIndex}`,
                  )}
                </li>
              ))}
            </ul>
          );
        }

        if (lines.every((line) => /^>\s?/.test(line.trim()))) {
          return (
            <blockquote key={`quote-${blockIndex}`}>
              {renderInline(
                lines
                  .map((line) => line.replace(/^>\s?/, "").trim())
                  .join(" "),
                `quote-${blockIndex}`,
              )}
            </blockquote>
          );
        }

        return (
          <p key={`p-${blockIndex}`}>
            {renderInline(lines.join(" "), `p-${blockIndex}`)}
          </p>
        );
      })}
    </div>
  );
}

function StatusChip({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-full border border-white/12 bg-white/7 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.88)]">
      {children}
    </div>
  );
}

function PrepSection({
  eyebrow,
  title,
  content,
  emptyMessage,
}: {
  eyebrow: string;
  title: string;
  content: string;
  emptyMessage: string;
}) {
  return (
    <PaperCard className="min-w-0">
      <PageEyebrow>{eyebrow}</PageEyebrow>
      <h2 className="m-0 mt-2 text-[1.7rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
        {title}
      </h2>

      <div className="mt-5">
        {content.trim() ? (
          <MarkdownSection content={content} />
        ) : (
          <p className="m-0 text-[1rem] leading-7 text-[rgba(38,30,24,0.8)]">
            {emptyMessage}
          </p>
        )}
      </div>
    </PaperCard>
  );
}

function buildAdditionalSections(packet: ShowPrepPacket) {
  return [
    packet.sections.episodeNotes
      ? {
          eyebrow: "Episode Notes",
          title: "Episode Notes",
          content: packet.sections.episodeNotes,
        }
      : null,
    packet.sections.discussionQuestions
      ? {
          eyebrow: "Discussion Questions",
          title: "Discussion Questions",
          content: packet.sections.discussionQuestions,
        }
      : null,
    packet.sections.productionNotes
      ? {
          eyebrow: "Production Notes",
          title: "Production Notes",
          content: packet.sections.productionNotes,
        }
      : null,
    packet.sections.publicationStatus
      ? {
          eyebrow: "Publication Status",
          title: "Publication Status",
          content: packet.sections.publicationStatus,
        }
      : null,
    ...packet.additionalSections.map((section) => ({
      eyebrow: "Additional Section",
      title: section.heading,
      content: section.body,
    })),
  ].filter(Boolean) as Array<{ eyebrow: string; title: string; content: string }>;
}

export default async function ShowPrepDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const packet = await getShowPrepPacket(slug);

  if (!packet) {
    notFound();
  }

  const youtubeId = extractYouTubeId(packet.youtube);
  const additionalSections = buildAdditionalSections(packet);
  const researchContent = packet.sections.researchNotes || packet.sections.episodeNotes || "";
  const clipContent = packet.sections.clipNotes || packet.sections.clipIdeas || "";
  const provenanceContent = packet.sections.sourceProvenance || "";

  return (
    <section className="space-y-8">
      <div>
        <BackLink href="/team/show-prep">
          <span aria-hidden="true">←</span>
          <span>Back to Show Prep</span>
        </BackLink>
      </div>

      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4 flex flex-wrap gap-3">
          <PageEyebrow>Show Prep</PageEyebrow>
          {packet.episodeNumber ? <PageEyebrow>Episode {packet.episodeNumber}</PageEyebrow> : null}
          <PageEyebrow>{formatLabel(packet.workflowStatus)}</PageEyebrow>
          <PageEyebrow>{formatLabel(packet.publicationStatus)}</PageEyebrow>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div>
            <h2 className="m-0 text-[clamp(2.2rem,5vw,4rem)] leading-[0.98] tracking-[-0.04em] text-[var(--text-light)]">
              {packet.title}
            </h2>

            <div className="mt-3 text-sm font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
              {packet.slug}
            </div>

            {packet.description ? (
              <p className="mb-0 mt-5 max-w-[760px] text-[1rem] leading-7 text-[rgba(245,239,230,0.9)]">
                {packet.description}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-2">
              <StatusChip>Scott Core {packet.hasScottCore ? "Present" : "Missing"}</StatusChip>
              <StatusChip>Charlie {packet.hasCharlieMaterial ? "Present" : "Missing"}</StatusChip>
              <StatusChip>Research {packet.hasResearchNotes ? "Present" : "Missing"}</StatusChip>
              <StatusChip>Clip Notes {packet.hasClipNotes ? "Present" : "Missing"}</StatusChip>
              <StatusChip>Open Questions {packet.unresolvedQuestionCount}</StatusChip>
            </div>
          </div>

          <div className="space-y-4 rounded-[28px] border border-white/10 bg-white/6 p-5 text-sm leading-6 text-[rgba(245,239,230,0.88)]">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.66)]">
                Packet file
              </div>
              <div className="mt-1 break-all font-mono text-[rgba(245,239,230,0.94)]">
                {packet.packetPath}
              </div>
            </div>

            {packet.publicTitle || packet.publishSlug ? (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.66)]">
                  Public mapping
                </div>
                <div className="mt-1 text-[rgba(245,239,230,0.94)]">
                  {packet.publicTitle || "Untitled public derivative"}
                  {packet.publishSlug ? ` (${packet.publishSlug})` : ""}
                </div>
              </div>
            ) : null}

            {packet.confidence ? (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.66)]">
                  Confidence
                </div>
                <div className="mt-1 text-[rgba(245,239,230,0.94)]">
                  {formatLabel(packet.confidence)}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </GlassPanel>

      {youtubeId ? (
        <section className="overflow-hidden rounded-[32px] border border-white/14 bg-[rgba(10,21,24,0.52)] shadow-[0_30px_70px_rgba(0,0,0,0.28)] backdrop-blur-[10px]">
          <DocsVideoEmbed youtubeId={youtubeId} title={packet.title} />
        </section>
      ) : (
        <GlassPanel className="p-5 text-[var(--text-light)]">
          <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.7)]">
            YouTube
          </div>
          <p className="mb-0 mt-2 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
            No YouTube clip attached yet.
          </p>
        </GlassPanel>
      )}

      <PrepSection
        eyebrow="Scott / Homer Core"
        title="Scott / Homer Core"
        content={packet.sections.scottCore || ""}
        emptyMessage="No Scott core captured yet."
      />

      <div className="grid gap-8 xl:grid-cols-2">
        <PrepSection
          eyebrow="Charlie Material"
          title="Charlie Material"
          content={packet.sections.charlieSection || ""}
          emptyMessage="No Charlie material yet."
        />

        <PrepSection
          eyebrow="Episode Framing"
          title="Episode Framing"
          content={packet.sections.episodeFraming || ""}
          emptyMessage="No episode framing captured yet."
        />
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <PrepSection
          eyebrow="Research Options"
          title="Research Options"
          content={researchContent}
          emptyMessage="No research or notes yet."
        />

        <PrepSection
          eyebrow="Clip Notes"
          title="Clip Notes"
          content={clipContent}
          emptyMessage="No clip notes yet."
        />
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <PrepSection
          eyebrow="Open Decisions"
          title="Open Decisions"
          content={packet.sections.openDecisions || ""}
          emptyMessage="No unresolved questions captured yet."
        />

        <PrepSection
          eyebrow="Source Provenance"
          title="Source Provenance"
          content={provenanceContent}
          emptyMessage="No provenance notes captured yet."
        />
      </div>

      {additionalSections.length ? (
        <div className="grid gap-8 xl:grid-cols-2">
          {additionalSections.map((section) => (
            <PrepSection
              key={section.title}
              eyebrow={section.eyebrow}
              title={section.title}
              content={section.content}
              emptyMessage=""
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
