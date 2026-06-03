"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeBoundaryRanges = computeBoundaryRanges;
exports.computeRegionRanges = computeRegionRanges;
exports.projectDocument = projectDocument;
exports.getBoundaryById = getBoundaryById;
exports.getRegionById = getRegionById;
exports.getTextAnchorByProjectionSpan = getTextAnchorByProjectionSpan;
const anchors_1 = require("./anchors");
const document_1 = require("./document");
function getNodeIdsInRange(document, startNodeId, endNodeId) {
    const startIndex = (0, document_1.getNodeIndex)(document, startNodeId);
    const endIndex = (0, document_1.getNodeIndex)(document, endNodeId);
    if (startIndex < 0 || endIndex < 0)
        return [];
    const orderedStart = Math.min(startIndex, endIndex);
    const orderedEnd = Math.max(startIndex, endIndex);
    return document.nodes
        .slice(orderedStart, orderedEnd + 1)
        .map((node) => node.id);
}
function computeBoundaryRanges(document, kind) {
    const kinds = kind
        ? [kind]
        : [...new Set(document.boundaries.map((boundary) => boundary.kind))];
    return kinds.flatMap((boundaryKind) => {
        const boundaries = document.boundaries
            .filter((boundary) => boundary.kind === boundaryKind)
            .map((boundary) => ({
            boundary,
            index: (0, document_1.getNodeIndex)(document, boundary.nodeId),
        }))
            .filter((item) => item.index >= 0)
            .sort((left, right) => left.index - right.index ||
            left.boundary.title.localeCompare(right.boundary.title));
        return boundaries.map((item, index) => {
            const next = boundaries[index + 1];
            const endIndex = next
                ? Math.max(item.index, next.index - 1)
                : document.nodes.length - 1;
            const endNodeId = document.nodes[endIndex]?.id ?? item.boundary.nodeId;
            return {
                boundaryId: item.boundary.id,
                kind: item.boundary.kind,
                title: item.boundary.title,
                startNodeId: item.boundary.nodeId,
                endNodeId,
                nodeIds: getNodeIdsInRange(document, item.boundary.nodeId, endNodeId),
            };
        });
    });
}
function computeRegionRanges(document) {
    return document.regions.map((region) => ({
        regionId: region.id,
        kind: region.kind,
        title: region.title,
        startNodeId: region.startNodeId,
        endNodeId: region.endNodeId,
        nodeIds: getNodeIdsInRange(document, region.startNodeId, region.endNodeId),
    }));
}
function getActiveBoundariesForNode(boundaryRanges, nodeId) {
    return boundaryRanges.filter((range) => range.nodeIds.includes(nodeId));
}
function getActiveRegionsForNode(regionRanges, nodeId) {
    return regionRanges.filter((range) => range.nodeIds.includes(nodeId));
}
function annotationToTaggedSpans(annotation) {
    return annotation.anchors.flatMap((anchor, anchorIndex) => {
        if (!(0, anchors_1.isTextAnchor)(anchor))
            return [];
        return [
            {
                id: `${annotation.id}:${anchorIndex}`,
                tagSlug: annotation.kind,
                label: annotation.label ?? annotation.kind,
                blockStableId: anchor.nodeId,
                startOffset: anchor.startOffset,
                endOffset: anchor.endOffset,
                selectedText: anchor.exact,
                annotationId: annotation.id,
                anchorIndex,
            },
        ];
    });
}
function projectDocument(document) {
    const boundaryRanges = computeBoundaryRanges(document);
    const regionRanges = computeRegionRanges(document);
    return {
        blocks: document.nodes.map((node, order) => {
            const activeBoundaries = getActiveBoundariesForNode(boundaryRanges, node.id);
            const activeRegions = getActiveRegionsForNode(regionRanges, node.id);
            return {
                stableId: node.id,
                order,
                type: node.type,
                body: node.text,
                boundaryKinds: document.boundaries
                    .filter((boundary) => boundary.nodeId === node.id)
                    .map((boundary) => boundary.kind),
                activeBoundaryIds: activeBoundaries.map((boundary) => boundary.boundaryId),
                activeRegionIds: activeRegions.map((region) => region.regionId),
            };
        }),
        taggedSpans: document.annotations.flatMap(annotationToTaggedSpans),
        boundaryRanges,
        regionRanges,
    };
}
function getBoundaryById(document, boundaryId) {
    return document.boundaries.find((boundary) => boundary.id === boundaryId);
}
function getRegionById(document, regionId) {
    return document.regions.find((region) => region.id === regionId);
}
function getTextAnchorByProjectionSpan(document, span) {
    const annotation = document.annotations.find((candidate) => candidate.id === span.annotationId);
    const anchor = annotation?.anchors[span.anchorIndex];
    return anchor && (0, anchors_1.isTextAnchor)(anchor) ? anchor : undefined;
}
