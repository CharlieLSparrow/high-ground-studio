import EpisodeCard from "@/components/home/EpisodeCard";
import type { LayoutVariant } from "@/lib/layout-variant";
import { getLayoutTextTreatment } from "@/lib/layout-variant-styles";
import { episodes } from "@/lib/site";

export default function EpisodeFeed({
  variant = "cinematic",
}: {
  variant?: LayoutVariant;
}) {
  const feed = episodes.filter((episode) => !episode.featured);
  const layout = variant === "signal" ? "poster" : "wide";

  if (!feed.length) return null;

  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-[90px]">
      <div className="mb-8">
        <div
          className={[
            "mb-2 text-[13px] font-extrabold uppercase tracking-[0.08em]",
            getLayoutTextTreatment(variant, "collectionKicker"),
          ].join(" ")}
        >
          {variant === "signal" ? "More to Explore" : "Episode Library"}
        </div>
        <h2
          className={[
            "text-[clamp(2rem,4vw,3.2rem)] font-black leading-tight tracking-[-0.05em]",
            getLayoutTextTreatment(variant, "title"),
          ].join(" ")}
        >
          {variant === "editorial"
            ? "The opening conversations"
            : variant === "signal"
              ? "Public episodes available now"
              : "Start with the published episodes"}
        </h2>
        <p
          className={[
            "mb-0 mt-3 max-w-[720px] text-[1rem] leading-7",
            getLayoutTextTreatment(variant, "body"),
          ].join(" ")}
        >
          Each episode opens a story, a lesson, and a companion reading path
          through the larger High Ground Odyssey project.
        </p>
      </div>

      <div className={layout === "poster" 
        ? "grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" 
        : "grid gap-8"}
      >
        {feed.map((episode) => (
          <EpisodeCard 
            key={episode.href} 
            episode={episode} 
            variant={layout}
            layoutVariant={variant}
          />
        ))}
      </div>
    </section>
  );
}
