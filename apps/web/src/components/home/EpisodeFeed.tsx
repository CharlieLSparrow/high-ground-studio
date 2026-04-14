import EpisodeCard from "@/components/home/EpisodeCard";
import { episodes } from "@/lib/site";

export default function EpisodeFeed() {
  /*
   * [Footnote 1]: The Law of Narrative Causality.
   * Narrativium dictates that the "featured" episode must sit at the top of the page,
   * much like the Patrician sits at the top of Ankh-Morpork—unavoidable and quietly 
   * judging you. We filter the remaining episodes here to prevent a catastrophic 
   * narrative collapse of the timeline.
   */
  const feed = episodes.filter((episode) => !episode.featured);

  // If the array is empty, the mice have stopped running.
  if (!feed.length) {
    return (
      <section className="mx-auto max-w-[1200px] px-6 pb-[90px]">
        <div className="text-center text-gray-400 p-8 font-mono">
          <p className="text-lg font-bold">++?????++ Out of Cheese Error.</p>
          <p className="mt-2">404: The Librarian has returned a shrug.</p>
          <p className="text-sm mt-4 text-gray-500 italic">Redo From Start.</p>
        </div>
      </section>
    );
  }

  /*
   * [Footnote 2]: Navigating L-Space.
   * Due to an architectural anomaly (likely designed by B.S. Johnson), the coordinates 
   * for these episodes were originally hardcoded to the phantom /docs dimension. 
   * Since Knowledge = Power = Energy = Mass, the sheer weight of these episodes 
   * allows us to safely shunt their URLs through L-space into the /episodes 
   * directory without alerting the Auditors of Reality (TypeScript).
   */
  const updatedFeed = feed.map((episode) => {
    // A precision strike with .pop() to sever the tether to the old reality.
    const slug = episode.href.split('/').pop() || episode.title.toLowerCase().replace(/\s+/g, '-');
    
    return {
      ...episode,
      href: `/episodes/${slug}`,
    };
  });

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
        {/*
         * [Footnote 3]: Anthill Inside.
         * We must feed the rendering engine the 'updatedFeed' array. Handing the UI 
         * the old 'feed' array is akin to dropping a live hornet into the inner workings 
         * of Hex. It achieves an action, certainly, but rarely the one you wanted.
         */}
        {updatedFeed.map((episode) => (
          <EpisodeCard key={episode.href} episode={episode} />
        ))}
      </div>
    </section>
  );
}