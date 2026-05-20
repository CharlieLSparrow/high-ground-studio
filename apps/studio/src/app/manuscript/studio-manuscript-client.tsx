"use client";

import type { JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import mammoth from "mammoth";
import { useEffect, useMemo, useRef, useState } from "react";

import { StudioNav } from "../studio-nav";
import {
  cardClassName,
  cn,
  labelClassName,
  panelClassName,
  panelCopyClassName,
  panelTitleClassName,
  StudioChip,
  StudioGlyph,
} from "../studio-ui";
import { AuthorMark, SemanticHighlightMark } from "./manuscript-editor-marks";
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
  createEmptyManuscriptDoc,
  createFilteredBlockListMarkdown,
  createManuscriptImportSummary,
  createStructureRegionDefaultTitle,
  createStructureOutlineMarkdown,
  ensureManuscriptBlockIds,
  getManuscriptAuthorDefinition,
  getManuscriptQuoteReviewStatusDefinition,
  getManuscriptQuoteSourceTypeDefinition,
  getManuscriptStructureLabelPresetDefinition,
  getManuscriptStructureDefinition,
  getSemanticHighlightDefinition,
  hasMeaningfulManuscriptDraft,
  MANUSCRIPT_SCHEMA_VERSION,
  MANUSCRIPT_STORAGE_KEY,
  manuscriptAuthorDefinitions,
  manuscriptQuoteReviewStatusDefinitions,
  manuscriptQuoteSourceTypeDefinitions,
  manuscriptStructureDefinitions,
  manuscriptStructureLabelPresets,
  moveManuscriptStructureRegionWithinKind,
  removeManuscriptQuoteReview,
  semanticHighlightDefinitions,
  safeManuscriptDraft,
  filterManuscriptBlocks,
  suggestBookStructureRegionsFromHeadings,
  summarizeBlockFilterResults,
  summarizeAuthorMarkedSpans,
  updateManuscriptQuoteReview,
  updateManuscriptStructureRegion,
  validateEditorJsonShape,
  type ManuscriptAuthorId,
  type ManuscriptBlockFilterCriteria,
  type ManuscriptCitedQuotationSummary,
  type ManuscriptDraft,
  type ManuscriptEditorJson,
  type ManuscriptImportSummary,
  type ManuscriptQuoteReview,
  type ManuscriptQuoteReviewStatus,
  type ManuscriptQuoteSourceType,
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
};

type ManuscriptSidePanelMode = "structure" | "filters" | "export";

type ManuscriptFilterVisualMode = "highlight-matches" | "dim-nonmatches";

const fieldLabelClassName =
  "text-[0.78rem] font-extrabold uppercase text-studio-muted";

const fieldClassName =
  "min-h-10 w-full rounded-lg border border-studio-line-strong bg-[#0f1512] px-2.5 py-2 text-studio-ink disabled:text-studio-dim";

const textareaClassName =
  "w-full resize-y rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 py-2.5 text-[0.9rem] leading-6 text-studio-ink disabled:text-studio-dim";

const smallButtonClassName =
  "min-h-8 rounded-lg border border-studio-line bg-studio-ink/5 px-2.5 py-1.5 text-[0.78rem] font-extrabold text-studio-source disabled:text-studio-dim";

const activeButtonClassName =
  "border-studio-tag/55 bg-studio-tag/15 text-studio-tag";

const dangerButtonClassName =
  "min-h-8 rounded-lg border border-studio-danger/45 bg-studio-danger/10 px-2.5 py-1.5 text-[0.78rem] font-extrabold text-studio-danger";

const blockNodeTypes = ["paragraph", "heading", "listItem"];

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
  editor: NonNullable<ReturnType<typeof useEditor>>,
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
}: StudioManuscriptClientProps) {
  const skipNextPersistRef = useRef(false);
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
    useState<ManuscriptSidePanelMode>("structure");
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
  const [filterOnlyUnstructured, setFilterOnlyUnstructured] = useState(false);
  const [filterOnlyWithSemanticHighlights, setFilterOnlyWithSemanticHighlights] =
    useState(false);
  const [filterOnlyWithoutAuthor, setFilterOnlyWithoutAuthor] = useState(false);
  const [filterVisualMode, setFilterVisualMode] =
    useState<ManuscriptFilterVisualMode>("highlight-matches");
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
          "manuscript-prosemirror min-h-[560px] rounded-lg border border-studio-line-strong bg-[#0f1512] px-5 py-4 text-[1rem] leading-8 text-studio-ink outline-none",
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
          setTitle(parsed.title);
          setSourceFileName(parsed.sourceFileName);
          setImportSummary(parsed.importSummary);
          setStructureRegions(parsed.structureRegions);
          setQuoteReviews(parsed.quoteReviews);
          setActiveAuthorId(parsed.activeAuthorId);
          setShowAuthorColors(parsed.showAuthorColors);
          setShowSemanticColors(parsed.showSemanticColors);
          setLastUpdatedAt(parsed.lastUpdatedAt);
          setEditorJson(parsed.editorJson);
          editor.commands.setContent(parsed.editorJson as JSONContent);
          setMessage("Loaded browser-local Manuscript Desk draft.");
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
  const blockSummaries = useMemo(
    () => collectBlockSummaries(currentEditorJson),
    [currentEditorJson],
  );
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
  const citedQuotationMarkdown = useMemo(
    () => createCitedQuotationMarkdown({ quotations: citedQuotations }),
    [citedQuotations],
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
        quoteReviews,
        editorJson: currentEditorJson,
      }),
    [
      currentEditorJson,
      importSummary,
      quoteReviews,
      sourceFileName,
      structureRegions,
      title,
    ],
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    const updateSelectedRange = () => {
      setSelectedStructureRange(getEditorSelectionBlockRange(editor));
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
    if (!editor) {
      return;
    }

    const classNames = [
      "manuscript-structure-block",
      "manuscript-structure-chapter",
      "manuscript-structure-episode",
      "manuscript-structure-section",
      "manuscript-filter-match",
      "manuscript-filter-dim",
    ];

    editor.state.doc.descendants((node, pos) => {
      if (!blockNodeTypes.includes(node.type.name)) {
        return true;
      }

      const domNode = editor.view.nodeDOM(pos);

      if (domNode instanceof HTMLElement) {
        domNode.classList.remove(...classNames);
        domNode.removeAttribute("data-structure-regions");
      }

      return true;
    });

    const regionsByBlockId = new Map<string, ManuscriptStructureRegionSummary[]>();

    for (const region of structureRegionSummaries) {
      for (const blockId of region.blockIds) {
        const regions = regionsByBlockId.get(blockId) ?? [];
        regions.push(region);
        regionsByBlockId.set(blockId, regions);
      }
    }

    const matchingFilterBlockIds = new Set(
      filteredBlockDetails.flatMap((block) =>
        block.blockId ? [block.blockId] : [],
      ),
    );

    editor.state.doc.descendants((node, pos) => {
      if (!blockNodeTypes.includes(node.type.name)) {
        return true;
      }

      const blockId = node.attrs.blockId;

      if (typeof blockId !== "string") {
        return true;
      }

      const regions = regionsByBlockId.get(blockId);
      const domNode = editor.view.nodeDOM(pos);

      if (!(domNode instanceof HTMLElement)) {
        return true;
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

      if (blockFilterSummary.hasActiveFilters) {
        if (matchingFilterBlockIds.has(blockId)) {
          domNode.classList.add("manuscript-filter-match");
        } else if (filterVisualMode === "dim-nonmatches") {
          domNode.classList.add("manuscript-filter-dim");
        }
      }

      return true;
    });
  }, [
    blockFilterSummary.hasActiveFilters,
    editor,
    editorJson,
    filteredBlockDetails,
    filterVisualMode,
    structureRegionSummaries,
  ]);

  function confirmDraftReplacement(action: string) {
    if (!hasReplaceableDraft) {
      return true;
    }

    return window.confirm(
      `${action} will replace the current browser-local Manuscript Desk draft. Export a backup first if you need to keep it. Continue?`,
    );
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
    setFilterOnlyUnstructured(false);
    setFilterOnlyWithSemanticHighlights(false);
    setFilterOnlyWithoutAuthor(false);
    setExportFilteredMarkdown("");
    setMessage("Manuscript filters cleared.");
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

  function markSelectionAsAuthor(authorId: ManuscriptAuthorId) {
    if (!editor) {
      return;
    }

    if (authorId === "unassigned") {
      editor.chain().focus().unsetMark("authorMark").run();
      setActiveAuthorId("unassigned");
      setMessage("Author mark cleared from the current selection.");
      return;
    }

    editor.chain().focus().setMark("authorMark", getAuthorMarkAttrs(authorId)).run();
    setActiveAuthorId(authorId);
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
  }) {
    if (!editor) {
      return null;
    }

    const definition = getSemanticHighlightDefinition(input.tagType);
    const highlightId = input.highlightId ?? createHighlightId();
    const createdAt = input.createdAt ?? new Date().toISOString();

    editor
      .chain()
      .focus()
      .setMark("semanticHighlightMark", {
        highlightId,
        tagType: definition.id,
        label: definition.label,
        colorKey: definition.colorKey,
        note: input.note.trim(),
        createdAt,
      })
      .run();
    setMessage(input.message);
    return highlightId;
  }

  function applySemanticHighlight() {
    const definition = getSemanticHighlightDefinition(semanticType);

    if (
      !applySemanticHighlightToSelection({
        tagType: definition.id,
        note: semanticNote,
        message: `Applied ${definition.label} semantic highlight.`,
      })
    ) {
      return;
    }

    setSemanticNote("");
  }

  function markCitedQuotation() {
    const highlightId = createHighlightId();
    const updatedAt = new Date().toISOString();
    const appliedHighlightId = applySemanticHighlightToSelection({
      tagType: "cited-quotation",
      note: citationNote,
      highlightId,
      createdAt: updatedAt,
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

  function clearSemanticHighlight() {
    if (!editor) {
      return;
    }

    editor.chain().focus().unsetMark("semanticHighlightMark").run();
    setMessage("Semantic highlight cleared from the current selection.");
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
      setSourceFileName(file.name);
      setImportSummary(summary);
      setStructureRegions([]);
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
        setTitle(parsedDraft.title);
        setSourceFileName(parsedDraft.sourceFileName);
        setImportSummary(parsedDraft.importSummary);
        setStructureRegions(parsedDraft.structureRegions);
        setQuoteReviews(parsedDraft.quoteReviews);
        setEditingQuoteReviewHighlightId(null);
        setSelectedStructureRange(null);
        setActiveAuthorId(parsedDraft.activeAuthorId);
        setShowAuthorColors(parsedDraft.showAuthorColors);
        setShowSemanticColors(parsedDraft.showSemanticColors);
        setLastUpdatedAt(parsedDraft.lastUpdatedAt);
        editor.commands.setContent(parsedDraft.editorJson as JSONContent);
        setEditorJson(parsedDraft.editorJson);
        setPendingStructureStartBlockId(null);
        setPendingStructureEndBlockId(null);
        setExportStructureMarkdown("");
        setExportFilteredMarkdown("");
        setExportCitedQuotationMarkdown("");
        setImportJson("");
        setMessage("Full Manuscript Desk draft JSON imported.");
        return;
      }

      if (!validateEditorJsonShape(parsed)) {
        setMessage("Import JSON did not match editor JSON or draft shape.");
        return;
      }

      const jsonWithBlockIds = ensureBlockIds(parsed);
      editor.commands.setContent(jsonWithBlockIds as JSONContent);
      setEditorJson(jsonWithBlockIds);
      setSourceFileName(null);
      setImportSummary(null);
      setStructureRegions([]);
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
    setQuoteReviews({});
    setEditingQuoteReviewHighlightId(null);
    setSelectedStructureRange(null);
    setPendingStructureStartBlockId(null);
    setPendingStructureEndBlockId(null);
    setActiveAuthorId(emptyDraft.activeAuthorId);
    setShowAuthorColors(emptyDraft.showAuthorColors);
    setShowSemanticColors(emptyDraft.showSemanticColors);
    setLastUpdatedAt(null);
    setEditorJson(emptyDraft.editorJson);
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

  return (
    <main className="min-h-screen p-3.5 md:p-6">
      <div className="grid min-h-[calc(100vh-28px)] grid-rows-[auto_auto_1fr] gap-[18px] md:min-h-[calc(100vh-48px)]">
        <header
          className={cn(
            panelClassName,
            "flex min-h-[72px] flex-col items-stretch justify-between gap-[18px] px-[18px] py-4 lg:flex-row lg:items-center",
          )}
          aria-label="Manuscript Desk status"
        >
          <div className="flex min-w-0 flex-col items-stretch gap-3.5 sm:flex-row sm:items-center">
            <StudioGlyph />
            <div>
              <p className={labelClassName}>Studio Manuscript Desk</p>
              <h1 className="mt-1.5 mb-0 text-[1.75rem] leading-[1.08] tracking-normal text-studio-ink max-sm:text-[1.45rem]">
                Block-aware attribution
              </h1>
              <p className="mt-1.5 mb-0 max-w-[840px] text-[0.94rem] leading-relaxed text-studio-muted">
                Import a manuscript, edit block by block, and mark spans for
                authorship, meaning, chapters, and episodes.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
            <StudioNav />
            <StudioChip tone="tag">Studio access</StudioChip>
            <StudioChip className="normal-case" tone="source">
              {actor.primaryEmail}
            </StudioChip>
            <StudioChip tone="review">Browser-local draft</StudioChip>
            <StudioChip tone="source">No database writes</StudioChip>
          </div>
        </header>

        <section
          className={cn(panelClassName, "grid gap-3 px-4 py-3.5")}
          aria-label="Manuscript persistence status"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid gap-2">
              <p className={labelClassName}>Draft status</p>
              <p className="m-0 text-[0.92rem] leading-relaxed text-studio-muted">
                Saved locally in this browser. Not yet synced to Studio database.
                Export backups before serious edits or long writing sessions.
              </p>
              <p className="m-0 font-mono text-[0.76rem] leading-relaxed text-studio-muted">
                {MANUSCRIPT_STORAGE_KEY}
              </p>
              <p className="m-0 text-[0.84rem] leading-relaxed text-studio-muted">
                Active author:{" "}
                {getManuscriptAuthorDefinition(activeAuthorId).label}
                {" | "}Last saved: {formatDateTime(lastUpdatedAt)}
                {" | "}Structure regions: {structureRegions.length}
                {sourceFileName ? ` | Source: ${sourceFileName}` : ""}
              </p>
              {importSummary ? (
                <div className="mt-1 grid gap-1 rounded-lg border border-studio-tag/40 bg-studio-tag/10 p-3 text-[0.8rem] leading-relaxed text-studio-muted">
                  <p className="m-0 font-extrabold text-studio-tag">
                    Imported text is Homer / Scott. New writing should be
                    Charlie.
                  </p>
                  <p className="m-0">
                    {importSummary.sourceFileName} imported{" "}
                    {formatDateTime(importSummary.importedAt)} with{" "}
                    {importSummary.words.toLocaleString()} words,{" "}
                    {importSummary.characters.toLocaleString()} characters, and{" "}
                    {importSummary.blocks.toLocaleString()} blocks.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
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
                className={dangerButtonClassName}
                type="button"
                onClick={clearLocalDraft}
              >
                Clear local draft
              </button>
            </div>
          </div>
        </section>

        <section
          className="grid gap-[18px] xl:grid-cols-[minmax(310px,0.55fr)_minmax(520px,1fr)_minmax(340px,0.55fr)]"
          aria-label="Manuscript Desk workspace"
        >
          <aside className={panelClassName} aria-label="Import and toolbar">
            <div className="mb-3.5 flex items-start justify-between gap-3">
              <p className={labelClassName}>Import</p>
              <StudioChip tone="source">.docx to HTML</StudioChip>
            </div>

            <h2 className={panelTitleClassName}>Source document</h2>
            <p className={panelCopyClassName}>
              Import Word content into TipTap JSON. Imported text is marked
              Homer / Scott by default, then the active author switches to
              Charlie for new writing.
            </p>

            <div className="mt-4 grid gap-3">
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

              <button
                className={smallButtonClassName}
                type="button"
                onClick={markAllAsHomer}
              >
                Mark all as Homer / Scott
              </button>
              <p className="m-0 text-[0.78rem] leading-relaxed text-studio-muted">
                Importing a `.docx` replaces the current browser-local draft
                after confirmation. Download a backup before major edits.
              </p>
            </div>

            <div className="mt-6 grid gap-3">
              <p className={labelClassName}>Active author</p>
              <div className="grid gap-2">
                {manuscriptAuthorDefinitions.map((author) => (
                  <button
                    className={cn(
                      smallButtonClassName,
                      activeAuthorId === author.id ? activeButtonClassName : "",
                    )}
                    key={author.id}
                    type="button"
                    onClick={() => updateActiveAuthor(author.id)}
                  >
                    {author.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              <p className={labelClassName}>Toolbar</p>
              <div className="grid gap-2">
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() => markSelectionAsAuthor("charlie")}
                >
                  Mark selection as Charlie
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() => markSelectionAsAuthor("homer")}
                >
                  Mark selection as Homer / Scott
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() => markSelectionAsAuthor("unassigned")}
                >
                  Clear author mark
                </button>
              </div>

              <div className="grid gap-2">
                <label className="grid gap-2">
                  <span className={fieldLabelClassName}>Semantic tag</span>
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
                    className={cn(textareaClassName, "min-h-[84px]")}
                    value={semanticNote}
                    onChange={(event) => setSemanticNote(event.target.value)}
                  />
                </label>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={applySemanticHighlight}
                >
                  Apply semantic highlight
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={clearSemanticHighlight}
                >
                  Clear semantic highlight
                </button>
              </div>

              <div className="grid gap-2 rounded-lg border border-studio-review/35 bg-studio-review/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={labelClassName}>Cited quotation</p>
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
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={markCitedQuotation}
                >
                  Mark cited quotation
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() => {
                    setSidePanelMode("filters");
                    setFilterSemanticType("cited-quotation");
                  }}
                >
                  Show cited quotations
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={clearSemanticHighlight}
                >
                  Clear cited quotation / semantic
                </button>
              </div>

              <div className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={labelClassName}>Structure layer</p>
                  <StudioChip tone="node">
                    {selectedStructureRange
                      ? `${selectedStructureRange.blockCount.toLocaleString()} blocks`
                      : "No range"}
                  </StudioChip>
                </div>
                <label className="grid gap-2">
                  <span className={fieldLabelClassName}>Region kind</span>
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
                    <span className={fieldLabelClassName}>
                      Book label preset
                    </span>
                    <select
                      className={fieldClassName}
                      value={structureLabelPreset}
                      onChange={(event) =>
                        updateStructureLabelPreset(
                          event.target.value as ManuscriptStructureLabelPreset,
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
                  <span className={fieldLabelClassName}>Region title</span>
                  <input
                    className={fieldClassName}
                    placeholder={getDefaultStructureTitle(
                      structureKind,
                      structureLabelPreset,
                    )}
                    value={structureTitle}
                    onChange={(event) => setStructureTitle(event.target.value)}
                  />
                </label>
                <label className="grid gap-2">
                  <span className={fieldLabelClassName}>Structure notes</span>
                  <textarea
                    className={cn(textareaClassName, "min-h-[76px]")}
                    value={structureNotes}
                    onChange={(event) => setStructureNotes(event.target.value)}
                  />
                </label>
                {pendingStructureRange ? (
                  <div className="grid gap-2 rounded-lg border border-studio-node/40 bg-studio-node/10 p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={fieldLabelClassName}>
                        Pending structure range
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
                  onClick={suggestBookRegionsFromHeadings}
                >
                  Suggest book regions from headings
                </button>
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
            </div>

            <div
              className={cn(
                "mt-5 rounded-lg border border-studio-line p-3 text-[0.82rem] leading-relaxed text-studio-muted",
                statusTone === "tag" && "border-studio-tag/45 text-studio-tag",
                statusTone === "danger" &&
                  "border-studio-danger/50 text-studio-danger",
              )}
            >
              {message}
            </div>
          </aside>

          <section
            className={cn(
              panelClassName,
              "grid gap-3",
              !showAuthorColors && "manuscript-hide-author-colors",
              !showSemanticColors && "manuscript-hide-semantic-colors",
            )}
            aria-label="Editable manuscript"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className={labelClassName}>Editor</p>
                <h2 className={panelTitleClassName}>Manuscript surface</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <StudioChip tone="tag">
                  {textStats.words.toLocaleString()} words
                </StudioChip>
                <StudioChip tone="source">
                  {blockSummaries.length.toLocaleString()} blocks
                </StudioChip>
                <StudioChip tone="node">
                  {structureRegions.length.toLocaleString()} structure
                </StudioChip>
                {blockFilterSummary.hasActiveFilters ? (
                  <StudioChip tone="review">
                    {filteredBlockDetails.length.toLocaleString()} filter
                    matches
                  </StudioChip>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5">
              <p className={labelClassName}>Selection actions</p>
              <div className="flex flex-wrap gap-2">
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
                  onClick={applySemanticHighlight}
                >
                  Apply {getSemanticHighlightDefinition(semanticType).label}
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={markCitedQuotation}
                >
                  Mark cited quotation
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={clearSemanticHighlight}
                >
                  Clear cited quotation / semantic
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={captureStructureRange}
                >
                  Capture structure range
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={createStructureRegion}
                >
                  Add {getManuscriptStructureDefinition(structureKind).label}
                </button>
              </div>
            </div>

            <EditorContent editor={editor} />

            <p className="m-0 text-[0.78rem] leading-relaxed text-studio-muted">
              Paragraphs, headings, and list items carry `blockId` attributes in
              the editor JSON. Structure regions are block ranges. Author marks
              and semantic highlights are separate inline marks and can overlap.
            </p>
          </section>

          <aside className={panelClassName} aria-label="Block and highlight panel">
            <div className="mb-3.5 flex items-start justify-between gap-3">
              <p className={labelClassName}>Inspector</p>
              <StudioChip tone="node">
                {sidePanelMode === "structure"
                  ? "Structure"
                  : sidePanelMode === "filters"
                    ? "Filters"
                    : "Export"}
              </StudioChip>
            </div>

            <section className={cn(cardClassName, "grid gap-2 p-3.5")}>
              <h2 className="m-0 text-[1rem] leading-snug text-studio-ink">
                Author counts
              </h2>
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

            <section className={cn(cardClassName, "mt-3.5 grid gap-2 p-3.5")}>
              <h2 className="m-0 text-[1rem] leading-snug text-studio-ink">
                Side panel
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["structure", "Structure"],
                    ["filters", "Filters"],
                    ["export", "Export"],
                  ] as Array<[ManuscriptSidePanelMode, string]>
                ).map(([mode, label]) => (
                  <button
                    className={cn(
                      smallButtonClassName,
                      sidePanelMode === mode ? activeButtonClassName : "",
                    )}
                    key={mode}
                    type="button"
                    onClick={() => setSidePanelMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {sidePanelMode === "structure" ? (
              <>
                <section className={cn(cardClassName, "mt-3.5 grid gap-2 p-3.5")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 text-[1rem] leading-snug text-studio-ink">
                  Structure regions
                </h2>
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
                            <button
                              className={smallButtonClassName}
                              type="button"
                              disabled={!canMoveStructureRegion(region, "up")}
                              onClick={() => moveStructureRegion(region.id, "up")}
                            >
                              Move up
                            </button>
                            <button
                              className={smallButtonClassName}
                              type="button"
                              disabled={!canMoveStructureRegion(region, "down")}
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
                                  onClick={() => saveStructureRegion(region.id)}
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
                                onClick={() => beginEditingStructureRegion(region)}
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
                          </div>
                        </div>

                        {isEditing ? (
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
                          </div>
                          <span className="font-mono text-[0.68rem] leading-tight text-studio-dim">
                            {block.blockId ?? "missing blockId"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
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
              <h2 className="m-0 text-[1rem] leading-snug text-studio-ink">
                Semantic highlights
              </h2>
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

            {sidePanelMode === "filters" ? (
              <section className={cn(cardClassName, "mt-3.5 grid gap-3 p-3.5")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="m-0 text-[1rem] leading-snug text-studio-ink">
                    Filter lens
                  </h2>
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
                    <span className={fieldLabelClassName}>Author</span>
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
                    <span className={fieldLabelClassName}>Semantic tag</span>
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
                    <span className={fieldLabelClassName}>Structure region</span>
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
                      <option value="highlight-matches">Highlight matches</option>
                      <option value="dim-nonmatches">Dim nonmatches</option>
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
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={smallButtonClassName}
                    type="button"
                    onClick={() => setFilterSemanticType("cited-quotation")}
                  >
                    Show cited quotations
                  </button>
                  <button
                    className={smallButtonClassName}
                    type="button"
                    onClick={clearBlockFilters}
                  >
                    Clear filters
                  </button>
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
                </div>
                <div className="grid gap-2 rounded-lg border border-studio-review/35 bg-studio-review/10 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="m-0 text-[0.86rem] leading-snug text-studio-ink">
                      Cited quotations
                    </h3>
                    <StudioChip tone="review">
                      {citedQuotations.length.toLocaleString()}
                    </StudioChip>
                  </div>
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
                  <div className="grid max-h-[220px] gap-2 overflow-auto pr-1">
                    {citedQuotations.length ? (
                      citedQuotations.map((quotation, index) => {
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
                                  onClick={() => focusBlock(quotation.blockId)}
                                >
                                  Jump
                                </button>
                                {isEditing ? (
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
                                )}
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

                            {isEditing ? (
                              <div className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-2.5">
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <label className="grid gap-1.5">
                                    <span className={fieldLabelClassName}>
                                      Review status
                                    </span>
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
                        No cited quotations marked.
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

            {sidePanelMode === "export" ? (
              <section className={cn(cardClassName, "mt-3.5 grid gap-2 p-3.5")}>
              <h2 className="m-0 text-[1rem] leading-snug text-studio-ink">
                Export / backup
              </h2>
              <p className="m-0 text-[0.78rem] leading-relaxed text-studio-muted">
                Download backups before serious editing. Downloads are browser
                generated and do not write to the server or repo.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={downloadFullDraftJson}
                >
                  Download full draft JSON
                </button>
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
            </section>
            ) : null}
          </aside>
        </section>
      </div>
    </main>
  );
}
