import EpisodeCard from "@/components/home/EpisodeCard";
import type { LayoutVariant } from "@/lib/layout-variant";
import { episodes } from "@/lib/site";

export default function FeaturedEpisode({
  variant = "cinematic",
}: {
  variant?: LayoutVariant;
}) {
  const featured = episodes.find((episode) => episode.featured);

  if (!featured) return null;

  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-9">
      <EpisodeCard episode={featured} featured layoutVariant={variant} />
    </section>
  );
}
