import Link from "next/link";
import type { HgoPublicEpisodePacket } from "@/lib/hgo/public-episode-packet";

export default function EpisodeCard({ episode }: { episode: HgoPublicEpisodePacket }) {
  return (
    <Link
      href={`/episodes/${episode.slug}`}
      className="group flex min-h-[260px] flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/20 transition hover:-translate-y-1 hover:border-amber-400/60 hover:bg-white/[0.09]"
    >
      <div>
        <div className="mb-4 inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-amber-300">
          Episode {episode.episodeNumber}
        </div>
        <h3 className="text-2xl font-black leading-tight tracking-[-0.04em] text-white">
          {episode.title}
        </h3>
        {episode.subtitle ? (
          <p className="mt-2 text-sm font-bold text-amber-100/80">{episode.subtitle}</p>
        ) : null}
        <p className="mt-4 line-clamp-5 text-sm leading-6 text-zinc-300">
          {episode.summary}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4 text-sm font-bold text-amber-300">
        <span>{episode.media.youtubeId ? "Watch + read" : "Read episode"}</span>
        <span className="transition group-hover:translate-x-1">Open</span>
      </div>
    </Link>
  );
}
