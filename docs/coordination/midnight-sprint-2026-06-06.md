# Midnight Sprint Handoff - 2026-06-06

Owner: Codex

Purpose: turn the new Quipsly image assets and content-output brainstorm into reusable beta app surfaces instead of one-off decoration.

## What changed

- Added reusable Quipsly art brief contracts in `packages/quipsly-domain/src/art-recipes.ts`.
- Added a shared content output catalog in `packages/quipsly-domain/src/output-catalog.ts`.
- Added `/art-foundry` in Nest as a browser-based prompt/brief builder for Quipsly visuals.
- Added `/api/quipsly-art/briefs` for deterministic art brief generation.
- Added `/api/quipsly-art/library` for programmatic access to the generated art manifest.
- Added a filterable/copyable Art Foundry library grid.
- Added `/outputs` in Nest as the first app-owned catalog of publishable content types.
- Added `/outputs/[outputId]` detail pages and `/api/output-catalog/[outputId]` readiness contracts.
- Added output packet skeleton generation and displayed packet JSON on output detail pages.
- Added output-path badges to Nest cards so project types point toward likely publishable outputs.
- Moved Nest-kind-to-output mapping into the shared domain output catalog instead of keeping it page-local.
- Added `/api/output-catalog/nest-kind/[nestKind]` and smoke coverage for `writing`.
- Added output-path teaching blocks to newly seeded Nest starter documents.
- Added assistant `propose-output-plan` support as a safe, non-mutating preview action.
- Hydrated assistant output-plan payloads server-side from the shared output catalog when an output ID is present.
- Added assistant quick prompts for output planning, related examples, structure cleanup, and research packets.
- Added public-safe HGO episode output-contract metadata and a hero badge linking to the Nest `hgo-episode-page` output plan.
- Clarified HGO episode Patreon CTA copy around Quipsly Nest beta testing.
- Added visual-helper roles to output catalog entries so Art Foundry can serve output-specific Quipsly companions.
- Linked output catalog visual-helper chips into prefilled Art Foundry brief URLs.
- Taught `/api/quipsly-art/briefs` to accept `outputId` and infer role/subject from the output catalog.
- Added an output-type selector to the browser Art Foundry prompt builder.
- Added `/api/output-catalog` for programmatic access to the same output catalog.
- Added `/beta-readiness` as a human-readable readiness dashboard.
- Added QuipLore `/visual-library` to show generated Quipsly/quote visual directions.
- Added QuipLore `/api/quipsly-art/library` and made `/visual-library` searchable/filterable.
- Added public marketing `/quipslys` as a lightweight visual field guide.
- Added `docs/quipsly/quipsly-collective-names.md` to preserve "a Marginalia of Quipslys" and unused collective-name options.
- Added `docs/coordination/next-marginalia-prompts-2026-06-06.md` as a ready-to-paste next-round prompt sheet.
- Added release smoke coverage for `/outputs`, `/art-foundry`, `/beta-readiness`, `/api/quipsly-art/briefs`, and `/api/quipsly-art/library`.
- Added output/art catalog counts to `/api/beta-readiness`.
- Added representative output and public visual proof links to `/beta-readiness`.
- Added `pnpm quipsly:art:comfy` as an optional local ComfyUI queue helper for generated art briefs.

## Product decisions

- Art generation should use durable recipes and manifests, not scattered one-off prompts.
- Output types should be first-class product objects: each output has sources, packet shape, publish targets, readiness status, and next steps.
- QuipLore visuals can share Quipsly-generated assets, but QuipLore remains a public quote/archive surface.
- Beta readiness should be visible to humans in the app and available as JSON to Deploy Captain.

## Avoid collisions

- Do not move the Art Foundry to public `quipsly.com` yet. It belongs in Nest until public tooling is intentionally exposed.
- Do not make image generation mutate project content automatically. It should create briefs/assets that users approve.
- Do not treat output catalog entries as finished publishing integrations. They are product contracts and navigation scaffolding.
- Do not remove the existing High Ground Odyssey publishing packet path while improving the output catalog.

## Good next passes

- Wire output catalog cards to real destination setup pages when those pages exist.
- Let project/Nest documents show which outputs are available for that document type.
- Let Art Foundry save approved briefs/assets into a project-level media library.
- Add a QuipLore quote-card generator that starts from a selected quote and emits an Art Foundry brief.
- Add public/owner visibility controls before exposing beta readiness or Art Foundry outside Nest.

## Validation status

Not run in this sprint. Per standing instruction, Codex did not run build, typecheck, browser smoke, or deploy.
