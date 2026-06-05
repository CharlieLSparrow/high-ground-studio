import { getPrismaClient } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ projectSlug: string }> }
) {
  try {
    const params = await props.params;
    const { projectSlug } = params;
    const prisma = getPrismaClient();

    const project = await prisma.studioProject.findFirst({
      where: { slug: projectSlug }
    });

    if (!project) {
      return new Response("Project not found", { status: 404 });
    }

    const candidates = await prisma.hgoEpisodePublishCandidate.findMany({
      where: {
        candidateStatus: "published",
        archivedAt: null
      },
      orderBy: { approvedAt: "desc" }
    });

    const projectEpisodes = candidates.filter((c: any) => {
      const packet = c.draftPacketJson as any;
      return packet && packet.projectId === project.id;
    });

    const siteUrl = (process.env.HGO_SITE_URL || "https://highgroundodyssey.com").replace(/\/$/, "");

    let rssItemsXml = "";
    for (const c of projectEpisodes) {
      const packet = (c.draftPacketJson || c.packetJson) as any;
      if (!packet) continue;

      const rawPubDate = packet.metadata?.publishedAt || packet.provenance?.publishedAt;
      const pubDate = rawPubDate
        ? new Date(rawPubDate).toUTCString()
        : new Date(c.approvedAt || c.createdAt).toUTCString();

      const audioUrl = packet.media?.audioUrl || "https://storage.googleapis.com/hgo-public-media/mock/audio-001.mp3";
      const imageUrl = packet.media?.thumbnailUrl || packet.media?.heroImageUrl || "https://storage.googleapis.com/hgo-public-media/mock/thumb-001.jpg";
      const bodyContent = packet.body || packet.essayVersion || "";

      rssItemsXml += `
    <item>
      <title><![CDATA[${packet.title}]]></title>
      <description><![CDATA[${packet.summary || ""}]]></description>
      <content:encoded><![CDATA[${bodyContent}]]></content:encoded>
      <link>${siteUrl}${c.proposedRoute || `/episodes/${packet.slug || c.projectionSlug}`}</link>
      <guid isPermaLink="false">${packet.id || c.id}</guid>
      <pubDate>${pubDate}</pubDate>
      <enclosure url="${audioUrl}" length="0" type="audio/mpeg" />
      <itunes:image href="${imageUrl}" />
      <itunes:explicit>false</itunes:explicit>
      <itunes:duration>0</itunes:duration>
    </item>`;
    }

    const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" 
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title><![CDATA[${project.name}]]></title>
    <description><![CDATA[${project.description || "Quipsly self-hosted podcast feed."}]]></description>
    <link>${siteUrl}</link>
    <language>en-us</language>
    <itunes:author>${project.sourceLabel || "High Ground Studio"}</itunes:author>
    <itunes:summary><![CDATA[${project.description || "Quipsly self-hosted podcast feed."}]]></itunes:summary>
    <itunes:owner>
      <itunes:name>${project.sourceLabel || "High Ground Studio"}</itunes:name>
      <itunes:email>support@highgroundodyssey.com</itunes:email>
    </itunes:owner>
    <itunes:image href="https://storage.googleapis.com/hgo-public-media/mock/thumb-001.jpg" />
    <itunes:category text="Technology" />
    <itunes:explicit>false</itunes:explicit>
    ${rssItemsXml}
  </channel>
</rss>`;

    return new Response(feedXml, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=120, stale-while-revalidate=60"
      },
    });
  } catch (error: any) {
    console.error("[RSS Feed Generation Error]", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
