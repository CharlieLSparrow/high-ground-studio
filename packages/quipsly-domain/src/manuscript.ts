export const MANUSCRIPT_STORAGE_KEY =
  "high-ground-studio.manuscript-editor.v1";

export const MANUSCRIPT_SCHEMA_VERSION = 1;

export const EPISODE_PUBLICATION_ANCHOR_EPISODE = 4;
export const EPISODE_PUBLICATION_ANCHOR_DATE = "2026-06-03";

const EPISODE_PUBLICATION_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const manuscriptAuthorDefinitions = [
  {
    id: "charlie",
    label: "Charlie",
    colorKey: "charlie",
  },
  {
    id: "homer",
    label: "Homer / Scott",
    colorKey: "homer",
  },
  {
    id: "unassigned",
    label: "Unassigned",
    colorKey: "unassigned",
  },
] as const;

export const semanticHighlightDefinitions = [
  { id: "quote", label: "Quote", colorKey: "quote" },
  {
    id: "cited-quotation",
    label: "Cited quotation",
    colorKey: "cited-quotation",
  },
  {
    id: "quote-candidate",
    label: "Quote candidate",
    colorKey: "quote-candidate",
  },
  { id: "clip", label: "Clip", colorKey: "clip" },
  { id: "show-notes", label: "Production notes", colorKey: "show-notes" },
  { id: "story", label: "Story", colorKey: "story" },
  { id: "insight", label: "Insight", colorKey: "insight" },
  { id: "research", label: "Research", colorKey: "research" },
  { id: "question", label: "Question", colorKey: "question" },
  { id: "needs-review", label: "Needs review", colorKey: "needs-review" },
  { id: "thesis", label: "Thesis", colorKey: "thesis" },
  { id: "transition", label: "Transition", colorKey: "transition" },
] as const;

export const manuscriptStructureDefinitions = [
  { id: "chapter", label: "Chapter / book", colorKey: "chapter" },
  { id: "episode", label: "Episode", colorKey: "episode" },
  { id: "section", label: "Section", colorKey: "section" },
] as const;

export const manuscriptStructureLabelPresets = [
  { id: "preface", label: "Preface", title: "Preface" },
  { id: "introduction", label: "Introduction", title: "Introduction" },
  { id: "chapter-0", label: "Chapter 0", title: "Chapter 0" },
  { id: "chapter", label: "Chapter", title: "Chapter" },
  { id: "interlude", label: "Interlude", title: "Interlude" },
  { id: "appendix", label: "Appendix", title: "Appendix" },
  { id: "custom", label: "Custom", title: "" },
] as const;

export const manuscriptQuoteReviewStatusDefinitions = [
  { id: "needs-source", label: "Needs source" },
  { id: "needs-verification", label: "Needs verification" },
  { id: "verified", label: "Verified" },
  { id: "do-not-use", label: "Do not use" },
] as const;

export const manuscriptQuoteReviewStatusFilterDefinitions = [
  ...manuscriptQuoteReviewStatusDefinitions,
  { id: "no-review-metadata", label: "No review metadata" },
] as const;

export const manuscriptQuoteSourceTypeDefinitions = [
  { id: "book", label: "Book" },
  { id: "article", label: "Article" },
  { id: "speech", label: "Speech" },
  { id: "interview", label: "Interview" },
  { id: "scripture", label: "Scripture" },
  { id: "unknown", label: "Unknown" },
  { id: "other", label: "Other" },
] as const;

export const manuscriptFilterVisualModeDefinitions = [
  { id: "highlight-matches", label: "Highlight matches" },
  { id: "dim-nonmatches", label: "Dim nonmatches" },
  { id: "hide-nonmatches", label: "Hide nonmatches" },
] as const;

export const manuscriptBlockNodeTypes = [
  "paragraph",
  "heading",
  "listItem",
] as const;

export type ManuscriptAuthorId =
  (typeof manuscriptAuthorDefinitions)[number]["id"];

export type SemanticHighlightType =
  (typeof semanticHighlightDefinitions)[number]["id"];

export type ManuscriptStructureKind =
  (typeof manuscriptStructureDefinitions)[number]["id"];

export type ManuscriptStructureLabelPreset =
  (typeof manuscriptStructureLabelPresets)[number]["id"];

export type ManuscriptQuoteReviewStatus =
  (typeof manuscriptQuoteReviewStatusDefinitions)[number]["id"];

export type ManuscriptQuoteReviewStatusFilter =
  (typeof manuscriptQuoteReviewStatusFilterDefinitions)[number]["id"];

export type ManuscriptQuoteSourceType =
  (typeof manuscriptQuoteSourceTypeDefinitions)[number]["id"];

export type ManuscriptFilterVisualMode =
  (typeof manuscriptFilterVisualModeDefinitions)[number]["id"];

export type ManuscriptEditorJson = {
  type?: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: Array<{
    type?: string;
    attrs?: Record<string, unknown>;
  }>;
  content?: ManuscriptEditorJson[];
};

export type ManuscriptDraft = {
  schemaVersion: typeof MANUSCRIPT_SCHEMA_VERSION;
  title: string;
  sourceFileName: string | null;
  importSummary: ManuscriptImportSummary | null;
  structureRegions: ManuscriptStructureRegion[];
  structureBoundaryMarkers: ManuscriptStructureBoundaryMarker[];
  chapterTitleBlocks: ManuscriptChapterTitleBlock[];
  quoteReviews: Record<string, ManuscriptQuoteReview>;
  editorJson: ManuscriptEditorJson;
  activeAuthorId: ManuscriptAuthorId;
  showAuthorColors: boolean;
  showSemanticColors: boolean;
  lastUpdatedAt: string | null;
};

export type ManuscriptSnapshotMetadata = {
  title: string;
  schemaVersion: typeof MANUSCRIPT_SCHEMA_VERSION;
  sourceFileName: string | null;
  clientUpdatedAt: string | null;
  words: number;
  characters: number;
  blocks: number;
  structureRegions: number;
  citedQuotations: number;
  quoteReviews: number;
};

export const studioManuscriptLibraryKindDefinitions = [
  {
    id: "WORKING",
    label: "Working",
  },
  {
    id: "SYNTHETIC",
    label: "Synthetic",
  },
] as const;

export type StudioManuscriptLibraryKind =
  (typeof studioManuscriptLibraryKindDefinitions)[number]["id"];

export type StudioManuscriptLibraryCreateInput = {
  title: string;
  description: string | null;
  sourceFileName: string | null;
  kind: StudioManuscriptLibraryKind;
};

export type ManuscriptTextStats = {
  words: number;
  characters: number;
};

export type AuthorSpanSummary = {
  authorId: ManuscriptAuthorId;
  label: string;
  spans: number;
  words: number;
  characters: number;
};

export type ManuscriptBlockSummary = {
  blockId: string | null;
  type: string;
  preview: string;
};

export type ManuscriptChapterTitleBlock = {
  id: string;
  blockId: string;
  createdAt: string;
  updatedAt: string;
};

export type ManuscriptStructureBoundaryMarker = {
  id: string;
  kind: ManuscriptStructureBoundaryKind;
  blockId: string;
  title: string;
  notes: string;
  publicationDate?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManuscriptDerivedChapter = {
  id: string;
  title: string;
  titleBlockId: string;
  startBlockId: string;
  endBlockId: string;
  startIndex: number;
  endIndex: number;
  blockCount: number;
  bodyBlockCount: number;
  startPreview: string;
  endPreview: string;
  blockIds: string[];
  isRangeComplete: boolean;
};

export type ManuscriptBlockStructureReference = {
  id: string;
  kind: ManuscriptStructureKind;
  title: string;
};

export type CitedQuotationTagType = Extract<
  SemanticHighlightType,
  "cited-quotation" | "quote-candidate"
>;

export type ManuscriptCitedQuotationSummary = {
  highlightId: string;
  tagType: CitedQuotationTagType;
  label: string;
  note: string;
  text: string;
  preview: string;
  blockId: string | null;
  blockPreview: string;
  structureRegions: ManuscriptBlockStructureReference[];
  review: ManuscriptQuoteReview;
  hasReviewMetadata: boolean;
  createdAt: string;
};

export type ManuscriptBlockDetail = ManuscriptBlockSummary & {
  text: string;
  authorIds: ManuscriptAuthorId[];
  semanticTagTypes: SemanticHighlightType[];
  structureRegions: ManuscriptBlockStructureReference[];
  citedQuotations: ManuscriptCitedQuotationSummary[];
};

export type ManuscriptBlockFilterCriteria = {
  textQuery?: string;
  authorId?: ManuscriptAuthorId | null;
  semanticTagType?: SemanticHighlightType | null;
  structureRegionId?: string | null;
  structureKind?: ManuscriptStructureKind | null;
  blockType?: string | null;
  quoteReviewStatus?: ManuscriptQuoteReviewStatusFilter | null;
  onlyUnstructured?: boolean;
  onlyWithSemanticHighlights?: boolean;
  onlyWithoutAuthor?: boolean;
};

export type ManuscriptBlockFilterOptions = {
  authorIds: ManuscriptAuthorId[];
  semanticTagTypes: SemanticHighlightType[];
  structureRegions: ManuscriptBlockStructureReference[];
  structureKinds: ManuscriptStructureKind[];
  blockTypes: string[];
};

export type ManuscriptBlockFilterSummary = {
  totalBlocks: number;
  matchingBlocks: number;
  activeFilterCount: number;
  hasActiveFilters: boolean;
  activeFilterLabels: string[];
};

export type ManuscriptCitedQuotationReviewProgress = {
  total: number;
  needsSource: number;
  needsVerification: number;
  verified: number;
  doNotUse: number;
  noReviewMetadata: number;
};

export type ManuscriptPublishReadinessSeverity =
  | "info"
  | "warning"
  | "blocker";

export type ManuscriptPublishReadinessIssue = {
  id: string;
  severity: ManuscriptPublishReadinessSeverity;
  title: string;
  detail: string;
};

export type ManuscriptPublishQuoteReviewStatusCounts = {
  total: number;
  needsSource: number;
  needsVerification: number;
  verified: number;
  doNotUse: number;
  noReviewMetadata: number;
};

export type ManuscriptPublishSnapshotState = {
  serverConnectionState?: "unchecked" | "connected" | "unavailable";
  latestSnapshotTime?: string | null;
  lastSnapshotId?: string | null;
  hasLocalChangesSinceServerSave?: boolean | null;
};

export type ManuscriptPublishReadinessReport = {
  title: string;
  generatedAt: string;
  sourceFileName: string | null;
  stats: {
    words: number;
    characters: number;
    blocks: number;
  };
  structure: {
    chapterRegions: number;
    episodeRegions: number;
    sectionRegions: number;
    coveredBlocks: number;
    uncoveredBlocks: number;
    coveragePercent: number;
  };
  authors: AuthorSpanSummary[];
  quoteReview: ManuscriptPublishQuoteReviewStatusCounts;
  issues: ManuscriptPublishReadinessIssue[];
  snapshotCaution: string;
};

export type ManuscriptRealReadinessChecklistItemId =
  | "synthetic-draft-loaded"
  | "structure-regions-tested"
  | "author-marks-tested"
  | "cited-quotations-tested"
  | "quote-review-tested"
  | "publishing-packet-generated"
  | "recording-handoff-generated"
  | "quote-appendix-generated"
  | "server-snapshot-saved"
  | "phone-load-smoke-tested"
  | "full-draft-json-backup-downloaded";

export type ManuscriptRealReadinessManualSignals = {
  publishingPacketGenerated?: boolean;
  recordingHandoffGenerated?: boolean;
  quoteAppendixGenerated?: boolean;
  serverSnapshotSaved?: boolean;
  phoneOrSecondBrowserLoaded?: boolean;
  fullDraftJsonBackupDownloaded?: boolean;
};

export type ManuscriptRealReadinessGateInput = {
  currentDraft: ManuscriptDraft;
  publishReadinessReport: ManuscriptPublishReadinessReport;
  snapshotState?: ManuscriptPublishSnapshotState;
  manualSignals?: ManuscriptRealReadinessManualSignals;
};

export type ManuscriptRealReadinessChecklistItem = {
  id: ManuscriptRealReadinessChecklistItemId;
  label: string;
  description: string;
  isComplete: boolean;
  isManual: boolean;
};

export type ManuscriptRealReadinessGateStatus =
  | "not-ready"
  | "ready-after-phone-load"
  | "ready";

export type ManuscriptRealReadinessGate = {
  isReadyForRealManuscript: boolean;
  status: ManuscriptRealReadinessGateStatus;
  statusLabel: string;
  isSyntheticSmokeDraftLoaded: boolean;
  checklistItems: ManuscriptRealReadinessChecklistItem[];
  warnings: string[];
};

export type ManuscriptPublishingExportInput = {
  title: string;
  sourceFileName: string | null;
  editorJson: ManuscriptEditorJson;
  structureRegions: ManuscriptStructureRegion[];
  quoteReviews: Record<string, ManuscriptQuoteReview>;
  generatedAt: string;
  snapshotState?: ManuscriptPublishSnapshotState;
  includeRecordingChecks?: boolean;
};

export type StudioHgoProjectionStatus = "synthetic" | "staged";

export type StudioHgoProjectionVisibility = "private" | "staged";

export type StudioHgoContentScope =
  | "book-only"
  | "episode-only"
  | "book-and-episode"
  | "internal";

export type StudioHgoCitationState =
  | "synthetic"
  | "needs-source"
  | "needs-review"
  | "verified"
  | "do-not-use";

export type StudioHgoSourceNoteStatus =
  | "synthetic"
  | "needs-review"
  | "verified"
  | "do-not-use";

export type StudioHgoEpisodeProjection = {
  id: string;
  status: StudioHgoProjectionStatus;
  visibility: StudioHgoProjectionVisibility;
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
    state: "not-recorded" | "recorded" | "published";
    placeholderLabel: string;
    durationLabel?: string;
    url?: string;
  };
  scopes: StudioHgoContentScope[];
  beats: Array<{
    title: string;
    summary: string;
    scope: StudioHgoContentScope;
    timingHint?: string;
  }>;
  voiceCards: Array<{
    speaker: "Charlie" | "Homer";
    summary: string;
  }>;
  pullQuotes: Array<{
    text: string;
    attribution: string;
    citationState: StudioHgoCitationState;
  }>;
  sourceNotes: Array<{
    label: string;
    detail: string;
    status: StudioHgoSourceNoteStatus;
  }>;
  relatedBookChapter?: {
    title: string;
    summary: string;
    status: StudioHgoProjectionStatus;
  };
  backstageNotes: Array<{
    label: string;
    note: string;
  }>;
  navigation?: {
    previousSlug?: string;
    nextSlug?: string;
  };
  projectionSource: {
    bridgeVersion: "studio-browser-v1";
    generatedAt: string;
    sourceFileName?: string;
  };
};

export type CreateHgoEpisodeProjectionFromManuscriptInput = {
  title: string;
  editorJson: ManuscriptEditorJson;
  structureRegions: ManuscriptStructureRegion[];
  quoteReviews: Record<string, ManuscriptQuoteReview>;
  sourceFileName: string | null;
  generatedAt: string;
  projectionStatus: StudioHgoProjectionStatus;
  projectionVisibility: StudioHgoProjectionVisibility;
  targetEpisodeRegionId?: string;
};

export type ManuscriptChapterEpisodeExportOption = {
  id: string;
  kind: Extract<ManuscriptStructureKind, "chapter" | "episode">;
  title: string;
  label: string;
  blockCount: number;
  startBlockId: string;
  endBlockId: string;
};

export type ManuscriptFocusVisibleBlockIds = {
  matchingBlockIds: string[];
  contextBlockIds: string[];
  visibleBlockIds: string[];
};

export type SemanticHighlightSummary = {
  highlightId: string;
  tagType: SemanticHighlightType;
  label: string;
  note: string;
  preview: string;
  createdAt: string;
};

export type ManuscriptStructureRegion = {
  id: string;
  kind: ManuscriptStructureKind;
  title: string;
  labelPreset?: ManuscriptStructureLabelPreset;
  startBlockId: string;
  endBlockId: string;
  order: number;
  colorKey: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ManuscriptQuoteReview = {
  highlightId: string;
  attributedTo: string;
  sourceTitle: string;
  sourceType: ManuscriptQuoteSourceType;
  locator: string;
  citationText: string;
  reviewStatus: ManuscriptQuoteReviewStatus;
  rightsNote: string;
  editorNote: string;
  updatedAt: string;
};

export type ManuscriptStructureRegionSummary = ManuscriptStructureRegion & {
  startIndex: number;
  endIndex: number;
  blockCount: number;
  startPreview: string;
  endPreview: string;
  blockIds: string[];
  isRangeComplete: boolean;
};

export type ManuscriptStructureBoundaryKind = Extract<
  ManuscriptStructureKind,
  "chapter" | "episode"
>;

export type ManuscriptStructureBoundarySource = "boundary-marker";

export type ManuscriptStructureBoundary = {
  id: string;
  kind: ManuscriptStructureBoundaryKind;
  source: ManuscriptStructureBoundarySource;
  sourceId: string;
  label: string;
  title: string;
  publicationDate: string | null;
  startIndex: number;
  endIndex: number;
  startBlockId: string;
  endBlockId: string;
  blockCount: number;
  blockIds: string[];
  isRangeComplete: boolean;
};

export type ManuscriptStructureBoundaryWarning = {
  id: string;
  kind: ManuscriptStructureBoundaryKind;
  message: string;
  boundaryIds: string[];
};

export type ManuscriptStructureBoundaryIndex = {
  chapters: ManuscriptStructureBoundary[];
  episodes: ManuscriptStructureBoundary[];
  warnings: ManuscriptStructureBoundaryWarning[];
};

export type ManuscriptBlockRangeSummary = {
  startBlockId: string | null;
  endBlockId: string | null;
  startIndex: number;
  endIndex: number;
  blockCount: number;
  startPreview: string;
  endPreview: string;
  blockIds: string[];
  isRangeComplete: boolean;
};

export type ManuscriptStructureRegionSuggestion = {
  kind: "chapter";
  title: string;
  labelPreset?: ManuscriptStructureLabelPreset;
  startBlockId: string;
  endBlockId: string;
  order: number;
  colorKey: string;
  notes: string;
};

export type ManuscriptImportSummary = {
  sourceFileName: string;
  words: number;
  characters: number;
  blocks: number;
  importedAt: string;
};

const defaultTitle = "Untitled manuscript";

export const SYNTHETIC_MANUSCRIPT_SMOKE_TITLE =
  "Synthetic Studio Smoke Draft";

export const SYNTHETIC_MANUSCRIPT_SMOKE_SOURCE_FILE_NAME =
  "synthetic-studio-smoke.docx";

export const STUDIO_HGO_PROJECTION_BRIDGE_WARNING_COPY = [
  "Synthetic testing is safe.",
  "Real manuscript projection drafts may include quoted text and structure titles.",
  "Treat generated JSON as private/staged until citation and public-safety review is complete.",
  "Do not paste real projection drafts into public places.",
] as const;

const syntheticSmokeTimestamp = "2026-05-21T12:00:00.000Z";
