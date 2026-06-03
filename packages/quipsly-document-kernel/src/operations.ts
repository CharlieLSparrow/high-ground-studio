import {
  cloneDocument,
  createId,
  getNodeIndex,
  getNodeOrThrow,
  type Anchor,
  type BoundaryKind,
  type BoundaryMarker,
  type DocumentNode,
  type InlineAnnotation,
  type InlineAnnotationKind,
  type KernelMetadata,
  type QuipslyDocument,
  type Region,
  type RegionKind,
  type TextAnchor,
} from "./document";
import {
  createTextAnchor,
  isTextAnchor,
  normalizeTextRange,
  refreshTextAnchorSnapshots,
} from "./anchors";
import { projectDocument, type DocumentProjection } from "./projections";

export type KernelEvent = {
  type: string;
  message: string;
  metadata?: KernelMetadata;
};

export type OperationResult = {
  document: QuipslyDocument;
  projection: DocumentProjection;
  events: KernelEvent[];
};

export type InsertTextOperation = {
  type: "insertText";
  nodeId: string;
  offset: number;
  text: string;
};

export type DeleteTextOperation = {
  type: "deleteText";
  nodeId: string;
  startOffset: number;
  endOffset: number;
};

export type SplitNodeOperation = {
  type: "splitNode";
  nodeId: string;
  offset: number;
  newNodeId?: string;
};

export type MergeNodesOperation = {
  type: "mergeNodes";
  leftNodeId: string;
  rightNodeId: string;
};

export type AddBoundaryOperation = {
  type: "addBoundary";
  id?: string;
  kind: BoundaryKind;
  nodeId: string;
  title: string;
  metadata?: KernelMetadata;
};

export type RemoveBoundaryOperation = {
  type: "removeBoundary";
  boundaryId: string;
};

export type AddRegionOperation = {
  type: "addRegion";
  id?: string;
  kind: RegionKind;
  startNodeId: string;
  endNodeId: string;
  title: string;
  metadata?: KernelMetadata;
};

export type ApplyInlineAnnotationOperation = {
  type: "applyInlineAnnotation";
  id?: string;
  kind: InlineAnnotationKind;
  label?: string;
  anchor: Anchor;
  metadata?: KernelMetadata;
};

export type RemoveAnnotationOperation = {
  type: "removeAnnotation";
  annotationId: string;
};

export type KernelOperation =
  | InsertTextOperation
  | DeleteTextOperation
  | SplitNodeOperation
  | MergeNodesOperation
  | AddBoundaryOperation
  | RemoveBoundaryOperation
  | AddRegionOperation
  | ApplyInlineAnnotationOperation
  | RemoveAnnotationOperation;

function nowIso() {
  return new Date().toISOString();
}

function finish(document: QuipslyDocument, events: KernelEvent[]): OperationResult {
  document.updatedAt = nowIso();
  refreshTextAnchorSnapshots(document);

  return {
    document,
    projection: projectDocument(document),
    events,
  };
}

function remapAnchorForInsert(
  anchor: TextAnchor,
  nodeId: string,
  offset: number,
  length: number,
): TextAnchor {
  if (anchor.nodeId !== nodeId || length === 0) return anchor;

  if (offset <= anchor.startOffset) {
    return {
      ...anchor,
      startOffset: anchor.startOffset + length,
      endOffset: anchor.endOffset + length,
    };
  }

  if (offset > anchor.startOffset && offset < anchor.endOffset) {
    return {
      ...anchor,
      endOffset: anchor.endOffset + length,
    };
  }

  return anchor;
}

function remapAnchorForDelete(
  anchor: TextAnchor,
  nodeId: string,
  startOffset: number,
  endOffset: number,
): TextAnchor {
  if (anchor.nodeId !== nodeId || startOffset === endOffset) return anchor;

  const deletedLength = endOffset - startOffset;

  if (endOffset <= anchor.startOffset) {
    return {
      ...anchor,
      startOffset: anchor.startOffset - deletedLength,
      endOffset: anchor.endOffset - deletedLength,
    };
  }

  if (startOffset >= anchor.endOffset) {
    return anchor;
  }

  const nextStart =
    startOffset <= anchor.startOffset
      ? startOffset
      : anchor.startOffset;
  const overlapStart = Math.max(startOffset, anchor.startOffset);
  const overlapEnd = Math.min(endOffset, anchor.endOffset);
  const overlapLength = Math.max(0, overlapEnd - overlapStart);
  const nextEnd = Math.max(nextStart, anchor.endOffset - overlapLength);

  return {
    ...anchor,
    startOffset: nextStart,
    endOffset: nextEnd,
  };
}

function remapTextAnchors(
  document: QuipslyDocument,
  mapper: (anchor: TextAnchor) => TextAnchor | TextAnchor[],
) {
  for (const annotation of document.annotations) {
    annotation.anchors = annotation.anchors.flatMap<Anchor>((anchor) => {
      if (!isTextAnchor(anchor)) return [anchor];
      const mapped = mapper(anchor);
      return Array.isArray(mapped) ? mapped : [mapped];
    });
  }

  for (const entityReference of document.entityReferences) {
    entityReference.anchors = entityReference.anchors.flatMap<Anchor>((anchor) => {
      if (!isTextAnchor(anchor)) return [anchor];
      const mapped = mapper(anchor);
      return Array.isArray(mapped) ? mapped : [mapped];
    });
  }
}

function splitTextAnchor(input: {
  anchor: TextAnchor;
  nodeId: string;
  newNodeId: string;
  offset: number;
}): TextAnchor[] {
  const anchor = input.anchor;
  if (anchor.nodeId !== input.nodeId) return [anchor];

  if (anchor.endOffset <= input.offset) {
    return [anchor];
  }

  if (anchor.startOffset >= input.offset) {
    return [
      {
        ...anchor,
        nodeId: input.newNodeId,
        startOffset: anchor.startOffset - input.offset,
        endOffset: anchor.endOffset - input.offset,
      },
    ];
  }

  return [
    {
      ...anchor,
      endOffset: input.offset,
    },
    {
      ...anchor,
      nodeId: input.newNodeId,
      startOffset: 0,
      endOffset: anchor.endOffset - input.offset,
    },
  ].filter((nextAnchor) => nextAnchor.startOffset < nextAnchor.endOffset);
}

function normalizeAnchorForDocument(
  document: QuipslyDocument,
  anchor: Anchor,
): Anchor {
  if (!isTextAnchor(anchor)) return anchor;

  return createTextAnchor({
    document,
    nodeId: anchor.nodeId,
    startOffset: anchor.startOffset,
    endOffset: anchor.endOffset,
  });
}

export function applyOperation(
  sourceDocument: QuipslyDocument,
  operation: KernelOperation,
): OperationResult {
  const document = cloneDocument(sourceDocument);
  const events: KernelEvent[] = [];

  if (operation.type === "insertText") {
    const node = getNodeOrThrow(document, operation.nodeId);
    const offset = normalizeTextRange({
      startOffset: operation.offset,
      endOffset: operation.offset,
      textLength: node.text.length,
    }).startOffset;

    node.text = `${node.text.slice(0, offset)}${operation.text}${node.text.slice(offset)}`;
    remapTextAnchors(document, (anchor) =>
      remapAnchorForInsert(anchor, operation.nodeId, offset, operation.text.length),
    );

    events.push({
      type: "text-inserted",
      message: `Inserted text into node ${operation.nodeId}.`,
      metadata: { nodeId: operation.nodeId, offset, length: operation.text.length },
    });

    return finish(document, events);
  }

  if (operation.type === "deleteText") {
    const node = getNodeOrThrow(document, operation.nodeId);
    const range = normalizeTextRange({
      startOffset: operation.startOffset,
      endOffset: operation.endOffset,
      textLength: node.text.length,
    });

    node.text = `${node.text.slice(0, range.startOffset)}${node.text.slice(range.endOffset)}`;
    remapTextAnchors(document, (anchor) =>
      remapAnchorForDelete(
        anchor,
        operation.nodeId,
        range.startOffset,
        range.endOffset,
      ),
    );

    events.push({
      type: "text-deleted",
      message: `Deleted text from node ${operation.nodeId}.`,
      metadata: {
        nodeId: operation.nodeId,
        startOffset: range.startOffset,
        endOffset: range.endOffset,
      },
    });

    return finish(document, events);
  }

  if (operation.type === "splitNode") {
    const nodeIndex = getNodeIndex(document, operation.nodeId);
    if (nodeIndex < 0) throw new Error(`Document node not found: ${operation.nodeId}`);

    const node = document.nodes[nodeIndex];
    const offset = normalizeTextRange({
      startOffset: operation.offset,
      endOffset: operation.offset,
      textLength: node.text.length,
    }).startOffset;
    const newNodeId = operation.newNodeId ?? createId("node");
    const nextNode: DocumentNode = {
      ...node,
      id: newNodeId,
      text: node.text.slice(offset),
      attrs: node.attrs ? { ...node.attrs } : undefined,
    };

    node.text = node.text.slice(0, offset);
    document.nodes.splice(nodeIndex + 1, 0, nextNode);

    if (offset === 0) {
      for (const boundary of document.boundaries) {
        if (boundary.nodeId === operation.nodeId) boundary.nodeId = newNodeId;
      }

      for (const region of document.regions) {
        if (region.startNodeId === operation.nodeId) region.startNodeId = newNodeId;
        if (region.endNodeId === operation.nodeId) region.endNodeId = newNodeId;
      }
    }

    remapTextAnchors(document, (anchor) =>
      splitTextAnchor({
        anchor,
        nodeId: operation.nodeId,
        newNodeId,
        offset,
      }),
    );

    events.push({
      type: "node-split",
      message: `Split node ${operation.nodeId}.`,
      metadata: { nodeId: operation.nodeId, newNodeId, offset },
    });

    return finish(document, events);
  }

  if (operation.type === "mergeNodes") {
    const leftIndex = getNodeIndex(document, operation.leftNodeId);
    const rightIndex = getNodeIndex(document, operation.rightNodeId);
    if (leftIndex < 0) throw new Error(`Document node not found: ${operation.leftNodeId}`);
    if (rightIndex < 0) throw new Error(`Document node not found: ${operation.rightNodeId}`);
    if (rightIndex !== leftIndex + 1) {
      throw new Error("mergeNodes requires adjacent left and right nodes.");
    }

    const hasBoundaryOnRight = document.boundaries.some(
      (boundary) => boundary.nodeId === operation.rightNodeId,
    );
    if (hasBoundaryOnRight) {
      throw new Error(
        "Cannot merge across a boundary marker. Move or remove the boundary first.",
      );
    }

    const leftNode = document.nodes[leftIndex];
    const rightNode = document.nodes[rightIndex];
    const offset = leftNode.text.length;
    leftNode.text = `${leftNode.text}${rightNode.text}`;
    document.nodes.splice(rightIndex, 1);

    for (const region of document.regions) {
      if (region.startNodeId === operation.rightNodeId) {
        region.startNodeId = operation.leftNodeId;
      }
      if (region.endNodeId === operation.rightNodeId) {
        region.endNodeId = operation.leftNodeId;
      }
    }

    remapTextAnchors(document, (anchor) => {
      if (anchor.nodeId !== operation.rightNodeId) return anchor;

      return {
        ...anchor,
        nodeId: operation.leftNodeId,
        startOffset: anchor.startOffset + offset,
        endOffset: anchor.endOffset + offset,
      };
    });

    events.push({
      type: "nodes-merged",
      message: `Merged ${operation.rightNodeId} into ${operation.leftNodeId}.`,
      metadata: {
        leftNodeId: operation.leftNodeId,
        rightNodeId: operation.rightNodeId,
      },
    });

    return finish(document, events);
  }

  if (operation.type === "addBoundary") {
    getNodeOrThrow(document, operation.nodeId);
    const boundary: BoundaryMarker = {
      id: operation.id ?? createId("boundary"),
      kind: operation.kind,
      nodeId: operation.nodeId,
      title: operation.title,
      metadata: operation.metadata,
    };

    document.boundaries.push(boundary);
    events.push({
      type: "boundary-added",
      message: `Added ${operation.kind} boundary.`,
      metadata: { boundaryId: boundary.id, nodeId: boundary.nodeId },
    });

    return finish(document, events);
  }

  if (operation.type === "removeBoundary") {
    document.boundaries = document.boundaries.filter(
      (boundary) => boundary.id !== operation.boundaryId,
    );
    events.push({
      type: "boundary-removed",
      message: `Removed boundary ${operation.boundaryId}.`,
      metadata: { boundaryId: operation.boundaryId },
    });

    return finish(document, events);
  }

  if (operation.type === "addRegion") {
    getNodeOrThrow(document, operation.startNodeId);
    getNodeOrThrow(document, operation.endNodeId);
    const region: Region = {
      id: operation.id ?? createId("region"),
      kind: operation.kind,
      startNodeId: operation.startNodeId,
      endNodeId: operation.endNodeId,
      title: operation.title,
      metadata: operation.metadata,
    };

    document.regions.push(region);
    events.push({
      type: "region-added",
      message: `Added ${operation.kind} region.`,
      metadata: {
        regionId: region.id,
        startNodeId: region.startNodeId,
        endNodeId: region.endNodeId,
      },
    });

    return finish(document, events);
  }

  if (operation.type === "applyInlineAnnotation") {
    const annotation: InlineAnnotation = {
      id: operation.id ?? createId("annotation"),
      kind: operation.kind,
      label: operation.label,
      anchors: [normalizeAnchorForDocument(document, operation.anchor)],
      metadata: operation.metadata,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    document.annotations.push(annotation);
    events.push({
      type: "annotation-applied",
      message: `Applied ${operation.kind} annotation.`,
      metadata: { annotationId: annotation.id, kind: annotation.kind },
    });

    return finish(document, events);
  }

  if (operation.type === "removeAnnotation") {
    document.annotations = document.annotations.filter(
      (annotation) => annotation.id !== operation.annotationId,
    );
    events.push({
      type: "annotation-removed",
      message: `Removed annotation ${operation.annotationId}.`,
      metadata: { annotationId: operation.annotationId },
    });

    return finish(document, events);
  }

  const exhaustive: never = operation;
  throw new Error(`Unsupported kernel operation: ${JSON.stringify(exhaustive)}`);
}
