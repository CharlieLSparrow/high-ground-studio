import { notFound } from "next/navigation";
import { Metadata, ResolvingMetadata } from "next";
import fs from "node:fs/promises";
import path from "node:path";
import { parseHgoPublicEpisodePacket, HgoPublicEpisodePacket } from "@/lib/hgo/public-episode-packet";

import { EpisodeHero } from "@/components/hgo/public/EpisodeHero";
import { EpisodeShowNotes } from "@/components/hgo/public/EpisodeShowNotes";
import { EpisodeQuotes } from "@/components/hgo/public/EpisodeQuotes";
import { EpisodeEssay } from "@/components/hgo/public/EpisodeEssay";
import { EpisodeAudioPlayer } from "@/components/hgo/public/EpisodeAudioPlayer";

const EPISODES_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "content", "publish", "hgo-episodes");

async function fetchEpisodePacket(slug: string): Promise<HgoPublicEpisodePacket | null> {
  const filePath = path.join(EPISODES_DIR, `${slug}.json`);
  try {
    const fileContent = await fs.readFile(filePath, "utf8");
    const parsed = parseHgoPublicEpisodePacket(fileContent);
    return parsed.ok ? parsed.packet : null;
  } catch (err) {
    return null;
  }
}

export async function generateMetadata(
  props: { params: Promise<{ slug?: string[] }> },
  parent: ResolvingMetadata
): Promise<Metadata> {
  const params = await props.params;
  const slug = (params.slug || []).join("/");
  
  if (!slug) return { title: "Episode Not Found" };

  const packet = await fetchEpisodePacket(slug);
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
    }
  };
}

export default async function EpisodePage(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const slugArray = params.slug || [];
  const slug = slugArray.join("/");

  if (!slug) {
    notFound();
  }

  const packet = await fetchEpisodePacket(slug);
  if (!packet) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <EpisodeAudioPlayer packet={packet} />
      <EpisodeHero packet={packet} />
      
      <div className="w-full bg-zinc-950">
        <EpisodeShowNotes packet={packet} />
      </div>

      <div className="w-full bg-zinc-950">
        <EpisodeQuotes packet={packet} />
      </div>

      <div className="w-full bg-zinc-950 border-t border-zinc-900 mt-12">
        <EpisodeEssay packet={packet} />
      </div>
    </main>
  );
}
