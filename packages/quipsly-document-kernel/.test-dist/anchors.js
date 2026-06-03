"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clampOffset = clampOffset;
exports.normalizeTextRange = normalizeTextRange;
exports.createTextAnchor = createTextAnchor;
exports.isTextAnchor = isTextAnchor;
exports.refreshTextAnchor = refreshTextAnchor;
exports.refreshTextAnchorSnapshots = refreshTextAnchorSnapshots;
exports.getTextAnchors = getTextAnchors;
exports.textAnchorContainsOffset = textAnchorContainsOffset;
const document_1 = require("./document");
const DEFAULT_CONTEXT_LENGTH = 48;
function clampOffset(value, textLength) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(textLength, Math.floor(value)));
}
function normalizeTextRange(input) {
    const start = clampOffset(input.startOffset, input.textLength);
    const end = clampOffset(input.endOffset, input.textLength);
    return {
        startOffset: Math.min(start, end),
        endOffset: Math.max(start, end),
    };
}
function createTextAnchor(input) {
    const node = (0, document_1.getNodeOrThrow)(input.document, input.nodeId);
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
        prefix: node.text.slice(Math.max(0, range.startOffset - contextLength), range.startOffset),
        suffix: node.text.slice(range.endOffset, Math.min(node.text.length, range.endOffset + contextLength)),
    };
}
function isTextAnchor(anchor) {
    return anchor.type === "text";
}
function refreshTextAnchor(document, anchor) {
    return createTextAnchor({
        document,
        nodeId: anchor.nodeId,
        startOffset: anchor.startOffset,
        endOffset: anchor.endOffset,
    });
}
function refreshTextAnchorSnapshots(document) {
    for (const annotation of document.annotations) {
        annotation.anchors = annotation.anchors.map((anchor) => isTextAnchor(anchor) ? refreshTextAnchor(document, anchor) : anchor);
    }
    for (const entityReference of document.entityReferences) {
        entityReference.anchors = entityReference.anchors.map((anchor) => isTextAnchor(anchor) ? refreshTextAnchor(document, anchor) : anchor);
    }
    return document;
}
function getTextAnchors(annotation) {
    return annotation.anchors.filter(isTextAnchor);
}
function textAnchorContainsOffset(anchor, offset) {
    return offset >= anchor.startOffset && offset <= anchor.endOffset;
}
