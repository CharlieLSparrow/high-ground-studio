import {
  DESTINATION_PUBLICATION_STATUS_LABELS,
  PUBLISH_DESTINATION_LABELS,
  type DestinationPublicationState,
  type DestinationPublicationStatus,
  type PublishDestinationSlug,
} from "@high-ground/quipsly-domain/publishing";

type LegacyDestination =
  | PublishDestinationSlug
  | "high_ground_odyssey"
  | "youtube_v3"
  | "podcast_rss"
  | "patreon_v2"
  | string;

type LegacyStatus =
  | DestinationPublicationStatus
  | "live"
  | "scheduled"
  | "staged"
  | "needs review"
  | string;

const legacyDestinationMap: Record<string, PublishDestinationSlug> = {
  high_ground_odyssey: "high-ground-odyssey",
  hgo: "high-ground-odyssey",
  youtube_v3: "youtube",
  youtube_short: "youtube-shorts",
  youtube_shorts: "youtube-shorts",
  podcast_rss: "podcast-rss",
  patreon_v2: "patreon",
  instagram_v1: "instagram",
  tiktok_v1: "tiktok",
  facebook_v1: "facebook",
  linkedin_v1: "linkedin",
};

const legacyStatusMap: Record<string, DestinationPublicationStatus> = {
  live: "published",
  published: "published",
  scheduled: "queued",
  queued: "queued",
  staged: "packet-ready",
  ready: "packet-ready",
  "packet-ready": "packet-ready",
  draft: "draft",
  held: "held",
  "needs review": "needs-review",
  "needs-review": "needs-review",
  failed: "failed",
};

export function normalizePublishDestination(value: LegacyDestination): PublishDestinationSlug {
  const normalized = String(value || "").trim().toLowerCase();
  return legacyDestinationMap[normalized] ?? (
    Object.prototype.hasOwnProperty.call(PUBLISH_DESTINATION_LABELS, normalized)
      ? normalized as PublishDestinationSlug
      : "quipsly"
  );
}

export function normalizePublicationStatus(value: LegacyStatus): DestinationPublicationStatus {
  const normalized = String(value || "").trim().toLowerCase();
  return legacyStatusMap[normalized] ?? "needs-review";
}

export function getDestinationLabel(destination: LegacyDestination) {
  return PUBLISH_DESTINATION_LABELS[normalizePublishDestination(destination)];
}

export function getPublicationStatusLabel(status: LegacyStatus) {
  return DESTINATION_PUBLICATION_STATUS_LABELS[normalizePublicationStatus(status)];
}

export function publicationStatusClass(status: LegacyStatus) {
  const normalized = normalizePublicationStatus(status);
  if (normalized === "published") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (normalized === "packet-ready" || normalized === "queued") return "border-amber-200 bg-amber-50 text-amber-800";
  if (normalized === "held") return "border-slate-200 bg-slate-50 text-slate-700";
  if (normalized === "failed" || normalized === "needs-review") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-[#e8dcc4] bg-[#f8f3e6] text-[#8c6b4a]";
}

export function buildDefaultDestinationStates(
  candidateStatus?: string,
): DestinationPublicationState[] {
  const hgoStatus = candidateStatus === "published" ? "published" : "packet-ready";

  return [
    {
      destination: "high-ground-odyssey",
      status: hgoStatus,
      notes: hgoStatus === "published"
        ? "Approved public episode page is live on High Ground Odyssey."
        : "Packet is ready for owner review before public HGO publishing.",
    },
    {
      destination: "youtube",
      status: "draft",
      notes: "Prepare title, description, chapters, clips, and upload metadata.",
    },
    {
      destination: "podcast-rss",
      status: "draft",
      notes: "Needs final audio, show notes, transcript, and RSS episode metadata.",
    },
    {
      destination: "patreon",
      status: "needs-review",
      notes: "Supporter post copy and access rules should be reviewed before publishing.",
    },
  ];
}

export function buildCandidateDestinationStates(candidate: any): DestinationPublicationState[] {
  const existing = candidate?.packet?.destinations ?? candidate?.packet?.destinationStates;
  if (Array.isArray(existing) && existing.length > 0) {
    return existing.map((item) => ({
      ...item,
      destination: normalizePublishDestination(item.destination),
      status: normalizePublicationStatus(item.status),
    }));
  }

  return buildDefaultDestinationStates(candidate?.candidateStatus);
}

export function summarizeDestinationStates(states: DestinationPublicationState[]) {
  return {
    published: states.filter((state) => state.status === "published").length,
    ready: states.filter((state) => state.status === "packet-ready" || state.status === "queued").length,
    needsAttention: states.filter((state) => state.status === "needs-review" || state.status === "failed").length,
  };
}
