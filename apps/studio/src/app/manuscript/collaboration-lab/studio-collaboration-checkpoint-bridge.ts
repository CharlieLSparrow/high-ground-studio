import {
  createCollaborationClient,
  exportCollaborationSnapshot,
  summarizeCollaborationDocument,
  type StudioCollaborationClient,
  type StudioCollaborationLabBlock,
  type StudioCollaborationLabSnapshot,
  type StudioCollaborationSummary,
} from "./studio-collaboration-lab-model";
import type { StudioCollaborationSpanTag } from "./studio-collaboration-span-model";

export const STUDIO_COLLABORATION_CHECKPOINT_VERSION =
  "studio-collaboration-checkpoint-v1";

export type StudioCollaborationCheckpoint = {
  checkpointVersion: typeof STUDIO_COLLABORATION_CHECKPOINT_VERSION;
  createdAt: string;
  source: "collaboration-lab";
  title: string;
  blocks: StudioCollaborationLabBlock[];
  spans?: StudioCollaborationSpanTag[];
  safety: {
    syntheticDataOnly: true;
    serverWrites: false;
    localStorage: false;
    productionManuscriptEditing: false;
    autosave: false;
    productionSnapshot: false;
  };
  yjs: {
    stateVector: string;
    providerState: null;
  };
  warnings: string[];
};

export type StudioCollaborationCheckpointSummary = {
  checkpointVersion: string;
  title: string;
  blockCount: number;
  tagCount: number;
  spanCount: number;
  emptyBlockCount: number;
  createdAt: string;
  source: string;
  stateVector: string;
  syntheticDataOnly: boolean;
  serverWrites: boolean;
  localStorage: boolean;
  productionManuscriptEditing: boolean;
  autosave: boolean;
  productionSnapshot: boolean;
  warnings: string[];
};

export type StudioCollaborationCheckpointValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  checkpoint: StudioCollaborationCheckpoint | null;
  summary: StudioCollaborationCheckpointSummary | null;
};

const checkpointWarnings = [
  "Local lab only.",
  "Not a production manuscript snapshot.",
  "Not autosave.",
  "Manual checkpoint bridge only.",
];

const forbiddenCheckpointMarkers = [
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

function cloneBlocks(blocks: StudioCollaborationLabBlock[]) {
  return blocks.map((block) => ({
    ...block,
    tags: block.tags.map((tag) => ({ ...tag })),
  }));
}

function cloneSpans(spans: StudioCollaborationSpanTag[] = []) {
  return spans.map((span) => ({ ...span }));
}

function createCheckpointFromSnapshotAndSummary({
  snapshot,
  summary,
}: {
  snapshot: StudioCollaborationLabSnapshot;
  summary: Pick<StudioCollaborationSummary, "stateVector">;
}): StudioCollaborationCheckpoint {
  return {
    checkpointVersion: STUDIO_COLLABORATION_CHECKPOINT_VERSION,
    createdAt: nowIso(),
    source: "collaboration-lab",
    title: snapshot.title,
    blocks: cloneBlocks(snapshot.blocks),
    spans: cloneSpans(snapshot.spans ?? []),
    safety: {
      syntheticDataOnly: true,
      serverWrites: false,
      localStorage: false,
      productionManuscriptEditing: false,
      autosave: false,
      productionSnapshot: false,
    },
    yjs: {
      stateVector: summary.stateVector,
      providerState: null,
    },
    warnings: [...checkpointWarnings],
  };
}

export function createCollaborationCheckpointFromClient(
  client: StudioCollaborationClient,
) {
  return createCheckpointFromSnapshotAndSummary({
    snapshot: exportCollaborationSnapshot(client),
    summary: summarizeCollaborationDocument(client),
  });
}

export function createCollaborationCheckpointFromSnapshot(
  snapshot: StudioCollaborationLabSnapshot,
) {
  const client = createCollaborationClient("Synthetic checkpoint bridge", snapshot);

  return createCheckpointFromSnapshotAndSummary({
    snapshot,
    summary: summarizeCollaborationDocument(client),
  });
}

export function summarizeCollaborationCheckpoint(
  checkpoint: StudioCollaborationCheckpoint,
): StudioCollaborationCheckpointSummary {
  const tagCount = checkpoint.blocks.reduce(
    (count, block) => count + block.tags.length,
    0,
  );
  const spanCount = checkpoint.spans?.length ?? 0;

  return {
    checkpointVersion: checkpoint.checkpointVersion,
    title: checkpoint.title,
    blockCount: checkpoint.blocks.length,
    tagCount,
    spanCount,
    emptyBlockCount: checkpoint.blocks.filter((block) => !block.text.trim()).length,
    createdAt: checkpoint.createdAt,
    source: checkpoint.source,
    stateVector: checkpoint.yjs.stateVector,
    syntheticDataOnly: checkpoint.safety.syntheticDataOnly,
    serverWrites: checkpoint.safety.serverWrites,
    localStorage: checkpoint.safety.localStorage,
    productionManuscriptEditing: checkpoint.safety.productionManuscriptEditing,
    autosave: checkpoint.safety.autosave,
    productionSnapshot: checkpoint.safety.productionSnapshot,
    warnings: [...checkpoint.warnings],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validateBlocks(value: unknown, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push("Checkpoint blocks must be an array.");
    return [];
  }

  return value.flatMap((block, index) => {
    if (!isRecord(block)) {
      errors.push(`Checkpoint block ${index + 1} must be an object.`);
      return [];
    }

    if (typeof block.id !== "string" || !block.id.trim()) {
      errors.push(`Checkpoint block ${index + 1} is missing an id.`);
    }

    if (typeof block.text !== "string") {
      errors.push(`Checkpoint block ${index + 1} text must be a string.`);
    }

    if (!Array.isArray(block.tags)) {
      errors.push(`Checkpoint block ${index + 1} tags must be an array.`);
    }

    return [block as unknown as StudioCollaborationLabBlock];
  });
}

export function validateCollaborationCheckpoint(
  input: unknown,
): StudioCollaborationCheckpointValidation {
  const errors: string[] = [];
  const warnings = [...checkpointWarnings];

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ["Checkpoint must be an object."],
      warnings,
      checkpoint: null,
      summary: null,
    };
  }

  if (input.checkpointVersion !== STUDIO_COLLABORATION_CHECKPOINT_VERSION) {
    errors.push(
      `Checkpoint version must be ${STUDIO_COLLABORATION_CHECKPOINT_VERSION}.`,
    );
  }

  if (typeof input.createdAt !== "string" || !input.createdAt.trim()) {
    errors.push("Checkpoint createdAt is required.");
  }

  if (input.source !== "collaboration-lab") {
    errors.push("Checkpoint source must be collaboration-lab.");
  }

  if (typeof input.title !== "string" || !input.title.trim()) {
    errors.push("Checkpoint title is required.");
  }

  const blocks = validateBlocks(input.blocks, errors);
  if (input.spans !== undefined && !Array.isArray(input.spans)) {
    errors.push("Checkpoint spans must be an array when present.");
  }
  const safety = isRecord(input.safety) ? input.safety : null;
  const yjs = isRecord(input.yjs) ? input.yjs : null;

  if (!safety) {
    errors.push("Checkpoint safety flags are required.");
  } else {
    if (safety.syntheticDataOnly !== true) {
      errors.push("Checkpoint safety.syntheticDataOnly must be true.");
    }

    for (const key of [
      "serverWrites",
      "localStorage",
      "productionManuscriptEditing",
      "autosave",
      "productionSnapshot",
    ] as const) {
      if (safety[key] !== false) {
        errors.push(`Checkpoint safety.${key} must be false.`);
      }
    }
  }

  if (!yjs) {
    errors.push("Checkpoint yjs metadata is required.");
  } else {
    if (typeof yjs.stateVector !== "string" || !yjs.stateVector.trim()) {
      errors.push("Checkpoint yjs.stateVector is required.");
    }

    if (yjs.providerState !== null) {
      errors.push("Checkpoint yjs.providerState must be null.");
    }
  }

  if (!Array.isArray(input.warnings)) {
    errors.push("Checkpoint warnings must be an array.");
  }

  const serialized = JSON.stringify(input);
  const foundMarkers = forbiddenCheckpointMarkers.filter((marker) =>
    serialized.includes(marker),
  );

  if (foundMarkers.length) {
    errors.push(
      `Checkpoint contains forbidden real-content or secret markers: ${foundMarkers.join(", ")}.`,
    );
  }

  const checkpoint =
    errors.length === 0 ? (input as unknown as StudioCollaborationCheckpoint) : null;
  const summary = checkpoint ? summarizeCollaborationCheckpoint(checkpoint) : null;

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checkpoint,
    summary,
  };
}

export function importCollaborationCheckpointToClient(
  checkpoint: StudioCollaborationCheckpoint,
  clientName = "Imported checkpoint client",
) {
  const validation = validateCollaborationCheckpoint(checkpoint);

  if (!validation.ok || !validation.checkpoint) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings,
      client: null,
      summary: null,
    };
  }

  const snapshot: StudioCollaborationLabSnapshot = {
    schemaVersion: "studio-collaboration-lab-v1",
    exportedAt: validation.checkpoint.createdAt,
    title: validation.checkpoint.title,
    blocks: cloneBlocks(validation.checkpoint.blocks),
    spans: cloneSpans(validation.checkpoint.spans ?? []),
    safety: {
      syntheticDataOnly: true,
      serverWrites: false,
      localStorage: false,
      productionManuscriptEditing: false,
      autosave: false,
    },
  };
  const client = createCollaborationClient(clientName, snapshot);

  return {
    ok: true,
    errors: [],
    warnings: validation.warnings,
    client,
    summary: summarizeCollaborationDocument(client),
  };
}
