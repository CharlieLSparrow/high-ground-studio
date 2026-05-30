import { notFound } from "next/navigation";
import { getEpisodeSource } from "@/lib/source";
import { prisma } from "@/lib/prisma";
import AudioDeck from "../AudioDeck";

export default async function EpisodePage({ params }: any) {
  const { slug = [] } = await params;
  
  // Resolve source MDX page via Fumadocs
  const source = await getEpisodeSource();
  const page = source.getPage(slug);

  if (!page) {
    notFound();
  }

  // Attempt to load associated podcast audio file from Postgres using Prisma
  const episodeSlug = slug[0] || "";
  let podcastRecord = null;

  try {
    podcastRecord = await prisma.podcastEpisode.findUnique({
      where: { slug: episodeSlug }
    });
  } catch (err) {
    console.warn(`[Podcast Player] Could not resolve database track for slug ${episodeSlug}. Fallback active.`);
  }

  const PageContent = (page as any).data.body;

  return (
    <div className="min-h-screen pt-32 pb-24 max-w-4xl mx-auto px-6">
      
      {/* Audio Deck Player (If Audio Enclosure exists in DB) */}
      {podcastRecord && (
        <AudioDeck 
          title={podcastRecord.title}
          audioUrl={`/api/podcast/download?episodeId=${podcastRecord.id}`}
          durationSeconds={podcastRecord.durationSeconds}
          season={podcastRecord.season ?? undefined}
          episodeNumber={podcastRecord.episodeNumber ?? undefined}
        />
      )}

      {/* Transcript Text Reader */}
      <div className="prose prose-invert max-w-none leading-relaxed text-zinc-300">
        <PageContent />
      </div>
    </div>
  );
}
