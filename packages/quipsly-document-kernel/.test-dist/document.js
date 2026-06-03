"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUIPSLY_DOCUMENT_SCHEMA_VERSION = void 0;
exports.createQuipslyDocument = createQuipslyDocument;
exports.cloneDocument = cloneDocument;
exports.createId = createId;
exports.getNodeIndex = getNodeIndex;
exports.getNodeOrThrow = getNodeOrThrow;
exports.QUIPSLY_DOCUMENT_SCHEMA_VERSION = 1;
function createQuipslyDocument(input) {
    const now = input.now ?? new Date().toISOString();
    return {
        schemaVersion: exports.QUIPSLY_DOCUMENT_SCHEMA_VERSION,
        id: input.id,
        title: input.title,
        nodes: input.nodes ?? [],
        boundaries: [],
        regions: [],
        annotations: [],
        entityReferences: [],
        metadata: input.metadata,
        createdAt: now,
        updatedAt: now,
    };
}
function cloneDocument(document) {
    return JSON.parse(JSON.stringify(document));
}
function createId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
}
function getNodeIndex(document, nodeId) {
    return document.nodes.findIndex((node) => node.id === nodeId);
}
function getNodeOrThrow(document, nodeId) {
    const node = document.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
        throw new Error(`Document node not found: ${nodeId}`);
    }
    return node;
}
