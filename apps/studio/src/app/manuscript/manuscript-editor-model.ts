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

export const manuscriptBlockNodeTypes = [
  "paragraph",
  "heading",
  "listItem",
] as const;

export type ManuscriptAuthorId =
  (typeof manuscriptAuthorDefinitions)[number]["id"];

export type SemanticHighlightType =
  (typeof semanticHighlightDefinitions)[number]["id"];

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
}) {
  return (
    input.title.trim() !== defaultTitle ||
    Boolean(input.sourceFileName) ||
    Boolean(input.importSummary) ||
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

  if (
    draft.schemaVersion !== MANUSCRIPT_SCHEMA_VERSION ||
    typeof draft.title !== "string" ||
    !validateEditorJsonShape(draft.editorJson) ||
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
    editorJson: draft.editorJson,
    activeAuthorId,
    showAuthorColors: draft.showAuthorColors,
    showSemanticColors: draft.showSemanticColors,
    lastUpdatedAt: draft.lastUpdatedAt,
  };
}
