import { notFound } from "next/navigation";

import EpisodeProjectionView from "@/components/hgo/projection/EpisodeProjectionView";
import {
  getSyntheticEpisodeProjection,
  syntheticEpisodeProjections,
} from "@/lib/hgo/synthetic-episode-projection";

export function generateStaticParams() {
  return syntheticEpisodeProjections.map((projection) => ({
    slug: projection.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const projection = getSyntheticEpisodeProjection(slug);

  if (!projection) {
    return {
      title: "Projection Not Found | High Ground Odyssey",
    };
  }

  return {
    title: `${projection.title} | HGO Projection Preview`,
    description: projection.subtitle,
  };
}

export default async function SyntheticProjectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const projection = getSyntheticEpisodeProjection(slug);

  if (!projection) {
    notFound();
  }

  return (
    <EpisodeProjectionView
      projection={projection}
      allProjections={syntheticEpisodeProjections}
    />
  );
}
