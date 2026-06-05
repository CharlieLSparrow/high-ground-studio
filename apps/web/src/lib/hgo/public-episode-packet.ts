export const HGO_PUBLIC_EPISODE_PACKET_KIND = "hgo-public-episode-packet-v1" as const;

/**
 * Defines the strict, immutable boundary between private Quipsly infrastructure and the public HighGroundOdyssey site.
 * 
 * CRITICAL SAAS CONSTRAINT:
 * This packet must NEVER contain raw manuscript data, backstage notes, private PII, or internal drafts. 
 * Any data serialized into this interface is immediately safe for public exposure.
 */
export type HgoPublicEpisodePacket = {
  packetKind: typeof HGO_PUBLIC_EPISODE_PACKET_KIND;
  
  // 1. Core Identity
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

  // 2. Links & Media
  media: {
    heroImageUrl?: string;
    audioUrl?: string;
    youtubeId?: string;
  };

  // 3. Show Notes
  showNotes: {
    beats: Array<{ title: string; summary: string; timingHint?: string; }>;
    voiceCards: Array<{ speaker: "Charlie" | "Homer"; summary: string; }>;
  };

  // 4. Quotes (Verified only)
  quotes: Array<{
    text: string;
    attribution: string;
    context?: string;
  }>;

  // 5. Transcript Excerpt / Essay
  essayVersion: string;

  // 6. Source Provenance
  provenance: {
    sourceArtifactHash: string;
    publishedAt: string;
  };
};

export type HgoPublicEpisodeIndexEntry = {
  id: string;
  slug: string;
  title: string;
  episodeNumber: string;
  summary: string;
  publishedAt: string;
};

export type HgoPublicEpisodePacketValidationResult =
  | { ok: true; packet: HgoPublicEpisodePacket; errors: []; warnings: string[] }
  | { ok: false; packet: null; errors: string[]; warnings: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(record: Record<string, unknown>, key: string, path: string, errors: string[]) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${path}.${key} must be a non-empty string.`);
    return "";
  }
  return value;
}

export function validateHgoPublicEpisodePacket(input: unknown): HgoPublicEpisodePacketValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, packet: null, errors: ["Packet must be a JSON object."], warnings };
  }

  if (input.packetKind !== HGO_PUBLIC_EPISODE_PACKET_KIND) {
    errors.push(`packetKind must be ${HGO_PUBLIC_EPISODE_PACKET_KIND}.`);
  }

  readString(input, "id", "packet", errors);
  readString(input, "slug", "packet", errors);
  readString(input, "title", "packet", errors);
  readString(input, "episodeNumber", "packet", errors);
  readString(input, "summary", "packet", errors);
  
  if (input.publishStatus !== "live" && input.publishStatus !== "archived") {
    errors.push("publishStatus must be 'live' or 'archived'.");
  }

  const media = isRecord(input.media) ? input.media : null;
  if (!media) {
    errors.push("media must be an object.");
  }

  const showNotes = isRecord(input.showNotes) ? input.showNotes : null;
  if (!showNotes) {
    errors.push("showNotes must be an object.");
  } else {
    if (!Array.isArray(showNotes.beats)) {
      errors.push("showNotes.beats must be an array.");
    }
    if (!Array.isArray(showNotes.voiceCards)) {
      errors.push("showNotes.voiceCards must be an array.");
    }
  }

  if (!Array.isArray(input.quotes)) {
    errors.push("quotes must be an array.");
  }

  readString(input, "essayVersion", "packet", errors);

  const provenance = isRecord(input.provenance) ? input.provenance : null;
  if (!provenance) {
    errors.push("provenance must be an object.");
  } else {
    readString(provenance, "sourceArtifactHash", "provenance", errors);
    readString(provenance, "publishedAt", "provenance", errors);
  }

  if (errors.length) {
    return { ok: false, packet: null, errors, warnings };
  }

  return { ok: true, packet: input as HgoPublicEpisodePacket, errors: [], warnings };
}

export function parseHgoPublicEpisodePacket(json: string): HgoPublicEpisodePacketValidationResult {
  try {
    return validateHgoPublicEpisodePacket(JSON.parse(json));
  } catch (err) {
    return { ok: false, packet: null, errors: ["Invalid JSON format."], warnings: [] };
  }
}
