export type HgoProjectionStatus =
  | "synthetic"
  | "staged"
  | "live"
  | "archived";

export type HgoProjectionVisibility = "private" | "staged" | "public";

export type HgoContentScope =
  | "book-only"
  | "episode-only"
  | "book-and-episode"
  | "internal";

export type HgoAudioState = "not-recorded" | "recorded" | "published";

export type HgoCitationState =
  | "synthetic"
  | "needs-source"
  | "needs-review"
  | "verified"
  | "do-not-use";

export type HgoSourceNoteStatus =
  | "synthetic"
  | "needs-review"
  | "verified"
  | "do-not-use";

export type HgoProjectionFilter =
  | "all"
  | HgoContentScope
  | "public-safe";

export type HgoEpisodeProjection = {
  id: string;
  status: HgoProjectionStatus;
  visibility: HgoProjectionVisibility;
  slug: string;
  episodeNumber: string;
  title: string;
  subtitle: string;
  summary: string;
  thesis: string;
  lifecycleNote: string;
  hero: {
    eyebrow: string;
    visualPrompt: string;
    colorMood: string;
  };
  audio: {
    state: HgoAudioState;
    placeholderLabel: string;
    durationLabel?: string;
    url?: string;
  };
  scopes: HgoContentScope[];
  beats: Array<{
    title: string;
    summary: string;
    scope: HgoContentScope;
    timingHint?: string;
  }>;
  voiceCards: Array<{
    speaker: "Charlie" | "Homer";
    summary: string;
  }>;
  pullQuotes: Array<{
    text: string;
    attribution: string;
    citationState: HgoCitationState;
  }>;
  sourceNotes: Array<{
    label: string;
    detail: string;
    status: HgoSourceNoteStatus;
  }>;
  relatedBookChapter?: {
    title: string;
    summary: string;
    status: HgoProjectionStatus;
  };
  backstageNotes: Array<{
    label: string;
    note: string;
  }>;
  navigation?: {
    previousSlug?: string;
    nextSlug?: string;
  };
  projectionSource?: {
    bridgeVersion: "studio-browser-v1" | "synthetic-fixture-v1";
    generatedAt: string;
    sourceFileName?: string;
  };
};

export type HgoProjectionMapStats = {
  total: number;
  byStatus: Record<HgoProjectionStatus, number>;
  byVisibility: Record<HgoProjectionVisibility, number>;
  byScope: Record<HgoContentScope, number>;
};

export const HGO_PROJECTION_FILTERS: Array<{
  id: HgoProjectionFilter;
  label: string;
  description: string;
}> = [
  {
    id: "all",
    label: "All",
    description: "Every projection in the current preview set.",
  },
  {
    id: "book-only",
    label: "Book-only",
    description: "Material that belongs to the book map without an episode page yet.",
  },
  {
    id: "episode-only",
    label: "Episode-only",
    description: "Material shaped mainly for an audio episode.",
  },
  {
    id: "book-and-episode",
    label: "Both",
    description: "Material that should travel between book and episode lenses.",
  },
  {
    id: "internal",
    label: "Internal",
    description: "Private or staged material for Homer and Charlie before release.",
  },
  {
    id: "public-safe",
    label: "Public-safe",
    description: "Live public projections with verified citation state only.",
  },
];

export function getProjectionMapStats(
  projections: HgoEpisodeProjection[],
): HgoProjectionMapStats {
  const byStatus: HgoProjectionMapStats["byStatus"] = {
    synthetic: 0,
    staged: 0,
    live: 0,
    archived: 0,
  };
  const byVisibility: HgoProjectionMapStats["byVisibility"] = {
    private: 0,
    staged: 0,
    public: 0,
  };
  const byScope: HgoProjectionMapStats["byScope"] = {
    "book-only": 0,
    "episode-only": 0,
    "book-and-episode": 0,
    internal: 0,
  };

  for (const projection of projections) {
    byStatus[projection.status] += 1;
    byVisibility[projection.visibility] += 1;

    for (const scope of projection.scopes) {
      byScope[scope] += 1;
    }
  }

  return {
    total: projections.length,
    byStatus,
    byVisibility,
    byScope,
  };
}

export function isPublicSafeProjection(projection: HgoEpisodeProjection) {
  return (
    projection.visibility === "public" &&
    projection.status === "live" &&
    projection.pullQuotes.every((quote) => quote.citationState === "verified") &&
    projection.sourceNotes.every((note) => note.status === "verified")
  );
}

export function projectionMatchesFilter(
  projection: HgoEpisodeProjection,
  filter: HgoProjectionFilter,
) {
  if (filter === "all") {
    return true;
  }

  if (filter === "public-safe") {
    return isPublicSafeProjection(projection);
  }

  return projection.scopes.includes(filter);
}
