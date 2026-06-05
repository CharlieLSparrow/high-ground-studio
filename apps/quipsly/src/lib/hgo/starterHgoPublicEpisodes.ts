import episode1 from "../../../../web/content/publish/hgo-episodes/episode-1-write-it-down.json";
import episode2 from "../../../../web/content/publish/hgo-episodes/episode-2-look-for-lessons.json";
import episode3 from "../../../../web/content/publish/hgo-episodes/episode-3-chub-and-jack.json";

export type HgoStarterPublicEpisodePacket = {
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
    beats: Array<{ title: string; summary: string; timingHint?: string }>;
    voiceCards: Array<{ speaker: "Charlie" | "Homer"; summary: string }>;
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
};

export const HGO_STARTER_PUBLIC_EPISODES = [
  episode1,
  episode2,
  episode3,
] as HgoStarterPublicEpisodePacket[];
