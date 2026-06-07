/**
 * DestinationAdapters.ts
 *
 * Core business logic and interfaces for the Publishing Adapters.
 * This represents the abstract contract between Quipsly's public-safe JSON
 * and the chaotic walled gardens of external APIs (YouTube, Patreon, Apple Podcasts).
 */

import type {
  PublicPublishPacket,
  PublishSourceRef,
  PublishMediaRef,
  DestinationPublicationState,
  PublishDestinationSlug,
  DestinationPublicationStatus,
  PublishPacketKind,
} from "@high-ground/quipsly-domain";

export interface QuipslyPublicPackage {
  id: string;
  projectId: string;
  kind: "episode" | "post" | "video" | "newsletter" | "clip";
  title: string;
  summary: string;
  body: string; // Markdown or HTML representation of the content

  // Media Assets (Pre-processed public URLs)
  media: {
    audioUrl?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    images?: string[];
  };

  // Safe Content
  beats: Array<{ title: string; summary: string; timestamp?: number }>;
  verifiedQuotes: Array<{ text: string; attribution: string; principleId?: string }>;

  // Platform Overrides
  overrides?: {
    youtube?: { tags: string[]; chapterMarkers: string[]; isShort: boolean };
    social?: { platform: "twitter" | "linkedin" | "instagram"; aspectRatios: Record<string, string> };
    patreon?: { isMembersOnly: boolean; tierId?: string; teaser: string };
  };

  metadata: {
    publishedAt?: string;
    embargoUntil?: string;
    author: string;
    status?: PublicationStatus;
    destinations?: Record<PublishingDestination, PublicationStatus>;
  };
}

export interface HgoPublicEpisodePacket {
  packetKind: "hgo-public-episode-packet-v1";
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  episodeNumber: string;
  summary: string;
  publishStatus: "live" | "archived";
  hero: {
    eyebrow: string;
    colorMood: string;
    assetUrl?: string;
  };
  media: {
    heroImageUrl?: string;
    audioUrl?: string;
    youtubeId?: string;
  };
  showNotes: {
    beats: Array<{ title: string; summary: string; timingHint?: string; }>;
    voiceCards: Array<{ speaker: "Charlie" | "Homer"; summary: string; }>;
  };
  quotes: Array<{
    text: string;
    attribution: string;
    context?: string;
  }>;
  essayVersion: string;
  provenance: {
    sourceArtifactHash: string;
    publishedAt: string;
  };
}

export function mapQuipslyPackageToHgoPacket(
  pkg: QuipslyPublicPackage,
  slug: string,
  episodeNumber: string,
  sourceArtifactHash?: string
): HgoPublicEpisodePacket {
  const youtubeId = pkg.media.videoUrl
    ? pkg.media.videoUrl.split("v=")[1]?.split("&")[0] || undefined
    : undefined;

  return {
    packetKind: "hgo-public-episode-packet-v1",
    id: pkg.id,
    slug: slug || pkg.id.replace("compiled-", ""),
    title: pkg.title,
    subtitle: pkg.overrides?.patreon?.teaser || pkg.summary || undefined,
    episodeNumber: episodeNumber || "4",
    summary: pkg.summary,
    publishStatus: "live",
    hero: {
      eyebrow: "High Ground Odyssey",
      colorMood: "amber window light / farm table",
    },
    media: {
      heroImageUrl: pkg.media.thumbnailUrl || undefined,
      audioUrl: pkg.media.audioUrl || undefined,
      youtubeId,
    },
    showNotes: {
      beats: pkg.beats.map((b) => ({
        title: b.title,
        summary: b.summary,
        timingHint: b.timestamp
          ? `${Math.floor(b.timestamp / 60)}:${String(b.timestamp % 60).padStart(2, "0")}`
          : undefined,
      })),
      voiceCards: [
        { speaker: "Homer", summary: pkg.summary },
      ],
    },
    quotes: pkg.verifiedQuotes.map((q) => ({
      text: q.text,
      attribution: q.attribution || "Homer",
    })),
    essayVersion: pkg.body,
    provenance: {
      sourceArtifactHash: sourceArtifactHash || "quipsly-nest",
      publishedAt: pkg.metadata.publishedAt || new Date().toISOString(),
    },
  };
}

export type PublicationStatus = "draft" | "staged" | "published" | "needs review" | "failed";

export type PublishingDestination = "high_ground_odyssey" | "youtube" | "patreon" | "podcast_rss";

export interface AdapterValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PublishResult {
  success: boolean;
  externalRefId?: string;
  url?: string;
  error?: string;
  timestamp: string;
}

export interface MetricSnapshot {
  views: number;
  engagement: number; // e.g., likes, comments, retweets
  retentionScore?: number; // 0-100 score for watch/listen time
  revenueCents?: number;
}

/**
 * Base abstract class for all destination adapters.
 */
export abstract class DestinationAdapter {
  protected providerId: string;
  protected connectionKey: string;

  constructor(providerId: string, connectionKey: string) {
    this.providerId = providerId;
    this.connectionKey = connectionKey;
  }

  /**
   * Identifies if this adapter can handle the given package kind.
   */
  abstract supports(kind: string): boolean;

  /**
   * Validates the package against the destination's specific constraints.
   */
  abstract validate(pkg: QuipslyPublicPackage): Promise<AdapterValidationResult>;

  /**
   * Transforms the Quipsly package into the platform-specific payload.
   */
  abstract prepare(pkg: QuipslyPublicPackage): Promise<unknown>;

  /**
   * Executes the actual publish command against the external API.
   */
  abstract publish(pkg: QuipslyPublicPackage): Promise<PublishResult>;

  /**
   * Fetches latest metrics from the platform.
   */
  abstract syncMetrics(externalRefId: string): Promise<MetricSnapshot>;

  protected log(level: "info" | "warn" | "error", message: string, context?: Record<string, unknown>) {
    console.log(`[Adapter:${this.providerId}] ${level.toUpperCase()}: ${message}`, context || "");
  }
}

/**
 * MOCK IMPLEMENTATION: Podcast RSS Adapter
 */
export class PodcastRssAdapter extends DestinationAdapter {
  constructor() {
    super("podcast_rss", "default_rss_connection");
  }

  supports(kind: string): boolean {
    return kind === "episode";
  }

  async validate(pkg: QuipslyPublicPackage): Promise<AdapterValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!pkg.media.audioUrl) errors.push("Audio URL is required for podcast distribution.");
    if (!pkg.media.thumbnailUrl) warnings.push("Thumbnail URL is missing; falling back to show default.");
    if (!pkg.summary) errors.push("Episode summary is required for RSS description.");

    return { isValid: errors.length === 0, errors, warnings };
  }

  async prepare(pkg: QuipslyPublicPackage): Promise<unknown> {
    // In a real scenario, this prepares the XML elements or the payload to a host like Libsyn
    return {
      title: pkg.title,
      description: `${pkg.summary}\n\n${pkg.body}`,
      enclosure: pkg.media.audioUrl,
      guid: pkg.id,
      pubDate: pkg.metadata.publishedAt || new Date().toUTCString(),
    };
  }

  async publish(pkg: QuipslyPublicPackage): Promise<PublishResult> {
    this.log("info", "Publishing to RSS Feed...", { packageId: pkg.id });

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    return {
      success: true,
      externalRefId: `rss_item_${pkg.id}`,
      url: `https://highgroundodyssey.com/episodes/${pkg.id}`,
      timestamp: new Date().toISOString(),
    };
  }

  async syncMetrics(externalRefId: string): Promise<MetricSnapshot> {
    // Mocked metrics simulation
    return {
      views: Math.floor(Math.random() * 5000) + 1000,
      engagement: Math.floor(Math.random() * 500),
      retentionScore: 85,
    };
  }
}

/**
 * MOCK IMPLEMENTATION: YouTube Adapter
 */
export class YouTubeAdapter extends DestinationAdapter {
  constructor(connectionKey: string) {
    super("youtube_v3", connectionKey);
  }

  supports(kind: string): boolean {
    return kind === "video" || kind === "episode" || kind === "clip";
  }

  async validate(pkg: QuipslyPublicPackage): Promise<AdapterValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!pkg.media.videoUrl) errors.push("Video asset URL is strictly required for YouTube.");
    if (pkg.title.length > 100) errors.push("Title exceeds YouTube's 100 character limit.");

    const descLength = pkg.summary.length + pkg.body.length;
    if (descLength > 5000) errors.push("Description exceeds YouTube's 5000 character limit.");

    if (!pkg.overrides?.youtube?.tags || pkg.overrides.youtube.tags.length === 0) {
      warnings.push("No YouTube tags provided. Discoverability may suffer.");
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  async prepare(pkg: QuipslyPublicPackage): Promise<unknown> {
    // Generate YouTube API specific snippet and status objects
    let description = pkg.summary + "\n\n" + pkg.body;

    // Inject chapter markers if they exist
    if (pkg.overrides?.youtube?.chapterMarkers?.length) {
      description += "\n\nChapters:\n" + pkg.overrides.youtube.chapterMarkers.join("\n");
    }

    return {
      snippet: {
        title: pkg.title,
        description: description,
        tags: pkg.overrides?.youtube?.tags || [],
        categoryId: "27", // Education
      },
      status: {
        privacyStatus: "unlisted", // Draft default
        publishAt: pkg.metadata.embargoUntil,
        selfDeclaredMadeForKids: false,
      }
    };
  }

  async publish(pkg: QuipslyPublicPackage): Promise<PublishResult> {
    this.log("info", "Uploading to YouTube API...", { packageId: pkg.id });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    return {
      success: true,
      externalRefId: `yt_mock_${Math.random().toString(36).substring(7)}`,
      url: `https://youtube.com/watch?v=mock_video_id`,
      timestamp: new Date().toISOString(),
    };
  }

  async syncMetrics(externalRefId: string): Promise<MetricSnapshot> {
    return {
      views: Math.floor(Math.random() * 25000) + 5000,
      engagement: Math.floor(Math.random() * 2000),
      retentionScore: Math.floor(Math.random() * 40) + 30, // YouTube retention is usually lower
      revenueCents: Math.floor(Math.random() * 15000), // Monetized!
    };
  }
}

import { PatreonApiClient } from "../patreon/client";
import { PatreonPostCreateRequest } from "../patreon/types";

/**
 * IMPLEMENTATION: Patreon Adapter
 */
export class PatreonAdapter extends DestinationAdapter {
  private client: PatreonApiClient | null = null;

  constructor(connectionKey: string) {
    super("patreon_v2", connectionKey);
    try {
      this.client = new PatreonApiClient();
    } catch (e) {
      this.log("warn", "PatreonApiClient could not be initialized. Missing tokens?");
    }
  }

  supports(kind: string): boolean {
    return true; // Patreon supports basically any post type
  }

  async validate(pkg: QuipslyPublicPackage): Promise<AdapterValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!pkg.overrides?.patreon) {
      warnings.push("No Patreon overrides found. Post will default to public.");
    }

    if (pkg.overrides?.patreon?.isMembersOnly && !pkg.overrides?.patreon?.teaser) {
      warnings.push("Members-only post has no teaser text for public viewers.");
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  async prepare(pkg: QuipslyPublicPackage): Promise<PatreonPostCreateRequest> {
    const isPublic = !pkg.overrides?.patreon?.isMembersOnly;
    const teaser = pkg.overrides?.patreon?.teaser || pkg.summary;

    // Patreon expects HTML for content. If the body is markdown, it might look slightly plain,
    // but Patreon's editor parses basic formatting. For strict compliance, a markdown-to-html
    // converter should be used here if needed.
    const contentHtml = pkg.body.includes("<p>") ? pkg.body : `<p>${pkg.body.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`;

    const campaignId = this.client ? await this.client.getCurrentCampaignId() : "";

    return {
      data: {
        type: "post",
        attributes: {
          title: pkg.title,
          content: isPublic ? contentHtml : `${teaser}<br/><br/><em>Log in or upgrade to view the full content.</em><br/><br/>${contentHtml}`,
          is_public: isPublic,
          teaser_text: teaser,
          tags: ["quipsly-generated", pkg.kind]
        },
        relationships: {
          campaign: {
            data: { id: campaignId, type: "campaign" }
          }
        }
      }
    };
  }

  async publish(pkg: QuipslyPublicPackage): Promise<PublishResult> {
    if (!this.client) {
      return { success: false, error: "Patreon Client not initialized", timestamp: new Date().toISOString() };
    }

    this.log("info", "Drafting Patreon Post...", { packageId: pkg.id });

    try {
      const requestPayload = await this.prepare(pkg);

      // Get the campaign ID from the prepared payload
      const campaignId = requestPayload.data.relationships?.campaign.data.id;
      if (!campaignId) {
        throw new Error("Failed to resolve campaign ID.");
      }

      const response = await this.client.createPost(campaignId, requestPayload);

      return {
        success: true,
        externalRefId: response.data?.id || `patreon_post_${Date.now()}`,
        url: response.data?.attributes?.url || `https://patreon.com/posts/${response.data?.id}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.log("error", "Patreon Publish Failed", { error: error.message });
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async syncMetrics(externalRefId: string): Promise<MetricSnapshot> {
    return {
      views: Math.floor(Math.random() * 500) + 100, // Highly engaged but smaller pool
      engagement: Math.floor(Math.random() * 100),
      revenueCents: 0, // Patreon revenue is usually tracked at membership level, not post level
    };
  }
}

/**
 * Central Dispatcher Service to route packages to appropriate adapters.
 */
export class PublishingDispatcher {
  private adapters: Map<string, DestinationAdapter> = new Map();

  constructor() {
    // Pre-registering mock adapters
    this.adapters.set("podcast_rss", new PodcastRssAdapter());
    this.adapters.set("youtube_v3", new YouTubeAdapter("yt_mock_key"));
    this.adapters.set("patreon_v2", new PatreonAdapter("patreon_mock_key"));
  }

  public getAvailableDestinations(): string[] {
    return Array.from(this.adapters.keys());
  }

  public async validateForDestinations(pkg: QuipslyPublicPackage, destinations: string[]): Promise<Record<string, AdapterValidationResult>> {
    const results: Record<string, AdapterValidationResult> = {};
    for (const dest of destinations) {
      const adapter = this.adapters.get(dest);
      if (adapter) {
        if (!adapter.supports(pkg.kind)) {
          results[dest] = { isValid: false, errors: [`Adapter ${dest} does not support package kind: ${pkg.kind}`], warnings: [] };
        } else {
          results[dest] = await adapter.validate(pkg);
        }
      } else {
        results[dest] = { isValid: false, errors: [`Unknown adapter: ${dest}`], warnings: [] };
      }
    }
    return results;
  }

  public async dispatch(pkg: QuipslyPublicPackage, destinations: string[]): Promise<Record<string, PublishResult>> {
    const results: Record<string, PublishResult> = {};
    for (const dest of destinations) {
      const adapter = this.adapters.get(dest);
      if (adapter) {
        try {
          const validation = await adapter.validate(pkg);
          if (!validation.isValid) {
            results[dest] = { success: false, error: "Validation failed: " + validation.errors.join(", "), timestamp: new Date().toISOString() };
            continue;
          }
          await adapter.prepare(pkg);
          results[dest] = await adapter.publish(pkg);
        } catch (e: any) {
          results[dest] = { success: false, error: e.message, timestamp: new Date().toISOString() };
        }
      } else {
        results[dest] = { success: false, error: `Unknown adapter: ${dest}`, timestamp: new Date().toISOString() };
      }
    }
    return results;
  }
}

export function mapDomainDestinationToLocal(dest: PublishDestinationSlug): PublishingDestination {
  if (dest === "high-ground-odyssey") return "high_ground_odyssey";
  if (dest === "podcast-rss") return "podcast_rss";
  if (dest === "youtube") return "youtube";
  if (dest === "patreon") return "patreon";
  return "high_ground_odyssey"; // fallback
}

export function mapLocalDestinationToDomain(dest: PublishingDestination): PublishDestinationSlug {
  if (dest === "high_ground_odyssey") return "high-ground-odyssey";
  if (dest === "podcast_rss") return "podcast-rss";
  if (dest === "youtube") return "youtube";
  if (dest === "patreon") return "patreon";
  return "high-ground-odyssey"; // fallback
}

export function mapDomainPacketToQuipslyPackage(
  packet: PublicPublishPacket
): QuipslyPublicPackage {
  const audioRef = packet.media.find((m) => m.kind === "audio");
  const videoRef = packet.media.find((m) => m.kind === "video");
  const thumbnailRef = packet.media.find((m) => m.kind === "image" || m.role === "thumbnail");

  const beats: Array<{ title: string; summary: string; timestamp?: number }> = [];
  if (packet.showNotesMarkdown) {
    const lines = packet.showNotesMarkdown.split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*[-\*]\s*(?:\[(\d+):(\d+)\]\s*)?\*\*([^\*]+)\*\*:\s*(.*)$/);
      if (match) {
        const minutes = match[1] ? parseInt(match[1], 10) : 0;
        const seconds = match[2] ? parseInt(match[2], 10) : 0;
        const title = match[3].trim();
        const summary = match[4].trim();
        const timestamp = match[1] ? minutes * 60 + seconds : undefined;
        beats.push({ title, summary, timestamp });
      }
    }
  }

  if (beats.length === 0) {
    beats.push({ title: "Introduction", summary: packet.summary || `Start of ${packet.title}`, timestamp: 0 });
  }

  const destinationsMap: Record<PublishingDestination, PublicationStatus> = {
    high_ground_odyssey: "draft",
    podcast_rss: "draft",
    youtube: "draft",
    patreon: "draft"
  };

  for (const dest of packet.destinations) {
    const statusMap: Record<DestinationPublicationStatus, PublicationStatus> = {
      draft: "draft",
      "packet-ready": "staged",
      queued: "staged",
      published: "published",
      held: "needs review",
      "needs-review": "needs review",
      failed: "failed"
    };
    const localDest = mapDomainDestinationToLocal(dest.destination);
    destinationsMap[localDest] = statusMap[dest.status] || "draft";
  }

  const kindMap: Record<PublishPacketKind, "episode" | "post" | "video" | "newsletter" | "clip"> = {
    "episode-page": "episode",
    "podcast-episode": "episode",
    "youtube-video": "video",
    "social-cut": "clip",
    "quote-feed": "post",
    "book-export": "post",
    "course-export": "post",
    "story-scroll": "post",
    "gallery-proof": "post",
    "manual-package": "post"
  };

  return {
    id: packet.id,
    projectId: packet.source.documentId || packet.source.projectSlug,
    kind: kindMap[packet.kind] || "post",
    title: packet.title,
    summary: packet.summary || "",
    body: packet.bodyMarkdown || "",
    media: {
      audioUrl: audioRef?.url,
      videoUrl: videoRef?.url,
      thumbnailUrl: thumbnailRef?.url,
    },
    beats,
    verifiedQuotes: [],
    overrides: {
      youtube: {
        tags: [],
        chapterMarkers: [],
        isShort: false
      },
      patreon: {
        isMembersOnly: false,
        teaser: packet.summary || "",
        tierId: undefined
      }
    },
    metadata: {
      publishedAt: packet.createdAt,
      author: packet.source.projectSlug,
      destinations: destinationsMap
    }
  };
}

export function mapQuipslyPackageToDomainPacket(
  pkg: QuipslyPublicPackage,
  projectSlug: string
): PublicPublishPacket {
  const mediaRefs: PublishMediaRef[] = [];

  if (pkg.media.audioUrl) {
    mediaRefs.push({
      id: `${pkg.id}-audio`,
      kind: "audio",
      label: "Episode Audio",
      url: pkg.media.audioUrl,
      provider: pkg.media.audioUrl.includes("storage.googleapis.com") ? "gcs" : "external",
      role: "source"
    });
  }

  if (pkg.media.videoUrl) {
    mediaRefs.push({
      id: `${pkg.id}-video`,
      kind: "video",
      label: "Episode Video",
      url: pkg.media.videoUrl,
      provider: pkg.media.videoUrl.includes("youtube.com") ? "youtube" : "external",
      role: "source"
    });
  }

  if (pkg.media.thumbnailUrl) {
    mediaRefs.push({
      id: `${pkg.id}-thumbnail`,
      kind: "image",
      label: "Cover Thumbnail",
      url: pkg.media.thumbnailUrl,
      provider: "external",
      role: "thumbnail"
    });
  }

  const destinations: DestinationPublicationState[] = [];
  if (pkg.metadata.destinations) {
    for (const [destSlug, status] of Object.entries(pkg.metadata.destinations)) {
      const statusMap: Record<PublicationStatus, DestinationPublicationStatus> = {
        draft: "draft",
        staged: "packet-ready",
        published: "published",
        "needs review": "needs-review",
        failed: "failed"
      };
      destinations.push({
        destination: mapLocalDestinationToDomain(destSlug as PublishingDestination),
        status: statusMap[status as PublicationStatus] || "draft"
      });
    }
  } else {
    const statusMap: Record<PublicationStatus, DestinationPublicationStatus> = {
      draft: "draft",
      staged: "packet-ready",
      published: "published",
      "needs review": "needs-review",
      failed: "failed"
    };
    const localStatus = pkg.metadata.status || "draft";
    const mappedStatus = statusMap[localStatus] || "draft";
    destinations.push({ destination: "high-ground-odyssey", status: mappedStatus });
    destinations.push({ destination: "podcast-rss", status: mappedStatus });
    destinations.push({ destination: "youtube", status: "draft" });
    destinations.push({ destination: "patreon", status: "draft" });
  }

  const kindMap: Record<"episode" | "post" | "video" | "newsletter" | "clip", PublishPacketKind> = {
    episode: "episode-page",
    post: "manual-package",
    video: "youtube-video",
    newsletter: "manual-package",
    clip: "social-cut"
  };

  const showNotesMarkdown = pkg.beats.map(b => {
    const timestampStr = b.timestamp
      ? `[${Math.floor(b.timestamp / 60)}:${String(b.timestamp % 60).padStart(2, "0")}] `
      : "";
    return `- ${timestampStr}**${b.title}**: ${b.summary}`;
  }).join("\n");

  return {
    packetVersion: 1,
    id: pkg.id,
    kind: kindMap[pkg.kind] || "manual-package",
    source: {
      projectSlug,
      documentId: pkg.projectId,
    },
    title: pkg.title,
    slug: pkg.id.replace("compiled-", ""),
    summary: pkg.summary,
    bodyMarkdown: pkg.body,
    showNotesMarkdown,
    media: mediaRefs,
    destinations,
    generatedFrom: "quipsly-editor",
    createdAt: pkg.metadata.publishedAt || new Date().toISOString(),
    savedAt: new Date().toISOString()
  };
}

export function validatePublicPublishPacket(
  packet: PublicPublishPacket
): AdapterValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!packet.title) errors.push("Packet title is missing.");
  if (!packet.slug) errors.push("Packet slug is missing.");
  if (!packet.bodyMarkdown) errors.push("Packet body content is missing.");

  const audio = packet.media.find(m => m.kind === "audio");
  if (!audio || !audio.url) {
    warnings.push("No audio track detected in media references.");
  }

  const thumbnail = packet.media.find(m => m.role === "thumbnail" || m.kind === "image");
  if (!thumbnail || !thumbnail.url) {
    warnings.push("No cover thumbnail detected in media references.");
  }

  return { isValid: errors.length === 0, errors, warnings };
}
