import { getPrismaClient } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function text(value: unknown, max = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cdata(value: unknown) {
  return text(value, 20_000).replaceAll("]]>", "]]]]><![CDATA[>");
}

function xmlAttribute(value: unknown) {
  return text(value, 4_000)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function verifiedPublicUrl(value: unknown) {
  const candidate = text(value, 4_000);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "::1") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function safeDate(value: unknown, fallback: Date) {
  const parsed = value ? new Date(String(value)) : fallback;
  return Number.isFinite(parsed.getTime()) ? parsed.toUTCString() : fallback.toUTCString();
}

function safeRoute(value: unknown, fallbackSlug: string) {
  const candidate = text(value, 1_000);
  if (candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.includes("\\")) return candidate;
  return `/episodes/${encodeURIComponent(fallbackSlug)}`;
}

export async function GET(
  _request: Request,
  props: { params: Promise<{ projectSlug: string }> },
) {
  const projectSlug = text((await props.params).projectSlug, 120);
  if (!projectSlug) return new Response("Feed not found", { status: 404 });

  try {
    const prisma = getPrismaClient();
    const projects = await prisma.studioProject.findMany({
      where: { slug: projectSlug, isPrivate: false },
      select: { id: true, name: true, description: true, sourceLabel: true },
      take: 2,
    });

    if (projects.length !== 1) {
      return new Response(projects.length === 0 ? "Feed not found" : "Feed route is ambiguous", {
        status: projects.length === 0 ? 404 : 409,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const project = projects[0];
    const candidates = await prisma.hgoEpisodePublishCandidate.findMany({
      where: {
        candidateStatus: "published",
        archivedAt: null,
        approvedAt: { not: null },
        approvedByEmail: { not: null },
        containsRealContent: "true",
        blockerCount: 0,
        draftPacketJson: { path: ["projectId"], equals: project.id },
      },
      select: {
        id: true,
        projectionSlug: true,
        proposedRoute: true,
        draftPacketJson: true,
        approvedAt: true,
        createdAt: true,
      },
      orderBy: { approvedAt: "desc" },
      take: 250,
    });

    const siteUrl = verifiedPublicUrl(process.env.HGO_SITE_URL || "https://highgroundodyssey.com") || "https://highgroundodyssey.com/";
    const siteOrigin = new URL(siteUrl).origin;

    const items = candidates.flatMap((candidate) => {
      const packet = record(candidate.draftPacketJson);
      const media = record(packet?.media);
      const metadata = record(packet?.metadata);
      const provenance = record(packet?.provenance);
      const audioUrl = verifiedPublicUrl(media?.audioUrl);
      const title = text(packet?.title, 500);
      if (!packet || !audioUrl || !title) return [];

      const slug = text(packet.slug, 180) || candidate.projectionSlug;
      const route = safeRoute(candidate.proposedRoute, slug);
      const episodeUrl = new URL(route, siteOrigin).toString();
      const imageUrl = verifiedPublicUrl(media?.thumbnailUrl) || verifiedPublicUrl(media?.heroImageUrl);
      const body = text(packet.body, 20_000) || text(packet.essayVersion, 20_000);
      const rawPublishedAt = metadata?.publishedAt || provenance?.publishedAt;

      return [`
    <item>
      <title><![CDATA[${cdata(title)}]]></title>
      <description><![CDATA[${cdata(packet.summary)}]]></description>
      ${body ? `<content:encoded><![CDATA[${cdata(body)}]]></content:encoded>` : ""}
      <link>${xmlAttribute(episodeUrl)}</link>
      <guid isPermaLink="false">${xmlAttribute(text(packet.id, 300) || candidate.id)}</guid>
      <pubDate>${safeDate(rawPublishedAt, candidate.approvedAt || candidate.createdAt)}</pubDate>
      <enclosure url="${xmlAttribute(audioUrl)}" length="0" type="audio/mpeg" />
      ${imageUrl ? `<itunes:image href="${xmlAttribute(imageUrl)}" />` : ""}
      <itunes:explicit>false</itunes:explicit>
    </item>`];
    }).join("");

    const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title><![CDATA[${cdata(project.name)}]]></title>
    <description><![CDATA[${cdata(project.description || "Podcast feed published from approved Quipsly records.")}]]></description>
    <link>${xmlAttribute(siteOrigin)}</link>
    <language>en-us</language>
    <itunes:author>${xmlAttribute(project.sourceLabel || project.name)}</itunes:author>
    <itunes:summary><![CDATA[${cdata(project.description || "Podcast feed published from approved Quipsly records.")}]]></itunes:summary>
    <itunes:explicit>false</itunes:explicit>
    ${items}
  </channel>
</rss>`;

    return new Response(feedXml, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=120, stale-while-revalidate=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[RSS Feed Generation Error]", error);
    return new Response("Feed unavailable", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
