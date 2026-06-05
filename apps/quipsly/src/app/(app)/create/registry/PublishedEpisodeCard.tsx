import React from "react";
import { PlayCircle } from "lucide-react";
import { Block } from "../Tagger";
import { useEditorExtensions } from "./EditorExtensionRegistry";

function extractLinks(text: string) {
  return Array.from(text.matchAll(/https?:\/\/[^\s<>"')]+/gi))
    .map((match) => match[0].replace(/[.,;:!?]+$/, ""));
}

function isYouTubeLink(url: string) {
  return /(^https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
}

function youtubeVideoId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.replace(/^\//, "") || null;
    if (parsed.hostname.includes("youtube.com")) return parsed.searchParams.get("v");
  } catch {
    return null;
  }
  return null;
}

export default function PublishedEpisodeCard({ block }: { block: Block }) {
  const { tagDefinitions } = useEditorExtensions();
  
  const tagIds = Array.from(new Set([
    ...block.tags,
    ...(block.spans ?? []).map(span => span.tagSlug)
  ]));

  const labels = tagIds
    .filter((tagId) => /^episode-[a-z0-9-]+$/i.test(tagId))
    .map((tagId) => tagDefinitions.find(t => t.id === tagId)?.label ?? tagId);

  const links = extractLinks(block.text).filter(isYouTubeLink);

  if (links.length === 0) return null;

  return (
    <div className="mb-3 rounded-2xl border border-indigo-200 bg-indigo-50/80 p-3 text-sm text-indigo-950 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-indigo-800">
            <PlayCircle size={14} />
            Published episode link
          </div>
          <div className="mt-1 font-bold leading-5">
            This episode is already published. The link is preserved here for reference.
          </div>
        </div>
        {labels.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <span key={label} className="rounded-full border border-indigo-200 bg-white px-2 py-1 text-[11px] font-black text-indigo-800">
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2">
        {links.map((url) => {
          const videoId = youtubeVideoId(url);
          return (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-white p-2 transition-colors hover:bg-indigo-50"
            >
              <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black">
                {videoId ? (
                  <img
                    src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                    alt="Thumbnail"
                    className="h-full w-full object-cover opacity-80"
                  />
                ) : (
                  <PlayCircle className="text-white opacity-50" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-indigo-900">{url}</div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600/70">
                  YouTube Video
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
