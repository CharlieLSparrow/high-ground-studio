# HGO Current Web App Inventory

Date: 2026-05-21

This inventory reflects the repo as inspected during the HGO public projection sprint. It focuses on `apps/web`, the current public/ops-facing app.

## Workspace Shape

Relevant app/package layout:

- `apps/web`: current High Ground Odyssey public and operations app.
- `apps/studio`: private Studio editorial app.
- `apps/motion-lab`: motion playground.
- `packages/motion-engine`: shared motion/Three.js engine package.
- `packages/studio-domain`: shared Studio domain package.

The important boundary is that Studio remains the editorial cockpit and `apps/web` is the public/ops surface. HGO should consume approved public projections later instead of re-implementing Studio editing concepts inside the web app.

## Current Web Routes

Inspected route files and nested routes show these current surfaces:

- `/`
- `/library`
- `/episodes/[[...slug]]`
- `/projection-preview`
- `/projection-preview/[slug]`
- `/coaching`
- `/coaching/success`
- `/coaching/cancel`
- `/coaching/requested`
- `/dashboard`
- `/dashboard/settings`
- `/sms-opt-in`
- `/support/company-family`
- `/team`
- `/team/appointments`
- `/team/books/learning-to-lead`
- `/team/clients`
- `/team/coaching-requests`
- `/team/kanban`
- `/team/show-prep`
- `/team/show-prep/[slug]`
- `/team/show-prep/candidates/[slug]`
- `/welcome`

## Current Episode Route Shape

The current public episode route is:

- `apps/web/src/app/episodes/[[...slug]]/page.tsx`

Its behavior:

- Uses a guarded episode source loader via `getEpisodeSource()`.
- Resolves MDX/Fumadocs source pages when available.
- Falls back to metadata from current site/reading helpers when needed.
- Renders through `EpisodePageShell`.
- Uses the current route as a conventional public article/episode page, not as a Studio projection endpoint.

Key supporting files:

- `apps/web/src/components/docs/EpisodePageShell.tsx`
- `apps/web/src/components/docs/DocsVideoEmbed.tsx`
- `apps/web/src/components/docs/FeaturedQuoteCard.tsx`
- `apps/web/src/components/docs/PairedReadingCard.tsx`
- `apps/web/src/lib/site.ts`
- `apps/web/src/lib/reading.ts`
- `apps/web/content/publish`

## Current Projection Preview Shape

The synthetic projection preview system now lives under:

- `apps/web/src/app/projection-preview/page.tsx`
- `apps/web/src/app/projection-preview/[slug]/page.tsx`
- `apps/web/src/components/hgo/projection/EpisodeProjectionView.tsx`
- `apps/web/src/lib/hgo/projection-types.ts`
- `apps/web/src/lib/hgo/synthetic-episode-projection.ts`

Its behavior:

- `/projection-preview` renders a synthetic book/series map.
- `/projection-preview?scope=book-only` filters to book-only projections.
- `/projection-preview?scope=episode-only` filters to episode-only projections.
- `/projection-preview?scope=book-and-episode` filters to projections that
  belong to both book and episode lenses.
- `/projection-preview?scope=internal` filters to internal/private projection
  work.
- `/projection-preview?scope=public-safe` filters to live public projections
  with verified quote and source state.
- `/projection-preview/[slug]` renders each visual-heavy projection page using
  the same shared renderer.
- `/projection-preview/synthetic-episode` is preserved through the dynamic
  route and no longer depends on one-off page code.

This is synthetic-only. It does not publish real HGO pages, read from Studio,
write content files, or depend on a database/API.

## Current Design System And Components

Useful current patterns:

- `apps/web/src/app/globals.css` defines a cinematic dark theme with `void`, `flora`, `subject`, `paper`, and `flare` colors.
- `GlassPanel` provides translucent dark panels.
- `PageContainer` provides the main max-width wrapper.
- Home components already lean cinematic:
  - `HeroSection`
  - `FeaturedEpisode`
  - `EpisodeCard`
  - `EpisodeFeed`
- Site header is sticky, dark, and translucent.

What is useful:

- The dark cinematic palette is a good starting point.
- Existing public app already supports a richer visual language than the old episode pages use.
- MDX and content routes can coexist with a new projection preview route while the model is proven.
- The new projection preview renderer proves that lifecycle state, visibility,
  book/episode scopes, source notes, and voice cards can come from one typed
  contract instead of bespoke page code.

What should be replaced or rethought:

- The current `EpisodePageShell` is too article-like for the desired future.
- The episode route is coupled to MDX/content rendering instead of a public projection contract.
- Current episode metadata is not enough to express Studio-derived structure, author voices, citation state, or recording handoff.
- Previous/next/archive navigation is useful but too generic for story-forward projection.
- Old episode page code should not be preserved out of sentiment once the
  projection model is ready to carry real staged/live content.

## Content Structure

Content folders inspected:

- `apps/web/content/publish`: current published MDX content set.
- `apps/web/content/_staging`: staging/content-prep area.
- `apps/web/content/_inbox`: raw manuscript/research inbox.

No real manuscript or published HGO content should be copied into synthetic prototype data.

## Current Projection Content Model

The synthetic projection fixture is intentionally separate from real content:

- status: `synthetic`, `staged`, `live`, or `archived`
- visibility: `private`, `staged`, or `public`
- scopes: `book-only`, `episode-only`, `book-and-episode`, or `internal`
- hero prompt and color mood
- audio state
- beats
- Homer/Charlie voice cards
- pull quotes with citation state
- source notes with review state
- related book chapter
- backstage notes
- previous/next projection links

This shape is the first code-level contract for HGO as public/staged projection
surface.

## Should `apps/web` Remain The HGO App?

Recommendation for now: yes.

Reasons:

- `apps/web` already hosts the public HGO surface, auth-adjacent operations screens, and current episode routes.
- The current task can safely add an isolated synthetic preview route without changing content, infrastructure, or database schema.
- A new app would add operational overhead before the projection contract is proven.

When to reconsider:

- If HGO public projection becomes a separately deployed, heavily visual public site with a different release cadence.
- If public pages need a very different rendering/media pipeline.
- If operational/team routes should be split away from the public marketing/show surface.

## Recommended Next Architecture Step

Next step: define how Studio produces this projection contract.

Candidate path:

1. Keep `/projection-preview` synthetic while the renderer evolves.
2. Add a Studio export that emits projection JSON from approved browser-local
   metadata.
3. Add staged preview access rules before real work-in-progress pages become
   shareable.
4. Replace or retire the old MDX episode shell only after real projection data
   has a safe migration and rollback path.
