import type {
  Anchor,
  InlineAnnotation,
  QuipslyDocument,
  TextAnchor,
} from "./document";
import { getNodeOrThrow } from "./document";

const DEFAULT_CONTEXT_LENGTH = 48;

export type CreateTextAnchorInput = {
  document: QuipslyDocument;
  nodeId: string;
  startOffset: number;
  endOffset: number;
  contextLength?: number;
};

export function clampOffset(value: number, textLength: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(textLength, Math.floor(value)));
}

export function normalizeTextRange(input: {
  startOffset: number;
  endOffset: number;
  textLength: number;
}) {
  const start = clampOffset(input.startOffset, input.textLength);
  const end = clampOffset(input.endOffset, input.textLength);

  return {
    startOffset: Math.min(start, end),
    endOffset: Math.max(start, end),
  };
}

export function createTextAnchor(input: CreateTextAnchorInput): TextAnchor {
  const node = getNodeOrThrow(input.document, input.nodeId);
  const contextLength = input.contextLength ?? DEFAULT_CONTEXT_LENGTH;
  const range = normalizeTextRange({
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    textLength: node.text.length,
  });

  return {
    type: "text",
    nodeId: input.nodeId,
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    exact: node.text.slice(range.startOffset, range.endOffset),
    prefix: node.text.slice(
      Math.max(0, range.startOffset - contextLength),
      range.startOffset,
    ),
    suffix: node.text.slice(
      range.endOffset,
      Math.min(node.text.length, range.endOffset + contextLength),
    ),
  };
}

export function isTextAnchor(anchor: Anchor): anchor is TextAnchor {
  return anchor.type === "text";
}

export function refreshTextAnchor(
  document: QuipslyDocument,
  anchor: TextAnchor,
): TextAnchor {
  return createTextAnchor({
    document,
    nodeId: anchor.nodeId,
    startOffset: anchor.startOffset,
    endOffset: anchor.endOffset,
  });
}

export function refreshTextAnchorSnapshots(
  document: QuipslyDocument,
): QuipslyDocument {
  for (const annotation of document.annotations) {
    annotation.anchors = annotation.anchors.map((anchor) =>
      isTextAnchor(anchor) ? refreshTextAnchor(document, anchor) : anchor,
    );
  }

  for (const entityReference of document.entityReferences) {
    entityReference.anchors = entityReference.anchors.map((anchor) =>
      isTextAnchor(anchor) ? refreshTextAnchor(document, anchor) : anchor,
    );
  }

  return document;
}

export function getTextAnchors(annotation: InlineAnnotation) {
  return annotation.anchors.filter(isTextAnchor);
}

export function textAnchorContainsOffset(anchor: TextAnchor, offset: number) {
  return offset >= anchor.startOffset && offset <= anchor.endOffset;
}
