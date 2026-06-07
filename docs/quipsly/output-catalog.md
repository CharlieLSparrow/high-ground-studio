# Quipsly Output Catalog

Quipsly should make many native content types from a single source spine, not require creators to copy assets into a different tool for every output.

The shared catalog lives in `packages/quipsly-domain/src/output-catalog.ts` and is visible in Nest at `/outputs`.

Each output also has a detail page at `/outputs/<outputId>` and a non-mutating API contract at `/api/output-catalog/<outputId>`.

The detail API includes a starter `packetSkeleton`. This is not a published artifact; it is the JSON shape a future packet builder can fill from the Nest/source spine.

Nest kinds map to likely output paths through `OUTPUT_IDS_BY_NEST_KIND` and `listOutputsForNestKind()` in the same shared catalog file. Keep this mapping shared so `/projects`, assistant suggestions, and future APIs do not invent separate output logic.

Nest-kind output maps are also available at `/api/output-catalog/nest-kind/<nestKind>`.

Each output records:

- family
- status
- priority
- source inputs
- packet shape
- publishing targets
- visual helper roles
- human promise

This makes future feature work safer because every new output must explain what source data it consumes, what public-safe packet it emits, and which kind of Quipsly companion naturally helps with that output.

Near-term focus:

1. High Ground Odyssey episode pages
2. Podcast RSS episode packages
3. YouTube video packages
4. Patreon support posts
5. QuipLore quote feeds/cards
6. SCORM/mobile course packages
7. Story/comic/course scroll packages

Design rule: outputs are projections from a Nest. Do not create a separate authoring silo unless the living document, source overlay, media room, and publish packet model genuinely cannot support the workflow.

The HGO public episode renderer uses `hgo-episode-page` as its public-safe output contract. Public pages may display this provenance, but must not expose private Nest/manuscript/editor state.
