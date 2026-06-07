export type PublishDestinationSlug =
  | "high-ground-odyssey"
  | "quipsly"
  | "quiplore"
  | "podcast-rss"
  | "youtube"
  | "youtube-shorts"
  | "patreon"
  | "instagram"
  | "tiktok"
  | "facebook"
  | "linkedin"
  | "kindle"
  | "scorm"
  | "gallery";

export type PublishPacketKind =
  | "episode-page"
  | "podcast-episode"
  | "youtube-video"
  | "social-cut"
  | "quote-feed"
  | "book-export"
  | "course-export"
  | "story-scroll"
  | "gallery-proof"
  | "manual-package";

export type DestinationPublicationStatus =
  | "draft"
  | "packet-ready"
  | "queued"
  | "published"
  | "held"
  | "needs-review"
  | "failed";

export type PublishSourceRef = {
  readonly projectSlug: string;
  readonly documentId?: string;
  readonly documentStableId?: string;
  readonly episodeSlug?: string;
  readonly chapterSlug?: string;
  readonly sourceBlockIds?: readonly string[];
};

export type PublishMediaRef = {
  readonly id: string;
  readonly kind: "audio" | "video" | "image" | "embed" | "document" | "other";
  readonly label: string;
  readonly url?: string;
  readonly provider?: "gcs" | "youtube" | "vimeo" | "external" | "local";
  readonly role?: "hero" | "embed" | "download" | "thumbnail" | "source";
};

export type DestinationPublicationState = {
  readonly destination: PublishDestinationSlug;
  readonly status: DestinationPublicationStatus;
  readonly remoteUrl?: string;
  readonly remoteId?: string;
  readonly lastAttemptAt?: string;
  readonly publishedAt?: string;
  readonly error?: string;
  readonly notes?: string;
};

export type PublicPublishPacket = {
  readonly packetVersion: 1;
  readonly id: string;
  readonly kind: PublishPacketKind;
  readonly source: PublishSourceRef;
  readonly title: string;
  readonly slug: string;
  readonly summary?: string;
  readonly bodyMarkdown?: string;
  readonly showNotesMarkdown?: string;
  readonly media: readonly PublishMediaRef[];
  readonly destinations: readonly DestinationPublicationState[];
  readonly generatedFrom: "manual" | "quipsly-editor" | "episode-production" | "agent-proposal";
  readonly createdAt: string;
  readonly savedAt: string;
};

export const PUBLISH_DESTINATION_LABELS: Record<PublishDestinationSlug, string> = {
  "high-ground-odyssey": "High Ground Odyssey",
  quipsly: "Quipsly",
  quiplore: "QuipLore",
  "podcast-rss": "Podcast RSS",
  youtube: "YouTube",
  "youtube-shorts": "YouTube Shorts",
  patreon: "Patreon",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  kindle: "Kindle",
  scorm: "SCORM",
  gallery: "Gallery",
};

export const DESTINATION_PUBLICATION_STATUS_LABELS: Record<
  DestinationPublicationStatus,
  string
> = {
  draft: "Draft",
  "packet-ready": "Packet ready",
  queued: "Queued",
  published: "Published",
  held: "Held",
  "needs-review": "Needs review",
  failed: "Failed",
};

export function createDestinationPublicationState(
  destination: PublishDestinationSlug,
  status: DestinationPublicationStatus = "draft",
): DestinationPublicationState {
  return { destination, status };
}

export function isPublishedDestination(state: DestinationPublicationState) {
  return state.status === "published" && Boolean(state.remoteUrl || state.remoteId);
}

export function isSafeToShowPublicly(packet: PublicPublishPacket) {
  return packet.destinations.some((destination) => destination.status === "published");
}

export function summarizePublicationState(packet: PublicPublishPacket) {
  const published = packet.destinations.filter((destination) => destination.status === "published");
  const needsAttention = packet.destinations.filter((destination) =>
    destination.status === "failed" || destination.status === "needs-review"
  );
  const ready = packet.destinations.filter((destination) => destination.status === "packet-ready");

  return {
    publishedCount: published.length,
    readyCount: ready.length,
    needsAttentionCount: needsAttention.length,
    publishedLabels: published.map((destination) => PUBLISH_DESTINATION_LABELS[destination.destination]),
    needsAttentionLabels: needsAttention.map((destination) => PUBLISH_DESTINATION_LABELS[destination.destination]),
  };
}
