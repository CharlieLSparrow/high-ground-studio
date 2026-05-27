"use client";

import type { JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import mammoth from "mammoth";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  cardClassName,
  cn,
  labelClassName,
  panelCopyClassName,
  StudioChip,
  StudioGlyph,
} from "../studio-ui";
import { AuthorMark, SemanticHighlightMark } from "./manuscript-editor-marks";
import {
  getManuscriptHelpNote,
  type ManuscriptHelpNoteId,
} from "./manuscript-help-notes";
import { ManuscriptHelpTip } from "./manuscript-help-tip";
import {
  collectBlockSummaries,
  collectCitedQuotationHighlights,
  collectManuscriptBlockDetails,
  collectSemanticHighlights,
  collectStructureRegionSummaries,
  countMissingBlockIds,
  countWordsAndCharacters,
  createBackupFileName,
  createBlockFilterOptions,
  createBlockRangeSummary,
  createCitedQuotationMarkdown,
  createDefaultManuscriptDraft,
  createDefaultManuscriptQuoteReview,
  createManuscriptStructureBoundaryIndex,
  createStructureBoundaryMarkersFromChapterTitleBlocks,
  deriveManuscriptChaptersFromTitleBlocks,
  createAuthorContributionMarkdown,
  createHgoEpisodeProjectionFromManuscript,
  createPublishingPacketMarkdown,
  createPublishReadinessReport,
  createQuoteReviewAppendixMarkdown,
  createRealManuscriptReadinessGate,
  createRecordingHandoffMarkdown,
  createSyntheticManuscriptSmokeDraft,
  createStudioManuscriptLibraryInputFromDraft,
  createManuscriptDraftCheckpointKey,
  createEmptyManuscriptDoc,
  createFilteredBlockListMarkdown,
  createFocusVisibleBlockIds,
  createManuscriptImportSummary,
  createStructureRegionDefaultTitle,
  createStructureOutlineMarkdown,
  ensureManuscriptBlockIds,
  formatEpisodePublicationDate,
  getManuscriptAuthorDefinition,
  getCurrentManuscriptStructureBoundary,
  getEpisodePublicationDateForIndex,
  getManuscriptQuoteReviewStatusFilterLabel,
  getManuscriptQuoteReviewStatusDefinition,
  getManuscriptQuoteSourceTypeDefinition,
  getManuscriptStructureLabelPresetDefinition,
  getManuscriptStructureDefinition,
  getNextManuscriptStructureBoundary,
  getSemanticHighlightDefinition,
  hasMeaningfulManuscriptDraft,
  isSyntheticManuscriptSmokeDraft,
  MANUSCRIPT_SCHEMA_VERSION,
  MANUSCRIPT_STORAGE_KEY,
  manuscriptAuthorDefinitions,
  manuscriptFilterVisualModeDefinitions,
  manuscriptQuoteReviewStatusFilterDefinitions,
  manuscriptQuoteReviewStatusDefinitions,
  manuscriptQuoteSourceTypeDefinitions,
  manuscriptStructureDefinitions,
  manuscriptStructureLabelPresets,
  moveManuscriptStructureRegionWithinKind,
  removeManuscriptQuoteReview,
  rebindManuscriptStructureBlockIds,
  semanticHighlightDefinitions,
  safeManuscriptDraft,
  filterCitedQuotationsByReviewStatus,
  filterManuscriptBlocks,
  STUDIO_HGO_PROJECTION_BRIDGE_WARNING_COPY,
  studioManuscriptLibraryKindDefinitions,
  suggestBookStructureRegionsFromHeadings,
  summarizeBlockFilterResults,
  summarizeCitedQuotationReviewProgress,
  summarizeAuthorMarkedSpans,
  updateManuscriptQuoteReview,
  updateManuscriptStructureRegion,
  validateEditorJsonShape,
  type ManuscriptAuthorId,
  type ManuscriptBlockFilterCriteria,
  type ManuscriptCitedQuotationSummary,
  type ManuscriptDerivedChapter,
  type ManuscriptDraft,
  type ManuscriptEditorJson,
  type ManuscriptFilterVisualMode,
  type ManuscriptImportSummary,
  type ManuscriptQuoteReview,
  type ManuscriptQuoteReviewStatus,
  type ManuscriptQuoteReviewStatusFilter,
  type ManuscriptQuoteSourceType,
  type StudioHgoProjectionStatus,
  type StudioHgoProjectionVisibility,
  type StudioManuscriptLibraryKind,
  type ManuscriptStructureBoundary,
  type ManuscriptStructureBoundaryKind,
  type ManuscriptStructureBoundaryMarker,
  type ManuscriptStructureKind,
  type ManuscriptStructureLabelPreset,
  type ManuscriptStructureRegion,
  type ManuscriptStructureRegionSummary,
  type SemanticHighlightType,
} from "./manuscript-editor-model";

type StudioManuscriptClientProps = {
  actor: {
    primaryEmail: string;
  };
  initialLiveSnapshotSlug?: string | null;
};

type ManuscriptServerSnapshotSummary = {
  id: string;
  manuscriptId: string | null;
  ownerEmail: string;
  snapshotType: "manual";
  title: string;
  description: string | null;
  schemaVersion: number;
  sourceFileName: string | null;
  contentHash: string | null;
  clientUpdatedAt: string | null;
  wordCount: number;
  characterCount: number;
  blockCount: number;
  structureCount: number;
  citedQuoteCount: number;
  quoteReviewCount: number;
  createdAt: string;
  updatedAt: string;
};

type ManuscriptServerSnapshotDetail = ManuscriptServerSnapshotSummary & {
  draft: ManuscriptDraft;
};

type ManuscriptLibrarySummary = {
  id: string;
  ownerEmail: string;
  title: string;
  description: string | null;
  sourceFileName: string | null;
  kind: StudioManuscriptLibraryKind;
  snapshotCount: number;
  latestSnapshot: ManuscriptServerSnapshotSummary | null;
  lastSnapshotAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

type ManuscriptLibraryListResponse =
  | { ok: true; manuscripts: ManuscriptLibrarySummary[] }
  | { ok: false; message: string };

type ManuscriptLibraryCreateResponse =
  | { ok: true; manuscript: ManuscriptLibrarySummary }
  | { ok: false; message: string };

type ManuscriptSnapshotListResponse =
  | { ok: true; snapshots: ManuscriptServerSnapshotSummary[] }
  | { ok: false; message: string };

type ManuscriptSnapshotSaveResponse =
  | { ok: true; snapshot: ManuscriptServerSnapshotSummary }
  | { ok: false; message: string };

type ManuscriptSnapshotLatestResponse =
  | { ok: true; snapshot: ManuscriptServerSnapshotDetail | null }
  | { ok: false; message: string };

type ManuscriptLiveSnapshotResponse =
  | {
      ok: true;
      slug: string;
      snapshot: ManuscriptServerSnapshotDetail | null;
    }
  | { ok: false; message: string };

type ManuscriptLiveEditFreshnessState =
  | "current"
  | "outside-changes"
  | "no-backup"
  | "no-room";

type ManuscriptLiveEditStatusResponse =
  | {
      ok: true;
      room: {
        seedSnapshotId: string | null;
        lastCheckpointSnapshotId: string | null;
        hasPersistedState: boolean;
        updatedAt: string;
      } | null;
      latestSnapshot: {
        id: string;
        title: string;
        updatedAt: string;
        wordCount: number;
        blockCount: number;
      } | null;
      freshness: {
        state: ManuscriptLiveEditFreshnessState;
        latestSnapshotId: string | null;
        roomBaselineSnapshotId: string | null;
        seedSnapshotId: string | null;
        lastCheckpointSnapshotId: string | null;
      };
    }
  | { ok: false; message: string };

type ManuscriptSnapshotDetailResponse =
  | { ok: true; snapshot: ManuscriptServerSnapshotDetail | null }
  | { ok: false; message: string };

type ManuscriptSidePanelMode =
  | "mark"
  | "structure"
  | "find"
  | "quotes"
  | "backup"
  | "publish";

type RecordingOutlineKind = ManuscriptStructureKind | "all";

type ManuscriptTipTapEditor = NonNullable<ReturnType<typeof useEditor>>;

type ManuscriptTextSelectionRange = {
  from: number;
  to: number;
};

type ManuscriptTagContextMenuState = ManuscriptTextSelectionRange & {
  x: number;
  y: number;
};

type ManuscriptStructureRailState = {
  chapter: ManuscriptStructureBoundary | null;
  episode: ManuscriptStructureBoundary | null;
  nextChapter: ManuscriptStructureBoundary | null;
  nextEpisode: ManuscriptStructureBoundary | null;
};

const emptyStructureRailState: ManuscriptStructureRailState = {
  chapter: null,
  episode: null,
  nextChapter: null,
  nextEpisode: null,
};

const everydayManuscriptSidePanelModes = [
  { id: "mark", label: "Mark" },
  { id: "structure", label: "Structure" },
  { id: "find", label: "Find" },
  { id: "quotes", label: "Quotes" },
] as const satisfies Array<{ id: ManuscriptSidePanelMode; label: string }>;

const devManuscriptSidePanelModes = [
  { id: "backup", label: "Backup" },
  { id: "publish", label: "Publish" },
] as const satisfies Array<{ id: ManuscriptSidePanelMode; label: string }>;

const manuscriptSidePanelModes = [
  ...everydayManuscriptSidePanelModes,
  ...devManuscriptSidePanelModes,
] as const satisfies Array<{ id: ManuscriptSidePanelMode; label: string }>;

const fieldLabelClassName =
  "text-[0.78rem] font-extrabold uppercase text-studio-muted";

const fieldClassName =
  "min-h-10 w-full rounded-lg border border-studio-line-strong bg-[#041f1e] px-2.5 py-2 text-studio-ink disabled:text-studio-dim";

const textareaClassName =
  "w-full resize-y rounded-lg border border-studio-line-strong bg-[#041f1e] px-3 py-2.5 text-[0.9rem] leading-6 text-studio-ink disabled:text-studio-dim";

const smallButtonClassName =
  "min-h-10 rounded-lg border border-studio-line bg-studio-ink/5 px-3 py-2 text-[0.8rem] font-extrabold text-studio-source disabled:text-studio-dim sm:min-h-8 sm:px-2.5 sm:py-1.5 sm:text-[0.78rem]";

const commandButtonClassName =
  "min-h-7 rounded-md border border-studio-line bg-studio-ink/5 px-2 py-1 text-[0.72rem] font-extrabold leading-tight text-studio-source transition hover:border-studio-source/55 hover:bg-studio-source/10 disabled:text-studio-dim";

const commandChipClassName =
  "min-h-6 shrink-0 rounded-md px-1.5 py-[3px] text-[0.66rem] leading-tight";

const activeButtonClassName =
  "border-studio-tag/55 bg-studio-tag/15 text-studio-tag";

const dangerButtonClassName =
  "min-h-10 rounded-lg border border-studio-danger/45 bg-studio-danger/10 px-3 py-2 text-[0.8rem] font-extrabold text-studio-danger sm:min-h-8 sm:px-2.5 sm:py-1.5 sm:text-[0.78rem]";

const blockNodeTypes = ["paragraph", "heading", "listItem"];

function collectRenderedManuscriptBlockNodeList(root: HTMLElement) {
  const nodes: HTMLElement[] = [];
  const seenBlockIds = new Set<string>();
  const collectFrom = (parent: ParentNode) => {
    parent.querySelectorAll<HTMLElement>("[data-blockid]").forEach((node) => {
      const blockId = node.getAttribute("data-blockid");

      if (blockId && !seenBlockIds.has(blockId)) {
        seenBlockIds.add(blockId);
        nodes.push(node);
      }
    });
  };

  collectFrom(root);

  if (!nodes.length) {
    document
      .querySelectorAll<HTMLElement>(".manuscript-prosemirror [data-blockid]")
      .forEach((node) => {
        const blockId = node.getAttribute("data-blockid");

        if (blockId && !seenBlockIds.has(blockId)) {
          seenBlockIds.add(blockId);
          nodes.push(node);
        }
      });
  }

  return nodes;
}

type SemanticHighlightDefinition =
  (typeof semanticHighlightDefinitions)[number];
type SemanticHighlightColorKey = SemanticHighlightDefinition["colorKey"];

const quickSemanticHighlightTypes = [
  "clip",
  "show-notes",
] as const satisfies readonly SemanticHighlightType[];

const semanticControlClassNames: Record<SemanticHighlightColorKey, string> = {
  quote: "border-studio-node/55 bg-studio-node/10 text-studio-node",
  "cited-quotation":
    "border-studio-node/75 bg-studio-node/15 text-studio-node",
  "quote-candidate":
    "border-studio-source/55 bg-studio-source/10 text-studio-source",
  clip: "border-[#8b3126]/70 bg-[#8b3126]/15 text-[#e89a8e]",
  "show-notes": "border-[#c19a55]/65 bg-[#c19a55]/10 text-[#e6c780]",
  story: "border-studio-tag/55 bg-studio-tag/10 text-studio-tag",
  insight: "border-studio-source/55 bg-studio-source/10 text-studio-source",
  research: "border-studio-review/55 bg-studio-review/10 text-studio-review",
  question: "border-studio-danger/55 bg-studio-danger/10 text-studio-danger",
  "needs-review":
    "border-studio-danger/55 bg-studio-danger/10 text-studio-danger",
  thesis: "border-studio-ink/45 bg-studio-ink/10 text-studio-ink",
  transition: "border-studio-node/55 bg-studio-node/10 text-studio-node",
};

const semanticSwatchClassNames: Record<SemanticHighlightColorKey, string> = {
  quote: "bg-studio-node",
  "cited-quotation": "bg-studio-node",
  "quote-candidate": "bg-studio-source",
  clip: "bg-[#8b3126]",
  "show-notes": "bg-[#c19a55]",
  story: "bg-studio-tag",
  insight: "bg-studio-source",
  research: "bg-studio-review",
  question: "bg-studio-danger",
  "needs-review": "bg-studio-danger",
  thesis: "bg-studio-ink",
  transition: "bg-studio-node",
};

const semanticActiveControlClassName = "ring-1 ring-inset ring-current";

const MANUSCRIPT_LIVE_LATEST_PATH = "/manuscript/live/latest";
const MANUSCRIPT_LIVE_EDIT_PATH = "/manuscript/collab/latest";

function HelpHeading({
  children,
  className,
  noteId,
}: {
  children: ReactNode;
  className?: string;
  noteId: ManuscriptHelpNoteId;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <h2
        className={cn(
          "m-0 text-[1rem] leading-snug text-studio-ink",
          className,
        )}
      >
        {children}
      </h2>
      <ManuscriptHelpTip note={getManuscriptHelpNote(noteId)} />
    </div>
  );
}

function HelpLabel({
  children,
  noteId,
}: {
  children: ReactNode;
  noteId: ManuscriptHelpNoteId;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={fieldLabelClassName}>{children}</span>
      <ManuscriptHelpTip note={getManuscriptHelpNote(noteId)} />
    </span>
  );
}

function createId(prefix: string) {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${prefix}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
  );
}

function createBlockId(nodeType: string, index = 0) {
  return `block-${nodeType}-${index}-${createId("m")}`;
}

function createHighlightId() {
  return `semantic-${createId("highlight")}`;
}

function createStructureRegionId() {
  return `structure-${createId("region")}`;
}

function createStructureBoundaryMarkerId(kind: ManuscriptStructureBoundaryKind) {
  return `boundary-${kind}-${createId("marker")}`;
}

function createLegacyChapterTitleBlocks(
  markers: ManuscriptStructureBoundaryMarker[],
) {
  return markers
    .filter((marker) => marker.kind === "chapter")
    .map((marker) => ({
      id: marker.id,
      blockId: marker.blockId,
      createdAt: marker.createdAt,
      updatedAt: marker.updatedAt,
    }));
}

function getSemanticControlClassName(
  definition: SemanticHighlightDefinition,
  isActive: boolean,
  baseClassName = smallButtonClassName,
) {
  return cn(
    baseClassName,
    "inline-flex min-w-0 items-center justify-center gap-1.5",
    semanticControlClassNames[definition.colorKey],
    isActive && semanticActiveControlClassName,
  );
}

function SemanticTagLabel({
  definition,
}: {
  definition: SemanticHighlightDefinition;
}) {
  return (
    <span className="inline-flex min-w-0 items-center justify-center gap-1.5">
      <span
        className={cn(
          "size-2.5 shrink-0 rounded-full shadow-[0_0_0_2px_rgba(244,240,232,0.14)]",
          semanticSwatchClassNames[definition.colorKey],
        )}
        aria-hidden="true"
      />
      <span className="min-w-0 truncate">{definition.label}</span>
    </span>
  );
}

function areStructureRailRegionsEqual(
  left: ManuscriptStructureBoundary | null,
  right: ManuscriptStructureBoundary | null,
) {
  return (
    left?.id === right?.id &&
    left?.source === right?.source &&
    left?.label === right?.label &&
    left?.title === right?.title &&
    left?.startIndex === right?.startIndex &&
    left?.endIndex === right?.endIndex
  );
}

function areStructureRailStatesEqual(
  left: ManuscriptStructureRailState,
  right: ManuscriptStructureRailState,
) {
  return (
    areStructureRailRegionsEqual(left.chapter, right.chapter) &&
    areStructureRailRegionsEqual(left.episode, right.episode) &&
    areStructureRailRegionsEqual(left.nextChapter, right.nextChapter) &&
    areStructureRailRegionsEqual(left.nextEpisode, right.nextEpisode)
  );
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not saved yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getQuoteReviewStatusTone(status: ManuscriptQuoteReviewStatus) {
  if (status === "verified") {
    return "source" as const;
  }

  if (status === "do-not-use") {
    return "danger" as const;
  }

  return "review" as const;
}

function getSidePanelModeLabel(mode: ManuscriptSidePanelMode) {
  return (
    manuscriptSidePanelModes.find((definition) => definition.id === mode)
      ?.label ?? "Mark"
  );
}

function getSidePanelModeHelpNoteId(
  mode: ManuscriptSidePanelMode,
): ManuscriptHelpNoteId {
  if (mode === "mark") {
    return "mark-mode";
  }

  if (mode === "find") {
    return "find-mode";
  }

  if (mode === "quotes") {
    return "quotes-mode";
  }

  if (mode === "backup") {
    return "backup-mode";
  }

  if (mode === "publish") {
    return "publish-mode";
  }

  return "structure-region";
}

function getReadinessIssueTone(severity: "info" | "warning" | "blocker") {
  if (severity === "blocker") {
    return "danger" as const;
  }

  if (severity === "warning") {
    return "review" as const;
  }

  return "source" as const;
}

function getAuthorMarkAttrs(authorId: ManuscriptAuthorId) {
  const author = getManuscriptAuthorDefinition(authorId);

  return {
    authorId: author.id,
    authorLabel: author.label,
  };
}

function createDraftFromState(input: {
  title: string;
  sourceFileName: string | null;
  importSummary: ManuscriptImportSummary | null;
  structureRegions: ManuscriptStructureRegion[];
  structureBoundaryMarkers: ManuscriptStructureBoundaryMarker[];
  quoteReviews: Record<string, ManuscriptQuoteReview>;
  editorJson: ManuscriptEditorJson;
  activeAuthorId: ManuscriptAuthorId;
  showAuthorColors: boolean;
  showSemanticColors: boolean;
  lastUpdatedAt: string | null;
}): ManuscriptDraft {
  return {
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    title: input.title.trim() || "Untitled manuscript",
    sourceFileName: input.sourceFileName,
    importSummary: input.importSummary,
    structureRegions: input.structureRegions,
    structureBoundaryMarkers: input.structureBoundaryMarkers,
    chapterTitleBlocks: createLegacyChapterTitleBlocks(
      input.structureBoundaryMarkers,
    ),
    quoteReviews: input.quoteReviews,
    editorJson: input.editorJson,
    activeAuthorId: input.activeAuthorId,
    showAuthorColors: input.showAuthorColors,
    showSemanticColors: input.showSemanticColors,
    lastUpdatedAt: input.lastUpdatedAt,
  };
}

function ensureBlockIds(json: ManuscriptEditorJson) {
  return ensureManuscriptBlockIds(json, createBlockId);
}

function getEditorSelectionBlockRange(
  editor: ManuscriptTipTapEditor,
) {
  const blockIds: string[] = [];
  const seen = new Set<string>();
  const { from, to, $from } = editor.state.selection;

  editor.state.doc.nodesBetween(from, to, (node) => {
    if (!blockNodeTypes.includes(node.type.name)) {
      return true;
    }

    const blockId = node.attrs.blockId;

    if (typeof blockId === "string" && blockId.trim() && !seen.has(blockId)) {
      seen.add(blockId);
      blockIds.push(blockId);
    }

    return true;
  });

  if (!blockIds.length) {
    for (let depth = $from.depth; depth >= 0; depth -= 1) {
      const node = $from.node(depth);
      const blockId = node.attrs.blockId;

      if (
        blockNodeTypes.includes(node.type.name) &&
        typeof blockId === "string" &&
        blockId.trim()
      ) {
        blockIds.push(blockId);
        break;
      }
    }
  }

  if (!blockIds.length) {
    return null;
  }

  return {
    startBlockId: blockIds[0],
    endBlockId: blockIds[blockIds.length - 1],
    blockCount: blockIds.length,
  };
}

function getEditorTextSelectionRange(
  editor: ManuscriptTipTapEditor,
): ManuscriptTextSelectionRange | null {
  const { empty, from, to } = editor.state.selection;

  if (empty || from === to) {
    return null;
  }

  const selectedText = editor.state.doc.textBetween(from, to, " ").trim();

  if (!selectedText) {
    return null;
  }

  return { from, to };
}

function getTagContextMenuPosition(event: ReactMouseEvent<HTMLElement>) {
  const margin = 12;
  const menuWidth = 320;
  const menuHeight = 420;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight;

  return {
    x: Math.max(
      margin,
      Math.min(event.clientX, viewportWidth - menuWidth - margin),
    ),
    y: Math.max(
      margin,
      Math.min(event.clientY, viewportHeight - menuHeight - margin),
    ),
  };
}

function setCursorAtDocumentEnd(editor: NonNullable<ReturnType<typeof useEditor>>) {
  editor.commands.setTextSelection(editor.state.doc.content.size);
}

function downloadTextFile(input: {
  content: string;
  fileName: string;
  mimeType: string;
}) {
  const blob = new Blob([input.content], { type: input.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = input.fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function StudioManuscriptClient({
  actor,
  initialLiveSnapshotSlug = null,
}: StudioManuscriptClientProps) {
  const skipNextPersistRef = useRef(false);
  const liveSnapshotLoadStartedRef = useRef(false);
  const initialServerRefreshStartedRef = useRef(false);
  const manuscriptSurfaceRef = useRef<HTMLElement | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [title, setTitle] = useState("Untitled manuscript");
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [importSummary, setImportSummary] =
    useState<ManuscriptImportSummary | null>(null);
  const [activeAuthorId, setActiveAuthorId] =
    useState<ManuscriptAuthorId>("homer");
  const [showAuthorColors, setShowAuthorColors] = useState(true);
  const [showSemanticColors, setShowSemanticColors] = useState(true);
  const [sidePanelMode, setSidePanelMode] =
    useState<ManuscriptSidePanelMode>("mark");
  const [isDevMode, setIsDevMode] = useState(false);
  const [isRecordingMode, setIsRecordingMode] = useState(false);
  const [isMobileToolsOpen, setIsMobileToolsOpen] = useState(false);
  const [isSaveShareDialogOpen, setIsSaveShareDialogOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [recordingOutlineKind, setRecordingOutlineKind] =
    useState<RecordingOutlineKind>("all");
  const [semanticType, setSemanticType] =
    useState<SemanticHighlightType>("insight");
  const [semanticNote, setSemanticNote] = useState("");
  const [citationNote, setCitationNote] = useState("");
  const [structureKind, setStructureKind] =
    useState<ManuscriptStructureKind>("chapter");
  const [structureLabelPreset, setStructureLabelPreset] =
    useState<ManuscriptStructureLabelPreset>("chapter");
  const [structureTitle, setStructureTitle] = useState("");
  const [structureNotes, setStructureNotes] = useState("");
  const [structureRegions, setStructureRegions] = useState<
    ManuscriptStructureRegion[]
  >([]);
  const [structureBoundaryMarkers, setStructureBoundaryMarkers] = useState<
    ManuscriptStructureBoundaryMarker[]
  >([]);
  const [editingBoundaryMarkerId, setEditingBoundaryMarkerId] = useState<
    string | null
  >(null);
  const [editingBoundaryTitle, setEditingBoundaryTitle] = useState("");
  const [editingBoundaryNotes, setEditingBoundaryNotes] = useState("");
  const [quoteReviews, setQuoteReviews] = useState<
    Record<string, ManuscriptQuoteReview>
  >({});
  const [editingStructureRegionId, setEditingStructureRegionId] = useState<
    string | null
  >(null);
  const [editingStructureKind, setEditingStructureKind] =
    useState<ManuscriptStructureKind>("chapter");
  const [editingStructureLabelPreset, setEditingStructureLabelPreset] =
    useState<ManuscriptStructureLabelPreset>("custom");
  const [editingStructureTitle, setEditingStructureTitle] = useState("");
  const [editingStructureNotes, setEditingStructureNotes] = useState("");
  const [selectedStructureRange, setSelectedStructureRange] = useState<{
    startBlockId: string;
    endBlockId: string;
    blockCount: number;
  } | null>(null);
  const [structureRailState, setStructureRailState] =
    useState<ManuscriptStructureRailState>(emptyStructureRailState);
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const [tagContextMenu, setTagContextMenu] =
    useState<ManuscriptTagContextMenuState | null>(null);
  const [pendingStructureStartBlockId, setPendingStructureStartBlockId] =
    useState<string | null>(null);
  const [pendingStructureEndBlockId, setPendingStructureEndBlockId] =
    useState<string | null>(null);
  const [filterTextQuery, setFilterTextQuery] = useState("");
  const [filterAuthorId, setFilterAuthorId] = useState<
    ManuscriptAuthorId | ""
  >("");
  const [filterSemanticType, setFilterSemanticType] = useState<
    SemanticHighlightType | ""
  >("");
  const [filterStructureRegionId, setFilterStructureRegionId] = useState("");
  const [filterStructureKind, setFilterStructureKind] = useState<
    ManuscriptStructureKind | ""
  >("");
  const [filterBlockType, setFilterBlockType] = useState("");
  const [filterQuoteReviewStatus, setFilterQuoteReviewStatus] = useState<
    ManuscriptQuoteReviewStatusFilter | ""
  >("");
  const [filterOnlyUnstructured, setFilterOnlyUnstructured] = useState(false);
  const [filterOnlyWithSemanticHighlights, setFilterOnlyWithSemanticHighlights] =
    useState(false);
  const [filterOnlyWithoutAuthor, setFilterOnlyWithoutAuthor] = useState(false);
  const [filterVisualMode, setFilterVisualMode] =
    useState<ManuscriptFilterVisualMode>("highlight-matches");
  const [filterContextBlockCount, setFilterContextBlockCount] = useState(0);
  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);
  const [editingQuoteReviewHighlightId, setEditingQuoteReviewHighlightId] =
    useState<string | null>(null);
  const [editingQuoteAttributedTo, setEditingQuoteAttributedTo] = useState("");
  const [editingQuoteSourceTitle, setEditingQuoteSourceTitle] = useState("");
  const [editingQuoteSourceType, setEditingQuoteSourceType] =
    useState<ManuscriptQuoteSourceType>("unknown");
  const [editingQuoteLocator, setEditingQuoteLocator] = useState("");
  const [editingQuoteCitationText, setEditingQuoteCitationText] = useState("");
  const [editingQuoteReviewStatus, setEditingQuoteReviewStatus] =
    useState<ManuscriptQuoteReviewStatus>("needs-source");
  const [editingQuoteRightsNote, setEditingQuoteRightsNote] = useState("");
  const [editingQuoteEditorNote, setEditingQuoteEditorNote] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [serverManuscripts, setServerManuscripts] = useState<
    ManuscriptLibrarySummary[]
  >([]);
  const [selectedServerManuscriptId, setSelectedServerManuscriptId] =
    useState("");
  const [serverManuscriptDescription, setServerManuscriptDescription] =
    useState("");
  const [serverManuscriptStatus, setServerManuscriptStatus] = useState(
    "Manuscript library not checked yet.",
  );
  const [isServerManuscriptBusy, setIsServerManuscriptBusy] = useState(false);
  const [serverSnapshots, setServerSnapshots] = useState<
    ManuscriptServerSnapshotSummary[]
  >([]);
  const [selectedServerSnapshotId, setSelectedServerSnapshotId] = useState("");
  const [serverSnapshotDescription, setServerSnapshotDescription] =
    useState("");
  const [isServerSnapshotBusy, setIsServerSnapshotBusy] = useState(false);
  const [isServerSnapshotUnavailable, setIsServerSnapshotUnavailable] =
    useState(false);
  const [serverConnectionState, setServerConnectionState] = useState<
    "unchecked" | "connected" | "unavailable"
  >("unchecked");
  const [liveEditStatus, setLiveEditStatus] =
    useState<ManuscriptLiveEditStatusResponse | null>(null);
  const [isLiveEditStatusBusy, setIsLiveEditStatusBusy] = useState(false);
  const [lastSavedServerSnapshot, setLastSavedServerSnapshot] =
    useState<ManuscriptServerSnapshotSummary | null>(null);
  const [serverCheckpointKey, setServerCheckpointKey] = useState<string | null>(
    null,
  );
  const [serverSnapshotStatus, setServerSnapshotStatus] = useState(
    "Server snapshots not checked yet.",
  );
  const [sessionStartWordCount, setSessionStartWordCount] = useState<number | null>(
    null,
  );
  const [editorJson, setEditorJson] = useState<ManuscriptEditorJson>(
    createEmptyManuscriptDoc(),
  );
  const [exportJson, setExportJson] = useState("");
  const [importJson, setImportJson] = useState("");
  const [exportHtml, setExportHtml] = useState("");
  const [exportPlainText, setExportPlainText] = useState("");
  const [exportStructureMarkdown, setExportStructureMarkdown] = useState("");
  const [exportFilteredMarkdown, setExportFilteredMarkdown] = useState("");
  const [exportCitedQuotationMarkdown, setExportCitedQuotationMarkdown] =
    useState("");
  const [exportPublishingPacketMarkdown, setExportPublishingPacketMarkdown] =
    useState("");
  const [exportRecordingHandoffMarkdown, setExportRecordingHandoffMarkdown] =
    useState("");
  const [exportQuoteAppendixMarkdown, setExportQuoteAppendixMarkdown] =
    useState("");
  const [exportAuthorContributionMarkdown, setExportAuthorContributionMarkdown] =
    useState("");
  const [exportHgoProjectionJson, setExportHgoProjectionJson] = useState("");
  const [hgoProjectionStatus, setHgoProjectionStatus] =
    useState<StudioHgoProjectionStatus>("synthetic");
  const [hgoProjectionVisibility, setHgoProjectionVisibility] =
    useState<StudioHgoProjectionVisibility>("private");
  const [selectedHgoProjectionRegionId, setSelectedHgoProjectionRegionId] =
    useState("");
  const [hasGeneratedSmokePublishingPacket, setHasGeneratedSmokePublishingPacket] =
    useState(false);
  const [hasGeneratedSmokeRecordingHandoff, setHasGeneratedSmokeRecordingHandoff] =
    useState(false);
  const [hasGeneratedSmokeQuoteAppendix, setHasGeneratedSmokeQuoteAppendix] =
    useState(false);
  const [
    hasConfirmedSyntheticServerSnapshotSaved,
    setHasConfirmedSyntheticServerSnapshotSaved,
  ] = useState(false);
  const [
    hasConfirmedSyntheticPhoneLoad,
    setHasConfirmedSyntheticPhoneLoad,
  ] = useState(false);
  const [
    hasConfirmedFullDraftJsonBackup,
    setHasConfirmedFullDraftJsonBackup,
  ] = useState(false);
  const [message, setMessage] = useState(
    "Browser-local Manuscript Desk draft.",
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      UniqueID.configure({
        attributeName: "blockId",
        types: blockNodeTypes,
        generateID: ({ node, pos }) => createBlockId(node.type.name, pos),
      }),
      AuthorMark,
      SemanticHighlightMark,
    ],
    content: createEmptyManuscriptDoc() as JSONContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "manuscript-prosemirror min-h-[560px] bg-transparent px-0 py-0 text-[1rem] leading-8 text-studio-ink outline-none",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      setEditorJson(currentEditor.getJSON() as ManuscriptEditorJson);
    },
  });

  useEffect(() => {
    if (!editor || isHydrated) {
      return;
    }

    try {
      const rawDraft = window.localStorage.getItem(MANUSCRIPT_STORAGE_KEY);

      if (rawDraft) {
        const parsed = safeManuscriptDraft(JSON.parse(rawDraft));

        if (parsed) {
          applyDraftToEditor(parsed, "Loaded browser-local Manuscript Desk draft.");
        }
      }
    } catch (error) {
      console.error("Manuscript Desk draft load failed.", error);
      setMessage("Could not load the browser-local manuscript draft.");
    } finally {
      setIsHydrated(true);
    }
  }, [editor, isHydrated]);

  useEffect(() => {
    if (!editor || !isHydrated) {
      return;
    }

    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    const timestamp = new Date().toISOString();
    const draft = createDraftFromState({
      title,
      sourceFileName,
      importSummary,
      structureRegions,
      structureBoundaryMarkers,
      quoteReviews,
      editorJson: ensureBlockIds(editor.getJSON() as ManuscriptEditorJson),
      activeAuthorId,
      showAuthorColors,
      showSemanticColors,
      lastUpdatedAt: timestamp,
    });

    try {
      window.localStorage.setItem(
        MANUSCRIPT_STORAGE_KEY,
        JSON.stringify(draft),
      );
      setLastUpdatedAt(timestamp);
    } catch (error) {
      console.error("Manuscript Desk draft save failed.", error);
      setMessage("Could not save the browser-local manuscript draft.");
    }
  }, [
    activeAuthorId,
    editor,
    editorJson,
    importSummary,
    isHydrated,
    quoteReviews,
    showAuthorColors,
    showSemanticColors,
    sourceFileName,
    structureBoundaryMarkers,
    structureRegions,
    title,
  ]);

  const currentEditorJson = useMemo(
    () => ensureBlockIds(editorJson),
    [editorJson],
  );
  const textStats = useMemo(
    () => countWordsAndCharacters(currentEditorJson),
    [currentEditorJson],
  );

  useEffect(() => {
    if (isHydrated && sessionStartWordCount === null) {
      setSessionStartWordCount(textStats.words);
    }
  }, [isHydrated, sessionStartWordCount, textStats.words]);

  const blockSummaries = useMemo(
    () => collectBlockSummaries(currentEditorJson),
    [currentEditorJson],
  );
  const chapterTitleBlocks = useMemo(
    () => createLegacyChapterTitleBlocks(structureBoundaryMarkers),
    [structureBoundaryMarkers],
  );
  const derivedChapters = useMemo(
    () =>
      deriveManuscriptChaptersFromTitleBlocks({
        blocks: blockSummaries,
        chapterTitleBlocks,
      }),
    [blockSummaries, chapterTitleBlocks],
  );
  const chapterTitleBlockIds = useMemo(
    () => new Set(chapterTitleBlocks.map((titleBlock) => titleBlock.blockId)),
    [chapterTitleBlocks],
  );
  const episodeBoundaryBlockIds = useMemo(
    () =>
      new Set(
        structureBoundaryMarkers
          .filter((marker) => marker.kind === "episode")
          .map((marker) => marker.blockId),
      ),
    [structureBoundaryMarkers],
  );
  const leadingChapterlessBlockCount = useMemo(() => {
    if (!blockSummaries.length || !derivedChapters.length) {
      return blockSummaries.length;
    }

    return Math.max(0, derivedChapters[0].startIndex);
  }, [blockSummaries.length, derivedChapters]);
  const pendingStructureRange = useMemo(
    () =>
      createBlockRangeSummary({
        blocks: blockSummaries,
        startBlockId: pendingStructureStartBlockId,
        endBlockId: pendingStructureEndBlockId,
      }),
    [blockSummaries, pendingStructureEndBlockId, pendingStructureStartBlockId],
  );
  const structureRegionSummaries = useMemo(
    () =>
      collectStructureRegionSummaries({
        json: currentEditorJson,
        regions: structureRegions,
      }),
    [currentEditorJson, structureRegions],
  );
  const structureBoundaryIndex = useMemo(
    () =>
      createManuscriptStructureBoundaryIndex({
        blocks: blockSummaries,
        boundaryMarkers: structureBoundaryMarkers,
      }),
    [blockSummaries, structureBoundaryMarkers],
  );
  const structureRailRegions = useMemo(
    () => ({
      chapters: structureBoundaryIndex.chapters,
      episodes: structureBoundaryIndex.episodes,
    }),
    [structureBoundaryIndex],
  );
  const hgoEpisodeRegionOptions = useMemo(
    () => structureRegionSummaries.filter((region) => region.kind === "episode"),
    [structureRegionSummaries],
  );
  const activeHgoProjectionRegionId = useMemo(() => {
    if (
      selectedHgoProjectionRegionId &&
      hgoEpisodeRegionOptions.some(
        (region) => region.id === selectedHgoProjectionRegionId,
      )
    ) {
      return selectedHgoProjectionRegionId;
    }

    return hgoEpisodeRegionOptions[0]?.id ?? "";
  }, [hgoEpisodeRegionOptions, selectedHgoProjectionRegionId]);
  const structureOutlineMarkdown = useMemo(
    () =>
      createStructureOutlineMarkdown({
        regions: structureRegionSummaries,
      }),
    [structureRegionSummaries],
  );
  const blockDetails = useMemo(
    () =>
      collectManuscriptBlockDetails({
        json: currentEditorJson,
        regions: structureRegions,
        quoteReviews,
      }),
    [currentEditorJson, quoteReviews, structureRegions],
  );
  const blockFilterOptions = useMemo(
    () => createBlockFilterOptions(blockDetails),
    [blockDetails],
  );
  const blockFilterCriteria = useMemo<ManuscriptBlockFilterCriteria>(
    () => ({
      textQuery: filterTextQuery,
      authorId: filterAuthorId || null,
      semanticTagType: filterSemanticType || null,
      structureRegionId: filterStructureRegionId || null,
      structureKind: filterStructureKind || null,
      blockType: filterBlockType || null,
      quoteReviewStatus: filterQuoteReviewStatus || null,
      onlyUnstructured: filterOnlyUnstructured,
      onlyWithSemanticHighlights: filterOnlyWithSemanticHighlights,
      onlyWithoutAuthor: filterOnlyWithoutAuthor,
    }),
    [
      filterAuthorId,
      filterBlockType,
      filterOnlyUnstructured,
      filterOnlyWithSemanticHighlights,
      filterOnlyWithoutAuthor,
      filterQuoteReviewStatus,
      filterSemanticType,
      filterStructureKind,
      filterStructureRegionId,
      filterTextQuery,
    ],
  );
  const filteredBlockDetails = useMemo(
    () =>
      filterManuscriptBlocks({
        blocks: blockDetails,
        criteria: blockFilterCriteria,
      }),
    [blockDetails, blockFilterCriteria],
  );
  const blockFilterSummary = useMemo(
    () =>
      summarizeBlockFilterResults({
        blocks: blockDetails,
        filteredBlocks: filteredBlockDetails,
        criteria: blockFilterCriteria,
      }),
    [blockDetails, blockFilterCriteria, filteredBlockDetails],
  );
  const filteredBlockListMarkdown = useMemo(
    () =>
      createFilteredBlockListMarkdown({
        blocks: blockDetails,
        criteria: blockFilterCriteria,
      }),
    [blockDetails, blockFilterCriteria],
  );
  const citedQuotations = useMemo(
    () =>
      collectCitedQuotationHighlights({
        json: currentEditorJson,
        regions: structureRegions,
        quoteReviews,
      }),
    [currentEditorJson, quoteReviews, structureRegions],
  );
  const quoteReviewProgress = useMemo(
    () => summarizeCitedQuotationReviewProgress(citedQuotations),
    [citedQuotations],
  );
  const filteredCitedQuotations = useMemo(() => {
    const blockIds = new Set(
      filteredBlockDetails.flatMap((block) =>
        block.blockId ? [block.blockId] : [],
      ),
    );
    const statusFilteredQuotations = filterCitedQuotationsByReviewStatus({
      quotations: citedQuotations,
      reviewStatus: filterQuoteReviewStatus || null,
    });

    if (!blockFilterSummary.hasActiveFilters) {
      return statusFilteredQuotations;
    }

    return statusFilteredQuotations.filter(
      (quotation) => quotation.blockId && blockIds.has(quotation.blockId),
    );
  }, [
    blockFilterSummary.hasActiveFilters,
    citedQuotations,
    filterQuoteReviewStatus,
    filteredBlockDetails,
  ]);
  const citedQuotationMarkdown = useMemo(
    () => createCitedQuotationMarkdown({ quotations: filteredCitedQuotations }),
    [filteredCitedQuotations],
  );
  const focusVisibleBlockIds = useMemo(
    () =>
      createFocusVisibleBlockIds({
        blocks: blockDetails,
        matchingBlocks: filteredBlockDetails,
        contextBlocks: filterContextBlockCount,
      }),
    [blockDetails, filterContextBlockCount, filteredBlockDetails],
  );
  const recordingOutlineRegions = useMemo(
    () =>
      recordingOutlineKind === "all"
        ? structureRegionSummaries
        : structureRegionSummaries.filter(
            (region) => region.kind === recordingOutlineKind,
          ),
    [recordingOutlineKind, structureRegionSummaries],
  );
  const authorSummaries = useMemo(
    () => summarizeAuthorMarkedSpans(currentEditorJson),
    [currentEditorJson],
  );
  const semanticHighlights = useMemo(
    () => collectSemanticHighlights(currentEditorJson),
    [currentEditorJson],
  );
  const missingBlockIdCount = useMemo(
    () => countMissingBlockIds(currentEditorJson),
    [currentEditorJson],
  );
  const hasReplaceableDraft = useMemo(
    () =>
      hasMeaningfulManuscriptDraft({
        title,
        sourceFileName,
        importSummary,
        structureRegions,
        structureBoundaryMarkers,
        chapterTitleBlocks,
        quoteReviews,
        editorJson: currentEditorJson,
      }),
    [
      chapterTitleBlocks,
      currentEditorJson,
      importSummary,
      quoteReviews,
      sourceFileName,
      structureBoundaryMarkers,
      structureRegions,
      title,
    ],
  );
  const currentDraftForReadiness = useMemo(
    () =>
      createDraftFromState({
        title,
        sourceFileName,
        importSummary,
        structureRegions,
        structureBoundaryMarkers,
        quoteReviews,
        editorJson: currentEditorJson,
        activeAuthorId,
        showAuthorColors,
        showSemanticColors,
        lastUpdatedAt,
      }),
    [
      activeAuthorId,
      currentEditorJson,
      importSummary,
      lastUpdatedAt,
      quoteReviews,
      showAuthorColors,
      showSemanticColors,
      sourceFileName,
      structureBoundaryMarkers,
      structureRegions,
      title,
    ],
  );
  const currentDraftCheckpointKey = useMemo(
    () => createManuscriptDraftCheckpointKey(currentDraftForReadiness),
    [currentDraftForReadiness],
  );
  const hasLocalChangesSinceServerSave =
    serverCheckpointKey === null
      ? null
      : currentDraftCheckpointKey !== serverCheckpointKey;
  const selectedServerManuscript =
    serverManuscripts.find(
      (manuscript) => manuscript.id === selectedServerManuscriptId,
    ) ?? null;
  const latestServerSnapshot = serverSnapshots[0] ?? null;
  const selectedServerManuscriptKindDefinition =
    studioManuscriptLibraryKindDefinitions.find(
      (definition) => definition.id === selectedServerManuscript?.kind,
    ) ?? null;
  const serverConnectionLabel =
    serverConnectionState === "connected"
      ? "Connected"
      : serverConnectionState === "unavailable"
        ? "Unavailable"
        : "Not checked";
  const localChangesSinceServerSaveLabel =
    hasLocalChangesSinceServerSave === null
      ? "Unknown until a snapshot is saved or loaded"
      : hasLocalChangesSinceServerSave
        ? "Yes"
        : "No";
  const visibleSidePanelModes = isDevMode
    ? manuscriptSidePanelModes
    : everydayManuscriptSidePanelModes;
  const visibleWorkModeOptions = visibleSidePanelModes.filter(
    (mode) =>
      !isRecordingMode || (mode.id !== "mark" && mode.id !== "backup"),
  );
  const latestShareSnapshot =
    lastSavedServerSnapshot ??
    latestServerSnapshot ??
    selectedServerManuscript?.latestSnapshot ??
    null;
  const liveEditFreshness = liveEditStatus?.ok
    ? liveEditStatus.freshness.state
    : null;
  const liveEditStatusTone =
    liveEditFreshness === "current"
      ? "tag"
      : liveEditFreshness === "outside-changes"
        ? "review"
        : liveEditStatus?.ok
          ? "source"
          : "danger";
  const liveEditStatusLabel = isLiveEditStatusBusy
    ? "Checking"
    : liveEditFreshness === "current"
      ? "Room current"
      : liveEditFreshness === "outside-changes"
        ? "Newer save"
        : liveEditFreshness === "no-backup"
          ? "No backup"
          : liveEditFreshness === "no-room"
            ? "No room"
            : "Unknown";
  const liveEditStatusCopy = liveEditStatus?.ok
    ? liveEditFreshness === "current"
      ? "The shared room is lined up with the latest manuscript backup."
      : liveEditFreshness === "outside-changes"
        ? "A newer manuscript backup exists. Open live edit with the handoff prompt before co-editing."
        : liveEditFreshness === "no-backup"
          ? "Save a manuscript backup before inviting someone into live edit."
          : "The shared room has not been created yet."
    : liveEditStatus?.message ?? "Live edit room status has not been checked yet.";
  const publishingSnapshotState = useMemo(
    () => ({
      serverConnectionState,
      latestSnapshotTime: latestServerSnapshot?.updatedAt ?? null,
      lastSnapshotId: lastSavedServerSnapshot?.id ?? null,
      hasLocalChangesSinceServerSave,
    }),
    [
      hasLocalChangesSinceServerSave,
      lastSavedServerSnapshot?.id,
      latestServerSnapshot?.updatedAt,
      serverConnectionState,
    ],
  );
  const publishReadinessReport = useMemo(
    () =>
      createPublishReadinessReport({
        title,
        sourceFileName,
        editorJson: currentEditorJson,
        structureRegions,
        quoteReviews,
        generatedAt: lastUpdatedAt ?? new Date().toISOString(),
        snapshotState: publishingSnapshotState,
        includeRecordingChecks: true,
      }),
    [
      currentEditorJson,
      lastUpdatedAt,
      publishingSnapshotState,
      quoteReviews,
      sourceFileName,
      structureRegions,
      title,
    ],
  );
  const isSyntheticSmokeDraftLoaded = useMemo(
    () => isSyntheticManuscriptSmokeDraft(currentDraftForReadiness),
    [currentDraftForReadiness],
  );
  const realManuscriptReadinessGate = useMemo(
    () =>
      createRealManuscriptReadinessGate({
        currentDraft: currentDraftForReadiness,
        publishReadinessReport,
        snapshotState: publishingSnapshotState,
        manualSignals: {
          publishingPacketGenerated: hasGeneratedSmokePublishingPacket,
          recordingHandoffGenerated: hasGeneratedSmokeRecordingHandoff,
          quoteAppendixGenerated: hasGeneratedSmokeQuoteAppendix,
          serverSnapshotSaved: hasConfirmedSyntheticServerSnapshotSaved,
          phoneOrSecondBrowserLoaded: hasConfirmedSyntheticPhoneLoad,
          fullDraftJsonBackupDownloaded: hasConfirmedFullDraftJsonBackup,
        },
      }),
    [
      currentDraftForReadiness,
      hasConfirmedFullDraftJsonBackup,
      hasConfirmedSyntheticPhoneLoad,
      hasConfirmedSyntheticServerSnapshotSaved,
      hasGeneratedSmokePublishingPacket,
      hasGeneratedSmokeQuoteAppendix,
      hasGeneratedSmokeRecordingHandoff,
      publishReadinessReport,
      publishingSnapshotState,
    ],
  );

  useEffect(() => {
    setCurrentQuoteIndex((current) => {
      if (!filteredCitedQuotations.length) {
        return 0;
      }

      return Math.min(current, filteredCitedQuotations.length - 1);
    });
  }, [filteredCitedQuotations.length]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!isRecordingMode);
  }, [editor, isRecordingMode]);

  useEffect(() => {
    if (
      isRecordingMode &&
      (sidePanelMode === "backup" || sidePanelMode === "publish")
    ) {
      setSidePanelMode("structure");
    }
  }, [isRecordingMode, sidePanelMode]);

  useEffect(() => {
    if (isDevMode || (sidePanelMode !== "backup" && sidePanelMode !== "publish")) {
      return;
    }

    setSidePanelMode("mark");
  }, [isDevMode, sidePanelMode]);

  useEffect(() => {
    if (!isHydrated || isRecordingMode || initialServerRefreshStartedRef.current) {
      return;
    }

    initialServerRefreshStartedRef.current = true;
    void refreshManuscriptLibrary({ silent: true });
    void refreshServerSnapshots({ silent: true });
    void refreshLiveEditStatus({ silent: true });
  }, [isHydrated, isRecordingMode]);

  useEffect(() => {
    if (!isHydrated || isRecordingMode || sidePanelMode !== "backup") {
      return;
    }

    void refreshManuscriptLibrary({ silent: true });
    void refreshServerSnapshots({ silent: true });
    void refreshLiveEditStatus({ silent: true });
  }, [isHydrated, isRecordingMode, sidePanelMode]);

  useEffect(() => {
    if (!isHydrated || isRecordingMode || sidePanelMode !== "backup") {
      return;
    }

    void refreshServerSnapshots({ silent: true });
  }, [isHydrated, isRecordingMode, selectedServerManuscriptId, sidePanelMode]);

  useEffect(() => {
    if (
      !editor ||
      !isHydrated ||
      !initialLiveSnapshotSlug ||
      liveSnapshotLoadStartedRef.current
    ) {
      return;
    }

    liveSnapshotLoadStartedRef.current = true;
    void loadLiveSnapshotBySlug(initialLiveSnapshotSlug);
  }, [editor, initialLiveSnapshotSlug, isHydrated]);

  useEffect(() => {
    if (isSyntheticSmokeDraftLoaded) {
      return;
    }

    setHasGeneratedSmokePublishingPacket(false);
    setHasGeneratedSmokeRecordingHandoff(false);
    setHasGeneratedSmokeQuoteAppendix(false);
    setHasConfirmedSyntheticServerSnapshotSaved(false);
    setHasConfirmedSyntheticPhoneLoad(false);
    setHasConfirmedFullDraftJsonBackup(false);
  }, [isSyntheticSmokeDraftLoaded]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const updateSelectedRange = () => {
      setSelectedStructureRange(getEditorSelectionBlockRange(editor));
      const textRange = getEditorTextSelectionRange(editor);
      setHasTextSelection(Boolean(textRange));

      if (!textRange) {
        setTagContextMenu(null);
      }
    };

    updateSelectedRange();
    editor.on("selectionUpdate", updateSelectedRange);
    editor.on("update", updateSelectedRange);

    return () => {
      editor.off("selectionUpdate", updateSelectedRange);
      editor.off("update", updateSelectedRange);
    };
  }, [editor]);

  useEffect(() => {
    if (!tagContextMenu) {
      return;
    }

    const closeMenu = () => setTagContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeMenu);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeMenu);
    };
  }, [tagContextMenu]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    let animationFrameId: number | null = null;

    const applyBlockDecorations = () => {
      const classNames = [
        "manuscript-author-block",
        "manuscript-author-block-charlie",
        "manuscript-author-block-homer",
        "manuscript-author-block-mixed",
        "manuscript-author-block-unassigned",
        "manuscript-semantic-block",
        "manuscript-semantic-block-clip",
        "manuscript-semantic-block-show-notes",
        "manuscript-semantic-block-mixed",
        "manuscript-structure-block",
        "manuscript-structure-chapter",
        "manuscript-structure-episode",
        "manuscript-structure-section",
        "manuscript-chapter-title-block",
        "manuscript-boundary-marker-block",
        "manuscript-boundary-marker-chapter",
        "manuscript-boundary-marker-episode",
        "manuscript-filter-match",
        "manuscript-filter-dim",
        "manuscript-filter-hide",
        "manuscript-filter-context",
      ];
      const renderedBlockNodes = collectRenderedManuscriptBlockNodeList(
        editor.view.dom,
      );
      const renderedBlockNodesById = new Map(
        renderedBlockNodes.flatMap((node) => {
          const blockId = node.getAttribute("data-blockid");

          return blockId ? [[blockId, node] as const] : [];
        }),
      );

      renderedBlockNodesById.forEach((domNode) => {
        domNode.classList.remove(...classNames);
        domNode.removeAttribute("data-structure-regions");
        domNode.removeAttribute("data-structure-boundaries");
        domNode.removeAttribute("data-manuscript-boundary-heading");
      });

      const regionsByBlockId = new Map<
        string,
        ManuscriptStructureRegionSummary[]
      >();

      for (const region of structureRegionSummaries) {
        for (const blockId of region.blockIds) {
          const regions = regionsByBlockId.get(blockId) ?? [];
          regions.push(region);
          regionsByBlockId.set(blockId, regions);
        }
      }

      const matchingFilterBlockIds = new Set(
        focusVisibleBlockIds.matchingBlockIds,
      );
      const contextFilterBlockIds = new Set(
        focusVisibleBlockIds.contextBlockIds,
      );
      const visibleFilterBlockIds = new Set(focusVisibleBlockIds.visibleBlockIds);
      const blockIndexById = new Map(
        blockSummaries.flatMap((block, index) =>
          block.blockId ? [[block.blockId, index] as const] : [],
        ),
      );
      const boundaryMarkersByBlockId = new Map<
        string,
        ManuscriptStructureBoundaryMarker[]
      >();

      for (const marker of structureBoundaryMarkers) {
        const sourceBlockIndex = blockIndexById.get(marker.blockId);
        const fallbackBlockId =
          sourceBlockIndex === undefined
            ? null
            : renderedBlockNodes[sourceBlockIndex]?.getAttribute("data-blockid");
        const resolvedBlockId = renderedBlockNodesById.has(marker.blockId)
          ? marker.blockId
          : fallbackBlockId;

        if (!resolvedBlockId) {
          continue;
        }

        const markers = boundaryMarkersByBlockId.get(resolvedBlockId) ?? [];
        markers.push(marker);
        boundaryMarkersByBlockId.set(resolvedBlockId, markers);
      }

      const blockDetailsById = new Map(
        blockDetails.flatMap((block) =>
          block.blockId ? [[block.blockId, block] as const] : [],
        ),
      );

      renderedBlockNodesById.forEach((domNode, blockId) => {
        const regions = regionsByBlockId.get(blockId);
        const blockDetail = blockDetailsById.get(blockId);
        const blockAuthorIds = new Set(blockDetail?.authorIds ?? []);

        const hasCharlieAuthor = blockAuthorIds.has("charlie");
        const hasHomerAuthor = blockAuthorIds.has("homer");

        if (
          hasCharlieAuthor ||
          hasHomerAuthor ||
          blockAuthorIds.has("unassigned")
        ) {
          domNode.classList.add("manuscript-author-block");

          if (hasCharlieAuthor && hasHomerAuthor) {
            domNode.classList.add("manuscript-author-block-mixed");
          } else if (hasCharlieAuthor) {
            domNode.classList.add("manuscript-author-block-charlie");
          } else if (hasHomerAuthor) {
            domNode.classList.add("manuscript-author-block-homer");
          } else {
            domNode.classList.add("manuscript-author-block-unassigned");
          }
        }

        const hasClipSemantic =
          blockDetail?.semanticTagTypes.includes("clip") ?? false;
        const hasShowNotesSemantic =
          blockDetail?.semanticTagTypes.includes("show-notes") ?? false;

        if (hasClipSemantic || hasShowNotesSemantic) {
          domNode.classList.add("manuscript-semantic-block");

          if (hasClipSemantic && hasShowNotesSemantic) {
            domNode.classList.add("manuscript-semantic-block-mixed");
          } else if (hasClipSemantic) {
            domNode.classList.add("manuscript-semantic-block-clip");
          } else {
            domNode.classList.add("manuscript-semantic-block-show-notes");
          }
        }

        if (regions?.length) {
          domNode.classList.add("manuscript-structure-block");

          for (const region of regions) {
            domNode.classList.add(`manuscript-structure-${region.colorKey}`);
          }

          domNode.setAttribute(
            "data-structure-regions",
            regions.map((region) => region.title).join(", "),
          );
        }

        const boundaryMarkers = boundaryMarkersByBlockId.get(blockId);

        if (boundaryMarkers?.length) {
          domNode.classList.add("manuscript-boundary-marker-block");

          if (boundaryMarkers.some((marker) => marker.kind === "chapter")) {
            domNode.classList.add("manuscript-boundary-marker-chapter");
            domNode.classList.add("manuscript-chapter-title-block");
            domNode.setAttribute("data-manuscript-boundary-heading", "chapter");
          }

          if (boundaryMarkers.some((marker) => marker.kind === "episode")) {
            domNode.classList.add("manuscript-boundary-marker-episode");
            domNode.setAttribute("data-manuscript-boundary-heading", "episode");
          }

          domNode.setAttribute(
            "data-structure-boundaries",
            boundaryMarkers
              .map((marker) =>
                marker.kind === "chapter" ? "Chapter" : "Episode",
              )
              .join(", "),
          );
        }

        if (blockFilterSummary.hasActiveFilters) {
          if (matchingFilterBlockIds.has(blockId)) {
            domNode.classList.add("manuscript-filter-match");
          } else if (filterVisualMode === "dim-nonmatches") {
            domNode.classList.add("manuscript-filter-dim");
          } else if (filterVisualMode === "hide-nonmatches") {
            if (contextFilterBlockIds.has(blockId)) {
              domNode.classList.add("manuscript-filter-context");
            } else if (!visibleFilterBlockIds.has(blockId)) {
              domNode.classList.add("manuscript-filter-hide");
            }
          }
        }
      });
    };

    const scheduleBlockDecorations = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        applyBlockDecorations();
      });
    };

    scheduleBlockDecorations();
    const timeoutId = window.setTimeout(scheduleBlockDecorations, 80);
    editor.on("transaction", scheduleBlockDecorations);
    editor.on("update", scheduleBlockDecorations);

    return () => {
      window.clearTimeout(timeoutId);

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      editor.off("transaction", scheduleBlockDecorations);
      editor.off("update", scheduleBlockDecorations);
    };
  }, [
    blockFilterSummary.hasActiveFilters,
    blockDetails,
    blockSummaries,
    editor,
    editorJson,
    filterVisualMode,
    focusVisibleBlockIds,
    structureBoundaryMarkers,
    structureRegionSummaries,
  ]);

  useEffect(() => {
    if (
      !editor ||
      !blockSummaries.length ||
      (!structureRailRegions.chapters.length &&
        !structureRailRegions.episodes.length)
    ) {
      setStructureRailState((previous) =>
        areStructureRailStatesEqual(previous, emptyStructureRailState)
          ? previous
          : emptyStructureRailState,
      );
      return;
    }

    const blockIndexById = new Map<string, number>();

    blockSummaries.forEach((block, index) => {
      if (block.blockId) {
        blockIndexById.set(block.blockId, index);
      }
    });

    let animationFrame = 0;

    const readBlockElements = () => {
      const blockElements: Array<{
        index: number;
        element: HTMLElement;
      }> = [];

      editor.state.doc.descendants((node, pos) => {
        if (!blockNodeTypes.includes(node.type.name)) {
          return true;
        }

        const blockId = node.attrs.blockId;

        if (typeof blockId !== "string") {
          return true;
        }

        const index = blockIndexById.get(blockId);
        const domNode = editor.view.nodeDOM(pos);

        if (typeof index === "number" && domNode instanceof HTMLElement) {
          blockElements.push({ index, element: domNode });
        }

        return true;
      });

      return blockElements.sort((left, right) => left.index - right.index);
    };

    const readCurrentBlockIndex = () => {
      const blockElements = readBlockElements();

      if (!blockElements.length) {
        return null;
      }

      const anchorY = Math.min(Math.max(window.innerHeight * 0.22, 96), 180);
      let currentIndex = blockElements[0]?.index ?? 0;

      for (const block of blockElements) {
        const rect = block.element.getBoundingClientRect();

        if (rect.height <= 0) {
          continue;
        }

        if (rect.bottom < anchorY) {
          currentIndex = block.index;
          continue;
        }

        if (rect.top <= anchorY) {
          currentIndex = block.index;
        } else if (currentIndex < 0) {
          currentIndex = block.index;
        }

        break;
      }

      return currentIndex;
    };

    const updateStructureRail = () => {
      animationFrame = 0;

      const currentBlockIndex = readCurrentBlockIndex();

      if (currentBlockIndex === null) {
        setStructureRailState((previous) =>
          areStructureRailStatesEqual(previous, emptyStructureRailState)
            ? previous
            : emptyStructureRailState,
        );
        return;
      }

      const chapter = getCurrentManuscriptStructureBoundary(
        structureRailRegions.chapters,
        currentBlockIndex,
      );
      const episode = getCurrentManuscriptStructureBoundary(
        structureRailRegions.episodes,
        currentBlockIndex,
      );
      const nextState: ManuscriptStructureRailState = {
        chapter,
        episode,
        nextChapter: getNextManuscriptStructureBoundary(
          structureRailRegions.chapters,
          currentBlockIndex,
          chapter,
        ),
        nextEpisode: getNextManuscriptStructureBoundary(
          structureRailRegions.episodes,
          currentBlockIndex,
          episode,
        ),
      };

      setStructureRailState((previous) =>
        areStructureRailStatesEqual(previous, nextState) ? previous : nextState,
      );
    };

    const scheduleStructureRailUpdate = () => {
      if (animationFrame) {
        return;
      }

      animationFrame = window.requestAnimationFrame(updateStructureRail);
    };

    scheduleStructureRailUpdate();
    const scrollListenerOptions: AddEventListenerOptions = {
      capture: true,
      passive: true,
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleStructureRailUpdate);

    window.addEventListener("scroll", scheduleStructureRailUpdate, {
      passive: true,
    });
    document.addEventListener(
      "scroll",
      scheduleStructureRailUpdate,
      scrollListenerOptions,
    );
    window.addEventListener("resize", scheduleStructureRailUpdate);
    resizeObserver?.observe(editor.view.dom);

    if (manuscriptSurfaceRef.current) {
      resizeObserver?.observe(manuscriptSurfaceRef.current);
    }

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      window.removeEventListener("scroll", scheduleStructureRailUpdate);
      document.removeEventListener(
        "scroll",
        scheduleStructureRailUpdate,
        scrollListenerOptions,
      );
      window.removeEventListener("resize", scheduleStructureRailUpdate);
      resizeObserver?.disconnect();
    };
  }, [blockSummaries, editor, structureRailRegions]);

  function confirmDraftReplacement(action: string) {
    if (!hasReplaceableDraft) {
      return true;
    }

    return window.confirm(
      `${action} will replace the current browser-local Manuscript Desk draft. Export a backup first if you need to keep it. Continue?`,
    );
  }

  function markServerSnapshotResponseState(response: Response) {
    const isUnavailable = response.status === 503;

    setIsServerSnapshotUnavailable(isUnavailable);
    setServerConnectionState(isUnavailable ? "unavailable" : "connected");
  }

  function getStructureRegionsForBlock(blockId: string | null) {
    if (!blockId) {
      return [];
    }

    return structureRegionSummaries.filter((region) =>
      region.blockIds.includes(blockId),
    );
  }

  function getBlockPreview(blockId: string | null) {
    if (!blockId) {
      return "Not set";
    }

    return (
      blockSummaries.find((block) => block.blockId === blockId)?.preview ||
      "Empty block"
    );
  }

  function getChapterForTitleBlock(blockId: string | null) {
    if (!blockId) {
      return null;
    }

    return (
      derivedChapters.find((chapter) => chapter.titleBlockId === blockId) ??
      null
    );
  }

  function getStructureBoundaryMarkerForBlock(
    kind: ManuscriptStructureBoundaryKind,
    blockId: string | null,
  ) {
    if (!blockId) {
      return null;
    }

    return (
      structureBoundaryMarkers.find(
        (marker) => marker.kind === kind && marker.blockId === blockId,
      ) ?? null
    );
  }

  function getStructureBoundaryMarker(markerId: string | null) {
    if (!markerId) {
      return null;
    }

    return (
      structureBoundaryMarkers.find((marker) => marker.id === markerId) ?? null
    );
  }

  function toggleStructureBoundaryMarker(
    kind: ManuscriptStructureBoundaryKind,
    blockId: string | null,
  ) {
    if (!blockId) {
      setMessage("Cannot mark a boundary without a block ID.");
      return;
    }

    const label = kind === "chapter" ? "chapter" : "episode";
    const existingMarker = getStructureBoundaryMarkerForBlock(kind, blockId);

    if (existingMarker) {
      setStructureBoundaryMarkers((current) =>
        current.filter((marker) => marker.id !== existingMarker.id),
      );
      setMessage(`${label[0].toUpperCase()}${label.slice(1)} boundary removed.`);
      return;
    }

    const now = new Date().toISOString();
    const title = getBlockPreview(blockId);
    const publicationDate =
      kind === "episode"
        ? getEpisodePublicationDateForIndex(
            structureBoundaryMarkers.filter(
              (marker) => marker.kind === "episode",
            ).length,
          )
        : null;
    const publicationDateLabel = formatEpisodePublicationDate(publicationDate);

    setStructureBoundaryMarkers((current) => [
      ...current,
      {
        id: createStructureBoundaryMarkerId(kind),
        kind,
        blockId,
        title,
        notes: "",
        ...(publicationDate ? { publicationDate } : {}),
        createdAt: now,
        updatedAt: now,
      },
    ]);
    setMessage(
      publicationDateLabel
        ? `Marked "${title}" as a ${label} boundary. Publishes ${publicationDateLabel}.`
        : `Marked "${title}" as a ${label} boundary.`,
    );
  }

  function toggleChapterTitleBlock(blockId: string | null) {
    toggleStructureBoundaryMarker("chapter", blockId);
  }

  function toggleSelectedBlockAsChapterTitle() {
    if (!editor) {
      return;
    }

    const range = selectedStructureRange ?? getEditorSelectionBlockRange(editor);

    if (!range?.startBlockId) {
      setMessage("Place the cursor in a title block before marking it.");
      return;
    }

    toggleChapterTitleBlock(range.startBlockId);
  }

  function toggleSelectedBlockAsEpisodeBoundary() {
    if (!editor) {
      return;
    }

    const range = selectedStructureRange ?? getEditorSelectionBlockRange(editor);

    if (!range?.startBlockId) {
      setMessage("Place the cursor in an episode title block before marking it.");
      return;
    }

    toggleStructureBoundaryMarker("episode", range.startBlockId);
  }

  function beginEditingStructureBoundary(markerId: string) {
    const marker = getStructureBoundaryMarker(markerId);

    if (!marker) {
      setMessage("Boundary marker was not found.");
      return;
    }

    setEditingBoundaryMarkerId(marker.id);
    setEditingBoundaryTitle(marker.title || getBlockPreview(marker.blockId));
    setEditingBoundaryNotes(marker.notes);
    setMessage(`Editing ${marker.kind} boundary.`);
  }

  function cancelEditingStructureBoundary() {
    setEditingBoundaryMarkerId(null);
    setEditingBoundaryTitle("");
    setEditingBoundaryNotes("");
    setMessage("Boundary edit canceled.");
  }

  function saveStructureBoundaryMarker(markerId: string) {
    setStructureBoundaryMarkers((current) =>
      current.map((marker) =>
        marker.id === markerId
          ? {
              ...marker,
              title:
                editingBoundaryTitle.trim() || getBlockPreview(marker.blockId),
              notes: editingBoundaryNotes.trim(),
              updatedAt: new Date().toISOString(),
            }
          : marker,
      ),
    );
    setEditingBoundaryMarkerId(null);
    setEditingBoundaryTitle("");
    setEditingBoundaryNotes("");
    setMessage("Boundary saved.");
  }

  function moveStructureBoundaryMarkerToCurrentBlock(markerId: string) {
    const marker = getStructureBoundaryMarker(markerId);

    if (!marker) {
      setMessage("Boundary marker was not found.");
      return;
    }

    const range =
      selectedStructureRange ??
      (editor ? getEditorSelectionBlockRange(editor) : null);
    const nextBlockId = range?.startBlockId ?? null;

    if (!nextBlockId) {
      setMessage("Place the cursor in the line where this boundary should start.");
      return;
    }

    if (nextBlockId === marker.blockId) {
      setMessage("That boundary is already using the cursor line.");
      return;
    }

    const previousTitle = getBlockPreview(marker.blockId);
    const nextTitle = getBlockPreview(nextBlockId);
    const existingTitle = marker.title.trim();
    const nextMarkerTitle =
      !existingTitle || existingTitle === previousTitle
        ? nextTitle
        : marker.title;
    const replacedMarker = getStructureBoundaryMarkerForBlock(
      marker.kind,
      nextBlockId,
    );
    const label = marker.kind === "episode" ? "Episode" : "Chapter";

    setStructureBoundaryMarkers((current) =>
      current
        .filter(
          (candidate) =>
            candidate.id === marker.id ||
            !(
              candidate.kind === marker.kind &&
              candidate.blockId === nextBlockId
            ),
        )
        .map((candidate) =>
          candidate.id === marker.id
            ? {
                ...candidate,
                blockId: nextBlockId,
                title: nextMarkerTitle,
                updatedAt: new Date().toISOString(),
              }
            : candidate,
        ),
    );

    if (editingBoundaryMarkerId === marker.id) {
      setEditingBoundaryTitle(nextMarkerTitle);
    }

    setMessage(
      `${label} boundary moved to "${nextTitle}".${
        replacedMarker ? " Existing marker on that line was replaced." : ""
      }`,
    );
  }

  function removeStructureBoundaryMarker(markerId: string) {
    const marker = getStructureBoundaryMarker(markerId);
    const label = marker?.kind === "episode" ? "Episode" : "Chapter";

    setStructureBoundaryMarkers((current) =>
      current.filter((candidate) => candidate.id !== markerId),
    );

    if (editingBoundaryMarkerId === markerId) {
      setEditingBoundaryMarkerId(null);
      setEditingBoundaryTitle("");
      setEditingBoundaryNotes("");
    }

    setMessage(`${label} boundary removed.`);
  }

  function focusDerivedChapter(
    chapter: ManuscriptDerivedChapter,
    boundary: "title" | "end",
  ) {
    focusBlock(boundary === "end" ? chapter.endBlockId : chapter.titleBlockId);
  }

  function setPendingStructureStart(blockId: string | null) {
    if (!blockId) {
      setMessage("Cannot set a structure start without a block ID.");
      return;
    }

    setPendingStructureStartBlockId(blockId);
    setMessage("Pending structure start set.");
  }

  function setPendingStructureEnd(blockId: string | null) {
    if (!blockId) {
      setMessage("Cannot set a structure end without a block ID.");
      return;
    }

    setPendingStructureEndBlockId(blockId);
    setMessage("Pending structure end set.");
  }

  function clearPendingStructureRange() {
    setPendingStructureStartBlockId(null);
    setPendingStructureEndBlockId(null);
    setMessage("Pending structure range cleared.");
  }

  function clearBlockFilters() {
    setFilterTextQuery("");
    setFilterAuthorId("");
    setFilterSemanticType("");
    setFilterStructureRegionId("");
    setFilterStructureKind("");
    setFilterBlockType("");
    setFilterQuoteReviewStatus("");
    setFilterOnlyUnstructured(false);
    setFilterOnlyWithSemanticHighlights(false);
    setFilterOnlyWithoutAuthor(false);
    setFilterContextBlockCount(0);
    setCurrentQuoteIndex(0);
    setExportFilteredMarkdown("");
    setExportCitedQuotationMarkdown("");
    setMessage("Manuscript filters cleared.");
  }

  function openFilterMenu() {
    setSidePanelMode("find");
    setIsSaveShareDialogOpen(false);
    setIsMobileToolsOpen(false);
    setIsFilterMenuOpen(true);
  }

  function applyQuoteFocus(status: ManuscriptQuoteReviewStatusFilter | "" = "") {
    setSidePanelMode("find");
    setFilterTextQuery("");
    setFilterAuthorId("");
    setFilterSemanticType("cited-quotation");
    setFilterStructureRegionId("");
    setFilterStructureKind("");
    setFilterBlockType("");
    setFilterQuoteReviewStatus(status);
    setFilterOnlyUnstructured(false);
    setFilterOnlyWithSemanticHighlights(false);
    setFilterOnlyWithoutAuthor(false);
    setFilterVisualMode("hide-nonmatches");
    setCurrentQuoteIndex(0);
    setExportFilteredMarkdown("");
    setExportCitedQuotationMarkdown("");
    setMessage(
      status
        ? `${getManuscriptQuoteReviewStatusFilterLabel(status)} quote focus enabled.`
        : "Quote Focus enabled.",
    );
  }

  function applySemanticFocus(tagType: SemanticHighlightType | "" = "") {
    const definition = tagType ? getSemanticHighlightDefinition(tagType) : null;

    setSidePanelMode("find");
    setFilterTextQuery("");
    setFilterAuthorId("");
    setFilterSemanticType(tagType);
    setFilterStructureRegionId("");
    setFilterStructureKind("");
    setFilterBlockType("");
    setFilterQuoteReviewStatus("");
    setFilterOnlyUnstructured(false);
    setFilterOnlyWithSemanticHighlights(!tagType);
    setFilterOnlyWithoutAuthor(false);
    setFilterVisualMode("hide-nonmatches");
    setFilterContextBlockCount(1);
    setCurrentQuoteIndex(0);
    setExportFilteredMarkdown("");
    setExportCitedQuotationMarkdown("");
    setMessage(
      definition
        ? `${definition.label} semantic focus enabled.`
        : "Semantic focus enabled.",
    );
  }

  function exitFocusView() {
    clearBlockFilters();
    setFilterVisualMode("highlight-matches");
    setFilterContextBlockCount(0);
    setMessage("Focus View exited. Full manuscript wall restored.");
  }

  function applyHomerReadingFocus() {
    setSidePanelMode("find");
    setFilterTextQuery("");
    setFilterAuthorId("homer");
    setFilterSemanticType("");
    setFilterStructureRegionId("");
    setFilterStructureKind("");
    setFilterBlockType("");
    setFilterQuoteReviewStatus("");
    setFilterOnlyUnstructured(false);
    setFilterOnlyWithSemanticHighlights(false);
    setFilterOnlyWithoutAuthor(false);
    setFilterVisualMode("hide-nonmatches");
    setFilterContextBlockCount(0);
    setCurrentQuoteIndex(0);
    setExportFilteredMarkdown("");
    setExportCitedQuotationMarkdown("");
    setMessage("Reading focus enabled for Homer / Scott parts.");
  }

  function showRecordingOutline(kind: RecordingOutlineKind) {
    setRecordingOutlineKind(kind);
    setSidePanelMode("structure");
    setMessage(
      kind === "all"
        ? "Recording outline showing all structure regions."
        : `${getManuscriptStructureDefinition(kind).label} outline selected.`,
    );
  }

  function showFullManuscriptForRecording() {
    exitFocusView();
    setRecordingOutlineKind("all");
    setMessage("Full manuscript visibility restored.");
  }

  function returnToManuscript() {
    setIsMobileToolsOpen(false);
    window.requestAnimationFrame(() => {
      manuscriptSurfaceRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function focusBlockFromMobileTools(blockId: string | null) {
    setIsMobileToolsOpen(false);
    window.requestAnimationFrame(() => focusBlock(blockId));
  }

  function focusMobileStructureBoundary(
    boundary: ManuscriptStructureBoundary | null,
    edge: "start" | "end" = "start",
  ) {
    if (!boundary) {
      setMessage("No chapter or episode boundary is available yet.");
      return;
    }

    focusBlockFromMobileTools(
      edge === "end" ? boundary.endBlockId : boundary.startBlockId,
    );
  }

  function updateRecordingMode(enabled: boolean) {
    setIsRecordingMode(enabled);
    setTagContextMenu(null);

    if (enabled) {
      setSidePanelMode("structure");
      setRecordingOutlineKind("all");
      setEditingStructureRegionId(null);
      setEditingQuoteReviewHighlightId(null);
      setMessage("Recording mode is view-only. Exit recording mode to edit.");
      return;
    }

    setMessage("Recording mode exited. Editing controls are available.");
  }

  function beginEditingQuoteReview(quotation: ManuscriptCitedQuotationSummary) {
    const review = quotation.review;

    setEditingQuoteReviewHighlightId(quotation.highlightId);
    setEditingQuoteAttributedTo(review.attributedTo);
    setEditingQuoteSourceTitle(review.sourceTitle);
    setEditingQuoteSourceType(review.sourceType);
    setEditingQuoteLocator(review.locator);
    setEditingQuoteCitationText(review.citationText || quotation.note);
    setEditingQuoteReviewStatus(review.reviewStatus);
    setEditingQuoteRightsNote(review.rightsNote);
    setEditingQuoteEditorNote(review.editorNote);
    setMessage("Quote review opened.");
  }

  function cancelEditingQuoteReview() {
    setEditingQuoteReviewHighlightId(null);
    setEditingQuoteAttributedTo("");
    setEditingQuoteSourceTitle("");
    setEditingQuoteSourceType("unknown");
    setEditingQuoteLocator("");
    setEditingQuoteCitationText("");
    setEditingQuoteReviewStatus("needs-source");
    setEditingQuoteRightsNote("");
    setEditingQuoteEditorNote("");
    setMessage("Quote review edit canceled.");
  }

  function saveQuoteReview(highlightId: string) {
    setQuoteReviews((current) =>
      updateManuscriptQuoteReview({
        reviews: current,
        review: {
          highlightId,
          attributedTo: editingQuoteAttributedTo,
          sourceTitle: editingQuoteSourceTitle,
          sourceType: editingQuoteSourceType,
          locator: editingQuoteLocator,
          citationText: editingQuoteCitationText,
          reviewStatus: editingQuoteReviewStatus,
          rightsNote: editingQuoteRightsNote,
          editorNote: editingQuoteEditorNote,
          updatedAt: new Date().toISOString(),
        },
      }),
    );
    setEditingQuoteReviewHighlightId(null);
    setMessage("Quote review saved.");
  }

  function removeQuoteReview(highlightId: string) {
    setQuoteReviews((current) =>
      removeManuscriptQuoteReview({ reviews: current, highlightId }),
    );

    if (editingQuoteReviewHighlightId === highlightId) {
      cancelEditingQuoteReview();
    }

    setMessage("Quote review metadata removed.");
  }

  function getDefaultStructureTitle(
    kind: ManuscriptStructureKind,
    labelPreset?: ManuscriptStructureLabelPreset,
  ) {
    return createStructureRegionDefaultTitle({
      kind,
      labelPreset: kind === "chapter" ? labelPreset : undefined,
      existingRegions: structureRegions,
    });
  }

  function updateStructureKind(kind: ManuscriptStructureKind) {
    setStructureKind(kind);

    if (!structureTitle.trim()) {
      setStructureTitle(getDefaultStructureTitle(kind, structureLabelPreset));
    }
  }

  function updateStructureLabelPreset(
    labelPreset: ManuscriptStructureLabelPreset,
  ) {
    setStructureLabelPreset(labelPreset);
    setStructureTitle(getDefaultStructureTitle("chapter", labelPreset));
  }

  function beginEditingStructureRegion(region: ManuscriptStructureRegion) {
    setEditingStructureRegionId(region.id);
    setEditingStructureKind(region.kind);
    setEditingStructureLabelPreset(region.labelPreset ?? "custom");
    setEditingStructureTitle(region.title);
    setEditingStructureNotes(region.notes);
    setMessage(`Editing ${region.title}.`);
  }

  function cancelEditingStructureRegion() {
    setEditingStructureRegionId(null);
    setEditingStructureTitle("");
    setEditingStructureNotes("");
    setEditingStructureKind("chapter");
    setEditingStructureLabelPreset("custom");
    setMessage("Structure region edit canceled.");
  }

  function updateEditingStructureKind(kind: ManuscriptStructureKind) {
    setEditingStructureKind(kind);

    if (!editingStructureTitle.trim()) {
      setEditingStructureTitle(
        getDefaultStructureTitle(kind, editingStructureLabelPreset),
      );
    }
  }

  function updateEditingStructureLabelPreset(
    labelPreset: ManuscriptStructureLabelPreset,
  ) {
    setEditingStructureLabelPreset(labelPreset);
    setEditingStructureTitle(getDefaultStructureTitle("chapter", labelPreset));
  }

  function saveStructureRegion(regionId: string) {
    setStructureRegions((current) =>
      updateManuscriptStructureRegion({
        regions: current,
        regionId,
        kind: editingStructureKind,
        title: editingStructureTitle,
        labelPreset:
          editingStructureKind === "chapter"
            ? editingStructureLabelPreset
            : undefined,
        notes: editingStructureNotes,
        updatedAt: new Date().toISOString(),
      }),
    );
    setEditingStructureRegionId(null);
    setEditingStructureTitle("");
    setEditingStructureNotes("");
    setEditingStructureKind("chapter");
    setEditingStructureLabelPreset("custom");
    setMessage("Structure region saved.");
  }

  function updateActiveAuthor(authorId: ManuscriptAuthorId) {
    setActiveAuthorId(authorId);

    if (!editor) {
      return;
    }

    if (authorId === "unassigned") {
      editor.chain().focus().unsetMark("authorMark").run();
      return;
    }

    editor.chain().focus().setMark("authorMark", getAuthorMarkAttrs(authorId)).run();
  }

  function markSelectionAsAuthor(
    authorId: ManuscriptAuthorId,
    range?: ManuscriptTextSelectionRange,
  ) {
    if (!editor) {
      return;
    }

    const chain = editor.chain().focus();

    if (range) {
      chain.setTextSelection({ from: range.from, to: range.to });
    }

    if (authorId === "unassigned") {
      chain.unsetMark("authorMark").run();
      setActiveAuthorId("unassigned");
      setTagContextMenu(null);
      setMessage("Author mark cleared from the current selection.");
      return;
    }

    chain.setMark("authorMark", getAuthorMarkAttrs(authorId)).run();
    setActiveAuthorId(authorId);
    setTagContextMenu(null);
    setMessage(`Marked selection as ${getManuscriptAuthorDefinition(authorId).label}.`);
  }

  function markAllAsHomer() {
    if (!editor) {
      return;
    }

    editor
      .chain()
      .focus()
      .selectAll()
      .setMark("authorMark", getAuthorMarkAttrs("homer"))
      .run();
    setCursorAtDocumentEnd(editor);
    editor
      .chain()
      .focus()
      .setMark("authorMark", getAuthorMarkAttrs("charlie"))
      .run();
    setActiveAuthorId("charlie");
    setMessage(
      "Marked the full manuscript as Homer / Scott. Active author is now Charlie for new writing.",
    );
  }

  function applySemanticHighlightToSelection(input: {
    tagType: SemanticHighlightType;
    note: string;
    message: string;
    highlightId?: string;
    createdAt?: string;
    range?: ManuscriptTextSelectionRange;
  }) {
    if (!editor) {
      return null;
    }

    const range = input.range ?? getEditorTextSelectionRange(editor);

    if (!range) {
      setMessage("Select manuscript text before applying a semantic highlight.");
      return null;
    }

    const definition = getSemanticHighlightDefinition(input.tagType);
    const highlightId = input.highlightId ?? createHighlightId();
    const createdAt = input.createdAt ?? new Date().toISOString();

    editor
      .chain()
      .focus()
      .setTextSelection({ from: range.from, to: range.to })
      .setMark("semanticHighlightMark", {
        highlightId,
        tagType: definition.id,
        label: definition.label,
        colorKey: definition.colorKey,
        note: input.note.trim(),
        createdAt,
      })
      .run();
    setTagContextMenu(null);
    setMessage(input.message);
    return highlightId;
  }

  function applySemanticHighlight() {
    if (!applySemanticHighlightForType(semanticType)) {
      return;
    }

    setSemanticNote("");
  }

  function applySemanticHighlightForType(
    tagType: SemanticHighlightType,
    options?: {
      note?: string;
      range?: ManuscriptTextSelectionRange;
    },
  ) {
    const definition = getSemanticHighlightDefinition(tagType);
    const appliedHighlightId = applySemanticHighlightToSelection({
      tagType: definition.id,
      note: (options?.note ?? semanticNote).trim(),
      range: options?.range,
      message: `Applied ${definition.label} semantic highlight.`,
    });

    if (!appliedHighlightId) {
      return null;
    }

    setSemanticType(definition.id);
    setSemanticNote("");
    return appliedHighlightId;
  }

  function markCitedQuotation(range?: ManuscriptTextSelectionRange) {
    const highlightId = createHighlightId();
    const updatedAt = new Date().toISOString();
    const appliedHighlightId = applySemanticHighlightToSelection({
      tagType: "cited-quotation",
      note: citationNote,
      highlightId,
      createdAt: updatedAt,
      range,
      message: "Marked selection as cited quotation.",
    });

    if (!appliedHighlightId) {
      return;
    }

    setQuoteReviews((current) =>
      updateManuscriptQuoteReview({
        reviews: current,
        review: createDefaultManuscriptQuoteReview({
          highlightId,
          citationText: citationNote,
          updatedAt,
        }),
      }),
    );
    setCitationNote("");
    setSemanticType("cited-quotation");
  }

  function clearSemanticHighlight(range?: ManuscriptTextSelectionRange) {
    if (!editor) {
      return;
    }

    const chain = editor.chain().focus();

    if (range) {
      chain.setTextSelection({ from: range.from, to: range.to });
    }

    chain.unsetMark("semanticHighlightMark").run();
    setTagContextMenu(null);
    setMessage("Semantic highlight cleared from the current selection.");
  }

  function applySemanticHighlightFromContextMenu(tagType: SemanticHighlightType) {
    if (!tagContextMenu) {
      return;
    }

    const appliedHighlightId = applySemanticHighlightForType(tagType, {
      range: tagContextMenu,
    });

    if (!appliedHighlightId) {
      return;
    }

    setSemanticNote("");
  }

  function markCitedQuotationFromContextMenu() {
    if (!tagContextMenu) {
      return;
    }

    markCitedQuotation(tagContextMenu);
  }

  function clearSemanticHighlightFromContextMenu() {
    if (!tagContextMenu) {
      return;
    }

    clearSemanticHighlight(tagContextMenu);
  }

  function markAuthorFromContextMenu(authorId: ManuscriptAuthorId) {
    if (!tagContextMenu) {
      return;
    }

    markSelectionAsAuthor(authorId, tagContextMenu);
  }

  function handleManuscriptContextMenu(event: ReactMouseEvent<HTMLElement>) {
    if (!editor || isRecordingMode) {
      return;
    }

    const range = getEditorTextSelectionRange(editor);

    if (!range) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const position = getTagContextMenuPosition(event);
    setSidePanelMode("mark");
    setTagContextMenu({
      ...range,
      ...position,
    });
  }

  function captureStructureRange() {
    if (!editor) {
      return;
    }

    const range = getEditorSelectionBlockRange(editor);

    if (!range) {
      setMessage("Select manuscript text or place the cursor in a block first.");
      return;
    }

    setSelectedStructureRange(range);
    setMessage(
      `Captured ${range.blockCount.toLocaleString()} block${
        range.blockCount === 1 ? "" : "s"
      } for the structure region.`,
    );
  }

  function createStructureRegion() {
    if (!editor) {
      return;
    }

    const hasPendingEndpoint =
      pendingStructureStartBlockId !== null || pendingStructureEndBlockId !== null;
    const range = hasPendingEndpoint
      ? pendingStructureRange?.isRangeComplete &&
        pendingStructureRange.startBlockId &&
        pendingStructureRange.endBlockId
        ? {
            startBlockId: pendingStructureRange.startBlockId,
            endBlockId: pendingStructureRange.endBlockId,
            blockCount: pendingStructureRange.blockCount,
          }
        : null
      : selectedStructureRange ?? getEditorSelectionBlockRange(editor);

    if (!range || !range.startBlockId || !range.endBlockId) {
      setMessage(
        hasPendingEndpoint
          ? "Set both pending start and end blocks before adding structure."
          : "Select a block range in the manuscript before adding structure.",
      );
      return;
    }

    const definition = getManuscriptStructureDefinition(structureKind);
    const labelPreset =
      structureKind === "chapter" ? structureLabelPreset : undefined;
    const now = new Date().toISOString();
    const nextRegion: ManuscriptStructureRegion = {
      id: createStructureRegionId(),
      kind: definition.id,
      title:
        structureTitle.trim() ||
        getDefaultStructureTitle(definition.id, labelPreset),
      startBlockId: range.startBlockId,
      endBlockId: range.endBlockId,
      order: structureRegions.length + 1,
      colorKey: definition.colorKey,
      notes: structureNotes.trim(),
      createdAt: now,
      updatedAt: now,
    };

    if (labelPreset) {
      nextRegion.labelPreset = labelPreset;
    }

    setStructureRegions((current) => [...current, nextRegion]);
    setStructureTitle("");
    setStructureNotes("");
    if (hasPendingEndpoint) {
      clearPendingStructureRange();
    }
    setMessage(
      `Added ${definition.label.toLowerCase()} structure region across ${range.blockCount.toLocaleString()} block${
        range.blockCount === 1 ? "" : "s"
      }.`,
    );
  }

  function removeStructureRegion(regionId: string) {
    setStructureRegions((current) =>
      current
        .filter((region) => region.id !== regionId)
        .map((region, index) => ({
          ...region,
          order: index + 1,
          updatedAt: new Date().toISOString(),
        })),
    );
    setMessage("Structure region removed.");
  }

  function canMoveStructureRegion(
    region: ManuscriptStructureRegionSummary,
    direction: "up" | "down",
  ) {
    const sameKindRegions = structureRegionSummaries.filter(
      (candidate) => candidate.kind === region.kind,
    );
    const index = sameKindRegions.findIndex(
      (candidate) => candidate.id === region.id,
    );

    return direction === "up"
      ? index > 0
      : index >= 0 && index < sameKindRegions.length - 1;
  }

  function moveStructureRegion(regionId: string, direction: "up" | "down") {
    setStructureRegions((current) =>
      moveManuscriptStructureRegionWithinKind({
        regions: current,
        regionId,
        direction,
        updatedAt: new Date().toISOString(),
      }),
    );
    setMessage("Structure region order updated.");
  }

  function suggestBookRegionsFromHeadings() {
    const suggestions = suggestBookStructureRegionsFromHeadings({
      blocks: blockSummaries,
    });

    if (!suggestions.length) {
      setMessage("No Preface, Introduction, or Chapter headings found.");
      return;
    }

    const existingBookRegions = structureRegions.filter(
      (region) => region.kind === "chapter",
    );

    if (
      existingBookRegions.length &&
      !window.confirm(
        `Replace ${existingBookRegions.length.toLocaleString()} existing Chapter / book region${
          existingBookRegions.length === 1 ? "" : "s"
        } with suggestions from headings? Episode and Section regions will be kept.`,
      )
    ) {
      setMessage("Heading suggestion canceled. Existing book regions kept.");
      return;
    }

    const now = new Date().toISOString();
    const suggestedRegions = suggestions.map((suggestion) => {
      const region: ManuscriptStructureRegion = {
        id: createStructureRegionId(),
        kind: suggestion.kind,
        title: suggestion.title,
        startBlockId: suggestion.startBlockId,
        endBlockId: suggestion.endBlockId,
        order: suggestion.order,
        colorKey: suggestion.colorKey,
        notes: suggestion.notes,
        createdAt: now,
        updatedAt: now,
      };

      if (suggestion.labelPreset) {
        region.labelPreset = suggestion.labelPreset;
      }

      return region;
    });

    setStructureRegions((current) =>
      [
        ...suggestedRegions,
        ...current.filter((region) => region.kind !== "chapter"),
      ].map((region, index) => ({
        ...region,
        order: index + 1,
        updatedAt: region.updatedAt || now,
      })),
    );
    setMessage(
      `Suggested ${suggestedRegions.length.toLocaleString()} Chapter / book region${
        suggestedRegions.length === 1 ? "" : "s"
      } from headings.`,
    );
  }

  async function importDocx(file: File | null) {
    if (!editor || !file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".docx")) {
      setMessage("Choose a .docx file for manuscript import.");
      return;
    }

    if (!confirmDraftReplacement("Importing this .docx")) {
      setMessage(".docx import canceled. Current browser-local draft kept.");
      return;
    }

    try {
      setMessage("Converting .docx to editor content...");
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({
        arrayBuffer,
      });
      const html = result.value.trim() || "<p></p>";

      editor.commands.setContent(html);
      const jsonWithBlockIds = ensureBlockIds(
        editor.getJSON() as ManuscriptEditorJson,
      );
      editor.commands.setContent(jsonWithBlockIds as JSONContent);
      editor
        .chain()
        .focus()
        .selectAll()
        .setMark("authorMark", getAuthorMarkAttrs("homer"))
        .run();
      setCursorAtDocumentEnd(editor);
      editor
        .chain()
        .focus()
        .setMark("authorMark", getAuthorMarkAttrs("charlie"))
        .run();

      const importedJson = ensureBlockIds(
        editor.getJSON() as ManuscriptEditorJson,
      );
      const importedAt = new Date().toISOString();
      const summary = createManuscriptImportSummary({
        sourceFileName: file.name,
        editorJson: importedJson,
        importedAt,
      });

      setEditorJson(importedJson);
      setSessionStartWordCount(countWordsAndCharacters(importedJson).words);
      setSourceFileName(file.name);
      setImportSummary(summary);
      setStructureRegions([]);
      setStructureBoundaryMarkers([]);
      setQuoteReviews({});
      setEditingQuoteReviewHighlightId(null);
      setSelectedStructureRange(null);
      setPendingStructureStartBlockId(null);
      setPendingStructureEndBlockId(null);
      setExportStructureMarkdown("");
      setExportFilteredMarkdown("");
      setExportCitedQuotationMarkdown("");
      setTitle(file.name.replace(/\.docx$/i, "").trim() || title);
      setActiveAuthorId("charlie");
      setMessage(
        result.messages.length
          ? `.docx imported with ${result.messages.length} Mammoth message(s). Imported text is Homer / Scott. Active author is Charlie for new writing. Export a backup before major edits.`
          : ".docx imported. Imported text is Homer / Scott. Active author is Charlie for new writing. Export a backup before major edits.",
      );
    } catch (error) {
      console.error("Manuscript .docx import failed.", error);
      setMessage(".docx import failed. Try a simpler Word document or paste text.");
    }
  }

  function exportEditorJson() {
    if (!editor) {
      return;
    }

    const json = ensureBlockIds(editor.getJSON() as ManuscriptEditorJson);
    setExportJson(JSON.stringify(json, null, 2));
    setMessage("Editor JSON exported.");
  }

  function exportEditorHtml() {
    if (!editor) {
      return;
    }

    setExportHtml(editor.getHTML());
    setMessage("HTML exported.");
  }

  function exportEditorPlainText() {
    if (!editor) {
      return;
    }

    setExportPlainText(editor.getText());
    setMessage("Plain text exported.");
  }

  function createCurrentDraft(timestamp = new Date().toISOString()) {
    if (!editor) {
      return null;
    }

    return createDraftFromState({
      title,
      sourceFileName,
      importSummary,
      structureRegions,
      structureBoundaryMarkers,
      quoteReviews,
      editorJson: ensureBlockIds(editor.getJSON() as ManuscriptEditorJson),
      activeAuthorId,
      showAuthorColors,
      showSemanticColors,
      lastUpdatedAt: timestamp,
    });
  }

  function downloadBackup(input: {
    kind: string;
    extension: string;
    mimeType: string;
    content: string;
  }) {
    const timestamp = new Date().toISOString();

    downloadTextFile({
      content: input.content,
      fileName: createBackupFileName({
        title,
        kind: input.kind,
        extension: input.extension,
        timestamp,
      }),
      mimeType: input.mimeType,
    });
  }

  function downloadFullDraftJson() {
    const draft = createCurrentDraft();

    if (!draft) {
      return;
    }

    downloadBackup({
      kind: "full-draft",
      extension: "json",
      mimeType: "application/json",
      content: JSON.stringify(draft, null, 2),
    });
    if (isSyntheticManuscriptSmokeDraft(draft)) {
      setHasConfirmedFullDraftJsonBackup(true);
    }
    setMessage("Full draft JSON downloaded.");
  }

  function downloadEditorJson() {
    if (!editor) {
      return;
    }

    downloadBackup({
      kind: "editor-json",
      extension: "json",
      mimeType: "application/json",
      content: JSON.stringify(
        ensureBlockIds(editor.getJSON() as ManuscriptEditorJson),
        null,
        2,
      ),
    });
    setMessage("Editor JSON downloaded.");
  }

  function downloadEditorHtml() {
    if (!editor) {
      return;
    }

    downloadBackup({
      kind: "html",
      extension: "html",
      mimeType: "text/html",
      content: editor.getHTML(),
    });
    setMessage("HTML backup downloaded.");
  }

  function downloadEditorPlainText() {
    if (!editor) {
      return;
    }

    downloadBackup({
      kind: "plain-text",
      extension: "txt",
      mimeType: "text/plain",
      content: editor.getText(),
    });
    setMessage("Plain text backup downloaded.");
  }

  function exportStructureOutline() {
    setExportStructureMarkdown(structureOutlineMarkdown);
    setMessage("Structure outline Markdown exported.");
  }

  function downloadStructureOutline() {
    downloadBackup({
      kind: "structure-outline",
      extension: "md",
      mimeType: "text/markdown",
      content: structureOutlineMarkdown,
    });
    setMessage("Structure outline Markdown downloaded.");
  }

  function exportFilteredBlockList() {
    setExportFilteredMarkdown(filteredBlockListMarkdown);
    setMessage("Filtered block list Markdown exported.");
  }

  function downloadFilteredBlockList() {
    downloadBackup({
      kind: "filtered-blocks",
      extension: "md",
      mimeType: "text/markdown",
      content: filteredBlockListMarkdown,
    });
    setMessage("Filtered block list Markdown downloaded.");
  }

  function exportCitedQuotations() {
    setExportCitedQuotationMarkdown(citedQuotationMarkdown);
    setMessage("Cited quotations Markdown exported.");
  }

  function downloadCitedQuotations() {
    downloadBackup({
      kind: "cited-quotations",
      extension: "md",
      mimeType: "text/markdown",
      content: citedQuotationMarkdown,
    });
    setMessage("Cited quotations Markdown downloaded.");
  }

  function createPublishingExportInput(generatedAt = new Date().toISOString()) {
    return {
      title,
      sourceFileName,
      editorJson: currentEditorJson,
      structureRegions,
      quoteReviews,
      generatedAt,
      snapshotState: publishingSnapshotState,
      includeRecordingChecks: true,
    };
  }

  function createSyntheticSmokeExportInput(
    generatedAt = new Date().toISOString(),
  ) {
    const currentDraft = createCurrentDraft(generatedAt);
    const draft =
      currentDraft && isSyntheticManuscriptSmokeDraft(currentDraft)
        ? currentDraft
        : createSyntheticManuscriptSmokeDraft(generatedAt);

    return {
      title: draft.title,
      sourceFileName: draft.sourceFileName,
      editorJson: draft.editorJson,
      structureRegions: draft.structureRegions,
      quoteReviews: draft.quoteReviews,
      generatedAt,
      snapshotState: publishingSnapshotState,
      includeRecordingChecks: true,
    };
  }

  function generatePublishingPacket() {
    setExportPublishingPacketMarkdown(
      createPublishingPacketMarkdown(createPublishingExportInput()),
    );
    if (isSyntheticSmokeDraftLoaded) {
      setHasGeneratedSmokePublishingPacket(true);
    }
    setMessage("Publishing packet Markdown generated.");
  }

  function downloadPublishingPacket() {
    downloadBackup({
      kind: "publishing-packet",
      extension: "md",
      mimeType: "text/markdown",
      content: createPublishingPacketMarkdown(createPublishingExportInput()),
    });
    if (isSyntheticSmokeDraftLoaded) {
      setHasGeneratedSmokePublishingPacket(true);
    }
    setMessage("Publishing packet Markdown downloaded.");
  }

  function generateRecordingHandoff() {
    setExportRecordingHandoffMarkdown(
      createRecordingHandoffMarkdown(createPublishingExportInput()),
    );
    if (isSyntheticSmokeDraftLoaded) {
      setHasGeneratedSmokeRecordingHandoff(true);
    }
    setMessage("Recording handoff Markdown generated.");
  }

  function downloadRecordingHandoff() {
    downloadBackup({
      kind: "recording-handoff",
      extension: "md",
      mimeType: "text/markdown",
      content: createRecordingHandoffMarkdown(createPublishingExportInput()),
    });
    if (isSyntheticSmokeDraftLoaded) {
      setHasGeneratedSmokeRecordingHandoff(true);
    }
    setMessage("Recording handoff Markdown downloaded.");
  }

  function generateQuoteAppendix() {
    setExportQuoteAppendixMarkdown(
      createQuoteReviewAppendixMarkdown(createPublishingExportInput()),
    );
    if (isSyntheticSmokeDraftLoaded) {
      setHasGeneratedSmokeQuoteAppendix(true);
    }
    setMessage("Quote appendix Markdown generated.");
  }

  function downloadQuoteAppendix() {
    downloadBackup({
      kind: "quote-appendix",
      extension: "md",
      mimeType: "text/markdown",
      content: createQuoteReviewAppendixMarkdown(createPublishingExportInput()),
    });
    if (isSyntheticSmokeDraftLoaded) {
      setHasGeneratedSmokeQuoteAppendix(true);
    }
    setMessage("Quote appendix Markdown downloaded.");
  }

  function generateAuthorContribution() {
    setExportAuthorContributionMarkdown(
      createAuthorContributionMarkdown(createPublishingExportInput()),
    );
    setMessage("Author contribution Markdown generated.");
  }

  function downloadAuthorContribution() {
    downloadBackup({
      kind: "author-contribution",
      extension: "md",
      mimeType: "text/markdown",
      content: createAuthorContributionMarkdown(createPublishingExportInput()),
    });
    setMessage("Author contribution Markdown downloaded.");
  }

  function createHgoProjectionExportInput(generatedAt = new Date().toISOString()) {
    return {
      title,
      editorJson: currentEditorJson,
      structureRegions,
      quoteReviews,
      sourceFileName,
      generatedAt,
      projectionStatus: hgoProjectionStatus,
      projectionVisibility: hgoProjectionVisibility,
      targetEpisodeRegionId: activeHgoProjectionRegionId || undefined,
    };
  }

  function createHgoProjectionJson(generatedAt = new Date().toISOString()) {
    return JSON.stringify(
      createHgoEpisodeProjectionFromManuscript(
        createHgoProjectionExportInput(generatedAt),
      ),
      null,
      2,
    );
  }

  function generateHgoEpisodeProjection() {
    setExportHgoProjectionJson(createHgoProjectionJson());
    setMessage(
      "HGO episode projection JSON generated. Review citations before staging or publishing.",
    );
  }

  function downloadHgoEpisodeProjection() {
    const generatedAt = new Date().toISOString();
    const projectionJson = createHgoProjectionJson(generatedAt);

    setExportHgoProjectionJson(projectionJson);
    downloadBackup({
      kind: "hgo-episode-projection",
      extension: "json",
      mimeType: "application/json",
      content: projectionJson,
    });
    setMessage("HGO episode projection JSON downloaded.");
  }

  function resetSmokeReadinessConfirmations() {
    setHasGeneratedSmokePublishingPacket(false);
    setHasGeneratedSmokeRecordingHandoff(false);
    setHasGeneratedSmokeQuoteAppendix(false);
    setHasConfirmedSyntheticServerSnapshotSaved(false);
    setHasConfirmedSyntheticPhoneLoad(false);
    setHasConfirmedFullDraftJsonBackup(false);
  }

  function loadSyntheticSmokeDraft() {
    if (!editor) {
      return;
    }

    if (!confirmDraftReplacement("Loading the synthetic smoke draft")) {
      setMessage("Synthetic smoke draft load canceled. Current draft kept.");
      return;
    }

    const syntheticDraft = createSyntheticManuscriptSmokeDraft(
      new Date().toISOString(),
    );

    resetSmokeReadinessConfirmations();
    applyDraftToEditor(
      syntheticDraft,
      "Synthetic smoke draft loaded. Nothing was saved to server until you click Save snapshot.",
    );
    setServerCheckpointKey(null);
    setLastSavedServerSnapshot(null);
    setServerSnapshotStatus(
      "Synthetic smoke draft is browser-local until you save a manual server snapshot.",
    );
    setSidePanelMode("publish");
  }

  function downloadSyntheticSmokeDraftJson() {
    const currentDraft = createCurrentDraft();
    const draft =
      currentDraft && isSyntheticManuscriptSmokeDraft(currentDraft)
        ? currentDraft
        : createSyntheticManuscriptSmokeDraft(new Date().toISOString());

    downloadTextFile({
      content: JSON.stringify(draft, null, 2),
      fileName: createBackupFileName({
        title: draft.title,
        kind: "synthetic-smoke-draft",
        extension: "json",
        timestamp: new Date().toISOString(),
      }),
      mimeType: "application/json",
    });
    setHasConfirmedFullDraftJsonBackup(true);
    setMessage("Synthetic smoke draft JSON downloaded.");
  }

  function generateSmokePublishingPacket() {
    setExportPublishingPacketMarkdown(
      createPublishingPacketMarkdown(createSyntheticSmokeExportInput()),
    );
    setHasGeneratedSmokePublishingPacket(true);
    setMessage("Synthetic smoke publishing packet generated.");
  }

  function generateSmokeRecordingHandoff() {
    setExportRecordingHandoffMarkdown(
      createRecordingHandoffMarkdown(createSyntheticSmokeExportInput()),
    );
    setHasGeneratedSmokeRecordingHandoff(true);
    setMessage("Synthetic smoke recording handoff generated.");
  }

  function generateSmokeQuoteAppendix() {
    setExportQuoteAppendixMarkdown(
      createQuoteReviewAppendixMarkdown(createSyntheticSmokeExportInput()),
    );
    setHasGeneratedSmokeQuoteAppendix(true);
    setMessage("Synthetic smoke quote appendix generated.");
  }

  function applyDraftToEditor(draft: ManuscriptDraft, nextMessage: string) {
    if (!editor) {
      return;
    }

    const sourceEditorJson = ensureBlockIds(draft.editorJson);
    editor.commands.setContent(sourceEditorJson as JSONContent);
    const targetEditorJson = ensureBlockIds(
      editor.getJSON() as ManuscriptEditorJson,
    );
    const reboundStructure = rebindManuscriptStructureBlockIds({
      sourceJson: sourceEditorJson,
      targetJson: targetEditorJson,
      structureRegions: draft.structureRegions,
      structureBoundaryMarkers: draft.structureBoundaryMarkers,
      chapterTitleBlocks: draft.chapterTitleBlocks,
    });

    setTitle(draft.title);
    setSourceFileName(draft.sourceFileName);
    setImportSummary(draft.importSummary);
    setStructureRegions(reboundStructure.structureRegions);
    setStructureBoundaryMarkers(reboundStructure.structureBoundaryMarkers);
    setQuoteReviews(draft.quoteReviews);
    setEditingQuoteReviewHighlightId(null);
    setSelectedStructureRange(null);
    setPendingStructureStartBlockId(null);
    setPendingStructureEndBlockId(null);
    setActiveAuthorId(draft.activeAuthorId);
    setShowAuthorColors(draft.showAuthorColors);
    setShowSemanticColors(draft.showSemanticColors);
    setLastUpdatedAt(draft.lastUpdatedAt);
    setEditorJson(targetEditorJson);
    setSessionStartWordCount(countWordsAndCharacters(targetEditorJson).words);
    setExportStructureMarkdown("");
    setExportFilteredMarkdown("");
    setExportCitedQuotationMarkdown("");
    setExportPublishingPacketMarkdown("");
    setExportRecordingHandoffMarkdown("");
    setExportQuoteAppendixMarkdown("");
    setExportAuthorContributionMarkdown("");
    setMessage(nextMessage);
  }

  function createSnapshotListUrl() {
    if (!selectedServerManuscriptId) {
      return "/api/manuscript/snapshots";
    }

    return `/api/manuscript/snapshots?manuscriptId=${encodeURIComponent(
      selectedServerManuscriptId,
    )}`;
  }

  function createLatestSnapshotUrl(manuscriptId = selectedServerManuscriptId) {
    if (!manuscriptId) {
      return "/api/manuscript/snapshots/latest";
    }

    return `/api/manuscript/snapshots/latest?manuscriptId=${encodeURIComponent(
      manuscriptId,
    )}`;
  }

  function createLiveSnapshotUrl(slug: string) {
    return `/api/manuscript/live/${encodeURIComponent(slug)}`;
  }

  function createLiveLatestBrowserUrl() {
    return new URL(MANUSCRIPT_LIVE_LATEST_PATH, window.location.origin).href;
  }

  async function copyLiveLatestSnapshotLink() {
    const url = createLiveLatestBrowserUrl();

    try {
      if (!navigator.clipboard?.writeText) {
        setMessage(`Phone link: ${url}`);
        return;
      }

      await navigator.clipboard.writeText(url);
      setMessage("Copied latest manuscript phone link.");
    } catch (error) {
      console.error("Latest manuscript phone link copy failed.", error);
      setMessage(`Phone link: ${url}`);
    }
  }

  async function refreshManuscriptLibrary(input?: { silent?: boolean }) {
    setIsServerManuscriptBusy(true);

    if (!input?.silent) {
      setServerManuscriptStatus("Checking manuscript library...");
    }

    try {
      const response = await fetch("/api/manuscript/library", {
        cache: "no-store",
      });
      const payload = (await response.json()) as ManuscriptLibraryListResponse;

      if (!response.ok || !payload.ok) {
        const message =
          !payload.ok && payload.message
            ? payload.message
            : "Manuscript library could not be listed.";
        markServerSnapshotResponseState(response);
        setServerManuscriptStatus(message);

        if (!input?.silent) {
          setMessage(message);
        }

        return;
      }

      setIsServerSnapshotUnavailable(false);
      setServerConnectionState("connected");
      setServerManuscripts(payload.manuscripts);
      setSelectedServerManuscriptId((current) =>
        current &&
        payload.manuscripts.some((manuscript) => manuscript.id === current)
          ? current
          : "",
      );
      setServerManuscriptStatus(
        payload.manuscripts.length
          ? `${payload.manuscripts.length.toLocaleString()} manuscript(s) available.`
          : "No named manuscripts saved yet.",
      );
    } catch (error) {
      console.error("Manuscript library list failed.", error);
      setIsServerSnapshotUnavailable(true);
      setServerConnectionState("unavailable");
      setServerManuscriptStatus("Manuscript library is unavailable right now.");

      if (!input?.silent) {
        setMessage("Manuscript library is unavailable right now.");
      }
    } finally {
      setIsServerManuscriptBusy(false);
    }
  }

  async function createServerManuscriptFromCurrentDraft() {
    const draft = createCurrentDraft();

    if (!draft) {
      return;
    }

    const manuscriptInput = createStudioManuscriptLibraryInputFromDraft({
      draft,
      description: serverManuscriptDescription,
    });

    setIsServerManuscriptBusy(true);
    setServerManuscriptStatus("Creating named manuscript...");

    try {
      const response = await fetch("/api/manuscript/library", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(manuscriptInput),
      });
      const payload = (await response.json()) as ManuscriptLibraryCreateResponse;

      if (!response.ok || !payload.ok) {
        const message =
          !payload.ok && payload.message
            ? payload.message
            : "Named manuscript could not be created.";
        markServerSnapshotResponseState(response);
        setServerManuscriptStatus(message);
        setMessage(message);
        return;
      }

      setIsServerSnapshotUnavailable(false);
      setServerConnectionState("connected");
      setServerManuscripts((current) => [
        payload.manuscript,
        ...current.filter((manuscript) => manuscript.id !== payload.manuscript.id),
      ]);
      setSelectedServerManuscriptId(payload.manuscript.id);
      setServerManuscriptDescription("");
      setServerManuscriptStatus(
        `Created manuscript ${payload.manuscript.title}.`,
      );
      setMessage("Named manuscript created. Save a manual snapshot when ready.");
    } catch (error) {
      console.error("Manuscript library create failed.", error);
      setIsServerSnapshotUnavailable(true);
      setServerConnectionState("unavailable");
      setServerManuscriptStatus("Named manuscript create failed.");
      setMessage("Named manuscript create failed.");
    } finally {
      setIsServerManuscriptBusy(false);
    }
  }

  async function refreshServerSnapshots(input?: { silent?: boolean }) {
    setIsServerSnapshotBusy(true);

    if (!input?.silent) {
      setServerSnapshotStatus("Checking server snapshots...");
    }

    try {
      const response = await fetch(createSnapshotListUrl(), {
        cache: "no-store",
      });
      const payload = (await response.json()) as ManuscriptSnapshotListResponse;

      if (!response.ok || !payload.ok) {
        const message =
          !payload.ok && payload.message
            ? payload.message
            : "Server snapshots could not be listed.";
        markServerSnapshotResponseState(response);
        setServerSnapshotStatus(message);

        if (!input?.silent) {
          setMessage(message);
        }

        return;
      }

      setIsServerSnapshotUnavailable(false);
      setServerConnectionState("connected");
      setServerSnapshots(payload.snapshots);
      setSelectedServerSnapshotId((current) =>
        current &&
        payload.snapshots.some((snapshot) => snapshot.id === current)
          ? current
          : payload.snapshots[0]?.id ?? "",
      );
      setServerSnapshotStatus(
        payload.snapshots.length
          ? `${payload.snapshots.length.toLocaleString()} server snapshot(s) available.`
          : "No server snapshots saved yet.",
      );
    } catch (error) {
      console.error("Server snapshot list failed.", error);
      setIsServerSnapshotUnavailable(true);
      setServerConnectionState("unavailable");
      setServerSnapshotStatus("Server snapshots are unavailable right now.");

      if (!input?.silent) {
        setMessage("Server snapshots are unavailable right now.");
      }
    } finally {
      setIsServerSnapshotBusy(false);
    }
  }

  async function refreshLiveEditStatus(input?: { silent?: boolean }) {
    setIsLiveEditStatusBusy(true);

    try {
      const response = await fetch("/api/manuscript/collab/latest/status", {
        cache: "no-store",
      });
      const payload = (await response.json()) as ManuscriptLiveEditStatusResponse;

      setLiveEditStatus(payload);

      if (!response.ok || !payload.ok) {
        if (!input?.silent) {
          setMessage(
            !payload.ok && payload.message
              ? payload.message
              : "Live edit room status is unavailable.",
          );
        }

        return;
      }

      if (!input?.silent) {
        setMessage("Live edit room status checked.");
      }
    } catch (error) {
      console.error("Live edit status check failed.", error);
      setLiveEditStatus({
        ok: false,
        message: "Live edit room status is unavailable right now.",
      });

      if (!input?.silent) {
        setMessage("Live edit room status is unavailable right now.");
      }
    } finally {
      setIsLiveEditStatusBusy(false);
    }
  }

  async function saveServerSnapshot(input?: {
    description?: string;
    successMessage?: string;
  }): Promise<ManuscriptServerSnapshotSummary | null> {
    const draft = createCurrentDraft();

    if (!draft) {
      return null;
    }

    const checkpointKey = createManuscriptDraftCheckpointKey(draft);
    const manuscriptTitle = selectedServerManuscript?.title ?? null;

    setIsServerSnapshotBusy(true);
    setServerSnapshotStatus(
      manuscriptTitle
        ? `Saving snapshot under ${manuscriptTitle}...`
        : "Saving manuscript backup...",
    );

    try {
      const response = await fetch("/api/manuscript/snapshots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draft,
          description: input?.description ?? serverSnapshotDescription,
          manuscriptId: selectedServerManuscriptId || null,
          snapshotType: "manual",
        }),
      });
      const payload = (await response.json()) as ManuscriptSnapshotSaveResponse;

      if (!response.ok || !payload.ok) {
        const message =
          !payload.ok && payload.message
            ? payload.message
            : "Server snapshot could not be saved.";
        markServerSnapshotResponseState(response);
        setServerSnapshotStatus(message);
        setMessage(message);
        return null;
      }

      setIsServerSnapshotUnavailable(false);
      setServerConnectionState("connected");
      setServerSnapshots((current) => [
        payload.snapshot,
        ...current.filter((snapshot) => snapshot.id !== payload.snapshot.id),
      ]);
      setSelectedServerSnapshotId(payload.snapshot.id);
      setLastSavedServerSnapshot(payload.snapshot);
      setServerCheckpointKey(checkpointKey);
      setServerSnapshotDescription("");
      setServerSnapshotStatus(
        manuscriptTitle
          ? `Saved ${manuscriptTitle} snapshot ${formatDateTime(
              payload.snapshot.updatedAt,
            )}.`
          : `Saved manuscript backup ${formatDateTime(
              payload.snapshot.updatedAt,
            )}.`,
      );
      if (selectedServerManuscriptId) {
        void refreshManuscriptLibrary({ silent: true });
      }
      void refreshLiveEditStatus({ silent: true });
      if (isSyntheticManuscriptSmokeDraft(draft)) {
        setHasConfirmedSyntheticServerSnapshotSaved(true);
      }
      setMessage(
        input?.successMessage ??
          (manuscriptTitle
            ? "Named manuscript snapshot saved."
            : "Manuscript saved for phone handoff."),
      );
      return payload.snapshot;
    } catch (error) {
      console.error("Server snapshot save failed.", error);
      setIsServerSnapshotUnavailable(true);
      setServerConnectionState("unavailable");
      setServerSnapshotStatus("Server snapshot save failed.");
      setMessage("Server snapshot save failed.");
      return null;
    } finally {
      setIsServerSnapshotBusy(false);
    }
  }

  async function saveAndOpenLiveEdit() {
    setMessage("Saving this draft before opening the shared live room.");
    const snapshot = await saveServerSnapshot({
      description: serverSnapshotDescription || "Live edit handoff",
      successMessage: "Saved this draft. Opening the live edit room.",
    });

    if (!snapshot) {
      return;
    }

    window.location.assign(`${MANUSCRIPT_LIVE_EDIT_PATH}?start=latest`);
  }

  async function loadLatestServerSnapshot(input?: {
    manuscriptId?: string;
    manuscriptTitle?: string;
  }) {
    if (!editor) {
      return;
    }

    if (!confirmDraftReplacement("Loading the latest server snapshot")) {
      setMessage("Server snapshot load canceled. Current browser-local draft kept.");
      return;
    }

    setIsServerSnapshotBusy(true);
    const manuscriptTitle =
      input?.manuscriptTitle ?? selectedServerManuscript?.title ?? null;
    const manuscriptId = input?.manuscriptId ?? selectedServerManuscriptId;

    setServerSnapshotStatus(
      manuscriptTitle
        ? `Loading latest snapshot for ${manuscriptTitle}...`
        : "Loading latest server snapshot...",
    );

    try {
      const response = await fetch(createLatestSnapshotUrl(manuscriptId), {
        cache: "no-store",
      });
      const payload =
        (await response.json()) as ManuscriptSnapshotLatestResponse;

      if (!response.ok || !payload.ok) {
        const message =
          !payload.ok && payload.message
            ? payload.message
            : "Latest server snapshot could not be loaded.";
        markServerSnapshotResponseState(response);
        setServerSnapshotStatus(message);
        setMessage(message);
        return;
      }

      setIsServerSnapshotUnavailable(false);
      setServerConnectionState("connected");
      if (!payload.snapshot) {
        const message = manuscriptTitle
          ? `No snapshots saved for ${manuscriptTitle} yet.`
          : "No server snapshots saved yet.";
        setServerSnapshotStatus(message);
        setMessage(message);
        return;
      }

      const draft = safeManuscriptDraft(payload.snapshot.draft);

      if (!draft) {
        setServerSnapshotStatus("Latest server snapshot failed draft validation.");
        setMessage("Latest server snapshot failed draft validation.");
        return;
      }

      applyDraftToEditor(
        draft,
        manuscriptTitle
          ? `Loaded latest ${manuscriptTitle} snapshot from ${formatDateTime(
              payload.snapshot.updatedAt,
            )}.`
          : `Loaded latest server snapshot from ${formatDateTime(
              payload.snapshot.updatedAt,
            )}.`,
      );
      setSelectedServerSnapshotId(payload.snapshot.id);
      setLastSavedServerSnapshot(payload.snapshot);
      setServerCheckpointKey(createManuscriptDraftCheckpointKey(draft));
      setServerSnapshotStatus(
        manuscriptTitle
          ? `Loaded latest ${manuscriptTitle} snapshot from ${formatDateTime(
              payload.snapshot.updatedAt,
            )}.`
          : `Loaded latest server snapshot from ${formatDateTime(
              payload.snapshot.updatedAt,
            )}.`,
      );
      void refreshServerSnapshots({ silent: true });
    } catch (error) {
      console.error("Latest server snapshot load failed.", error);
      setIsServerSnapshotUnavailable(true);
      setServerConnectionState("unavailable");
      setServerSnapshotStatus("Latest server snapshot load failed.");
      setMessage("Latest server snapshot load failed.");
    } finally {
      setIsServerSnapshotBusy(false);
    }
  }

  async function loadLiveSnapshotBySlug(slug: string) {
    if (!editor) {
      return;
    }

    const liveLabel = slug === "latest" ? "latest live" : slug;

    setIsServerSnapshotBusy(true);
    setServerSnapshotStatus(`Loading ${liveLabel} manuscript backup...`);

    try {
      const response = await fetch(createLiveSnapshotUrl(slug), {
        cache: "no-store",
      });
      const payload = (await response.json()) as ManuscriptLiveSnapshotResponse;

      if (!response.ok || !payload.ok) {
        const message =
          !payload.ok && payload.message
            ? payload.message
            : "Live manuscript backup could not be loaded.";
        markServerSnapshotResponseState(response);
        setServerSnapshotStatus(message);
        setMessage(message);
        return;
      }

      setIsServerSnapshotUnavailable(false);
      setServerConnectionState("connected");

      if (!payload.snapshot) {
        setServerSnapshotStatus("No live manuscript backup saved yet.");
        setMessage("No live manuscript backup saved yet.");
        return;
      }

      const loadedSnapshot = payload.snapshot;
      const draft = safeManuscriptDraft(loadedSnapshot.draft);

      if (!draft) {
        setServerSnapshotStatus("Live manuscript backup failed draft validation.");
        setMessage("Live manuscript backup failed draft validation.");
        return;
      }

      applyDraftToEditor(
        draft,
        `Loaded latest live manuscript backup from ${formatDateTime(
          loadedSnapshot.updatedAt,
        )}.`,
      );
      setSelectedServerSnapshotId(loadedSnapshot.id);
      setLastSavedServerSnapshot(loadedSnapshot);
      setServerCheckpointKey(createManuscriptDraftCheckpointKey(draft));
      setServerSnapshots((current) => [
        loadedSnapshot,
        ...current.filter((snapshot) => snapshot.id !== loadedSnapshot.id),
      ]);
      setServerSnapshotStatus(
        `Loaded latest live manuscript backup from ${formatDateTime(
          loadedSnapshot.updatedAt,
        )}.`,
      );

      if (isSyntheticManuscriptSmokeDraft(draft)) {
        setHasConfirmedSyntheticPhoneLoad(true);
      }
    } catch (error) {
      console.error("Live manuscript backup load failed.", error);
      setIsServerSnapshotUnavailable(true);
      setServerConnectionState("unavailable");
      setServerSnapshotStatus("Live manuscript backup load failed.");
      setMessage("Live manuscript backup load failed.");
    } finally {
      setIsServerSnapshotBusy(false);
    }
  }

  async function loadSelectedServerSnapshot() {
    if (!editor) {
      return;
    }

    const snapshotId = selectedServerSnapshotId.trim();

    if (!snapshotId) {
      setMessage("Select a server snapshot first.");
      return;
    }

    if (!confirmDraftReplacement("Loading the selected server snapshot")) {
      setMessage(
        "Server snapshot load canceled. Current browser-local draft kept.",
      );
      return;
    }

    setIsServerSnapshotBusy(true);
    setServerSnapshotStatus("Loading selected server snapshot...");

    try {
      const response = await fetch(
        `/api/manuscript/snapshots?id=${encodeURIComponent(snapshotId)}`,
        {
          cache: "no-store",
        },
      );
      const payload =
        (await response.json()) as ManuscriptSnapshotDetailResponse;

      if (!response.ok || !payload.ok) {
        const message =
          !payload.ok && payload.message
            ? payload.message
            : "Selected server snapshot could not be loaded.";
        markServerSnapshotResponseState(response);
        setServerSnapshotStatus(message);
        setMessage(message);
        return;
      }

      setIsServerSnapshotUnavailable(false);
      setServerConnectionState("connected");
      if (!payload.snapshot) {
        setServerSnapshotStatus("Selected server snapshot was not found.");
        setMessage("Selected server snapshot was not found.");
        void refreshServerSnapshots({ silent: true });
        return;
      }

      const draft = safeManuscriptDraft(payload.snapshot.draft);

      if (!draft) {
        setServerSnapshotStatus("Selected server snapshot failed draft validation.");
        setMessage("Selected server snapshot failed draft validation.");
        return;
      }

      applyDraftToEditor(
        draft,
        `Loaded selected server snapshot from ${formatDateTime(
          payload.snapshot.updatedAt,
        )}.`,
      );
      setSelectedServerSnapshotId(payload.snapshot.id);
      setLastSavedServerSnapshot(payload.snapshot);
      setServerCheckpointKey(createManuscriptDraftCheckpointKey(draft));
      setServerSnapshotStatus(
        `Loaded selected server snapshot from ${formatDateTime(
          payload.snapshot.updatedAt,
        )}.`,
      );
      void refreshServerSnapshots({ silent: true });
    } catch (error) {
      console.error("Selected server snapshot load failed.", error);
      setIsServerSnapshotUnavailable(true);
      setServerConnectionState("unavailable");
      setServerSnapshotStatus("Selected server snapshot load failed.");
      setMessage("Selected server snapshot load failed.");
    } finally {
      setIsServerSnapshotBusy(false);
    }
  }

  function focusBlock(blockId: string | null) {
    if (!editor || !blockId) {
      setMessage("Cannot focus a block without a block ID.");
      return;
    }

    let targetPosition: number | null = null;

    editor.state.doc.descendants((node, pos) => {
      if (node.attrs?.blockId === blockId) {
        targetPosition = pos;
        return false;
      }

      return true;
    });

    if (targetPosition === null) {
      setMessage("Block ID was not found in the editor.");
      return;
    }

    editor
      .chain()
      .focus()
      .setTextSelection(Math.min(targetPosition + 1, editor.state.doc.content.size))
      .scrollIntoView()
      .run();
    setMessage(`Focused block ${blockId}.`);
  }

  function focusQuotationAtIndex(index: number) {
    const quotation = filteredCitedQuotations[index];

    if (!quotation) {
      setMessage("No cited quotation is available in the current filter.");
      return;
    }

    if (!quotation.blockId) {
      setMessage("Cannot focus this quotation because its block ID is missing.");
      return;
    }

    setCurrentQuoteIndex(index);
    focusBlock(quotation.blockId);
    setMessage(
      `Focused quote ${index + 1} of ${filteredCitedQuotations.length}.`,
    );
  }

  function focusPreviousQuotation() {
    focusQuotationAtIndex(Math.max(0, currentQuoteIndex - 1));
  }

  function focusNextQuotation() {
    focusQuotationAtIndex(
      Math.min(filteredCitedQuotations.length - 1, currentQuoteIndex + 1),
    );
  }

  function focusCurrentQuotation() {
    focusQuotationAtIndex(currentQuoteIndex);
  }

  function importEditorJson() {
    if (!editor) {
      return;
    }

    if (!confirmDraftReplacement("Importing JSON")) {
      setMessage("JSON import canceled. Current browser-local draft kept.");
      return;
    }

    try {
      const parsed = JSON.parse(importJson);
      const parsedDraft = safeManuscriptDraft(parsed);

      if (parsedDraft) {
        applyDraftToEditor(
          parsedDraft,
          "Full Manuscript Desk draft JSON imported.",
        );
        setImportJson("");
        return;
      }

      if (!validateEditorJsonShape(parsed)) {
        setMessage("Import JSON did not match editor JSON or draft shape.");
        return;
      }

      const jsonWithBlockIds = ensureBlockIds(parsed);
      editor.commands.setContent(jsonWithBlockIds as JSONContent);
      setEditorJson(jsonWithBlockIds);
      setSessionStartWordCount(countWordsAndCharacters(jsonWithBlockIds).words);
      setSourceFileName(null);
      setImportSummary(null);
      setStructureRegions([]);
      setStructureBoundaryMarkers([]);
      setQuoteReviews({});
      setEditingQuoteReviewHighlightId(null);
      setSelectedStructureRange(null);
      setPendingStructureStartBlockId(null);
      setPendingStructureEndBlockId(null);
      setExportStructureMarkdown("");
      setExportFilteredMarkdown("");
      setExportCitedQuotationMarkdown("");
      setImportJson("");
      setMessage("Editor JSON imported.");
    } catch {
      setMessage("Import JSON could not be parsed.");
    }
  }

  function exportFullDraft() {
    const draft = createCurrentDraft();

    if (!draft) {
      return;
    }

    setExportJson(JSON.stringify(draft, null, 2));
    setMessage("Full browser-local draft JSON exported.");
  }

  function clearLocalDraft() {
    if (!editor) {
      return;
    }

    const confirmed = window.confirm(
      `Clear this Manuscript Desk browser draft? This removes only ${MANUSCRIPT_STORAGE_KEY} from localStorage in this browser.`,
    );

    if (!confirmed) {
      return;
    }

    const emptyDraft = createDefaultManuscriptDraft(null);
    skipNextPersistRef.current = true;
    window.localStorage.removeItem(MANUSCRIPT_STORAGE_KEY);
    editor.commands.setContent(emptyDraft.editorJson as JSONContent);
    setTitle(emptyDraft.title);
    setSourceFileName(null);
    setImportSummary(null);
    setStructureRegions([]);
    setStructureBoundaryMarkers([]);
    setQuoteReviews({});
    setEditingQuoteReviewHighlightId(null);
    setSelectedStructureRange(null);
    setHasTextSelection(false);
    setTagContextMenu(null);
    setPendingStructureStartBlockId(null);
    setPendingStructureEndBlockId(null);
    setActiveAuthorId(emptyDraft.activeAuthorId);
    setShowAuthorColors(emptyDraft.showAuthorColors);
    setShowSemanticColors(emptyDraft.showSemanticColors);
    setLastUpdatedAt(null);
    setEditorJson(emptyDraft.editorJson);
    setSessionStartWordCount(countWordsAndCharacters(emptyDraft.editorJson).words);
    setExportJson("");
    setImportJson("");
    setExportHtml("");
    setExportPlainText("");
    setExportStructureMarkdown("");
    setExportFilteredMarkdown("");
    setExportCitedQuotationMarkdown("");
    setMessage("Manuscript Desk browser draft cleared.");
  }

  const statusTone =
    message.includes("failed") || message.includes("Could not")
      ? "danger"
      : message.includes("exported") ||
          message.includes("downloaded") ||
          message.includes("generated") ||
          message.includes("imported") ||
          message.includes("Marked") ||
          message.includes("Applied") ||
          message.includes("Captured") ||
          message.includes("Added") ||
          message.includes("Suggested") ||
          message.includes("saved") ||
          message.includes("cleared") ||
          message.includes("removed") ||
          message.includes("updated") ||
          message.includes("Loaded")
        ? "tag"
        : "default";
  const saveSharePanel = (
    <section
      className={cn(
        cardClassName,
        "grid gap-3 border-studio-tag/45 bg-[#0a2a22]/95 p-3.5 shadow-[0_10px_24px_rgba(0,0,0,0.22)]",
      )}
      data-testid="manuscript-primary-save-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <HelpLabel noteId="server-snapshot">Save and share</HelpLabel>
        <StudioChip tone={serverConnectionState === "connected" ? "source" : "review"}>
          {serverConnectionLabel}
        </StudioChip>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <button
          className={cn(
            smallButtonClassName,
            "border-studio-tag/60 bg-studio-tag/15 text-studio-tag",
          )}
          data-testid="manuscript-primary-save"
          disabled={isServerSnapshotBusy || isServerSnapshotUnavailable}
          type="button"
          onClick={() => void saveServerSnapshot()}
        >
          Save manuscript
        </button>
        <button
          className={cn(
            smallButtonClassName,
            "border-studio-source/55 bg-studio-source/10 text-studio-source",
          )}
          data-testid="manuscript-primary-save-live-edit"
          disabled={isServerSnapshotBusy || isServerSnapshotUnavailable}
          type="button"
          onClick={() => void saveAndOpenLiveEdit()}
        >
          Save + live edit
        </button>
        <button
          className={smallButtonClassName}
          data-testid="manuscript-primary-copy-phone-link"
          type="button"
          onClick={() => void copyLiveLatestSnapshotLink()}
        >
          Copy phone link
        </button>
        <button
          className={smallButtonClassName}
          disabled={isServerSnapshotBusy || isServerSnapshotUnavailable}
          type="button"
          onClick={() => void loadLiveSnapshotBySlug("latest")}
        >
          Load latest
        </button>
      </div>
      <p
        className="m-0 truncate font-mono text-[0.7rem] leading-relaxed text-studio-muted"
        title={MANUSCRIPT_LIVE_LATEST_PATH}
      >
        {MANUSCRIPT_LIVE_LATEST_PATH}
      </p>
      <p className="m-0 text-[0.72rem] leading-relaxed text-studio-muted">
        {latestShareSnapshot
          ? `Latest saved ${formatDateTime(latestShareSnapshot.updatedAt)}`
          : "No server save visible yet."}{" "}
        Local changes: {localChangesSinceServerSaveLabel}.
      </p>
      <div className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={labelClassName}>Shared live room</span>
          <StudioChip tone={liveEditStatusTone}>{liveEditStatusLabel}</StudioChip>
        </div>
        <p className="m-0 text-[0.72rem] leading-relaxed text-studio-muted">
          {liveEditStatusCopy}
        </p>
        <button
          className={smallButtonClassName}
          disabled={isLiveEditStatusBusy}
          type="button"
          onClick={() => void refreshLiveEditStatus()}
        >
          {isLiveEditStatusBusy ? "Checking room..." : "Check room"}
        </button>
      </div>
      <p className="m-0 text-[0.72rem] leading-relaxed text-studio-dim">
        Save + live edit creates a latest backup first, then opens the shared
        room with a handoff prompt so the room can pull in that save deliberately.
      </p>
    </section>
  );

  const hasStructureRailContent = Boolean(
    structureRailState.chapter ||
      structureRailState.episode ||
      structureRailState.nextChapter ||
      structureRailState.nextEpisode,
  );

  function renderFilterMenuPanel() {
    return (
      <div className="grid gap-3" data-testid="manuscript-filter-menu-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StudioChip
            tone={blockFilterSummary.hasActiveFilters ? "review" : "source"}
          >
            {filteredBlockDetails.length.toLocaleString()} /{" "}
            {blockDetails.length.toLocaleString()} blocks
          </StudioChip>
          {blockFilterSummary.hasActiveFilters ? (
            <button
              className={smallButtonClassName}
              type="button"
              onClick={exitFocusView}
            >
              Full manuscript
            </button>
          ) : null}
        </div>

        <label className="grid gap-1.5">
          <span className={fieldLabelClassName}>Search text</span>
          <input
            className={fieldClassName}
            value={filterTextQuery}
            onChange={(event) => setFilterTextQuery(event.target.value)}
            placeholder="Search block text"
          />
        </label>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <HelpLabel noteId="author-marks">Author</HelpLabel>
            <select
              className={fieldClassName}
              value={filterAuthorId}
              onChange={(event) =>
                setFilterAuthorId(event.target.value as ManuscriptAuthorId | "")
              }
            >
              <option value="">Any author</option>
              {manuscriptAuthorDefinitions.map((author) => (
                <option key={author.id} value={author.id}>
                  {author.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <HelpLabel noteId="semantic-meaning-tags">Semantic tag</HelpLabel>
            <select
              className={fieldClassName}
              value={filterSemanticType}
              onChange={(event) =>
                setFilterSemanticType(
                  event.target.value as SemanticHighlightType | "",
                )
              }
            >
              <option value="">Any semantic tag</option>
              {semanticHighlightDefinitions.map((definition) => (
                <option key={definition.id} value={definition.id}>
                  {definition.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <HelpLabel noteId="structure-region">Structure region</HelpLabel>
            <select
              className={fieldClassName}
              value={filterStructureRegionId}
              onChange={(event) => setFilterStructureRegionId(event.target.value)}
            >
              <option value="">Any structure region</option>
              {blockFilterOptions.structureRegions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.title}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className={fieldLabelClassName}>Structure kind</span>
            <select
              className={fieldClassName}
              value={filterStructureKind}
              onChange={(event) =>
                setFilterStructureKind(
                  event.target.value as ManuscriptStructureKind | "",
                )
              }
            >
              <option value="">Any structure kind</option>
              {manuscriptStructureDefinitions.map((definition) => (
                <option key={definition.id} value={definition.id}>
                  {definition.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <HelpLabel noteId="quote-review-metadata">
              Quote review status
            </HelpLabel>
            <select
              className={fieldClassName}
              value={filterQuoteReviewStatus}
              onChange={(event) =>
                setFilterQuoteReviewStatus(
                  event.target.value as ManuscriptQuoteReviewStatusFilter | "",
                )
              }
            >
              <option value="">Any quote review status</option>
              {manuscriptQuoteReviewStatusFilterDefinitions.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className={fieldLabelClassName}>Visual mode</span>
            <select
              className={fieldClassName}
              value={filterVisualMode}
              onChange={(event) =>
                setFilterVisualMode(
                  event.target.value as ManuscriptFilterVisualMode,
                )
              }
            >
              {manuscriptFilterVisualModeDefinitions.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5">
          <label className="flex items-start gap-2 text-[0.8rem] leading-snug text-studio-muted">
            <input
              checked={filterOnlyUnstructured}
              type="checkbox"
              onChange={(event) =>
                setFilterOnlyUnstructured(event.target.checked)
              }
            />
            Only unstructured blocks
          </label>
          <label className="flex items-start gap-2 text-[0.8rem] leading-snug text-studio-muted">
            <input
              checked={filterOnlyWithSemanticHighlights}
              type="checkbox"
              onChange={(event) =>
                setFilterOnlyWithSemanticHighlights(event.target.checked)
              }
            />
            Only blocks with semantic highlights
          </label>
          <label className="flex items-start gap-2 text-[0.8rem] leading-snug text-studio-muted">
            <input
              checked={filterOnlyWithoutAuthor}
              type="checkbox"
              onChange={(event) =>
                setFilterOnlyWithoutAuthor(event.target.checked)
              }
            />
            Only blocks with no author mark
          </label>
        </div>

        {blockFilterSummary.activeFilterLabels.length ? (
          <div className="flex flex-wrap gap-1.5">
            {blockFilterSummary.activeFilterLabels.map((label) => (
              <StudioChip key={label} tone="review">
                {label}
              </StudioChip>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <button
            className={smallButtonClassName}
            type="button"
            onClick={() => applyQuoteFocus()}
          >
            Quote Focus
          </button>
          <button
            className={smallButtonClassName}
            type="button"
            onClick={applyHomerReadingFocus}
          >
            Homer / Scott
          </button>
          <button
            className={smallButtonClassName}
            type="button"
            onClick={() => applySemanticFocus()}
          >
            Semantic marks
          </button>
          <button
            className={smallButtonClassName}
            type="button"
            onClick={clearBlockFilters}
          >
            Clear filters
          </button>
        </div>
      </div>
    );
  }

  function renderStructureRailCard(
    kind: ManuscriptStructureBoundaryKind,
    currentRegion: ManuscriptStructureBoundary | null,
    nextRegion: ManuscriptStructureBoundary | null,
  ) {
    if (!currentRegion && !nextRegion) {
      return null;
    }

    const railLabel =
      currentRegion?.label ??
      (nextRegion ? `Before ${nextRegion.label}` : "Before");
    const railTitle = currentRegion?.title ?? nextRegion?.title ?? "";
    const railPublicationDate = formatEpisodePublicationDate(
      kind === "episode"
        ? (currentRegion ?? nextRegion)?.publicationDate
        : null,
    );
    const shouldShowTitle =
      railTitle.trim().length > 0 &&
      railTitle.trim().toLowerCase() !==
        (currentRegion ?? nextRegion)?.label.toLowerCase();

    return (
      <article
        className={cn(
          "manuscript-structure-rail-card",
          `manuscript-structure-rail-card-${kind}`,
        )}
        key={kind}
      >
        <span className="manuscript-structure-rail-label">{railLabel}</span>
        {shouldShowTitle ? (
          <strong className="manuscript-structure-rail-title">
            {railTitle}
          </strong>
        ) : null}
        {railPublicationDate ? (
          <span className="manuscript-structure-rail-date">
            Publishes {railPublicationDate}
          </span>
        ) : null}
        {currentRegion && nextRegion ? (
          <span className="manuscript-structure-rail-next">
            Next {nextRegion.label}
          </span>
        ) : null}
      </article>
    );
  }

  function renderMobileStructureStatusItem(
    kind: ManuscriptStructureBoundaryKind,
    currentRegion: ManuscriptStructureBoundary | null,
    nextRegion: ManuscriptStructureBoundary | null,
  ) {
    const definition = getManuscriptStructureDefinition(kind);
    const targetRegion = currentRegion ?? nextRegion;
    const statusLabel =
      currentRegion?.label ??
      (nextRegion ? `Before ${nextRegion.label}` : `No ${definition.label}`);
    const title = currentRegion?.title ?? nextRegion?.title ?? "Not marked yet";
    const publicationDate = formatEpisodePublicationDate(
      kind === "episode" ? targetRegion?.publicationDate : null,
    );
    const testId =
      kind === "chapter"
        ? "manuscript-mobile-current-chapter"
        : "manuscript-mobile-current-episode";

    return (
      <button
        aria-label={
          targetRegion
            ? `Jump to ${definition.label.toLowerCase()} ${targetRegion.label}`
            : `${definition.label} is not marked yet`
        }
        className={cn(
          "min-w-0 rounded-lg border px-2.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50",
          kind === "chapter"
            ? "border-studio-node/45 bg-studio-node/10"
            : "border-studio-source/45 bg-studio-source/10",
        )}
        data-testid={testId}
        disabled={!targetRegion}
        type="button"
        onClick={() => focusMobileStructureBoundary(targetRegion)}
      >
        <span
          className={cn(
            "block truncate text-[0.62rem] font-extrabold tracking-[0.08em] uppercase",
            kind === "chapter" ? "text-studio-node" : "text-studio-source",
          )}
        >
          {definition.label}
        </span>
        <span className="mt-0.5 block truncate text-[0.76rem] leading-tight text-studio-ink">
          {statusLabel}
        </span>
        <span className="mt-0.5 block truncate text-[0.66rem] leading-tight text-studio-muted">
          {publicationDate ? `Publishes ${publicationDate}` : title}
        </span>
      </button>
    );
  }

  function renderMobileStructureNavigationCard(
    kind: ManuscriptStructureBoundaryKind,
    currentRegion: ManuscriptStructureBoundary | null,
    nextRegion: ManuscriptStructureBoundary | null,
  ) {
    if (!currentRegion && !nextRegion) {
      return null;
    }

    const definition = getManuscriptStructureDefinition(kind);
    const targetRegion = currentRegion ?? nextRegion;
    const publicationDate = formatEpisodePublicationDate(
      kind === "episode" ? targetRegion?.publicationDate : null,
    );
    const testId =
      kind === "chapter"
        ? "manuscript-mobile-chapter-nav"
        : "manuscript-mobile-episode-nav";

    return (
      <article
        className={cn(
          "grid gap-2 rounded-lg border p-2.5",
          kind === "chapter"
            ? "border-studio-node/35 bg-studio-node/10"
            : "border-studio-source/35 bg-studio-source/10",
        )}
        data-testid={testId}
        key={kind}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-[0.88rem] leading-snug text-studio-ink">
            {definition.label}
          </h3>
          <StudioChip tone={kind === "chapter" ? "node" : "source"}>
            {currentRegion ? "Current" : "Upcoming"}
          </StudioChip>
        </div>

        {currentRegion ? (
          <div className="min-w-0">
            <p className="m-0 truncate text-[0.82rem] font-bold text-studio-ink">
              {currentRegion.label}
            </p>
            <p className="m-0 truncate text-[0.72rem] leading-relaxed text-studio-muted">
              {currentRegion.title}
            </p>
            {publicationDate ? (
              <p className="m-0 truncate text-[0.68rem] font-bold leading-relaxed text-studio-source">
                Publishes {publicationDate}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="min-w-0">
            <p className={panelCopyClassName}>
              Before {nextRegion?.label ?? definition.label.toLowerCase()}.
            </p>
            {publicationDate ? (
              <p className="m-0 truncate text-[0.68rem] font-bold leading-relaxed text-studio-source">
                Publishes {publicationDate}
              </p>
            ) : null}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            className={smallButtonClassName}
            disabled={!currentRegion}
            type="button"
            onClick={() => focusMobileStructureBoundary(currentRegion)}
          >
            Jump {definition.label.toLowerCase()}
          </button>
          <button
            className={smallButtonClassName}
            disabled={!currentRegion}
            type="button"
            onClick={() => focusMobileStructureBoundary(currentRegion, "end")}
          >
            End
          </button>
          <button
            className={smallButtonClassName}
            disabled={!nextRegion}
            type="button"
            onClick={() => focusMobileStructureBoundary(nextRegion)}
          >
            Next {definition.label.toLowerCase()}
          </button>
          <button
            className={smallButtonClassName}
            disabled={!nextRegion}
            type="button"
            onClick={() => focusMobileStructureBoundary(nextRegion, "end")}
          >
            Next end
          </button>
        </div>
      </article>
    );
  }

  function renderBoundaryOutlineCard(
    boundary: ManuscriptStructureBoundary,
    index: number,
  ) {
    const marker = getStructureBoundaryMarker(boundary.sourceId);
    const isEditing = editingBoundaryMarkerId === boundary.sourceId;
    const tone = boundary.kind === "chapter" ? "node" : "source";
    const kindLabel = boundary.label;
    const removeLabel =
      boundary.kind === "chapter" ? "Remove chapter" : "Remove episode";
    const publicationDate = formatEpisodePublicationDate(
      boundary.publicationDate,
    );

    return (
      <article
        className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5"
        key={boundary.id}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              <StudioChip tone={tone}>{kindLabel}</StudioChip>
              <StudioChip tone="node">
                {boundary.blockCount.toLocaleString()} blocks
              </StudioChip>
              {publicationDate ? (
                <StudioChip tone="source">
                  Publishes {publicationDate}
                </StudioChip>
              ) : null}
            </div>
            <h3 className="mt-2 mb-0 text-[1rem] leading-snug text-studio-ink">
              {boundary.title}
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              className={smallButtonClassName}
              type="button"
              onClick={() => focusBlock(boundary.startBlockId)}
            >
              Jump start
            </button>
            <button
              className={smallButtonClassName}
              type="button"
              onClick={() => focusBlock(boundary.endBlockId)}
            >
              Jump end
            </button>
            {!isRecordingMode && marker ? (
              <>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() =>
                    moveStructureBoundaryMarkerToCurrentBlock(marker.id)
                  }
                >
                  Use cursor line
                </button>
                {isEditing ? (
                  <>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={() => saveStructureBoundaryMarker(marker.id)}
                    >
                      Save
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={cancelEditingStructureBoundary}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className={smallButtonClassName}
                    type="button"
                    onClick={() => beginEditingStructureBoundary(marker.id)}
                  >
                    Edit
                  </button>
                )}
                <button
                  className={dangerButtonClassName}
                  type="button"
                  onClick={() => removeStructureBoundaryMarker(marker.id)}
                >
                  {removeLabel}
                </button>
              </>
            ) : null}
          </div>
        </div>

        {isEditing ? (
          <div className="grid gap-2 pt-1">
            <label className="grid gap-1.5">
              <span className={fieldLabelClassName}>Boundary title</span>
              <input
                className={fieldClassName}
                value={editingBoundaryTitle}
                onChange={(event) => setEditingBoundaryTitle(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5">
              <span className={fieldLabelClassName}>Boundary notes</span>
              <textarea
                className={cn(textareaClassName, "min-h-[72px]")}
                value={editingBoundaryNotes}
                onChange={(event) => setEditingBoundaryNotes(event.target.value)}
              />
            </label>
          </div>
        ) : (
          <>
            {marker?.notes ? (
              <p className="m-0 text-[0.75rem] leading-relaxed text-studio-review">
                {marker.notes}
              </p>
            ) : null}
            <p className="m-0 font-mono text-[0.7rem] leading-relaxed text-studio-muted">
              Start {boundary.startIndex + 1} / End {boundary.endIndex + 1}
            </p>
          </>
        )}
      </article>
    );
  }

  return (
    <main className="min-h-screen overflow-x-clip px-3.5 pt-3.5 pb-[calc(7rem+env(safe-area-inset-bottom))] md:p-6">
      <div className="grid min-h-[calc(100vh-28px)] gap-[14px] md:min-h-[calc(100vh-48px)] md:grid-rows-[auto_1fr] md:gap-[18px]">
        <header
          className={cn(
            "sticky top-2 z-40 hidden overflow-visible rounded-lg border border-studio-line bg-studio-panel/68 px-2.5 py-1.5 shadow-[0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-md",
            "md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-2 md:gap-y-1",
          )}
          aria-label="Manuscript command bar"
        >
          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            <StudioGlyph className="size-7 rounded-md text-[0.9rem]" />
            <div className="min-w-[6rem] max-w-[20rem] flex-1">
              <p className="sr-only">Manuscript Desk</p>
              <h1 className="m-0 truncate text-[0.95rem] leading-tight tracking-normal text-studio-ink">
                {title || "Untitled manuscript"}
              </h1>
            </div>
            <StudioChip className={commandChipClassName} tone="source">
              Active: {getManuscriptAuthorDefinition(activeAuthorId).label}
            </StudioChip>
            <StudioChip className={commandChipClassName} tone="node">
              Mode: {getSidePanelModeLabel(sidePanelMode)}
            </StudioChip>
            <StudioChip className={commandChipClassName} tone="review">
              Quotes {citedQuotations.length.toLocaleString()}
            </StudioChip>
            {blockFilterSummary.hasActiveFilters ? (
              <StudioChip className={commandChipClassName} tone="review">
                Focus {filteredBlockDetails.length.toLocaleString()} /{" "}
                {blockDetails.length.toLocaleString()}
              </StudioChip>
            ) : null}
            {isRecordingMode ? (
              <StudioChip className={commandChipClassName} tone="node">
                Recording
              </StudioChip>
            ) : null}
            <StudioChip className={commandChipClassName} tone="default">
              Saved: {formatDateTime(lastUpdatedAt)}
            </StudioChip>
            <p
              className={cn(
                "m-0 hidden min-w-0 max-w-[18rem] truncate text-[0.7rem] leading-tight text-studio-muted lg:block",
                statusTone === "tag" && "text-studio-tag",
                statusTone === "danger" && "text-studio-danger",
              )}
            >
              {message}
            </p>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-1.5">
            <button
              className={cn(
                commandButtonClassName,
                blockFilterSummary.hasActiveFilters ? activeButtonClassName : "",
              )}
              data-testid="manuscript-desktop-filter-menu"
              type="button"
              onClick={openFilterMenu}
            >
              {blockFilterSummary.hasActiveFilters
                ? `Filter ${filteredBlockDetails.length.toLocaleString()}`
                : "Filter"}
            </button>
            <button
              className={cn(
                commandButtonClassName,
                isRecordingMode ? activeButtonClassName : "",
              )}
              type="button"
              title="Toggle Recording / Reading mode"
              onClick={() => updateRecordingMode(!isRecordingMode)}
            >
              {isRecordingMode
                ? "Exit Reading"
                : "Recording / Reading"}
            </button>
            <ManuscriptHelpTip
              className="-ml-1"
              note={getManuscriptHelpNote("recording-reading-mode")}
            />
            <a
              className={cn(
                commandButtonClassName,
                "border-studio-source/45 bg-studio-source/10 text-studio-source",
              )}
              href="/manuscript/collab/latest"
            >
              Live Edit
            </a>
            {blockFilterSummary.hasActiveFilters ? (
              <div className="flex items-center gap-1.5">
                <button
                  className={commandButtonClassName}
                  type="button"
                  onClick={exitFocusView}
                >
                  Full manuscript
                </button>
                <ManuscriptHelpTip note={getManuscriptHelpNote("focus-view")} />
              </div>
            ) : null}
            <button
              className={cn(
                commandButtonClassName,
                isDevMode ? activeButtonClassName : "",
              )}
              data-testid="manuscript-dev-mode-toggle"
              type="button"
              title="Show advanced backup, export, smoke, and publish tools"
              onClick={() => setIsDevMode((current) => !current)}
            >
              Dev Mode
            </button>
          </div>
          <p
            className={cn(
              "sr-only",
              statusTone === "tag" && "text-studio-tag",
              statusTone === "danger" && "text-studio-danger",
            )}
            aria-live="polite"
          >
            {message} Browser-local draft is active. Server writes happen only
            when you save a snapshot.
          </p>
        </header>

        <section
          className={cn(
            "grid gap-[18px] overflow-visible md:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] md:items-start xl:grid-cols-[minmax(0,1fr)_400px]",
          )}
          aria-label="Manuscript Desk workspace"
        >
          <section
            ref={manuscriptSurfaceRef}
            className={cn(
              "order-1 grid min-w-0 gap-3 md:order-none",
              isRecordingMode && "manuscript-recording-mode",
              !showAuthorColors && "manuscript-hide-author-colors",
              !showSemanticColors && "manuscript-hide-semantic-colors",
            )}
            aria-label={isRecordingMode ? "Read-only manuscript" : "Editable manuscript"}
          >
            {isRecordingMode ? (
              <div className="rounded-lg border border-studio-node/45 bg-studio-node/10 p-3 text-[0.86rem] leading-relaxed text-studio-muted md:hidden">
                Recording mode is view-only. Exit recording mode to edit.
              </div>
            ) : null}

            <div
              className={cn(
                "manuscript-editor-shell",
                hasStructureRailContent && "manuscript-editor-shell-with-rail",
              )}
              onContextMenu={handleManuscriptContextMenu}
            >
              {hasStructureRailContent ? (
                <div
                  aria-label="Current chapter and episode"
                  className="manuscript-structure-rail"
                  data-testid="manuscript-structure-rail"
                >
                  {renderStructureRailCard(
                    "chapter",
                    structureRailState.chapter,
                    structureRailState.nextChapter,
                  )}
                  {renderStructureRailCard(
                    "episode",
                    structureRailState.episode,
                    structureRailState.nextEpisode,
                  )}
                </div>
              ) : null}
              <div className="manuscript-editor-body">
                <EditorContent editor={editor} />
              </div>
            </div>

            <p className="m-0 text-[0.78rem] leading-relaxed text-studio-muted">
              {message}
            </p>
          </section>

          <aside
            className={cn(
              "order-2 hidden min-w-0 rounded-lg border border-studio-line bg-studio-panel/78 p-3 shadow-[0_14px_38px_rgba(0,0,0,0.2)] backdrop-blur-md",
              "md:sticky md:top-[68px] md:z-20 md:flex md:max-h-[calc(100vh-80px)] md:flex-col md:self-start md:overflow-hidden xl:top-[64px] xl:max-h-[calc(100vh-76px)]",
            )}
            aria-label="Manuscript tools sidebar"
          >
            <div className="mb-3.5 flex items-start justify-between gap-3">
              <p className={labelClassName}>Tools</p>
              <StudioChip tone={isDevMode ? "review" : "node"}>
                {isDevMode ? "Dev Mode" : getSidePanelModeLabel(sidePanelMode)}
              </StudioChip>
            </div>

            <div className="grid min-h-0 flex-1 gap-3.5 overflow-y-auto pr-1">
            {sidePanelMode === "mark" ? (
              <>
                <section className={cn(cardClassName, "grid gap-3 p-3.5")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <HelpHeading noteId="mark-mode">
                      Mark selected text
                    </HelpHeading>
                    <div className="flex flex-wrap gap-1.5">
                      <StudioChip tone={hasTextSelection ? "tag" : "default"}>
                        {hasTextSelection ? "Selection ready" : "Select text"}
                      </StudioChip>
                      <StudioChip tone="source">
                        {getManuscriptAuthorDefinition(activeAuthorId).label}
                      </StudioChip>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <HelpLabel noteId="author-marks">Active author</HelpLabel>
                    {manuscriptAuthorDefinitions.map((author) => (
                      <button
                        className={cn(
                          smallButtonClassName,
                          activeAuthorId === author.id
                            ? activeButtonClassName
                            : "",
                        )}
                        key={author.id}
                        type="button"
                        onClick={() => updateActiveAuthor(author.id)}
                      >
                        {author.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={() => markSelectionAsAuthor("charlie")}
                    >
                      Mark Charlie
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={() => markSelectionAsAuthor("homer")}
                    >
                      Mark Homer / Scott
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={() => markSelectionAsAuthor("unassigned")}
                    >
                      Clear author
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={markAllAsHomer}
                    >
                      Mark all Homer / Scott
                    </button>
                  </div>

                  <label className="grid gap-2">
                    <HelpLabel noteId="semantic-meaning-tags">
                      Semantic tag
                    </HelpLabel>
                    <select
                      className={fieldClassName}
                      value={semanticType}
                      onChange={(event) =>
                        setSemanticType(event.target.value as SemanticHighlightType)
                      }
                    >
                      {semanticHighlightDefinitions.map((definition) => (
                        <option key={definition.id} value={definition.id}>
                          {definition.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className={fieldLabelClassName}>Semantic note</span>
                    <textarea
                      className={cn(textareaClassName, "min-h-[76px]")}
                      value={semanticNote}
                      onChange={(event) => setSemanticNote(event.target.value)}
                    />
                  </label>
                  <div className="grid gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className={smallButtonClassName}
                        type="button"
                        onClick={applySemanticHighlight}
                      >
                        Apply semantic
                      </button>
                      <button
                        className={smallButtonClassName}
                        type="button"
                        onClick={() => clearSemanticHighlight()}
                      >
                        Clear semantic
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {quickSemanticHighlightTypes.map((tagType) => {
                        const definition = getSemanticHighlightDefinition(tagType);

                        return (
                          <button
                            className={getSemanticControlClassName(
                              definition,
                              semanticType === definition.id,
                            )}
                            key={definition.id}
                            type="button"
                            onClick={() =>
                              applySemanticHighlightForType(definition.id)
                            }
                          >
                            <SemanticTagLabel definition={definition} />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-lg border border-studio-review/35 bg-studio-review/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <HelpLabel noteId="cited-quotation">
                        Cited quotation
                      </HelpLabel>
                      <StudioChip tone="review">
                        {citedQuotations.length.toLocaleString()} marked
                      </StudioChip>
                    </div>
                    <label className="grid gap-2">
                      <span className={fieldLabelClassName}>
                        Citation / source note
                      </span>
                      <textarea
                        className={cn(textareaClassName, "min-h-[72px]")}
                        value={citationNote}
                        onChange={(event) => setCitationNote(event.target.value)}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className={smallButtonClassName}
                        type="button"
                        onClick={() => markCitedQuotation()}
                      >
                        Mark cited quote
                      </button>
                      <button
                        className={smallButtonClassName}
                        type="button"
                        onClick={() => applyQuoteFocus()}
                      >
                        Quote Focus
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={cn(
                        smallButtonClassName,
                        editor?.isActive("bold") ? activeButtonClassName : "",
                      )}
                      type="button"
                      onClick={() => editor?.chain().focus().toggleBold().run()}
                    >
                      Bold
                    </button>
                    <button
                      className={cn(
                        smallButtonClassName,
                        editor?.isActive("italic") ? activeButtonClassName : "",
                      )}
                      type="button"
                      onClick={() => editor?.chain().focus().toggleItalic().run()}
                    >
                      Italic
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={() => editor?.chain().focus().undo().run()}
                    >
                      Undo
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={() => editor?.chain().focus().redo().run()}
                    >
                      Redo
                    </button>
                  </div>
                </section>

                <section className={cn(cardClassName, "grid gap-2 p-3.5")}>
                  <HelpHeading noteId="author-marks">Author counts</HelpHeading>
                  <div className="grid gap-2">
                    {authorSummaries.map((summary) => (
                      <div
                        className="grid gap-1 rounded-lg border border-studio-line bg-black/20 p-2.5"
                        key={summary.authorId}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[0.82rem] font-extrabold text-studio-ink">
                            {summary.label}
                          </span>
                          <span className="font-mono text-[0.72rem] text-studio-dim">
                            {summary.spans} spans
                          </span>
                        </div>
                        <span className="font-mono text-[0.72rem] text-studio-muted">
                          {summary.words} words / {summary.characters} chars
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {sidePanelMode === "structure" ? (
              <>
                <section className={cn(cardClassName, "mt-3.5 grid gap-3 p-3.5")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <HelpHeading noteId="structure-region">
                        Mark boundaries
                      </HelpHeading>
                      <ManuscriptHelpTip
                        note={getManuscriptHelpNote("chapter-book-region")}
                      />
                      <ManuscriptHelpTip
                        note={getManuscriptHelpNote("episode-region")}
                      />
                    </div>
                    <StudioChip tone="node">
                      {selectedStructureRange
                        ? `${selectedStructureRange.blockCount.toLocaleString()} selected`
                        : "Cursor block"}
                    </StudioChip>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={cn(
                        smallButtonClassName,
                        selectedStructureRange?.startBlockId &&
                          chapterTitleBlockIds.has(
                            selectedStructureRange.startBlockId,
                          )
                          ? activeButtonClassName
                          : "",
                      )}
                      type="button"
                      onClick={toggleSelectedBlockAsChapterTitle}
                    >
                      {selectedStructureRange?.startBlockId &&
                      chapterTitleBlockIds.has(selectedStructureRange.startBlockId)
                        ? "Unmark chapter"
                        : "Mark chapter"}
                    </button>
                    <button
                      className={cn(
                        smallButtonClassName,
                        selectedStructureRange?.startBlockId &&
                          episodeBoundaryBlockIds.has(
                            selectedStructureRange.startBlockId,
                          )
                          ? activeButtonClassName
                          : "",
                      )}
                      type="button"
                      onClick={toggleSelectedBlockAsEpisodeBoundary}
                    >
                      {selectedStructureRange?.startBlockId &&
                      episodeBoundaryBlockIds.has(
                        selectedStructureRange.startBlockId,
                      )
                        ? "Unmark episode"
                        : "Mark episode"}
                    </button>
                  </div>
                  {isDevMode ? (
                    <>
                      <label className="grid gap-2">
                        <HelpLabel noteId="structure-region">
                          Region kind
                        </HelpLabel>
                        <select
                          className={fieldClassName}
                          value={structureKind}
                          onChange={(event) =>
                            updateStructureKind(
                              event.target.value as ManuscriptStructureKind,
                            )
                          }
                        >
                          {manuscriptStructureDefinitions.map((definition) => (
                            <option key={definition.id} value={definition.id}>
                              {definition.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {structureKind === "chapter" ? (
                        <label className="grid gap-2">
                          <HelpLabel noteId="chapter-book-region">
                            Book label preset
                          </HelpLabel>
                          <select
                            className={fieldClassName}
                            value={structureLabelPreset}
                            onChange={(event) =>
                              updateStructureLabelPreset(
                                event.target
                                  .value as ManuscriptStructureLabelPreset,
                              )
                            }
                          >
                            {manuscriptStructureLabelPresets.map((preset) => (
                              <option key={preset.id} value={preset.id}>
                                {preset.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <label className="grid gap-2">
                        <span className={fieldLabelClassName}>
                          Region title
                        </span>
                        <input
                          className={fieldClassName}
                          placeholder={getDefaultStructureTitle(
                            structureKind,
                            structureLabelPreset,
                          )}
                          value={structureTitle}
                          onChange={(event) =>
                            setStructureTitle(event.target.value)
                          }
                        />
                      </label>
                      <label className="grid gap-2">
                        <HelpLabel noteId="structure-region">
                          Structure notes
                        </HelpLabel>
                        <textarea
                          className={cn(textareaClassName, "min-h-[76px]")}
                          value={structureNotes}
                          onChange={(event) =>
                            setStructureNotes(event.target.value)
                          }
                        />
                      </label>
                      {pendingStructureRange ? (
                        <div className="grid gap-2 rounded-lg border border-studio-node/40 bg-studio-node/10 p-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={fieldLabelClassName}>
                              Pending range
                            </span>
                            <StudioChip
                              tone={
                                pendingStructureRange.isRangeComplete
                                  ? "node"
                                  : "review"
                              }
                            >
                              {pendingStructureRange.isRangeComplete
                                ? `${pendingStructureRange.blockCount.toLocaleString()} blocks`
                                : "Set both ends"}
                            </StudioChip>
                          </div>
                          <p className="m-0 text-[0.76rem] leading-relaxed text-studio-muted">
                            Start:{" "}
                            {getBlockPreview(pendingStructureStartBlockId) ||
                              pendingStructureRange.startPreview}
                          </p>
                          <p className="m-0 text-[0.76rem] leading-relaxed text-studio-muted">
                            End:{" "}
                            {getBlockPreview(pendingStructureEndBlockId) ||
                              pendingStructureRange.endPreview}
                          </p>
                          <button
                            className={smallButtonClassName}
                            type="button"
                            onClick={clearPendingStructureRange}
                          >
                            Clear pending range
                          </button>
                        </div>
                      ) : null}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          className={smallButtonClassName}
                          type="button"
                          onClick={captureStructureRange}
                        >
                          Capture range
                        </button>
                        <button
                          className={smallButtonClassName}
                          type="button"
                          onClick={createStructureRegion}
                        >
                          Add structure
                        </button>
                      </div>
                      <button
                        className={smallButtonClassName}
                        type="button"
                        onClick={toggleSelectedBlockAsChapterTitle}
                      >
                        {selectedStructureRange?.startBlockId &&
                        chapterTitleBlockIds.has(
                          selectedStructureRange.startBlockId,
                        )
                          ? "Unmark chapter title"
                          : "Mark chapter title"}
                      </button>
                      <button
                        className={smallButtonClassName}
                        type="button"
                        onClick={suggestBookRegionsFromHeadings}
                      >
                        Suggest book regions from headings
                      </button>
                    </>
                  ) : null}
                </section>

                <section className={cn(cardClassName, "mt-3.5 grid gap-2 p-3.5")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="m-0 text-[1rem] leading-snug text-studio-ink">
                      Boundary index
                    </h2>
                    <div className="flex flex-wrap gap-1.5">
                      <StudioChip tone="node">
                        {structureBoundaryIndex.chapters.length.toLocaleString()}{" "}
                        rail chapters
                      </StudioChip>
                      <StudioChip tone="source">
                        {structureBoundaryIndex.episodes.length.toLocaleString()}{" "}
                        rail episodes
                      </StudioChip>
                      {structureBoundaryIndex.warnings.length ? (
                        <StudioChip tone="review">
                          {structureBoundaryIndex.warnings.length.toLocaleString()}{" "}
                          warnings
                        </StudioChip>
                      ) : null}
                    </div>
                  </div>
                  {structureBoundaryIndex.warnings.length ? (
                    <div className="grid gap-1.5">
                      {structureBoundaryIndex.warnings.map((warning) => (
                        <p
                          className="m-0 rounded-lg border border-studio-review/35 bg-studio-review/10 p-2 text-[0.76rem] leading-relaxed text-studio-muted"
                          key={warning.id}
                        >
                          {warning.message}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className={cn(cardClassName, "mt-3.5 grid gap-2 p-3.5")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="m-0 text-[1rem] leading-snug text-studio-ink">
                      Boundary map
                    </h2>
                    <div className="flex flex-wrap gap-1.5">
                      <StudioChip tone="node">
                        {structureBoundaryIndex.chapters.length.toLocaleString()}{" "}
                        chapters
                      </StudioChip>
                      <StudioChip tone="source">
                        {structureBoundaryIndex.episodes.length.toLocaleString()}{" "}
                        episodes
                      </StudioChip>
                    </div>
                  </div>
                  {leadingChapterlessBlockCount ? (
                    <p className="m-0 rounded-lg border border-studio-review/35 bg-studio-review/10 p-2 text-[0.76rem] leading-relaxed text-studio-muted">
                      {leadingChapterlessBlockCount.toLocaleString()} block
                      {leadingChapterlessBlockCount === 1 ? "" : "s"} before the
                      first chapter title.
                    </p>
                  ) : null}
                  <div className="grid max-h-[260px] gap-2 overflow-auto pr-1">
                    {structureBoundaryIndex.chapters.length ? (
                      structureBoundaryIndex.chapters.map((chapter, index) =>
                        renderBoundaryOutlineCard(chapter, index),
                      )
                    ) : (
                      <p className={panelCopyClassName}>
                        No chapter boundaries marked yet.
                      </p>
                    )}
                  </div>
                  <div className="grid max-h-[220px] gap-2 overflow-auto pr-1">
                    {structureBoundaryIndex.episodes.length ? (
                      structureBoundaryIndex.episodes.map((episode, index) =>
                        renderBoundaryOutlineCard(episode, index),
                      )
                    ) : (
                      <p className={panelCopyClassName}>
                        No episode boundaries marked yet.
                      </p>
                    )}
                  </div>
                </section>

                {isDevMode ? (
                  <section
                    className={cn(cardClassName, "mt-3.5 grid gap-2 p-3.5")}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <HelpHeading noteId="structure-region">
                        Structure regions
                      </HelpHeading>
                      <StudioChip tone="node">
                        {structureRegions.length.toLocaleString()} regions
                      </StudioChip>
                    </div>
                    <div className="grid max-h-[280px] gap-2 overflow-auto pr-1">
                      {structureRegionSummaries.length ? (
                        structureRegionSummaries.map((region) => {
                          const isEditing = editingStructureRegionId === region.id;

                          return (
                            <article
                              className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5"
                              key={region.id}
                            >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap gap-1.5">
                              <StudioChip tone="node">
                                {
                                  getManuscriptStructureDefinition(region.kind)
                                    .label
                                }
                              </StudioChip>
                              {region.labelPreset ? (
                                <StudioChip tone="review">
                                  {
                                    getManuscriptStructureLabelPresetDefinition(
                                      region.labelPreset,
                                    ).label
                                  }
                                </StudioChip>
                              ) : null}
                            </div>
                            <h3 className="mt-2 mb-0 text-[1rem] leading-snug text-studio-ink">
                              {region.title}
                            </h3>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              className={smallButtonClassName}
                              type="button"
                              onClick={() => focusBlock(region.startBlockId)}
                            >
                              Jump to start
                            </button>
                            <button
                              className={smallButtonClassName}
                              type="button"
                              onClick={() => focusBlock(region.endBlockId)}
                            >
                              Jump to end
                            </button>
                            {!isRecordingMode ? (
                              <>
                                <button
                                  className={smallButtonClassName}
                                  type="button"
                                  disabled={!canMoveStructureRegion(region, "up")}
                                  onClick={() =>
                                    moveStructureRegion(region.id, "up")
                                  }
                                >
                                  Move up
                                </button>
                                <button
                                  className={smallButtonClassName}
                                  type="button"
                                  disabled={
                                    !canMoveStructureRegion(region, "down")
                                  }
                                  onClick={() =>
                                    moveStructureRegion(region.id, "down")
                                  }
                                >
                                  Move down
                                </button>
                                {isEditing ? (
                                  <>
                                    <button
                                      className={smallButtonClassName}
                                      type="button"
                                      onClick={() =>
                                        saveStructureRegion(region.id)
                                      }
                                    >
                                      Save
                                    </button>
                                    <button
                                      className={smallButtonClassName}
                                      type="button"
                                      onClick={cancelEditingStructureRegion}
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    className={smallButtonClassName}
                                    type="button"
                                    onClick={() =>
                                      beginEditingStructureRegion(region)
                                    }
                                  >
                                    Edit
                                  </button>
                                )}
                                <button
                                  className={dangerButtonClassName}
                                  type="button"
                                  onClick={() => removeStructureRegion(region.id)}
                                >
                                  Remove
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>

                        {isEditing && !isRecordingMode ? (
                          <div className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5">
                            <label className="grid gap-1.5">
                              <span className={fieldLabelClassName}>
                                Region kind
                              </span>
                              <select
                                className={fieldClassName}
                                value={editingStructureKind}
                                onChange={(event) =>
                                  updateEditingStructureKind(
                                    event.target
                                      .value as ManuscriptStructureKind,
                                  )
                                }
                              >
                                {manuscriptStructureDefinitions.map(
                                  (definition) => (
                                    <option
                                      key={definition.id}
                                      value={definition.id}
                                    >
                                      {definition.label}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                            {editingStructureKind === "chapter" ? (
                              <label className="grid gap-1.5">
                                <span className={fieldLabelClassName}>
                                  Book label preset
                                </span>
                                <select
                                  className={fieldClassName}
                                  value={editingStructureLabelPreset}
                                  onChange={(event) =>
                                    updateEditingStructureLabelPreset(
                                      event.target
                                        .value as ManuscriptStructureLabelPreset,
                                    )
                                  }
                                >
                                  {manuscriptStructureLabelPresets.map(
                                    (preset) => (
                                      <option key={preset.id} value={preset.id}>
                                        {preset.label}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </label>
                            ) : null}
                            <label className="grid gap-1.5">
                              <span className={fieldLabelClassName}>
                                Region title
                              </span>
                              <input
                                className={fieldClassName}
                                value={editingStructureTitle}
                                onChange={(event) =>
                                  setEditingStructureTitle(event.target.value)
                                }
                              />
                            </label>
                            <label className="grid gap-1.5">
                              <span className={fieldLabelClassName}>
                                Structure notes
                              </span>
                              <textarea
                                className={cn(textareaClassName, "min-h-[74px]")}
                                value={editingStructureNotes}
                                onChange={(event) =>
                                  setEditingStructureNotes(event.target.value)
                                }
                              />
                            </label>
                          </div>
                        ) : null}

                        <p className="m-0 font-mono text-[0.7rem] leading-relaxed text-studio-muted">
                          {region.isRangeComplete
                            ? `${region.blockCount.toLocaleString()} blocks`
                            : "Range needs review"}
                        </p>
                        <p className="m-0 text-[0.76rem] leading-relaxed text-studio-muted">
                          Start: {region.startPreview}
                        </p>
                        <p className="m-0 text-[0.76rem] leading-relaxed text-studio-muted">
                          End: {region.endPreview}
                        </p>
                        {region.notes ? (
                          <p className="m-0 text-[0.75rem] leading-relaxed text-studio-review">
                            {region.notes}
                          </p>
                        ) : null}
                      </article>
                    );
                  })
                ) : (
                  <p className={panelCopyClassName}>No structure regions yet.</p>
                )}
              </div>
            </section>
                ) : null}

            {isDevMode ? (
              <>
            <section className={cn(cardClassName, "mt-3.5 grid gap-2 p-3.5")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 text-[1rem] leading-snug text-studio-ink">
                  Block IDs
                </h2>
                <StudioChip tone={missingBlockIdCount ? "danger" : "source"}>
                  {blockSummaries.length.toLocaleString()} blocks
                </StudioChip>
              </div>
              {missingBlockIdCount ? (
                <p className="m-0 rounded-lg border border-studio-danger/45 bg-studio-danger/10 p-2 text-[0.78rem] leading-relaxed text-studio-danger">
                  {missingBlockIdCount.toLocaleString()} visible block
                  {missingBlockIdCount === 1 ? "" : "s"} missing block IDs.
                  Exported JSON should be checked before future persistence work.
                </p>
              ) : null}
              <div className="grid max-h-[310px] gap-2 overflow-auto pr-1">
                {blockSummaries.length ? (
                  blockSummaries.map((block, index) => {
                    const blockRegions = getStructureRegionsForBlock(
                      block.blockId,
                    );
                    const blockChapter = getChapterForTitleBlock(block.blockId);

                    return (
                      <article
                        className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5 text-left transition hover:border-studio-tag/55 hover:bg-studio-tag/10"
                        key={`${block.blockId ?? "missing"}-${index}`}
                        onClick={() => focusBlock(block.blockId)}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-1.5">
                            <StudioChip
                              tone={block.blockId ? "source" : "danger"}
                            >
                              {block.type}
                            </StudioChip>
                            {block.blockId &&
                            block.blockId ===
                              pendingStructureStartBlockId ? (
                              <StudioChip tone="node">Start</StudioChip>
                            ) : null}
                            {block.blockId &&
                            block.blockId === pendingStructureEndBlockId ? (
                              <StudioChip tone="review">End</StudioChip>
                            ) : null}
                            {blockChapter ? (
                              <StudioChip tone="node">Chapter title</StudioChip>
                            ) : null}
                          </div>
                          <span className="font-mono text-[0.68rem] leading-tight text-studio-dim">
                            {block.blockId ?? "missing blockId"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {!isRecordingMode ? (
                            <>
                              <button
                                className={smallButtonClassName}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setPendingStructureStart(block.blockId);
                                }}
                              >
                                Set start
                              </button>
                              <button
                                className={smallButtonClassName}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setPendingStructureEnd(block.blockId);
                                }}
                              >
                                Set end
                              </button>
                              <button
                                className={smallButtonClassName}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleChapterTitleBlock(block.blockId);
                                }}
                              >
                                {blockChapter ? "Unmark title" : "Mark title"}
                              </button>
                            </>
                          ) : null}
                          <button
                            className={smallButtonClassName}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              focusBlock(block.blockId);
                            }}
                          >
                            Jump
                          </button>
                        </div>
                        {blockRegions.length ? (
                          <div className="flex flex-wrap gap-1">
                            {blockRegions.map((region) => (
                              <StudioChip key={region.id} tone="node">
                                {region.title}
                              </StudioChip>
                            ))}
                          </div>
                        ) : null}
                        <p className="m-0 text-[0.8rem] leading-relaxed text-studio-muted">
                          {block.preview || "Empty block"}
                        </p>
                      </article>
                    );
                  })
                ) : (
                  <p className={panelCopyClassName}>No blocks yet.</p>
                )}
              </div>
            </section>

            <section className={cn(cardClassName, "mt-3.5 grid gap-2 p-3.5")}>
              <HelpHeading noteId="semantic-meaning-tags">
                Semantic highlights
              </HelpHeading>
              <div className="grid max-h-[250px] gap-2 overflow-auto pr-1">
                {semanticHighlights.length ? (
                  semanticHighlights.map((highlight, index) => (
                    <article
                      className="grid gap-1 rounded-lg border border-studio-line bg-black/20 p-2.5"
                      key={`${highlight.highlightId}-${index}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <StudioChip tone="tag">{highlight.label}</StudioChip>
                        <span className="font-mono text-[0.68rem] leading-tight text-studio-dim">
                          {highlight.highlightId || "no id"}
                        </span>
                      </div>
                      <p className="m-0 text-[0.8rem] leading-relaxed text-studio-muted">
                        {highlight.preview}
                      </p>
                      {highlight.note ? (
                        <p className="m-0 text-[0.75rem] leading-relaxed text-studio-review">
                          {highlight.note}
                        </p>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className={panelCopyClassName}>No semantic highlights yet.</p>
                )}
              </div>
            </section>
              </>
            ) : null}
              </>
            ) : null}

            {sidePanelMode === "find" || sidePanelMode === "quotes" ? (
              <section className={cn(cardClassName, "mt-3.5 grid gap-3 p-3.5")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <HelpHeading
                    noteId={sidePanelMode === "quotes" ? "quotes-mode" : "find-mode"}
                  >
                    {sidePanelMode === "quotes" ? "Quote review" : "Filter lens"}
                  </HelpHeading>
                  <StudioChip
                    tone={blockFilterSummary.hasActiveFilters ? "review" : "source"}
                  >
                    {filteredBlockDetails.length.toLocaleString()} /{" "}
                    {blockDetails.length.toLocaleString()} blocks
                  </StudioChip>
                </div>
                <label className="grid gap-1.5">
                  <span className={fieldLabelClassName}>Search text</span>
                  <input
                    className={fieldClassName}
                    value={filterTextQuery}
                    onChange={(event) => setFilterTextQuery(event.target.value)}
                    placeholder="Search block text"
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <HelpLabel noteId="author-marks">Author</HelpLabel>
                    <select
                      className={fieldClassName}
                      value={filterAuthorId}
                      onChange={(event) =>
                        setFilterAuthorId(event.target.value as ManuscriptAuthorId | "")
                      }
                    >
                      <option value="">Any author</option>
                      {manuscriptAuthorDefinitions.map((author) => (
                        <option key={author.id} value={author.id}>
                          {author.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <HelpLabel noteId="semantic-meaning-tags">
                      Semantic tag
                    </HelpLabel>
                    <select
                      className={fieldClassName}
                      value={filterSemanticType}
                      onChange={(event) =>
                        setFilterSemanticType(
                          event.target.value as SemanticHighlightType | "",
                        )
                      }
                    >
                      <option value="">Any semantic tag</option>
                      {semanticHighlightDefinitions.map((definition) => (
                        <option key={definition.id} value={definition.id}>
                          {definition.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <HelpLabel noteId="structure-region">
                      Structure region
                    </HelpLabel>
                    <select
                      className={fieldClassName}
                      value={filterStructureRegionId}
                      onChange={(event) =>
                        setFilterStructureRegionId(event.target.value)
                      }
                    >
                      <option value="">Any structure region</option>
                      {blockFilterOptions.structureRegions.map((region) => (
                        <option key={region.id} value={region.id}>
                          {region.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className={fieldLabelClassName}>Structure kind</span>
                    <select
                      className={fieldClassName}
                      value={filterStructureKind}
                      onChange={(event) =>
                        setFilterStructureKind(
                          event.target.value as ManuscriptStructureKind | "",
                        )
                      }
                    >
                      <option value="">Any structure kind</option>
                      {manuscriptStructureDefinitions.map((definition) => (
                        <option key={definition.id} value={definition.id}>
                          {definition.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className={fieldLabelClassName}>Block type</span>
                    <select
                      className={fieldClassName}
                      value={filterBlockType}
                      onChange={(event) => setFilterBlockType(event.target.value)}
                    >
                      <option value="">Any block type</option>
                      {blockFilterOptions.blockTypes.map((blockType) => (
                        <option key={blockType} value={blockType}>
                          {blockType}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <HelpLabel noteId="quote-review-metadata">
                      Quote review status
                    </HelpLabel>
                    <select
                      className={fieldClassName}
                      value={filterQuoteReviewStatus}
                      onChange={(event) =>
                        setFilterQuoteReviewStatus(
                          event.target
                            .value as ManuscriptQuoteReviewStatusFilter | "",
                        )
                      }
                    >
                      <option value="">Any quote review status</option>
                      {manuscriptQuoteReviewStatusFilterDefinitions.map(
                        (status) => (
                          <option key={status.id} value={status.id}>
                            {status.label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className={fieldLabelClassName}>Visual mode</span>
                    <select
                      className={fieldClassName}
                      value={filterVisualMode}
                      onChange={(event) =>
                        setFilterVisualMode(
                          event.target.value as ManuscriptFilterVisualMode,
                        )
                      }
                    >
                      {manuscriptFilterVisualModeDefinitions.map((mode) => (
                        <option key={mode.id} value={mode.id}>
                          {mode.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className={fieldLabelClassName}>
                      Context around matches
                    </span>
                    <select
                      className={fieldClassName}
                      value={String(filterContextBlockCount)}
                      onChange={(event) =>
                        setFilterContextBlockCount(Number(event.target.value))
                      }
                    >
                      <option value="0">0 blocks</option>
                      <option value="1">1 block</option>
                      <option value="2">2 blocks</option>
                    </select>
                  </label>
                </div>
                <div className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5">
                  <label className="flex items-start gap-2 text-[0.8rem] leading-snug text-studio-muted">
                    <input
                      checked={filterOnlyUnstructured}
                      type="checkbox"
                      onChange={(event) =>
                        setFilterOnlyUnstructured(event.target.checked)
                      }
                    />
                    Only unstructured blocks
                  </label>
                  <label className="flex items-start gap-2 text-[0.8rem] leading-snug text-studio-muted">
                    <input
                      checked={filterOnlyWithSemanticHighlights}
                      type="checkbox"
                      onChange={(event) =>
                        setFilterOnlyWithSemanticHighlights(event.target.checked)
                      }
                    />
                    Only blocks with semantic highlights
                  </label>
                  <label className="flex items-start gap-2 text-[0.8rem] leading-snug text-studio-muted">
                    <input
                      checked={filterOnlyWithoutAuthor}
                      type="checkbox"
                      onChange={(event) =>
                        setFilterOnlyWithoutAuthor(event.target.checked)
                      }
                    />
                    Only blocks with no author mark
                  </label>
                </div>
                {blockFilterSummary.activeFilterLabels.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {blockFilterSummary.activeFilterLabels.map((label) => (
                      <StudioChip key={label} tone="review">
                        {label}
                      </StudioChip>
                    ))}
                  </div>
                ) : (
                  <p className="m-0 text-[0.78rem] leading-relaxed text-studio-muted">
                    No filters active. The full manuscript remains the working
                    surface.
                  </p>
                )}
                <div className="grid gap-2 rounded-lg border border-studio-review/35 bg-studio-review/10 p-2.5">
                  <HelpLabel noteId="focus-view">Quote Review Focus</HelpLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={() => applyQuoteFocus()}
                    >
                      Quote Focus
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={() => applyQuoteFocus("needs-source")}
                    >
                      Needs Source Focus
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={() => applyQuoteFocus("needs-verification")}
                    >
                      Needs Verification Focus
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={exitFocusView}
                    >
                      Exit Focus View
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={smallButtonClassName}
                    type="button"
                    onClick={() => applyQuoteFocus()}
                  >
                    Show only cited quotations
                  </button>
                  <button
                    className={smallButtonClassName}
                    type="button"
                    onClick={clearBlockFilters}
                  >
                    Clear filters
                  </button>
                  {!isRecordingMode ? (
                    <>
                      <button
                        className={smallButtonClassName}
                        type="button"
                        onClick={exportFilteredBlockList}
                      >
                        Export filtered Markdown
                      </button>
                      <button
                        className={smallButtonClassName}
                        type="button"
                        onClick={downloadFilteredBlockList}
                      >
                        Download filtered Markdown
                      </button>
                    </>
                  ) : null}
                </div>
                <div className="grid gap-2 rounded-lg border border-studio-review/35 bg-studio-review/10 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <h3 className="m-0 text-[0.86rem] leading-snug text-studio-ink">
                        Cited quotations
                      </h3>
                      <ManuscriptHelpTip
                        note={getManuscriptHelpNote("cited-quotation")}
                      />
                      <ManuscriptHelpTip
                        note={getManuscriptHelpNote("quote-review-metadata")}
                      />
                    </div>
                    <StudioChip tone="review">
                      {filteredCitedQuotations.length.toLocaleString()} /{" "}
                      {citedQuotations.length.toLocaleString()}
                    </StudioChip>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    <StudioChip tone="review">
                      Total {quoteReviewProgress.total.toLocaleString()}
                    </StudioChip>
                    <StudioChip tone="danger">
                      Needs source{" "}
                      {quoteReviewProgress.needsSource.toLocaleString()}
                    </StudioChip>
                    <StudioChip tone="review">
                      Needs verification{" "}
                      {quoteReviewProgress.needsVerification.toLocaleString()}
                    </StudioChip>
                    <StudioChip tone="tag">
                      Verified {quoteReviewProgress.verified.toLocaleString()}
                    </StudioChip>
                    <StudioChip tone="danger">
                      Do not use {quoteReviewProgress.doNotUse.toLocaleString()}
                    </StudioChip>
                    <StudioChip tone="source">
                      No metadata{" "}
                      {quoteReviewProgress.noReviewMetadata.toLocaleString()}
                    </StudioChip>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      className={smallButtonClassName}
                      disabled={
                        !filteredCitedQuotations.length || currentQuoteIndex <= 0
                      }
                      type="button"
                      onClick={focusPreviousQuotation}
                    >
                      Previous quote
                    </button>
                    <button
                      className={smallButtonClassName}
                      disabled={!filteredCitedQuotations.length}
                      type="button"
                      onClick={focusCurrentQuotation}
                    >
                      Jump current
                    </button>
                    <button
                      className={smallButtonClassName}
                      disabled={
                        !filteredCitedQuotations.length ||
                        currentQuoteIndex >= filteredCitedQuotations.length - 1
                      }
                      type="button"
                      onClick={focusNextQuotation}
                    >
                      Next quote
                    </button>
                  </div>
                  <p className="m-0 text-[0.74rem] leading-relaxed text-studio-muted">
                    {filteredCitedQuotations.length
                      ? `Quote ${currentQuoteIndex + 1} of ${
                          filteredCitedQuotations.length
                        }`
                      : "No quotes in the current filter."}
                  </p>
                  {!isRecordingMode ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className={smallButtonClassName}
                        type="button"
                        onClick={exportCitedQuotations}
                      >
                        Export quote Markdown
                      </button>
                      <button
                        className={smallButtonClassName}
                        type="button"
                        onClick={downloadCitedQuotations}
                      >
                        Download quote Markdown
                      </button>
                    </div>
                  ) : null}
                  <div className="grid max-h-[220px] gap-2 overflow-auto pr-1">
                    {filteredCitedQuotations.length ? (
                      filteredCitedQuotations.map((quotation, index) => {
                        const isEditing =
                          editingQuoteReviewHighlightId ===
                          quotation.highlightId;
                        const review = quotation.review;

                        return (
                          <article
                            className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5 text-left transition hover:border-studio-review/60 hover:bg-studio-review/10"
                            key={`${quotation.highlightId || quotation.blockId || "quote"}-${index}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap gap-1.5">
                                <StudioChip tone="review">
                                  {quotation.label}
                                </StudioChip>
                                <StudioChip
                                  tone={getQuoteReviewStatusTone(
                                    review.reviewStatus,
                                  )}
                                >
                                  {
                                    getManuscriptQuoteReviewStatusDefinition(
                                      review.reviewStatus,
                                    ).label
                                  }
                                </StudioChip>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  className={smallButtonClassName}
                                  type="button"
                                  onClick={() => focusQuotationAtIndex(index)}
                                >
                                  Jump
                                </button>
                                {!isRecordingMode ? (
                                  isEditing ? (
                                    <>
                                      <button
                                        className={smallButtonClassName}
                                        type="button"
                                        onClick={() =>
                                          saveQuoteReview(quotation.highlightId)
                                        }
                                      >
                                        Save review
                                      </button>
                                      <button
                                        className={smallButtonClassName}
                                        type="button"
                                        onClick={cancelEditingQuoteReview}
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      className={smallButtonClassName}
                                      type="button"
                                      onClick={() =>
                                        beginEditingQuoteReview(quotation)
                                      }
                                    >
                                      Review
                                    </button>
                                  )
                                ) : null}
                              </div>
                            </div>
                            <p className="m-0 text-[0.8rem] leading-relaxed text-studio-muted">
                              {quotation.preview || "Empty quotation"}
                            </p>
                            <p className="m-0 text-[0.74rem] leading-relaxed text-studio-dim">
                              {quotation.blockPreview || quotation.blockId}
                            </p>
                            {quotation.note.trim() ? (
                              <p className="m-0 text-[0.78rem] leading-relaxed text-studio-muted">
                                {quotation.note}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-1">
                              {quotation.structureRegions.map((region) => (
                                <StudioChip key={region.id} tone="node">
                                  {region.title}
                                </StudioChip>
                              ))}
                              {review.attributedTo.trim() ? (
                                <StudioChip tone="source">
                                  {review.attributedTo}
                                </StudioChip>
                              ) : null}
                              {review.sourceTitle.trim() ? (
                                <StudioChip tone="tag">
                                  {review.sourceTitle}
                                </StudioChip>
                              ) : null}
                              {review.sourceType !== "unknown" ? (
                                <StudioChip tone="default">
                                  {
                                    getManuscriptQuoteSourceTypeDefinition(
                                      review.sourceType,
                                    ).label
                                  }
                                </StudioChip>
                              ) : null}
                              {review.locator.trim() ? (
                                <StudioChip tone="default">
                                  {review.locator}
                                </StudioChip>
                              ) : null}
                            </div>

                            {isEditing && !isRecordingMode ? (
                              <div className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5">
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <label className="grid gap-1.5">
                                    <HelpLabel noteId="quote-review-metadata">
                                      Review status
                                    </HelpLabel>
                                    <select
                                      className={fieldClassName}
                                      value={editingQuoteReviewStatus}
                                      onChange={(event) =>
                                        setEditingQuoteReviewStatus(
                                          event.target
                                            .value as ManuscriptQuoteReviewStatus,
                                        )
                                      }
                                    >
                                      {manuscriptQuoteReviewStatusDefinitions.map(
                                        (status) => (
                                          <option
                                            key={status.id}
                                            value={status.id}
                                          >
                                            {status.label}
                                          </option>
                                        ),
                                      )}
                                    </select>
                                  </label>
                                  <label className="grid gap-1.5">
                                    <span className={fieldLabelClassName}>
                                      Source type
                                    </span>
                                    <select
                                      className={fieldClassName}
                                      value={editingQuoteSourceType}
                                      onChange={(event) =>
                                        setEditingQuoteSourceType(
                                          event.target
                                            .value as ManuscriptQuoteSourceType,
                                        )
                                      }
                                    >
                                      {manuscriptQuoteSourceTypeDefinitions.map(
                                        (sourceType) => (
                                          <option
                                            key={sourceType.id}
                                            value={sourceType.id}
                                          >
                                            {sourceType.label}
                                          </option>
                                        ),
                                      )}
                                    </select>
                                  </label>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <label className="grid gap-1.5">
                                    <span className={fieldLabelClassName}>
                                      Attributed to
                                    </span>
                                    <input
                                      className={fieldClassName}
                                      value={editingQuoteAttributedTo}
                                      onChange={(event) =>
                                        setEditingQuoteAttributedTo(
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="grid gap-1.5">
                                    <span className={fieldLabelClassName}>
                                      Source title
                                    </span>
                                    <input
                                      className={fieldClassName}
                                      value={editingQuoteSourceTitle}
                                      onChange={(event) =>
                                        setEditingQuoteSourceTitle(
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                </div>
                                <label className="grid gap-1.5">
                                  <span className={fieldLabelClassName}>
                                    Locator
                                  </span>
                                  <input
                                    className={fieldClassName}
                                    value={editingQuoteLocator}
                                    onChange={(event) =>
                                      setEditingQuoteLocator(event.target.value)
                                    }
                                  />
                                </label>
                                <label className="grid gap-1.5">
                                  <span className={fieldLabelClassName}>
                                    Citation text
                                  </span>
                                  <textarea
                                    className={cn(
                                      textareaClassName,
                                      "min-h-[72px]",
                                    )}
                                    value={editingQuoteCitationText}
                                    onChange={(event) =>
                                      setEditingQuoteCitationText(
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>
                                <label className="grid gap-1.5">
                                  <span className={fieldLabelClassName}>
                                    Rights note
                                  </span>
                                  <textarea
                                    className={cn(
                                      textareaClassName,
                                      "min-h-[72px]",
                                    )}
                                    value={editingQuoteRightsNote}
                                    onChange={(event) =>
                                      setEditingQuoteRightsNote(
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>
                                <label className="grid gap-1.5">
                                  <span className={fieldLabelClassName}>
                                    Editor note
                                  </span>
                                  <textarea
                                    className={cn(
                                      textareaClassName,
                                      "min-h-[72px]",
                                    )}
                                    value={editingQuoteEditorNote}
                                    onChange={(event) =>
                                      setEditingQuoteEditorNote(
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>
                                <button
                                  className={dangerButtonClassName}
                                  type="button"
                                  onClick={() =>
                                    removeQuoteReview(quotation.highlightId)
                                  }
                                >
                                  Remove review metadata
                                </button>
                              </div>
                            ) : null}

                            <span className="font-mono text-[0.68rem] leading-tight text-studio-dim">
                              {quotation.blockId ?? "missing blockId"} |{" "}
                              {quotation.highlightId || "missing highlightId"}
                            </span>
                          </article>
                        );
                      })
                    ) : (
                      <p className={panelCopyClassName}>
                        No cited quotations match the current quote filters.
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid max-h-[360px] gap-2 overflow-auto pr-1">
                  {filteredBlockDetails.length ? (
                    filteredBlockDetails.map((block, index) => (
                      <article
                        className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5 text-left transition hover:border-studio-tag/55 hover:bg-studio-tag/10"
                        key={`${block.blockId ?? "missing"}-${index}`}
                        onClick={() => focusBlock(block.blockId)}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <StudioChip tone={block.blockId ? "source" : "danger"}>
                            {block.type}
                          </StudioChip>
                          <button
                            className={smallButtonClassName}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              focusBlock(block.blockId);
                            }}
                          >
                            Jump
                          </button>
                        </div>
                        <p className="m-0 text-[0.8rem] leading-relaxed text-studio-muted">
                          {block.preview || "Empty block"}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {block.structureRegions.map((region) => (
                            <StudioChip key={region.id} tone="node">
                              {region.title}
                            </StudioChip>
                          ))}
                          {block.authorIds.map((authorId) => (
                            <StudioChip key={authorId} tone="source">
                              {getManuscriptAuthorDefinition(authorId).label}
                            </StudioChip>
                          ))}
                          {block.semanticTagTypes.map((tagType) => (
                            <StudioChip key={tagType} tone="tag">
                              {getSemanticHighlightDefinition(tagType).label}
                            </StudioChip>
                          ))}
                        </div>
                        <span className="font-mono text-[0.68rem] leading-tight text-studio-dim">
                          {block.blockId ?? "missing blockId"}
                        </span>
                      </article>
                    ))
                  ) : (
                    <p className={panelCopyClassName}>
                      No blocks match the active filters.
                    </p>
                  )}
                </div>
                <textarea
                  className={cn(textareaClassName, "min-h-[120px] font-mono text-xs")}
                  readOnly
                  value={exportFilteredMarkdown}
                />
                <textarea
                  className={cn(textareaClassName, "min-h-[120px] font-mono text-xs")}
                  readOnly
                  value={exportCitedQuotationMarkdown}
                />
              </section>
            ) : null}

            {isDevMode && sidePanelMode === "backup" && !isRecordingMode ? (
              <section className={cn(cardClassName, "mt-3.5 grid gap-2 p-3.5")}>
              <HelpHeading noteId="backup-mode">Export / backup</HelpHeading>
              <p className="m-0 text-[0.78rem] leading-relaxed text-studio-muted">
                Download backups before serious editing. Downloads are browser
                generated and do not write to the server or repo.
              </p>
              <div className="grid gap-3 rounded-lg border border-studio-line bg-black/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <HelpLabel noteId="browser-local-draft">
                    Browser-local source
                  </HelpLabel>
                  <StudioChip tone="review">No database writes</StudioChip>
                </div>
                <label className="grid gap-2">
                  <span className={fieldLabelClassName}>Title</span>
                  <input
                    className={fieldClassName}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label className="grid gap-2">
                  <span className={fieldLabelClassName}>Upload .docx</span>
                  <input
                    className={fieldClassName}
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    type="file"
                    onChange={(event) => {
                      void importDocx(event.target.files?.[0] ?? null);
                      event.target.value = "";
                    }}
                  />
                </label>
                <p className="m-0 text-[0.76rem] leading-relaxed text-studio-muted">
                  Saved locally in this browser under `{MANUSCRIPT_STORAGE_KEY}`.
                  Export a full draft backup before replacing an imported
                  manuscript.
                </p>
                {sourceFileName ? (
                  <StudioChip className="normal-case" tone="source">
                    Source: {sourceFileName}
                  </StudioChip>
                ) : null}
                {importSummary ? (
                  <p className="m-0 rounded-lg border border-studio-tag/35 bg-studio-tag/10 p-2 text-[0.76rem] leading-relaxed text-studio-muted">
                    {importSummary.sourceFileName} imported{" "}
                    {formatDateTime(importSummary.importedAt)} with{" "}
                    {importSummary.words.toLocaleString()} words,{" "}
                    {importSummary.characters.toLocaleString()} characters, and{" "}
                    {importSummary.blocks.toLocaleString()} blocks.
                  </p>
                ) : null}
              </div>
              <div
                className="grid gap-3 rounded-lg border border-studio-source/35 bg-studio-source/10 p-3"
                data-testid="manuscript-library-panel"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <HelpLabel noteId="manuscript-library">
                      Manuscript library
                    </HelpLabel>
                    <h3 className="m-0 text-[0.98rem] leading-snug text-studio-ink">
                      Named manuscripts above the snapshot stack
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StudioChip tone="source">
                      {serverManuscripts.length.toLocaleString()} manuscripts
                    </StudioChip>
                    {selectedServerManuscriptKindDefinition ? (
                      <StudioChip
                        tone={
                          selectedServerManuscript?.kind === "SYNTHETIC"
                            ? "review"
                            : "tag"
                        }
                      >
                        {selectedServerManuscriptKindDefinition.label}
                      </StudioChip>
                    ) : (
                      <StudioChip tone="review">Legacy / all</StudioChip>
                    )}
                  </div>
                </div>
                <p className="m-0 text-[0.78rem] leading-relaxed text-studio-muted">
                  Choose a named manuscript before saving real work. Synthetic
                  smoke drafts are labeled separately, while old snapshots
                  without a manuscript remain loadable as legacy snapshots.
                </p>
                <label className="grid gap-2">
                  <span className={fieldLabelClassName}>Current manuscript</span>
                  <select
                    className={fieldClassName}
                    data-testid="manuscript-library-select"
                    disabled={isServerManuscriptBusy || isServerSnapshotBusy}
                    value={selectedServerManuscriptId}
                    onChange={(event) =>
                      setSelectedServerManuscriptId(event.target.value)
                    }
                  >
                    <option value="">
                      No manuscript selected - legacy / all snapshots
                    </option>
                    {serverManuscripts.map((manuscript) => (
                      <option key={manuscript.id} value={manuscript.id}>
                        {manuscript.kind === "SYNTHETIC" ? "Synthetic: " : ""}
                        {manuscript.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-studio-line bg-black/20 p-2.5">
                    <p className={labelClassName}>Selected manuscript</p>
                    <p className="m-0 mt-1 text-[0.84rem] font-extrabold text-studio-ink">
                      {selectedServerManuscript?.title ??
                        "None selected - legacy snapshots"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-studio-line bg-black/20 p-2.5">
                    <p className={labelClassName}>Latest in manuscript</p>
                    <p className="m-0 mt-1 text-[0.84rem] font-extrabold text-studio-ink">
                      {selectedServerManuscript?.latestSnapshot
                        ? formatDateTime(
                            selectedServerManuscript.latestSnapshot.updatedAt,
                          )
                        : "No manuscript snapshot yet"}
                    </p>
                  </div>
                </div>
                <label className="grid gap-2">
                  <span className={fieldLabelClassName}>
                    New manuscript description
                  </span>
                  <textarea
                    className={cn(textareaClassName, "min-h-[64px]")}
                    disabled={isServerManuscriptBusy}
                    value={serverManuscriptDescription}
                    onChange={(event) =>
                      setServerManuscriptDescription(event.target.value)
                    }
                    placeholder="Optional note, for example: synthetic smoke tests or working draft."
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={smallButtonClassName}
                    data-testid="manuscript-library-create-current"
                    disabled={isServerManuscriptBusy || isServerSnapshotUnavailable}
                    type="button"
                    onClick={() => void createServerManuscriptFromCurrentDraft()}
                  >
                    Create from current draft
                  </button>
                  <button
                    className={smallButtonClassName}
                    disabled={isServerManuscriptBusy}
                    type="button"
                    onClick={() => void refreshManuscriptLibrary()}
                  >
                    Refresh library
                  </button>
                </div>
                <p className="m-0 text-[0.76rem] leading-relaxed text-studio-muted">
                  {serverManuscriptStatus}
                </p>
                {serverManuscripts.length ? (
                  <div className="grid gap-2">
                    {serverManuscripts.slice(0, 5).map((manuscript) => (
                      <article
                        className={cn(
                          "grid gap-1 rounded-lg border border-studio-line bg-black/20 p-2.5",
                          selectedServerManuscriptId === manuscript.id &&
                            "border-studio-source/60 bg-studio-source/10",
                        )}
                        key={manuscript.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h4 className="m-0 text-[0.88rem] leading-snug text-studio-ink">
                              {manuscript.title}
                            </h4>
                            <p className="m-0 mt-1 text-[0.72rem] leading-snug text-studio-muted">
                              {manuscript.snapshotCount.toLocaleString()} snapshots
                              {manuscript.sourceFileName
                                ? ` / ${manuscript.sourceFileName}`
                                : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StudioChip
                              tone={
                                manuscript.kind === "SYNTHETIC"
                                  ? "review"
                                  : "tag"
                              }
                            >
                              {manuscript.kind === "SYNTHETIC"
                                ? "Synthetic"
                                : "Working"}
                            </StudioChip>
                            <span className="font-mono text-[0.68rem] text-studio-dim">
                              {formatDateTime(manuscript.updatedAt)}
                            </span>
                          </div>
                        </div>
                        {manuscript.description ? (
                          <p className="m-0 text-[0.74rem] leading-relaxed text-studio-muted">
                            {manuscript.description}
                          </p>
                        ) : null}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            className={smallButtonClassName}
                            data-testid="manuscript-library-row-select"
                            disabled={isServerSnapshotBusy}
                            type="button"
                            onClick={() =>
                              setSelectedServerManuscriptId(manuscript.id)
                            }
                          >
                            Select manuscript
                          </button>
                          <button
                            className={smallButtonClassName}
                            data-testid="manuscript-library-row-load-latest"
                            disabled={
                              isServerSnapshotBusy ||
                              !manuscript.latestSnapshot
                            }
                            type="button"
                            onClick={() => {
                              setSelectedServerManuscriptId(manuscript.id);
                              void loadLatestServerSnapshot({
                                manuscriptId: manuscript.id,
                                manuscriptTitle: manuscript.title,
                              });
                            }}
                          >
                            Load latest
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
              <div
                className="grid gap-3 rounded-lg border border-studio-node/35 bg-studio-node/10 p-3"
                data-testid="manuscript-snapshot-panel"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <HelpLabel noteId="server-snapshot">
                      Server snapshots
                    </HelpLabel>
                    <h3 className="m-0 text-[0.98rem] leading-snug text-studio-ink">
                      Manual cross-device checkpoints
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StudioChip tone="review">Manual</StudioChip>
                    <StudioChip className="normal-case" tone="source">
                      {actor.primaryEmail}
                    </StudioChip>
                  </div>
                </div>
                <p className="m-0 text-[0.78rem] leading-relaxed text-studio-muted">
                  Browser-local draft is the active working copy. Server
                  snapshots are manual cross-device checkpoints. When a
                  manuscript is selected, new snapshots are saved under that
                  named manuscript. With no manuscript selected, this panel
                  falls back to the legacy account-wide snapshot stack.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-studio-line bg-black/20 p-2.5">
                    <p className={labelClassName}>Server connected</p>
                    <p className="m-0 mt-1 text-[0.84rem] font-extrabold text-studio-ink">
                      {serverConnectionLabel}
                    </p>
                  </div>
                  <div className="rounded-lg border border-studio-line bg-black/20 p-2.5">
                    <p className={labelClassName}>Latest snapshot time</p>
                    <p className="m-0 mt-1 text-[0.84rem] font-extrabold text-studio-ink">
                      {latestServerSnapshot
                        ? formatDateTime(latestServerSnapshot.updatedAt)
                        : "No server snapshot yet"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-studio-line bg-black/20 p-2.5">
                    <p className={labelClassName}>Last saved snapshot id</p>
                    <p className="m-0 mt-1 break-all font-mono text-[0.72rem] text-studio-muted">
                      {lastSavedServerSnapshot?.id ?? "None in this browser"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-studio-line bg-black/20 p-2.5">
                    <HelpLabel noteId="local-changes-since-server-save">
                      Local changes since last server save
                    </HelpLabel>
                    <div className="mt-1">
                      <StudioChip
                        tone={
                          hasLocalChangesSinceServerSave === true
                            ? "review"
                            : hasLocalChangesSinceServerSave === false
                              ? "source"
                              : "default"
                        }
                      >
                        {localChangesSinceServerSaveLabel}
                      </StudioChip>
                    </div>
                  </div>
                </div>
                <label className="grid gap-2">
                  <span className={fieldLabelClassName}>Snapshot note</span>
                  <textarea
                    className={cn(textareaClassName, "min-h-[70px]")}
                    disabled={isServerSnapshotBusy}
                    value={serverSnapshotDescription}
                    onChange={(event) =>
                      setServerSnapshotDescription(event.target.value)
                    }
                    placeholder="Optional note, for example: ready for Homer phone recording."
                  />
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button
                    className={smallButtonClassName}
                    data-testid="manuscript-snapshot-save"
                    disabled={isServerSnapshotBusy || isServerSnapshotUnavailable}
                    type="button"
                    onClick={() => void saveServerSnapshot()}
                  >
                    {selectedServerManuscript
                      ? "Save to manuscript"
                      : "Save manuscript"}
                  </button>
                  <button
                    className={smallButtonClassName}
                    data-testid="manuscript-snapshot-load-latest"
                    disabled={isServerSnapshotBusy || isServerSnapshotUnavailable}
                    type="button"
                    onClick={() => void loadLatestServerSnapshot()}
                  >
                    {selectedServerManuscript
                      ? "Load latest manuscript"
                      : "Load latest"}
                  </button>
                  <button
                    className={smallButtonClassName}
                    disabled={isServerSnapshotBusy}
                    type="button"
                    onClick={() => void refreshServerSnapshots()}
                  >
                    Refresh
                  </button>
                  <button
                    className={smallButtonClassName}
                    data-testid="manuscript-snapshot-copy-live-latest-link"
                    type="button"
                    onClick={() => void copyLiveLatestSnapshotLink()}
                  >
                    Copy phone link
                  </button>
                </div>
                <div className="rounded-lg border border-studio-line bg-black/20 p-2.5">
                  <p className={labelClassName}>Latest phone link</p>
                  <p className="m-0 mt-1 break-all font-mono text-[0.72rem] text-studio-muted">
                    {MANUSCRIPT_LIVE_LATEST_PATH}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <ManuscriptHelpTip
                    note={getManuscriptHelpNote("save-snapshot")}
                  />
                  <ManuscriptHelpTip
                    note={getManuscriptHelpNote("load-latest-snapshot")}
                  />
                  <ManuscriptHelpTip
                    note={getManuscriptHelpNote("load-selected-snapshot")}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="grid gap-2">
                    <HelpLabel noteId="load-selected-snapshot">
                      Select server snapshot
                    </HelpLabel>
                    <select
                      className={fieldClassName}
                      disabled={!serverSnapshots.length || isServerSnapshotBusy}
                      value={selectedServerSnapshotId}
                      onChange={(event) =>
                        setSelectedServerSnapshotId(event.target.value)
                      }
                    >
                      <option value="">Select snapshot</option>
                      {serverSnapshots.map((snapshot) => (
                        <option key={snapshot.id} value={snapshot.id}>
                          {formatDateTime(snapshot.updatedAt)} - {snapshot.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className={smallButtonClassName}
                    disabled={
                      !selectedServerSnapshotId ||
                      isServerSnapshotBusy ||
                      isServerSnapshotUnavailable
                    }
                    type="button"
                    onClick={() => void loadSelectedServerSnapshot()}
                  >
                    Load selected snapshot
                  </button>
                </div>
                <p className="m-0 text-[0.76rem] leading-relaxed text-studio-muted">
                  {serverSnapshotStatus}
                </p>
                {serverSnapshots.length ? (
                  <div className="grid gap-2">
                    {serverSnapshots.slice(0, 5).map((snapshot) => (
                      <article
                        className={cn(
                          "grid gap-1 rounded-lg border border-studio-line bg-black/20 p-2.5",
                          selectedServerSnapshotId === snapshot.id &&
                            "border-studio-tag/55 bg-studio-tag/10",
                        )}
                        key={snapshot.id}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="m-0 text-[0.88rem] leading-snug text-studio-ink">
                            {snapshot.title}
                          </h4>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StudioChip tone="review">
                              {snapshot.snapshotType}
                            </StudioChip>
                            <span className="font-mono text-[0.68rem] text-studio-dim">
                              {formatDateTime(snapshot.updatedAt)}
                            </span>
                          </div>
                        </div>
                        <p className="m-0 text-[0.74rem] leading-relaxed text-studio-muted">
                          {snapshot.wordCount.toLocaleString()} words /{" "}
                          {snapshot.blockCount.toLocaleString()} blocks /{" "}
                          {snapshot.structureCount.toLocaleString()} structure
                          regions /{" "}
                          {snapshot.citedQuoteCount.toLocaleString()} cited
                          quotes
                        </p>
                        <p className="m-0 break-all font-mono text-[0.68rem] leading-relaxed text-studio-dim">
                          {snapshot.manuscriptId
                            ? `snapshot ${snapshot.id}`
                            : `legacy snapshot ${snapshot.id}`}
                        </p>
                        {snapshot.description ? (
                          <p className="m-0 text-[0.74rem] leading-relaxed text-studio-muted">
                            {snapshot.description}
                          </p>
                        ) : null}
                        <button
                          className={smallButtonClassName}
                          disabled={isServerSnapshotBusy}
                          type="button"
                          onClick={() => setSelectedServerSnapshotId(snapshot.id)}
                        >
                          Select snapshot
                        </button>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="flex items-center gap-1.5">
                  <button
                    className={cn(smallButtonClassName, "flex-1")}
                    type="button"
                    onClick={downloadFullDraftJson}
                  >
                    Download full draft JSON
                  </button>
                  <ManuscriptHelpTip
                    note={getManuscriptHelpNote("full-draft-json-backup")}
                  />
                </div>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={downloadEditorJson}
                >
                  Download editor JSON
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={downloadEditorHtml}
                >
                  Download HTML
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={downloadEditorPlainText}
                >
                  Download plain text
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={downloadStructureOutline}
                >
                  Download structure outline Markdown
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={downloadFilteredBlockList}
                >
                  Download filtered block Markdown
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={downloadCitedQuotations}
                >
                  Download cited quotations Markdown
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={exportEditorJson}
                >
                  Export editor JSON
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={exportFullDraft}
                >
                  Export full draft
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={exportEditorHtml}
                >
                  Export HTML
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={exportEditorPlainText}
                >
                  Export plain text
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={exportStructureOutline}
                >
                  Export structure outline Markdown
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={exportFilteredBlockList}
                >
                  Export filtered block Markdown
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={exportCitedQuotations}
                >
                  Export cited quotations Markdown
                </button>
              </div>
              <textarea
                className={cn(textareaClassName, "min-h-[150px] font-mono text-xs")}
                readOnly
                value={exportJson}
              />
              <textarea
                className={cn(textareaClassName, "min-h-[110px] font-mono text-xs")}
                readOnly
                value={exportHtml}
              />
              <textarea
                className={cn(textareaClassName, "min-h-[110px]")}
                readOnly
                value={exportPlainText}
              />
              <textarea
                className={cn(textareaClassName, "min-h-[130px] font-mono text-xs")}
                readOnly
                value={exportStructureMarkdown}
              />
              <textarea
                className={cn(textareaClassName, "min-h-[130px] font-mono text-xs")}
                readOnly
                value={exportFilteredMarkdown}
              />
              <textarea
                className={cn(textareaClassName, "min-h-[130px] font-mono text-xs")}
                readOnly
                value={exportCitedQuotationMarkdown}
              />
              <label className="grid gap-2">
                <span className={fieldLabelClassName}>Import JSON</span>
                <textarea
                  className={cn(textareaClassName, "min-h-[120px] font-mono text-xs")}
                  value={importJson}
                  onChange={(event) => setImportJson(event.target.value)}
                />
              </label>
              <button
                className={smallButtonClassName}
                type="button"
                onClick={importEditorJson}
              >
                Import editor JSON
              </button>
              <button
                className={dangerButtonClassName}
                type="button"
                onClick={clearLocalDraft}
              >
                Clear local draft
              </button>
            </section>
            ) : null}

            {isDevMode && sidePanelMode === "publish" ? (
              <section className={cn(cardClassName, "mt-3.5 grid gap-3 p-3.5")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <HelpHeading noteId="publish-mode">
                    Publish / handoff
                  </HelpHeading>
                  <StudioChip
                    tone={
                      publishReadinessReport.issues.some(
                        (issue) => issue.severity === "blocker",
                      )
                        ? "danger"
                        : publishReadinessReport.issues.some(
                              (issue) => issue.severity === "warning",
                            )
                          ? "review"
                          : "source"
                    }
                  >
                    {publishReadinessReport.issues.length.toLocaleString()} note
                    {publishReadinessReport.issues.length === 1 ? "" : "s"}
                  </StudioChip>
                </div>

                <div
                  className="grid gap-2 rounded-lg border border-studio-source/35 bg-studio-source/10 p-2.5"
                  data-testid="manuscript-real-readiness-panel"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <HelpLabel noteId="real-manuscript-readiness-gate">
                      Real manuscript readiness
                    </HelpLabel>
                    <StudioChip
                      tone={
                        realManuscriptReadinessGate.status === "ready"
                          ? "source"
                          : realManuscriptReadinessGate.status ===
                              "ready-after-phone-load"
                            ? "review"
                            : "danger"
                      }
                    >
                      {realManuscriptReadinessGate.statusLabel}
                    </StudioChip>
                  </div>
                  <p className="m-0 text-[0.78rem] leading-relaxed text-studio-muted">
                    Test the whole Manuscript Desk with fake material before the
                    real manuscript enters this browser.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={smallButtonClassName}
                      data-testid="manuscript-load-synthetic-smoke"
                      type="button"
                      onClick={loadSyntheticSmokeDraft}
                    >
                      Load synthetic smoke draft
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={downloadSyntheticSmokeDraftJson}
                    >
                      Download synthetic smoke draft JSON
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={generateSmokePublishingPacket}
                    >
                      Generate smoke publishing packet
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={generateSmokeRecordingHandoff}
                    >
                      Generate smoke recording handoff
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={generateSmokeQuoteAppendix}
                    >
                      Generate smoke quote appendix
                    </button>
                  </div>
                  <div className="grid gap-1.5 rounded-lg border border-studio-line bg-black/20 p-2">
                    <label className="flex items-start gap-2 text-[0.78rem] leading-snug text-studio-muted">
                      <input
                        checked={hasConfirmedSyntheticServerSnapshotSaved}
                        type="checkbox"
                        onChange={(event) =>
                          setHasConfirmedSyntheticServerSnapshotSaved(
                            event.target.checked,
                          )
                        }
                      />
                      I saved a synthetic server snapshot.
                    </label>
                    <label className="flex items-start gap-2 text-[0.78rem] leading-snug text-studio-muted">
                      <input
                        checked={hasConfirmedSyntheticPhoneLoad}
                        type="checkbox"
                        onChange={(event) =>
                          setHasConfirmedSyntheticPhoneLoad(
                            event.target.checked,
                          )
                        }
                      />
                      I loaded the synthetic snapshot on phone / second browser.
                    </label>
                    <label className="flex items-start gap-2 text-[0.78rem] leading-snug text-studio-muted">
                      <input
                        checked={hasConfirmedFullDraftJsonBackup}
                        type="checkbox"
                        onChange={(event) =>
                          setHasConfirmedFullDraftJsonBackup(
                            event.target.checked,
                          )
                        }
                      />
                      I downloaded a full draft JSON backup.
                    </label>
                  </div>
                  <div className="grid gap-1.5">
                    {realManuscriptReadinessGate.checklistItems.map((item) => (
                      <div
                        className="flex items-start justify-between gap-2 rounded-lg border border-studio-line bg-black/20 px-2 py-1.5"
                        key={item.id}
                      >
                        <div className="min-w-0">
                          <p className="m-0 text-[0.76rem] font-extrabold leading-snug text-studio-ink">
                            {item.label}
                          </p>
                          <p className="m-0 text-[0.7rem] leading-relaxed text-studio-muted">
                            {item.description}
                          </p>
                        </div>
                        <StudioChip tone={item.isComplete ? "source" : "default"}>
                          {item.isComplete ? "Done" : item.isManual ? "Confirm" : "Missing"}
                        </StudioChip>
                      </div>
                    ))}
                  </div>
                  {realManuscriptReadinessGate.warnings.length ? (
                    <div className="grid gap-1 rounded-lg border border-studio-review/35 bg-studio-review/10 p-2">
                      {realManuscriptReadinessGate.warnings.map((warning) => (
                        <p
                          className="m-0 text-[0.74rem] leading-relaxed text-studio-muted"
                          key={warning}
                        >
                          {warning}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ManuscriptHelpTip
                      note={getManuscriptHelpNote("synthetic-smoke-draft")}
                    />
                    <ManuscriptHelpTip
                      note={getManuscriptHelpNote("phone-load-smoke")}
                    />
                    <ManuscriptHelpTip
                      note={getManuscriptHelpNote("first-real-manuscript-import")}
                    />
                  </div>
                </div>

                <div className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5">
                  <HelpLabel noteId="publish-readiness-report">
                    Publish readiness summary
                  </HelpLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <StudioChip tone="tag">
                      {publishReadinessReport.stats.words.toLocaleString()} words
                    </StudioChip>
                    <StudioChip tone="source">
                      {publishReadinessReport.stats.blocks.toLocaleString()} blocks
                    </StudioChip>
                    <StudioChip tone="node">
                      {publishReadinessReport.structure.chapterRegions.toLocaleString()} chapters
                    </StudioChip>
                    <StudioChip tone="node">
                      {publishReadinessReport.structure.episodeRegions.toLocaleString()} episodes
                    </StudioChip>
                    <StudioChip tone="review">
                      {publishReadinessReport.quoteReview.total.toLocaleString()} quotes
                    </StudioChip>
                    <StudioChip
                      tone={
                        publishReadinessReport.structure.uncoveredBlocks
                          ? "review"
                          : "source"
                      }
                    >
                      {publishReadinessReport.structure.coveragePercent}% structured
                    </StudioChip>
                  </div>
                </div>

                <div className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5">
                  <p className={labelClassName}>Readiness issues</p>
                  {publishReadinessReport.issues.map((issue) => (
                    <article
                      className="grid gap-1 rounded-lg border border-studio-line bg-black/20 p-2"
                      key={issue.id}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="m-0 text-[0.84rem] leading-snug text-studio-ink">
                          {issue.title}
                        </h3>
                        <StudioChip tone={getReadinessIssueTone(issue.severity)}>
                          {issue.severity}
                        </StudioChip>
                      </div>
                      <p className="m-0 text-[0.76rem] leading-relaxed text-studio-muted">
                        {issue.detail}
                      </p>
                    </article>
                  ))}
                </div>

                <div className="grid gap-2 rounded-lg border border-studio-node/35 bg-studio-node/10 p-2.5">
                  <HelpLabel noteId="server-snapshot">
                    Snapshot caution
                  </HelpLabel>
                  <p className="m-0 text-[0.78rem] leading-relaxed text-studio-muted">
                    {publishReadinessReport.snapshotCaution}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <StudioChip tone="source">
                      Server {serverConnectionLabel}
                    </StudioChip>
                    <StudioChip
                      tone={
                        hasLocalChangesSinceServerSave
                          ? "review"
                          : hasLocalChangesSinceServerSave === false
                            ? "source"
                            : "default"
                      }
                    >
                      Local changes: {localChangesSinceServerSaveLabel}
                    </StudioChip>
                  </div>
                </div>

                <div className="grid gap-2 rounded-lg border border-studio-review/35 bg-studio-review/10 p-2.5">
                  <HelpLabel noteId="quote-review-appendix">
                    Quote review status
                  </HelpLabel>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    <StudioChip tone="review">
                      Needs source{" "}
                      {publishReadinessReport.quoteReview.needsSource.toLocaleString()}
                    </StudioChip>
                    <StudioChip tone="review">
                      Needs verification{" "}
                      {publishReadinessReport.quoteReview.needsVerification.toLocaleString()}
                    </StudioChip>
                    <StudioChip tone="tag">
                      Verified{" "}
                      {publishReadinessReport.quoteReview.verified.toLocaleString()}
                    </StudioChip>
                    <StudioChip tone="danger">
                      Do not use{" "}
                      {publishReadinessReport.quoteReview.doNotUse.toLocaleString()}
                    </StudioChip>
                    <StudioChip tone="source">
                      No metadata{" "}
                      {publishReadinessReport.quoteReview.noReviewMetadata.toLocaleString()}
                    </StudioChip>
                  </div>
                </div>

                <div className="grid gap-2 rounded-lg border border-studio-tag/35 bg-studio-tag/10 p-2.5">
                  <HelpLabel noteId="author-contribution-export">
                    Author metadata
                  </HelpLabel>
                  <div className="grid gap-1.5">
                    {publishReadinessReport.authors.map((author) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-studio-line bg-black/20 px-2 py-1.5"
                        key={author.authorId}
                      >
                        <span className="text-[0.76rem] font-extrabold text-studio-ink">
                          {author.label}
                        </span>
                        <span className="text-[0.72rem] text-studio-muted">
                          {author.spans.toLocaleString()} spans,{" "}
                          {author.words.toLocaleString()} words
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="m-0 text-[0.74rem] leading-relaxed text-studio-muted">
                    These marks are editorial handoff metadata, not legal
                    authorship truth.
                  </p>
                </div>

                {!isRecordingMode ? (
                  <>
                    <div
                      className="grid gap-2 rounded-lg border border-studio-source/35 bg-studio-source/10 p-2.5"
                      data-testid="hgo-projection-bridge-panel"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className={labelClassName}>HGO projection bridge</p>
                        <StudioChip tone="source">Browser only</StudioChip>
                      </div>
                      <div className="grid gap-1 text-[0.74rem] leading-relaxed text-studio-muted">
                        <p className="m-0">
                          This is a projection draft for staged review.
                        </p>
                        <p className="m-0">It is not a server publish.</p>
                        <p className="m-0">It is not a live HGO page.</p>
                        <p className="m-0">
                          It is not public-safe until reviewed.
                        </p>
                      </div>
                      <div className="grid gap-1.5 rounded-lg border border-studio-review/35 bg-studio-review/10 p-2">
                        {STUDIO_HGO_PROJECTION_BRIDGE_WARNING_COPY.map((warning) => (
                          <p
                            className="m-0 text-[0.74rem] leading-relaxed text-studio-muted"
                            key={warning}
                          >
                            {warning}
                          </p>
                        ))}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="grid gap-1">
                          <span className={fieldLabelClassName}>Status</span>
                          <select
                            className={fieldClassName}
                            data-testid="hgo-projection-status"
                            value={hgoProjectionStatus}
                            onChange={(event) =>
                              setHgoProjectionStatus(
                                event.target.value as StudioHgoProjectionStatus,
                              )
                            }
                          >
                            <option value="synthetic">Synthetic</option>
                            <option value="staged">Staged</option>
                          </select>
                        </label>
                        <label className="grid gap-1">
                          <span className={fieldLabelClassName}>Visibility</span>
                          <select
                            className={fieldClassName}
                            data-testid="hgo-projection-visibility"
                            value={hgoProjectionVisibility}
                            onChange={(event) =>
                              setHgoProjectionVisibility(
                                event.target.value as StudioHgoProjectionVisibility,
                              )
                            }
                          >
                            <option value="private">Private</option>
                            <option value="staged">Staged</option>
                          </select>
                        </label>
                      </div>
                      {hgoEpisodeRegionOptions.length > 0 ? (
                        <label className="grid gap-1">
                          <span className={fieldLabelClassName}>Episode region</span>
                          <select
                            className={fieldClassName}
                            data-testid="hgo-projection-episode-region"
                            value={activeHgoProjectionRegionId}
                            onChange={(event) =>
                              setSelectedHgoProjectionRegionId(event.target.value)
                            }
                          >
                            {hgoEpisodeRegionOptions.map((region) => (
                              <option key={region.id} value={region.id}>
                                {region.title}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <p className="m-0 rounded-lg border border-studio-review/35 bg-studio-review/10 p-2 text-[0.76rem] leading-relaxed text-studio-muted">
                          No Episode region exists yet. The bridge will generate a
                          whole-manuscript synthetic projection draft with a warning.
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          className={smallButtonClassName}
                          data-testid="hgo-projection-generate"
                          type="button"
                          onClick={generateHgoEpisodeProjection}
                        >
                          Generate HGO episode projection JSON
                        </button>
                        <button
                          className={smallButtonClassName}
                          data-testid="hgo-projection-download"
                          type="button"
                          onClick={downloadHgoEpisodeProjection}
                        >
                          Download HGO episode projection JSON
                        </button>
                      </div>
                      <textarea
                        className={cn(
                          textareaClassName,
                          "min-h-[150px] font-mono text-xs",
                        )}
                        data-testid="hgo-projection-json"
                        readOnly
                        value={exportHgoProjectionJson}
                      />
                    </div>

                    <div className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5">
                      <HelpLabel noteId="publishing-packet">
                        Publishing packet
                      </HelpLabel>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          className={smallButtonClassName}
                          type="button"
                          onClick={generatePublishingPacket}
                        >
                          Generate publishing packet Markdown
                        </button>
                        <button
                          className={smallButtonClassName}
                          type="button"
                          onClick={downloadPublishingPacket}
                        >
                          Download publishing packet Markdown
                        </button>
                      </div>
                      <textarea
                        className={cn(
                          textareaClassName,
                          "min-h-[150px] font-mono text-xs",
                        )}
                        readOnly
                        value={exportPublishingPacketMarkdown}
                      />
                    </div>

                    <div className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5">
                      <HelpLabel noteId="recording-handoff-packet">
                        Recording handoff
                      </HelpLabel>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          className={smallButtonClassName}
                          type="button"
                          onClick={generateRecordingHandoff}
                        >
                          Generate recording handoff Markdown
                        </button>
                        <button
                          className={smallButtonClassName}
                          type="button"
                          onClick={downloadRecordingHandoff}
                        >
                          Download recording handoff Markdown
                        </button>
                      </div>
                      <textarea
                        className={cn(
                          textareaClassName,
                          "min-h-[130px] font-mono text-xs",
                        )}
                        readOnly
                        value={exportRecordingHandoffMarkdown}
                      />
                    </div>

                    <div className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5">
                      <HelpLabel noteId="quote-review-appendix">
                        Quote appendix
                      </HelpLabel>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          className={smallButtonClassName}
                          type="button"
                          onClick={generateQuoteAppendix}
                        >
                          Generate quote appendix Markdown
                        </button>
                        <button
                          className={smallButtonClassName}
                          type="button"
                          onClick={downloadQuoteAppendix}
                        >
                          Download quote appendix Markdown
                        </button>
                      </div>
                      <textarea
                        className={cn(
                          textareaClassName,
                          "min-h-[130px] font-mono text-xs",
                        )}
                        readOnly
                        value={exportQuoteAppendixMarkdown}
                      />
                    </div>

                    <div className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5">
                      <HelpLabel noteId="author-contribution-export">
                        Author contribution
                      </HelpLabel>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          className={smallButtonClassName}
                          type="button"
                          onClick={generateAuthorContribution}
                        >
                          Generate author contribution Markdown
                        </button>
                        <button
                          className={smallButtonClassName}
                          type="button"
                          onClick={downloadAuthorContribution}
                        >
                          Download author contribution Markdown
                        </button>
                      </div>
                      <textarea
                        className={cn(
                          textareaClassName,
                          "min-h-[120px] font-mono text-xs",
                        )}
                        readOnly
                        value={exportAuthorContributionMarkdown}
                      />
                    </div>
                  </>
                ) : (
                  <p className="m-0 rounded-lg border border-studio-node/35 bg-studio-node/10 p-2 text-[0.78rem] leading-relaxed text-studio-muted">
                    Recording / Reading mode keeps export generation tucked away.
                    Exit Recording mode before generating handoff files.
                  </p>
                )}
              </section>
            ) : null}
            </div>

            <footer
              className="mt-3 grid shrink-0 gap-2 border-t border-studio-line pt-3"
              aria-label="Manuscript sidebar footer"
            >
              <label className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <HelpLabel noteId={getSidePanelModeHelpNoteId(sidePanelMode)}>
                    Work mode
                  </HelpLabel>
                  <ManuscriptHelpTip
                    note={getManuscriptHelpNote(
                      getSidePanelModeHelpNoteId(sidePanelMode),
                    )}
                  />
                </div>
                <select
                  className={fieldClassName}
                  data-testid="manuscript-mode-select"
                  value={sidePanelMode}
                  onChange={(event) =>
                    setSidePanelMode(event.target.value as ManuscriptSidePanelMode)
                  }
                >
                  {visibleWorkModeOptions.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  className={cn(
                    smallButtonClassName,
                    "border-studio-tag/60 bg-studio-tag/15 text-studio-tag",
                  )}
                  data-testid="manuscript-save-share-footer"
                  type="button"
                  onClick={() => setIsSaveShareDialogOpen(true)}
                >
                  Save/share
                </button>
                <button
                  className={cn(
                    smallButtonClassName,
                    "border-studio-source/55 bg-studio-source/10 text-studio-source disabled:border-studio-line disabled:bg-studio-ink/5 disabled:text-studio-dim",
                  )}
                  data-testid="manuscript-live-edit-footer"
                  disabled={isServerSnapshotBusy || isServerSnapshotUnavailable}
                  type="button"
                  onClick={() => void saveAndOpenLiveEdit()}
                >
                  Live edit
                </button>
                <button
                  className={cn(
                    smallButtonClassName,
                    isDevMode ? activeButtonClassName : "",
                  )}
                  type="button"
                  onClick={() => setIsDevMode((current) => !current)}
                >
                  {isDevMode ? "Hide Dev" : "Dev Mode"}
                </button>
              </div>
            </footer>
          </aside>
        </section>

        {isFilterMenuOpen ? (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={() => setIsFilterMenuOpen(false)}
          >
            <section
              className="grid max-h-[min(90dvh,760px)] w-full max-w-[680px] gap-3 overflow-auto rounded-lg border border-studio-line-strong bg-studio-panel p-4 shadow-[0_24px_80px_rgba(0,0,0,0.54)]"
              aria-label="Filter manuscript"
              aria-modal="true"
              data-testid="manuscript-filter-menu-dialog"
              role="dialog"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={labelClassName}>Manuscript</p>
                  <h2 className="m-0 text-[1.05rem] leading-snug text-studio-ink">
                    Filter
                  </h2>
                </div>
                <button
                  className={commandButtonClassName}
                  type="button"
                  onClick={() => setIsFilterMenuOpen(false)}
                >
                  Close
                </button>
              </div>
              {renderFilterMenuPanel()}
            </section>
          </div>
        ) : null}

        {isSaveShareDialogOpen ? (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={() => setIsSaveShareDialogOpen(false)}
          >
            <section
              className="grid max-h-[min(90dvh,720px)] w-full max-w-[560px] gap-3 overflow-auto rounded-lg border border-studio-line-strong bg-studio-panel p-4 shadow-[0_24px_80px_rgba(0,0,0,0.54)]"
              aria-label="Save and share manuscript"
              aria-modal="true"
              data-testid="manuscript-save-share-dialog"
              role="dialog"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={labelClassName}>Manuscript</p>
                  <h2 className="m-0 text-[1.05rem] leading-snug text-studio-ink">
                    Save and share
                  </h2>
                </div>
                <button
                  className={commandButtonClassName}
                  type="button"
                  onClick={() => setIsSaveShareDialogOpen(false)}
                >
                  Close
                </button>
              </div>
              {saveSharePanel}
            </section>
          </div>
        ) : null}

        <section
          className="fixed inset-x-0 bottom-0 z-40 border-t border-studio-line-strong bg-studio-panel/98 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-18px_54px_rgba(0,0,0,0.38)] backdrop-blur md:hidden"
          aria-label="Mobile manuscript tools"
        >
          {isMobileToolsOpen ? (
            <div className="mb-2 grid max-h-[70vh] gap-3 overflow-auto rounded-t-2xl border border-studio-line-strong bg-[#041f1e] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={labelClassName}>Mobile menu</p>
                  <h2 className="m-0 text-[1rem] leading-snug text-studio-ink">
                    Marking tools
                  </h2>
                </div>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={returnToManuscript}
                >
                  Back to manuscript
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    className={cn(
                      smallButtonClassName,
                      "flex-1",
                      isRecordingMode ? activeButtonClassName : "",
                    )}
                    type="button"
                    onClick={() => updateRecordingMode(!isRecordingMode)}
                  >
                    {isRecordingMode ? "Exit Recording" : "Recording mode"}
                  </button>
                  <ManuscriptHelpTip
                    note={getManuscriptHelpNote("recording-reading-mode")}
                  />
                </div>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() => {
                    applyHomerReadingFocus();
                    returnToManuscript();
                  }}
                >
                  Read Homer / Scott parts
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() => showRecordingOutline("episode")}
                >
                  Episode outline
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() => showRecordingOutline("chapter")}
                >
                  Chapter / book outline
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={toggleSelectedBlockAsChapterTitle}
                >
                  Mark chapter title
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() => {
                    applyQuoteFocus();
                    returnToManuscript();
                  }}
                >
                  Cited quotations
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() => {
                    showFullManuscriptForRecording();
                    returnToManuscript();
                  }}
                >
                  Full manuscript
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() => setShowAuthorColors((current) => !current)}
                >
                  {showAuthorColors ? "Hide author colors" : "Show author colors"}
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() => setShowSemanticColors((current) => !current)}
                >
                  {showSemanticColors
                    ? "Hide semantic colors"
                    : "Show semantic colors"}
                </button>
                <button
                  className={cn(
                    smallButtonClassName,
                    isDevMode ? activeButtonClassName : "",
                  )}
                  type="button"
                  onClick={() => setIsDevMode((current) => !current)}
                >
                  {isDevMode ? "Hide Dev Mode" : "Dev Mode"}
                </button>
              </div>
              <p className="m-0 text-[0.74rem] leading-relaxed text-studio-muted">
                {serverSnapshotStatus}
              </p>

              {hasStructureRailContent ? (
                <div
                  className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5"
                  data-testid="manuscript-mobile-structure-navigation"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="m-0 text-[0.95rem] leading-snug text-studio-ink">
                      Chapter / episode
                    </h3>
                    <StudioChip tone="node">Scroll synced</StudioChip>
                  </div>
                  <div className="grid gap-2">
                    {renderMobileStructureNavigationCard(
                      "chapter",
                      structureRailState.chapter,
                      structureRailState.nextChapter,
                    )}
                    {renderMobileStructureNavigationCard(
                      "episode",
                      structureRailState.episode,
                      structureRailState.nextEpisode,
                    )}
                  </div>
                </div>
              ) : null}

              {!isRecordingMode ? (
                <div className="grid gap-3 rounded-lg border border-studio-tag/35 bg-studio-tag/10 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <HelpLabel noteId="mark-mode">Write and mark</HelpLabel>
                    <StudioChip tone="source">
                      {getManuscriptAuthorDefinition(activeAuthorId).label}
                    </StudioChip>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {manuscriptAuthorDefinitions.map((author) => (
                      <button
                        className={cn(
                          smallButtonClassName,
                          "px-2 text-[0.74rem]",
                          activeAuthorId === author.id
                            ? activeButtonClassName
                            : "",
                        )}
                        key={author.id}
                        type="button"
                        onClick={() => markSelectionAsAuthor(author.id)}
                      >
                        {author.id === "homer"
                          ? "Homer"
                          : author.id === "charlie"
                            ? "Charlie"
                            : "Clear"}
                      </button>
                    ))}
                  </div>

                  <div className="grid gap-2">
                    <HelpLabel noteId="semantic-meaning-tags">
                      Semantic palette
                    </HelpLabel>
                    <div className="flex snap-x gap-2 overflow-x-auto pb-1">
                      {semanticHighlightDefinitions.map((definition) => (
                        <button
                          className={getSemanticControlClassName(
                            definition,
                            semanticType === definition.id,
                            cn(
                              smallButtonClassName,
                              "min-w-fit shrink-0 snap-start px-3",
                            ),
                          )}
                          key={definition.id}
                          type="button"
                          onClick={() => setSemanticType(definition.id)}
                        >
                          <SemanticTagLabel definition={definition} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="grid gap-1.5">
                    <span className={fieldLabelClassName}>Semantic note</span>
                    <textarea
                      className={cn(textareaClassName, "min-h-[68px]")}
                      value={semanticNote}
                      onChange={(event) => setSemanticNote(event.target.value)}
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className={fieldLabelClassName}>
                      Citation / source note
                    </span>
                    <textarea
                      className={cn(textareaClassName, "min-h-[68px]")}
                      value={citationNote}
                      onChange={(event) => setCitationNote(event.target.value)}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={applySemanticHighlight}
                    >
                      Apply semantic
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={() => markCitedQuotation()}
                    >
                      Mark cited quote
                    </button>
                    {quickSemanticHighlightTypes.map((tagType) => {
                      const definition = getSemanticHighlightDefinition(tagType);

                      return (
                        <button
                          className={getSemanticControlClassName(
                            definition,
                            semanticType === definition.id,
                          )}
                          key={definition.id}
                          type="button"
                          onClick={() =>
                            applySemanticHighlightForType(definition.id)
                          }
                        >
                          <SemanticTagLabel definition={definition} />
                        </button>
                      );
                    })}
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={() => applySemanticFocus(semanticType)}
                    >
                      Focus selected tag
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={() => applySemanticFocus()}
                    >
                      All semantic marks
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={() => clearSemanticHighlight()}
                    >
                      Clear semantic
                    </button>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      onClick={returnToManuscript}
                    >
                      Back to writing
                    </button>
                  </div>
                </div>
              ) : null}

              {isDevMode ? (
              <div className="grid gap-2 rounded-lg border border-studio-review/35 bg-studio-review/10 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <HelpLabel noteId="publish-mode">
                    Publish handoff
                  </HelpLabel>
                  <StudioChip
                    tone={
                      publishReadinessReport.issues.some(
                        (issue) => issue.severity === "blocker",
                      )
                        ? "danger"
                        : "review"
                    }
                  >
                    {publishReadinessReport.issues.length.toLocaleString()} notes
                  </StudioChip>
                </div>
                <p className="m-0 text-[0.74rem] leading-relaxed text-studio-muted">
                  {publishReadinessReport.snapshotCaution}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StudioChip
                    tone={
                      realManuscriptReadinessGate.status === "ready"
                        ? "source"
                        : realManuscriptReadinessGate.status ===
                            "ready-after-phone-load"
                          ? "review"
                          : "danger"
                    }
                  >
                    {realManuscriptReadinessGate.statusLabel}
                  </StudioChip>
                  <StudioChip
                    tone={
                      realManuscriptReadinessGate.isSyntheticSmokeDraftLoaded
                        ? "source"
                        : "default"
                    }
                  >
                    {realManuscriptReadinessGate.isSyntheticSmokeDraftLoaded
                      ? "Smoke loaded"
                      : "Smoke not loaded"}
                  </StudioChip>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={smallButtonClassName}
                    type="button"
                    onClick={loadSyntheticSmokeDraft}
                  >
                    Load smoke draft
                  </button>
                  <button
                    className={smallButtonClassName}
                    type="button"
                    onClick={downloadSyntheticSmokeDraftJson}
                  >
                    Smoke JSON
                  </button>
                  <button
                    className={smallButtonClassName}
                    type="button"
                    onClick={downloadPublishingPacket}
                  >
                    Publishing packet
                  </button>
                  <button
                    className={smallButtonClassName}
                    type="button"
                    onClick={downloadRecordingHandoff}
                  >
                    Recording handoff
                  </button>
                  <button
                    className={smallButtonClassName}
                    type="button"
                    onClick={downloadQuoteAppendix}
                  >
                    Quote appendix
                  </button>
                  <button
                    className={smallButtonClassName}
                    type="button"
                    onClick={downloadAuthorContribution}
                  >
                    Author summary
                  </button>
                </div>
              </div>
              ) : null}

              <div className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="m-0 text-[0.95rem] leading-snug text-studio-ink">
                    Outline
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    <StudioChip tone="node">
                      {recordingOutlineKind === "all"
                        ? "All structure"
                        : getManuscriptStructureDefinition(recordingOutlineKind)
                            .label}
                    </StudioChip>
                    <StudioChip tone="source">
                      {(recordingOutlineKind === "chapter" &&
                      derivedChapters.length
                        ? derivedChapters.length
                        : recordingOutlineRegions.length
                      ).toLocaleString()} items
                    </StudioChip>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      ["all", "All"],
                      ["chapter", "Chapters"],
                      ["episode", "Episodes"],
                      ["section", "Sections"],
                    ] as Array<[RecordingOutlineKind, string]>
                  ).map(([kind, label]) => (
                    <button
                      className={cn(
                        smallButtonClassName,
                        "px-1.5 text-[0.72rem]",
                        recordingOutlineKind === kind
                          ? activeButtonClassName
                          : "",
                      )}
                      key={kind}
                      type="button"
                      onClick={() => showRecordingOutline(kind)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="grid max-h-[32vh] gap-2 overflow-auto pr-1">
                  {recordingOutlineKind === "chapter" &&
                  derivedChapters.length ? (
                    derivedChapters.map((chapter, index) => (
                      <article
                        className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5"
                        key={chapter.id}
                      >
                        <div className="flex flex-wrap gap-1.5">
                          <StudioChip tone="node">
                            Chapter {index + 1}
                          </StudioChip>
                          <StudioChip tone="source">
                            {chapter.blockCount.toLocaleString()} blocks
                          </StudioChip>
                        </div>
                        <h4 className="m-0 text-[0.9rem] leading-snug text-studio-ink">
                          {chapter.title}
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            className={smallButtonClassName}
                            type="button"
                            onClick={() => {
                              focusDerivedChapter(chapter, "title");
                              returnToManuscript();
                            }}
                          >
                            Jump title
                          </button>
                          <button
                            className={smallButtonClassName}
                            type="button"
                            onClick={() => {
                              focusDerivedChapter(chapter, "end");
                              returnToManuscript();
                            }}
                          >
                            Jump end
                          </button>
                        </div>
                      </article>
                    ))
                  ) : recordingOutlineRegions.length ? (
                    recordingOutlineRegions.map((region) => (
                      <article
                        className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5"
                        key={region.id}
                      >
                        <div className="flex flex-wrap gap-1.5">
                          <StudioChip tone="node">
                            {getManuscriptStructureDefinition(region.kind).label}
                          </StudioChip>
                          <StudioChip tone="source">
                            {region.blockCount.toLocaleString()} blocks
                          </StudioChip>
                        </div>
                        <h4 className="m-0 text-[0.9rem] leading-snug text-studio-ink">
                          {region.title}
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            className={smallButtonClassName}
                            type="button"
                            onClick={() =>
                              focusBlockFromMobileTools(region.startBlockId)
                            }
                          >
                            Jump start
                          </button>
                          <button
                            className={smallButtonClassName}
                            type="button"
                            onClick={() =>
                              focusBlockFromMobileTools(region.endBlockId)
                            }
                          >
                            Jump end
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className={panelCopyClassName}>
                      No structure regions are available for this outline.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {hasStructureRailContent ? (
            <div
              className="mb-2 grid grid-cols-2 gap-2"
              data-testid="manuscript-mobile-structure-strip"
            >
              {renderMobileStructureStatusItem(
                "chapter",
                structureRailState.chapter,
                structureRailState.nextChapter,
              )}
              {renderMobileStructureStatusItem(
                "episode",
                structureRailState.episode,
                structureRailState.nextEpisode,
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <div
              className="min-w-0"
              data-testid="manuscript-mobile-footer-status"
            >
              <p className={cn(labelClassName, "truncate")}>
                Editor / Manuscript surface
              </p>
              <p className="m-0 truncate text-[0.72rem] leading-tight text-studio-muted">
                {isRecordingMode
                  ? "Recording view-only"
                  : blockFilterSummary.hasActiveFilters
                    ? `${filteredBlockDetails.length.toLocaleString()} matches visible`
                    : `${textStats.words.toLocaleString()} words / ${blockSummaries.length.toLocaleString()} blocks / ${structureRegions.length.toLocaleString()} structure`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                className={cn(
                  smallButtonClassName,
                  "border-studio-tag/60 bg-studio-tag/15 text-studio-tag",
                )}
                data-testid="manuscript-mobile-save-share"
                type="button"
                onClick={() => setIsSaveShareDialogOpen(true)}
              >
                Save
              </button>
              <button
                className={cn(
                  smallButtonClassName,
                  blockFilterSummary.hasActiveFilters
                    ? activeButtonClassName
                    : "",
                )}
                data-testid="manuscript-mobile-filter-menu"
                type="button"
                onClick={openFilterMenu}
              >
                Filter
              </button>
              <button
                className={cn(
                  smallButtonClassName,
                  isRecordingMode ? activeButtonClassName : "",
                )}
                type="button"
                onClick={() => updateRecordingMode(!isRecordingMode)}
              >
                {isRecordingMode ? "Exit" : "Read"}
              </button>
              <button
                className={cn(
                  smallButtonClassName,
                  "grid size-10 place-items-center px-0",
                  isMobileToolsOpen ? activeButtonClassName : "",
                )}
                data-testid="manuscript-mobile-tools-menu"
                type="button"
                aria-expanded={isMobileToolsOpen}
                aria-label={
                  isMobileToolsOpen
                    ? "Close marking tools"
                    : "Open marking tools"
                }
                title={
                  isMobileToolsOpen
                    ? "Close marking tools"
                    : "Open marking tools"
                }
                onClick={() => setIsMobileToolsOpen((current) => !current)}
              >
                <span className="grid gap-1" aria-hidden="true">
                  <span className="block h-0.5 w-4 rounded-full bg-current" />
                  <span className="block h-0.5 w-4 rounded-full bg-current" />
                  <span className="block h-0.5 w-4 rounded-full bg-current" />
                </span>
              </button>
            </div>
            </div>
          </section>

          {tagContextMenu ? (
            <div
              className="fixed z-50 grid w-[min(320px,calc(100vw-24px))] gap-2 rounded-lg border border-studio-tag/50 bg-[#032927]/98 p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-md"
              role="menu"
              aria-label="Tag selected manuscript text"
              style={{
                left: `${tagContextMenu.x}px`,
                top: `${tagContextMenu.y}px`,
              }}
              onContextMenu={(event) => event.preventDefault()}
              onMouseDown={(event) => event.preventDefault()}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={labelClassName}>Tag selection</p>
                <button
                  className={commandButtonClassName}
                  type="button"
                  aria-label="Close tagging menu"
                  onClick={() => setTagContextMenu(null)}
                >
                  Close
                </button>
              </div>

              <div className="grid gap-1.5">
                <span className={fieldLabelClassName}>Author</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {manuscriptAuthorDefinitions.map((author) => (
                    <button
                      className={cn(
                        commandButtonClassName,
                        activeAuthorId === author.id ? activeButtonClassName : "",
                      )}
                      key={author.id}
                      role="menuitem"
                      type="button"
                      onClick={() => markAuthorFromContextMenu(author.id)}
                    >
                      {author.id === "homer"
                        ? "Homer"
                        : author.id === "charlie"
                          ? "Charlie"
                          : "Clear"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-1.5">
                <span className={fieldLabelClassName}>Semantic</span>
                <div className="grid max-h-[220px] gap-1.5 overflow-auto pr-1">
                  {semanticHighlightDefinitions.map((definition) => (
                    <button
                      className={getSemanticControlClassName(
                        definition,
                        semanticType === definition.id,
                        cn(commandButtonClassName, "justify-start text-left"),
                      )}
                      key={definition.id}
                      role="menuitem"
                      type="button"
                      onClick={() =>
                        applySemanticHighlightFromContextMenu(definition.id)
                      }
                    >
                      <SemanticTagLabel definition={definition} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {quickSemanticHighlightTypes.map((tagType) => {
                  const definition = getSemanticHighlightDefinition(tagType);

                  return (
                    <button
                      className={getSemanticControlClassName(
                        definition,
                        semanticType === definition.id,
                        commandButtonClassName,
                      )}
                      key={definition.id}
                      role="menuitem"
                      type="button"
                      onClick={() =>
                        applySemanticHighlightFromContextMenu(definition.id)
                      }
                    >
                      <SemanticTagLabel definition={definition} />
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  className={commandButtonClassName}
                  role="menuitem"
                  type="button"
                  onClick={markCitedQuotationFromContextMenu}
                >
                  Cited quote
                </button>
                <button
                  className={commandButtonClassName}
                  role="menuitem"
                  type="button"
                  onClick={clearSemanticHighlightFromContextMenu}
                >
                  Clear semantic
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
  );
}
