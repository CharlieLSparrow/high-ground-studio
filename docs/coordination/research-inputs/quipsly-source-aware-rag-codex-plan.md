# Quipsly Source-Aware RAG Implementation Plan for Local Codex Agent

Date: 2026-06-05
Repo studied: `CharlieLSparrow/high-ground-studio`
Target agent: local Codex agent working in a fresh branch of the monorepo

## 0. Mission

Implement a source-aware RAG and citation architecture for Quipsly that supports:

- Study documents
- Source libraries
- Immutable source text
- Editable user notes, highlights, and annotations
- Quote provenance
- Research packets
- Retrieval/search results
- Clickable citations
- Citation-safe generated answers
- Future vector/hybrid search without making the MVP depend on embeddings

The system may support freeform AI drafting, but source-aware RAG should make Quipsly more than a black-box writer. Quipsly should be an evidence workbench: it may help users find examples, organize sources, compare ideas, extract quotes, draft summaries, write rough prose, and cite evidence. Every serious generated claim that presents itself as factual or sourced must trace back to stored source records or be marked uncertain.

The implementation should preserve the repo's current architectural north star:

```text
Source material is preserved.
Spans are addressable.
Tags and annotations are overlays.
Decision layers are editable and branchable.
Outputs are projections, not source truth.
Rollback is sacred.
```

This plan is intentionally detailed. Treat it as a coding agent operating manual, not a product one-pager.

---

## 1. Read this repo context first

Before changing files, read these repo documents in order:

```text
AGENTS.md
docs/project-context/current-state.md
docs/architecture/system-overview.md
docs/architecture/platform-service-boundaries.md
docs/architecture/tagged-source-projection-architecture.md
docs/architecture/quipsly-quiplore-foundation.md
docs/plans/quipsly-quiplore-now-next-later.md
docs/agents/quipsly-quiplore-codex-brief.md
docs/deploy/database-migrations.md
```

Important repo facts already observed:

- The repo is a pnpm monorepo with workspaces under `apps/*` and `packages/*`.
- Root scripts already include Quipsly/QuipLore lanes:
  - `pnpm quiplore`
  - `pnpm quiplore:build`
  - `pnpm quiplore:typecheck`
  - `pnpm quipsly:api`
  - `pnpm quipsly:api:build`
  - `pnpm quipsly:api:typecheck`
  - `pnpm quipsly:domain:build`
  - `pnpm quipsly:domain:typecheck`
- The repo uses Prisma 7 with PostgreSQL as the datasource in `prisma/schema.prisma`.
- `apps/quipsly-api` already uses Next route handlers, Prisma 7, `@prisma/adapter-pg`, `pg`, and the shared `@high-ground/quipsly-domain` package.
- `apps/quipsly` already has a private source-tagging prototype with stable blocks, selected spans, offsets, knowledge nodes, auth-gated server actions, and local-development persistence guards.
- `packages/quipsly-domain` already has projection types for quotes, people, sources, evidence, verification, research packets, OpenAPI endpoint catalogs, QuipStream events, and seed data.
- `prisma/schema.prisma` already contains prototype Quipsly graph tables:
  - `QuipslyNode`
  - `QuipLoreEdge`
  - `QuipStreamSession`
  - `QuipStreamEvent`
  - `QuipslyAgent`
  - `AgentTask`
- `prisma/schema.prisma` also contains Studio source/provenance tables:
  - `StudioWorkspace`
  - `StudioProject`
  - `StudioDocument`
  - `StudioDocumentBlock`
  - `StudioTag`
  - `StudioTaggedSpan`
  - `StudioKnowledgeNode`
- Current database migration posture: there is no checked-in `prisma/migrations/` history. The repo currently documents `pnpm db:push` as the apply path, but agents must treat schema changes carefully and explicitly.

---

## 2. Non-negotiables

These are not optional.

### 2.1 Preserve app boundaries

Do not put Quipsly source-aware RAG logic into `apps/web`, `apps/studio`, `packages/worldhub-domain`, or `packages/content-studio-domain`.

Use these lanes:

```text
packages/quipsly-domain
apps/quipsly-api
apps/quipsly
apps/quiplore only where public projection UI needs source/citation display
scripts/quipsly-* for tests or seeds
docs/architecture, docs/plans, docs/runbooks, docs/agents
```

Later worker lane:

```text
apps/quipsly-worker
```

### 2.2 Do not reuse private Studio source tables as public truth

The Studio tables are a very useful pattern, but Quipsly needs its own durable source library. Public or partner-facing Quipsly APIs should not read private Studio source tables directly.

Use Studio as a design reference for:

- stable block IDs
- offsets
- selected text snapshots
- provenance fields
- projection status
- local-only seed guards

Do **not** use Studio as the storage layer for Quipsly source-aware RAG.

### 2.3 Immutable source text, editable overlays

A source revision's extracted normalized text must not be mutated after citations, quotes, or annotations reference it. If source text changes, create a new source revision.

Editable things:

- user notes
- highlights
- annotations
- quote labels
- research packet notes
- generated summaries
- generated drafts
- claim reviews
- packet ordering

Immutable or append-only things:

- source assets
- source revisions
- normalized source text for a revision
- source block text for a revision
- quote `exactText`
- quote offsets and hash
- retrieval result snapshots
- citation targets

### 2.4 No model-generated citations

The backend mints citation IDs from real source records. The model may only use citation IDs supplied in context.

Bad:

```text
The model writes: [Smith 2024, p. 17]
```

Good:

```text
Backend sends: <citation id="cite_abc123" source="Smith" page="17">...</citation>
Model writes: [cite_abc123]
Backend validates that cite_abc123 was actually in the retrieval bundle.
```

### 2.5 No public publishing from generated research without review state

Generated answers, research packets, Quote Passport updates, or QuipLore projections must carry review state. Public projection must be explicit, not accidental.

### 2.6 Do not perform production DB, cloud, secret, provider, or DNS changes inside this implementation without explicit human approval

This plan includes schema and API implementation details, but the agent must pause before:

- changing production database state
- running `pnpm db:push` against a non-local database
- adding live model/provider calls
- creating or mutating GCP resources
- adding or rotating secrets
- publishing public content
- using private HGO or Studio source material as seed data

---

## 3. External technical references used for this plan

These are stable references the agent can reopen if needed.

### 3.1 PostgreSQL full-text search

PostgreSQL provides `to_tsvector`, `tsquery`, ranking functions such as `ts_rank` and `ts_rank_cd`, `websearch_to_tsquery`, and `ts_headline`. It also documents expression GIN indexes for text search.

Useful URLs:

```text
https://www.postgresql.org/docs/current/textsearch-controls.html
https://www.postgresql.org/docs/current/textsearch-tables.html
```

Implementation relevance:

- MVP should use PostgreSQL full-text search before embeddings.
- Use `websearch_to_tsquery('english', $query)` because it tolerates raw user input better than `to_tsquery`.
- Use an expression GIN index such as:

```sql
CREATE INDEX quipsly_source_block_text_fts_idx
ON "QuipslySourceBlock"
USING GIN (to_tsvector('english', coalesce("text", '')));
```

- Query using the same `to_tsvector('english', ...)` expression as the index.

### 3.2 Prisma 7 and PostgreSQL features

Prisma's database feature matrix says expression indexes and fuzzy/phrase full-text search are not fully represented in Prisma schema/client/migrate yet. Unsupported database types can be modeled with `Unsupported(...)` and queried through raw SQL.

Useful URLs:

```text
https://www.prisma.io/docs/orm/reference/database-features
https://www.prisma.io/docs/orm/prisma-schema/data-model/models#unsupported-types
https://www.prisma.io/docs/orm/prisma-schema/postgresql-extensions
```

Implementation relevance:

- Use normal Prisma models for relational source/provenance records.
- Use raw SQL for full-text ranking and expression indexes.
- Add pgvector later using `Unsupported("vector(1536)")?` fields and raw SQL.
- Do not force Prisma to model every database feature if the repo can safely use `$queryRaw` in a narrow data access module.

### 3.3 pgvector

pgvector provides vector similarity search for PostgreSQL. It supports a `vector` column type, nearest-neighbor queries, cosine distance, HNSW indexes, IVFFlat indexes, and several distance operators.

Useful URL:

```text
https://github.com/pgvector/pgvector
```

Implementation relevance:

- pgvector is a strong v2 candidate.
- Do not block MVP on pgvector.
- When added, install extension with:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

- Store embeddings on derived retrieval chunks, not canonical source blocks.
- Query vectors with raw SQL, then fuse with keyword results.

### 3.4 W3C selectors

The W3C selector model defines `TextQuoteSelector` with `exact`, `prefix`, and `suffix`; and `TextPositionSelector` with `start` and `end` offsets. The spec notes that position selectors are brittle when the underlying source changes, which reinforces Quipsly's immutable revision design.

Useful URL:

```text
https://www.w3.org/TR/selectors-states/
```

Implementation relevance:

- Store both offsets and quote selectors when possible.
- Store exact selected text plus prefix/suffix.
- Bind selectors to immutable source revisions.
- For shared/exported packets, avoid copying excessive copyrighted text.

### 3.5 Next.js route handlers

Next.js route handlers use Web `Request` and `Response` APIs, support standard HTTP methods, and dynamic route params are promises in current versions.

Useful URL:

```text
https://nextjs.org/docs/app/api-reference/file-conventions/route
```

Implementation relevance:

- Existing `apps/quipsly-api` route files already use current route handler conventions.
- New API routes should follow the repo's existing `jsonOk`, `jsonError`, and CORS helper pattern.
- Dynamic route handlers should type params as `Promise<{ ... }>` to match the current Next style already present in the repo.

---

## 4. Product architecture summary

Quipsly source-aware RAG should be split into six layers.

```text
1. Source Library Layer
   Original imports, source documents, immutable revisions, source assets, metadata.

2. Evidence Layer
   Source blocks, selectors, highlights, annotations, exact quotes, provenance.

3. Retrieval Layer
   Keyword search first, vector/hybrid later, retrieval result snapshots.

4. Citation Layer
   Backend-minted citation IDs tied to blocks, quotes, retrieval results, or annotations.

5. Synthesis Layer
   Optional model calls that may only cite provided citation IDs.
   MVP may use extractive/stub generation with no live provider calls.

6. Research Packet Layer
   Saved research sessions with source scope, retrieved passages, quotes, notes, generated answer, warnings, and citation map.
```

The current repo already has a quote/product graph. Do not replace it. Add a deeper source archive layer underneath it.

Recommended relationship:

```text
QuipslySourceDocument / QuipslySourceRevision / QuipslySourceBlock
  = durable source archive and evidence layer

QuipslyNode / QuipLoreEdge
  = public/projection graph for quote cards, people, themes, source works, lorelists

ResearchPacket / Citation / QuoteProvenance
  = bridge between source archive, internal research, and eventual public projection
```

---

## 5. MVP scope

### 5.1 Build now

The first implementation should support this vertical slice:

```text
1. Add domain contracts for source-aware RAG.
2. Add additive Prisma models for Quipsly source records, but do not run db push unless local and approved.
3. Add local fixture fallback for API routes when tables are absent or DATABASE_URL is missing.
4. Add text/markdown/manual source ingestion.
5. Add DOCX ingestion using existing mammoth dependency in apps/quipsly, or move mammoth to the API if ingestion lives there.
6. Add simple URL import only if implementation can safely fetch and snapshot raw HTML in a controlled local/API route. Otherwise leave URL ingestion as contract plus mock.
7. Split normalized text into stable source blocks and derived retrieval chunks.
8. Add Postgres full-text search using raw SQL and optional expression GIN index.
9. Add annotations/highlights as editable overlays.
10. Add exact quote extraction with prefix/suffix, offsets, and hash validation.
11. Add backend-minted citations.
12. Add research search endpoint.
13. Add research ask endpoint that returns extractive, citation-safe answers without live model calls by default.
14. Add research packet save/list/read endpoints.
15. Add private Quipsly UI panels for source library, source reader, quote bank, research packet board, citation pill, and evidence panel.
16. Add tests for selectors, quote validation, retrieval scoping, citation validation, packet snapshots.
17. Update OpenAPI seed contract and docs.
```

### 5.2 Defer

Defer these until the source/citation skeleton is reliable:

```text
pgvector embeddings
hybrid RRF in production
LLM provider calls
PDF layout/bounding box precision
OCR
Google Cloud worker/job deployment
public QuipLore citation-driven pages at scale
Zotero/Readwise/Obsidian imports
CSL/BibTeX/RIS export
real multi-user source-library permissions
```

### 5.3 Suggested first demo

A good demo should prove trust, not AI sparkle dust.

Demo flow:

```text
1. Open Quipsly private workbench.
2. Import or load a synthetic/public-safe source.
3. View immutable source blocks in Source Reader.
4. Select text and create a highlight.
5. Convert selected text into a verified quote.
6. Search the source library.
7. Ask: “What does this source say about source trails?”
8. Receive an extractive answer with citation pills.
9. Click citation pill and jump to source block.
10. Save result as a Research Packet.
11. Open packet and see sources, quotes, retrieval results, generated answer, and warnings.
```

---

## 6. File ownership and implementation map

### 6.1 Shared domain package

Add or modify:

```text
packages/quipsly-domain/src/source-aware-rag/types.ts
packages/quipsly-domain/src/source-aware-rag/selectors.ts
packages/quipsly-domain/src/source-aware-rag/hash.ts
packages/quipsly-domain/src/source-aware-rag/chunking.ts
packages/quipsly-domain/src/source-aware-rag/citations.ts
packages/quipsly-domain/src/source-aware-rag/retrieval.ts
packages/quipsly-domain/src/source-aware-rag/packets.ts
packages/quipsly-domain/src/source-aware-rag/index.ts
packages/quipsly-domain/src/index.ts
packages/quipsly-domain/src/openapi.ts
packages/quipsly-domain/src/seed.ts
```

Keep these pure TypeScript. No Prisma client. No Next imports. No provider calls.

### 6.2 API app

Add or modify:

```text
apps/quipsly-api/src/lib/api.ts
apps/quipsly-api/src/lib/prisma.ts
apps/quipsly-api/src/lib/source-rag/source-repository.ts
apps/quipsly-api/src/lib/source-rag/ingestion-service.ts
apps/quipsly-api/src/lib/source-rag/retrieval-service.ts
apps/quipsly-api/src/lib/source-rag/citation-service.ts
apps/quipsly-api/src/lib/source-rag/packet-service.ts
apps/quipsly-api/src/lib/source-rag/fixture-source-rag.ts
apps/quipsly-api/src/lib/source-rag/guards.ts
apps/quipsly-api/src/app/v1/sources/route.ts
apps/quipsly-api/src/app/v1/sources/[sourceDocumentId]/route.ts
apps/quipsly-api/src/app/v1/sources/[sourceDocumentId]/blocks/route.ts
apps/quipsly-api/src/app/v1/annotations/route.ts
apps/quipsly-api/src/app/v1/quotes/provenance/route.ts
apps/quipsly-api/src/app/v1/research/search/route.ts
apps/quipsly-api/src/app/v1/research/ask/route.ts
apps/quipsly-api/src/app/v1/research/packets/route.ts
apps/quipsly-api/src/app/v1/research/packets/[packetId]/route.ts
apps/quipsly-api/src/app/v1/citations/[citationId]/route.ts
apps/quipsly-api/src/app/openapi.json/route.ts
```

### 6.3 Private Quipsly UI app

Add or modify:

```text
apps/quipsly/src/app/source-library/page.tsx
apps/quipsly/src/app/source-library/[sourceDocumentId]/page.tsx
apps/quipsly/src/app/research/page.tsx
apps/quipsly/src/app/research/packets/[packetId]/page.tsx
apps/quipsly/src/components/source-rag/SourceLibraryPanel.tsx
apps/quipsly/src/components/source-rag/SourceReader.tsx
apps/quipsly/src/components/source-rag/SourceBlockCard.tsx
apps/quipsly/src/components/source-rag/AnnotationToolbar.tsx
apps/quipsly/src/components/source-rag/QuoteBank.tsx
apps/quipsly/src/components/source-rag/CitationPill.tsx
apps/quipsly/src/components/source-rag/EvidencePanel.tsx
apps/quipsly/src/components/source-rag/ResearchSearchBox.tsx
apps/quipsly/src/components/source-rag/ResearchPacketBoard.tsx
apps/quipsly/src/components/source-rag/PacketItemCard.tsx
apps/quipsly/src/components/source-rag/SourceTrustBadge.tsx
apps/quipsly/src/components/source-rag/CitationWarningBadge.tsx
```

Potentially integrate into existing root workbench:

```text
apps/quipsly/src/app/studio-workbench-client.tsx
```

Use the existing workbench as a reference. It already has a Source Library placeholder and a Source Document panel with stable blocks and selected spans.

### 6.4 Prisma schema

Modify only after confirming this task is allowed to touch schema:

```text
prisma/schema.prisma
```

Because the repo currently has stop conditions around schema changes, the local Codex agent should stage schema changes but pause before applying them to any non-local DB.

### 6.5 Tests and scripts

Add:

```text
scripts/quipsly-source-selectors.test.mjs
scripts/quipsly-source-chunking.test.mjs
scripts/quipsly-citation-validation.test.mjs
scripts/quipsly-retrieval-fixture.test.mjs
scripts/quipsly-packet-snapshot.test.mjs
```

Optionally update root `package.json` with:

```json
{
  "scripts": {
    "quipsly:source-rag:test": "node --experimental-strip-types --import ./scripts/register-ts-extension-loader.mjs --test scripts/quipsly-source-*.test.mjs scripts/quipsly-citation-*.test.mjs scripts/quipsly-retrieval-*.test.mjs scripts/quipsly-packet-*.test.mjs"
  }
}
```

Only add the script once tests exist.

---

## 7. Domain contracts

Create `packages/quipsly-domain/src/source-aware-rag/types.ts`.

Use string unions, readonly interfaces, and functions similar to the existing `packages/quipsly-domain/src/index.ts` style.

### 7.1 Core IDs

```ts
export type QuipslySourceId = string;
export type QuipslySourceRevisionId = string;
export type QuipslySourceBlockId = string;
export type QuipslyRetrievalChunkId = string;
export type QuipslyAnnotationId = string;
export type QuipslyQuoteProvenanceId = string;
export type QuipslyRetrievalQueryId = string;
export type QuipslyRetrievalResultId = string;
export type QuipslyCitationId = string;
export type QuipslyResearchPacketId = string;
```

### 7.2 Source document types

```ts
export type QuipslySourceDocumentType =
  | "pdf"
  | "web-page"
  | "docx"
  | "markdown"
  | "text"
  | "epub"
  | "audio-transcript"
  | "video-transcript"
  | "user-note-as-source"
  | "imported-highlights"
  | "unknown";

export type QuipslySourceBlockType =
  | "title"
  | "heading"
  | "paragraph"
  | "list-item"
  | "block-quote"
  | "table"
  | "figure-caption"
  | "footnote"
  | "transcript-segment"
  | "ocr-text"
  | "user-note";

export type QuipslyIngestionStatus =
  | "pending"
  | "extracting"
  | "indexing"
  | "ready"
  | "failed";

export type QuipslySourceTrustLevel =
  | "primary"
  | "secondary"
  | "tertiary"
  | "user-authored"
  | "ai-generated"
  | "unknown";
```

### 7.3 Selectors

```ts
export interface QuipslyTextQuoteSelector {
  readonly type: "TextQuoteSelector";
  readonly exact: string;
  readonly prefix?: string;
  readonly suffix?: string;
}

export interface QuipslyTextPositionSelector {
  readonly type: "TextPositionSelector";
  readonly start: number;
  readonly end: number;
}

export interface QuipslyPageSelector {
  readonly type: "PageSelector";
  readonly pageStart?: number;
  readonly pageEnd?: number;
}

export interface QuipslyBoundingBoxSelector {
  readonly type: "BoundingBoxSelector";
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface QuipslyCompositeSelector {
  readonly quote?: QuipslyTextQuoteSelector;
  readonly position?: QuipslyTextPositionSelector;
  readonly page?: QuipslyPageSelector;
  readonly bbox?: QuipslyBoundingBoxSelector;
}
```

### 7.4 Source projections

```ts
export interface QuipslySourceDocumentProjection {
  readonly id: QuipslySourceId;
  readonly sourceType: QuipslySourceDocumentType;
  readonly title: string;
  readonly authors?: readonly string[];
  readonly publicationDate?: string;
  readonly canonicalUrl?: string;
  readonly doi?: string;
  readonly isbn?: string;
  readonly cslJson?: Record<string, unknown>;
  readonly userTags: readonly string[];
  readonly trustLevel: QuipslySourceTrustLevel;
  readonly activeRevisionId?: QuipslySourceRevisionId;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface QuipslySourceRevisionProjection {
  readonly id: QuipslySourceRevisionId;
  readonly sourceDocumentId: QuipslySourceId;
  readonly version: number;
  readonly status: QuipslyIngestionStatus;
  readonly rawTextHash?: string;
  readonly normalizedTextHash?: string;
  readonly extractorName?: string;
  readonly extractorVersion?: string;
  readonly extractionWarnings?: readonly string[];
  readonly importedFromUrl?: string;
  readonly fetchedAt?: string;
  readonly createdAt: string;
}

export interface QuipslySourceBlockProjection {
  readonly id: QuipslySourceBlockId;
  readonly revisionId: QuipslySourceRevisionId;
  readonly sourceDocumentId: QuipslySourceId;
  readonly orderIndex: number;
  readonly blockType: QuipslySourceBlockType;
  readonly text: string;
  readonly textHash: string;
  readonly tokenCount?: number;
  readonly charStart: number;
  readonly charEnd: number;
  readonly pageStart?: number;
  readonly pageEnd?: number;
  readonly sectionPath?: readonly string[];
  readonly metadata?: Record<string, unknown>;
}
```

### 7.5 Annotation and quote projections

```ts
export type QuipslyAnnotationKind =
  | "highlight"
  | "comment"
  | "tag"
  | "question"
  | "todo"
  | "summary-note"
  | "counterpoint";

export type QuipslyAnnotationVisibility =
  | "private"
  | "shared-workspace"
  | "public-packet";

export interface QuipslyAnnotationProjection {
  readonly id: QuipslyAnnotationId;
  readonly sourceDocumentId: QuipslySourceId;
  readonly revisionId: QuipslySourceRevisionId;
  readonly sourceBlockId?: QuipslySourceBlockId;
  readonly kind: QuipslyAnnotationKind;
  readonly visibility: QuipslyAnnotationVisibility;
  readonly noteMarkdown?: string;
  readonly selectedText?: string;
  readonly selectedTextHash?: string;
  readonly selector?: QuipslyCompositeSelector;
  readonly charStart?: number;
  readonly charEnd?: number;
  readonly pageStart?: number;
  readonly pageEnd?: number;
  readonly color?: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type QuipslyQuoteStatus =
  | "verified"
  | "source-changed"
  | "needs-review"
  | "user-edited-display-copy";

export interface QuipslyQuoteProvenanceProjection {
  readonly id: QuipslyQuoteProvenanceId;
  readonly sourceDocumentId: QuipslySourceId;
  readonly revisionId: QuipslySourceRevisionId;
  readonly sourceBlockId: QuipslySourceBlockId;
  readonly exactText: string;
  readonly normalizedHash: string;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly charStart: number;
  readonly charEnd: number;
  readonly pageStart?: number;
  readonly pageEnd?: number;
  readonly selector?: QuipslyCompositeSelector;
  readonly status: QuipslyQuoteStatus;
  readonly displayText?: string;
  readonly label?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

### 7.6 Retrieval, citation, packet projections

```ts
export type QuipslyRetrievalMethod =
  | "keyword"
  | "vector"
  | "hybrid-rrf"
  | "manual-selection"
  | "related-blocks"
  | "citation-backtrace";

export interface QuipslyRetrievalScope {
  readonly sourceDocumentIds?: readonly QuipslySourceId[];
  readonly sourceRevisionIds?: readonly QuipslySourceRevisionId[];
  readonly tags?: readonly string[];
  readonly sourceTypes?: readonly QuipslySourceDocumentType[];
  readonly trustLevels?: readonly QuipslySourceTrustLevel[];
  readonly limit?: number;
}

export interface QuipslyRetrievalQueryProjection {
  readonly id: QuipslyRetrievalQueryId;
  readonly queryText: string;
  readonly normalizedQuery?: string;
  readonly sourceScope?: QuipslyRetrievalScope;
  readonly method: QuipslyRetrievalMethod;
  readonly createdAt: string;
}

export interface QuipslyRetrievalResultProjection {
  readonly id: QuipslyRetrievalResultId;
  readonly retrievalQueryId: QuipslyRetrievalQueryId;
  readonly sourceDocumentId: QuipslySourceId;
  readonly revisionId: QuipslySourceRevisionId;
  readonly sourceBlockId: QuipslySourceBlockId;
  readonly retrievalChunkId?: QuipslyRetrievalChunkId;
  readonly rank: number;
  readonly score?: number;
  readonly keywordScore?: number;
  readonly vectorScore?: number;
  readonly rrfScore?: number;
  readonly rerankScore?: number;
  readonly snapshotText: string;
  readonly snapshotTextHash: string;
  readonly citationId: QuipslyCitationId;
  readonly sourceTitleSnapshot: string;
  readonly locatorLabel?: string;
  readonly createdAt: string;
}

export type QuipslyCitationTargetType =
  | "source-block"
  | "quote"
  | "annotation"
  | "retrieval-result";

export type QuipslyCitationValidationStatus =
  | "valid"
  | "missing-target"
  | "text-mismatch"
  | "not-in-retrieval-context"
  | "needs-review";

export interface QuipslyCitationProjection {
  readonly id: QuipslyCitationId;
  readonly targetType: QuipslyCitationTargetType;
  readonly sourceDocumentId: QuipslySourceId;
  readonly revisionId: QuipslySourceRevisionId;
  readonly sourceBlockId?: QuipslySourceBlockId;
  readonly quoteId?: QuipslyQuoteProvenanceId;
  readonly retrievalResultId?: QuipslyRetrievalResultId;
  readonly displayNumber?: number;
  readonly displayLabel?: string;
  readonly pageStart?: number;
  readonly pageEnd?: number;
  readonly citedTextSnapshot?: string;
  readonly citedTextHash?: string;
  readonly validationStatus: QuipslyCitationValidationStatus;
  readonly createdAt: string;
}

export type QuipslyPacketItemKind =
  | "source-document"
  | "source-block"
  | "quote"
  | "annotation"
  | "retrieval-result"
  | "user-note"
  | "ai-summary"
  | "outline"
  | "claim";
```

---

## 8. Pure domain helpers

### 8.1 Hash helper

Create `packages/quipsly-domain/src/source-aware-rag/hash.ts`.

```ts
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizeForQuoteHash(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}
```

Node version caveat: if `crypto.subtle` causes test/runtime friction in Node, use Node's `node:crypto` in API code and keep domain helper injectable. Do not import Node modules in code that must stay browser-safe unless the package is already browser-excluded.

### 8.2 Selector validation

Create `packages/quipsly-domain/src/source-aware-rag/selectors.ts`.

Functions:

```ts
export function validateTextPositionSelector(input: {
  readonly fullText: string;
  readonly start: number;
  readonly end: number;
}):
  | { readonly ok: true; readonly selectedText: string }
  | { readonly ok: false; readonly reason: string };

export function createTextQuoteSelector(input: {
  readonly fullText: string;
  readonly start: number;
  readonly end: number;
  readonly contextChars?: number;
}):
  | { readonly ok: true; readonly exact: string; readonly prefix: string; readonly suffix: string }
  | { readonly ok: false; readonly reason: string };

export function resolveTextQuoteSelector(input: {
  readonly fullText: string;
  readonly exact: string;
  readonly prefix?: string;
  readonly suffix?: string;
}):
  | { readonly ok: true; readonly start: number; readonly end: number; readonly matchCount: number }
  | { readonly ok: false; readonly reason: string; readonly matchCount?: number };
```

Validation rules:

```text
start and end must be finite integers.
start >= 0.
end > start.
end <= fullText.length.
selectedText must not be empty after trim.
exact selected text must equal fullText.slice(start, end).
Prefix/suffix should be taken from the same source block text, not generated by the model.
If exact+prefix+suffix matches multiple places, return matchCount and needs-review.
```

### 8.3 Chunking helper

Create `packages/quipsly-domain/src/source-aware-rag/chunking.ts`.

MVP chunker:

```ts
export interface SourceBlockForChunking {
  readonly id: string;
  readonly text: string;
  readonly blockType: string;
  readonly sectionPath?: readonly string[];
  readonly pageStart?: number;
  readonly pageEnd?: number;
}

export interface DerivedRetrievalChunk {
  readonly text: string;
  readonly sourceBlockIds: readonly string[];
  readonly tokenEstimate: number;
  readonly orderIndex: number;
  readonly sectionPath?: readonly string[];
}
```

Algorithm:

```text
1. Keep headings attached to following paragraph chunks as context.
2. Combine adjacent paragraph/list blocks until approx 350 to 800 tokens.
3. Use 80 token overlap only when a block is split or a long paragraph forces it.
4. Never let a retrieval chunk become the canonical citation target.
5. Store sourceBlockIds[] on chunk so citations can point back to SourceBlock.
```

Token estimate can use a simple approximation initially:

```ts
export function estimateTokens(text: string): number {
  return Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.33);
}
```

This is good enough for chunk sizing. Replace later if model-specific tokenization becomes important.

### 8.4 Citation validation helper

Create `packages/quipsly-domain/src/source-aware-rag/citations.ts`.

```ts
export function extractCitationIds(markdown: string): readonly string[] {
  const ids = new Set<string>();
  for (const match of markdown.matchAll(/\[(cite_[A-Za-z0-9_-]+)\]/g)) {
    ids.add(match[1]);
  }
  return [...ids];
}

export function validateGeneratedCitationIds(input: {
  readonly markdown: string;
  readonly allowedCitationIds: readonly string[];
}): {
  readonly validCitationIds: readonly string[];
  readonly invalidCitationIds: readonly string[];
};
```

Rules:

```text
Only citation IDs in allowedCitationIds are valid for a generated answer.
Invalid citation IDs are stripped or replaced with [needs source] in strict mode.
Citation IDs are opaque. The model must never generate source metadata.
```

---

## 9. Prisma data model

This is the recommended additive model set. Use `Quipsly*` prefixes to avoid collisions and make the boundary obvious.

Important: stage these changes in `prisma/schema.prisma`, run `pnpm db:generate`, but do not run `pnpm db:push` against anything except a confirmed local development database.

### 9.1 Enums

Append near existing Quipsly enums.

```prisma
enum QuipslySourceDocumentType {
  PDF
  WEB_PAGE
  DOCX
  MARKDOWN
  TEXT
  EPUB
  AUDIO_TRANSCRIPT
  VIDEO_TRANSCRIPT
  USER_NOTE_AS_SOURCE
  IMPORTED_HIGHLIGHTS
  UNKNOWN
}

enum QuipslySourceBlockType {
  TITLE
  HEADING
  PARAGRAPH
  LIST_ITEM
  BLOCK_QUOTE
  TABLE
  FIGURE_CAPTION
  FOOTNOTE
  TRANSCRIPT_SEGMENT
  OCR_TEXT
  USER_NOTE
}

enum QuipslyIngestionStatus {
  PENDING
  EXTRACTING
  INDEXING
  READY
  FAILED
}

enum QuipslySourceTrustLevel {
  PRIMARY
  SECONDARY
  TERTIARY
  USER_AUTHORED
  AI_GENERATED
  UNKNOWN
}

enum QuipslyAnnotationKind {
  HIGHLIGHT
  COMMENT
  TAG
  QUESTION
  TODO
  SUMMARY_NOTE
  COUNTERPOINT
}

enum QuipslyAnnotationVisibility {
  PRIVATE
  SHARED_WORKSPACE
  PUBLIC_PACKET
}

enum QuipslyQuoteStatus {
  VERIFIED
  SOURCE_CHANGED
  NEEDS_REVIEW
  USER_EDITED_DISPLAY_COPY
}

enum QuipslyRetrievalMethod {
  KEYWORD
  VECTOR
  HYBRID_RRF
  MANUAL_SELECTION
  RELATED_BLOCKS
  CITATION_BACKTRACE
}

enum QuipslyCitationTargetType {
  SOURCE_BLOCK
  QUOTE
  ANNOTATION
  RETRIEVAL_RESULT
}

enum QuipslyCitationValidationStatus {
  VALID
  MISSING_TARGET
  TEXT_MISMATCH
  NOT_IN_RETRIEVAL_CONTEXT
  NEEDS_REVIEW
}

enum QuipslyPacketItemKind {
  SOURCE_DOCUMENT
  SOURCE_BLOCK
  QUOTE
  ANNOTATION
  RETRIEVAL_RESULT
  USER_NOTE
  AI_SUMMARY
  OUTLINE
  CLAIM
}

enum QuipslyGeneratedAnswerStatus {
  DRAFT
  NEEDS_REVIEW
  CITATION_WARNING
  VERIFIED_EXTRACTIVE
}
```

### 9.2 Source asset

```prisma
model QuipslySourceAsset {
  id           String   @id @default(cuid())
  workspaceKey String   @default("default")
  storageKey   String?
  originalName String?
  mimeType     String
  sizeBytes    Int?
  sha256       String
  rawText      String?
  metadataJson Json?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  revisions QuipslySourceRevision[]

  @@unique([sha256])
  @@index([workspaceKey, createdAt])
}
```

MVP note:

- `rawText` is acceptable for small manual/text/markdown/DOCX imports.
- For large PDFs and web snapshots, use object storage later and keep only `storageKey` plus hash.
- Do not store private HGO manuscript source material as seed data.

### 9.3 Source document

```prisma
model QuipslySourceDocument {
  id              String                    @id @default(cuid())
  workspaceKey    String                    @default("default")
  projectKey      String?
  sourceType      QuipslySourceDocumentType @default(UNKNOWN)
  trustLevel      QuipslySourceTrustLevel   @default(UNKNOWN)
  title           String
  authorsJson     Json?
  publicationDate DateTime?
  canonicalUrl    String?
  doi             String?
  isbn            String?
  cslJson         Json?
  userTags        String[]
  sourceWorkNodeId String?
  activeRevisionId String?
  createdByLabel  String?
  archivedAt      DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  revisions       QuipslySourceRevision[]
  blocks          QuipslySourceBlock[]
  annotations     QuipslyAnnotation[]
  quoteProvenance QuipslyQuoteProvenance[]
  citations       QuipslyCitation[]
  packetItems     QuipslyResearchPacketItem[]

  @@index([workspaceKey, sourceType, updatedAt])
  @@index([workspaceKey, trustLevel, updatedAt])
  @@index([canonicalUrl])
  @@index([doi])
  @@index([sourceWorkNodeId])
}
```

Notes:

- `sourceWorkNodeId` optionally links to existing `QuipslyNode` rows of type `SOURCE_WORK`.
- Keep source archive truth in these explicit tables, not in `QuipslyNode.payloadJson`.
- `activeRevisionId` is a convenience pointer only. Citations and quotes must reference explicit revision IDs.

### 9.4 Source revision

```prisma
model QuipslySourceRevision {
  id                 String                  @id @default(cuid())
  sourceDocumentId   String
  version            Int
  status             QuipslyIngestionStatus  @default(PENDING)
  sourceAssetId      String?
  rawTextHash        String?
  normalizedTextHash String?
  normalizedText     String?
  extractorName      String?
  extractorVersion   String?
  extractionWarnings Json?
  importedFromUrl    String?
  fetchedAt          DateTime?
  createdByLabel     String?
  createdAt          DateTime @default(now())

  sourceDocument QuipslySourceDocument @relation(fields: [sourceDocumentId], references: [id], onDelete: Cascade)
  sourceAsset    QuipslySourceAsset?   @relation(fields: [sourceAssetId], references: [id], onDelete: SetNull)
  blocks         QuipslySourceBlock[]
  chunks         QuipslyRetrievalChunk[]
  annotations    QuipslyAnnotation[]
  quoteProvenance QuipslyQuoteProvenance[]
  citations      QuipslyCitation[]

  @@unique([sourceDocumentId, version])
  @@index([sourceDocumentId, status])
  @@index([normalizedTextHash])
}
```

Immutable rule:

- After `status = READY`, do not mutate `normalizedText`, `normalizedTextHash`, or block text.
- If extraction logic changes, create `version + 1`.

### 9.5 Source block

```prisma
model QuipslySourceBlock {
  id               String                 @id @default(cuid())
  sourceDocumentId String
  revisionId       String
  orderIndex       Int
  blockType        QuipslySourceBlockType
  text             String
  textHash         String
  tokenCount       Int?
  charStart        Int
  charEnd          Int
  pageStart        Int?
  pageEnd          Int?
  sectionPathJson  Json?
  bboxJson         Json?
  tableJson        Json?
  metadataJson     Json?
  createdAt        DateTime @default(now())

  sourceDocument QuipslySourceDocument @relation(fields: [sourceDocumentId], references: [id], onDelete: Cascade)
  revision       QuipslySourceRevision @relation(fields: [revisionId], references: [id], onDelete: Cascade)
  annotations    QuipslyAnnotation[]
  quoteProvenance QuipslyQuoteProvenance[]
  retrievalResults QuipslyRetrievalResult[]
  citations      QuipslyCitation[]
  packetItems    QuipslyResearchPacketItem[]

  @@unique([revisionId, orderIndex])
  @@index([sourceDocumentId, revisionId, orderIndex])
  @@index([revisionId, textHash])
  @@index([blockType])
}
```

Citation target rule:

- `QuipslySourceBlock` is the default citation target.
- `QuipslyRetrievalChunk` is a search optimization artifact.

### 9.6 Retrieval chunk

```prisma
model QuipslyRetrievalChunk {
  id               String   @id @default(cuid())
  sourceDocumentId String
  revisionId       String
  orderIndex       Int
  text             String
  textHash         String
  sourceBlockIds   String[]
  tokenCount       Int?
  sectionPathJson  Json?
  pageStart        Int?
  pageEnd          Int?
  metadataJson     Json?
  createdAt        DateTime @default(now())

  revision       QuipslySourceRevision @relation(fields: [revisionId], references: [id], onDelete: Cascade)
  retrievalResults QuipslyRetrievalResult[]

  // Add later when pgvector is explicitly approved:
  // embedding Unsupported("vector(1536)")?

  @@unique([revisionId, orderIndex])
  @@index([sourceDocumentId, revisionId, orderIndex])
  @@index([revisionId, textHash])
}
```

### 9.7 Annotation

```prisma
model QuipslyAnnotation {
  id                String                       @id @default(cuid())
  workspaceKey      String                       @default("default")
  userId            String?
  createdByLabel    String?
  sourceDocumentId  String
  revisionId        String
  sourceBlockId     String?
  kind              QuipslyAnnotationKind
  visibility        QuipslyAnnotationVisibility @default(PRIVATE)
  noteMarkdown      String?
  selectedText      String?
  selectedTextHash  String?
  selectorJson      Json?
  charStart         Int?
  charEnd           Int?
  pageStart         Int?
  pageEnd           Int?
  color             String?
  tags              String[]
  archivedAt        DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user           User?                   @relation(fields: [userId], references: [id], onDelete: SetNull)
  sourceDocument QuipslySourceDocument   @relation(fields: [sourceDocumentId], references: [id], onDelete: Cascade)
  revision       QuipslySourceRevision   @relation(fields: [revisionId], references: [id], onDelete: Cascade)
  sourceBlock    QuipslySourceBlock?     @relation(fields: [sourceBlockId], references: [id], onDelete: SetNull)
  citations      QuipslyCitation[]
  packetItems    QuipslyResearchPacketItem[]

  @@index([workspaceKey, sourceDocumentId, createdAt])
  @@index([revisionId, sourceBlockId])
  @@index([userId, kind])
  @@index([archivedAt, updatedAt])
}
```

If Prisma complains because `User` needs a backrelation field, add this to `User`:

```prisma
quipslyAnnotations QuipslyAnnotation[]
```

### 9.8 Quote provenance

```prisma
model QuipslyQuoteProvenance {
  id                String              @id @default(cuid())
  workspaceKey      String              @default("default")
  sourceDocumentId  String
  revisionId        String
  sourceBlockId     String
  quoteNodeId       String?
  exactText         String
  normalizedHash    String
  prefix            String?
  suffix            String?
  charStart         Int
  charEnd           Int
  pageStart         Int?
  pageEnd           Int?
  selectorJson      Json?
  status            QuipslyQuoteStatus  @default(VERIFIED)
  displayText       String?
  label             String?
  createdByLabel    String?
  archivedAt        DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  sourceDocument QuipslySourceDocument @relation(fields: [sourceDocumentId], references: [id], onDelete: Cascade)
  revision       QuipslySourceRevision @relation(fields: [revisionId], references: [id], onDelete: Cascade)
  sourceBlock    QuipslySourceBlock    @relation(fields: [sourceBlockId], references: [id], onDelete: Cascade)
  citations      QuipslyCitation[]
  packetItems    QuipslyResearchPacketItem[]

  @@index([workspaceKey, sourceDocumentId])
  @@index([revisionId, sourceBlockId])
  @@index([quoteNodeId])
  @@index([normalizedHash])
  @@index([status, updatedAt])
}
```

Notes:

- `quoteNodeId` optionally links a quote provenance record to an existing `QuipslyNode` of type `QUOTE`.
- `exactText` is immutable evidence. If a user edits quote display text, store it in `displayText` and mark status accordingly.

### 9.9 Retrieval query and result

```prisma
model QuipslyRetrievalQuery {
  id              String                  @id @default(cuid())
  workspaceKey    String                  @default("default")
  projectKey      String?
  userId          String?
  createdByLabel  String?
  queryText       String
  normalizedQuery String?
  sourceScopeJson Json?
  method          QuipslyRetrievalMethod  @default(KEYWORD)
  createdAt       DateTime @default(now())

  user    User? @relation(fields: [userId], references: [id], onDelete: SetNull)
  results QuipslyRetrievalResult[]
  generatedAnswers QuipslyGeneratedAnswer[]

  @@index([workspaceKey, createdAt])
  @@index([userId, createdAt])
  @@index([method, createdAt])
}

model QuipslyRetrievalResult {
  id                String   @id @default(cuid())
  retrievalQueryId  String
  sourceDocumentId  String
  revisionId        String
  sourceBlockId     String
  retrievalChunkId  String?
  rank              Int
  score             Float?
  keywordScore      Float?
  vectorScore       Float?
  rrfScore          Float?
  rerankScore       Float?
  snapshotText      String
  snapshotTextHash  String
  citationId        String
  sourceTitleSnapshot String
  locatorLabel      String?
  metadataJson      Json?
  createdAt         DateTime @default(now())

  retrievalQuery QuipslyRetrievalQuery @relation(fields: [retrievalQueryId], references: [id], onDelete: Cascade)
  sourceBlock    QuipslySourceBlock    @relation(fields: [sourceBlockId], references: [id], onDelete: Restrict)
  retrievalChunk QuipslyRetrievalChunk? @relation(fields: [retrievalChunkId], references: [id], onDelete: SetNull)
  citations      QuipslyCitation[]
  packetItems    QuipslyResearchPacketItem[]

  @@unique([retrievalQueryId, rank])
  @@index([retrievalQueryId, rank])
  @@index([sourceDocumentId, revisionId])
  @@index([sourceBlockId])
  @@index([citationId])
}
```

If Prisma complains about `User` backrelations, add:

```prisma
quipslyRetrievalQueries QuipslyRetrievalQuery[]
```

### 9.10 Citation

```prisma
model QuipslyCitation {
  id                String                           @id @default(cuid())
  workspaceKey      String                           @default("default")
  targetType        QuipslyCitationTargetType
  sourceDocumentId  String
  revisionId        String
  sourceBlockId     String?
  quoteId           String?
  annotationId      String?
  retrievalResultId String?
  displayNumber     Int?
  displayLabel      String?
  pageStart         Int?
  pageEnd           Int?
  citedTextSnapshot String?
  citedTextHash     String?
  validationStatus  QuipslyCitationValidationStatus @default(VALID)
  metadataJson      Json?
  createdAt         DateTime @default(now())

  sourceDocument  QuipslySourceDocument    @relation(fields: [sourceDocumentId], references: [id], onDelete: Cascade)
  revision        QuipslySourceRevision    @relation(fields: [revisionId], references: [id], onDelete: Cascade)
  sourceBlock     QuipslySourceBlock?      @relation(fields: [sourceBlockId], references: [id], onDelete: SetNull)
  quote           QuipslyQuoteProvenance?  @relation(fields: [quoteId], references: [id], onDelete: SetNull)
  annotation      QuipslyAnnotation?       @relation(fields: [annotationId], references: [id], onDelete: SetNull)
  retrievalResult QuipslyRetrievalResult?  @relation(fields: [retrievalResultId], references: [id], onDelete: SetNull)
  answerCitations QuipslyGeneratedAnswerCitation[]

  @@index([workspaceKey, sourceDocumentId])
  @@index([revisionId, sourceBlockId])
  @@index([quoteId])
  @@index([retrievalResultId])
  @@index([validationStatus, createdAt])
}
```

Validation rule:

```text
For targetType SOURCE_BLOCK, sourceBlockId is required.
For targetType QUOTE, quoteId is required.
For targetType ANNOTATION, annotationId is required.
For targetType RETRIEVAL_RESULT, retrievalResultId is required.
```

Prisma cannot express this cleanly as conditional constraints. Enforce in service code.

### 9.11 Research packet and generated answer

```prisma
model QuipslyResearchPacket {
  id                String   @id @default(cuid())
  workspaceKey      String   @default("default")
  projectKey        String?
  studyDocumentKey  String?
  title             String
  researchQuestion  String?
  sourceScopeJson   Json?
  createdByUserId   String?
  createdByLabel    String?
  archivedAt        DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  createdBy User? @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)
  items     QuipslyResearchPacketItem[]
  answers   QuipslyGeneratedAnswer[]

  @@index([workspaceKey, updatedAt])
  @@index([projectKey, updatedAt])
  @@index([createdByUserId, updatedAt])
  @@index([archivedAt, updatedAt])
}

model QuipslyResearchPacketItem {
  id                String                 @id @default(cuid())
  packetId          String
  kind              QuipslyPacketItemKind
  orderIndex        Int
  sourceDocumentId  String?
  revisionId        String?
  sourceBlockId     String?
  quoteId           String?
  annotationId      String?
  retrievalResultId String?
  title             String?
  bodyMarkdown      String?
  metadataJson      Json?
  createdAt         DateTime @default(now())

  packet          QuipslyResearchPacket   @relation(fields: [packetId], references: [id], onDelete: Cascade)
  sourceDocument  QuipslySourceDocument?  @relation(fields: [sourceDocumentId], references: [id], onDelete: SetNull)
  sourceBlock     QuipslySourceBlock?     @relation(fields: [sourceBlockId], references: [id], onDelete: SetNull)
  quote           QuipslyQuoteProvenance? @relation(fields: [quoteId], references: [id], onDelete: SetNull)
  annotation      QuipslyAnnotation?      @relation(fields: [annotationId], references: [id], onDelete: SetNull)
  retrievalResult QuipslyRetrievalResult? @relation(fields: [retrievalResultId], references: [id], onDelete: SetNull)

  @@unique([packetId, orderIndex])
  @@index([packetId, orderIndex])
  @@index([kind])
  @@index([sourceDocumentId])
}

model QuipslyGeneratedAnswer {
  id                String                      @id @default(cuid())
  packetId          String?
  retrievalQueryId  String?
  status            QuipslyGeneratedAnswerStatus @default(DRAFT)
  promptText        String
  answerMarkdown    String
  sourceScopeJson   Json?
  warningJson       Json?
  modelProvider     String?
  modelName         String?
  generationMode    String                      @default("extractive")
  createdByUserId   String?
  createdByLabel    String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  packet         QuipslyResearchPacket? @relation(fields: [packetId], references: [id], onDelete: SetNull)
  retrievalQuery QuipslyRetrievalQuery? @relation(fields: [retrievalQueryId], references: [id], onDelete: SetNull)
  citations      QuipslyGeneratedAnswerCitation[]

  @@index([packetId, createdAt])
  @@index([retrievalQueryId, createdAt])
  @@index([status, createdAt])
}

model QuipslyGeneratedAnswerCitation {
  id                String @id @default(cuid())
  generatedAnswerId String
  citationId        String
  orderIndex        Int
  citationMarker    String
  validationStatus  QuipslyCitationValidationStatus @default(VALID)
  createdAt         DateTime @default(now())

  generatedAnswer QuipslyGeneratedAnswer @relation(fields: [generatedAnswerId], references: [id], onDelete: Cascade)
  citation        QuipslyCitation        @relation(fields: [citationId], references: [id], onDelete: Restrict)

  @@unique([generatedAnswerId, citationId])
  @@index([generatedAnswerId, orderIndex])
  @@index([citationId])
}
```

If Prisma complains about `User` backrelations, add:

```prisma
quipslyResearchPackets QuipslyResearchPacket[]
```

### 9.12 Optional ingestion job

Add if implementing asynchronous-ish ingestion state even without a worker:

```prisma
model QuipslyIngestionJob {
  id               String                 @id @default(cuid())
  workspaceKey     String                 @default("default")
  sourceDocumentId String?
  sourceRevisionId String?
  status           QuipslyIngestionStatus @default(PENDING)
  jobKind          String                 @default("import")
  inputJson        Json
  resultJson       Json?
  errorMessage     String?
  requestedByLabel String?
  requestedAt      DateTime @default(now())
  startedAt        DateTime?
  completedAt      DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([workspaceKey, status, requestedAt])
  @@index([sourceDocumentId])
  @@index([sourceRevisionId])
}
```

---

## 10. Raw SQL indexes and future pgvector SQL

Because the repo currently does not use checked-in migrations, do not create a migration file unless the human explicitly asks to switch migration posture. Instead, document SQL in a runbook or a SQL file under `docs/runbooks` or `scripts/sql`.

Recommended file:

```text
docs/runbooks/quipsly-source-rag-local-db.md
scripts/sql/quipsly-source-rag-indexes.sql
```

### 10.1 Full-text expression indexes

```sql
-- Run only against a confirmed local Quipsly development database.

CREATE INDEX IF NOT EXISTS quipsly_source_block_text_fts_idx
ON "QuipslySourceBlock"
USING GIN (to_tsvector('english', coalesce("text", '')));

CREATE INDEX IF NOT EXISTS quipsly_retrieval_chunk_text_fts_idx
ON "QuipslyRetrievalChunk"
USING GIN (to_tsvector('english', coalesce("text", '')));
```

### 10.2 Optional trigram support later

Useful for fuzzy title/source search, not first MVP.

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS quipsly_source_document_title_trgm_idx
ON "QuipslySourceDocument"
USING GIN ("title" gin_trgm_ops);
```

### 10.3 Future pgvector

Do not implement until the MVP citation path is stable.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "QuipslyRetrievalChunk"
ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

CREATE INDEX IF NOT EXISTS quipsly_retrieval_chunk_embedding_hnsw_idx
ON "QuipslyRetrievalChunk"
USING hnsw ("embedding" vector_cosine_ops);
```

Prisma model field when approved:

```prisma
embedding Unsupported("vector(1536)")?
```

---

## 11. API service design

Use the existing `apps/quipsly-api/src/lib/api.ts` conventions:

- `jsonOk(data)`
- `jsonError(message, status)`
- `withCorsInit`
- `optionsResponse`
- current CORS style

### 11.1 API behavior modes

Implement three modes:

```text
1. Fixture mode
   No DATABASE_URL or source tables unavailable.
   Return public-safe synthetic data.

2. Local database mode
   DATABASE_URL exists and tables exist.
   Reads/writes source records.

3. Production-safe mode
   Reads only until production write policy is explicitly reviewed.
```

Add helper:

```ts
export function isQuipslySourceWritesEnabled(): boolean {
  return process.env.QUIPSLY_SOURCE_WRITES_ENABLED === "1";
}

export function shouldUseSourceFixtureMode(error: unknown): boolean {
  // true for missing env, Prisma init failure, missing table error during local prototype
}
```

Do not make this silent in UI. Responses should include `meta.persistence`:

```json
{
  "data": { ... },
  "meta": {
    "service": "quipsly-api",
    "prototype": true,
    "persistence": "fixture" | "database",
    "warnings": []
  }
}
```

The existing `jsonOk` currently always includes `service` and `prototype`. Extend it carefully or add `jsonOkWithMeta`.

### 11.2 Source routes

#### `GET /v1/sources`

Query params:

```text
q?: string
type?: source type
trust?: trust level
tag?: string
limit?: number
```

Response:

```json
{
  "sources": [
    {
      "id": "src_...",
      "title": "Synthetic Source Trail Seed",
      "sourceType": "text",
      "trustLevel": "user-authored",
      "authors": ["Quipsly Seed"],
      "userTags": ["sourcecraft"],
      "activeRevisionId": "rev_...",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "count": 1
}
```

#### `POST /v1/sources`

MVP JSON body:

```json
{
  "sourceType": "text",
  "title": "Source title",
  "text": "Full source text here",
  "authors": ["Author Name"],
  "canonicalUrl": "https://example.com/source",
  "userTags": ["sourcecraft"],
  "trustLevel": "primary"
}
```

Server behavior:

```text
1. Check writes enabled.
2. Normalize source type.
3. Hash raw and normalized text.
4. Create SourceDocument.
5. Create SourceAsset if text/file snapshot is present.
6. Create SourceRevision v1.
7. Create SourceBlock rows.
8. Create RetrievalChunk rows.
9. Return source with blocks count.
```

If writes are disabled:

```json
{
  "error": {
    "message": "Quipsly source writes are disabled. Set QUIPSLY_SOURCE_WRITES_ENABLED=1 for local development."
  }
}
```

#### `GET /v1/sources/{sourceDocumentId}`

Return source, active revision, stats, recent annotations, and block count.

#### `GET /v1/sources/{sourceDocumentId}/blocks`

Query params:

```text
revisionId?: string
q?: string
limit?: number
includeText?: boolean
```

Return ordered source blocks. If `q` is present, highlight matches with sanitized text snippets.

### 11.3 Annotation route

#### `POST /v1/annotations`

Body:

```json
{
  "sourceDocumentId": "src_...",
  "revisionId": "rev_...",
  "sourceBlockId": "block_...",
  "kind": "highlight",
  "noteMarkdown": "This is important because...",
  "charStart": 40,
  "charEnd": 120,
  "tags": ["theme:sourcecraft"],
  "color": "gold"
}
```

Server behavior:

```text
1. Load block.
2. Validate revision/block/source relationship.
3. Validate offsets.
4. Compute selectedText from block text.
5. Create TextQuoteSelector with exact/prefix/suffix.
6. Hash selectedText.
7. Store annotation.
```

### 11.4 Quote provenance route

#### `POST /v1/quotes/provenance`

Body:

```json
{
  "sourceDocumentId": "src_...",
  "revisionId": "rev_...",
  "sourceBlockId": "block_...",
  "charStart": 40,
  "charEnd": 120,
  "label": "Definition of source trail",
  "quoteNodeId": "optional-existing-quip-node"
}
```

Server behavior:

```text
1. Load block.
2. Validate offsets.
3. exactText = block.text.slice(charStart, charEnd).
4. Build selector.
5. Hash normalized quote.
6. Store QuipslyQuoteProvenance.
7. Mint QuipslyCitation targeting the quote.
8. Return quote plus citation.
```

### 11.5 Research search route

#### `POST /v1/research/search`

Body:

```json
{
  "query": "source trail",
  "sourceScope": {
    "sourceDocumentIds": ["src_..."],
    "trustLevels": ["primary", "user-authored"],
    "limit": 8
  },
  "method": "keyword"
}
```

Server behavior:

```text
1. Create QuipslyRetrievalQuery row.
2. Search source blocks using keyword SQL.
3. For each result, mint citation ID.
4. Store QuipslyRetrievalResult snapshot rows.
5. Return results with citation IDs.
```

Keyword SQL example:

```ts
const rows = await prisma.$queryRaw<KeywordSearchRow[]>`
  WITH query AS (
    SELECT websearch_to_tsquery('english', ${queryText}) AS q
  )
  SELECT
    b."id" AS "sourceBlockId",
    b."sourceDocumentId",
    b."revisionId",
    b."text",
    b."textHash",
    b."pageStart",
    b."pageEnd",
    d."title" AS "sourceTitle",
    ts_rank_cd(to_tsvector('english', coalesce(b."text", '')), query.q) AS "keywordScore"
  FROM "QuipslySourceBlock" b
  JOIN "QuipslySourceDocument" d ON d."id" = b."sourceDocumentId"
  CROSS JOIN query
  WHERE to_tsvector('english', coalesce(b."text", '')) @@ query.q
    AND b."sourceDocumentId" = ANY(${sourceDocumentIds})
  ORDER BY "keywordScore" DESC, b."orderIndex" ASC
  LIMIT ${limit};
`;
```

If `sourceDocumentIds` is empty, omit the `ANY` filter. Use carefully built conditional SQL helpers. Do not concatenate raw user input.

### 11.6 Research ask route

#### `POST /v1/research/ask`

Body:

```json
{
  "question": "What does this source say about source trails?",
  "sourceScope": {
    "sourceDocumentIds": ["src_..."]
  },
  "mode": "study",
  "savePacket": true
}
```

MVP behavior without live model calls:

```text
1. Run research search.
2. Create an extractive answer from top 3 to 5 blocks.
3. Every paragraph cites one or more backend-minted citation IDs.
4. Validate citation IDs.
5. Save generated answer and citation map.
6. If savePacket true, create packet with query, results, answer, and citations.
```

Example extractive answer formatter:

```text
The strongest matching source passages describe source trails as a way to keep original wording close enough for later review [cite_abc123]. They also frame projection as an approval path rather than a shortcut, which means public outputs should preserve review state and source context [cite_def456].
```

Later LLM provider behavior:

```text
1. Build context from RetrievalResult rows.
2. Assign citation IDs server-side.
3. Prompt model to use only those IDs.
4. Parse generated answer.
5. Validate all citation IDs against retrieval context.
6. Mark answer CITATION_WARNING if any invalid ID appears.
7. Never accept model-generated URLs or bibliography metadata as citations.
```

Provider calls should be behind:

```text
QUIPSLY_MODEL_GENERATION_ENABLED=1
QUIPSLY_MODEL_PROVIDER=vertex | openai | other
```

Do not implement live calls unless explicitly approved.

### 11.7 Research packets routes

#### `GET /v1/research/packets`

Query params:

```text
q?: string
projectKey?: string
limit?: number
```

Return packet list.

#### `POST /v1/research/packets`

Create a packet manually.

Body:

```json
{
  "title": "Source trail research",
  "researchQuestion": "How should source trails be preserved?",
  "sourceScope": {
    "sourceDocumentIds": ["src_..."]
  },
  "items": []
}
```

#### `GET /v1/research/packets/{packetId}`

Return packet, items, generated answers, citations, source summaries, and warnings.

### 11.8 Citation route

#### `GET /v1/citations/{citationId}`

Return citation target with enough information for clickable UI:

```json
{
  "citation": {
    "id": "cite_...",
    "displayLabel": "Synthetic Source Trail Seed, block 2",
    "targetType": "source-block",
    "validationStatus": "valid",
    "source": {
      "id": "src_...",
      "title": "Synthetic Source Trail Seed"
    },
    "block": {
      "id": "block_...",
      "text": "...",
      "pageStart": null,
      "sectionPath": ["Source trails"]
    }
  }
}
```

---

## 12. Repository services

### 12.1 `source-repository.ts`

Own all Prisma interaction for source documents, revisions, blocks, annotations, quotes, citations, retrievals, packets.

Do not scatter Prisma queries across route files.

Suggested exports:

```ts
export async function listSourceDocuments(input: ListSourceDocumentsInput): Promise<ListSourceDocumentsResult>;
export async function createTextSource(input: CreateTextSourceInput): Promise<CreateTextSourceResult>;
export async function getSourceDocument(input: GetSourceDocumentInput): Promise<GetSourceDocumentResult | null>;
export async function listSourceBlocks(input: ListSourceBlocksInput): Promise<ListSourceBlocksResult>;
export async function createAnnotation(input: CreateAnnotationInput): Promise<CreateAnnotationResult>;
export async function createQuoteProvenance(input: CreateQuoteProvenanceInput): Promise<CreateQuoteProvenanceResult>;
export async function createRetrievalQuery(input: CreateRetrievalQueryInput): Promise<RetrievalQueryRecord>;
export async function createRetrievalResult(input: CreateRetrievalResultInput): Promise<RetrievalResultRecord>;
export async function createCitation(input: CreateCitationInput): Promise<CitationRecord>;
export async function createResearchPacket(input: CreateResearchPacketInput): Promise<ResearchPacketRecord>;
```

### 12.2 `ingestion-service.ts`

Own extraction and block creation.

Suggested exports:

```ts
export function normalizeSourceText(input: string): string;
export function splitNormalizedTextIntoBlocks(input: SplitSourceInput): readonly SourceBlockDraft[];
export function deriveRetrievalChunks(input: DeriveChunksInput): readonly RetrievalChunkDraft[];
export async function ingestTextSource(input: IngestTextSourceInput): Promise<IngestTextSourceResult>;
```

MVP splitter:

```text
1. Normalize CRLF to LF.
2. Trim trailing whitespace per line.
3. Collapse 3+ blank lines to 2 blank lines.
4. Split on blank lines.
5. Detect headings by markdown heading syntax or short title-like lines.
6. Create paragraph/list/heading blocks.
7. Track charStart/charEnd in normalized full text.
8. Hash each block text.
```

Block splitting pseudo-code:

```ts
export function splitNormalizedTextIntoBlocks(input: {
  readonly normalizedText: string;
}): SourceBlockDraft[] {
  const blocks: SourceBlockDraft[] = [];
  const regex = /([^\n](?:.|\n)*?)(?:\n{2,}|$)/g;
  for (const match of input.normalizedText.matchAll(regex)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    const start = match.index ?? input.normalizedText.indexOf(raw);
    const end = start + raw.length;
    blocks.push({
      orderIndex: blocks.length + 1,
      blockType: inferBlockType(raw),
      text: raw,
      charStart: start,
      charEnd: end,
      sectionPath: currentSectionPath,
    });
  }
  return blocks;
}
```

Be careful with offsets. The code above is concept only; write tests that prove offsets round-trip.

### 12.3 `retrieval-service.ts`

Own keyword search and later vector/hybrid.

Suggested exports:

```ts
export async function searchSourceBlocks(input: SearchSourceBlocksInput): Promise<SearchSourceBlocksResult>;
export async function runKeywordRetrieval(input: RunRetrievalInput): Promise<RunRetrievalResult>;
export function reciprocalRankFusion(input: RrfInput): readonly FusedResult[];
```

MVP:

```text
Use source blocks for search.
Store retrieval snapshots.
Mint citations for retrieval results.
Return adjacent block IDs in metadata but do not automatically cite adjacent blocks unless retrieved or manually selected.
```

Later:

```text
Search retrieval chunks semantically.
Backtrace to source blocks.
Fuse keyword and vector with RRF.
Rerank top candidates.
```

### 12.4 `citation-service.ts`

Own citation creation, validation, and display mapping.

Suggested exports:

```ts
export function buildCitationDisplayLabel(input: CitationDisplayInput): string;
export async function mintSourceBlockCitation(input: MintBlockCitationInput): Promise<CitationRecord>;
export async function mintQuoteCitation(input: MintQuoteCitationInput): Promise<CitationRecord>;
export async function mintRetrievalResultCitation(input: MintRetrievalCitationInput): Promise<CitationRecord>;
export async function validateCitationRecord(input: ValidateCitationInput): Promise<CitationValidationResult>;
export function validateGeneratedAnswerCitations(input: ValidateAnswerCitationsInput): ValidateAnswerCitationsResult;
```

Validation logic:

```text
Source block citation:
  - sourceBlockId exists
  - sourceBlock.revisionId === citation.revisionId
  - textHash matches citation.citedTextHash if stored

Quote citation:
  - quote exists
  - quote.exactText equals sourceBlock.text slice charStart-charEnd
  - normalized hash matches

Retrieval citation:
  - retrievalResult exists
  - retrievalResult.citationId === citation.id
  - retrievalResult snapshot hash matches

Generated answer:
  - every [cite_*] ID exists
  - every cited ID was in the allowed retrieval context for this answer
  - invalid IDs become warnings
```

### 12.5 `packet-service.ts`

Own packet snapshots.

Rules:

```text
Packet items preserve order.
Retrieval result items point to stored retrieval result rows, not just current source text.
Generated answer item stores exact answer markdown and citation map.
Packet should remain understandable even if source document receives a new revision later.
```

---

## 13. UI plan for `apps/quipsly`

The private Quipsly UI already has a Source Library placeholder and source block tagging workbench. Build from that pattern.

### 13.1 Source Library page

Route:

```text
apps/quipsly/src/app/source-library/page.tsx
```

Server component loads source list from API or direct server service. Since `apps/quipsly` and `apps/quipsly-api` are separate apps, prefer an internal client helper that can point at `QUIPSLY_API_ORIGIN`.

For local prototype, direct fixture import is acceptable if documented, but API-first is cleaner.

UI sections:

```text
Header:
  Quipsly Source Library
  Persistence badge: fixture/database
  Import source button

Left/center:
  Search input
  Filters: type, trust level, tag
  Source cards

Right:
  Selected source summary
  Recent annotations
  Recent quotes
  Research packet actions
```

### 13.2 Source Reader page

Route:

```text
apps/quipsly/src/app/source-library/[sourceDocumentId]/page.tsx
```

UI:

```text
Source metadata header
Revision selector
Warning banner if source has extraction warnings
Block list with stable block ids
Search within source
Click block to select
Text selection toolbar
Annotations margin
Quote bank side panel
```

Selection behavior:

```text
1. User selects text inside one SourceBlock.
2. UI computes charStart/charEnd relative to block text.
3. Toolbar offers Highlight, Comment, Quote, Ask about this.
4. Creating annotation calls POST /v1/annotations.
5. Creating quote calls POST /v1/quotes/provenance.
6. Response returns citation ID.
```

Do not implement cross-block selection in MVP. If selection crosses blocks, show:

```text
Multi-block selection is not wired yet. Select within one source block for durable citation.
```

### 13.3 Research page

Route:

```text
apps/quipsly/src/app/research/page.tsx
```

UI:

```text
Question/search box
Source scope selector
Mode: Search only | Ask with citations | Compare selected sources
Results list
Generated answer area
Evidence panel
Save as packet button
```

### 13.4 Research Packet page

Route:

```text
apps/quipsly/src/app/research/packets/[packetId]/page.tsx
```

UI:

```text
Packet title and research question
Source scope summary
Generated answers
Evidence panel
Quote bank
Retrieval result ledger
Warnings
Export buttons disabled or stubbed initially
```

### 13.5 CitationPill component

Props:

```ts
type CitationPillProps = {
  readonly citationId: string;
  readonly displayLabel?: string;
  readonly validationStatus: "valid" | "missing-target" | "text-mismatch" | "not-in-retrieval-context" | "needs-review";
  readonly onOpenCitation?: (citationId: string) => void;
};
```

Behavior:

```text
Valid citation: clickable source-color pill.
Needs review: warning pill.
Invalid/missing: danger pill.
Hover/focus shows quote preview if loaded.
Click opens EvidencePanel focused on citation target.
```

### 13.6 EvidencePanel component

Tabs:

```text
Sources
Quotes
Claims
Retrieval
Warnings
```

Minimum MVP:

```text
Sources: source titles and revision IDs
Quotes: exact quote cards
Retrieval: raw retrieval blocks with scores and citation IDs
Warnings: invalid citation IDs, source changed, quote mismatch, unsupported claims
```

### 13.7 Visual style

Follow existing Quipsly/QuipLore direction:

```text
warm archive
paper/card UI
trust-forward evidence badges
source uncertainty visible
charm layered over rigor, never replacing it
```

Avoid:

```text
generic AI gradient surfaces
loose meme quote styling
public-looking output for unreviewed research
hidden source uncertainty
```

---

## 14. API OpenAPI update

Update `packages/quipsly-domain/src/seed.ts` with new endpoint catalog items.

Add endpoints:

```ts
{
  id: "api-sources-list",
  method: "GET",
  path: "/v1/sources",
  group: "Research",
  title: "List source documents",
  description: "Returns source library records with active revision and trust metadata.",
  gatewayUse: "Private/source-aware research surface before public projection.",
  example: {
    label: "Sourcecraft sources",
    path: "/v1/sources?q=sourcecraft&limit=10",
    description: "Searches the Quipsly source library."
  }
}
```

Add similar items for:

```text
POST /v1/sources
GET /v1/sources/{sourceDocumentId}
GET /v1/sources/{sourceDocumentId}/blocks
POST /v1/annotations
POST /v1/quotes/provenance
POST /v1/research/search
POST /v1/research/ask
GET /v1/research/packets
POST /v1/research/packets
GET /v1/research/packets/{packetId}
GET /v1/citations/{citationId}
```

Update `packages/quipsly-domain/src/openapi.ts`:

- Add request body schemas for new POST endpoints.
- Add query params for source list, blocks, packet list.
- Add path parameter support for `sourceDocumentId`, `packetId`, and `citationId`.
- Consider grouping source-aware routes under tag `Research` for now, or add a new `Sources` group.

Recommended answer: add `Sources` as a new group. Keep research routes in `Research`.

---

## 15. Fixture data

Add public-safe synthetic fixture data. Do not use private Studio/HGO source content.

Create:

```text
packages/quipsly-domain/src/source-aware-rag/fixtures.ts
```

Fixture source text:

```text
# Source trails

A source trail is the visible path from a claim back to the wording that supports it. A useful research assistant should keep original wording close enough that later editors can test the meaning before turning it into a public projection.

# Immutable sources

When source text changes, the archive should create a new revision instead of rewriting the old one. Notes, highlights, and packet decisions can remain editable overlays, but the cited evidence should keep its revision, offset, and text hash.

# Citation discipline

A citation is not a decoration. It is a claim about evidence. If an assistant cannot point to the source block that supports a sentence, the sentence should carry a needs-source warning instead of a polished footnote.
```

Create fixture projections for:

```text
SourceDocument
SourceRevision
SourceBlock[]
RetrievalChunk[]
Annotation[]
QuoteProvenance[]
Citation[]
ResearchPacket
```

Use the fixture in API fallback mode and UI demos.

---

## 16. Ingestion details

### 16.1 MVP import types

Implement these first:

```text
manual text
markdown
small plain text upload or paste
DOCX if using mammoth from apps/quipsly or adding it to apps/quipsly-api
```

Leave PDF as a contract unless the human explicitly wants it in this sprint.

Suggested answer for PDF:

```text
Add PDF extraction in phase 2 using a layout-aware extractor. For MVP, citation architecture matters more than PDF layout fidelity.
```

### 16.2 DOCX ingestion

`apps/quipsly` already depends on `mammoth`. If DOCX ingestion lives in the API, add `mammoth` to `apps/quipsly-api/package.json` or move ingestion to `apps/quipsly` server actions.

Suggested answer:

```text
Keep ingestion in apps/quipsly-api so source creation, blocks, retrieval chunks, and citation IDs all live behind one service boundary. Add mammoth to apps/quipsly-api only when implementing DOCX import.
```

### 16.3 URL ingestion

MVP can accept URL metadata with pasted text. Do not build arbitrary web fetching unless needed.

If implementing URL fetch:

```text
1. Fetch with timeout.
2. Store canonical URL and fetchedAt.
3. Store raw HTML snapshot only if rights/use policy is understood.
4. Extract readable text.
5. Create SourceRevision.
6. Refetch creates new revision, never overwrite.
```

### 16.4 Normalization policy

Normalize enough for stable offsets, not so much that the quote stops matching.

MVP rules:

```text
- Convert CRLF and CR to LF.
- Trim trailing spaces from lines.
- Collapse 3+ blank lines to 2 blank lines.
- Preserve punctuation and casing.
- Preserve paragraph order.
- Do not smarten quotes or alter hyphen/dash characters.
```

Store both `rawTextHash` and `normalizedTextHash`.

---

## 17. Search and retrieval architecture

### 17.1 MVP keyword retrieval

Use PostgreSQL full-text search over `QuipslySourceBlock.text`.

Why blocks first:

```text
- Blocks are stable citation targets.
- Search results can be clicked directly.
- Citation IDs can point to one block.
- It is easier to validate quote offsets.
```

Later, use retrieval chunks for recall and reranking.

### 17.2 Retrieval result storage

Every retrieval used for an answer should be stored.

Store:

```text
query text
source scope
method
rank
score
source document/revision/block IDs
snapshot text
snapshot hash
citation ID
createdAt
```

This makes research packets reproducible.

### 17.3 Hybrid later

Future pipeline:

```text
1. Keyword search top 40.
2. Vector search top 40.
3. Reciprocal Rank Fusion.
4. Optional reranker.
5. Send top 8 to 12 passages to generator.
6. Store all retrieval paths and scores.
```

RRF formula:

```ts
export function rrfScore(rank: number, k = 60): number {
  return 1 / (k + rank);
}
```

Combined:

```ts
score = rrfScore(keywordRank) + rrfScore(vectorRank)
```

### 17.4 Search security and scoping

Every search must include a source scope or workspace key.

Never search all workspaces by default once multi-user libraries exist.

MVP can use:

```text
workspaceKey = "default"
```

But design service signatures as if workspace scoping exists.

---

## 18. Citation-safe synthesis

### 18.1 Extractive MVP

Do not wait for model provider integration. The first “ask” endpoint can be extractive and still prove the core product.

Algorithm:

```text
1. Retrieve top N source blocks.
2. Group top blocks by source document.
3. Build 1 to 3 short answer paragraphs using source block snippets.
4. Append citation IDs to each paragraph.
5. Include a warning if fewer than 2 useful results are found.
6. Save GeneratedAnswer with generationMode = "extractive".
```

Example:

```ts
function buildExtractiveAnswer(results: RetrievalResultRecord[], question: string): string {
  if (results.length === 0) {
    return "I could not find enough source evidence to answer this from the selected library. [needs source]";
  }

  return results.slice(0, 3).map((result) => {
    const sentence = summarizeBlockExtractively(result.snapshotText);
    return `${sentence} [${result.citationId}]`;
  }).join("\n\n");
}
```

### 18.2 Later LLM prompt contract

When provider calls are approved, use this strict context format:

```text
You are Quipsly, a source-grounded research assistant.
Use only the provided source passages.
Every factual claim must cite one or more citation IDs.
Use citation IDs exactly as provided, e.g. [cite_abc123].
Do not invent URLs, titles, authors, page numbers, or citations.
If the sources do not support an answer, say what is missing.

Source passages:
<citation id="cite_abc123" source="Synthetic Source Trail Seed" blockId="block_123" page="">
A source trail is the visible path from a claim back to the wording that supports it...
</citation>
```

Post-generation validator:

```text
- Extract all [cite_*] markers.
- Reject markers not included in allowed citation IDs.
- Mark answer CITATION_WARNING if invalid markers appear.
- Mark unsupported claims in future strict mode.
```

---

## 19. Avoiding hallucinated citations and citation laundering

### 19.1 Hallucinated citation

A citation is hallucinated if:

```text
- citation ID does not exist
- citation ID was not in the retrieval context
- citation target is missing
- citation target text does not match stored source text
- model generated a URL/title/page number not supplied by backend
```

### 19.2 Citation laundering

Citation laundering happens when a source is attached to a claim merely because it was retrieved, not because the cited passage supports the claim.

MVP mitigation:

```text
- Cite passage-level SourceBlock or Quote, not whole library.
- Keep retrieval result snapshots visible.
- Show evidence panel.
- Require generated answer citations to come from retrieval context.
- Include warnings for low evidence.
```

Later strict mode:

```text
- Split generated answer into claims.
- Ask verifier whether cited passage supports each claim.
- Mark weak support.
- Require user review before public projection.
```

---

## 20. Rights and source text caution

Do not turn shared/public packets into quote dumps.

Rules:

```text
Private workspace can store selected text for utility and provenance.
Public packet exports should limit quoted text length.
For copyrighted sources, prefer page/block locator and short excerpt over large copied passages.
Store exact quote for validation, but gate public display/export by visibility and rights policy.
```

Add fields now or later:

```text
rightsStatus
rightsNotes
publicExcerptAllowed
maxPublicQuoteChars
```

Suggested MVP: include rights metadata in `metadataJson`, then promote to explicit fields if product pressure appears.

---

## 21. Integration with current quote graph

Existing `QuipslyNode` and `QuipLoreEdge` should stay useful.

Recommended use:

```text
QuipslySourceDocument.sourceWorkNodeId -> QuipslyNode SOURCE_WORK
QuipslyQuoteProvenance.quoteNodeId -> QuipslyNode QUOTE
QuipslyCitation -> real evidence behind Quote Passport / research packet
```

Do not store source block text in `QuipslyNode.payloadJson`. That payload should remain projection data.

Future projection flow:

```text
SourceDocument + SourceBlock + QuoteProvenance
  -> verified citation/evidence record
  -> QuipslyNode quote/source payload update candidate
  -> ResearchPacket decision log
  -> human review
  -> public Quote Passport projection
```

---

## 22. Implementation phases

### Phase 0: Setup and verification

Commands:

```bash
git status --short
git branch --show-current
pnpm install
pnpm quipsly:domain:typecheck
pnpm quipsly:api:typecheck
pnpm --filter quipsly typecheck
```

Read:

```text
AGENTS.md
docs/agents/quipsly-quiplore-codex-brief.md
docs/plans/quipsly-quiplore-now-next-later.md
docs/deploy/database-migrations.md
```

Create branch:

```bash
git switch -c codex/quipsly-source-aware-rag-001 origin/main
```

### Phase 1: Domain-only source-aware RAG package additions

Implement:

```text
packages/quipsly-domain/src/source-aware-rag/*
```

Add exports from:

```text
packages/quipsly-domain/src/index.ts
```

Add tests for pure helpers.

Validation:

```bash
pnpm quipsly:domain:typecheck
node --experimental-strip-types --import ./scripts/register-ts-extension-loader.mjs --test scripts/quipsly-source-selectors.test.mjs
```

### Phase 2: Fixture API routes

Implement fixture-backed routes first, using `fixture-source-rag.ts`.

Routes:

```text
GET /v1/sources
GET /v1/sources/{sourceDocumentId}
GET /v1/sources/{sourceDocumentId}/blocks
POST /v1/research/search
POST /v1/research/ask
GET /v1/citations/{citationId}
```

This proves API contract without DB mutation.

Validation:

```bash
pnpm quipsly:api:typecheck
pnpm quipsly:api:build
```

### Phase 3: Add Prisma schema models

Modify `prisma/schema.prisma` with additive Quipsly models.

Run:

```bash
pnpm db:generate
pnpm quipsly:api:typecheck
```

Pause before `pnpm db:push`. Human approval required unless clearly local.

### Phase 4: Database-backed source ingestion and search

Once local DB schema is applied:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm db:push
```

Only if local database is confirmed.

Then implement:

```text
source-repository.ts
ingestion-service.ts
retrieval-service.ts
citation-service.ts
packet-service.ts
```

### Phase 5: Private Quipsly UI

Implement pages and components in `apps/quipsly`.

Start with:

```text
source-library/page.tsx
source-library/[sourceDocumentId]/page.tsx
research/page.tsx
```

Keep UI private and clearly labeled as prototype/database/fixture.

Validation:

```bash
pnpm --filter quipsly typecheck
pnpm --filter quipsly build
```

### Phase 6: OpenAPI and docs

Update:

```text
packages/quipsly-domain/src/seed.ts
packages/quipsly-domain/src/openapi.ts
docs/architecture/quipsly-quiplore-foundation.md
docs/plans/quipsly-quiplore-now-next-later.md
docs/agents/quipsly-quiplore-codex-brief.md
docs/runbooks/quipsly-source-rag-local-db.md
```

Validation:

```bash
pnpm quipsly:domain:typecheck
pnpm quipsly:api:typecheck
git diff --check
```

---

## 23. Tests to write

### 23.1 Selector tests

File:

```text
scripts/quipsly-source-selectors.test.mjs
```

Cases:

```text
valid offsets return selected text
negative start fails
end <= start fails
end beyond length fails
quote selector includes exact/prefix/suffix
resolver finds exact match
resolver reports multiple matches
resolver fails when exact missing
```

### 23.2 Ingestion/chunking tests

File:

```text
scripts/quipsly-source-chunking.test.mjs
```

Cases:

```text
normalization preserves casing and punctuation
blocks preserve char offsets
heading detection works
retrieval chunks include sourceBlockIds
chunking does not mutate source block text
```

### 23.3 Quote validation tests

File:

```text
scripts/quipsly-citation-validation.test.mjs
```

Cases:

```text
quote exactText matches block slice
quote hash mismatch returns needs-review
citation to missing block returns missing-target
generated answer with allowed cite id validates
generated answer with unknown cite id returns not-in-retrieval-context
```

### 23.4 Retrieval fixture tests

File:

```text
scripts/quipsly-retrieval-fixture.test.mjs
```

Cases:

```text
keyword search returns source trail block
source scope filters results
retrieval result has citation id
citation id resolves to block
empty query returns validation error
```

### 23.5 Packet snapshot tests

File:

```text
scripts/quipsly-packet-snapshot.test.mjs
```

Cases:

```text
packet stores question
packet stores source scope
packet stores retrieval result snapshots
packet generated answer citation map references valid citations
source revision change does not mutate old packet snapshot
```

---

## 24. Validation commands

Run from repo root.

### Always

```bash
git diff --check
pnpm quipsly:domain:typecheck
pnpm quipsly:api:typecheck
pnpm --filter quipsly typecheck
```

### After API route work

```bash
pnpm quipsly:api:build
```

### After UI work

```bash
pnpm --filter quipsly build
```

### After schema work

```bash
pnpm db:generate
pnpm quipsly:api:typecheck
pnpm --filter quipsly typecheck
```

### Only after confirming local DB target

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm db:push
```

### Test script once added

```bash
pnpm quipsly:source-rag:test
```

---

## 25. Example endpoint implementations

### 25.1 `POST /v1/research/search`

```ts
import { jsonError, jsonOk } from "@/lib/api";
import { runKeywordRetrieval } from "@/lib/source-rag/retrieval-service";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.query !== "string" || body.query.trim().length === 0) {
    return jsonError("A non-empty query is required.", 400);
  }

  const limit = Number.isFinite(body.sourceScope?.limit)
    ? Math.min(Math.max(Math.trunc(body.sourceScope.limit), 1), 20)
    : 8;

  const result = await runKeywordRetrieval({
    queryText: body.query.trim(),
    sourceScope: {
      sourceDocumentIds: Array.isArray(body.sourceScope?.sourceDocumentIds)
        ? body.sourceScope.sourceDocumentIds.filter((id: unknown) => typeof id === "string")
        : undefined,
      limit,
    },
    createdByLabel: "prototype-api",
  });

  return jsonOk({
    query: result.query,
    results: result.results,
    warnings: result.warnings,
  });
}
```

### 25.2 Dynamic route params

Match current repo style used in `apps/quipsly-api/src/app/v1/research/quotes/[slug]/route.ts`:

```ts
export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly sourceDocumentId: string }> },
) {
  const { sourceDocumentId } = await params;
  // ...
}
```

### 25.3 Citation pill text rendering

Do not render citation IDs directly as the only label. Use display labels:

```text
[1] Synthetic Source Trail Seed, block 2
[Q3] Source trail definition
[Needs review] Citation target changed
```

But keep `citationId` in data attributes for click behavior:

```tsx
<button data-citation-id={citation.id}>[{citation.displayNumber ?? "?"}]</button>
```

---

## 26. Environment variables

Do not require new env vars for fixture mode.

Add to `.env.example` only after code reads them:

```text
QUIPSLY_API_ORIGIN=http://localhost:3000
QUIPSLY_SOURCE_WRITES_ENABLED=0
QUIPSLY_MODEL_GENERATION_ENABLED=0
QUIPSLY_MODEL_PROVIDER=
QUIPSLY_SOURCE_STORAGE_BUCKET=
```

Suggested behavior:

```text
QUIPSLY_SOURCE_WRITES_ENABLED=0 by default.
Fixture mode works without DATABASE_URL.
Database reads require DATABASE_URL.
Database writes require DATABASE_URL and QUIPSLY_SOURCE_WRITES_ENABLED=1.
Model calls require QUIPSLY_MODEL_GENERATION_ENABLED=1.
```

Update:

```text
.env.example
docs/runbooks/local-dev.md
docs/runbooks/quipsly-source-rag-local-db.md
```

Only if env usage changes.

---

## 27. Runbook to add

Create:

```text
docs/runbooks/quipsly-source-rag-local-db.md
```

Include:

```md
# Quipsly Source RAG Local DB Runbook

## Purpose
Local-only source-aware RAG persistence for Quipsly.

## Safety
Do not run db push against production. Confirm DATABASE_URL points at localhost.

## Commands
pnpm db:generate
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm db:push
psql "$DATABASE_URL" -f scripts/sql/quipsly-source-rag-indexes.sql
pnpm quipsly:api:typecheck
pnpm quipsly:api:build
pnpm --filter quipsly typecheck

## Verify tables
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'QuipslySourceDocument',
    'QuipslySourceRevision',
    'QuipslySourceBlock',
    'QuipslyCitation',
    'QuipslyResearchPacket'
  );
```

---

## 28. Open questions with suggested answers

### 28.1 Should this PR modify `prisma/schema.prisma`?

Suggested answer: yes, but only add Quipsly-prefixed models and only after the fixture/domain API contract is in place. Do not apply to non-local databases without approval.

Reason: the repo already has Quipsly graph tables in the root schema, and source-aware RAG needs durable state. Additive tables are safer than overloading `QuipslyNode.payloadJson`.

### 28.2 Should source-aware RAG live in `apps/quipsly-api` or `apps/quipsly` server actions?

Suggested answer: source persistence, retrieval, citations, and research packets should live behind `apps/quipsly-api`. The private UI in `apps/quipsly` should call that surface or use a thin internal client.

Reason: Quipsly is explicitly the API/research/database layer. Keeping the service boundary clear makes future QuipLore, worker, and partner surfaces easier.

### 28.3 Should we use Studio tables for this?

Suggested answer: no. Use Studio as a pattern only.

Reason: docs say public routes should not read private Studio tables directly, and Quipsly needs its own source/evidence archive.

### 28.4 Should embeddings and pgvector be in MVP?

Suggested answer: no.

Reason: citation architecture and provenance must be correct first. PostgreSQL full-text search is enough for the first useful slice. pgvector belongs in phase 2 once source blocks, retrieval result snapshots, and citation validation are stable.

### 28.5 Should PDF ingestion be in MVP?

Suggested answer: probably not unless the human says it is required for the first demo.

Reason: PDFs introduce extraction/layout/OCR complexity. Start with text/markdown/DOCX and prove the citation spine. Add PDF layout support after source-reader and citation logic work.

### 28.6 Should AI generation be in MVP?

Suggested answer: no live provider calls. Implement extractive answers first and leave provider calls behind env gates.

Reason: repo stop conditions say no live model/provider calls without explicit approval. Extractive answers are enough to validate citations and packets.

### 28.7 Should public QuipLore use these citations immediately?

Suggested answer: not immediately. Add source-aware evidence as private Quipsly research first. Public QuipLore can later consume approved projection records.

Reason: public charm cannot hide source uncertainty, and no public publishing should happen from agent output without review state.

### 28.8 Should `QuipslyNode` become the main source document store?

Suggested answer: no.

Reason: `QuipslyNode` is useful for graph/projection records, but source documents, blocks, revisions, and retrieval snapshots need explicit lifecycle and audit fields.

### 28.9 Should source assets go into Cloud Storage now?

Suggested answer: not for local MVP. Store small raw text in the DB or local fixture mode. Add Cloud Storage when worker/cloud posture is reviewed.

Reason: repo docs require explicit service boundary and rollback path before cloud resources and secrets.

---

## 29. Anti-pattern checklist

Do not do these:

```text
Do not store only chunks and call them sources.
Do not mutate source block text after citations exist.
Do not let the LLM invent URLs, titles, authors, page numbers, or citation labels.
Do not cite whole documents when a passage citation exists.
Do not hide source uncertainty behind polished prose.
Do not store private Studio/HGO material as public Quipsly seed data.
Do not mix public projection state and private research state.
Do not require pgvector before keyword retrieval works.
Do not use source notes as evidence unless they are labeled user-authored.
Do not let ResearchPacket items point only at current text without snapshots.
Do not silently fall back from database to fixture mode without a visible badge or response meta.
```

---

## 30. Definition of done

The implementation is complete for this slice when:

```text
1. Domain package exports source-aware RAG types and pure helpers.
2. Fixture API routes return source documents, blocks, retrieval results, citations, and packets.
3. Optional local DB-backed routes work when schema is applied and writes are enabled.
4. Source ingestion creates immutable revisions, blocks, and retrieval chunks.
5. Annotation creation validates offsets and stores selectors.
6. Quote provenance creation validates exact text and stores hash/prefix/suffix.
7. Research search stores retrieval result snapshots and mints citation IDs.
8. Research ask returns an extractive answer with only valid citation IDs.
9. Research packet saves and reloads answer, sources, retrieval results, citations, and warnings.
10. Private Quipsly UI can browse sources, inspect blocks, create annotation/quote, search, ask, click citations, and view packet.
11. Tests cover selectors, chunk offsets, quote validation, citation validation, retrieval scoping, and packet snapshots.
12. OpenAPI seed endpoint catalog includes new source-aware routes.
13. Docs/runbook explain local DB safety and future pgvector path.
14. Validation commands pass:
    - pnpm quipsly:domain:typecheck
    - pnpm quipsly:api:typecheck
    - pnpm quipsly:api:build
    - pnpm --filter quipsly typecheck
    - pnpm --filter quipsly build
    - pnpm quipsly:source-rag:test, if added
```

---

## 31. Suggested final Codex handoff note

When the local Codex agent finishes, it should add a short session note under:

```text
docs/sessions/quipsly-source-aware-rag-result.md
```

Template:

```md
# Quipsly Source-Aware RAG Result

Date: YYYY-MM-DD
Branch: codex/quipsly-source-aware-rag-001

## Summary

## Files changed

## What works

## What remains fixture-only

## Database/schema notes

## Validation run

## Risks

## Next recommended slice
```

Do not leave important decisions only in chat.

---

## 32. One-sentence north star

Quipsly should make every important sentence carry a little lantern back to the exact source block that earned it.
