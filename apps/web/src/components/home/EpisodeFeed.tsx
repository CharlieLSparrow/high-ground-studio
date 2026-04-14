import EpisodeCard from "@/components/home/EpisodeCard";
import { episodes } from "@/lib/site";

export default function EpisodeFeed() {
  const feed = episodes.filter((episode) => !episode.featured);
  
  // 👈 THE FIX: We tell TS it's a string so it allows the "poster" comparison later.
  const layout = "wide" as string; 

  if (!feed.length) return null;

  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-[90px]">
      <div className="mb-8">
        <div className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.08em] text-flare/60">Archives</div>
        <h2 className="text-[clamp(2rem,4vw,3.2rem)] font-black leading-tight tracking-[-0.05em] text-subject">
          The Opening Run
        </h2>
      </div>

      <div className={layout === "poster" 
        ? "grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" 
        : "grid gap-8"}
      >
        {feed.map((episode) => (
          <EpisodeCard 
            key={episode.href} 
            episode={episode} 
            variant={layout as "wide" | "poster"} 
          />
        ))}
      </div>
    </section>
  );
}