export const CONTENT_STUDIO_DOMAIN_VERSION = "content-studio-domain-v0";

export type ContentStudioId = string;
export type ContentStudioIsoDate = string;

export type ContentStudioStatus =
  | "idea"
  | "draft"
  | "active"
  | "blocked"
  | "ready"
  | "published"
  | "archived";

export type ContentStudioWorkflowStage =
  | "research"
  | "structure"
  | "produce"
  | "publish"
  | "learn";

export type ContentStudioCapabilityStatus = "live" | "prototype" | "planned";

export type ContentStudioProjectKind =
  | "book"
  | "speech"
  | "podcast"
  | "video"
  | "travel_video"
  | "course"
  | "campaign"
  | "site"
  | "custom";

export type ContentStudioSourceKind =
  | "manuscript"
  | "interview"
  | "book"
  | "article"
  | "quote_database"
  | "field_note"
  | "media"
  | "web"
  | "custom";

export type ContentStudioPublishingTargetKind =
  | "high_ground_odyssey"
  | "future_site"
  | "social"
  | "email"
  | "kindle"
  | "audible"
  | "patreon"
  | "embed"
  | "custom";

export type ContentStudioAgentTaskKind =
  | "research"
  | "outline"
  | "draft"
  | "examples"
  | "seo"
  | "repurpose"
  | "review"
  | "custom";

export type ContentStudioMetadata = Record<
  string,
  string | number | boolean | null
>;

export interface ContentStudioSpineStage {
  id: ContentStudioWorkflowStage;
  title: string;
  focus: string;
  surfaces: string[];
}

export interface ContentStudioCapability {
  id: ContentStudioId;
  title: string;
  lane: string;
  status: ContentStudioCapabilityStatus;
  summary: string;
  next: string;
}

export interface ContentStudioProject {
  id: ContentStudioId;
  slug: string;
  title: string;
  kind: ContentStudioProjectKind;
  status: ContentStudioStatus;
  currentStage: ContentStudioWorkflowStage;
  ownerLabel?: string;
  summary?: string;
  sourceIds?: ContentStudioId[];
  publishingTargetIds?: ContentStudioId[];
  worldHubFollowThroughId?: ContentStudioId;
  createdAt?: ContentStudioIsoDate;
  updatedAt?: ContentStudioIsoDate;
  metadata?: ContentStudioMetadata;
}

export interface ContentStudioSource {
  id: ContentStudioId;
  projectId?: ContentStudioId;
  title: string;
  kind: ContentStudioSourceKind;
  status: ContentStudioStatus;
  sourceRef?: string;
  rightsStatus?: "unknown" | "private" | "licensed" | "public_safe";
  provenanceNotes?: string;
  metadata?: ContentStudioMetadata;
}

export interface ContentStudioResearchNote {
  id: ContentStudioId;
  projectId: ContentStudioId;
  sourceId?: ContentStudioId;
  title: string;
  body: string;
  status: ContentStudioStatus;
  principleIds?: ContentStudioId[];
  quoteIds?: ContentStudioId[];
  exampleIds?: ContentStudioId[];
  metadata?: ContentStudioMetadata;
}

export interface ContentStudioPrinciple {
  id: ContentStudioId;
  slug: string;
  title: string;
  summary: string;
  status: ContentStudioStatus;
  exampleIds?: ContentStudioId[];
  quoteIds?: ContentStudioId[];
  metadata?: ContentStudioMetadata;
}

export interface ContentStudioExample {
  id: ContentStudioId;
  principleId?: ContentStudioId;
  title: string;
  body: string;
  context?: string;
  sourceId?: ContentStudioId;
  status: ContentStudioStatus;
  metadata?: ContentStudioMetadata;
}

export interface ContentStudioQuote {
  id: ContentStudioId;
  sourceId?: ContentStudioId;
  text: string;
  attribution?: string;
  citation?: string;
  status: ContentStudioStatus;
  metadata?: ContentStudioMetadata;
}

export interface ContentStudioOutline {
  id: ContentStudioId;
  projectId: ContentStudioId;
  title: string;
  status: ContentStudioStatus;
  sections: Array<{
    id: ContentStudioId;
    title: string;
    summary?: string;
    sourceIds?: ContentStudioId[];
  }>;
  metadata?: ContentStudioMetadata;
}

export interface ContentStudioDraft {
  id: ContentStudioId;
  projectId: ContentStudioId;
  title: string;
  status: ContentStudioStatus;
  format: "manuscript" | "script" | "show_notes" | "caption" | "brief" | "custom";
  sourceIds?: ContentStudioId[];
  reviewState?: "unreviewed" | "needs_review" | "approved" | "blocked";
  metadata?: ContentStudioMetadata;
}

export interface ContentStudioProductionTask {
  id: ContentStudioId;
  projectId: ContentStudioId;
  title: string;
  stage: ContentStudioWorkflowStage;
  status: ContentStudioStatus;
  assigneeLabel?: string;
  dueAt?: ContentStudioIsoDate;
  metadata?: ContentStudioMetadata;
}

export interface ContentStudioScheduleItem {
  id: ContentStudioId;
  projectId: ContentStudioId;
  title: string;
  status: ContentStudioStatus;
  targetId?: ContentStudioId;
  scheduledFor?: ContentStudioIsoDate;
  metadata?: ContentStudioMetadata;
}

export interface ContentStudioPublishingTarget {
  id: ContentStudioId;
  projectId?: ContentStudioId;
  title: string;
  kind: ContentStudioPublishingTargetKind;
  status: ContentStudioStatus;
  providerConnectionId?: ContentStudioId;
  externalRef?: string;
  metadata?: ContentStudioMetadata;
}

export interface ContentStudioAnalyticsSnapshot {
  id: ContentStudioId;
  projectId?: ContentStudioId;
  targetId?: ContentStudioId;
  capturedAt: ContentStudioIsoDate;
  status: ContentStudioStatus;
  metrics: Record<string, number>;
  notes?: string;
  metadata?: ContentStudioMetadata;
}

export interface ContentStudioSeoBrief {
  id: ContentStudioId;
  projectId: ContentStudioId;
  title: string;
  status: ContentStudioStatus;
  searchIntent?: string;
  targetQueries?: string[];
  contentGaps?: string[];
  metadata?: ContentStudioMetadata;
}

export interface ContentStudioMarketingCampaign {
  id: ContentStudioId;
  slug: string;
  title: string;
  status: ContentStudioStatus;
  projectIds: ContentStudioId[];
  scheduleItemIds?: ContentStudioId[];
  worldHubOfferIds?: ContentStudioId[];
  metadata?: ContentStudioMetadata;
}

export interface ContentStudioAgentTaskPacket {
  id: ContentStudioId;
  projectId?: ContentStudioId;
  kind: ContentStudioAgentTaskKind;
  goal: string;
  allowedSourceIds: ContentStudioId[];
  excludedSourceIds?: ContentStudioId[];
  outputShape: string;
  reviewRequired: boolean;
  status: ContentStudioStatus;
  metadata?: ContentStudioMetadata;
}

export const CONTENT_STUDIO_SPINE: readonly ContentStudioSpineStage[] = [
  {
    id: "research",
    title: "Research",
    focus: "sources, quotes, examples, principle maps, and Quipsly context",
    surfaces: ["Tagging Desk", "Research assistant", "Quote database"],
  },
  {
    id: "structure",
    title: "Structure",
    focus: "book chapters, talks, episodes, campaigns, and reusable outlines",
    surfaces: ["Structure Mode", "Writing Desk", "Manuscript Desk"],
  },
  {
    id: "produce",
    title: "Produce",
    focus: "drafts, scripts, recording prep, audio/video edits, and review packets",
    surfaces: ["Manuscript Desk", "Show Prep", "Studio exports"],
  },
  {
    id: "publish",
    title: "Publish",
    focus: "site projections, social posts, schedules, direct publishing, and embeds",
    surfaces: ["HGO staging", "Content calendar", "WorldHub embeds"],
  },
  {
    id: "learn",
    title: "Learn",
    focus: "analytics, SEO, marketing loops, supporter signals, and coaching follow-up",
    surfaces: ["WorldHub", "Analytics", "Campaign review"],
  },
];

export const CONTENT_STUDIO_CAPABILITIES: readonly ContentStudioCapability[] = [
  {
    id: "book-writing",
    title: "Book Writing",
    lane: "Writing",
    status: "live",
    summary:
      "Learning to Lead drafts, manuscript snapshots, structure regions, and export handoff.",
    next: "Turn manuscript exports into staged content project packets.",
  },
  {
    id: "speech-writing",
    title: "Speech Writing",
    lane: "Writing",
    status: "prototype",
    summary:
      "Reuse the same source, structure, quote, and example model for talks and scripts.",
    next: "Add talk-shaped project templates beside book-shaped templates.",
  },
  {
    id: "podcast-production",
    title: "Podcast Audio / Video",
    lane: "Production",
    status: "prototype",
    summary:
      "Connect show prep, source clips, talking points, and episode projection review.",
    next: "Create a production checklist model before media editing integrations.",
  },
  {
    id: "travel-video",
    title: "Travel Video",
    lane: "Production",
    status: "planned",
    summary:
      "Plan footage, story arcs, voiceover, edit notes, publishing targets, and follow-up posts.",
    next: "Define a lightweight asset and shot-list contract.",
  },
  {
    id: "social-schedule",
    title: "Social Schedule",
    lane: "Distribution",
    status: "planned",
    summary:
      "Turn long-form work into platform-specific excerpts, captions, and posting windows.",
    next: "Model content calendar items without calling social APIs.",
  },
  {
    id: "analytics-seo",
    title: "Analytics / SEO",
    lane: "Marketing",
    status: "planned",
    summary:
      "Track search intent, page outcomes, content gaps, campaigns, and audience signals.",
    next: "Start with manual metrics snapshots and SEO briefs.",
  },
  {
    id: "quipsly-ai",
    title: "Quipsly AI",
    lane: "Research",
    status: "planned",
    summary:
      "Use quote, principle, example, and research context as agent inputs instead of loose chat.",
    next: "Define agent task packets before connecting live APIs.",
  },
  {
    id: "direct-publishing",
    title: "Kindle / Audible Path",
    lane: "Publishing",
    status: "planned",
    summary:
      "Prepare future package exports for book, audio, metadata, description, and review assets.",
    next: "Document export package requirements before provider automation.",
  },
  {
    id: "worldhub-follow-through",
    title: "WorldHub Follow-through",
    lane: "Business",
    status: "prototype",
    summary:
      "Connect finished content to coaching offers, memberships, merch, Patreon, and embeds.",
    next: "Keep provider adapters out until entitlements and offers are stable.",
  },
];

export function getContentStudioCapabilitySummary(
  capabilities: readonly ContentStudioCapability[] = CONTENT_STUDIO_CAPABILITIES,
) {
  return capabilities.reduce(
    (summary, capability) => {
      summary.total += 1;
      summary[capability.status] += 1;
      return summary;
    },
    {
      total: 0,
      live: 0,
      prototype: 0,
      planned: 0,
    },
  );
}
