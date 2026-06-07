import React from "react";
import {
  getHgoPublicEpisodeOutputContract,
  type HgoPublicEpisodePacket,
} from "@/lib/hgo/public-episode-packet";

export function EpisodeVideoEmbed({ packet }: { packet: HgoPublicEpisodePacket }) {
  if (!packet.media.youtubeId) return null;

  const embedUrl = `https://www.youtube-nocookie.com/embed/${packet.media.youtubeId}`;
  const watchUrl = `https://youtu.be/${packet.media.youtubeId}`;
  const thumbnailUrl = packet.media.heroImageUrl ?? `https://i.ytimg.com/vi/${packet.media.youtubeId}/maxresdefault.jpg`;
  const outputContract = packet.outputContract ?? getHgoPublicEpisodeOutputContract();

  return (
    <section className="relative isolate w-full overflow-hidden border-b border-amber-500/20 bg-zinc-950 text-white">
      <div
        className="absolute inset-0 -z-20 bg-cover bg-center opacity-30 blur-2xl scale-110"
        style={{ backgroundImage: `url(${thumbnailUrl})` }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.18),transparent_32%),linear-gradient(180deg,rgba(9,9,11,0.38)_0%,rgba(9,9,11,0.88)_72%,rgb(9,9,11)_100%)]" />

      <div className="relative w-full bg-black shadow-[0_40px_140px_rgba(0,0,0,0.85)]">
        <div className="aspect-video w-full">
          <iframe
            className="h-full w-full"
            src={embedUrl}
            title={`${packet.title} on YouTube`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:py-12">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-[0.22em]">
            <span className="text-amber-400">{packet.hero.eyebrow || "High Ground Odyssey"}</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">Episode {packet.episodeNumber}</span>
          </div>
          <h1 className="max-w-4xl text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
            {packet.title}
          </h1>
          {packet.subtitle ? (
            <p className="max-w-3xl text-xl leading-8 text-zinc-300 sm:text-2xl">
              {packet.subtitle}
            </p>
          ) : null}
          <p className="max-w-3xl text-base leading-8 text-zinc-400">
            {packet.summary}
          </p>
          {packet.provenance && (
            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-zinc-500 font-mono">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 border border-zinc-800 px-3 py-1 font-sans font-bold text-zinc-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                Published from Quipsly/Nest
              </span>
              <span className="truncate max-w-[200px]" title={`Source Artifact Hash: ${packet.provenance.sourceArtifactHash}`}>
                Artifact {packet.provenance.sourceArtifactHash.slice(0, 8)}
              </span>
              {packet.provenance.publishedAt && (
                <>
                  <span>•</span>
                  <span>{new Date(packet.provenance.publishedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</span>
                </>
              )}
            </div>
          )}
          <a
            href="https://nest.quipsly.com/outputs/hgo-episode-page"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.13em] text-amber-200 transition hover:border-amber-300/60 hover:bg-amber-400/15"
            title={`Packet fields: ${outputContract.packetShape.join(", ")}`}
          >
            Quipsly output: {outputContract.title}
          </a>
        </div>

        <a
          href={watchUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex justify-center rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-zinc-100 shadow-2xl shadow-black/40 transition hover:border-amber-400/60 hover:bg-amber-400/10"
        >
          Open on YouTube
        </a>
      </div>
    </section>
  );
}
