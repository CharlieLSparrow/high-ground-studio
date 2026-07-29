import type { QuipslyArtRole } from "./art-recipes";

export type QuipslyOutputFamily =
  | "owned-site"
  | "audio-video"
  | "social"
  | "learning"
  | "publishing"
  | "quotes"
  | "visual-story"
  | "client-gallery"
  | "community";

/**
 * How complete the static capability definition is.
 *
 * This is deliberately not a runtime, publication, provider, or artifact
 * status. Current operational truth belongs to persisted packets, attempts,
 * external-artifact receipts, and live provider checks.
 */
export type QuipslyOutputCatalogStage =
  | "runway-mapped"
  | "contract-defined"
  | "workflow-draft"
  | "concept-only";

export type QuipslyOutputRoadmapHorizon = "active-design" | "near-term" | "explore-later";

export type QuipslyNestKind =
  | "writing"
  | "study"
  | "production"
  | "research"
  | "fiction"
  | "course"
  | "gallery"
  | "mixed";

export type QuipslyOutputDefinition = {
  readonly id: string;
  readonly title: string;
  readonly family: QuipslyOutputFamily;
  readonly catalogStage: QuipslyOutputCatalogStage;
  readonly roadmapHorizon: QuipslyOutputRoadmapHorizon;
  readonly description: string;
  readonly sourceInputs: readonly string[];
  readonly packetShape: readonly string[];
  readonly publishTargets: readonly string[];
  readonly visualRoles: readonly QuipslyArtRole[];
  readonly humanPromise: string;
};

export type QuipslyOutputCapabilityPlan = {
  readonly outputId: string;
  readonly title: string;
  readonly definitionSummary: string;
  readonly requiredInputs: readonly {
    readonly label: string;
    readonly catalogRole: "primary-source-spine" | "supporting-input";
    readonly evidenceState: "not-checked";
    readonly note: string;
  }[];
  readonly safeNextActions: readonly string[];
  readonly operatorBoundary: string;
};

export type QuipslyOutputPacketSkeleton = {
  readonly version: 1;
  readonly outputId: string;
  readonly title: string;
  readonly createdAt: string;
  readonly fields: Record<string, null>;
  readonly provenance: {
    readonly source: "quipsly-output-catalog";
    readonly catalogStage: QuipslyOutputCatalogStage;
    readonly note: string;
  };
};

export const QUIPSLY_OUTPUT_CATALOG_BOUNDARY = {
  kind: "quipsly-output-capability-roadmap-v1",
  scope: "Static product capability definitions and roadmap horizons only.",
  provesProducedArtifact: false,
  provesPersistedPacket: false,
  provesPublication: false,
  provesProviderConnection: false,
  provesServiceHealth: false,
  operationalTruth:
    "Use the Publishing runway for accessible-Nest packet, attempt, and external-artifact records. Recheck provider URLs and service health separately.",
} as const;

export const OUTPUT_FAMILY_LABELS: Record<QuipslyOutputFamily, string> = {
  "owned-site": "Owned sites",
  "audio-video": "Audio and video",
  social: "Social publishing",
  learning: "Learning products",
  publishing: "Books and articles",
  quotes: "Quotes and lore",
  "visual-story": "Visual story formats",
  "client-gallery": "Client galleries",
  community: "Community and supporters",
};

export const OUTPUT_CATALOG_STAGE_LABELS: Record<QuipslyOutputCatalogStage, string> = {
  "runway-mapped": "Review runway mapped",
  "contract-defined": "Packet contract defined",
  "workflow-draft": "Workflow draft",
  "concept-only": "Concept map",
};

export const OUTPUT_ROADMAP_HORIZON_LABELS: Record<QuipslyOutputRoadmapHorizon, string> = {
  "active-design": "Active design",
  "near-term": "Near-term design",
  "explore-later": "Explore later",
};

export const QUIPSLY_OUTPUT_CATALOG: readonly QuipslyOutputDefinition[] = [
  {
    id: "hgo-episode-page",
    title: "High Ground Odyssey episode page",
    family: "owned-site",
    catalogStage: "runway-mapped",
    roadmapHorizon: "active-design",
    description: "A public episode page with video hero, show notes, quotes, essay/body, provenance, and support CTA.",
    sourceInputs: ["Manuscript episode boundary", "Public-safe publish packet", "YouTube ID", "Show notes", "Quotes"],
    packetShape: ["title", "slug", "summary", "media.youtubeId", "showNotes", "quotes", "body", "provenance"],
    publishTargets: ["HighGroundOdyssey.com", "Public HGO API"],
    visualRoles: ["producer", "publisher"],
    humanPromise: "Write and tag once in Nest, then publish a public-safe episode page without exposing private notes.",
  },
  {
    id: "podcast-rss-episode",
    title: "Podcast RSS episode",
    family: "audio-video",
    catalogStage: "workflow-draft",
    roadmapHorizon: "active-design",
    description: "An RSS-ready podcast package with final audio, title, description, chapters, transcript, and artwork.",
    sourceInputs: ["Recording spine", "Final audio", "Episode manuscript", "Transcript", "Show notes"],
    packetShape: ["audioUrl", "duration", "title", "description", "chapters", "transcript", "episodeArtwork"],
    publishTargets: ["Owned RSS feed", "Apple Podcasts", "Spotify"],
    visualRoles: ["producer"],
    humanPromise: "Keep the episode writing, audio, and notes connected all the way to the feed.",
  },
  {
    id: "youtube-video-package",
    title: "YouTube video package",
    family: "audio-video",
    catalogStage: "workflow-draft",
    roadmapHorizon: "active-design",
    description: "A YouTube upload package with title, description, chapters, thumbnail, source clips, and render metadata.",
    sourceInputs: ["Timeline", "Media assets", "Transcript", "Episode notes", "Thumbnail art"],
    packetShape: ["videoFile", "title", "description", "chapters", "tags", "thumbnail", "visibility"],
    publishTargets: ["YouTube"],
    visualRoles: ["producer", "publisher"],
    humanPromise: "Make YouTube publishing feel like a checklist attached to the episode, not a separate panic chamber.",
  },
  {
    id: "social-cuts",
    title: "Shorts, Reels, and social cuts",
    family: "social",
    catalogStage: "contract-defined",
    roadmapHorizon: "active-design",
    description: "Vertical or square short-form clips from the same source timeline, with captions and platform-native metadata.",
    sourceInputs: ["Marked clip cue", "Transcript range", "Timeline segment", "Quote or hook"],
    packetShape: ["aspectRatio", "clipRange", "captionText", "platformCopy", "hashtags", "safeTitle"],
    publishTargets: ["YouTube Shorts", "Instagram Reels", "TikTok", "Facebook", "LinkedIn"],
    visualRoles: ["publisher", "quote-curator"],
    humanPromise: "Turn moments you already marked while writing/editing into native platform posts.",
  },
  {
    id: "gif-loop",
    title: "GIF or looping clip",
    family: "social",
    catalogStage: "concept-only",
    roadmapHorizon: "near-term",
    description: "A lightweight loop from uploaded media, or a YouTube timestamp embed loop before true GIF export is available.",
    sourceInputs: ["Media segment", "YouTube timestamp range", "Caption", "Visual crop"],
    packetShape: ["sourceUrl", "startSeconds", "endSeconds", "loopMode", "caption", "exportFormat"],
    publishTargets: ["Nest chat", "QuipLore", "Social posts", "Internal project comments"],
    visualRoles: ["producer"],
    humanPromise: "Make a tiny shareable visual moment from the same timeline instead of opening a separate tool.",
  },
  {
    id: "patreon-post",
    title: "Patreon support post",
    family: "community",
    catalogStage: "contract-defined",
    roadmapHorizon: "active-design",
    description: "A supporter-facing post package with episode notes, behind-the-scenes context, links, and access language.",
    sourceInputs: ["Episode packet", "Behind-the-scenes notes", "Support CTA", "Media links"],
    packetShape: ["title", "bodyMarkdown", "visibility", "links", "attachments", "publishStatus"],
    publishTargets: ["Patreon"],
    visualRoles: ["publisher", "scribe"],
    humanPromise: "Prepare the supporter post in Quipsly while keeping Patreon as a destination, not the app source of truth.",
  },
  {
    id: "quote-feed",
    title: "QuipLore quote feed",
    family: "quotes",
    catalogStage: "workflow-draft",
    roadmapHorizon: "near-term",
    description: "Verified quote cards and lorelists powered by source-aware research packets.",
    sourceInputs: ["Quote overlay", "Citation", "Source document", "Theme tags", "Visual companion"],
    packetShape: ["quoteText", "person", "source", "verificationStatus", "contextNote", "visual"],
    publishTargets: ["QuipLore.com", "Quote API", "Social cards"],
    visualRoles: ["quote-curator", "librarian"],
    humanPromise: "Save, curate, and share quotes with provenance instead of trusting random internet quote soup.",
  },
  {
    id: "book-export",
    title: "Book and Kindle export",
    family: "publishing",
    catalogStage: "concept-only",
    roadmapHorizon: "explore-later",
    description: "A clean book manuscript projection from the living document, excluding show notes and production scaffolding.",
    sourceInputs: ["Chapter boundaries", "Book-mode lens", "Front/back matter", "Approved text"],
    packetShape: ["chapters", "frontMatter", "backMatter", "toc", "exportFormat", "styleGuide"],
    publishTargets: ["PDF", "EPUB", "Kindle", "Print prep"],
    visualRoles: ["scribe", "librarian"],
    humanPromise: "Publish the book from the same manuscript without copying text into a second writing silo.",
  },
  {
    id: "scorm-course",
    title: "SCORM course package",
    family: "learning",
    catalogStage: "contract-defined",
    roadmapHorizon: "active-design",
    description: "A standards-aware course export built from lessons, examples, quizzes, cards, and media cues.",
    sourceInputs: ["Study document", "Lesson tags", "Quiz tags", "Media clips", "Learning objectives"],
    packetShape: ["manifest", "lessons", "quizItems", "media", "completionRules", "analyticsHooks"],
    publishTargets: ["SCORM LMS", "Mobile lesson viewer", "Course site"],
    visualRoles: ["teacher", "librarian"],
    humanPromise: "Turn wisdom and examples into teachable sequences without leaving the source graph.",
  },
  {
    id: "story-scroll",
    title: "Story, comic, and lesson scroll",
    family: "visual-story",
    catalogStage: "contract-defined",
    roadmapHorizon: "active-design",
    description: "A vertical/horizontal scrolling experience for stories, comics, courses, photo essays, and dopamine-friendly lessons.",
    sourceInputs: ["Story beats", "Panels", "Images", "Quiz cards", "Media cues"],
    packetShape: ["sections", "cards", "horizontalGroups", "media", "interactionRules"],
    publishTargets: ["Quipsly scroll viewer", "Course viewer", "Comic/story page"],
    visualRoles: ["teacher", "gallery-guide"],
    humanPromise: "Use one interaction engine for courses, comics, story packages, quote journeys, and photo narratives.",
  },
  {
    id: "photo-gallery-review",
    title: "Photo client gallery review",
    family: "client-gallery",
    catalogStage: "concept-only",
    roadmapHorizon: "explore-later",
    description: "A client-facing review package with grouped photos, ratings, comments, selects, and delivery status.",
    sourceInputs: ["Photo assets", "Gallery groups", "Client comments", "Select tags", "Delivery notes"],
    packetShape: ["collections", "assets", "ratings", "comments", "approvalState", "deliveryOptions"],
    publishTargets: ["Client gallery", "Private proofing link"],
    visualRoles: ["gallery-guide"],
    humanPromise: "Make photography review another skin on the same source/selection/comment engine.",
  },
];

export const OUTPUT_IDS_BY_NEST_KIND: Record<QuipslyNestKind, readonly string[]> = {
  writing: ["book-export", "hgo-episode-page", "patreon-post"],
  study: ["scorm-course", "quote-feed", "story-scroll"],
  production: ["youtube-video-package", "podcast-rss-episode", "social-cuts", "gif-loop"],
  research: ["quote-feed", "scorm-course", "hgo-episode-page"],
  fiction: ["book-export", "story-scroll", "social-cuts"],
  course: ["scorm-course", "story-scroll", "patreon-post"],
  gallery: ["photo-gallery-review", "story-scroll", "social-cuts"],
  mixed: ["hgo-episode-page", "youtube-video-package", "quote-feed"],
};

export function getOutputCatalogStageLabel(stage: QuipslyOutputCatalogStage) {
  return OUTPUT_CATALOG_STAGE_LABELS[stage];
}

export function getOutputRoadmapHorizonLabel(horizon: QuipslyOutputRoadmapHorizon) {
  return OUTPUT_ROADMAP_HORIZON_LABELS[horizon];
}

export function getOutputFamilyLabel(family: QuipslyOutputFamily) {
  return OUTPUT_FAMILY_LABELS[family];
}

export function listOutputsByRoadmapHorizon(horizon: QuipslyOutputRoadmapHorizon) {
  return QUIPSLY_OUTPUT_CATALOG.filter((output) => output.roadmapHorizon === horizon);
}

export function normalizeOutputNestKind(kind: string | null | undefined): QuipslyNestKind {
  const normalized = String(kind ?? "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(OUTPUT_IDS_BY_NEST_KIND, normalized)) {
    return normalized as QuipslyNestKind;
  }
  return "mixed";
}

export function listOutputsForNestKind(kind: string | null | undefined) {
  const normalized = normalizeOutputNestKind(kind);
  const outputIds = new Set(OUTPUT_IDS_BY_NEST_KIND[normalized]);
  return QUIPSLY_OUTPUT_CATALOG.filter((output) => outputIds.has(output.id));
}

export function getOutputDefinition(outputId: string) {
  return QUIPSLY_OUTPUT_CATALOG.find((output) => output.id === outputId) ?? null;
}

export function createOutputCapabilityPlan(output: QuipslyOutputDefinition): QuipslyOutputCapabilityPlan {
  const implementationNote =
    output.catalogStage === "runway-mapped"
      ? "A review runway is mapped for this capability. That map is not evidence that an artifact exists, a provider is reachable, or publication succeeded."
      : output.catalogStage === "contract-defined"
        ? "The intended packet contract is defined. Implementation and destination evidence must still come from operational records."
        : output.catalogStage === "workflow-draft"
          ? "The intended workflow and packet shape are drafted. Treat them as architecture, not as a working integration."
          : "This is a concept map for future product work, not an implemented or available output.";

  return {
    outputId: output.id,
    title: output.title,
    definitionSummary: implementationNote,
    requiredInputs: output.sourceInputs.map((input, index) => ({
      label: input,
      catalogRole: index === 0 ? "primary-source-spine" : "supporting-input",
      evidenceState: "not-checked",
      note:
        index === 0
          ? "Intended primary source spine. This catalog does not check whether it currently exists."
          : "Required supporting input. Confirm it exists, is current, and is safe before creating a real packet.",
    })),
    safeNextActions: [
      "Open the source Nest or document and confirm the relevant tags/boundaries exist.",
      "Review the packet shape and fill missing metadata before destination publishing.",
      "Generate or select a visual helper brief if the output needs artwork or social presentation.",
      "Preview the output packet before any destructive publish action.",
    ],
    operatorBoundary:
      "This page defines a projection from a Nest. It does not create, persist, publish, schedule, connect, or health-check anything. Use receipt-backed operational records before making an external-effect claim.",
  };
}

export function createOutputPacketSkeleton(
  output: QuipslyOutputDefinition,
  now = new Date(),
): QuipslyOutputPacketSkeleton {
  return {
    version: 1,
    outputId: output.id,
    title: output.title,
    createdAt: now.toISOString(),
    fields: Object.fromEntries(output.packetShape.map((field) => [field, null])),
    provenance: {
      source: "quipsly-output-catalog",
      catalogStage: output.catalogStage,
      note: "This is a starter packet shape, not a published artifact. Fill from a Nest/source spine and review before destination publishing.",
    },
  };
}
