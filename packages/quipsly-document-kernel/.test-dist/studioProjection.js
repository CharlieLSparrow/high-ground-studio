"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDocumentFromStudioProjection = createDocumentFromStudioProjection;
exports.projectDocumentToStudioProjection = projectDocumentToStudioProjection;
const document_1 = require("./document");
const anchors_1 = require("./anchors");
const projections_1 = require("./projections");
function sortedBlocks(blocks) {
    return [...blocks].sort((left, right) => {
        const leftOrder = left.order ?? 0;
        const rightOrder = right.order ?? 0;
        return leftOrder - rightOrder || left.id.localeCompare(right.id);
    });
}
function createFallbackSpanId(blockId, tagSlug, index) {
    return `span-${blockId}-${tagSlug}-${index}`;
}
function createDocumentFromStudioProjection(input) {
    const blocks = sortedBlocks(input.blocks);
    const document = (0, document_1.createQuipslyDocument)({
        id: input.documentId,
        title: input.title,
        now: input.now,
        nodes: blocks.map((block) => ({
            id: block.id,
            type: block.type === "heading" ? "heading" : "paragraph",
            text: block.text,
            attrs: {
                studioOrder: block.order ?? 0,
            },
        })),
    });
    for (const block of blocks) {
        for (const tag of block.tags ?? []) {
            const boundaryMapping = input.boundaryTags?.[tag];
            if (boundaryMapping) {
                document.boundaries.push({
                    id: `boundary-${block.id}-${tag}`,
                    kind: boundaryMapping.kind,
                    nodeId: block.id,
                    title: boundaryMapping.title ?? tag,
                });
                continue;
            }
            if (block.text.length === 0)
                continue;
            document.annotations.push({
                id: createFallbackSpanId(block.id, tag, 0),
                kind: tag,
                label: tag,
                anchors: [
                    (0, anchors_1.createTextAnchor)({
                        document,
                        nodeId: block.id,
                        startOffset: 0,
                        endOffset: block.text.length,
                    }),
                ],
                createdAt: input.now,
                updatedAt: input.now,
            });
        }
    }
    for (const span of input.spans ?? []) {
        const node = document.nodes.find((candidate) => candidate.id === span.blockId);
        if (!node || node.text.length === 0)
            continue;
        document.annotations.push({
            id: span.id,
            kind: span.tagSlug,
            label: span.label ?? span.tagSlug,
            anchors: [
                (0, anchors_1.createTextAnchor)({
                    document,
                    nodeId: span.blockId,
                    startOffset: span.startOffset,
                    endOffset: span.endOffset,
                }),
            ],
            metadata: span.selectedText
                ? {
                    importedSelectedText: span.selectedText,
                }
                : undefined,
            createdAt: input.now,
            updatedAt: input.now,
        });
    }
    return document;
}
function projectDocumentToStudioProjection(document) {
    const projection = (0, projections_1.projectDocument)(document);
    return {
        blocks: projection.blocks.map((block) => ({
            stableId: block.stableId,
            order: block.order,
            body: block.body,
            type: block.type,
        })),
        taggedSpans: projection.taggedSpans.map((span) => ({
            stableId: span.id,
            blockStableId: span.blockStableId,
            tagSlug: span.tagSlug,
            label: span.label,
            startOffset: span.startOffset,
            endOffset: span.endOffset,
            selectedText: span.selectedText,
        })),
    };
}
