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

export function isManuscriptAuthorId(
  value: string,
): value is ManuscriptAuthorId {
  return manuscriptAuthorDefinitions.some((author) => author.id === value);
}

export function isSemanticHighlightType(
  value: string,
): value is SemanticHighlightType {
  return semanticHighlightDefinitions.some((tag) => tag.id === value);
}

export function isCitedQuotationTagType(
  value: string,
): value is CitedQuotationTagType {
  return value === "cited-quotation" || value === "quote-candidate";
}

export function isManuscriptStructureKind(
  value: string,
): value is ManuscriptStructureKind {
  return manuscriptStructureDefinitions.some((kind) => kind.id === value);
}

export function isManuscriptStructureBoundaryKind(
  value: string,
): value is ManuscriptStructureBoundaryKind {
  return value === "chapter" || value === "episode";
}

export function isManuscriptStructureLabelPreset(
  value: string,
): value is ManuscriptStructureLabelPreset {
  return manuscriptStructureLabelPresets.some((preset) => preset.id === value);
}

export function isManuscriptQuoteReviewStatus(
  value: string,
): value is ManuscriptQuoteReviewStatus {
  return manuscriptQuoteReviewStatusDefinitions.some(
    (status) => status.id === value,
  );
}

export function isManuscriptQuoteReviewStatusFilter(
  value: string,
): value is ManuscriptQuoteReviewStatusFilter {
  return manuscriptQuoteReviewStatusFilterDefinitions.some(
    (status) => status.id === value,
  );
}

export function isManuscriptQuoteSourceType(
  value: string,
): value is ManuscriptQuoteSourceType {
  return manuscriptQuoteSourceTypeDefinitions.some(
    (sourceType) => sourceType.id === value,
  );
}

export function getManuscriptAuthorDefinition(authorId: ManuscriptAuthorId) {
  return (
    manuscriptAuthorDefinitions.find((author) => author.id === authorId) ??
    manuscriptAuthorDefinitions[2]
  );
}

export function getSemanticHighlightDefinition(tagType: SemanticHighlightType) {
  return (
    semanticHighlightDefinitions.find((tag) => tag.id === tagType) ??
    semanticHighlightDefinitions.find((tag) => tag.id === "insight") ??
    semanticHighlightDefinitions[0]
  );
}

export function getManuscriptStructureDefinition(
  kind: ManuscriptStructureKind,
) {
  return (
    manuscriptStructureDefinitions.find(
      (definition) => definition.id === kind,
    ) ?? manuscriptStructureDefinitions[0]
  );
}

export function getManuscriptStructureLabelPresetDefinition(
  preset: ManuscriptStructureLabelPreset,
) {
  return (
    manuscriptStructureLabelPresets.find(
      (definition) => definition.id === preset,
    ) ?? manuscriptStructureLabelPresets[6]
  );
}

export function getManuscriptQuoteReviewStatusDefinition(
  status: ManuscriptQuoteReviewStatus,
) {
  return (
    manuscriptQuoteReviewStatusDefinitions.find(
      (definition) => definition.id === status,
    ) ?? manuscriptQuoteReviewStatusDefinitions[0]
  );
}

export function getManuscriptQuoteReviewStatusFilterLabel(
  status: ManuscriptQuoteReviewStatusFilter,
) {
  if (status === "no-review-metadata") {
    return "No review metadata";
  }

  return getManuscriptQuoteReviewStatusDefinition(status).label;
}

export function getManuscriptQuoteSourceTypeDefinition(
  sourceType: ManuscriptQuoteSourceType,
) {
  return (
    manuscriptQuoteSourceTypeDefinitions.find(
      (definition) => definition.id === sourceType,
    ) ?? manuscriptQuoteSourceTypeDefinitions[5]
  );
}

export function createEmptyManuscriptDoc(): ManuscriptEditorJson {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: {
          blockId: "block-initial",
        },
      },
    ],
  };
}

export function createDefaultManuscriptDraft(
  timestamp: string | null = null,
): ManuscriptDraft {
  return {
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    title: defaultTitle,
    sourceFileName: null,
    importSummary: null,
    structureRegions: [],
    structureBoundaryMarkers: [],
    chapterTitleBlocks: [],
    quoteReviews: {},
    editorJson: createEmptyManuscriptDoc(),
    activeAuthorId: "homer",
    showAuthorColors: true,
    showSemanticColors: true,
    lastUpdatedAt: timestamp,
  };
}

function createSyntheticAuthorMark(authorId: ManuscriptAuthorId) {
  const author = getManuscriptAuthorDefinition(authorId);

  return {
    type: "authorMark",
    attrs: {
      authorId: author.id,
      authorLabel: author.label,
    },
  };
}

function createSyntheticSemanticMark(input: {
  highlightId: string;
  tagType: SemanticHighlightType;
  note: string;
  createdAt: string;
}) {
  const tag = getSemanticHighlightDefinition(input.tagType);

  return {
    type: "semanticHighlightMark",
    attrs: {
      highlightId: input.highlightId,
      tagType: tag.id,
      label: tag.label,
      colorKey: tag.colorKey,
      note: input.note,
      createdAt: input.createdAt,
    },
  };
}

function createSyntheticTextNode(input: {
  text: string;
  authorId?: ManuscriptAuthorId;
  semantic?: {
    highlightId: string;
    tagType: SemanticHighlightType;
    note: string;
  };
}): ManuscriptEditorJson {
  const marks = [];

  if (input.authorId) {
    marks.push(createSyntheticAuthorMark(input.authorId));
  }

  if (input.semantic) {
    marks.push(
      createSyntheticSemanticMark({
        ...input.semantic,
        createdAt: syntheticSmokeTimestamp,
      }),
    );
  }

  return {
    type: "text",
    text: input.text,
    marks: marks.length ? marks : undefined,
  };
}

function createSyntheticBlock(input: {
  type: "heading" | "paragraph";
  blockId: string;
  level?: number;
  content: ManuscriptEditorJson[];
}): ManuscriptEditorJson {
  return {
    type: input.type,
    attrs: {
      blockId: input.blockId,
      ...(input.type === "heading" ? { level: input.level ?? 2 } : {}),
    },
    content: input.content,
  };
}

export function isSyntheticManuscriptSmokeDraft(
  draft: Pick<ManuscriptDraft, "title" | "sourceFileName" | "importSummary">,
) {
  return (
    draft.title.trim() === SYNTHETIC_MANUSCRIPT_SMOKE_TITLE &&
    draft.sourceFileName === SYNTHETIC_MANUSCRIPT_SMOKE_SOURCE_FILE_NAME &&
    draft.importSummary?.sourceFileName ===
      SYNTHETIC_MANUSCRIPT_SMOKE_SOURCE_FILE_NAME
  );
}

export function createSyntheticManuscriptSmokeDraft(
  timestamp = syntheticSmokeTimestamp,
): ManuscriptDraft {
  const editorJson: ManuscriptEditorJson = {
    type: "doc",
    content: [
      createSyntheticBlock({
        type: "heading",
        blockId: "synthetic-smoke-heading",
        level: 1,
        content: [
          createSyntheticTextNode({
            text: "Synthetic Smoke Chapter",
            authorId: "unassigned",
          }),
        ],
      }),
      createSyntheticBlock({
        type: "paragraph",
        blockId: "synthetic-smoke-homer-opening",
        content: [
          createSyntheticTextNode({
            text: "Homer / Scott synthetic source material opens the rehearsal with a steady porch-light memory. ",
            authorId: "homer",
            semantic: {
              highlightId: "synthetic-smoke-story",
              tagType: "story",
              note: "Fake story tag for smoke testing.",
            },
          }),
          createSyntheticTextNode({
            text: "The names, places, and stakes here are invented for Studio testing only.",
            authorId: "homer",
          }),
        ],
      }),
      createSyntheticBlock({
        type: "paragraph",
        blockId: "synthetic-smoke-charlie-bridge",
        content: [
          createSyntheticTextNode({
            text: "Charlie synthetic bridge text explains why the next pass needs visible metadata. ",
            authorId: "charlie",
            semantic: {
              highlightId: "synthetic-smoke-insight",
              tagType: "insight",
              note: "Fake insight tag for smoke testing.",
            },
          }),
          createSyntheticTextNode({
            text: "\"The test bell rings before the real bell.\"",
            authorId: "charlie",
            semantic: {
              highlightId: "synthetic-smoke-quote-needs-source",
              tagType: "cited-quotation",
              note: "Fake quotation intentionally missing a source.",
            },
          }),
        ],
      }),
      createSyntheticBlock({
        type: "paragraph",
        blockId: "synthetic-smoke-unassigned-question",
        content: [
          createSyntheticTextNode({
            text: "This unassigned synthetic sentence proves the desk can notice material that has not been attributed yet. ",
          }),
          createSyntheticTextNode({
            text: "\"A rehearsal map is useful only if someone checks the roads.\"",
            semantic: {
              highlightId: "synthetic-smoke-quote-needs-verification",
              tagType: "cited-quotation",
              note: "Fake quotation that needs verification.",
            },
          }),
          createSyntheticTextNode({
            text: " What should the phone view show first?",
            semantic: {
              highlightId: "synthetic-smoke-question",
              tagType: "question",
              note: "Fake question tag for smoke testing.",
            },
          }),
        ],
      }),
      createSyntheticBlock({
        type: "heading",
        blockId: "synthetic-smoke-section-heading",
        level: 2,
        content: [
          createSyntheticTextNode({
            text: "Synthetic Quote Review Section",
            authorId: "charlie",
          }),
        ],
      }),
      createSyntheticBlock({
        type: "paragraph",
        blockId: "synthetic-smoke-verified-quote",
        content: [
          createSyntheticTextNode({
            text: "Homer / Scott synthetic material gives the verified path something harmless to carry. ",
            authorId: "homer",
          }),
          createSyntheticTextNode({
            text: "\"The fake lantern is bright enough for a fake hallway.\"",
            authorId: "homer",
            semantic: {
              highlightId: "synthetic-smoke-quote-verified",
              tagType: "cited-quotation",
              note: "Fake quotation with verified smoke metadata.",
            },
          }),
        ],
      }),
      createSyntheticBlock({
        type: "paragraph",
        blockId: "synthetic-smoke-do-not-use-quote",
        content: [
          createSyntheticTextNode({
            text: "Charlie synthetic cleanup note marks one invented quotation as unsafe on purpose. ",
            authorId: "charlie",
          }),
          createSyntheticTextNode({
            text: "\"The imaginary witness signed the imaginary form.\"",
            authorId: "charlie",
            semantic: {
              highlightId: "synthetic-smoke-quote-do-not-use",
              tagType: "cited-quotation",
              note: "Fake quotation marked do not use.",
            },
          }),
        ],
      }),
      createSyntheticBlock({
        type: "paragraph",
        blockId: "synthetic-smoke-no-review-metadata",
        content: [
          createSyntheticTextNode({
            text: "The no-metadata path stays deliberately unfinished so Quotes mode has something to complain about politely. ",
            authorId: "unassigned",
          }),
          createSyntheticTextNode({
            text: "\"A blank ledger is still a ledger.\"",
            authorId: "unassigned",
            semantic: {
              highlightId: "synthetic-smoke-quote-no-metadata",
              tagType: "cited-quotation",
              note: "Fake quotation with no review metadata.",
            },
          }),
        ],
      }),
      createSyntheticBlock({
        type: "heading",
        blockId: "synthetic-smoke-episode-heading",
        level: 2,
        content: [
          createSyntheticTextNode({
            text: "Synthetic Episode Cue",
            authorId: "homer",
            semantic: {
              highlightId: "synthetic-smoke-transition",
              tagType: "transition",
              note: "Fake transition tag for smoke testing.",
            },
          }),
        ],
      }),
      createSyntheticBlock({
        type: "paragraph",
        blockId: "synthetic-smoke-closing",
        content: [
          createSyntheticTextNode({
            text: "The smoke draft closes with fake recording instructions: save a manual snapshot, load it on a second device, then export the handoff packets. ",
            authorId: "charlie",
          }),
          createSyntheticTextNode({
            text: "No real manuscript text has been used.",
            authorId: "homer",
          }),
        ],
      }),
    ],
  };
  const importSummary = createManuscriptImportSummary({
    sourceFileName: SYNTHETIC_MANUSCRIPT_SMOKE_SOURCE_FILE_NAME,
    editorJson,
    importedAt: timestamp,
  });

  return {
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    title: SYNTHETIC_MANUSCRIPT_SMOKE_TITLE,
    sourceFileName: SYNTHETIC_MANUSCRIPT_SMOKE_SOURCE_FILE_NAME,
    importSummary,
    structureBoundaryMarkers: [
      {
        id: "synthetic-smoke-chapter-boundary",
        kind: "chapter",
        blockId: "synthetic-smoke-heading",
        title: "Synthetic Smoke Chapter",
        notes: "Synthetic chapter boundary marker for rail and structure smoke testing.",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "synthetic-smoke-episode-boundary",
        kind: "episode",
        blockId: "synthetic-smoke-episode-heading",
        title: "Synthetic Episode Cue",
        notes: "Synthetic episode boundary marker for rail and recording smoke testing.",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    chapterTitleBlocks: [
      {
        id: "synthetic-smoke-chapter-title",
        blockId: "synthetic-smoke-heading",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    structureRegions: [
      {
        id: "synthetic-smoke-chapter",
        kind: "chapter",
        title: "Synthetic Chapter One",
        labelPreset: "chapter",
        startBlockId: "synthetic-smoke-heading",
        endBlockId: "synthetic-smoke-closing",
        order: 1,
        colorKey: "chapter",
        notes: "Synthetic full-chapter range for testing structure, export grouping, and phone navigation.",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "synthetic-smoke-episode",
        kind: "episode",
        title: "Synthetic Episode One",
        startBlockId: "synthetic-smoke-homer-opening",
        endBlockId: "synthetic-smoke-closing",
        order: 2,
        colorKey: "episode",
        notes: "Synthetic recording range for testing Homer handoff and Recording / Reading mode.",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "synthetic-smoke-section",
        kind: "section",
        title: "Synthetic Quote Review Section",
        startBlockId: "synthetic-smoke-section-heading",
        endBlockId: "synthetic-smoke-no-review-metadata",
        order: 3,
        colorKey: "section",
        notes: "Synthetic section range for quote-review smoke testing.",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    quoteReviews: {
      "synthetic-smoke-quote-needs-source": {
        highlightId: "synthetic-smoke-quote-needs-source",
        attributedTo: "Synthetic missing-source speaker",
        sourceTitle: "Synthetic Source To Be Found",
        sourceType: "unknown",
        locator: "",
        citationText: "Synthetic citation still missing locator.",
        reviewStatus: "needs-source",
        rightsNote: "Synthetic rights note intentionally incomplete.",
        editorNote: "Smoke test path for missing source.",
        updatedAt: timestamp,
      },
      "synthetic-smoke-quote-needs-verification": {
        highlightId: "synthetic-smoke-quote-needs-verification",
        attributedTo: "Synthetic verification speaker",
        sourceTitle: "Synthetic Verification Binder",
        sourceType: "book",
        locator: "p. 12",
        citationText: "Synthetic Verification Binder, p. 12",
        reviewStatus: "needs-verification",
        rightsNote: "Synthetic rights check pending.",
        editorNote: "Smoke test path for verification.",
        updatedAt: timestamp,
      },
      "synthetic-smoke-quote-verified": {
        highlightId: "synthetic-smoke-quote-verified",
        attributedTo: "Synthetic verified speaker",
        sourceTitle: "Synthetic Verified Reference",
        sourceType: "article",
        locator: "section 4",
        citationText: "Synthetic Verified Reference, section 4",
        reviewStatus: "verified",
        rightsNote: "Synthetic rights note says this is fake and safe.",
        editorNote: "Smoke test path for verified quotation metadata.",
        updatedAt: timestamp,
      },
      "synthetic-smoke-quote-do-not-use": {
        highlightId: "synthetic-smoke-quote-do-not-use",
        attributedTo: "Synthetic unsafe speaker",
        sourceTitle: "Synthetic Do Not Use Source",
        sourceType: "speech",
        locator: "00:03",
        citationText: "Synthetic Do Not Use Source, 00:03",
        reviewStatus: "do-not-use",
        rightsNote: "Synthetic warning path.",
        editorNote: "Smoke test path for do-not-use quotation metadata.",
        updatedAt: timestamp,
      },
    },
    editorJson,
    activeAuthorId: "charlie",
    showAuthorColors: true,
    showSemanticColors: true,
    lastUpdatedAt: timestamp,
  };
}

export function createManuscriptSnapshotMetadata(
  draft: ManuscriptDraft,
): ManuscriptSnapshotMetadata {
  const textStats = countWordsAndCharacters(draft.editorJson);
  const blockSummaries = collectBlockSummaries(draft.editorJson);
  const citedQuotations = collectCitedQuotationHighlights({
    json: draft.editorJson,
    regions: draft.structureRegions,
    quoteReviews: draft.quoteReviews,
  });

  return {
    title: draft.title.trim() || defaultTitle,
    schemaVersion: draft.schemaVersion,
    sourceFileName: draft.sourceFileName,
    clientUpdatedAt: draft.lastUpdatedAt,
    words: textStats.words,
    characters: textStats.characters,
    blocks: blockSummaries.length,
    structureRegions: draft.structureRegions.length,
    citedQuotations: citedQuotations.length,
    quoteReviews: Object.keys(draft.quoteReviews).length,
  };
}

export function getStudioManuscriptLibraryKindForDraft(
  draft: Pick<ManuscriptDraft, "title" | "sourceFileName" | "importSummary">,
): StudioManuscriptLibraryKind {
  return isSyntheticManuscriptSmokeDraft(draft) ? "SYNTHETIC" : "WORKING";
}

export function createStudioManuscriptLibraryInputFromDraft(input: {
  draft: ManuscriptDraft;
  description?: string | null;
}): StudioManuscriptLibraryCreateInput {
  return {
    title: input.draft.title.trim() || defaultTitle,
    description: input.description?.trim() || null,
    sourceFileName: input.draft.sourceFileName,
    kind: getStudioManuscriptLibraryKindForDraft(input.draft),
  };
}

export function createManuscriptDraftCheckpointKey(draft: ManuscriptDraft) {
  return JSON.stringify({
    ...draft,
    lastUpdatedAt: null,
  });
}

export function countWordsAndCharacters(
  value: string | ManuscriptEditorJson,
): ManuscriptTextStats {
  const text = typeof value === "string" ? value : extractPlainText(value);
  const normalized = text.trim();

  return {
    words: normalized ? normalized.split(/\s+/).length : 0,
    characters: text.length,
  };
}

export function extractPlainText(json: ManuscriptEditorJson): string {
  const parts: string[] = [];

  function visit(node: ManuscriptEditorJson) {
    if (typeof node.text === "string") {
      parts.push(node.text);
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        visit(child);
      }
    }
  }

  visit(json);
  return parts.join(" ");
}

function collectTightNodeText(node: ManuscriptEditorJson): string {
  if (typeof node.text === "string") {
    return node.text;
  }

  return Array.isArray(node.content)
    ? node.content.map((child) => collectTightNodeText(child)).join("")
    : "";
}

function collectManuscriptPlainTextBlock(
  node: ManuscriptEditorJson,
  blocks: string[],
) {
  if (["paragraph", "heading", "listItem"].includes(String(node.type ?? ""))) {
    const text = collectTightNodeText(node).trim();

    if (text) {
      blocks.push(text);
    }

    return;
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      collectManuscriptPlainTextBlock(child, blocks);
    }
  }
}

export function createManuscriptDraftPlainText(draft: ManuscriptDraft) {
  const blocks: string[] = [];
  collectManuscriptPlainTextBlock(draft.editorJson, blocks);

  return blocks.join("\n\n");
}

export function createTextPreview(value: string, maxLength = 92) {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function getNodeText(node: ManuscriptEditorJson): string {
  if (typeof node.text === "string") {
    return node.text;
  }

  return Array.isArray(node.content)
    ? node.content.map((child) => getNodeText(child)).join(" ")
    : "";
}

function visitTextNodes(
  node: ManuscriptEditorJson,
  callback: (node: ManuscriptEditorJson) => void,
) {
  if (typeof node.text === "string") {
    callback(node);
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      visitTextNodes(child, callback);
    }
  }
}

export function summarizeAuthorMarkedSpans(
  json: ManuscriptEditorJson,
): AuthorSpanSummary[] {
  const summaries = new Map<ManuscriptAuthorId, AuthorSpanSummary>();

  for (const author of manuscriptAuthorDefinitions) {
    summaries.set(author.id, {
      authorId: author.id,
      label: author.label,
      spans: 0,
      words: 0,
      characters: 0,
    });
  }

  function visit(node: ManuscriptEditorJson) {
    if (typeof node.text === "string" && node.text.length > 0) {
      const authorMark = node.marks?.find((mark) => mark.type === "authorMark");
      const rawAuthorId = String(authorMark?.attrs?.authorId ?? "unassigned");
      const authorId = isManuscriptAuthorId(rawAuthorId)
        ? rawAuthorId
        : "unassigned";
      const summary = summaries.get(authorId);

      if (summary) {
        const stats = countWordsAndCharacters(node.text);
        summary.spans += 1;
        summary.words += stats.words;
        summary.characters += stats.characters;
      }
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        visit(child);
      }
    }
  }

  visit(json);
  return manuscriptAuthorDefinitions.map((author) => summaries.get(author.id)!);
}

export function collectBlockSummaries(
  json: ManuscriptEditorJson,
): ManuscriptBlockSummary[] {
  const blocks: ManuscriptBlockSummary[] = [];

  function visit(node: ManuscriptEditorJson) {
    if (
      typeof node.type === "string" &&
      manuscriptBlockNodeTypes.includes(
        node.type as (typeof manuscriptBlockNodeTypes)[number],
      )
    ) {
      const blockId =
        typeof node.attrs?.blockId === "string" ? node.attrs.blockId : null;

      blocks.push({
        blockId,
        type: node.type,
        preview: createTextPreview(getNodeText(node), 84),
      });
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        visit(child);
      }
    }
  }

  visit(json);
  return blocks;
}

export function countMissingBlockIds(json: ManuscriptEditorJson) {
  return collectBlockSummaries(json).filter((block) => !block.blockId).length;
}

export function createManuscriptBlockIdRebindMap(input: {
  sourceJson: ManuscriptEditorJson;
  targetJson: ManuscriptEditorJson;
}) {
  const sourceBlocks = collectBlockSummaries(input.sourceJson);
  const targetBlocks = collectBlockSummaries(input.targetJson);
  const blockIdMap = new Map<string, string>();

  sourceBlocks.forEach((sourceBlock, index) => {
    const targetBlock = targetBlocks[index];

    if (
      !sourceBlock.blockId ||
      !targetBlock?.blockId ||
      sourceBlock.blockId === targetBlock.blockId ||
      sourceBlock.type !== targetBlock.type ||
      sourceBlock.preview !== targetBlock.preview
    ) {
      return;
    }

    blockIdMap.set(sourceBlock.blockId, targetBlock.blockId);
  });

  return blockIdMap;
}

export function rebindManuscriptStructureBlockIds(input: {
  sourceJson: ManuscriptEditorJson;
  targetJson: ManuscriptEditorJson;
  structureRegions: ManuscriptStructureRegion[];
  structureBoundaryMarkers: ManuscriptStructureBoundaryMarker[];
  chapterTitleBlocks: ManuscriptChapterTitleBlock[];
}) {
  const blockIdMap = createManuscriptBlockIdRebindMap({
    sourceJson: input.sourceJson,
    targetJson: input.targetJson,
  });

  if (!blockIdMap.size) {
    return {
      structureRegions: input.structureRegions,
      structureBoundaryMarkers: input.structureBoundaryMarkers,
      chapterTitleBlocks: input.chapterTitleBlocks,
    };
  }

  const rebindBlockId = (blockId: string) => blockIdMap.get(blockId) ?? blockId;

  return {
    structureRegions: input.structureRegions.map((region) => ({
      ...region,
      startBlockId: rebindBlockId(region.startBlockId),
      endBlockId: rebindBlockId(region.endBlockId),
    })),
    structureBoundaryMarkers: input.structureBoundaryMarkers.map((marker) => ({
      ...marker,
      blockId: rebindBlockId(marker.blockId),
    })),
    chapterTitleBlocks: input.chapterTitleBlocks.map((titleBlock) => ({
      ...titleBlock,
      blockId: rebindBlockId(titleBlock.blockId),
    })),
  };
}

export function applyManuscriptBoundaryAttrsToEditorJson(input: {
  json: ManuscriptEditorJson;
  boundaryMarkers: ManuscriptStructureBoundaryMarker[];
}): ManuscriptEditorJson {
  const boundaryKindsByBlockId = new Map<
    string,
    ManuscriptStructureBoundaryKind[]
  >();

  for (const marker of input.boundaryMarkers) {
    const kinds = boundaryKindsByBlockId.get(marker.blockId) ?? [];

    if (!kinds.includes(marker.kind)) {
      kinds.push(marker.kind);
      boundaryKindsByBlockId.set(marker.blockId, kinds);
    }
  }

  function visit(node: ManuscriptEditorJson): ManuscriptEditorJson {
    const nextNode: ManuscriptEditorJson = {
      ...node,
      attrs: node.attrs ? { ...node.attrs } : undefined,
      marks: node.marks?.map((mark) => ({
        ...mark,
        attrs: mark.attrs ? { ...mark.attrs } : undefined,
      })),
      content: node.content?.map((child) => visit(child)),
    };

    if (
      typeof nextNode.type === "string" &&
      manuscriptBlockNodeTypes.includes(
        nextNode.type as (typeof manuscriptBlockNodeTypes)[number],
      )
    ) {
      const blockId =
        typeof nextNode.attrs?.blockId === "string" ? nextNode.attrs.blockId : "";
      const boundaryKinds = blockId
        ? (boundaryKindsByBlockId.get(blockId) ?? [])
        : [];
      const nextAttrs = {
        ...(nextNode.attrs ?? {}),
      };

      if (boundaryKinds.length) {
        nextAttrs.manuscriptBoundaryKinds = boundaryKinds.join(",");
      } else {
        delete nextAttrs.manuscriptBoundaryKinds;
      }

      nextNode.attrs = nextAttrs;
    }

    return nextNode;
  }

  return visit(input.json);
}

export function collectSemanticHighlights(
  json: ManuscriptEditorJson,
): SemanticHighlightSummary[] {
  const highlights: SemanticHighlightSummary[] = [];

  function visit(node: ManuscriptEditorJson) {
    if (typeof node.text === "string") {
      for (const mark of node.marks ?? []) {
        if (mark.type !== "semanticHighlightMark") {
          continue;
        }

        const rawTagType = String(mark.attrs?.tagType ?? "");

        if (!isSemanticHighlightType(rawTagType)) {
          continue;
        }

        highlights.push({
          highlightId: String(mark.attrs?.highlightId ?? ""),
          tagType: rawTagType,
          label: String(
            mark.attrs?.label ??
              getSemanticHighlightDefinition(rawTagType).label,
          ),
          note: String(mark.attrs?.note ?? ""),
          preview: createTextPreview(node.text, 72),
          createdAt: String(mark.attrs?.createdAt ?? ""),
        });
      }
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        visit(child);
      }
    }
  }

  visit(json);
  return highlights;
}

function formatStructureNumber(value: number) {
  const words = [
    "Zero",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
    "Twenty",
  ];

  return words[value] ?? String(value);
}

export function createStructureRegionDefaultTitle(input: {
  kind: ManuscriptStructureKind;
  labelPreset?: ManuscriptStructureLabelPreset;
  existingRegions: ManuscriptStructureRegion[];
}) {
  if (input.kind === "episode") {
    const episodeCount =
      input.existingRegions.filter((region) => region.kind === "episode")
        .length + 1;

    return `Episode ${episodeCount}`;
  }

  if (input.kind === "section") {
    const sectionCount =
      input.existingRegions.filter((region) => region.kind === "section")
        .length + 1;

    return `Section ${sectionCount}`;
  }

  const preset = input.labelPreset ?? "chapter";
  const presetDefinition = getManuscriptStructureLabelPresetDefinition(preset);

  if (preset === "chapter") {
    const chapterCount =
      input.existingRegions.filter(
        (region) =>
          region.kind === "chapter" &&
          (region.labelPreset === "chapter" ||
            (!region.labelPreset &&
              /^chapter(?!\s*0\b)/i.test(region.title.trim()))),
      ).length + 1;

    return `Chapter ${formatStructureNumber(chapterCount)}`;
  }

  if (preset === "custom") {
    const bookRegionCount =
      input.existingRegions.filter((region) => region.kind === "chapter")
        .length + 1;

    return `Book region ${bookRegionCount}`;
  }

  return presetDefinition.title;
}

export function createDefaultManuscriptQuoteReview(input: {
  highlightId: string;
  citationText?: string;
  updatedAt: string;
}): ManuscriptQuoteReview {
  return {
    highlightId: input.highlightId,
    attributedTo: "",
    sourceTitle: "",
    sourceType: "unknown",
    locator: "",
    citationText: input.citationText?.trim() ?? "",
    reviewStatus: "needs-source",
    rightsNote: "",
    editorNote: "",
    updatedAt: input.updatedAt,
  };
}

export function updateManuscriptQuoteReview(input: {
  reviews: Record<string, ManuscriptQuoteReview>;
  review: ManuscriptQuoteReview;
}) {
  return {
    ...input.reviews,
    [input.review.highlightId]: {
      ...input.review,
      attributedTo: input.review.attributedTo.trim(),
      sourceTitle: input.review.sourceTitle.trim(),
      locator: input.review.locator.trim(),
      citationText: input.review.citationText.trim(),
      rightsNote: input.review.rightsNote.trim(),
      editorNote: input.review.editorNote.trim(),
    },
  };
}

export function removeManuscriptQuoteReview(input: {
  reviews: Record<string, ManuscriptQuoteReview>;
  highlightId: string;
}) {
  const nextReviews = { ...input.reviews };
  delete nextReviews[input.highlightId];
  return nextReviews;
}

export function updateManuscriptStructureRegion(input: {
  regions: ManuscriptStructureRegion[];
  regionId: string;
  kind: ManuscriptStructureKind;
  title: string;
  labelPreset?: ManuscriptStructureLabelPreset;
  notes: string;
  updatedAt: string;
}) {
  const definition = getManuscriptStructureDefinition(input.kind);
  const safeLabelPreset =
    input.kind === "chapter" ? input.labelPreset : undefined;
  const title =
    input.title.trim() ||
    createStructureRegionDefaultTitle({
      kind: input.kind,
      labelPreset: safeLabelPreset,
      existingRegions: input.regions,
    });

  return input.regions.map((region) => {
    if (region.id !== input.regionId) {
      return region;
    }

    const updatedRegion: ManuscriptStructureRegion = {
      ...region,
      kind: input.kind,
      title,
      colorKey: definition.colorKey,
      notes: input.notes.trim(),
      updatedAt: input.updatedAt,
    };

    if (safeLabelPreset) {
      updatedRegion.labelPreset = safeLabelPreset;
    } else {
      delete updatedRegion.labelPreset;
    }

    return updatedRegion;
  });
}

export function moveManuscriptStructureRegionWithinKind(input: {
  regions: ManuscriptStructureRegion[];
  regionId: string;
  direction: "up" | "down";
  updatedAt: string;
}) {
  const orderedRegions = [...input.regions].sort(
    (left, right) => left.order - right.order,
  );
  const target = orderedRegions.find((region) => region.id === input.regionId);

  if (!target) {
    return input.regions;
  }

  const sameKindRegions = orderedRegions.filter(
    (region) => region.kind === target.kind,
  );
  const sameKindIndex = sameKindRegions.findIndex(
    (region) => region.id === input.regionId,
  );
  const swapIndex =
    input.direction === "up" ? sameKindIndex - 1 : sameKindIndex + 1;

  if (
    sameKindIndex < 0 ||
    swapIndex < 0 ||
    swapIndex >= sameKindRegions.length
  ) {
    return input.regions;
  }

  const reorderedSameKindRegions = [...sameKindRegions];
  const targetRegion = reorderedSameKindRegions[sameKindIndex];
  const swapRegion = reorderedSameKindRegions[swapIndex];

  reorderedSameKindRegions[sameKindIndex] = swapRegion;
  reorderedSameKindRegions[swapIndex] = targetRegion;

  const movedIds = new Set([targetRegion.id, swapRegion.id]);
  let sameKindCursor = 0;

  return orderedRegions.map((region, index) => {
    if (region.kind !== target.kind) {
      return {
        ...region,
        order: index + 1,
      };
    }

    const replacement = reorderedSameKindRegions[sameKindCursor];
    sameKindCursor += 1;

    return {
      ...replacement,
      order: index + 1,
      updatedAt: movedIds.has(replacement.id)
        ? input.updatedAt
        : replacement.updatedAt,
    };
  });
}

export function createBlockRangeSummary(input: {
  blocks: ManuscriptBlockSummary[];
  startBlockId: string | null;
  endBlockId: string | null;
}): ManuscriptBlockRangeSummary | null {
  if (!input.startBlockId && !input.endBlockId) {
    return null;
  }

  const blockIndexById = new Map<string, number>();

  input.blocks.forEach((block, index) => {
    if (block.blockId) {
      blockIndexById.set(block.blockId, index);
    }
  });

  const rawStartIndex = input.startBlockId
    ? blockIndexById.get(input.startBlockId)
    : undefined;
  const rawEndIndex = input.endBlockId
    ? blockIndexById.get(input.endBlockId)
    : undefined;
  const isRangeComplete =
    input.startBlockId !== null &&
    input.endBlockId !== null &&
    rawStartIndex !== undefined &&
    rawEndIndex !== undefined;
  const startIndex = rawStartIndex ?? -1;
  const endIndex = rawEndIndex ?? -1;
  const normalizedStartIndex = isRangeComplete
    ? Math.min(startIndex, endIndex)
    : -1;
  const normalizedEndIndex = isRangeComplete
    ? Math.max(startIndex, endIndex)
    : -1;
  const rangeBlocks = isRangeComplete
    ? input.blocks.slice(normalizedStartIndex, normalizedEndIndex + 1)
    : [];

  return {
    startBlockId: input.startBlockId,
    endBlockId: input.endBlockId,
    startIndex,
    endIndex,
    blockCount: rangeBlocks.length,
    startPreview: input.startBlockId
      ? input.blocks[rawStartIndex ?? -1]?.preview ?? "Start block not found"
      : "No start block set",
    endPreview: input.endBlockId
      ? input.blocks[rawEndIndex ?? -1]?.preview ?? "End block not found"
      : "No end block set",
    blockIds: rangeBlocks.flatMap((block) =>
      block.blockId ? [block.blockId] : [],
    ),
    isRangeComplete,
  };
}

export function deriveManuscriptChaptersFromTitleBlocks(input: {
  blocks: ManuscriptBlockSummary[];
  chapterTitleBlocks: ManuscriptChapterTitleBlock[];
}): ManuscriptDerivedChapter[] {
  const blockIndexById = new Map<string, number>();

  input.blocks.forEach((block, index) => {
    if (block.blockId) {
      blockIndexById.set(block.blockId, index);
    }
  });

  const seenBlockIds = new Set<string>();
  const titleBlocks = input.chapterTitleBlocks
    .filter((titleBlock) => {
      if (
        seenBlockIds.has(titleBlock.blockId) ||
        !blockIndexById.has(titleBlock.blockId)
      ) {
        return false;
      }

      seenBlockIds.add(titleBlock.blockId);
      return true;
    })
    .sort(
      (left, right) =>
        (blockIndexById.get(left.blockId) ?? 0) -
        (blockIndexById.get(right.blockId) ?? 0),
    );

  return titleBlocks.map((titleBlock, index) => {
    const startIndex = blockIndexById.get(titleBlock.blockId) ?? -1;
    const nextTitleBlock = titleBlocks[index + 1];
    const nextTitleIndex = nextTitleBlock
      ? blockIndexById.get(nextTitleBlock.blockId)
      : undefined;
    const endIndex =
      nextTitleIndex === undefined
        ? input.blocks.length - 1
        : Math.max(startIndex, nextTitleIndex - 1);
    const chapterBlocks =
      startIndex >= 0 && endIndex >= startIndex
        ? input.blocks.slice(startIndex, endIndex + 1)
        : [];
    const blockIds = chapterBlocks.flatMap((block) =>
      block.blockId ? [block.blockId] : [],
    );
    const startPreview =
      input.blocks[startIndex]?.preview || `Chapter ${index + 1}`;
    const endPreview = input.blocks[endIndex]?.preview || startPreview;

    return {
      id: titleBlock.id,
      title: startPreview,
      titleBlockId: titleBlock.blockId,
      startBlockId: titleBlock.blockId,
      endBlockId: blockIds[blockIds.length - 1] ?? titleBlock.blockId,
      startIndex,
      endIndex,
      blockCount: chapterBlocks.length,
      bodyBlockCount: Math.max(0, chapterBlocks.length - 1),
      startPreview,
      endPreview,
      blockIds,
      isRangeComplete: chapterBlocks.length > 0,
    };
  });
}

export function collectStructureRegionSummaries(input: {
  json: ManuscriptEditorJson;
  regions: ManuscriptStructureRegion[];
}): ManuscriptStructureRegionSummary[] {
  const blockSummaries = collectBlockSummaries(input.json);

  return [...input.regions]
    .sort((left, right) => left.order - right.order)
    .map((region) => {
      const rangeSummary = createBlockRangeSummary({
        blocks: blockSummaries,
        startBlockId: region.startBlockId,
        endBlockId: region.endBlockId,
      });

      return {
        ...region,
        startIndex: rangeSummary?.startIndex ?? -1,
        endIndex: rangeSummary?.endIndex ?? -1,
        blockCount: rangeSummary?.blockCount ?? 0,
        startPreview: rangeSummary?.startPreview ?? "Start block not found",
        endPreview: rangeSummary?.endPreview ?? "End block not found",
        blockIds: rangeSummary?.blockIds ?? [],
        isRangeComplete: rangeSummary?.isRangeComplete ?? false,
      };
    });
}

function getManuscriptStructureBoundaryTitle(title: string, fallback: string) {
  return title.trim() || fallback;
}

function normalizeEpisodePublicationDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!ISO_DATE_PATTERN.test(normalized)) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10) === normalized ? normalized : null;
}

export function getEpisodePublicationDateForIndex(index: number) {
  const normalizedIndex = Number.isFinite(index)
    ? Math.max(0, Math.floor(index))
    : 0;
  const anchorMs = Date.parse(
    `${EPISODE_PUBLICATION_ANCHOR_DATE}T00:00:00.000Z`,
  );
  const offsetWeeks =
    normalizedIndex - (EPISODE_PUBLICATION_ANCHOR_EPISODE - 1);

  return new Date(anchorMs + offsetWeeks * EPISODE_PUBLICATION_WEEK_MS)
    .toISOString()
    .slice(0, 10);
}

export function formatEpisodePublicationDate(value: string | null | undefined) {
  const normalized = normalizeEpisodePublicationDate(value);

  if (!normalized) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${normalized}T00:00:00.000Z`));
}

function getManuscriptStructureBoundaryLabel(
  kind: ManuscriptStructureBoundaryKind,
  index: number,
  title: string,
) {
  if (kind === "chapter") {
    return getManuscriptStructureBoundaryTitle(title, `Untitled ${index + 1}`);
  }

  const baseLabel = kind === "episode" ? "Episode" : "Chapter";
  const titlePrefixPattern =
    kind === "episode"
      ? /^(?:episode|ep\.?)\s+([a-z0-9-]+)\b/i
      : /^(?:chapter|ch\.?)\s+([a-z0-9-]+)\b/i;
  const titlePrefixMatch = title.trim().match(titlePrefixPattern);

  return titlePrefixMatch
    ? `${baseLabel} ${titlePrefixMatch[1]}`
    : `${baseLabel} ${index + 1}`;
}

function createStructureBoundaryFromBlocks(input: {
  id: string;
  kind: ManuscriptStructureBoundaryKind;
  source: ManuscriptStructureBoundarySource;
  sourceId: string;
  title: string;
  publicationDate?: string | null;
  index: number;
  startIndex: number;
  endIndex: number;
  blocks: ManuscriptBlockSummary[];
}): ManuscriptStructureBoundary {
  const boundaryBlocks = input.blocks.slice(
    input.startIndex,
    input.endIndex + 1,
  );
  const blockIds = boundaryBlocks.flatMap((block) =>
    block.blockId ? [block.blockId] : [],
  );

  return {
    id: input.id,
    kind: input.kind,
    source: input.source,
    sourceId: input.sourceId,
    label: getManuscriptStructureBoundaryLabel(
      input.kind,
      input.index,
      input.title,
    ),
    title: getManuscriptStructureBoundaryTitle(
      input.title,
      input.kind === "episode"
        ? `Episode ${input.index + 1}`
        : `Untitled ${input.index + 1}`,
    ),
    publicationDate: input.publicationDate ?? null,
    startIndex: input.startIndex,
    endIndex: input.endIndex,
    startBlockId: blockIds[0] ?? "",
    endBlockId: blockIds[blockIds.length - 1] ?? "",
    blockCount: boundaryBlocks.length,
    blockIds,
    isRangeComplete: boundaryBlocks.length > 0,
  };
}

function createStructureMarkerBoundaries(
  kind: ManuscriptStructureBoundaryKind,
  blocks: ManuscriptBlockSummary[],
  markers: ManuscriptStructureBoundaryMarker[],
): ManuscriptStructureBoundary[] {
  const blockIndexById = new Map<string, number>();

  blocks.forEach((block, index) => {
    if (block.blockId) {
      blockIndexById.set(block.blockId, index);
    }
  });

  const seenBlockIds = new Set<string>();
  const orderedMarkers = markers
    .filter((marker) => {
      if (
        marker.kind !== kind ||
        seenBlockIds.has(marker.blockId) ||
        !blockIndexById.has(marker.blockId)
      ) {
        return false;
      }

      seenBlockIds.add(marker.blockId);
      return true;
    })
    .sort(
      (left, right) =>
        (blockIndexById.get(left.blockId) ?? 0) -
        (blockIndexById.get(right.blockId) ?? 0),
    );

  return orderedMarkers.map((marker, index) => {
    const startIndex = blockIndexById.get(marker.blockId) ?? -1;
    const nextMarker = orderedMarkers[index + 1];
    const nextMarkerIndex = nextMarker
      ? blockIndexById.get(nextMarker.blockId)
      : undefined;
    const endIndex =
      nextMarkerIndex === undefined
        ? blocks.length - 1
        : Math.max(startIndex, nextMarkerIndex - 1);
    const blockTitle = blocks[startIndex]?.preview ?? "";

    return createStructureBoundaryFromBlocks({
      id: `boundary-marker:${marker.id}`,
      kind,
      source: "boundary-marker",
      sourceId: marker.id,
      title: marker.title.trim() || blockTitle,
      publicationDate:
        kind === "episode" ? getEpisodePublicationDateForIndex(index) : null,
      index,
      startIndex,
      endIndex,
      blocks,
    });
  });
}

function createStructureBoundaryOverlapWarnings(
  kind: ManuscriptStructureBoundaryKind,
  boundaries: ManuscriptStructureBoundary[],
): ManuscriptStructureBoundaryWarning[] {
  const warnings: ManuscriptStructureBoundaryWarning[] = [];
  const orderedBoundaries = [...boundaries].sort(
    (left, right) => left.startIndex - right.startIndex,
  );

  for (let index = 1; index < orderedBoundaries.length; index += 1) {
    const previousBoundary = orderedBoundaries[index - 1];
    const boundary = orderedBoundaries[index];

    if (previousBoundary.endIndex < boundary.startIndex) {
      continue;
    }

    warnings.push({
      id: `${kind}-boundary-overlap:${previousBoundary.id}:${boundary.id}`,
      kind,
      message: `${kind === "episode" ? "Episode" : "Chapter"} boundaries overlap between ${previousBoundary.label} and ${boundary.label}.`,
      boundaryIds: [previousBoundary.id, boundary.id],
    });
  }

  return warnings;
}

export function createManuscriptStructureBoundaryIndex(input: {
  blocks: ManuscriptBlockSummary[];
  boundaryMarkers?: ManuscriptStructureBoundaryMarker[];
}): ManuscriptStructureBoundaryIndex {
  const boundaryMarkers = input.boundaryMarkers ?? [];
  const chapters = createStructureMarkerBoundaries(
    "chapter",
    input.blocks,
    boundaryMarkers,
  );
  const episodes = createStructureMarkerBoundaries(
    "episode",
    input.blocks,
    boundaryMarkers,
  );
  const warnings: ManuscriptStructureBoundaryWarning[] = [
    ...createStructureBoundaryOverlapWarnings("chapter", chapters),
    ...createStructureBoundaryOverlapWarnings("episode", episodes),
  ];

  return {
    chapters,
    episodes,
    warnings,
  };
}

export function getCurrentManuscriptStructureBoundary(
  boundaries: ManuscriptStructureBoundary[],
  blockIndex: number,
) {
  let currentBoundary: ManuscriptStructureBoundary | null = null;

  for (const boundary of boundaries) {
    if (boundary.startIndex > blockIndex) {
      break;
    }

    if (boundary.endIndex >= blockIndex) {
      currentBoundary = boundary;
    }
  }

  return currentBoundary;
}

export function getNextManuscriptStructureBoundary(
  boundaries: ManuscriptStructureBoundary[],
  blockIndex: number,
  currentBoundary: ManuscriptStructureBoundary | null,
) {
  return (
    boundaries.find(
      (boundary) =>
        boundary.startIndex > blockIndex && boundary.id !== currentBoundary?.id,
    ) ?? null
  );
}

export function collectManuscriptBlockDetails(input: {
  json: ManuscriptEditorJson;
  regions?: ManuscriptStructureRegion[];
  quoteReviews?: Record<string, ManuscriptQuoteReview>;
}): ManuscriptBlockDetail[] {
  const structureRegionSummaries = collectStructureRegionSummaries({
    json: input.json,
    regions: input.regions ?? [],
  });
  const structureRegionsByBlockId = new Map<
    string,
    ManuscriptBlockStructureReference[]
  >();

  for (const region of structureRegionSummaries) {
    for (const blockId of region.blockIds) {
      const references = structureRegionsByBlockId.get(blockId) ?? [];
      references.push({
        id: region.id,
        kind: region.kind,
        title: region.title,
      });
      structureRegionsByBlockId.set(blockId, references);
    }
  }

  const details: ManuscriptBlockDetail[] = [];

  function visit(node: ManuscriptEditorJson) {
    if (
      typeof node.type === "string" &&
      manuscriptBlockNodeTypes.includes(
        node.type as (typeof manuscriptBlockNodeTypes)[number],
      )
    ) {
      const blockId =
        typeof node.attrs?.blockId === "string" ? node.attrs.blockId : null;
      const authorIds = new Set<ManuscriptAuthorId>();
      const semanticTagTypes = new Set<SemanticHighlightType>();
      const text = getNodeText(node);
      const preview = createTextPreview(text, 84);
      const structureReferences = blockId
        ? (structureRegionsByBlockId.get(blockId) ?? [])
        : [];
      const citedQuotations: ManuscriptCitedQuotationSummary[] = [];

      visitTextNodes(node, (textNode) => {
        for (const mark of textNode.marks ?? []) {
          if (mark.type === "authorMark") {
            const rawAuthorId = String(mark.attrs?.authorId ?? "");

            if (isManuscriptAuthorId(rawAuthorId)) {
              authorIds.add(rawAuthorId);
            }
          }

          if (mark.type === "semanticHighlightMark") {
            const rawTagType = String(mark.attrs?.tagType ?? "");

            if (isSemanticHighlightType(rawTagType)) {
              semanticTagTypes.add(rawTagType);

              if (isCitedQuotationTagType(rawTagType)) {
                const definition = getSemanticHighlightDefinition(rawTagType);
                const quoteText = String(textNode.text ?? "");
                const highlightId = String(mark.attrs?.highlightId ?? "");
                const note = String(mark.attrs?.note ?? "");
                const review = input.quoteReviews?.[highlightId];

                citedQuotations.push({
                  highlightId,
                  tagType: rawTagType,
                  label: String(mark.attrs?.label ?? definition.label),
                  note,
                  text: quoteText,
                  preview: createTextPreview(quoteText, 96),
                  blockId,
                  blockPreview: preview,
                  structureRegions: structureReferences,
                  review:
                    review ??
                    createDefaultManuscriptQuoteReview({
                      highlightId,
                      citationText: note,
                      updatedAt: String(mark.attrs?.createdAt ?? ""),
                    }),
                  hasReviewMetadata: Boolean(review),
                  createdAt: String(mark.attrs?.createdAt ?? ""),
                });
              }
            }
          }
        }
      });

      details.push({
        blockId,
        type: node.type,
        preview,
        text,
        authorIds: [...authorIds],
        semanticTagTypes: [...semanticTagTypes],
        structureRegions: structureReferences,
        citedQuotations,
      });
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        visit(child);
      }
    }
  }

  visit(input.json);
  return details;
}

export function collectCitedQuotationHighlights(input: {
  json: ManuscriptEditorJson;
  regions?: ManuscriptStructureRegion[];
  quoteReviews?: Record<string, ManuscriptQuoteReview>;
}): ManuscriptCitedQuotationSummary[] {
  return collectManuscriptBlockDetails(input).flatMap(
    (block) => block.citedQuotations,
  );
}

function doesCitedQuotationMatchReviewStatus(
  quotation: ManuscriptCitedQuotationSummary,
  status: ManuscriptQuoteReviewStatusFilter,
) {
  if (status === "no-review-metadata") {
    return !quotation.hasReviewMetadata;
  }

  return quotation.review.reviewStatus === status;
}

export function filterCitedQuotationsByReviewStatus(input: {
  quotations: ManuscriptCitedQuotationSummary[];
  reviewStatus?: ManuscriptQuoteReviewStatusFilter | null;
}) {
  if (!input.reviewStatus) {
    return input.quotations;
  }

  return input.quotations.filter((quotation) =>
    doesCitedQuotationMatchReviewStatus(quotation, input.reviewStatus!),
  );
}

export function summarizeCitedQuotationReviewProgress(
  quotations: ManuscriptCitedQuotationSummary[],
): ManuscriptCitedQuotationReviewProgress {
  const progress: ManuscriptCitedQuotationReviewProgress = {
    total: quotations.length,
    needsSource: 0,
    needsVerification: 0,
    verified: 0,
    doNotUse: 0,
    noReviewMetadata: 0,
  };

  for (const quotation of quotations) {
    if (!quotation.hasReviewMetadata) {
      progress.noReviewMetadata += 1;
    }

    if (quotation.review.reviewStatus === "needs-source") {
      progress.needsSource += 1;
    } else if (quotation.review.reviewStatus === "needs-verification") {
      progress.needsVerification += 1;
    } else if (quotation.review.reviewStatus === "verified") {
      progress.verified += 1;
    } else if (quotation.review.reviewStatus === "do-not-use") {
      progress.doNotUse += 1;
    }
  }

  return progress;
}

function dedupeSortedValues<T extends string>(
  values: T[],
  preferredOrder: readonly T[],
) {
  const valueSet = new Set(values);

  return [
    ...preferredOrder.filter((value) => valueSet.has(value)),
    ...[...valueSet]
      .filter((value) => !preferredOrder.includes(value))
      .sort((left, right) => left.localeCompare(right)),
  ];
}

export function createBlockFilterOptions(
  blocks: ManuscriptBlockDetail[],
): ManuscriptBlockFilterOptions {
  const structureRegionsById = new Map<
    string,
    ManuscriptBlockStructureReference
  >();

  for (const block of blocks) {
    for (const region of block.structureRegions) {
      structureRegionsById.set(region.id, region);
    }
  }

  return {
    authorIds: dedupeSortedValues(
      blocks.flatMap((block) => block.authorIds),
      manuscriptAuthorDefinitions.map((author) => author.id),
    ),
    semanticTagTypes: dedupeSortedValues(
      blocks.flatMap((block) => block.semanticTagTypes),
      semanticHighlightDefinitions.map((tag) => tag.id),
    ),
    structureRegions: [...structureRegionsById.values()].sort((left, right) =>
      left.title.localeCompare(right.title),
    ),
    structureKinds: dedupeSortedValues(
      blocks.flatMap((block) =>
        block.structureRegions.map((region) => region.kind),
      ),
      manuscriptStructureDefinitions.map((kind) => kind.id),
    ),
    blockTypes: [...new Set(blocks.map((block) => block.type))].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

function normalizeFilterText(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function filterManuscriptBlocks(input: {
  blocks: ManuscriptBlockDetail[];
  criteria: ManuscriptBlockFilterCriteria;
}) {
  const textQuery = normalizeFilterText(input.criteria.textQuery);
  const authorId = input.criteria.authorId ?? null;
  const semanticTagType = input.criteria.semanticTagType ?? null;
  const structureRegionId = input.criteria.structureRegionId?.trim() || null;
  const structureKind = input.criteria.structureKind ?? null;
  const blockType = input.criteria.blockType?.trim() || null;
  const quoteReviewStatus = input.criteria.quoteReviewStatus ?? null;

  return input.blocks.filter((block) => {
    if (textQuery) {
      const haystack = [
        block.text,
        block.preview,
        block.blockId ?? "",
        ...block.structureRegions.map((region) => region.title),
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(textQuery)) {
        return false;
      }
    }

    if (authorId && !block.authorIds.includes(authorId)) {
      return false;
    }

    if (
      semanticTagType &&
      !block.semanticTagTypes.includes(semanticTagType)
    ) {
      return false;
    }

    if (
      structureRegionId &&
      !block.structureRegions.some((region) => region.id === structureRegionId)
    ) {
      return false;
    }

    if (
      structureKind &&
      !block.structureRegions.some((region) => region.kind === structureKind)
    ) {
      return false;
    }

    if (blockType && block.type !== blockType) {
      return false;
    }

    if (
      quoteReviewStatus &&
      !block.citedQuotations.some((quotation) =>
        doesCitedQuotationMatchReviewStatus(quotation, quoteReviewStatus),
      )
    ) {
      return false;
    }

    if (input.criteria.onlyUnstructured && block.structureRegions.length) {
      return false;
    }

    if (
      input.criteria.onlyWithSemanticHighlights &&
      !block.semanticTagTypes.length
    ) {
      return false;
    }

    if (input.criteria.onlyWithoutAuthor && block.authorIds.length) {
      return false;
    }

    return true;
  });
}

function describeBlockFilterCriteria(input: {
  blocks: ManuscriptBlockDetail[];
  criteria: ManuscriptBlockFilterCriteria;
}) {
  const labels: string[] = [];
  const textQuery = input.criteria.textQuery?.trim();
  const structureRegionId = input.criteria.structureRegionId?.trim();
  const blockType = input.criteria.blockType?.trim();

  if (textQuery) {
    labels.push(`Text: ${textQuery}`);
  }

  if (input.criteria.authorId) {
    labels.push(
      `Author: ${getManuscriptAuthorDefinition(input.criteria.authorId).label}`,
    );
  }

  if (input.criteria.semanticTagType) {
    labels.push(
      `Semantic: ${
        getSemanticHighlightDefinition(input.criteria.semanticTagType).label
      }`,
    );
  }

  if (structureRegionId) {
    const regionTitle =
      input.blocks
        .flatMap((block) => block.structureRegions)
        .find((region) => region.id === structureRegionId)?.title ??
      structureRegionId;

    labels.push(`Structure: ${regionTitle}`);
  }

  if (input.criteria.structureKind) {
    labels.push(
      `Structure kind: ${
        getManuscriptStructureDefinition(input.criteria.structureKind).label
      }`,
    );
  }

  if (blockType) {
    labels.push(`Block type: ${blockType}`);
  }

  if (input.criteria.quoteReviewStatus) {
    labels.push(
      `Quote review: ${getManuscriptQuoteReviewStatusFilterLabel(
        input.criteria.quoteReviewStatus,
      )}`,
    );
  }

  if (input.criteria.onlyUnstructured) {
    labels.push("Only unstructured blocks");
  }

  if (input.criteria.onlyWithSemanticHighlights) {
    labels.push("Only blocks with semantic highlights");
  }

  if (input.criteria.onlyWithoutAuthor) {
    labels.push("Only blocks with no author mark");
  }

  return labels;
}

export function summarizeBlockFilterResults(input: {
  blocks: ManuscriptBlockDetail[];
  filteredBlocks: ManuscriptBlockDetail[];
  criteria: ManuscriptBlockFilterCriteria;
}): ManuscriptBlockFilterSummary {
  const activeFilterLabels = describeBlockFilterCriteria({
    blocks: input.blocks,
    criteria: input.criteria,
  });

  return {
    totalBlocks: input.blocks.length,
    matchingBlocks: input.filteredBlocks.length,
    activeFilterCount: activeFilterLabels.length,
    hasActiveFilters: activeFilterLabels.length > 0,
    activeFilterLabels,
  };
}

export function createFocusVisibleBlockIds(input: {
  blocks: ManuscriptBlockDetail[];
  matchingBlocks: ManuscriptBlockDetail[];
  contextBlocks: number;
}): ManuscriptFocusVisibleBlockIds {
  const contextBlocks = Math.max(0, Math.floor(input.contextBlocks));
  const matchingBlockIds = input.matchingBlocks.flatMap((block) =>
    block.blockId ? [block.blockId] : [],
  );
  const matchingBlockIdSet = new Set(matchingBlockIds);
  const visibleBlockIdSet = new Set(matchingBlockIds);
  const contextBlockIdSet = new Set<string>();
  const blockIndexById = new Map<string, number>();

  input.blocks.forEach((block, index) => {
    if (block.blockId) {
      blockIndexById.set(block.blockId, index);
    }
  });

  if (contextBlocks > 0) {
    for (const blockId of matchingBlockIds) {
      const blockIndex = blockIndexById.get(blockId);

      if (blockIndex === undefined) {
        continue;
      }

      const startIndex = Math.max(0, blockIndex - contextBlocks);
      const endIndex = Math.min(input.blocks.length - 1, blockIndex + contextBlocks);

      for (let index = startIndex; index <= endIndex; index += 1) {
        const contextBlockId = input.blocks[index]?.blockId;

        if (!contextBlockId) {
          continue;
        }

        visibleBlockIdSet.add(contextBlockId);

        if (!matchingBlockIdSet.has(contextBlockId)) {
          contextBlockIdSet.add(contextBlockId);
        }
      }
    }
  }

  return {
    matchingBlockIds,
    contextBlockIds: input.blocks.flatMap((block) =>
      block.blockId && contextBlockIdSet.has(block.blockId)
        ? [block.blockId]
        : [],
    ),
    visibleBlockIds: input.blocks.flatMap((block) =>
      block.blockId && visibleBlockIdSet.has(block.blockId) ? [block.blockId] : [],
    ),
  };
}

export function createFilteredBlockListMarkdown(input: {
  blocks: ManuscriptBlockDetail[];
  criteria: ManuscriptBlockFilterCriteria;
}) {
  const filteredBlocks = filterManuscriptBlocks(input);
  const summary = summarizeBlockFilterResults({
    blocks: input.blocks,
    filteredBlocks,
    criteria: input.criteria,
  });
  const lines = ["# Manuscript Filtered Blocks", ""];

  lines.push(
    `Matching blocks: ${summary.matchingBlocks.toLocaleString()} of ${summary.totalBlocks.toLocaleString()}`,
    "",
  );
  lines.push("## Active Filters", "");

  if (summary.activeFilterLabels.length) {
    for (const label of summary.activeFilterLabels) {
      lines.push(`- ${createMarkdownText(label)}`);
    }
  } else {
    lines.push("- None");
  }

  lines.push("", "## Blocks", "");

  if (!filteredBlocks.length) {
    lines.push("_No matching blocks._");
    return lines.join("\n");
  }

  filteredBlocks.forEach((block, index) => {
    lines.push(`${index + 1}. ${createMarkdownText(block.preview)}`);
    lines.push(`   - Type: ${block.type}`);
    lines.push(`   - Block ID: ${block.blockId ?? "missing blockId"}`);

    if (block.structureRegions.length) {
      lines.push(
        `   - Structure: ${block.structureRegions
          .map((region) => createMarkdownText(region.title))
          .join(", ")}`,
      );
    }

    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

function createMarkdownText(value: string) {
  return value.trim().replace(/\s+/g, " ") || "Untitled region";
}

export function createCitedQuotationMarkdown(input: {
  quotations: ManuscriptCitedQuotationSummary[];
}) {
  const lines = ["# Cited Quotations", ""];

  lines.push(
    `Total cited quotations: ${input.quotations.length.toLocaleString()}`,
    "",
  );

  if (!input.quotations.length) {
    lines.push("_No cited quotations marked._");
    return lines.join("\n");
  }

  input.quotations.forEach((quotation, index) => {
    lines.push(`${index + 1}. "${createMarkdownText(quotation.text)}"`);
    lines.push(`   - Type: ${createMarkdownText(quotation.label)}`);
    lines.push(`   - Block ID: ${quotation.blockId ?? "missing blockId"}`);
    lines.push(`   - Block: ${createMarkdownText(quotation.blockPreview)}`);

    if (quotation.structureRegions.length) {
      lines.push(
        `   - Structure: ${quotation.structureRegions
          .map((region) => createMarkdownText(region.title))
          .join(", ")}`,
      );
    }

    if (quotation.note.trim()) {
      lines.push(`   - Source note: ${createMarkdownText(quotation.note)}`);
    }

    lines.push(
      `   - Review status: ${createMarkdownText(
        getManuscriptQuoteReviewStatusDefinition(quotation.review.reviewStatus)
          .label,
      )}`,
    );

    if (quotation.review.attributedTo.trim()) {
      lines.push(
        `   - Attributed to: ${createMarkdownText(
          quotation.review.attributedTo,
        )}`,
      );
    }

    if (quotation.review.sourceTitle.trim()) {
      lines.push(
        `   - Source title: ${createMarkdownText(
          quotation.review.sourceTitle,
        )}`,
      );
    }

    if (quotation.review.sourceType !== "unknown") {
      lines.push(
        `   - Source type: ${createMarkdownText(
          getManuscriptQuoteSourceTypeDefinition(quotation.review.sourceType)
            .label,
        )}`,
      );
    }

    if (quotation.review.locator.trim()) {
      lines.push(`   - Locator: ${createMarkdownText(quotation.review.locator)}`);
    }

    if (quotation.review.citationText.trim()) {
      lines.push(
        `   - Citation: ${createMarkdownText(quotation.review.citationText)}`,
      );
    }

    if (quotation.review.rightsNote.trim()) {
      lines.push(
        `   - Rights note: ${createMarkdownText(quotation.review.rightsNote)}`,
      );
    }

    if (quotation.review.editorNote.trim()) {
      lines.push(
        `   - Editor note: ${createMarkdownText(quotation.review.editorNote)}`,
      );
    }

    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

export function createStructureOutlineMarkdown(input: {
  regions: ManuscriptStructureRegionSummary[];
}) {
  const lines = ["# Manuscript Structure", ""];
  const groups: Array<{
    kind: ManuscriptStructureKind;
    heading: string;
  }> = [
    { kind: "chapter", heading: "Chapter / book" },
    { kind: "episode", heading: "Episodes" },
    { kind: "section", heading: "Sections" },
  ];
  const sortedRegions = [...input.regions].sort(
    (left, right) => left.order - right.order,
  );

  if (!sortedRegions.length) {
    lines.push("_No structure regions._");
    return lines.join("\n");
  }

  for (const group of groups) {
    const groupRegions = sortedRegions.filter(
      (region) => region.kind === group.kind,
    );

    if (!groupRegions.length) {
      continue;
    }

    lines.push(`## ${group.heading}`, "");

    groupRegions.forEach((region, index) => {
      const definition = getManuscriptStructureDefinition(region.kind);

      lines.push(`${index + 1}. ${createMarkdownText(region.title)}`);
      lines.push(`   - Kind: ${definition.label}`);
      lines.push(`   - Blocks: ${region.blockCount.toLocaleString()}`);
      lines.push(`   - Start: ${createMarkdownText(region.startPreview)}`);
      lines.push(`   - End: ${createMarkdownText(region.endPreview)}`);

      if (region.notes.trim()) {
        lines.push(`   - Notes: ${createMarkdownText(region.notes)}`);
      }

      lines.push("");
    });
  }

  return lines.join("\n").trimEnd();
}

function createPublishingContext(input: ManuscriptPublishingExportInput) {
  const blocks = collectManuscriptBlockDetails({
    json: input.editorJson,
    regions: input.structureRegions,
    quoteReviews: input.quoteReviews,
  });
  const structureRegions = collectStructureRegionSummaries({
    json: input.editorJson,
    regions: input.structureRegions,
  });
  const citedQuotations = collectCitedQuotationHighlights({
    json: input.editorJson,
    regions: input.structureRegions,
    quoteReviews: input.quoteReviews,
  });
  const authorSummaries = summarizeAuthorMarkedSpans(input.editorJson);

  return {
    blocks,
    structureRegions,
    citedQuotations,
    authorSummaries,
  };
}

function createProjectionSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "studio-hgo-projection";
}

function isSyntheticSafeSourceFileName(value: string | null) {
  return Boolean(value && /synthetic/i.test(value));
}

function mapStructureKindToHgoScope(
  kind: ManuscriptStructureKind,
): StudioHgoContentScope {
  if (kind === "chapter") {
    return "book-and-episode";
  }

  if (kind === "episode") {
    return "episode-only";
  }

  return "internal";
}

function mapQuoteReviewToHgoCitationState(
  quotation: ManuscriptCitedQuotationSummary,
): StudioHgoCitationState {
  if (!quotation.hasReviewMetadata) {
    return "needs-review";
  }

  if (quotation.review.reviewStatus === "needs-source") {
    return "needs-source";
  }

  if (quotation.review.reviewStatus === "needs-verification") {
    return "needs-review";
  }

  return quotation.review.reviewStatus;
}

function mapQuoteReviewToHgoSourceNoteStatus(
  quotation: ManuscriptCitedQuotationSummary,
): StudioHgoSourceNoteStatus {
  if (!quotation.hasReviewMetadata) {
    return "needs-review";
  }

  if (quotation.review.reviewStatus === "verified") {
    return "verified";
  }

  if (quotation.review.reviewStatus === "do-not-use") {
    return "do-not-use";
  }

  return "needs-review";
}

function uniqueHgoScopes(
  scopes: StudioHgoContentScope[],
): StudioHgoContentScope[] {
  const preferredOrder: StudioHgoContentScope[] = [
    "book-and-episode",
    "episode-only",
    "book-only",
    "internal",
  ];
  const scopeSet = new Set(scopes);

  return preferredOrder.filter((scope) => scopeSet.has(scope));
}

function createProjectionBeatTitle(region: ManuscriptStructureRegionSummary) {
  const definition = getManuscriptStructureDefinition(region.kind);
  return `${definition.label}: ${region.title}`;
}

function createProjectionBeatSummary(region: ManuscriptStructureRegionSummary) {
  const blockLabel =
    region.blockCount === 1 ? "1 addressable block" : `${region.blockCount} addressable blocks`;

  return `${blockLabel} in Studio structure. Review source spans and citation state in Studio before this projection is staged or published.`;
}

function createProjectionSourceNoteDetail(
  quotation: ManuscriptCitedQuotationSummary,
) {
  if (!quotation.hasReviewMetadata) {
    return "No Studio quote-review metadata is attached yet.";
  }

  const review = quotation.review;
  const details = [
    review.citationText.trim(),
    review.locator.trim() ? `Locator: ${review.locator.trim()}` : "",
  ].filter(Boolean);

  if (details.length) {
    return details.join(" ");
  }

  return `${getManuscriptQuoteReviewStatusDefinition(review.reviewStatus).label} in Studio quote review.`;
}

export function createHgoEpisodeProjectionFromManuscript(
  input: CreateHgoEpisodeProjectionFromManuscriptInput,
): StudioHgoEpisodeProjection {
  const context = createPublishingContext({
    title: input.title,
    sourceFileName: input.sourceFileName,
    editorJson: input.editorJson,
    structureRegions: input.structureRegions,
    quoteReviews: input.quoteReviews,
    generatedAt: input.generatedAt,
    includeRecordingChecks: true,
  });
  const episodeRegions = context.structureRegions.filter(
    (region) => region.kind === "episode",
  );
  const targetEpisodeRegion =
    episodeRegions.find((region) => region.id === input.targetEpisodeRegionId) ??
    episodeRegions[0] ??
    null;
  const targetBlockIds = targetEpisodeRegion
    ? new Set(targetEpisodeRegion.blockIds)
    : null;
  const projectionTitle =
    targetEpisodeRegion?.title.trim() || input.title.trim() || defaultTitle;
  const slug = createProjectionSlug(projectionTitle);
  const selectedBlocks = targetBlockIds
    ? context.blocks.filter(
        (block) => block.blockId && targetBlockIds.has(block.blockId),
      )
    : context.blocks;
  const relevantRegions = context.structureRegions.filter((region) => {
    if (!region.isRangeComplete) {
      return false;
    }

    if (!targetBlockIds) {
      return true;
    }

    return region.blockIds.some((blockId) => targetBlockIds.has(blockId));
  });
  const beatRegions = relevantRegions.length
    ? relevantRegions
    : targetEpisodeRegion
      ? [targetEpisodeRegion]
      : [];
  const beats =
    beatRegions.length > 0
      ? beatRegions.slice(0, 8).map((region) => ({
          title: createProjectionBeatTitle(region),
          summary: createProjectionBeatSummary(region),
          scope: mapStructureKindToHgoScope(region.kind),
        }))
      : [
          {
            title: "Whole manuscript projection draft",
            summary:
              "No Episode region is selected. This browser-only draft uses the whole tagged manuscript shape until an Episode region exists.",
            scope: "internal" as const,
          },
        ];
  const selectedBlockIdSet = new Set(
    selectedBlocks.flatMap((block) => (block.blockId ? [block.blockId] : [])),
  );
  const selectedQuotations = context.citedQuotations.filter((quotation) => {
    if (!targetBlockIds) {
      return true;
    }

    return quotation.blockId ? selectedBlockIdSet.has(quotation.blockId) : false;
  });
  const sourceFileName = isSyntheticSafeSourceFileName(input.sourceFileName)
    ? input.sourceFileName?.trim()
    : undefined;
  const chapterRegion = relevantRegions.find((region) => region.kind === "chapter");
  const unresolvedCitationCount = selectedQuotations.filter(
    (quotation) => mapQuoteReviewToHgoCitationState(quotation) !== "verified",
  ).length;

  return {
    id: `studio-hgo-${slug}`,
    status: input.projectionStatus,
    visibility: input.projectionVisibility,
    slug,
    episodeNumber: targetEpisodeRegion
      ? `STUDIO-${String(targetEpisodeRegion.order).padStart(3, "0")}`
      : "STUDIO-DRAFT",
    title: projectionTitle,
    subtitle: "Browser-only HGO projection draft generated from Studio metadata.",
    summary: targetEpisodeRegion
      ? `Projection draft for ${targetEpisodeRegion.title}, derived from ${selectedBlocks.length.toLocaleString()} tagged Studio block${selectedBlocks.length === 1 ? "" : "s"}.`
      : `Whole-manuscript projection draft derived from ${selectedBlocks.length.toLocaleString()} tagged Studio block${selectedBlocks.length === 1 ? "" : "s"}.`,
    thesis:
      "The final output is not the source. This page is a projection of tagged source material for staged review.",
    lifecycleNote:
      "Browser-only Studio export. It is not a server publish, not a live HGO page, and not canonical manuscript or content truth.",
    hero: {
      eyebrow: "Studio Projection Bridge",
      visualPrompt:
        "A private Studio workbench projecting staged episode cards onto a High Ground Odyssey preview wall.",
      colorMood: "ember, slate, paper, signal green",
    },
    audio: {
      state: "not-recorded",
      placeholderLabel: "Projection audio placeholder",
      durationLabel: targetEpisodeRegion
        ? `${targetEpisodeRegion.blockCount.toLocaleString()} Studio block${targetEpisodeRegion.blockCount === 1 ? "" : "s"}`
        : "Whole manuscript draft",
    },
    scopes: uniqueHgoScopes([
      ...beats.map((beat) => beat.scope),
      "internal",
    ]),
    beats,
    voiceCards: context.authorSummaries
      .filter((author) => author.authorId === "charlie" || author.authorId === "homer")
      .map((author) => ({
        speaker: author.authorId === "charlie" ? "Charlie" : "Homer",
        summary: `${author.words.toLocaleString()} projection-review word${author.words === 1 ? "" : "s"} across ${author.spans.toLocaleString()} tagged span${author.spans === 1 ? "" : "s"} in the Studio draft.`,
      })),
    pullQuotes: selectedQuotations.map((quotation) => ({
      text: quotation.text.trim(),
      attribution:
        quotation.review.attributedTo.trim() ||
        quotation.review.sourceTitle.trim() ||
        "Studio cited quotation",
      citationState: mapQuoteReviewToHgoCitationState(quotation),
    })),
    sourceNotes: selectedQuotations.map((quotation) => ({
      label:
        quotation.review.sourceTitle.trim() ||
        quotation.review.attributedTo.trim() ||
        "Unreviewed Studio quote",
      detail: createProjectionSourceNoteDetail(quotation),
      status: mapQuoteReviewToHgoSourceNoteStatus(quotation),
    })),
    relatedBookChapter: chapterRegion
      ? {
          title: chapterRegion.title,
          summary: `${chapterRegion.blockCount.toLocaleString()} addressable Studio block${chapterRegion.blockCount === 1 ? "" : "s"} are available in the related Chapter / book region.`,
          status: input.projectionStatus,
        }
      : undefined,
    backstageNotes: [
      {
        label: "Bridge boundary",
        note: "Generated in the browser from Studio metadata. No server write, publish action, or canonical content file write is included.",
      },
      {
        label: "Citation gate",
        note: unresolvedCitationCount
          ? `${unresolvedCitationCount.toLocaleString()} selected quote${unresolvedCitationCount === 1 ? "" : "s"} still need source, review, or removal before any future live publish.`
          : "Selected cited quotations are verified in Studio quote review metadata.",
      },
      {
        label: "Source safety",
        note: "This projection omits full draft JSON, private editor notes, browser-local state, and manual snapshot metadata.",
      },
    ],
    projectionSource: {
      bridgeVersion: "studio-browser-v1",
      generatedAt: input.generatedAt,
      ...(sourceFileName ? { sourceFileName } : {}),
    },
  };
}

function countPublishQuoteReviewStatuses(
  quotations: ManuscriptCitedQuotationSummary[],
): ManuscriptPublishQuoteReviewStatusCounts {
  const counts: ManuscriptPublishQuoteReviewStatusCounts = {
    total: quotations.length,
    needsSource: 0,
    needsVerification: 0,
    verified: 0,
    doNotUse: 0,
    noReviewMetadata: 0,
  };

  for (const quotation of quotations) {
    if (!quotation.hasReviewMetadata) {
      counts.noReviewMetadata += 1;
      continue;
    }

    if (quotation.review.reviewStatus === "needs-source") {
      counts.needsSource += 1;
    } else if (quotation.review.reviewStatus === "needs-verification") {
      counts.needsVerification += 1;
    } else if (quotation.review.reviewStatus === "verified") {
      counts.verified += 1;
    } else if (quotation.review.reviewStatus === "do-not-use") {
      counts.doNotUse += 1;
    }
  }

  return counts;
}

function createSnapshotCaution(
  snapshotState: ManuscriptPublishSnapshotState | undefined,
) {
  if (!snapshotState || snapshotState.serverConnectionState === "unchecked") {
    return "Server snapshot state has not been checked.";
  }

  if (snapshotState.serverConnectionState === "unavailable") {
    return "Server snapshots are unavailable; download full draft JSON before serious export.";
  }

  if (snapshotState.hasLocalChangesSinceServerSave === true) {
    return "Local changes exist since the last server save or load. Save a server snapshot before handing this draft to another device.";
  }

  if (!snapshotState.lastSnapshotId) {
    return "No server snapshot has been saved or loaded in this browser. Download full draft JSON or save a snapshot before serious export.";
  }

  return snapshotState.latestSnapshotTime
    ? `Latest known server snapshot: ${snapshotState.latestSnapshotTime}.`
    : "Server snapshot checkpoint is known for this browser.";
}

function addPublishIssue(
  issues: ManuscriptPublishReadinessIssue[],
  issue: ManuscriptPublishReadinessIssue,
) {
  issues.push(issue);
}

export function createPublishReadinessReport(
  input: ManuscriptPublishingExportInput,
): ManuscriptPublishReadinessReport {
  const { blocks, structureRegions, citedQuotations, authorSummaries } =
    createPublishingContext(input);
  const textStats = countWordsAndCharacters(input.editorJson);
  const chapterRegions = structureRegions.filter(
    (region) => region.kind === "chapter",
  );
  const episodeRegions = structureRegions.filter(
    (region) => region.kind === "episode",
  );
  const sectionRegions = structureRegions.filter(
    (region) => region.kind === "section",
  );
  const coveredBlockIds = new Set(
    structureRegions.flatMap((region) => region.blockIds),
  );
  const knownBlockIds = blocks.flatMap((block) =>
    block.blockId ? [block.blockId] : [],
  );
  const coveredBlocks = knownBlockIds.filter((blockId) =>
    coveredBlockIds.has(blockId),
  ).length;
  const uncoveredBlocks = Math.max(0, knownBlockIds.length - coveredBlocks);
  const coveragePercent = knownBlockIds.length
    ? Math.round((coveredBlocks / knownBlockIds.length) * 100)
    : 0;
  const quoteReview = countPublishQuoteReviewStatuses(citedQuotations);
  const unassignedAuthor = authorSummaries.find(
    (summary) => summary.authorId === "unassigned",
  );
  const issues: ManuscriptPublishReadinessIssue[] = [];

  if (!chapterRegions.length) {
    addPublishIssue(issues, {
      id: "no-chapter-structure",
      severity: "warning",
      title: "No Chapter / book structure",
      detail:
        "Publishing packets can still fall back to a full block list, but book-shaped structure will make review and export calmer.",
    });
  }

  if (input.includeRecordingChecks && !episodeRegions.length) {
    addPublishIssue(issues, {
      id: "no-episode-structure",
      severity: "warning",
      title: "No Episode structure for recording",
      detail:
        "Recording handoff works best when Homer can follow episode-sized ranges instead of hunting through the whole wall.",
    });
  }

  if (uncoveredBlocks > 0) {
    addPublishIssue(issues, {
      id: "unstructured-blocks",
      severity:
        knownBlockIds.length && uncoveredBlocks / knownBlockIds.length > 0.35
          ? "warning"
          : "info",
      title: "Some blocks are outside structure regions",
      detail: `${uncoveredBlocks.toLocaleString()} block${
        uncoveredBlocks === 1 ? "" : "s"
      } are not covered by any Chapter, Episode, or Section region.`,
    });
  }

  if ((unassignedAuthor?.words ?? 0) > 0) {
    addPublishIssue(issues, {
      id: "unassigned-author-spans",
      severity: (unassignedAuthor?.words ?? 0) > Math.max(80, textStats.words * 0.15)
        ? "warning"
        : "info",
      title: "Unassigned author material remains",
      detail: `${(unassignedAuthor?.words ?? 0).toLocaleString()} word${
        (unassignedAuthor?.words ?? 0) === 1 ? "" : "s"
      } are marked unassigned. That may be fine, but it should be intentional before handoff.`,
    });
  }

  if (quoteReview.needsSource > 0) {
    addPublishIssue(issues, {
      id: "quotes-need-source",
      severity: "blocker",
      title: "Cited quotations need sources",
      detail: `${quoteReview.needsSource.toLocaleString()} cited quotation${
        quoteReview.needsSource === 1 ? "" : "s"
      } have review metadata marked Needs source.`,
    });
  }

  if (quoteReview.needsVerification > 0) {
    addPublishIssue(issues, {
      id: "quotes-need-verification",
      severity: "warning",
      title: "Cited quotations need verification",
      detail: `${quoteReview.needsVerification.toLocaleString()} cited quotation${
        quoteReview.needsVerification === 1 ? "" : "s"
      } still need verification before publishing or recording.`,
    });
  }

  if (quoteReview.doNotUse > 0) {
    addPublishIssue(issues, {
      id: "quotes-do-not-use",
      severity: "blocker",
      title: "Do not use quotations are present",
      detail: `${quoteReview.doNotUse.toLocaleString()} cited quotation${
        quoteReview.doNotUse === 1 ? "" : "s"
      } are marked Do not use and should be removed or resolved before public output.`,
    });
  }

  if (quoteReview.noReviewMetadata > 0) {
    addPublishIssue(issues, {
      id: "quotes-no-review-metadata",
      severity: "warning",
      title: "Cited quotations missing review metadata",
      detail: `${quoteReview.noReviewMetadata.toLocaleString()} cited quotation${
        quoteReview.noReviewMetadata === 1 ? "" : "s"
      } have no quote review metadata yet.`,
    });
  }

  const snapshotCaution = createSnapshotCaution(input.snapshotState);

  if (
    input.snapshotState?.hasLocalChangesSinceServerSave === true ||
    !input.snapshotState ||
    input.snapshotState.serverConnectionState === "unchecked"
  ) {
    addPublishIssue(issues, {
      id: "snapshot-caution",
      severity:
        input.snapshotState?.hasLocalChangesSinceServerSave === true
          ? "warning"
          : "info",
      title: "Snapshot checkpoint needs attention",
      detail: snapshotCaution,
    });
  }

  if (!issues.length) {
    addPublishIssue(issues, {
      id: "ready-with-care",
      severity: "info",
      title: "No major publishing blockers detected",
      detail:
        "This report is a practical checklist, not a guarantee. Humans still get the final vote.",
    });
  }

  return {
    title: input.title.trim() || defaultTitle,
    generatedAt: input.generatedAt,
    sourceFileName: input.sourceFileName,
    stats: {
      words: textStats.words,
      characters: textStats.characters,
      blocks: blocks.length,
    },
    structure: {
      chapterRegions: chapterRegions.length,
      episodeRegions: episodeRegions.length,
      sectionRegions: sectionRegions.length,
      coveredBlocks,
      uncoveredBlocks,
      coveragePercent,
    },
    authors: authorSummaries,
    quoteReview,
    issues,
    snapshotCaution,
  };
}

function createRealReadinessChecklistItem(input: {
  id: ManuscriptRealReadinessChecklistItemId;
  label: string;
  description: string;
  isComplete: boolean;
  isManual?: boolean;
}): ManuscriptRealReadinessChecklistItem {
  return {
    id: input.id,
    label: input.label,
    description: input.description,
    isComplete: input.isComplete,
    isManual: input.isManual ?? false,
  };
}

export function createRealManuscriptReadinessGate(
  input: ManuscriptRealReadinessGateInput,
): ManuscriptRealReadinessGate {
  const report = input.publishReadinessReport;
  const manualSignals = input.manualSignals ?? {};
  const isSyntheticSmokeDraftLoaded = isSyntheticManuscriptSmokeDraft(
    input.currentDraft,
  );
  const hasStructureRegions =
    report.structure.chapterRegions > 0 &&
    report.structure.episodeRegions > 0 &&
    report.structure.sectionRegions > 0;
  const hasAuthorMarks = manuscriptAuthorDefinitions.every((author) => {
    const summary = report.authors.find(
      (item) => item.authorId === author.id,
    );

    return (summary?.words ?? 0) > 0;
  });
  const hasQuoteReviewStatuses =
    report.quoteReview.needsSource > 0 &&
    report.quoteReview.needsVerification > 0 &&
    report.quoteReview.verified > 0 &&
    report.quoteReview.doNotUse > 0 &&
    report.quoteReview.noReviewMetadata > 0;
  const checklistItems = [
    createRealReadinessChecklistItem({
      id: "synthetic-draft-loaded",
      label: "Synthetic smoke draft loaded",
      description:
        "The current browser-local draft is the built-in fake rehearsal draft.",
      isComplete: isSyntheticSmokeDraftLoaded,
    }),
    createRealReadinessChecklistItem({
      id: "structure-regions-tested",
      label: "Structure regions tested",
      description:
        "Chapter / book, Episode, and Section regions are present in the current draft.",
      isComplete: isSyntheticSmokeDraftLoaded && hasStructureRegions,
    }),
    createRealReadinessChecklistItem({
      id: "author-marks-tested",
      label: "Author marks tested",
      description:
        "Charlie, Homer / Scott, and Unassigned material are all present.",
      isComplete: isSyntheticSmokeDraftLoaded && hasAuthorMarks,
    }),
    createRealReadinessChecklistItem({
      id: "cited-quotations-tested",
      label: "Cited quotations tested",
      description:
        "The current draft includes multiple cited quotation highlights.",
      isComplete: isSyntheticSmokeDraftLoaded && report.quoteReview.total >= 5,
    }),
    createRealReadinessChecklistItem({
      id: "quote-review-tested",
      label: "Quote review tested",
      description:
        "Needs source, needs verification, verified, do not use, and no-metadata paths are all visible.",
      isComplete: isSyntheticSmokeDraftLoaded && hasQuoteReviewStatuses,
    }),
    createRealReadinessChecklistItem({
      id: "publishing-packet-generated",
      label: "Publishing packet generated",
      description:
        "A synthetic publishing packet has been generated or downloaded in this browser.",
      isComplete:
        isSyntheticSmokeDraftLoaded &&
        Boolean(manualSignals.publishingPacketGenerated),
      isManual: true,
    }),
    createRealReadinessChecklistItem({
      id: "recording-handoff-generated",
      label: "Recording handoff generated",
      description:
        "A synthetic Homer-friendly recording handoff has been generated or downloaded.",
      isComplete:
        isSyntheticSmokeDraftLoaded &&
        Boolean(manualSignals.recordingHandoffGenerated),
      isManual: true,
    }),
    createRealReadinessChecklistItem({
      id: "quote-appendix-generated",
      label: "Quote appendix generated",
      description:
        "A synthetic quote appendix has been generated or downloaded.",
      isComplete:
        isSyntheticSmokeDraftLoaded &&
        Boolean(manualSignals.quoteAppendixGenerated),
      isManual: true,
    }),
    createRealReadinessChecklistItem({
      id: "server-snapshot-saved",
      label: "Synthetic server snapshot saved",
      description:
        "A manual server snapshot of the synthetic draft has been saved.",
      isComplete:
        isSyntheticSmokeDraftLoaded &&
        Boolean(manualSignals.serverSnapshotSaved),
      isManual: true,
    }),
    createRealReadinessChecklistItem({
      id: "phone-load-smoke-tested",
      label: "Phone / second browser load tested",
      description:
        "The synthetic server snapshot has been loaded on a phone or second browser profile.",
      isComplete:
        isSyntheticSmokeDraftLoaded &&
        Boolean(manualSignals.phoneOrSecondBrowserLoaded),
      isManual: true,
    }),
    createRealReadinessChecklistItem({
      id: "full-draft-json-backup-downloaded",
      label: "Full draft JSON backup downloaded",
      description:
        "A full draft JSON backup has been downloaded before real manuscript entry.",
      isComplete:
        isSyntheticSmokeDraftLoaded &&
        Boolean(manualSignals.fullDraftJsonBackupDownloaded),
      isManual: true,
    }),
  ];
  const isReadyForRealManuscript = checklistItems.every(
    (item) => item.isComplete,
  );
  const isReadyExceptPhoneLoad =
    !isReadyForRealManuscript &&
    checklistItems
      .filter((item) => item.id !== "phone-load-smoke-tested")
      .every((item) => item.isComplete);
  const warnings: string[] = [];

  if (!isSyntheticSmokeDraftLoaded) {
    warnings.push(
      "Do not use real manuscript text before the synthetic smoke draft has been loaded and tested.",
    );
  }

  if (
    !manualSignals.serverSnapshotSaved ||
    !manualSignals.phoneOrSecondBrowserLoaded
  ) {
    warnings.push(
      "Do not use real manuscript text before synthetic server snapshot save and phone / second-browser load both work.",
    );
  }

  if (!manualSignals.fullDraftJsonBackupDownloaded) {
    warnings.push(
      "Download a full draft JSON backup before the first real manuscript import.",
    );
  }

  if (input.snapshotState?.hasLocalChangesSinceServerSave === true) {
    warnings.push(
      "Local changes exist since the last known server checkpoint; save a manual snapshot before handing this draft to another device.",
    );
  }

  const status: ManuscriptRealReadinessGateStatus =
    isReadyForRealManuscript
      ? "ready"
      : isReadyExceptPhoneLoad
        ? "ready-after-phone-load"
        : "not-ready";
  const statusLabel =
    status === "ready"
      ? "Ready to import real manuscript"
      : status === "ready-after-phone-load"
        ? "Ready after manual phone-load confirmation"
        : "Not ready for real manuscript yet";

  return {
    isReadyForRealManuscript,
    status,
    statusLabel,
    isSyntheticSmokeDraftLoaded,
    checklistItems,
    warnings,
  };
}

export function createManuscriptStructureMarkdown(input: {
  regions: ManuscriptStructureRegionSummary[];
}) {
  return createStructureOutlineMarkdown(input);
}

function createReadinessIssueMarkdown(
  issues: ManuscriptPublishReadinessIssue[],
) {
  if (!issues.length) {
    return ["- None"];
  }

  return issues.map(
    (issue) =>
      `- **${issue.severity.toUpperCase()}** ${createMarkdownText(
        issue.title,
      )}: ${createMarkdownText(issue.detail)}`,
  );
}

function createStatsMarkdown(report: ManuscriptPublishReadinessReport) {
  return [
    `- Words: ${report.stats.words.toLocaleString()}`,
    `- Characters: ${report.stats.characters.toLocaleString()}`,
    `- Blocks: ${report.stats.blocks.toLocaleString()}`,
    `- Chapter / book regions: ${report.structure.chapterRegions.toLocaleString()}`,
    `- Episode regions: ${report.structure.episodeRegions.toLocaleString()}`,
    `- Section regions: ${report.structure.sectionRegions.toLocaleString()}`,
    `- Structure coverage: ${report.structure.coveredBlocks.toLocaleString()} covered / ${report.structure.uncoveredBlocks.toLocaleString()} uncovered (${report.structure.coveragePercent}%)`,
    `- Cited quotations: ${report.quoteReview.total.toLocaleString()}`,
    `- Quote review: ${report.quoteReview.verified.toLocaleString()} verified, ${report.quoteReview.needsSource.toLocaleString()} need source, ${report.quoteReview.needsVerification.toLocaleString()} need verification, ${report.quoteReview.doNotUse.toLocaleString()} do not use, ${report.quoteReview.noReviewMetadata.toLocaleString()} without metadata`,
  ];
}

function createAuthorSummaryMarkdown(authors: AuthorSpanSummary[]) {
  return authors.map(
    (summary) =>
      `- ${summary.label}: ${summary.spans.toLocaleString()} span${
        summary.spans === 1 ? "" : "s"
      }, ${summary.words.toLocaleString()} words, ${summary.characters.toLocaleString()} characters`,
  );
}

function createBlockLine(block: ManuscriptBlockDetail) {
  const label = block.blockId ?? "missing blockId";
  const text = createMarkdownText(block.text || block.preview || "Empty block");

  return `- **${label}** (${block.type}): ${text}`;
}

function getBlocksForRegion(
  blocks: ManuscriptBlockDetail[],
  region: ManuscriptStructureRegionSummary,
) {
  const blockIds = new Set(region.blockIds);

  return blocks.filter((block) => block.blockId && blockIds.has(block.blockId));
}

function createStructureContentMarkdown(input: {
  blocks: ManuscriptBlockDetail[];
  regions: ManuscriptStructureRegionSummary[];
}) {
  const chapterRegions = input.regions.filter(
    (region) => region.kind === "chapter",
  );
  const lines: string[] = [];

  if (chapterRegions.length) {
    for (const region of chapterRegions) {
      lines.push(`### ${createMarkdownText(region.title)}`, "");
      const regionBlocks = getBlocksForRegion(input.blocks, region);

      if (!regionBlocks.length) {
        lines.push("_No blocks found for this region._", "");
        continue;
      }

      for (const block of regionBlocks) {
        lines.push(createBlockLine(block));
      }

      lines.push("");
    }

    return lines;
  }

  lines.push("### Full Manuscript Block List", "");

  if (!input.blocks.length) {
    lines.push("_No manuscript blocks found._", "");
    return lines;
  }

  for (const block of input.blocks) {
    lines.push(createBlockLine(block));
  }

  lines.push("");
  return lines;
}

export function createQuoteReviewAppendixMarkdown(
  input: ManuscriptPublishingExportInput,
) {
  const { citedQuotations } = createPublishingContext(input);
  const lines = [
    "# Quote Review Appendix",
    "",
    `Generated: ${input.generatedAt}`,
    `Title: ${createMarkdownText(input.title || defaultTitle)}`,
    "",
    `Total cited quotations: ${citedQuotations.length.toLocaleString()}`,
    "",
  ];

  if (!citedQuotations.length) {
    lines.push("_No cited quotations marked._");
    return lines.join("\n").trimEnd();
  }

  citedQuotations.forEach((quotation, index) => {
    const review = quotation.review;

    lines.push(`## ${index + 1}. ${createMarkdownText(quotation.preview)}`, "");
    lines.push(`- Text: ${createMarkdownText(quotation.text)}`);
    lines.push(`- Attributed to: ${createMarkdownText(review.attributedTo)}`);
    lines.push(`- Source title: ${createMarkdownText(review.sourceTitle)}`);
    lines.push(
      `- Source type: ${getManuscriptQuoteSourceTypeDefinition(
        review.sourceType,
      ).label}`,
    );
    lines.push(`- Locator: ${createMarkdownText(review.locator)}`);
    lines.push(`- Citation text: ${createMarkdownText(review.citationText)}`);
    lines.push(
      `- Review status: ${
        quotation.hasReviewMetadata
          ? getManuscriptQuoteReviewStatusDefinition(review.reviewStatus).label
          : "No review metadata"
      }`,
    );
    lines.push(`- Rights note: ${createMarkdownText(review.rightsNote)}`);
    lines.push(`- Editor note: ${createMarkdownText(review.editorNote)}`);
    lines.push(`- Block ID: ${quotation.blockId ?? "missing blockId"}`);
    lines.push(
      `- Structure: ${
        quotation.structureRegions.length
          ? quotation.structureRegions
              .map((region) => createMarkdownText(region.title))
              .join(", ")
          : "No structure region"
      }`,
    );
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

export function createAuthorContributionMarkdown(
  input: ManuscriptPublishingExportInput,
) {
  const { authorSummaries } = createPublishingContext(input);
  const lines = [
    "# Author Contribution Summary",
    "",
    `Generated: ${input.generatedAt}`,
    `Title: ${createMarkdownText(input.title || defaultTitle)}`,
    "",
    "This is editorial metadata from Manuscript Desk marks, not legal authorship truth.",
    "",
    "## Summary",
    "",
    ...createAuthorSummaryMarkdown(authorSummaries),
    "",
    "## Reminders",
    "",
    "- Charlie spans usually indicate additions or current editorial work.",
    "- Homer / Scott spans usually indicate imported source manuscript material.",
    "- Unassigned spans should be checked before handoff if the count is meaningful.",
    "- These marks travel in full draft JSON backups and manual server snapshots.",
  ];

  return lines.join("\n").trimEnd();
}

export function createRecordingHandoffMarkdown(
  input: ManuscriptPublishingExportInput,
) {
  const exportInput = {
    ...input,
    includeRecordingChecks: true,
  };
  const report = createPublishReadinessReport(exportInput);
  const { structureRegions, citedQuotations } = createPublishingContext(input);
  const episodeRegions = structureRegions.filter(
    (region) => region.kind === "episode",
  );
  const chapterRegions = structureRegions.filter(
    (region) => region.kind === "chapter",
  );
  const quoteWarnings = citedQuotations.filter(
    (quotation) =>
      !quotation.hasReviewMetadata ||
      quotation.review.reviewStatus !== "verified",
  );
  const lines = [
    "# Recording Handoff",
    "",
    `Title: ${createMarkdownText(input.title || defaultTitle)}`,
    `Generated: ${input.generatedAt}`,
    input.sourceFileName
      ? `Source file: ${createMarkdownText(input.sourceFileName)}`
      : "Source file: Not recorded",
    "",
    "## Quick Instructions",
    "",
    "- Use this as a recording guide, not a canonical manuscript.",
    "- Load or save a manual server snapshot before moving between devices.",
    "- Use Recording / Reading mode on phone or tablet.",
    "- Pause at cited quotations that still need source or verification work.",
    "",
    "## Readiness",
    "",
    ...createReadinessIssueMarkdown(report.issues),
    "",
    "## Episode Outline",
    "",
  ];

  if (episodeRegions.length) {
    episodeRegions.forEach((region, index) => {
      lines.push(
        `${index + 1}. ${createMarkdownText(region.title)} (${region.blockCount.toLocaleString()} blocks)`,
      );
      lines.push(`   - Start: ${createMarkdownText(region.startPreview)}`);
      lines.push(`   - End: ${createMarkdownText(region.endPreview)}`);
      if (region.notes.trim()) {
        lines.push(`   - Notes: ${createMarkdownText(region.notes)}`);
      }
    });
  } else {
    lines.push("- No Episode regions yet.");
  }

  lines.push("", "## Chapter / Book Outline", "");

  if (chapterRegions.length) {
    chapterRegions.forEach((region, index) => {
      lines.push(
        `${index + 1}. ${createMarkdownText(region.title)} (${region.blockCount.toLocaleString()} blocks)`,
      );
    });
  } else {
    lines.push("- No Chapter / book regions yet.");
  }

  lines.push("", "## Author Material", "", ...createAuthorSummaryMarkdown(report.authors));
  lines.push("", "## Cited Quotations To Watch", "");

  if (quoteWarnings.length) {
    quoteWarnings.forEach((quotation, index) => {
      const status = quotation.hasReviewMetadata
        ? getManuscriptQuoteReviewStatusDefinition(
            quotation.review.reviewStatus,
          ).label
        : "No review metadata";

      lines.push(`${index + 1}. ${createMarkdownText(quotation.preview)}`);
      lines.push(`   - Status: ${status}`);
      lines.push(`   - Block: ${quotation.blockId ?? "missing blockId"}`);
      if (quotation.structureRegions.length) {
        lines.push(
          `   - Structure: ${quotation.structureRegions
            .map((region) => createMarkdownText(region.title))
            .join(", ")}`,
        );
      }
    });
  } else {
    lines.push("- No unresolved cited quotation warnings.");
  }

  lines.push(
    "",
    "## Before Recording Checklist",
    "",
    "- Confirm the intended draft is loaded.",
    "- Confirm local changes have been saved as a server snapshot if another device is used.",
    "- Confirm Episode or Chapter / book outline is visible.",
    "- Confirm unresolved citation warnings are understood.",
    "- Download a full draft JSON backup before using real manuscript material.",
    "",
    "## After Recording Notes",
    "",
    "- Recording date:",
    "- Device:",
    "- Sections recorded:",
    "- Follow-up edits:",
  );

  return lines.join("\n").trimEnd();
}

export function createPublishingPacketMarkdown(
  input: ManuscriptPublishingExportInput,
) {
  const report = createPublishReadinessReport(input);
  const { blocks, structureRegions } = createPublishingContext(input);
  const lines = [
    "# Publishing Packet",
    "",
    `Title: ${createMarkdownText(input.title || defaultTitle)}`,
    `Generated: ${input.generatedAt}`,
    input.sourceFileName
      ? `Source file: ${createMarkdownText(input.sourceFileName)}`
      : "Source file: Not recorded",
    "",
    "This is a working export, not canonical public truth.",
    "",
    "## Stats",
    "",
    ...createStatsMarkdown(report),
    "",
    "## Snapshot Caution",
    "",
    report.snapshotCaution,
    "",
    "## Readiness Issues",
    "",
    ...createReadinessIssueMarkdown(report.issues),
    "",
    "## Structure Outline",
    "",
    createManuscriptStructureMarkdown({ regions: structureRegions }),
    "",
    "## Manuscript Content",
    "",
    ...createStructureContentMarkdown({ blocks, regions: structureRegions }),
    "## Quote Review Appendix Summary",
    "",
    `- Total cited quotations: ${report.quoteReview.total.toLocaleString()}`,
    `- Needs source: ${report.quoteReview.needsSource.toLocaleString()}`,
    `- Needs verification: ${report.quoteReview.needsVerification.toLocaleString()}`,
    `- Verified: ${report.quoteReview.verified.toLocaleString()}`,
    `- Do not use: ${report.quoteReview.doNotUse.toLocaleString()}`,
    `- No review metadata: ${report.quoteReview.noReviewMetadata.toLocaleString()}`,
    "",
    createQuoteReviewAppendixMarkdown(input),
  ];

  return lines.join("\n").trimEnd();
}

export function createChapterEpisodeExportOptions(input: {
  regions: ManuscriptStructureRegionSummary[];
}): ManuscriptChapterEpisodeExportOption[] {
  return input.regions
    .filter(
      (
        region,
      ): region is ManuscriptStructureRegionSummary & {
        kind: "chapter" | "episode";
      } => region.kind === "chapter" || region.kind === "episode",
    )
    .map((region) => ({
      id: region.id,
      kind: region.kind,
      title: region.title,
      label: `${getManuscriptStructureDefinition(region.kind).label}: ${
        region.title
      }`,
      blockCount: region.blockCount,
      startBlockId: region.startBlockId,
      endBlockId: region.endBlockId,
    }));
}

const chapterHeadingNumberWords = new Set([
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
]);

function detectBookRegionHeading(
  block: ManuscriptBlockSummary,
): Pick<ManuscriptStructureRegionSuggestion, "title" | "labelPreset"> | null {
  const preview = block.preview.trim().replace(/\s+/g, " ");

  if (!preview) {
    return null;
  }

  if (block.type !== "heading" && preview.length > 48) {
    return null;
  }

  if (/^preface\b/i.test(preview)) {
    return {
      title: preview,
      labelPreset: "preface",
    };
  }

  if (/^introduction\b/i.test(preview)) {
    return {
      title: preview,
      labelPreset: "introduction",
    };
  }

  const chapterMatch = preview.match(/^chapter\s+([0-9]+|[a-z]+)\b/i);

  if (!chapterMatch) {
    return null;
  }

  const chapterNumber = chapterMatch[1].toLowerCase();
  const isChapterZero = chapterNumber === "0" || chapterNumber === "zero";

  if (!isChapterZero && !/^\d+$/.test(chapterNumber)) {
    if (!chapterHeadingNumberWords.has(chapterNumber)) {
      return null;
    }
  }

  return {
    title: preview,
    labelPreset: isChapterZero ? "chapter-0" : "chapter",
  };
}

export function suggestBookStructureRegionsFromHeadings(input: {
  blocks: ManuscriptBlockSummary[];
}): ManuscriptStructureRegionSuggestion[] {
  const definition = getManuscriptStructureDefinition("chapter");
  const detectedHeadings = input.blocks.flatMap((block, index) => {
    const heading = detectBookRegionHeading(block);

    if (!heading || !block.blockId) {
      return [];
    }

    return [
      {
        ...heading,
        index,
        blockId: block.blockId,
      },
    ];
  });
  const suggestions: ManuscriptStructureRegionSuggestion[] = [];

  detectedHeadings.forEach((heading, headingIndex) => {
    const nextHeading = detectedHeadings[headingIndex + 1];
    const rawEndIndex = nextHeading ? nextHeading.index - 1 : input.blocks.length - 1;
    let endBlockId: string | null = null;

    for (let index = rawEndIndex; index >= heading.index; index -= 1) {
      const candidateBlockId = input.blocks[index]?.blockId;

      if (candidateBlockId) {
        endBlockId = candidateBlockId;
        break;
      }
    }

    if (!endBlockId) {
      return;
    }

    suggestions.push({
      kind: "chapter",
      title: heading.title,
      labelPreset: heading.labelPreset,
      startBlockId: heading.blockId,
      endBlockId,
      order: suggestions.length + 1,
      colorKey: definition.colorKey,
      notes: "",
    });
  });

  return suggestions;
}

export function createManuscriptImportSummary(input: {
  sourceFileName: string;
  editorJson: ManuscriptEditorJson;
  importedAt: string;
}): ManuscriptImportSummary {
  const stats = countWordsAndCharacters(input.editorJson);

  return {
    sourceFileName: input.sourceFileName,
    words: stats.words,
    characters: stats.characters,
    blocks: collectBlockSummaries(input.editorJson).length,
    importedAt: input.importedAt,
  };
}

export function safeManuscriptStructureRegions(
  value: unknown,
): ManuscriptStructureRegion[] | null {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const regions: ManuscriptStructureRegion[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }

    const region = item as Partial<ManuscriptStructureRegion>;
    const kind = String(region.kind ?? "");
    const rawLabelPreset =
      typeof region.labelPreset === "string" ? region.labelPreset : "";
    const labelPreset =
      isManuscriptStructureKind(kind) &&
      kind === "chapter" &&
      isManuscriptStructureLabelPreset(rawLabelPreset)
        ? rawLabelPreset
        : undefined;

    if (
      typeof region.id !== "string" ||
      !region.id.trim() ||
      !isManuscriptStructureKind(kind) ||
      typeof region.title !== "string" ||
      typeof region.startBlockId !== "string" ||
      !region.startBlockId.trim() ||
      typeof region.endBlockId !== "string" ||
      !region.endBlockId.trim() ||
      typeof region.order !== "number" ||
      !Number.isFinite(region.order) ||
      typeof region.colorKey !== "string" ||
      typeof region.notes !== "string" ||
      typeof region.createdAt !== "string" ||
      typeof region.updatedAt !== "string"
    ) {
      return null;
    }

    const definition = getManuscriptStructureDefinition(kind);

    const normalizedRegion: ManuscriptStructureRegion = {
      id: region.id,
      kind,
      title: region.title.trim() || definition.label,
      startBlockId: region.startBlockId,
      endBlockId: region.endBlockId,
      order: region.order,
      colorKey: definition.colorKey,
      notes: region.notes,
      createdAt: region.createdAt,
      updatedAt: region.updatedAt,
    };

    if (labelPreset) {
      normalizedRegion.labelPreset = labelPreset;
    }

    regions.push(normalizedRegion);
  }

  return regions.sort((left, right) => left.order - right.order);
}

export function safeManuscriptChapterTitleBlocks(
  value: unknown,
): ManuscriptChapterTitleBlock[] | null {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const titleBlocks: ManuscriptChapterTitleBlock[] = [];
  const seenBlockIds = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }

    const titleBlock = item as Partial<ManuscriptChapterTitleBlock>;

    if (
      typeof titleBlock.id !== "string" ||
      !titleBlock.id.trim() ||
      typeof titleBlock.blockId !== "string" ||
      !titleBlock.blockId.trim() ||
      typeof titleBlock.createdAt !== "string" ||
      typeof titleBlock.updatedAt !== "string"
    ) {
      return null;
    }

    if (seenBlockIds.has(titleBlock.blockId)) {
      continue;
    }

    seenBlockIds.add(titleBlock.blockId);
    titleBlocks.push({
      id: titleBlock.id,
      blockId: titleBlock.blockId,
      createdAt: titleBlock.createdAt,
      updatedAt: titleBlock.updatedAt,
    });
  }

  return titleBlocks;
}

export function createStructureBoundaryMarkersFromChapterTitleBlocks(
  titleBlocks: ManuscriptChapterTitleBlock[],
): ManuscriptStructureBoundaryMarker[] {
  return titleBlocks.map((titleBlock) => ({
    id: `legacy-${titleBlock.id}`,
    kind: "chapter",
    blockId: titleBlock.blockId,
    title: "",
    notes: "Migrated from a legacy chapter-title marker.",
    createdAt: titleBlock.createdAt,
    updatedAt: titleBlock.updatedAt,
  }));
}

export function safeManuscriptStructureBoundaryMarkers(
  value: unknown,
): ManuscriptStructureBoundaryMarker[] | null {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const markers: ManuscriptStructureBoundaryMarker[] = [];
  const seenMarkerBlocks = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }

    const marker = item as Partial<ManuscriptStructureBoundaryMarker>;
    const kind = String(marker.kind ?? "");

    if (
      typeof marker.id !== "string" ||
      !marker.id.trim() ||
      !isManuscriptStructureBoundaryKind(kind) ||
      typeof marker.blockId !== "string" ||
      !marker.blockId.trim() ||
      typeof marker.title !== "string" ||
      typeof marker.notes !== "string" ||
      typeof marker.createdAt !== "string" ||
      typeof marker.updatedAt !== "string"
    ) {
      return null;
    }

    const markerBlockKey = `${kind}:${marker.blockId}`;

    if (seenMarkerBlocks.has(markerBlockKey)) {
      continue;
    }

    seenMarkerBlocks.add(markerBlockKey);
    const publicationDate =
      kind === "episode"
        ? normalizeEpisodePublicationDate(marker.publicationDate)
        : null;

    markers.push({
      id: marker.id,
      kind,
      blockId: marker.blockId,
      title: marker.title.trim(),
      notes: marker.notes.trim(),
      ...(publicationDate ? { publicationDate } : {}),
      createdAt: marker.createdAt,
      updatedAt: marker.updatedAt,
    });
  }

  return markers;
}

export function safeManuscriptQuoteReviews(
  value: unknown,
): Record<string, ManuscriptQuoteReview> | null {
  if (value === undefined) {
    return {};
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const reviews: Record<string, ManuscriptQuoteReview> = {};

  for (const [key, item] of Object.entries(value)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }

    const review = item as Partial<ManuscriptQuoteReview>;
    const highlightId = String(review.highlightId ?? key);
    const sourceType = String(review.sourceType ?? "unknown");
    const reviewStatus = String(review.reviewStatus ?? "needs-source");

    if (
      !highlightId.trim() ||
      typeof review.attributedTo !== "string" ||
      typeof review.sourceTitle !== "string" ||
      !isManuscriptQuoteSourceType(sourceType) ||
      typeof review.locator !== "string" ||
      typeof review.citationText !== "string" ||
      !isManuscriptQuoteReviewStatus(reviewStatus) ||
      typeof review.rightsNote !== "string" ||
      typeof review.editorNote !== "string" ||
      typeof review.updatedAt !== "string"
    ) {
      return null;
    }

    reviews[highlightId] = {
      highlightId,
      attributedTo: review.attributedTo,
      sourceTitle: review.sourceTitle,
      sourceType,
      locator: review.locator,
      citationText: review.citationText,
      reviewStatus,
      rightsNote: review.rightsNote,
      editorNote: review.editorNote,
      updatedAt: review.updatedAt,
    };
  }

  return reviews;
}

export function safeManuscriptImportSummary(
  value: unknown,
): ManuscriptImportSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const summary = value as Partial<ManuscriptImportSummary>;

  if (
    typeof summary.sourceFileName !== "string" ||
    typeof summary.words !== "number" ||
    typeof summary.characters !== "number" ||
    typeof summary.blocks !== "number" ||
    typeof summary.importedAt !== "string"
  ) {
    return null;
  }

  return {
    sourceFileName: summary.sourceFileName,
    words: summary.words,
    characters: summary.characters,
    blocks: summary.blocks,
    importedAt: summary.importedAt,
  };
}

export function hasMeaningfulManuscriptDraft(input: {
  title: string;
  sourceFileName: string | null;
  editorJson: ManuscriptEditorJson;
  importSummary?: ManuscriptImportSummary | null;
  structureRegions?: ManuscriptStructureRegion[];
  structureBoundaryMarkers?: ManuscriptStructureBoundaryMarker[];
  chapterTitleBlocks?: ManuscriptChapterTitleBlock[];
  quoteReviews?: Record<string, ManuscriptQuoteReview>;
}) {
  return (
    input.title.trim() !== defaultTitle ||
    Boolean(input.sourceFileName) ||
    Boolean(input.importSummary) ||
    Boolean(input.structureRegions?.length) ||
    Boolean(input.structureBoundaryMarkers?.length) ||
    Boolean(input.chapterTitleBlocks?.length) ||
    Boolean(Object.keys(input.quoteReviews ?? {}).length) ||
    countWordsAndCharacters(input.editorJson).words > 0
  );
}

export function createBackupFileName(input: {
  title: string;
  kind: string;
  extension: string;
  timestamp: string;
}) {
  const safeTitle =
    input.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "untitled-manuscript";
  const safeKind =
    input.kind
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "backup";
  const safeTimestamp =
    input.timestamp
      .trim()
      .replace(/[:.]/g, "-")
      .replace(/[^0-9a-zA-Z-]/g, "")
      .slice(0, 32) || "undated";
  const safeExtension =
    input.extension
      .trim()
      .toLowerCase()
      .replace(/^\.+/, "")
      .replace(/[^a-z0-9]+/g, "") || "txt";

  return `${safeTitle}-${safeKind}-${safeTimestamp}.${safeExtension}`;
}

export function ensureManuscriptBlockIds(
  json: ManuscriptEditorJson,
  createId: (nodeType: string, index: number) => string,
): ManuscriptEditorJson {
  let index = 0;

  function visit(node: ManuscriptEditorJson): ManuscriptEditorJson {
    const nextNode: ManuscriptEditorJson = {
      ...node,
      attrs: node.attrs ? { ...node.attrs } : undefined,
      marks: node.marks?.map((mark) => ({
        ...mark,
        attrs: mark.attrs ? { ...mark.attrs } : undefined,
      })),
      content: node.content?.map((child) => visit(child)),
    };

    if (
      typeof nextNode.type === "string" &&
      manuscriptBlockNodeTypes.includes(
        nextNode.type as (typeof manuscriptBlockNodeTypes)[number],
      )
    ) {
      const existingBlockId = nextNode.attrs?.blockId;

      if (typeof existingBlockId !== "string" || !existingBlockId.trim()) {
        index += 1;
        nextNode.attrs = {
          ...nextNode.attrs,
          blockId: createId(nextNode.type, index),
        };
      }
    }

    return nextNode;
  }

  return visit(json);
}

export function validateEditorJsonShape(
  value: unknown,
): value is ManuscriptEditorJson {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const node = value as Partial<ManuscriptEditorJson>;

  if (node.type !== undefined && typeof node.type !== "string") {
    return false;
  }

  if (node.text !== undefined && typeof node.text !== "string") {
    return false;
  }

  if (
    node.attrs !== undefined &&
    (!node.attrs || typeof node.attrs !== "object" || Array.isArray(node.attrs))
  ) {
    return false;
  }

  if (node.marks !== undefined) {
    if (!Array.isArray(node.marks)) {
      return false;
    }

    for (const mark of node.marks) {
      if (!mark || typeof mark !== "object" || Array.isArray(mark)) {
        return false;
      }

      if (mark.type !== undefined && typeof mark.type !== "string") {
        return false;
      }

      if (
        mark.attrs !== undefined &&
        (!mark.attrs ||
          typeof mark.attrs !== "object" ||
          Array.isArray(mark.attrs))
      ) {
        return false;
      }
    }
  }

  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) {
      return false;
    }

    return node.content.every((child) => validateEditorJsonShape(child));
  }

  return true;
}

export function safeManuscriptDraft(value: unknown): ManuscriptDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const draft = value as Partial<ManuscriptDraft>;
  const activeAuthorId = String(draft.activeAuthorId ?? "");
  const importSummary =
    draft.importSummary === null || draft.importSummary === undefined
      ? null
      : safeManuscriptImportSummary(draft.importSummary);
  const structureRegions = safeManuscriptStructureRegions(
    draft.structureRegions,
  );
  const parsedStructureBoundaryMarkers =
    safeManuscriptStructureBoundaryMarkers(draft.structureBoundaryMarkers);
  const chapterTitleBlocks = safeManuscriptChapterTitleBlocks(
    draft.chapterTitleBlocks,
  );
  const structureBoundaryMarkers =
    parsedStructureBoundaryMarkers?.length || draft.structureBoundaryMarkers !== undefined
      ? parsedStructureBoundaryMarkers
      : chapterTitleBlocks
        ? createStructureBoundaryMarkersFromChapterTitleBlocks(
            chapterTitleBlocks,
          )
        : null;
  const quoteReviews = safeManuscriptQuoteReviews(draft.quoteReviews);

  if (
    draft.schemaVersion !== MANUSCRIPT_SCHEMA_VERSION ||
    typeof draft.title !== "string" ||
    !validateEditorJsonShape(draft.editorJson) ||
    !structureRegions ||
    !structureBoundaryMarkers ||
    !chapterTitleBlocks ||
    !quoteReviews ||
    !isManuscriptAuthorId(activeAuthorId) ||
    typeof draft.showAuthorColors !== "boolean" ||
    typeof draft.showSemanticColors !== "boolean" ||
    !(
      draft.sourceFileName === null ||
      typeof draft.sourceFileName === "string"
    ) ||
    !(
      draft.importSummary === null ||
      draft.importSummary === undefined ||
      importSummary
    ) ||
    !(
      draft.lastUpdatedAt === null ||
      typeof draft.lastUpdatedAt === "string"
    )
  ) {
    return null;
  }

  return {
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    title: draft.title.trim() || defaultTitle,
    sourceFileName: draft.sourceFileName,
    importSummary,
    structureRegions,
    structureBoundaryMarkers,
    chapterTitleBlocks,
    quoteReviews,
    editorJson: draft.editorJson,
    activeAuthorId,
    showAuthorColors: draft.showAuthorColors,
    showSemanticColors: draft.showSemanticColors,
    lastUpdatedAt: draft.lastUpdatedAt,
  };
}
