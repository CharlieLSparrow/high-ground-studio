# Quipsly / QuipLore Now / Next / Later

Date: 2026-05-25

## Now

Create a durable foundation without touching existing runtime apps.

- Treat QuipLore and Quipsly as first-class applications.
- Keep the first pass out of `apps/web`, `apps/studio`, and the current Prisma
  schema.
- Use a fresh lane from `origin/main` for implementation work:
  `codex/quipsly-quiplore-foundation-001`.
- Start with:
  - `docs/architecture/quipsly-quiplore-foundation.md`
  - `docs/plans/quipsly-quiplore-now-next-later.md`
  - `docs/agents/quipsly-quiplore-codex-brief.md`
- Preserve the existing tagged-source projection model.
- Wait for uploaded visual assets or a visual handoff summary before locking
  exact colors, typography, iconography, image prompts, or motion rules.

Current stable product decisions:

- Product name: QuipLore.
- Intelligence/API/mascot layer: Quipsly.
- Canonical quote page: Quote Passport.
- Discovery feed: QuipStream.
- Personal saved library: Nest.
- Playlist-style collection: Lorelist.
- Curated narrative quote path: Trail.
- Default person-page visuals should not be real human portraits.

## Next

Build the first prototype spine.

1. Create `packages/quipsly-domain`.
   - Quote
   - Person
   - Source
   - Attribution
   - Evidence
   - Verification
   - QuoteVariant
   - Misattribution
   - Theme
   - Nest
   - Lorelist
   - Trail
   - QuipCardProjection
   - AgentTask
   - AgentRun

2. Create `apps/quiplore`.
   - Next.js app with independent layout and visual system.
   - Static seed data only at first.
   - No dependency on `apps/web` routes, HGO content, or Studio source tables.

3. Implement first pages.
   - home
   - Quote Passport detail
   - quotable person detail
   - Lorelist detail
   - QuipStream prototype

4. Implement first components.
   - Quip Card
   - verification badge
   - source badge
   - attribution block
   - variant/misquote panel
   - save/add controls as UI-only stubs
   - person hero visual frame
   - Lorelist item row/card
   - QuipStream card controls and in-memory event log

5. Add build scripts and validation.
   - package typecheck/build scripts
   - app build script
   - docs-only smoke checklist
   - `git diff --check`

6. Draft Quipsly API and database proposal.
   - no production database mutation yet
   - no root Prisma changes yet
   - include Cloud SQL, vector strategy, queueing, ingestion, review, and
     rollback posture

7. Add Google Cloud scaffolding only after the local prototype has a coherent
   runtime surface.
   - `cloudbuild.quiplore.yaml`
   - `cloudbuild.quipsly-api.yaml`
   - `scripts/quiplore-cloud-run-*`
   - `scripts/quipsly-cloud-run-*`
   - dedicated Secret Manager names and service accounts

## Later

Move from prototype to platform.

- Quipsly API with durable quote/source reads.
- Quipsly admin/research workflow for verification and disputes.
- Cloud SQL database with reviewed migrations.
- Vector search over quote text, context, source excerpts, themes, and person
  profiles.
- Ingestion workers for sources and quote candidate extraction.
- Agent task queues and run logs.
- User auth, saved quotes, Nests, Lorelists, and Trails.
- Public share cards and Open Graph image generation.
- Quipsly mascot/scene asset pipeline.
- Public person pages at scale.
- Misquote/disputed quote pages.
- WorldHub entitlement/embed integration if QuipLore gains supporter features.
- Content Studio and HGO handoff paths only after public-safe projection rules
  are reviewed.

## Stop Conditions

Stop and ask before:

- changing `prisma/schema.prisma`
- running `pnpm db:push` or migrations
- creating or modifying GCP resources
- changing DNS or OAuth callback settings
- mounting secrets
- using private Studio or unreleased HGO source content as seed data
- reusing `apps/web` or `apps/studio` deploy scripts for QuipLore/Quipsly
- adding live model/provider calls
- publishing public pages from agent-generated source interpretation

## First Useful Demo

The first demo should prove the product shape, not the whole platform:

- A public QuipLore home page with the visual language.
- A Quote Passport page with variants, source, verification, and related
  quotes.
- A quotable person page, likely using Einstein or another public-safe example.
- A Lorelist called something like `Curiosity Without Cliche`.
- A QuipStream prototype that opens Quote Passports and adds to a UI-only
  Lorelist state.
- QuipStream should feel inspired by short-form vertical discovery, but its
  measured success should be curation: saves, Lorelist adds, source/context
  expansion, and Quote Passport opens.

Use synthetic or public-safe seed data, and label sample verification states
clearly.
