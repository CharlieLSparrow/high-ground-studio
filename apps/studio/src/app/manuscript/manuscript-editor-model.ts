export const MANUSCRIPT_STORAGE_KEY =
  "high-ground-studio.manuscript-editor.v1";

export const MANUSCRIPT_SCHEMA_VERSION = 1;

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
  editorJson: ManuscriptEditorJson;
  activeAuthorId: ManuscriptAuthorId;
  showAuthorColors: boolean;
  showSemanticColors: boolean;
  lastUpdatedAt: string | null;
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

export type ManuscriptStructureRegionSummary = ManuscriptStructureRegion & {
  startIndex: number;
  endIndex: number;
  blockCount: number;
  startPreview: string;
  endPreview: string;
  blockIds: string[];
  isRangeComplete: boolean;
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

export function isManuscriptStructureKind(
  value: string,
): value is ManuscriptStructureKind {
  return manuscriptStructureDefinitions.some((kind) => kind.id === value);
}

export function isManuscriptStructureLabelPreset(
  value: string,
): value is ManuscriptStructureLabelPreset {
  return manuscriptStructureLabelPresets.some((preset) => preset.id === value);
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
    semanticHighlightDefinitions[2]
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
    editorJson: createEmptyManuscriptDoc(),
    activeAuthorId: "homer",
    showAuthorColors: true,
    showSemanticColors: true,
    lastUpdatedAt: timestamp,
  };
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

export function createTextPreview(value: string, maxLength = 92) {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
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

  function getNodeText(node: ManuscriptEditorJson): string {
    if (typeof node.text === "string") {
      return node.text;
    }

    return Array.isArray(node.content)
      ? node.content.map((child) => getNodeText(child)).join(" ")
      : "";
  }

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

function createMarkdownText(value: string) {
  return value.trim().replace(/\s+/g, " ") || "Untitled region";
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
}) {
  return (
    input.title.trim() !== defaultTitle ||
    Boolean(input.sourceFileName) ||
    Boolean(input.importSummary) ||
    Boolean(input.structureRegions?.length) ||
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

  if (
    draft.schemaVersion !== MANUSCRIPT_SCHEMA_VERSION ||
    typeof draft.title !== "string" ||
    !validateEditorJsonShape(draft.editorJson) ||
    !structureRegions ||
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
    editorJson: draft.editorJson,
    activeAuthorId,
    showAuthorColors: draft.showAuthorColors,
    showSemanticColors: draft.showSemanticColors,
    lastUpdatedAt: draft.lastUpdatedAt,
  };
}
