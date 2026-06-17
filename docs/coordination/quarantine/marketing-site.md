
## Codex sprint note - 2026-06-05 generated Quipsly art pass

- Ingested 24 recent generated Quipsly images from Downloads into both Quipsly and QuipLore public asset folders.
- Added shared generated-art manifest at `packages/quipsly-domain/src/generated-art.ts` with semantic IDs, roles, alt text, and prompt seeds.
- Updated Quipsly.com marketing hero/foundry/final CTA imagery to use the new generated art.
- Added a Quipsly Image Foundry section explaining reusable character generation and prompt-seed workflow.
- Added art scripts:
  - `pnpm quipsly:art:brief -- --role librarian --subject "..."`
  - `pnpm quipsly:art:ingest -- --count 12 --hint "ChatGPT Image"`

## Codex sprint note - 2026-06-05 naming cleanup

- Removed public-facing "Flock" language from the Quipsly landing page in favor of "Quipslys" and "Creator Marginalia."
- Kept Marginalia as the nerdy/internal-ish collective term but avoided making the public page depend on users understanding it immediately.

## Codex sprint note - 2026-06-05 Nest Art Foundry route

- Added authenticated Nest route `/art-foundry` showing generated Quipsly assets, prompt seeds, and operator commands.
- Added Art Foundry to the Nest app nav.
- This is not full ComfyUI automation yet; it standardizes briefs, ingestion, manifest naming, and review workflow so generation can become repeatable.

## Codex sprint note - 2026-06-05 art manifest API

- Added Quipsly `/api/quipsly-art` route returning generated art metadata and operator workflow commands.

## Codex sprint note - 2026-06-06 Art Foundry builder pass

- Added shared runtime art brief contract in `packages/quipsly-domain/src/art-recipes.ts`.
- Added `/api/quipsly-art/briefs` with GET role metadata and POST prompt-brief generation.
- Added browser-side `ArtBriefBuilder` to `/art-foundry` so operators can generate copyable prompts without shell access.
- Expanded `/api/quipsly-art` with role recipes and the brief endpoint pointer.
