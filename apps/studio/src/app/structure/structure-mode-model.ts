export const STORAGE_KEY = "high-ground-studio.structure-mode.v1";

export const sourceTypeOptions = [
  { id: "book", label: "Book" },
  { id: "article", label: "Article" },
  { id: "transcript", label: "Transcript" },
  { id: "ted_public_talk", label: "TED/public talk" },
  { id: "podcast", label: "Podcast" },
  { id: "notes", label: "Notes" },
  { id: "other", label: "Other" },
] as const;

export const semanticTypeOptions = [
  { id: "quote", label: "Quote" },
  { id: "story", label: "Story" },
  { id: "insight", label: "Insight" },
  { id: "research", label: "Research" },
  { id: "example", label: "Example" },
  { id: "thesis", label: "Thesis" },
  { id: "transition", label: "Transition" },
  { id: "question", label: "Question" },
  { id: "callback", label: "Callback" },
  { id: "opening_hook", label: "Opening hook" },
  { id: "closing_image", label: "Closing image" },
  { id: "ted_public_talk_beat", label: "TED/public-talk beat" },
  { id: "needs_review", label: "Needs review" },
] as const;

export const structureLanes = [
  { id: "opening", label: "Opening" },
  { id: "story", label: "Story" },
  { id: "principle", label: "Principle" },
  { id: "evidence", label: "Evidence" },
  { id: "application", label: "Application" },
  { id: "closing", label: "Closing" },
  { id: "parking_lot", label: "Parking Lot" },
] as const;

export type SourceType = (typeof sourceTypeOptions)[number]["id"];
export type SemanticType = (typeof semanticTypeOptions)[number]["id"];
export type LaneId = (typeof structureLanes)[number]["id"];

export const quickSemanticTypeOptions = [
  "quote",
  "story",
  "insight",
  "research",
  "question",
  "ted_public_talk_beat",
] as const satisfies readonly SemanticType[];

export const quickLaneOptions = [
  "opening",
  "story",
  "evidence",
  "application",
  "parking_lot",
] as const satisfies readonly LaneId[];

export type HighlightCard = {
  id: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  semanticType: SemanticType;
  note: string;
  sourceTitle: string;
  sourceType: SourceType;
  createdAt: string;
  laneId: LaneId;
};

export type StructureDraft = {
  sourceTitle: string;
  sourceType: SourceType;
  sourceText: string;
  cards: HighlightCard[];
};

export type SelectionState = {
  startOffset: number;
  endOffset: number;
  selectedText: string;
};

export const DEFAULT_SOURCE_TITLE = "Untitled pasted source";
export const DEFAULT_SOURCE_TYPE: SourceType = "notes";
export const DEFAULT_SEMANTIC_TYPE: SemanticType = "insight";
export const DEFAULT_LANE_ID: LaneId = "parking_lot";
export const DEFAULT_SELECTION: SelectionState = {
  startOffset: 0,
  endOffset: 0,
  selectedText: "",
};

export const STARTER_SAMPLE_TITLE = "Starter sample: one clear moment";
export const STARTER_SAMPLE_TYPE: SourceType = "notes";
export const STARTER_SAMPLE_TEXT =
  "A useful structure starts with one clear moment. The story gives the idea a body, the principle gives it a name, and the application gives the reader a next step.";

export const starterSampleCards = [
  {
    selectedText: "one clear moment",
    semanticType: "opening_hook",
    note: "This can become the first promise of the piece.",
    laneId: "opening",
  },
  {
    selectedText: "The story gives the idea a body",
    semanticType: "story",
    note: "Use a lived scene before naming the principle.",
    laneId: "story",
  },
  {
    selectedText: "the application gives the reader a next step",
    semanticType: "insight",
    note: "End with a concrete action instead of a summary.",
    laneId: "application",
  },
] as const satisfies readonly {
  selectedText: string;
  semanticType: SemanticType;
  note: string;
  laneId: LaneId;
}[];

export function isSourceType(value: string): value is SourceType {
  return sourceTypeOptions.some((option) => option.id === value);
}

export function isSemanticType(value: string): value is SemanticType {
  return semanticTypeOptions.some((option) => option.id === value);
}

export function isLaneId(value: string): value is LaneId {
  return structureLanes.some((lane) => lane.id === value);
}

export function getSemanticLabel(value: SemanticType) {
  return (
    semanticTypeOptions.find((option) => option.id === value)?.label ?? value
  );
}

export function getLaneLabel(value: LaneId) {
  return structureLanes.find((lane) => lane.id === value)?.label ?? value;
}

export function getSourceTypeLabel(value: SourceType) {
  return sourceTypeOptions.find((option) => option.id === value)?.label ?? value;
}

export function normalizeMarkdownText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function createStarterSampleCards(
  createId: () => string,
  createCreatedAt: () => string = () => new Date().toISOString(),
): HighlightCard[] {
  return starterSampleCards.map((card) => {
    const startOffset = STARTER_SAMPLE_TEXT.indexOf(card.selectedText);
    const safeStartOffset = startOffset >= 0 ? startOffset : 0;

    return {
      id: createId(),
      selectedText: card.selectedText,
      startOffset: safeStartOffset,
      endOffset: safeStartOffset + card.selectedText.length,
      semanticType: card.semanticType,
      note: card.note,
      sourceTitle: STARTER_SAMPLE_TITLE,
      sourceType: STARTER_SAMPLE_TYPE,
      createdAt: createCreatedAt(),
      laneId: card.laneId,
    };
  });
}

export function createStructureOutlineMarkdown(
  draft: Pick<StructureDraft, "sourceTitle" | "cards">,
) {
  const title = draft.sourceTitle.trim() || DEFAULT_SOURCE_TITLE;
  const lines = [`# Structure: ${title}`, ""];
  let hasCards = false;

  for (const lane of structureLanes) {
    const laneCards = draft.cards.filter((card) => card.laneId === lane.id);

    if (laneCards.length === 0) {
      continue;
    }

    hasCards = true;
    lines.push(`## ${lane.label}`, "");

    for (const card of laneCards) {
      lines.push(
        `- [${getSemanticLabel(card.semanticType)}] ${normalizeMarkdownText(card.selectedText)}`,
      );

      if (card.note.trim()) {
        lines.push(`  Note: ${normalizeMarkdownText(card.note)}`);
      }
    }

    lines.push("");
  }

  if (!hasCards) {
    lines.push("_No highlight cards yet._", "");
  }

  return lines.join("\n").trimEnd();
}

export function safeStructureDraft(value: unknown): StructureDraft | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const draft = value as Partial<StructureDraft>;
  const draftSourceType = String(draft.sourceType);

  if (
    typeof draft.sourceTitle !== "string" ||
    typeof draft.sourceText !== "string" ||
    !isSourceType(draftSourceType) ||
    !Array.isArray(draft.cards)
  ) {
    return null;
  }

  const cards = draft.cards.flatMap((cardValue) => {
    if (!cardValue || typeof cardValue !== "object") {
      return [];
    }

    const card = cardValue as Partial<HighlightCard>;
    const semanticType = String(card.semanticType);
    const sourceType = String(card.sourceType);
    const laneId = String(card.laneId);

    if (
      typeof card.id !== "string" ||
      typeof card.selectedText !== "string" ||
      typeof card.startOffset !== "number" ||
      typeof card.endOffset !== "number" ||
      typeof card.note !== "string" ||
      typeof card.sourceTitle !== "string" ||
      typeof card.createdAt !== "string" ||
      !isSemanticType(semanticType) ||
      !isSourceType(sourceType) ||
      !isLaneId(laneId)
    ) {
      return [];
    }

    return [
      {
        id: card.id,
        selectedText: card.selectedText,
        startOffset: card.startOffset,
        endOffset: card.endOffset,
        semanticType,
        note: card.note,
        sourceTitle: card.sourceTitle,
        sourceType,
        createdAt: card.createdAt,
        laneId,
      },
    ];
  });

  return {
    sourceTitle: draft.sourceTitle,
    sourceType: draftSourceType,
    sourceText: draft.sourceText,
    cards,
  };
}
