import EpisodeCard from "@/components/home/EpisodeCard";
import { episodes } from "@/lib/site";

export default function EpisodeFeed() {
  const feed = episodes.filter((episode) => !episode.featured);

  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-[90px]">
      <div className="mb-[22px]">
        <div className="mb-[10px] text-[13px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
          Episode Feed
        </div>

        <h2 className="m-0 text-[clamp(2rem,4vw,3.2rem)] leading-[0.98] tracking-[-0.05em] text-[var(--text-light)]">
          Start with the opening run
        </h2>
      </div>

      <div className="grid gap-6">
        {feed.map((episode) => (
          <EpisodeCard key={episode.href} episode={episode} />
        ))}
      </div>
    </section>
  );
}