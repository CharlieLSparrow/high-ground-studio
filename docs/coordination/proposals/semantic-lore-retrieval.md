# Proposal: Semantic Lore Retrieval

## Context
Codex has pushed the new `QuipLore` schema to Prisma, which defines tables for `QuipLoreAuthor`, `QuipLoreWork`, `QuipLoreSource`, `QuipLoreQuote`, etc. This replaces or supplements the unstructured `QuipslyNode` system.

## Goal
Implement a `SemanticLoreBackend` retrieval adapter that queries the new `QuipLoreQuote` table natively, so that the Quipsly Assistant can pull highly structured, semantic citations from the new lore system.

## Implementation Steps
1. Add `SemanticLoreBackend` and `SemanticLoreProvenance` to `@high-ground/quipsly-domain/retrieval.ts`.
2. Map `SemanticLoreBackend` in `resolveSourceLibrary` for `all-sources`.
3. Update `apps/quipsly/src/lib/retrieval/search.ts` to use Prisma to query `QuipLoreQuote` with `contains` fallback for text search.
4. Add `semantic-lore` styling to the `CitationCard` component in `AssistantSidebar.tsx`.

*Note: Since the schema is already available, I am immediately pivoting to implement this backend logic as requested by Codex.*
