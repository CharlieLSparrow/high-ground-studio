import { Mark, mergeAttributes } from "@tiptap/core";

import {
  getManuscriptAuthorDefinition,
  getSemanticHighlightDefinition,
  isManuscriptAuthorId,
  isSemanticHighlightType,
  type ManuscriptAuthorId,
  type SemanticHighlightType,
} from "./manuscript-editor-model";

function getAuthorAttrs(authorId: unknown, authorLabel: unknown) {
  const normalizedAuthorId = String(authorId ?? "unassigned");
  const safeAuthorId: ManuscriptAuthorId = isManuscriptAuthorId(
    normalizedAuthorId,
  )
    ? normalizedAuthorId
    : "unassigned";
  const label =
    typeof authorLabel === "string" && authorLabel.trim()
      ? authorLabel
      : getManuscriptAuthorDefinition(safeAuthorId).label;

  return {
    authorId: safeAuthorId,
    authorLabel: label,
  };
}

function getSemanticAttrs(attrs: Record<string, unknown>) {
  const rawTagType = String(attrs.tagType ?? "insight");
  const tagType: SemanticHighlightType = isSemanticHighlightType(rawTagType)
    ? rawTagType
    : "insight";
  const definition = getSemanticHighlightDefinition(tagType);
  const highlightId =
    typeof attrs.highlightId === "string" && attrs.highlightId.trim()
      ? attrs.highlightId
      : "highlight-unassigned";
  const label =
    typeof attrs.label === "string" && attrs.label.trim()
      ? attrs.label
      : definition.label;
  const colorKey =
    typeof attrs.colorKey === "string" && attrs.colorKey.trim()
      ? attrs.colorKey
      : definition.colorKey;
  const note = typeof attrs.note === "string" ? attrs.note : "";
  const createdAt =
    typeof attrs.createdAt === "string" && attrs.createdAt.trim()
      ? attrs.createdAt
      : "";

  return {
    highlightId,
    tagType,
    label,
    colorKey,
    note,
    createdAt,
  };
}

export const AuthorMark = Mark.create({
  name: "authorMark",
  excludes: "",

  addAttributes() {
    return {
      authorId: {
        default: "unassigned",
        parseHTML: (element) => element.getAttribute("data-author-id"),
      },
      authorLabel: {
        default: "Unassigned",
        parseHTML: (element) => element.getAttribute("data-author-label"),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-author-id]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = getAuthorAttrs(
      HTMLAttributes.authorId,
      HTMLAttributes.authorLabel,
    );

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-author-id": attrs.authorId,
        "data-author-label": attrs.authorLabel,
        class: `manuscript-author-mark manuscript-author-${attrs.authorId}`,
      }),
      0,
    ];
  },
});

export const SemanticHighlightMark = Mark.create({
  name: "semanticHighlightMark",
  excludes: "",

  addAttributes() {
    return {
      highlightId: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-semantic-highlight-id"),
      },
      tagType: {
        default: "insight",
        parseHTML: (element) => element.getAttribute("data-semantic-tag-type"),
      },
      label: {
        default: "Insight",
        parseHTML: (element) => element.getAttribute("data-semantic-label"),
      },
      colorKey: {
        default: "insight",
        parseHTML: (element) => element.getAttribute("data-semantic-color-key"),
      },
      note: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-semantic-note"),
      },
      createdAt: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-semantic-created-at"),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-semantic-highlight-id]",
      },
      {
        tag: "mark[data-semantic-highlight-id]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = getSemanticAttrs(HTMLAttributes);

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-semantic-highlight-id": attrs.highlightId,
        "data-semantic-tag-type": attrs.tagType,
        "data-semantic-label": attrs.label,
        "data-semantic-color-key": attrs.colorKey,
        "data-semantic-note": attrs.note,
        "data-semantic-created-at": attrs.createdAt,
        class: `manuscript-semantic-mark manuscript-semantic-${attrs.colorKey}`,
      }),
      0,
    ];
  },
});
