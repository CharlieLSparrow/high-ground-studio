import EpisodeCard from "@/components/home/EpisodeCard";
import type { LayoutVariant } from "@/lib/layout-variant";
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
            variant === "editorial"
              ? "text-[rgba(245,239,230,0.68)]"
              : variant === "signal"
                ? "text-[rgba(230,236,238,0.68)]"
                : "text-flare/60",
          ].join(" ")}
        >
          {variant === "signal" ? "Queue" : "Archives"}
        </div>
        <h2
          className={[
            "text-[clamp(2rem,4vw,3.2rem)] font-black leading-tight tracking-[-0.05em]",
            variant === "editorial"
              ? "text-[var(--text-light)]"
              : variant === "signal"
                ? "text-[rgba(230,236,238,0.96)]"
                : "text-subject",
          ].join(" ")}
        >
          {variant === "editorial"
            ? "The Opening Essays and Episodes"
            : variant === "signal"
              ? "Current public episode set"
              : "The Opening Run"}
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
            variant={layout}
            layoutVariant={variant}
          />
        ))}
      </div>
    </section>
  );
}
