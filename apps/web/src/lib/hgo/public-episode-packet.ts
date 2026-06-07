import type { PublicPublishPacket } from "@high-ground/quipsly-domain/publishing";
import { getOutputDefinition } from "@high-ground/quipsly-domain/output-catalog";

export const HGO_PUBLIC_EPISODE_PACKET_KIND = "hgo-public-episode-packet-v1" as const;
export const HGO_PUBLIC_EPISODE_OUTPUT_ID = "hgo-episode-page" as const;

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

  outputContract?: {
    outputId: typeof HGO_PUBLIC_EPISODE_OUTPUT_ID;
    title: string;
    sourceSystem: "quipsly-output-catalog";
    packetShape: string[];
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

export function getHgoPublicEpisodeOutputContract() {
  const output = getOutputDefinition(HGO_PUBLIC_EPISODE_OUTPUT_ID);
  return {
    outputId: HGO_PUBLIC_EPISODE_OUTPUT_ID,
    title: output?.title ?? "High Ground Odyssey episode page",
    sourceSystem: "quipsly-output-catalog" as const,
    packetShape: output ? [...output.packetShape] : [],
  };
}

export function convertPublicPublishPacketToHgoPacket(packet: PublicPublishPacket): HgoPublicEpisodePacket {
  let episodeNumber = "1";
  const numMatch = packet.slug.match(/episode-(\d+)/i);
  if (numMatch) {
    episodeNumber = numMatch[1];
  }

  const hgoState = packet.destinations.find((d) => d.destination === "high-ground-odyssey");
  const publishStatus = hgoState?.status === "published" ? "live" : "archived";

  const heroMedia = packet.media.find((m) => m.role === "hero");

  const heroImage = packet.media.find((m) => m.kind === "image" && (m.role === "hero" || m.role === "thumbnail"));
  const audio = packet.media.find((m) => m.kind === "audio");
  const youtube = packet.media.find((m) => m.provider === "youtube" || m.kind === "video");

  let youtubeId: string | undefined = undefined;
  if (youtube?.url) {
    const match = youtube.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\/\s]+)/);
    if (match) {
      youtubeId = match[1];
    }
  }

  const beats: Array<{ title: string; summary: string; timingHint?: string }> = [];
  const voiceCards: Array<{ speaker: "Charlie" | "Homer"; summary: string }> = [];

  if (packet.showNotesMarkdown) {
    const lines = packet.showNotesMarkdown.split("\n");
    let currentBeat: { title: string; summary: string; timingHint?: string } | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const match = trimmed.match(/^(?:###|##|\*)\s+(?:\[([\d:]+)\]\s+)?(.+)/);
      if (match) {
        if (currentBeat) beats.push(currentBeat);
        currentBeat = {
          title: match[2].replace(/\*\*|_/g, "").trim(),
          summary: "",
          timingHint: match[1] || undefined,
        };
      } else if (currentBeat) {
        currentBeat.summary += (currentBeat.summary ? " " : "") + trimmed;
      }

      const speakerMatch = trimmed.match(/^(Homer|Charlie):\s+(.+)/i);
      if (speakerMatch) {
        const speakerName = speakerMatch[1].toLowerCase() === "homer" ? "Homer" : "Charlie";
        voiceCards.push({
          speaker: speakerName,
          summary: speakerMatch[2].trim(),
        });
      }
    }
    if (currentBeat) beats.push(currentBeat);
  }

  const quotes: Array<{ text: string; attribution: string; context?: string }> = [];
  if (packet.bodyMarkdown) {
    const lines = packet.bodyMarkdown.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith(">")) {
        const quoteText = trimmed.slice(1).replace(/^["']|["']$/g, "").trim();
        if (quoteText) {
          quotes.push({
            text: quoteText,
            attribution: "Scott & Charlie",
          });
        }
      }
    }
  }

  return {
    packetKind: HGO_PUBLIC_EPISODE_PACKET_KIND,
    id: packet.id,
    slug: packet.slug,
    title: packet.title,
    subtitle: packet.title.split(": ")[1],
    episodeNumber,
    summary: packet.summary ?? "",
    publishStatus,
    hero: {
      eyebrow: "High Ground Odyssey",
      colorMood: "warm sunrise / field journal",
      assetUrl: heroMedia?.url,
    },
    media: {
      heroImageUrl: heroImage?.url,
      audioUrl: audio?.url,
      youtubeId,
    },
    showNotes: {
      beats,
      voiceCards,
    },
    quotes,
    essayVersion: packet.bodyMarkdown ?? "",
    provenance: {
      sourceArtifactHash: packet.source.documentStableId ?? packet.id,
      publishedAt: packet.createdAt,
    },
    outputContract: getHgoPublicEpisodeOutputContract(),
  };
}
