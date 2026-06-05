import { NextResponse } from "next/server";

// Mock Data: QuipslyPublicPackage 
const mockPackages = [
  {
    id: "ep-001-guid",
    kind: "episode",
    title: "1. The Fall of the Republic",
    summary: "How do you maintain structural integrity when the galaxy around you is collapsing?",
    media: {
      audioUrl: "https://storage.googleapis.com/hgo-public-media/mock/audio-001.mp3",
      thumbnailUrl: "https://storage.googleapis.com/hgo-public-media/mock/thumb-001.jpg",
    },
    body: "<p>In this episode, we explore the collapse of large systems and what to do when your context shifts entirely.</p>",
    metadata: {
      publishedAt: new Date("2026-06-01T12:00:00Z").toUTCString()
    }
  }
];

export async function GET() {
  const channelTitle = "High Ground Odyssey";
  const channelDescription = "A journey into system thinking, leadership, and maintaining the high ground.";
  const channelImage = "https://storage.googleapis.com/hgo-public-media/mock/show-artwork.jpg";
  const siteUrl = "https://highgroundodyssey.com";

  // Build XML items
  const itemsXml = mockPackages.map(pkg => `
    <item>
      <title><![CDATA[${pkg.title}]]></title>
      <description><![CDATA[${pkg.summary} ${pkg.body}]]></description>
      <enclosure url="${pkg.media.audioUrl}" length="15000000" type="audio/mpeg" />
      <guid isPermaLink="false">${pkg.id}</guid>
      <pubDate>${pkg.metadata.publishedAt}</pubDate>
      <itunes:image href="${pkg.media.thumbnailUrl}" />
      <itunes:explicit>false</itunes:explicit>
    </item>
  `).join("");

  // Build Channel XML
  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title><![CDATA[${channelTitle}]]></title>
    <description><![CDATA[${channelDescription}]]></description>
    <link>${siteUrl}</link>
    <language>en-us</language>
    <itunes:image href="${channelImage}" />
    <itunes:explicit>false</itunes:explicit>
    <itunes:category text="Education" />
    ${itemsXml}
  </channel>
</rss>`;

  return new NextResponse(rssXml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml",
    },
  });
}
