import EpisodeCard from "@/components/home/EpisodeCard";
import { listHgoPublicEpisodePackets } from "@/lib/hgo/public-episode-store";

export default async function EpisodeFeed() {
  const feed = await listHgoPublicEpisodePackets();

  return (
    <section className="relative z-10 mx-auto max-w-[1200px] px-6 pb-[90px] pt-16">
      <div className="mb-8">
        <div className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.08em] text-flare">
          More episodes
        </div>
        <h2 className="text-[clamp(2rem,4vw,3.2rem)] font-black leading-tight tracking-[-0.05em] text-subject">
          Keep going through the field notes
        </h2>
        <p className="mb-0 mt-3 max-w-[720px] text-[1rem] leading-7 text-[rgba(245,239,230,0.92)]">
          Each episode opens a story, a lesson, and a companion reading path
          through the larger High Ground Odyssey project.
        </p>
      </div>

      {feed.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur-sm">
          <p className="text-neutral-400">No published episodes found yet.</p>
        </div>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {feed.map((episode) => (
            <EpisodeCard key={episode.id} episode={episode} />
          ))}
        </div>
      )}
    </section>
  );
}
