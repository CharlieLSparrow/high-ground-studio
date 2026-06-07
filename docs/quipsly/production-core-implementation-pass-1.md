# Quipsly Production Core Implementation Pass 1

Date: 2026-06-07

This pass starts moving Quipsly from prototype route logic into a production core.

## What changed

- Added shared domain primitives in `@high-ground/quipsly-domain/core`.
- Added additive Prisma models for the durable pieces we keep needing:
  - `StudioNestInvite`
  - `StudioAssetAttachment`
  - `StudioAssetVariant`
  - `StudioAssetProcessingJob`
  - `StudioSourceUnit`
  - `StudioDocumentOperation`
  - `StudioProductionRoom`
  - `StudioTimelineVersion`
  - `StudioOutputPacket`
  - `StudioPublishAttempt`
  - `StudioPublishedArtifact`
  - `StudioWorkflowJob`
- Added `apps/quipsly/src/lib/server/quipsly-core.ts` as the server-side facade for Nest access, Nest creation, Home Nest handling, asset attachment, production rooms, and workflow jobs.
- Moved `/create` access checks through `resolveNestAccess`.
- Moved `/projects` Nest creation through `createNestWithOwner`.

## Product rules preserved

- Nests are collaboration and work contexts, not storage buckets.
- Assets can exist before being attached to a working Nest.
- Home Nests are the default attachment point for personal uploads.
- Public publishing should flow through output packets and published artifacts, not direct private table reads.
- AI may draft, rewrite, summarize, and propose actions. The product rule is transparency, lineage, approval, and rollback, not “no AI writing.”
- Source-sensitive text should keep original/source truth distinguishable from editable notes and creative drafts.

## Why this matters

Before this pass, route files had too much local knowledge about projects, permissions, and special seed cases. That works for a prototype but becomes fragile once Quipsly supports:

- multiple users,
- invited collaborators,
- private fiction/customer Nests,
- shared media vaults,
- source/study documents,
- episode production rooms,
- publishing packets,
- Mac/local-engine media workflows,
- and assistant/tool action ledgers.

The new core facade is not the whole endgame yet. It is the first production seam: routes can stay familiar while the data model evolves underneath them.

## Next strengthening passes

1. Wire admin invite pages to `StudioNestInvite` so pending invited users are first-class.
2. Move editor/media import endpoints onto `StudioAssetAttachment`, `StudioAssetVariant`, and `StudioWorkflowJob`.
3. Mirror existing `StudioEpisodeProduction` flows into `StudioProductionRoom` without breaking current editor routes.
4. Add output packet creation for HGO episode pages and QuipLore quote feeds.
5. Add document operation logging for tag changes, block splits/merges, assistant actions, and reversible cleanup.
6. Add migration-safe DB sync guidance before pushing the new schema to production.
