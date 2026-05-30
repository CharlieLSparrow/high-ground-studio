import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  console.log("[Podcast RSS Feed] Generating dynamic iTunes XML...");

  try {
    
    // Fetch published episodes
    let episodes = await prisma.podcastEpisode.findMany({
      orderBy: { publishedAt: "desc" }
    });

    // If database is empty, seed it on-the-fly with pristine sample episodes so we immediately have a live podcast feed!
    if (episodes.length === 0) {
      console.log("[Podcast RSS Feed] Seeding default podcast episodes...");
      
      const defaultEpisodes = [
        {
          slug: "the-autonomy-paradox",
          title: "Episode 1: The Autonomy Paradox",
          description: "Malcolm Gladwell and Daniel Pink discuss the surprising science of motivation. Why standard corporate incentives fail, and why true creative momentum requires absolute self-direction.",
          audioUrl: "https://storage.googleapis.com/high-ground-studio/episodes/take_1.mp3",
          audioSizeBytes: 14500320, // ~14MB
          durationSeconds: 1800, // 30 mins
          episodeType: "full",
          season: 1,
          episodeNumber: 1
        },
        {
          slug: "dopamine-timelines-spatial-engines",
          title: "Episode 2: Dopamine Timelines & Spatial Task Engines",
          description: "A deep dive into high-stimulus organization workflows built for neurodivergent minds. How to ditch linear task calendars for high-interest momentum.",
          audioUrl: "https://storage.googleapis.com/high-ground-studio/episodes/take_2.mp3",
          audioSizeBytes: 20120400, // ~20MB
          durationSeconds: 2400, // 40 mins
          episodeType: "full",
          season: 1,
          episodeNumber: 2
        }
      ];

      await prisma.podcastEpisode.createMany({
        data: defaultEpisodes
      });

      // Refetch
      episodes = await prisma.podcastEpisode.findMany({
        orderBy: { publishedAt: "desc" }
      });
    }

    // Dynamic Host resolution for download redirects
    const host = process.env.NEXTAUTH_URL || "http://localhost:3000";

    // Build compliant RSS XML string
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" 
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <atom:link href="${host}/api/podcast/feed" rel="self" type="application/rss+xml" />
    <title>High Ground Expedition</title>
    <description>Curated wisdom and design science for autonomous builders, leaders, and high-interest minds.</description>
    <link>${host}</link>
    <language>en-us</language>
    <copyright>© 2026 High Ground Labs</copyright>
    <itunes:author>Charlie &amp; Homer</itunes:author>
    <itunes:type>episodic</itunes:type>
    <itunes:explicit>false</itunes:explicit>
    <itunes:category text="Technology" />
    <itunes:category text="Business">
      <itunes:category text="Management" />
    </itunes:category>
    <itunes:owner>
      <itunes:name>High Ground Labs</itunes:name>
      <itunes:email>hello@highground.com</itunes:email>
    </itunes:owner>
    <itunes:image href="https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=1400&amp;auto=format&amp;fit=crop&amp;q=80" />
`;

    // Map each episode node
    for (const ep of episodes) {
      const pubDate = new Date(ep.publishedAt).toUTCString();
      const downloadUrl = `${host}/api/podcast/download?episodeId=${ep.id}`;

      xml += `    <item>
      <guid isPermaLink="false">${ep.id}</guid>
      <title>${ep.title}</title>
      <description>${ep.description}</description>
      <pubDate>${pubDate}</pubDate>
      <link>${host}/episodes/${ep.slug}</link>
      <enclosure url="${downloadUrl}" length="${ep.audioSizeBytes}" type="audio/mpeg" />
      <itunes:duration>${ep.durationSeconds}</itunes:duration>
      <itunes:episodeType>${ep.episodeType}</itunes:episodeType>
      ${ep.season ? `<itunes:season>${ep.season}</itunes:season>` : ""}
      ${ep.episodeNumber ? `<itunes:episode>${ep.episodeNumber}</itunes:episode>` : ""}
      <itunes:author>High Ground Labs</itunes:author>
      <itunes:explicit>false</itunes:explicit>
      <itunes:image href="https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=600&amp;auto=format&amp;fit=crop&amp;q=80" />
    </item>
`;
    }

    xml += `  </channel>
</rss>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600"
      }
    });

  } catch (err) {
    console.error("[Podcast RSS Feed] Failed to generate XML", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
