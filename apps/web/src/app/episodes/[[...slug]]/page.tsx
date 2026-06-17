import { notFound } from "next/navigation";
import type { Metadata, ResolvingMetadata } from "next";

import { EpisodeAudioPlayer } from "@/components/hgo/public/EpisodeAudioPlayer";
import { EpisodeEssay } from "@/components/hgo/public/EpisodeEssay";
import { EpisodeHero } from "@/components/hgo/public/EpisodeHero";
import { EpisodeQuotes } from "@/components/hgo/public/EpisodeQuotes";
import { EpisodeShowNotes } from "@/components/hgo/public/EpisodeShowNotes";
import { EpisodeSupportCta } from "@/components/hgo/public/EpisodeSupportCta";
import { EpisodeVideoEmbed } from "@/components/hgo/public/EpisodeVideoEmbed";
import { readHgoPublicEpisodePacket } from "@/lib/hgo/public-episode-store";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: { params: Promise<{ slug?: string[] }> },
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const params = await props.params;
  const slug = (params.slug || []).join("/");

  if (!slug) return { title: "Episode Not Found" };

  const packet = await readHgoPublicEpisodePacket(slug);
  if (!packet) return { title: "Episode Not Found" };

  return {
    title: `${packet.title} | High Ground Odyssey`,
    description: packet.summary,
    openGraph: {
      title: packet.title,
      description: packet.summary,
      images: packet.media.heroImageUrl ? [packet.media.heroImageUrl] : [],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: packet.title,
      description: packet.summary,
      images: packet.media.heroImageUrl ? [packet.media.heroImageUrl] : [],
    },
  };
}

export default async function EpisodePage(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const slugArray = params.slug || [];
  const slug = slugArray.join("/");

  if (!slug) notFound();

  const packet = await readHgoPublicEpisodePacket(slug);
  if (!packet) notFound();

  const podcastEpisodeSchema = {
    "@context": "https://schema.org",
    "@type": "PodcastEpisode",
    "name": packet.title,
    "description": packet.summary,
    "episodeNumber": packet.episodeNumber,
    "url": `https://highgroundodyssey.com/episodes/${packet.slug}`,
    ...(packet.media.audioUrl ? {
      "associatedMedia": {
        "@type": "MediaObject",
        "contentUrl": packet.media.audioUrl,
      },
    } : {}),
    "partOfSeries": {
      "@type": "PodcastSeries",
      "name": "High Ground Odyssey",
      "url": "https://highgroundodyssey.com",
    },
  };

  const videoObjectSchema = packet.media.youtubeId ? {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "name": packet.title,
    "description": packet.summary,
    "thumbnailUrl": packet.media.heroImageUrl ?? `https://i.ytimg.com/vi/${packet.media.youtubeId}/maxresdefault.jpg`,
    "uploadDate": packet.provenance.publishedAt,
    "embedUrl": `https://www.youtube-nocookie.com/embed/${packet.media.youtubeId}`,
  } : null;

  return (
    <main className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(podcastEpisodeSchema) }}
      />
      {videoObjectSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(videoObjectSchema) }}
        />
      )}
      {packet.media.youtubeId ? (
        <EpisodeVideoEmbed packet={packet} />
      ) : (
        <EpisodeHero packet={packet} />
      )}
      <EpisodeAudioPlayer packet={packet} />
      <EpisodeSupportCta packet={packet} compact />

      <div className="w-full bg-zinc-950">
        <EpisodeShowNotes packet={packet} />
      </div>

      <div className="w-full bg-zinc-950">
        <EpisodeQuotes packet={packet} />
      </div>

      <div className="mt-12 w-full border-t border-zinc-900 bg-zinc-950">
        <EpisodeEssay packet={packet} />
      </div>
      <EpisodeSupportCta packet={packet} />
    </main>
  );
}
