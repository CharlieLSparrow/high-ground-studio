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

export type QuipslyOutputStatus =
  | "live"
  | "beta-ready"
  | "prototype"
  | "planned";

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
  readonly status: QuipslyOutputStatus;
  readonly priority: "now" | "next" | "later";
  readonly description: string;
  readonly sourceInputs: readonly string[];
  readonly packetShape: readonly string[];
  readonly publishTargets: readonly string[];
  readonly visualRoles: readonly QuipslyArtRole[];
  readonly humanPromise: string;
};

export type QuipslyOutputReadinessPlan = {
  readonly outputId: string;
  readonly title: string;
  readonly readinessSummary: string;
  readonly requiredInputs: readonly {
    readonly label: string;
    readonly status: "available" | "needs-source" | "needs-review";
    readonly note: string;
  }[];
  readonly safeNextActions: readonly string[];
  readonly operatorWarning: string;
};

export type QuipslyOutputPacketSkeleton = {
  readonly version: 1;
  readonly outputId: string;
  readonly title: string;
  readonly createdAt: string;
  readonly fields: Record<string, null>;
  readonly provenance: {
    readonly source: "quipsly-output-catalog";
    readonly status: QuipslyOutputStatus;
    readonly note: string;
  };
};

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

export const OUTPUT_STATUS_LABELS: Record<QuipslyOutputStatus, string> = {
  live: "Live",
  "beta-ready": "Beta ready",
  prototype: "Prototype",
  planned: "Planned",
};

export const QUIPSLY_OUTPUT_CATALOG: readonly QuipslyOutputDefinition[] = [
  {
    id: "hgo-episode-page",
    title: "High Ground Odyssey episode page",
    family: "owned-site",
    status: "live",
    priority: "now",
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
    status: "prototype",
    priority: "now",
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
    status: "prototype",
    priority: "now",
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
    status: "planned",
    priority: "next",
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
    status: "planned",
    priority: "next",
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
    status: "beta-ready",
    priority: "now",
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
    status: "prototype",
    priority: "next",
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
    status: "planned",
    priority: "later",
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
    status: "planned",
    priority: "next",
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
    status: "planned",
    priority: "next",
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
    status: "planned",
    priority: "later",
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

export function getOutputStatusLabel(status: QuipslyOutputStatus) {
  return OUTPUT_STATUS_LABELS[status];
}

export function getOutputFamilyLabel(family: QuipslyOutputFamily) {
  return OUTPUT_FAMILY_LABELS[family];
}

export function listOutputsByPriority(priority: QuipslyOutputDefinition["priority"]) {
  return QUIPSLY_OUTPUT_CATALOG.filter((output) => output.priority === priority);
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

export function createOutputReadinessPlan(output: QuipslyOutputDefinition): QuipslyOutputReadinessPlan {
  const implementationNote =
    output.status === "live"
      ? "This output has a working public path and should be treated as real production infrastructure."
      : output.status === "beta-ready"
        ? "This output is close enough for beta testing but should keep safe review and rollback language visible."
        : output.status === "prototype"
          ? "This output has enough structure to build against, but final publishing should remain explicitly reviewed."
          : "This output is planned; use this page as the product contract before building the implementation.";

  return {
    outputId: output.id,
    title: output.title,
    readinessSummary: implementationNote,
    requiredInputs: output.sourceInputs.map((input, index) => ({
      label: input,
      status: index === 0 ? "available" : output.status === "planned" ? "needs-source" : "needs-review",
      note:
        index === 0
          ? "Primary source spine for this output."
          : "Confirm this source exists and is public-safe before publishing.",
    })),
    safeNextActions: [
      "Open the source Nest or document and confirm the relevant tags/boundaries exist.",
      "Review the packet shape and fill missing metadata before destination publishing.",
      "Generate or select a visual helper brief if the output needs artwork or social presentation.",
      "Preview the output packet before any destructive publish action.",
    ],
    operatorWarning:
      "Outputs are projections from a Nest. Do not copy content into a separate silo unless this catalog contract cannot represent the workflow.",
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
      status: output.status,
      note: "This is a starter packet shape, not a published artifact. Fill from a Nest/source spine and review before destination publishing.",
    },
  };
}
