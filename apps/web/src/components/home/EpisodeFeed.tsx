import EpisodeCard from "@/components/home/EpisodeCard";
import { episodes } from "@/lib/episodes";

export default function EpisodeFeed() {
  const feed = episodes.filter((episode) => !episode.featured);

  // Handle empty state
  if (!feed.length) {
    return (
      <section className="mx-auto max-w-[1200px] px-6 pb-[90px]">
        <div className="text-center text-gray-400 p-8">
          No episodes found. Check back soon!
        </div>
      </section>
    );
  }

  // Update the href for each episode to use /episodes instead of /docs
  const updatedFeed = feed.map(episode => ({
    ...episode,
    href: `/episodes/${episode.href.split('/').pop()}` || `/episodes/${episode.title.toLowerCase().replace(/\s+/g, '-')}`,
  }));

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
