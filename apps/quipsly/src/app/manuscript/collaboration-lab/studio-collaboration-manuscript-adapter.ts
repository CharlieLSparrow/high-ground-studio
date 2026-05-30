import {
  MANUSCRIPT_SCHEMA_VERSION,
  collectBlockSummaries,
  safeManuscriptDraft,
  type ManuscriptDraft,
  type ManuscriptEditorJson,
  type SemanticHighlightType,
} from "../manuscript-editor-model";
import {
  STUDIO_COLLABORATION_CHECKPOINT_VERSION,
  createCollaborationCheckpointFromSnapshot,
  summarizeCollaborationCheckpoint,
  validateCollaborationCheckpoint,
  type StudioCollaborationCheckpoint,
  type StudioCollaborationCheckpointSummary,
} from "./studio-collaboration-checkpoint-bridge";
import {
  STUDIO_COLLABORATION_LAB_VERSION,
  type StudioCollaborationLabBlock,
  type StudioCollaborationLabSnapshot,
} from "./studio-collaboration-lab-model";
import {
  validateSyntheticSpanTag,
  type StudioCollaborationSpanTag,
} from "./studio-collaboration-span-model";

export const STUDIO_COLLABORATION_MANUSCRIPT_ADAPTER_VERSION =
  "studio-collaboration-manuscript-adapter-v1";

export type StudioCollaborationManuscriptAdapterPayload = {
  adapterVersion: typeof STUDIO_COLLABORATION_MANUSCRIPT_ADAPTER_VERSION;
  source: "collaboration-checkpoint";
  createdAt: string;
  title: string;
  blocks: StudioCollaborationLabBlock[];
  spans: StudioCollaborationSpanTag[];
  syntheticDraft: ManuscriptDraft;
  checkpointSummary: StudioCollaborationCheckpointSummary;
  adaptedSubset: {
    fullProductionDraft: false;
    fields: string[];
    gaps: string[];
    ignoredSpanIds: string[];
  };
  safety: {
    syntheticDataOnly: true;
    serverWrites: false;
    localStorage: false;
    productionManuscriptEditing: false;
    autosave: false;
    productionSnapshot: false;
    productionImport: false;
  };
  warnings: string[];
};

export type StudioCollaborationManuscriptAdapterSummary = {
  adapterVersion: string;
  title: string;
  blockCount: number;
  draftBlockCount: number;
  tagCount: number;
  spanCount: number;
  semanticMarkCount: number;
  ignoredSpanCount: number;
  emptyBlockCount: number;
  createdAt: string;
  checkpointVersion: string;
  syntheticDataOnly: boolean;
  serverWrites: boolean;
  localStorage: boolean;
  productionManuscriptEditing: boolean;
  autosave: boolean;
  productionSnapshot: boolean;
  productionImport: boolean;
  fullProductionDraft: boolean;
  adaptedFields: string[];
  gaps: string[];
  warnings: string[];
};

export type StudioCollaborationManuscriptAdapterValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  payload: StudioCollaborationManuscriptAdapterPayload | null;
  summary: StudioCollaborationManuscriptAdapterSummary | null;
};

export type StudioCollaborationManuscriptAdapterComparison = {
  matches: boolean;
  blockCountMatches: boolean;
  textMatches: boolean;
  tagCountMatches: boolean;
  spanCountMatches: boolean;
  missingBlockIds: string[];
  details: string[];
};

const adapterWarnings = [
  "Synthetic adapter only.",
  "Not a production Manuscript Desk import.",
  "Does not write server state.",
  "Does not touch manual snapshots.",
  "Does not autosave.",
  "Future bridge toward real collaborative manuscript checkpoints.",
];

const adaptedFields = [
  "title",
  "ordered blocks",
  "block ids",
  "plain text",
  "synthetic collaboration tags",
  "addressable synthetic spans",
  "semanticHighlightMark ranges",
  "paragraph attrs collaborationTags metadata",
  "safe ManuscriptDraft envelope",
];

const adapterGaps = [
  "No real source file metadata.",
  "No importSummary.",
  "No structureRegions.",
  "No quoteReviews.",
  "No cited quotations.",
  "No production snapshot metadata.",
  "No server-side ownership metadata.",
  "Overlapping synthetic spans are ignored after the first non-overlapping span.",
];

const forbiddenAdapterMarkers = [
  "learning-to-lead.living",
  "real-manuscript-draft.docx",
  "apps/web/content",
  "apps/web/content/_inbox",
  "apps/web/content/_staging",
  "apps/web/content/publish",
  "localStorageData",
  "sessionStorageData",
  "cookie",
  "auth-storage-state",
  "access_token",
  "refresh_token",
  "id_token",
  "DATABASE_URL",
  "AUTH_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "ManuscriptBlock",
  "StoryDraft",
];

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneBlocks(blocks: StudioCollaborationLabBlock[]) {
  return blocks.map((block) => ({
    ...block,
    tags: block.tags.map((tag) => ({ ...tag })),
  }));
}

function cloneSpans(spans: StudioCollaborationSpanTag[] = []) {
  return spans.map((span) => ({ ...span }));
}

function mapActorToAuthorId(actor: string) {
  if (/^charlie$/i.test(actor.trim())) {
    return "charlie";
  }

  if (/^homer$/i.test(actor.trim()) || /^scott$/i.test(actor.trim())) {
    return "homer";
  }

  return "unassigned";
}

function createAuthorMark(actor: string) {
  const authorId = mapActorToAuthorId(actor);
  const authorLabel =
    authorId === "charlie"
      ? "Charlie"
      : authorId === "homer"
        ? "Homer / Scott"
        : "Unassigned";

  return {
    type: "authorMark",
    attrs: {
      authorId,
      authorLabel,
    },
  };
}

function createSyntheticTagMark(input: {
  spanId: string;
  label: string;
  actor: string;
  createdAt: string;
  note: string;
}) {
  const tagType: SemanticHighlightType = "insight";

  return {
    type: "semanticHighlightMark",
    attrs: {
      highlightId: input.spanId,
      tagType,
      label: input.label,
      colorKey: tagType,
      note: input.note || `Synthetic collaboration span from ${input.actor}.`,
      createdAt: input.createdAt,
    },
  };
}

function createMarkedTextNode(input: {
  text: string;
  actor: string;
  span?: StudioCollaborationSpanTag;
}): ManuscriptEditorJson {
  const marks: NonNullable<ManuscriptEditorJson["marks"]> = [
    createAuthorMark(input.actor),
  ];

  if (input.span) {
    marks.push(
      createSyntheticTagMark({
        spanId: input.span.spanId,
        label: input.span.label,
        actor: input.span.actor,
        createdAt: input.span.createdAt,
        note: input.span.note,
      }),
    );
  }

  return {
    type: "text",
    text: input.text,
    marks,
  };
}

function selectNonOverlappingSpans(input: {
  block: StudioCollaborationLabBlock;
  spans: StudioCollaborationSpanTag[];
}) {
  const usableSpans: StudioCollaborationSpanTag[] = [];
  const ignoredSpanIds: string[] = [];
  let cursor = 0;

  const sortedSpans = input.spans
    .filter((span) => span.blockId === input.block.id)
    .map((span) => {
      const validation = validateSyntheticSpanTag(input.block.text, span);

      if (!validation.ok || !validation.span) {
        ignoredSpanIds.push(span.spanId);
        return null;
      }

      return validation.span;
    })
    .filter((span): span is StudioCollaborationSpanTag => Boolean(span))
    .sort(
      (first, second) =>
        first.startOffset - second.startOffset ||
        first.endOffset - second.endOffset ||
        first.spanId.localeCompare(second.spanId),
    );

  for (const span of sortedSpans) {
    if (span.startOffset < cursor) {
      ignoredSpanIds.push(span.spanId);
      continue;
    }

    usableSpans.push(span);
    cursor = span.endOffset;
  }

  return {
    usableSpans,
    ignoredSpanIds,
  };
}

function createTextNodesForBlock(
  block: StudioCollaborationLabBlock,
  spans: StudioCollaborationSpanTag[],
): ManuscriptEditorJson[] | undefined {
  if (!block.text) {
    return undefined;
  }

  const { usableSpans } = selectNonOverlappingSpans({ block, spans });

  if (!usableSpans.length) {
    return [
      createMarkedTextNode({
        text: block.text,
        actor: block.updatedBy,
      }),
    ];
  }

  const nodes: ManuscriptEditorJson[] = [];
  let cursor = 0;

  for (const span of usableSpans) {
    if (span.startOffset > cursor) {
      nodes.push(
        createMarkedTextNode({
          text: block.text.slice(cursor, span.startOffset),
          actor: block.updatedBy,
        }),
      );
    }

    nodes.push(
      createMarkedTextNode({
        text: block.text.slice(span.startOffset, span.endOffset),
        actor: block.updatedBy,
        span,
      }),
    );
    cursor = span.endOffset;
  }

  if (cursor < block.text.length) {
    nodes.push(
      createMarkedTextNode({
        text: block.text.slice(cursor),
        actor: block.updatedBy,
      }),
    );
  }

  return nodes;
}

function createSyntheticDraftFromBlocks(input: {
  title: string;
  blocks: StudioCollaborationLabBlock[];
  spans: StudioCollaborationSpanTag[];
  createdAt: string;
}): ManuscriptDraft {
  const editorJson: ManuscriptEditorJson = {
    type: "doc",
    content: input.blocks.map((block) => ({
      type: "paragraph",
      attrs: {
        blockId: block.id,
        collaborationTags: block.tags.map((tag) => ({ ...tag })),
        collaborationSpans: input.spans
          .filter((span) => span.blockId === block.id)
          .map((span) => ({ ...span })),
        collaborationUpdatedBy: block.updatedBy,
        collaborationUpdatedAt: block.updatedAt,
      },
      content: createTextNodesForBlock(block, input.spans),
    })),
  };

  return {
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    title: input.title,
    sourceFileName: null,
    importSummary: null,
    structureRegions: [],
    structureBoundaryMarkers: [],
    chapterTitleBlocks: [],
    quoteReviews: {},
    editorJson,
    activeAuthorId: "charlie",
    showAuthorColors: true,
    showSemanticColors: true,
    lastUpdatedAt: input.createdAt,
  };
}

function countTags(blocks: StudioCollaborationLabBlock[]) {
  return blocks.reduce((count, block) => count + block.tags.length, 0);
}

function countSemanticMarks(json: ManuscriptEditorJson) {
  let count = 0;

  function visit(node: ManuscriptEditorJson) {
    if (node.marks?.some((mark) => mark.type === "semanticHighlightMark")) {
      count += 1;
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        visit(child);
      }
    }
  }

  visit(json);
  return count;
}

function collectIgnoredSpanIds(input: {
  blocks: StudioCollaborationLabBlock[];
  spans: StudioCollaborationSpanTag[];
}) {
  return input.blocks.flatMap(
    (block) =>
      selectNonOverlappingSpans({
        block,
        spans: input.spans,
      }).ignoredSpanIds,
  );
}

function validateBlocks(value: unknown, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push("Adapter blocks must be an array.");
    return [];
  }

  return value.flatMap((block, index) => {
    if (!isRecord(block)) {
      errors.push(`Adapter block ${index + 1} must be an object.`);
      return [];
    }

    if (typeof block.id !== "string" || !block.id.trim()) {
      errors.push(`Adapter block ${index + 1} is missing an id.`);
    }

    if (typeof block.text !== "string") {
      errors.push(`Adapter block ${index + 1} text must be a string.`);
    }

    if (!Array.isArray(block.tags)) {
      errors.push(`Adapter block ${index + 1} tags must be an array.`);
    }

    return [block as unknown as StudioCollaborationLabBlock];
  });
}

function validateSpans(value: unknown, errors: string[]) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    errors.push("Adapter spans must be an array.");
    return [];
  }

  return value.flatMap((span, index) => {
    if (!isRecord(span)) {
      errors.push(`Adapter span ${index + 1} must be an object.`);
      return [];
    }

    if (typeof span.spanId !== "string" || !span.spanId.trim()) {
      errors.push(`Adapter span ${index + 1} is missing a spanId.`);
    }

    if (typeof span.blockId !== "string" || !span.blockId.trim()) {
      errors.push(`Adapter span ${index + 1} is missing a blockId.`);
    }

    if (typeof span.label !== "string" || !span.label.trim()) {
      errors.push(`Adapter span ${index + 1} is missing a label.`);
    }

    return [span as unknown as StudioCollaborationSpanTag];
  });
}

export function summarizeSyntheticManuscriptDraftAdapterPayload(
  payload: StudioCollaborationManuscriptAdapterPayload,
): StudioCollaborationManuscriptAdapterSummary {
  return {
    adapterVersion: payload.adapterVersion,
    title: payload.title,
    blockCount: payload.blocks.length,
    draftBlockCount: collectBlockSummaries(payload.syntheticDraft.editorJson).length,
    tagCount: countTags(payload.blocks),
    spanCount: payload.spans.length,
    semanticMarkCount: countSemanticMarks(payload.syntheticDraft.editorJson),
    ignoredSpanCount: payload.adaptedSubset.ignoredSpanIds.length,
    emptyBlockCount: payload.blocks.filter((block) => !block.text.trim()).length,
    createdAt: payload.createdAt,
    checkpointVersion: payload.checkpointSummary.checkpointVersion,
    syntheticDataOnly: payload.safety.syntheticDataOnly,
    serverWrites: payload.safety.serverWrites,
    localStorage: payload.safety.localStorage,
    productionManuscriptEditing: payload.safety.productionManuscriptEditing,
    autosave: payload.safety.autosave,
    productionSnapshot: payload.safety.productionSnapshot,
    productionImport: payload.safety.productionImport,
    fullProductionDraft: payload.adaptedSubset.fullProductionDraft,
    adaptedFields: [...payload.adaptedSubset.fields],
    gaps: [...payload.adaptedSubset.gaps],
    warnings: [...payload.warnings],
  };
}

export function createSyntheticManuscriptDraftFromCollaborationCheckpoint(
  checkpoint: StudioCollaborationCheckpoint,
): StudioCollaborationManuscriptAdapterPayload {
  const validation = validateCollaborationCheckpoint(checkpoint);

  if (!validation.ok || !validation.checkpoint || !validation.summary) {
    throw new Error(
      `Collaboration checkpoint is not valid for manuscript adapter: ${validation.errors.join(" ")}`,
    );
  }

  const createdAt = nowIso();
  const blocks = cloneBlocks(validation.checkpoint.blocks);
  const spans = cloneSpans(validation.checkpoint.spans ?? []);
  const ignoredSpanIds = collectIgnoredSpanIds({ blocks, spans });
  const syntheticDraft = createSyntheticDraftFromBlocks({
    title: validation.checkpoint.title,
    blocks,
    spans,
    createdAt,
  });

  return {
    adapterVersion: STUDIO_COLLABORATION_MANUSCRIPT_ADAPTER_VERSION,
    source: "collaboration-checkpoint",
    createdAt,
    title: validation.checkpoint.title,
    blocks,
    spans,
    syntheticDraft,
    checkpointSummary: summarizeCollaborationCheckpoint(validation.checkpoint),
    adaptedSubset: {
      fullProductionDraft: false,
      fields: [...adaptedFields],
      gaps: [...adapterGaps],
      ignoredSpanIds,
    },
    safety: {
      syntheticDataOnly: true,
      serverWrites: false,
      localStorage: false,
      productionManuscriptEditing: false,
      autosave: false,
      productionSnapshot: false,
      productionImport: false,
    },
    warnings: [
      ...adapterWarnings,
      ...(ignoredSpanIds.length
        ? [`Ignored overlapping or invalid synthetic spans: ${ignoredSpanIds.join(", ")}.`]
        : []),
    ],
  };
}

export function validateSyntheticManuscriptDraftAdapterPayload(
  input: unknown,
): StudioCollaborationManuscriptAdapterValidation {
  const errors: string[] = [];
  const warnings = [...adapterWarnings];

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ["Adapter payload must be an object."],
      warnings,
      payload: null,
      summary: null,
    };
  }

  if (input.adapterVersion !== STUDIO_COLLABORATION_MANUSCRIPT_ADAPTER_VERSION) {
    errors.push(
      `Adapter version must be ${STUDIO_COLLABORATION_MANUSCRIPT_ADAPTER_VERSION}.`,
    );
  }

  if (input.source !== "collaboration-checkpoint") {
    errors.push("Adapter source must be collaboration-checkpoint.");
  }

  if (typeof input.createdAt !== "string" || !input.createdAt.trim()) {
    errors.push("Adapter createdAt is required.");
  }

  if (typeof input.title !== "string" || !input.title.trim()) {
    errors.push("Adapter title is required.");
  }

  const blocks = validateBlocks(input.blocks, errors);
  const spans = validateSpans(input.spans, errors);
  const syntheticDraft = safeManuscriptDraft(input.syntheticDraft);

  if (!syntheticDraft) {
    errors.push("Adapter syntheticDraft must be a valid ManuscriptDraft.");
  }

  const checkpointSummary = isRecord(input.checkpointSummary)
    ? input.checkpointSummary
    : null;

  if (!checkpointSummary) {
    errors.push("Adapter checkpointSummary is required.");
  } else if (
    checkpointSummary.checkpointVersion !== STUDIO_COLLABORATION_CHECKPOINT_VERSION
  ) {
    errors.push(
      `Adapter checkpointSummary.checkpointVersion must be ${STUDIO_COLLABORATION_CHECKPOINT_VERSION}.`,
    );
  }

  const adaptedSubset = isRecord(input.adaptedSubset)
    ? input.adaptedSubset
    : null;

  if (!adaptedSubset) {
    errors.push("Adapter adaptedSubset is required.");
  } else {
    if (adaptedSubset.fullProductionDraft !== false) {
      errors.push("Adapter adaptedSubset.fullProductionDraft must be false.");
    }

    if (!Array.isArray(adaptedSubset.fields)) {
      errors.push("Adapter adaptedSubset.fields must be an array.");
    }

    if (!Array.isArray(adaptedSubset.gaps)) {
      errors.push("Adapter adaptedSubset.gaps must be an array.");
    }

    if (!Array.isArray(adaptedSubset.ignoredSpanIds)) {
      errors.push("Adapter adaptedSubset.ignoredSpanIds must be an array.");
    }
  }

  const safety = isRecord(input.safety) ? input.safety : null;

  if (!safety) {
    errors.push("Adapter safety flags are required.");
  } else {
    if (safety.syntheticDataOnly !== true) {
      errors.push("Adapter safety.syntheticDataOnly must be true.");
    }

    for (const key of [
      "serverWrites",
      "localStorage",
      "productionManuscriptEditing",
      "autosave",
      "productionSnapshot",
      "productionImport",
    ] as const) {
      if (safety[key] !== false) {
        errors.push(`Adapter safety.${key} must be false.`);
      }
    }
  }

  if (!Array.isArray(input.warnings)) {
    errors.push("Adapter warnings must be an array.");
  }

  if (syntheticDraft && syntheticDraft.title !== input.title) {
    errors.push("Adapter title must match syntheticDraft.title.");
  }

  if (
    syntheticDraft &&
    collectBlockSummaries(syntheticDraft.editorJson).length !== blocks.length
  ) {
    errors.push("Adapter syntheticDraft block count must match adapter blocks.");
  }

  if (syntheticDraft && countSemanticMarks(syntheticDraft.editorJson) > spans.length) {
    errors.push(
      "Adapter syntheticDraft cannot contain more semantic marks than adapter spans.",
    );
  }

  const serialized = JSON.stringify(input);
  const foundMarkers = forbiddenAdapterMarkers.filter((marker) =>
    serialized.includes(marker),
  );

  if (foundMarkers.length) {
    errors.push(
      `Adapter contains forbidden real-content or secret markers: ${foundMarkers.join(", ")}.`,
    );
  }

  const payload =
    errors.length === 0
      ? (input as unknown as StudioCollaborationManuscriptAdapterPayload)
      : null;
  const summary = payload
    ? summarizeSyntheticManuscriptDraftAdapterPayload(payload)
    : null;

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    payload,
    summary,
  };
}

export function createCollaborationCheckpointFromSyntheticManuscriptDraft(
  payload: StudioCollaborationManuscriptAdapterPayload,
) {
  const validation = validateSyntheticManuscriptDraftAdapterPayload(payload);

  if (!validation.ok || !validation.payload) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings,
      checkpoint: null,
      summary: null,
    };
  }

  const snapshot: StudioCollaborationLabSnapshot = {
    schemaVersion: STUDIO_COLLABORATION_LAB_VERSION,
    exportedAt: validation.payload.createdAt,
    title: validation.payload.title,
    blocks: cloneBlocks(validation.payload.blocks),
    spans: cloneSpans(validation.payload.spans),
    safety: {
      syntheticDataOnly: true,
      serverWrites: false,
      localStorage: false,
      productionManuscriptEditing: false,
      autosave: false,
    },
  };
  const checkpoint = createCollaborationCheckpointFromSnapshot(snapshot);
  const checkpointValidation = validateCollaborationCheckpoint(checkpoint);

  return {
    ok: checkpointValidation.ok,
    errors: checkpointValidation.errors,
    warnings: [...validation.warnings, ...checkpointValidation.warnings],
    checkpoint: checkpointValidation.checkpoint,
    summary: checkpointValidation.summary,
  };
}

export function compareCollaborationCheckpointToManuscriptDraft(
  checkpoint: StudioCollaborationCheckpoint,
  draft: StudioCollaborationManuscriptAdapterPayload,
): StudioCollaborationManuscriptAdapterComparison {
  const checkpointValidation = validateCollaborationCheckpoint(checkpoint);
  const draftValidation = validateSyntheticManuscriptDraftAdapterPayload(draft);
  const details: string[] = [];

  if (!checkpointValidation.ok || !checkpointValidation.checkpoint) {
    return {
      matches: false,
      blockCountMatches: false,
      textMatches: false,
      tagCountMatches: false,
      spanCountMatches: false,
      missingBlockIds: [],
      details: checkpointValidation.errors,
    };
  }

  if (!draftValidation.ok || !draftValidation.payload) {
    return {
      matches: false,
      blockCountMatches: false,
      textMatches: false,
      tagCountMatches: false,
      spanCountMatches: false,
      missingBlockIds: [],
      details: draftValidation.errors,
    };
  }

  const draftBlocksById = new Map(
    draftValidation.payload.blocks.map((block) => [block.id, block]),
  );
  const missingBlockIds = checkpointValidation.checkpoint.blocks
    .filter((block) => !draftBlocksById.has(block.id))
    .map((block) => block.id);
  const blockCountMatches =
    checkpointValidation.checkpoint.blocks.length ===
    draftValidation.payload.blocks.length;
  const textMatches = checkpointValidation.checkpoint.blocks.every(
    (block) => draftBlocksById.get(block.id)?.text === block.text,
  );
  const tagCountMatches =
    countTags(checkpointValidation.checkpoint.blocks) ===
    countTags(draftValidation.payload.blocks);
  const spanCountMatches =
    (checkpointValidation.checkpoint.spans?.length ?? 0) ===
    draftValidation.payload.spans.length;

  if (!blockCountMatches) {
    details.push("Block counts differ.");
  }

  if (!textMatches) {
    details.push("Block text differs.");
  }

  if (!tagCountMatches) {
    details.push("Tag counts differ.");
  }

  if (!spanCountMatches) {
    details.push("Span counts differ.");
  }

  if (missingBlockIds.length) {
    details.push(`Missing blocks: ${missingBlockIds.join(", ")}.`);
  }

  return {
    matches:
      blockCountMatches &&
      textMatches &&
      tagCountMatches &&
      spanCountMatches &&
      missingBlockIds.length === 0,
    blockCountMatches,
    textMatches,
    tagCountMatches,
    spanCountMatches,
    missingBlockIds,
    details,
  };
}
