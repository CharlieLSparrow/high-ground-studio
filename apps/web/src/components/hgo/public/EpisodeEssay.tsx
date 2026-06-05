import React from "react";
import type { HgoPublicEpisodePacket } from "@/lib/hgo/public-episode-packet";

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-bold text-zinc-100">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("_") && part.endsWith("_")) {
      return (
        <em key={index} className="text-zinc-200">
          {part.slice(1, -1)}
        </em>
      );
    }

    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function parseSpeakerBlock(block: string) {
  const labelled = block.match(/^\*\*\[([^\]]+)\]\*\*\s*(.*)$/s);
  if (labelled) {
    return {
      label: labelled[1],
      body: labelled[2].trim(),
    };
  }

  const labelledWithLead = block.match(/^\*\*\[([^\]]+)\]\s*([^*]+)\*\*\s*(.*)$/s);
  if (labelledWithLead) {
    return {
      label: labelledWithLead[1],
      body: `${labelledWithLead[2]}${labelledWithLead[3]}`.trim(),
    };
  }

  return null;
}

function normalizeEssayBlocks(markdown: string) {
  return markdown
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/g)
    .map((block) => block.replace(/\n/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function renderEssayBlock(block: string, index: number) {
  const heading = block.match(/^#{2,4}\s+(.+)$/);
  if (heading) {
    return (
      <h3 key={index} className="mt-12 border-t border-zinc-800/80 pt-8 text-3xl font-black tracking-[-0.03em] text-zinc-100">
        {renderInline(heading[1])}
      </h3>
    );
  }

  const speaker = parseSpeakerBlock(block);
  if (speaker) {
    return (
      <section key={index} className="my-9 rounded-3xl border border-amber-400/20 bg-amber-400/[0.04] p-6 shadow-2xl shadow-black/20">
        <div className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-amber-400">
          {speaker.label}
        </div>
        <p className="text-xl leading-9 text-zinc-200">
          {renderInline(speaker.body)}
        </p>
      </section>
    );
  }

  const boldOnly = block.match(/^\*\*([^*]{1,90})\*\*$/);
  if (boldOnly) {
    return (
      <div key={index} className="mt-3 text-sm font-black uppercase tracking-[0.22em] text-amber-400">
        {boldOnly[1]}
      </div>
    );
  }

  if (/^[–—-]\s?Benjamin Franklin/i.test(block)) {
    return (
      <p key={index} className="text-right text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {block}
      </p>
    );
  }

  return (
    <p key={index} className="text-xl leading-9 text-zinc-300">
      {renderInline(block)}
    </p>
  );
}

export function EpisodeEssay({ packet }: { packet: HgoPublicEpisodePacket }) {
  if (!packet.essayVersion) {
    return null;
  }

  const blocks = normalizeEssayBlocks(packet.essayVersion);

  return (
    <section className="mx-auto max-w-4xl px-6 py-20 lg:px-8">
      <div className="mb-12 border-b border-zinc-800 pb-6">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-amber-400">
          Read the episode
        </div>
        <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] text-zinc-100">
          The covered manuscript
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-500">
          This is the public text packet that Quipsly published for this episode, cleaned up for reading while preserving the episode source.
        </p>
      </div>

      <article className="space-y-7">
        {blocks.map(renderEssayBlock)}
      </article>
    </section>
  );
}
