/**
 * DestinationAdapters.ts
 * 
 * Core business logic and interfaces for the Publishing Adapters.
 * This represents the abstract contract between Quipsly's public-safe JSON
 * and the chaotic walled gardens of external APIs (YouTube, Patreon, Apple Podcasts).
 */

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
  };
}

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

/**
 * MOCK IMPLEMENTATION: Patreon Adapter
 */
export class PatreonAdapter extends DestinationAdapter {
  constructor(connectionKey: string) {
    super("patreon_v2", connectionKey);
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

  async prepare(pkg: QuipslyPublicPackage): Promise<unknown> {
    return {
      title: pkg.title,
      content: pkg.body,
      is_public: !pkg.overrides?.patreon?.isMembersOnly,
      teaser_text: pkg.overrides?.patreon?.teaser || pkg.summary,
      tags: {
        add: ["quipsly-generated", pkg.kind],
      }
    };
  }

  async publish(pkg: QuipslyPublicPackage): Promise<PublishResult> {
    this.log("info", "Drafting Patreon Post...", { packageId: pkg.id });
    await new Promise((resolve) => setTimeout(resolve, 600));

    return {
      success: true,
      externalRefId: `patreon_post_${Date.now()}`,
      url: `https://patreon.com/posts/mock-post`,
      timestamp: new Date().toISOString(),
    };
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
