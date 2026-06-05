/**
 * Quipsly Research Retrieval Contracts
 *
 * Service-layer types for source-backed research retrieval. These contracts
 * define the inputs and outputs for retrieving quotes, examples, thematic
 * context, entity lore, and citation verification from both the Creative
 * Workspace (StudioDocument / StudioTaggedSpan / StudioKnowledgeNode) and the
 * Intelligence Layer (QuipslyNode / QuipLoreEdge).
 *
 * Architecture doc: docs/architecture/quipsly-research-retrieval.md
 *
 * Design rules:
 * - No new Prisma models. This is a service-layer routing contract.
 * - Provenance is mandatory. Every result traces back to its origin record.
 * - The existing ResearchPacketProjection (quote-verification queue) is
 *   complementary, not replaced.
 */

import type { QuipslyId, VerificationStatus } from "./index";

// ---------------------------------------------------------------------------
// Retrieval Intent
// ---------------------------------------------------------------------------

/**
 * The semantic purpose of a retrieval request. Helps the engine choose which
 * backends to prioritize and how to rank results.
 */
export type RetrievalIntent =
  | "quote-search"
  | "example-search"
  | "thematic-context"
  | "character-lore"
  | "world-rules"
  | "source-verification"
  | "citation-lookup"
  | "freeform";

// ---------------------------------------------------------------------------
// Source Libraries
// ---------------------------------------------------------------------------

/**
 * A named scope of reference material available for retrieval queries.
 * Resolves at query time to a set of StudioDocuments, StudioKnowledgeNodes,
 * and/or QuipslyNodes.
 *
 * Source libraries are configuration-driven in the first phase. They do not
 * require a database table until users need to create and share custom
 * libraries through the UI.
 */
export type SourceLibrary = {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly backends: readonly SourceBackend[];
};

export type SourceBackend = StudioProjectBackend | QuipslyLoreBackend;

/**
 * Scopes retrieval to documents, blocks, spans, and knowledge nodes within a
 * specific StudioProject.
 */
export type StudioProjectBackend = {
  readonly type: "studio-project";
  /** StudioProject.id — resolved at runtime, never hardcoded as a slug */
  readonly projectId: string;
  /** Optional StudioTagCategory filter (e.g. only "source" category tags) */
  readonly tagCategories?: readonly string[];
  /** Optional StudioKnowledgeNodeType filter */
  readonly nodeTypes?: readonly string[];
};

/**
 * Scopes retrieval to QuipslyNode and QuipLoreEdge records in the lore graph.
 */
export type QuipslyLoreBackend = {
  readonly type: "quipsly-lore";
  /** Optional QuipslyNodeType filter (e.g. only QUOTE and EVIDENCE) */
  readonly nodeTypes?: readonly string[];
  /** Optional slug prefix for scoping (e.g. "franklin-" for a person scope) */
  readonly slugPrefix?: string;
};

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * Discriminated union tracing a retrieval result back to its origin record.
 * Every result must carry one of these — no anonymous content.
 */
export type RetrievalProvenance =
  | StudioSpanProvenance
  | StudioKnowledgeProvenance
  | QuipslyNodeProvenance;

/**
 * Result originated from a StudioDocumentBlock body or a StudioTaggedSpan
 * within it.
 */
export type StudioSpanProvenance = {
  readonly origin: "studio-span";
  readonly projectId: string;
  readonly documentId: string;
  readonly documentStableId: string;
  readonly documentTitle: string;
  readonly blockId: string;
  readonly blockStableId: string;
  /** Present when the result comes from a specific tagged span */
  readonly spanId?: string;
  readonly tagSlug?: string;
  readonly tagCategory?: string;
  /** Source metadata carried on the block */
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

// ---------------------------------------------------------------------------
// Retrieval Result
// ---------------------------------------------------------------------------

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
  /** Connected graph context (related node slugs, if from QuipslyNode) */
  readonly connectedSlugs?: readonly string[];
};

// ---------------------------------------------------------------------------
// Manuscript Research Packet
// ---------------------------------------------------------------------------

/**
 * The compiled delivery unit for manuscript-adjacent research retrieval.
 *
 * This is what an agent receives, what a Context Pane renders, and what a
 * citation sidebar displays. It is intentionally separate from the existing
 * ResearchPacketProjection, which serves the quote-verification research queue.
 */
export type ManuscriptResearchPacket = {
  readonly packetId: string;
  readonly query: string;
  readonly intent: RetrievalIntent;
  /** Which source library was queried */
  readonly librarySlug: string;
  /** Ordered results, highest relevance first */
  readonly results: readonly RetrievalResult[];
  /** Retrieval metadata */
  readonly meta: RetrievalMeta;
};

export type RetrievalMeta = {
  readonly retrievedAt: string;
  readonly durationMs: number;
  readonly resultCount: number;
  /** How many distinct source documents/nodes contributed results */
  readonly sourcesCovered: number;
  /** True if results were capped by the limit parameter */
  readonly truncated: boolean;
};

// ---------------------------------------------------------------------------
// Tool Input Types
// ---------------------------------------------------------------------------

export type SearchQuotesInput = {
  readonly query: string;
  readonly library?: string;
  readonly verificationFilter?: readonly VerificationStatus[];
  readonly limit?: number;
};

export type SearchExamplesInput = {
  readonly query: string;
  readonly library?: string;
  readonly limit?: number;
};

export type BuildContextPacketInput = {
  readonly documentId: string;
  readonly cursorNodeId: string;
  readonly cursorOffset?: number;
  readonly additionalQuery?: string;
  readonly library?: string;
  readonly limit?: number;
};

export type GetEntityContextInput = {
  readonly entitySlug: string;
  readonly depth?: number;
  readonly edgeTypes?: readonly string[];
};

export type VerifyCitationInput = {
  readonly quoteText: string;
  readonly attributedTo?: string;
  readonly sourceHint?: string;
};

// ---------------------------------------------------------------------------
// Assistant Tool Contract
// ---------------------------------------------------------------------------

/**
 * The callable surface for AI assistants and UI components.
 *
 * Each method returns a ManuscriptResearchPacket. Implementations may be
 * server actions, API routes, or MCP tools — the contract is the same.
 */
export type RetrievalToolContract = {
  /**
   * Search for quotes matching a natural-language query.
   * Queries QuipslyNode (QUOTE, EVIDENCE) and StudioTaggedSpan (quote tags).
   * Always includes verification status in results.
   */
  searchQuotes(input: SearchQuotesInput): Promise<ManuscriptResearchPacket>;

  /**
   * Search for examples, passages, and evidence across source libraries.
   * Broader than quote search — includes StudioDocumentBlock body text,
   * StudioKnowledgeNode source text, and QuipslyNode EVIDENCE payloads.
   */
  searchExamples(input: SearchExamplesInput): Promise<ManuscriptResearchPacket>;

  /**
   * Build a thematic research packet from the author's current position.
   * Uses the cursor context from the document kernel to scope the search
   * to material relevant to the active chapter/episode/region.
   */
  buildContextPacket(
    input: BuildContextPacketInput,
  ): Promise<ManuscriptResearchPacket>;

  /**
   * Fetch an entity from the lore graph and its immediate connections.
   * Returns the node payload plus connected nodes via QuipLoreEdge traversal.
   */
  getEntityContext(
    input: GetEntityContextInput,
  ): Promise<ManuscriptResearchPacket>;

  /**
   * Verify or look up a specific citation.
   * Searches for the exact or near-exact quote text across all libraries.
   * Returns provenance and verification status.
   */
  verifyCitation(
    input: VerifyCitationInput,
  ): Promise<ManuscriptResearchPacket>;
};

// ---------------------------------------------------------------------------
// Default Source Library Registry
// ---------------------------------------------------------------------------

/**
 * Built-in source libraries. The `all-sources` and `verified-quotes` libraries
 * use placeholder project IDs — runtime resolvers must substitute the actual
 * workspace project IDs before querying.
 *
 * The `active-manuscript` library is resolved entirely at query time from the
 * caller's cursor context.
 */
export const DEFAULT_SOURCE_LIBRARIES: readonly SourceLibrary[] = [
  {
    slug: "all-sources",
    title: "All Sources",
    description:
      "Union of all Studio documents and QuipslyNodes in the workspace.",
    backends: [
      { type: "quipsly-lore" },
    ],
  },
  {
    slug: "verified-quotes",
    title: "Verified Quotes",
    description:
      "QuipslyNodes where nodeType is QUOTE and verification status is verified or attributed.",
    backends: [
      {
        type: "quipsly-lore",
        nodeTypes: ["QUOTE"],
      },
    ],
  },
  {
    slug: "active-manuscript",
    title: "Active Manuscript",
    description:
      "The current StudioDocument and its immediate project context. Resolved from cursor position or explicit document ID at query time.",
    backends: [],
  },
] as const;

// ---------------------------------------------------------------------------
// Factory Helpers
// ---------------------------------------------------------------------------

export function createRetrievalResultId(): string {
  return `rr_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function createPacketId(): string {
  return `mrp_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * Create an empty packet for a query that returned no results.
 */
export function createEmptyPacket(input: {
  readonly query: string;
  readonly intent: RetrievalIntent;
  readonly librarySlug: string;
  readonly startTime: number;
}): ManuscriptResearchPacket {
  return {
    packetId: createPacketId(),
    query: input.query,
    intent: input.intent,
    librarySlug: input.librarySlug,
    results: [],
    meta: {
      retrievedAt: new Date().toISOString(),
      durationMs: Date.now() - input.startTime,
      resultCount: 0,
      sourcesCovered: 0,
      truncated: false,
    },
  };
}

/**
 * Type guard: is this provenance from the Studio creative workspace?
 */
export function isStudioProvenance(
  p: RetrievalProvenance,
): p is StudioSpanProvenance | StudioKnowledgeProvenance {
  return p.origin === "studio-span" || p.origin === "studio-knowledge";
}

/**
 * Type guard: is this provenance from the QuipslyNode lore graph?
 */
export function isLoreProvenance(
  p: RetrievalProvenance,
): p is QuipslyNodeProvenance {
  return p.origin === "quipsly-lore";
}

/**
 * Count distinct source origins in a set of results.
 */
export function countSourcesCovered(
  results: readonly RetrievalResult[],
): number {
  const seen = new Set<string>();
  for (const r of results) {
    switch (r.provenance.origin) {
      case "studio-span":
        seen.add(`studio-doc:${r.provenance.documentId}`);
        break;
      case "studio-knowledge":
        seen.add(`studio-kn:${r.provenance.knowledgeNodeId}`);
        break;
      case "quipsly-lore":
        seen.add(`lore:${r.provenance.nodeId}`);
        break;
    }
  }
  return seen.size;
}
