# Quipsly Output Catalog

Quipsly should make many native content types from a single source spine, not require creators to copy assets into a different tool for every output.

The shared catalog lives in `packages/quipsly-domain/src/output-catalog.ts` and is visible in Nest at `/outputs`.

Each output also has a detail page at `/outputs/<outputId>` and a non-mutating API contract at `/api/output-catalog/<outputId>`.

The detail API includes a starter `packetSkeleton`. This is not a produced or published artifact; it is the JSON shape a future packet builder can fill from the Nest/source spine.

## Truth boundary

`/outputs` is a static capability and roadmap catalog. A catalog entry does not prove that:

- a packet or artifact was created or persisted
- a destination provider is connected or reachable
- a publish attempt succeeded
- an external URL still resolves
- Quipsly, HGO, or a provider is currently healthy

Use `/publishing` for accessible-Nest persisted output packets, internal publish plans, provider attempts, and external-artifact receipt records. A provider attempt is not publication proof, and recorded URLs are not automatically live-rechecked. The private HGO publish queue remains a separate candidate-review lane; its existence in the catalog is not a current availability claim.

The API repeats this boundary as `catalogBoundary`, including explicit false values for artifact, packet, publication, provider-connection, and service-health proof. List APIs use `definitionCount`, not a generic count that could be mistaken for produced output inventory.

Nest kinds map to likely output paths through `OUTPUT_IDS_BY_NEST_KIND` and `listOutputsForNestKind()` in the same shared catalog file. Keep this mapping shared so `/projects`, assistant suggestions, and future APIs do not invent separate output logic.

Nest-kind output maps are also available at `/api/output-catalog/nest-kind/<nestKind>`.

Each output records:

- family
- catalog definition stage (`runway-mapped`, `contract-defined`, `workflow-draft`, or `concept-only`)
- roadmap horizon (`active-design`, `near-term`, or `explore-later`)
- source inputs
- packet shape
- publishing targets
- visual helper roles
- human promise

Catalog stages describe only how complete the static product definition is. They are never artifact, publication, provider, or runtime statuses. Required source inputs are always returned as `evidenceState: "not-checked"` until an operational surface verifies real records.

This makes future feature work safer because every new output must explain what source data it would consume, what public-safe packet it would emit, and which kind of Quipsly companion naturally helps with that output.

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
