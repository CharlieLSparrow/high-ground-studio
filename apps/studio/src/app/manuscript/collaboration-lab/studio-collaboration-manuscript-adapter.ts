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

export const STUDIO_COLLABORATION_MANUSCRIPT_ADAPTER_VERSION =
  "studio-collaboration-manuscript-adapter-v1";

export type StudioCollaborationManuscriptAdapterPayload = {
  adapterVersion: typeof STUDIO_COLLABORATION_MANUSCRIPT_ADAPTER_VERSION;
  source: "collaboration-checkpoint";
  createdAt: string;
  title: string;
  blocks: StudioCollaborationLabBlock[];
  syntheticDraft: ManuscriptDraft;
  checkpointSummary: StudioCollaborationCheckpointSummary;
  adaptedSubset: {
    fullProductionDraft: false;
    fields: string[];
    gaps: string[];
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
  blockId: string;
  tagId: string;
  label: string;
  actor: string;
  createdAt: string;
}) {
  const tagType: SemanticHighlightType = "insight";

  return {
    type: "semanticHighlightMark",
    attrs: {
      highlightId: `collab-adapter-${input.blockId}-${input.tagId}`,
      tagType,
      label: input.label,
      colorKey: tagType,
      note: `Synthetic collaboration tag from ${input.actor}.`,
      createdAt: input.createdAt,
    },
  };
}

function createTextNodesForBlock(
  block: StudioCollaborationLabBlock,
): ManuscriptEditorJson[] | undefined {
  if (!block.text) {
    return undefined;
  }

  const marks: NonNullable<ManuscriptEditorJson["marks"]> = [
    createAuthorMark(block.updatedBy),
  ];
  const firstTag = block.tags[0];

  if (firstTag) {
    marks.push(
      createSyntheticTagMark({
        blockId: block.id,
        tagId: firstTag.id,
        label: firstTag.label,
        actor: String(firstTag.actor),
        createdAt: firstTag.createdAt,
      }),
    );
  }

  return [
    {
      type: "text",
      text: block.text,
      marks,
    },
  ];
}

function createSyntheticDraftFromBlocks(input: {
  title: string;
  blocks: StudioCollaborationLabBlock[];
  createdAt: string;
}): ManuscriptDraft {
  const editorJson: ManuscriptEditorJson = {
    type: "doc",
    content: input.blocks.map((block) => ({
      type: "paragraph",
      attrs: {
        blockId: block.id,
        collaborationTags: block.tags.map((tag) => ({ ...tag })),
        collaborationUpdatedBy: block.updatedBy,
        collaborationUpdatedAt: block.updatedAt,
      },
      content: createTextNodesForBlock(block),
    })),
  };

  return {
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    title: input.title,
    sourceFileName: null,
    importSummary: null,
    structureRegions: [],
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

export function summarizeSyntheticManuscriptDraftAdapterPayload(
  payload: StudioCollaborationManuscriptAdapterPayload,
): StudioCollaborationManuscriptAdapterSummary {
  return {
    adapterVersion: payload.adapterVersion,
    title: payload.title,
    blockCount: payload.blocks.length,
    draftBlockCount: collectBlockSummaries(payload.syntheticDraft.editorJson).length,
    tagCount: countTags(payload.blocks),
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
  const syntheticDraft = createSyntheticDraftFromBlocks({
    title: validation.checkpoint.title,
    blocks,
    createdAt,
  });

  return {
    adapterVersion: STUDIO_COLLABORATION_MANUSCRIPT_ADAPTER_VERSION,
    source: "collaboration-checkpoint",
    createdAt,
    title: validation.checkpoint.title,
    blocks,
    syntheticDraft,
    checkpointSummary: summarizeCollaborationCheckpoint(validation.checkpoint),
    adaptedSubset: {
      fullProductionDraft: false,
      fields: [...adaptedFields],
      gaps: [...adapterGaps],
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
    warnings: [...adapterWarnings],
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

  if (!blockCountMatches) {
    details.push("Block counts differ.");
  }

  if (!textMatches) {
    details.push("Block text differs.");
  }

  if (!tagCountMatches) {
    details.push("Tag counts differ.");
  }

  if (missingBlockIds.length) {
    details.push(`Missing blocks: ${missingBlockIds.join(", ")}.`);
  }

  return {
    matches:
      blockCountMatches &&
      textMatches &&
      tagCountMatches &&
      missingBlockIds.length === 0,
    blockCountMatches,
    textMatches,
    tagCountMatches,
    missingBlockIds,
    details,
  };
}
