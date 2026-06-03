import type {
  BoundaryKind,
  BoundaryMarker,
  InlineAnnotation,
  QuipslyDocument,
  Region,
  TextAnchor,
} from "./document";
import { isTextAnchor } from "./anchors";
import { getNodeIndex } from "./document";

export type MaterializedDocumentBlock = {
  stableId: string;
  order: number;
  type: string;
  body: string;
  boundaryKinds: string[];
  activeBoundaryIds: string[];
  activeRegionIds: string[];
};

export type MaterializedTaggedSpan = {
  id: string;
  tagSlug: string;
  label: string;
  blockStableId: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  annotationId: string;
  anchorIndex: number;
};

export type BoundaryRange = {
  boundaryId: string;
  kind: BoundaryKind;
  title: string;
  startNodeId: string;
  endNodeId: string;
  nodeIds: string[];
};

export type RegionRange = {
  regionId: string;
  kind: string;
  title: string;
  startNodeId: string;
  endNodeId: string;
  nodeIds: string[];
};

export type DocumentProjection = {
  blocks: MaterializedDocumentBlock[];
  taggedSpans: MaterializedTaggedSpan[];
  boundaryRanges: BoundaryRange[];
  regionRanges: RegionRange[];
};

function getNodeIdsInRange(
  document: QuipslyDocument,
  startNodeId: string,
  endNodeId: string,
) {
  const startIndex = getNodeIndex(document, startNodeId);
  const endIndex = getNodeIndex(document, endNodeId);

  if (startIndex < 0 || endIndex < 0) return [];

  const orderedStart = Math.min(startIndex, endIndex);
  const orderedEnd = Math.max(startIndex, endIndex);

  return document.nodes
    .slice(orderedStart, orderedEnd + 1)
    .map((node) => node.id);
}

export function computeBoundaryRanges(
  document: QuipslyDocument,
  kind?: BoundaryKind,
): BoundaryRange[] {
  const kinds = kind
    ? [kind]
    : [...new Set(document.boundaries.map((boundary) => boundary.kind))];

  return kinds.flatMap((boundaryKind) => {
    const boundaries = document.boundaries
      .filter((boundary) => boundary.kind === boundaryKind)
      .map((boundary) => ({
        boundary,
        index: getNodeIndex(document, boundary.nodeId),
      }))
      .filter((item) => item.index >= 0)
      .sort(
        (left, right) =>
          left.index - right.index ||
          left.boundary.title.localeCompare(right.boundary.title),
      );

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

export function computeRegionRanges(document: QuipslyDocument): RegionRange[] {
  return document.regions.map((region) => ({
    regionId: region.id,
    kind: region.kind,
    title: region.title,
    startNodeId: region.startNodeId,
    endNodeId: region.endNodeId,
    nodeIds: getNodeIdsInRange(document, region.startNodeId, region.endNodeId),
  }));
}

function getActiveBoundariesForNode(
  boundaryRanges: BoundaryRange[],
  nodeId: string,
) {
  return boundaryRanges.filter((range) => range.nodeIds.includes(nodeId));
}

function getActiveRegionsForNode(regionRanges: RegionRange[], nodeId: string) {
  return regionRanges.filter((range) => range.nodeIds.includes(nodeId));
}

function annotationToTaggedSpans(
  annotation: InlineAnnotation,
): MaterializedTaggedSpan[] {
  return annotation.anchors.flatMap((anchor, anchorIndex) => {
    if (!isTextAnchor(anchor)) return [];

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

export function projectDocument(document: QuipslyDocument): DocumentProjection {
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

export function getBoundaryById(
  document: QuipslyDocument,
  boundaryId: string,
): BoundaryMarker | undefined {
  return document.boundaries.find((boundary) => boundary.id === boundaryId);
}

export function getRegionById(
  document: QuipslyDocument,
  regionId: string,
): Region | undefined {
  return document.regions.find((region) => region.id === regionId);
}

export function getTextAnchorByProjectionSpan(
  document: QuipslyDocument,
  span: MaterializedTaggedSpan,
): TextAnchor | undefined {
  const annotation = document.annotations.find(
    (candidate) => candidate.id === span.annotationId,
  );
  const anchor = annotation?.anchors[span.anchorIndex];
  return anchor && isTextAnchor(anchor) ? anchor : undefined;
}
