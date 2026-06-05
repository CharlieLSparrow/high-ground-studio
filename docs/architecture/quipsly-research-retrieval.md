# Quipsly Research Retrieval Architecture

Date: 2026-06-04

## Purpose

Define how Quipsly retrieves, packages, and delivers source-backed research
material to authors, writers, academics, and AI agents working inside Quipsly
documents.

This architecture must support:

- source libraries (collections of ingested reference material)
- quote and example retrieval
- manuscript-adjacent research packets
- citation and provenance tracing
- assistant tool intents (the callable surface for agents and UI)

It must remain compatible with the existing models and avoid schema churn.

## Existing Models This Must Work With

### Prisma: Creative Workspace

- `StudioProject` — workspace-scoped project container
- `StudioDocument` — a document in a project (has `stableId`, `title`,
  `projectionStatus`)
- `StudioDocumentBlock` — ordered text blocks inside a document (has `stableId`,
  `body`, `sourceLabel`, `sourcePath`)
- `StudioTaggedSpan` — a tagged text range inside a block (has `selectedText`,
  `startOffset`, `endOffset`, links to tag/block/document)
- `StudioKnowledgeNode` — a promoted tagged span with body/title/nodeType/
  reviewStatus (types: `principle`, `story`, `quote`, `question`,
  `projection_candidate`, `source_note`, `production_element`)
- `StudioTag` — semantic tag with category (`meaning`, `structure`, `source`,
  `projection`, `review`, `production_breakdown`)

### Prisma: Intelligence Layer

- `QuipslyNode` — canonical lore graph node (types: `PERSON`, `QUOTE`, `THEME`,
  `SOURCE_WORK`, `EVIDENCE`, `LORELIST`; flexible `payloadJson`)
- `QuipLoreEdge` — directed typed edge between nodes (types: `QUOTED_BY`,
  `APPEARS_IN`, `SUPPORTED_BY`, `HAS_THEME`, `CONTAINS`, `RELATED_TO`,
  `VARIANT_OF`)

### TypeScript: quipsly-domain

Already defines: `VerificationStatus`, `SourceType`, `PersonRole`,
`ResearchQueueStatus`, `ResearchPriority`, `ResearchActionKind`,
`ResearchQueueItemProjection`, `ResearchPacketProjection`,
`ResearchActionProjection`, `QuoteProjection`, `EvidenceProjection`,
`SourceWorkProjection`, `PersonProjection`, `ThemeProjection`.

### TypeScript: quipsly-document-kernel

Already defines: `QuipslyDocument`, `DocumentNode`, `InlineAnnotation`,
`EntityReference`, `Anchor` (text/node/boundary/region/mediaTime/timeline),
`KernelCursor`, `AgentVisibleContext`.

## Design Principle

The retrieval engine is a **service-layer routing contract**, not a new database
domain. It reads from existing tables and kernel state, normalizes results into a
common shape, and delivers them to callers. No new Prisma models are introduced
in this phase.

The type contracts live in `packages/quipsly-domain` as extensions to the
existing research projection types. The runtime implementation will later live
in `apps/quipsly` or a dedicated retrieval service, but this document defines
only contracts and architecture decisions.

## Source Libraries

A Source Library is a logical grouping of reference material available for
retrieval. It is not a new database table — it is a query-time scope that
maps to existing models.

```typescript
/**
 * A named scope of reference material available for retrieval queries.
 * Resolves at query time to a set of StudioDocuments, StudioKnowledgeNodes,
 * and/or QuipslyNodes.
 */
export type SourceLibrary = {
  /** Stable identifier, e.g. "thornfield-series-bible" or "public-quotes" */
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  /** Which backing stores this library draws from */
  readonly backends: readonly SourceBackend[];
};

export type SourceBackend =
  | StudioProjectBackend
  | QuipslyLoreBackend;

export type StudioProjectBackend = {
  readonly type: "studio-project";
  /** StudioProject.id — scopes to documents/blocks/spans in this project */
  readonly projectId: string;
  /** Optional tag category filter (e.g. only "source" category tags) */
  readonly tagCategories?: readonly string[];
  /** Optional knowledge node type filter */
  readonly nodeTypes?: readonly string[];
};

export type QuipslyLoreBackend = {
  readonly type: "quipsly-lore";
  /** Optional QuipslyNodeType filter (e.g. only QUOTE and EVIDENCE) */
  readonly nodeTypes?: readonly string[];
  /** Optional slug prefix for scoping (e.g. "franklin-" for a person scope) */
  readonly slugPrefix?: string;
};
```

Source library definitions can start as static configuration (a TypeScript
registry or JSON manifest in the project). They do not need a database table
until users need to create and share custom libraries through the UI.

### Default Libraries

The system should ship with at least these built-in libraries:

- `all-sources` — union of all Studio documents and QuipslyNodes in the
  workspace
- `verified-quotes` — QuipslyNodes where `nodeType = QUOTE` and
  `payloadJson.verificationStatus` is `verified` or `attributed`
- `active-manuscript` — the current StudioDocument and its immediate project
  context (resolved from cursor position or explicit document ID)

## Retrieval Results and Provenance

Every result returned by the retrieval engine carries provenance back to its
origin record. This is the core trust contract — no result should arrive without
a traceable path to its source.

```typescript
export type RetrievalProvenance =
  | StudioSpanProvenance
  | StudioKnowledgeProvenance
  | QuipslyNodeProvenance;

/**
 * Result originated from a StudioTaggedSpan or its parent block.
 */
export type StudioSpanProvenance = {
  readonly origin: "studio-span";
  readonly projectId: string;
  readonly documentId: string;
  readonly documentStableId: string;
  readonly documentTitle: string;
  readonly blockId: string;
  readonly blockStableId: string;
  readonly spanId?: string;
  readonly tagSlug?: string;
  readonly tagCategory?: string;
  readonly sourceLabel?: string;
  readonly sourcePath?: string;
};

/**
 * Result originated from a promoted StudioKnowledgeNode.
 */
export type StudioKnowledgeProvenance = {
  readonly origin: "studio-knowledge";
  readonly projectId: string;
  readonly knowledgeNodeId: string;
  readonly nodeType: string;
  readonly reviewStatus: string;
  readonly tagLabel: string;
  readonly documentStableId: string;
  readonly documentTitle: string;
  readonly blockStableId: string;
};

/**
 * Result originated from a QuipslyNode in the lore graph.
 */
export type QuipslyNodeProvenance = {
  readonly origin: "quipsly-lore";
  readonly nodeId: string;
  readonly nodeSlug: string;
  readonly nodeType: string;
  readonly nodeStatus: string;
};
```

### Retrieval Result

```typescript
export type RetrievalResult = {
  /** Unique ID for this result within the packet */
  readonly resultId: string;
  /** The text content to surface */
  readonly content: string;
  /** Human-readable short title */
  readonly title: string;
  /** Relevance score (0-1, from vector similarity or keyword match) */
  readonly relevanceScore: number;
  /** Full provenance trace */
  readonly provenance: RetrievalProvenance;
  /** Formatted citation string for display */
  readonly citation: string;
  /** Verification posture of this result */
  readonly verificationStatus: VerificationStatus;
  /** Connected graph context (related nodes/edges, if from QuipslyNode) */
  readonly connectedSlugs?: readonly string[];
};
```

## Research Packets

A Research Packet is the compiled delivery unit. It is what an agent receives,
what a Context Pane renders, and what a citation sidebar displays.

This extends the existing `ResearchPacketProjection` shape in quipsly-domain
without replacing it. The existing projection is oriented toward the
quote-verification research queue. This new shape is oriented toward
manuscript-adjacent retrieval for authors and academics.

```typescript
export type ManuscriptResearchPacket = {
  readonly packetId: string;
  readonly query: string;
  readonly intent: RetrievalIntent;
  /** Which source library was queried */
  readonly librarySlug: string;
  /** Ordered results, highest relevance first */
  readonly results: readonly RetrievalResult[];
  /** Retrieval metadata */
  readonly meta: {
    readonly retrievedAt: string;
    readonly durationMs: number;
    readonly resultCount: number;
    readonly sourcesCovered: number;
    readonly truncated: boolean;
  };
};

export type RetrievalIntent =
  | "quote-search"
  | "example-search"
  | "thematic-context"
  | "character-lore"
  | "world-rules"
  | "source-verification"
  | "citation-lookup"
  | "freeform";
```

## Assistant Tool Intents

These are the callable operations that agents and UI components invoke.
Each tool returns a `ManuscriptResearchPacket`.

```typescript
export type RetrievalToolContract = {
  /**
   * Search for quotes matching a natural-language query.
   * Queries QuipslyNode (QUOTE, EVIDENCE) and StudioTaggedSpan (quote tags).
   * Always includes verification status in results.
   */
  searchQuotes(input: {
    query: string;
    library?: string;
    verificationFilter?: VerificationStatus[];
    limit?: number;
  }): Promise<ManuscriptResearchPacket>;

  /**
   * Search for examples, passages, and evidence across source libraries.
   * Broader than quote search — includes StudioDocumentBlock body text,
   * StudioKnowledgeNode source text, and QuipslyNode EVIDENCE payloads.
   */
  searchExamples(input: {
    query: string;
    library?: string;
    limit?: number;
  }): Promise<ManuscriptResearchPacket>;

  /**
   * Build a thematic research packet from the author's current position.
   * Uses the cursor context from the document kernel to scope the search
   * to material relevant to the active chapter/episode/region.
   */
  buildContextPacket(input: {
    documentId: string;
    cursorNodeId: string;
    cursorOffset?: number;
    additionalQuery?: string;
    library?: string;
    limit?: number;
  }): Promise<ManuscriptResearchPacket>;

  /**
   * Fetch an entity from the lore graph and its immediate connections.
   * Returns the node payload plus connected nodes via QuipLoreEdge traversal.
   */
  getEntityContext(input: {
    entitySlug: string;
    depth?: number;
    edgeTypes?: string[];
  }): Promise<ManuscriptResearchPacket>;

  /**
   * Verify or look up a specific citation.
   * Searches for the exact or near-exact quote text across all libraries.
   * Returns provenance and verification status.
   */
  verifyCitation(input: {
    quoteText: string;
    attributedTo?: string;
    sourceHint?: string;
  }): Promise<ManuscriptResearchPacket>;
};
```

## How It Connects to the Document Kernel

The document kernel's `InlineAnnotation` (kind `research`) and
`EntityReference` (kind `source`, `sourcePassage`, `verifiedQuote`) are the
durable in-document anchors for research results.

Workflow:

1. Author highlights text or positions cursor.
2. UI or agent calls a retrieval tool (e.g. `buildContextPacket`).
3. Engine queries the relevant `SourceLibrary` backends.
4. Engine returns a `ManuscriptResearchPacket`.
5. If the author accepts a result, the kernel creates:
   - an `InlineAnnotation` (kind: `research`) anchored to the cursor position,
     with `metadata.packetId` and `metadata.resultId`, or
   - an `EntityReference` linking the cursor to the source QuipslyNode or
     StudioKnowledgeNode.
6. The annotation/reference persists in the kernel document and materializes
   to `StudioTaggedSpan` / `StudioKnowledgeNode` through the existing
   projection pipeline.

This keeps the kernel as the canonical document truth, the retrieval engine as a
stateless query layer, and the database as materialized storage. No new tables
are needed.

## Implementation Sequence

### Phase 1: Contracts (this document)

- Define types in `packages/quipsly-domain/src/retrieval.ts`.
- Export from `packages/quipsly-domain/src/index.ts`.
- No runtime code, no schema changes.

### Phase 2: Static Library Registry

- Create a `SourceLibrary` registry (TypeScript or JSON) with the three default
  libraries.
- No database changes.

### Phase 3: Retrieval Engine (Prisma-backed)

- Implement the retrieval tools as server actions or API routes.
- Query `StudioDocumentBlock.body` and `StudioKnowledgeNode.sourceText` using
  Prisma full-text search or `ILIKE` for the initial version.
- Query `QuipslyNode.payloadJson` for lore graph results.
- Format results into `ManuscriptResearchPacket`.
- No schema changes.

### Phase 4: Vector Enhancement

- Add pgvector column or a sidecar embedding table (schema change, deferred).
- Replace keyword search with semantic similarity.
- Keep the same `RetrievalToolContract` interface — callers do not change.

### Phase 5: UI Integration

- Wire `buildContextPacket` into the Manuscript Context Pane.
- Wire `searchQuotes` into a Research sidebar or assistant panel.
- Wire accepted results into kernel `InlineAnnotation` / `EntityReference`
  creation via kernel operations.

## What This Does Not Do

- Does not introduce new Prisma models (no schema churn).
- Does not replace the existing `ResearchPacketProjection` in quipsly-domain
  (that serves the quote-verification research queue; this serves
  manuscript-adjacent retrieval).
- Does not own ingestion — source material enters through existing Studio
  import or QuipslyNode creation paths.
- Does not own the document kernel — it reads kernel state but does not
  mutate it directly. Mutations go through kernel operations.
- Does not hardcode project slugs — library backends reference project IDs
  resolved at runtime.

## Open Decisions

- Whether the first retrieval implementation should be server actions in
  `apps/quipsly` or a standalone API route.
- Whether `SourceLibrary` definitions should be persisted in the database
  eventually or remain configuration-driven.
- Vector strategy: pgvector extension on existing Cloud SQL, or a dedicated
  service. Phase 3 works without vectors; Phase 4 needs this decision.
- Whether `verifyCitation` should call external APIs (e.g. Google Books,
  CrossRef) or only search local libraries in the first version.
