# Quipsly / QuipLore Implementation Result

Date: 2026-05-25

## What Exists Now

This pass created a first runnable QuipLore/Quipsly slice without changing the
existing HGO app, Studio app, Prisma schema, database, secrets, DNS, or Google
Cloud resources.

New runtime surfaces:

- `apps/quiplore`: public QuipLore Next.js app
- `apps/quipsly-api`: prototype Quipsly API Next.js app
- `packages/quipsly-domain`: shared domain contracts, stream event helpers, and
  public-safe seed projection fixtures

Root scripts:

- `pnpm quiplore`
- `pnpm quiplore:build`
- `pnpm quiplore:typecheck`
- `pnpm quipsly:api`
- `pnpm quipsly:api:build`
- `pnpm quipsly:api:typecheck`
- `pnpm quipsly:domain:build`
- `pnpm quipsly:domain:typecheck`

## QuipLore App

Implemented routes:

- `/`: QuipStream-first discovery workspace with Nest, API projection, featured
  Passport, Quipsly panel, and Lorelist preview
- `/stream`: full QuipStream prototype with in-memory event ledger
- `/quotes/[slug]`: Quote Passport detail route
- `/people/[slug]`: quotable person page
- `/lorelists/[slug]`: Lorelist detail route

Implemented product pieces:

- QuipStream card loop
- stream modes: For You, Verified, Curiosity, Einstein
- save/unsave UI-only Nest state
- add/remove UI-only Lorelist state
- Quote Passport navigation
- copy/share text action
- more/skip feedback
- in-memory QuipStream events and summary stats
- verification badges
- source badges
- Quip Card projection component
- Quipsly companion panel using approved reference assets

Follow-up Einstein visual test:

- Added an Einstein-focused seed cluster with seven quote records.
- Added quote-level `visual` metadata to the shared domain contract.
- Added an Einstein-inspired Quipsly sprite sheet at
  `apps/quiplore/public/illustrations/einstein-quipsly-sprite-sheet.png`.
- QuipStream can open in a person-focused Einstein mode.
- The Einstein person page uses the sprite sheet in the hero area, quote cards,
  and embedded person-focused stream.
- Popular Einstein lines intentionally mix `attributed`, `variant`,
  `needs-review`, `disputed`, and `misattributed` states so the UI can show
  charm without flattening source confidence.

Follow-up Quipsly visual practice:

- Added a general quote companion sprite sheet at
  `apps/quiplore/public/illustrations/quipsly-quote-companions-sprite-sheet.png`.
- Added an ambient page companion sprite sheet at
  `apps/quiplore/public/illustrations/quipsly-page-companions-sprite-sheet.png`.
- Extended the shared domain contract so quote visuals can point at different
  sprite sheets and grid sizes instead of relying on a hard-coded image.
- Attached quote-level Quipsly visual metadata to every current seed quote.
- Added page companion projections for small Quipsly figures that can decorate
  the app shell without becoming quote records.
- Added a `PageCompanions` layer to the QuipLore shell so Quipsly can appear
  around pages as a reusable ambient system.

Follow-up API/product projection pass:

- Added Quote Story projections generated from Quote Passport source, context,
  evidence, review state, and story-hook data.
- Added Merch Concept projections that separate draft-ready, rights-review, and
  blocked merchandise states from the quote text itself.
- Added a Quipsly asset registry projection for sprite sheets and cells, so the
  API can expose which visual companions are attached to quotes and pages.
- Added Quipsly API endpoints:
  - `GET /v1/quote-stories/[slug]`
  - `GET /v1/merch/quote/[slug]`
  - `GET /v1/assets/quipsly`
  - `GET /openapi.json`
- Quote Passport pages now render Story Trail and Merch Readiness sections
  alongside source evidence and variant review.

Follow-up API Explorer pass:

- Added shared API endpoint catalog metadata to `packages/quipsly-domain`.
- Added a QuipLore `/api` route with a live API Explorer for local Quipsly API
  requests, gateway positioning, sample curl commands, and JSON response
  inspection.
- Changed the QuipLore nav from the single sample "API Shape" quote link to the
  API Explorer.
- Added CORS headers and `OPTIONS` handling to the Quipsly API prototype so
  QuipLore can call it from another local origin.
- Updated the Quipsly API root route to return structured endpoint catalog data.

Follow-up Research Desk pass:

- Added source-review queue and research-packet projections to
  `packages/quipsly-domain`.
- Added QuipLore `/research` as a researcher-facing desk for risk triage,
  next actions, source checklist, and future database write planning.
- Added Quipsly API endpoints:
  - `GET /v1/research/queue`
  - `GET /v1/research/quotes/[slug]`
- Added the research endpoints to the shared API catalog and OpenAPI document.
- Updated the QuipLore nav to include the Research Desk.

Implementation pass added in this resumed continuation:

- Added a shared, generated Quipsly OpenAPI document builder in
  `packages/quipsly-domain/src/openapi.ts`.
- Wired `GET /openapi.json` in `apps/quipsly-api` to consume the shared
  builder instead of duplicating OpenAPI shapes.
- This removes the OpenAPI duplication from endpoint route handlers while keeping
  `apiEndpoints` as the single source of route intent.
- Pinned the new QuipLore apps to the repo's current Next/React graph
  (`next@16.1.6`, `react@19.2.4`, and `react-dom@19.2.4`) so they do not
  accidentally split the monorepo's generated Prisma client peer instance.

## Quipsly API

Implemented prototype endpoints:

- `GET /`
- `GET /v1/quotes/search`
- `GET /v1/quote-passports/[slug]`
- `GET /v1/people/[slug]`
- `GET /v1/quipstream/modes`
- `POST /v1/quipstream/sessions`
- `GET /v1/quipstream/sessions/[sessionId]/next`
- `POST /v1/quipstream/events`

The API returns JSON projections from shared seed fixtures. It does not persist
events yet.

## Validation

Passed:

- `pnpm --filter @high-ground/quipsly-domain typecheck`
- `pnpm --filter quiplore typecheck`
- `pnpm --filter quipsly-api typecheck`
- `pnpm --filter quiplore build`
- `pnpm --filter quipsly-api build`
- `git diff --check`
- HTTP smoke checks against local QuipLore and Quipsly API servers
- Playwright screenshot checks for QuipLore home on desktop and mobile

Local dev servers used:

- QuipLore: `http://localhost:3003`
- Quipsly API: `http://localhost:3004`

## Boundaries Preserved

No changes were made to:

- `apps/web`
- `apps/studio`
- `packages/worldhub-domain`
- `packages/content-studio-domain`
- `prisma/schema.prisma`
- Google Cloud resources
- secrets or environment files

## Next Useful Pass

Recommended next coding slice:

1. [DONE] Add real Quipsly API OpenAPI generation or a checked-in OpenAPI document.
2. Split seed fixtures from future runtime repository interfaces.
3. Add Cloud Run build configs for `quiplore` and `quipsly-api`.
4. Draft the first Postgres/AlloyDB schema in docs before touching Prisma.
5. Add account-aware curation persistence behind a reviewed data boundary.
