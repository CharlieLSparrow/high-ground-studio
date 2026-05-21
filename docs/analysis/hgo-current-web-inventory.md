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

What should be replaced or rethought:

- The current `EpisodePageShell` is too article-like for the desired future.
- The episode route is coupled to MDX/content rendering instead of a public projection contract.
- Current episode metadata is not enough to express Studio-derived structure, author voices, citation state, or recording handoff.
- Previous/next/archive navigation is useful but too generic for story-forward projection.

## Content Structure

Content folders inspected:

- `apps/web/content/publish`: current published MDX content set.
- `apps/web/content/_staging`: staging/content-prep area.
- `apps/web/content/_inbox`: raw manuscript/research inbox.

No real manuscript or published HGO content should be copied into synthetic prototype data.

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

Add a typed public episode projection contract that can be generated from Studio later:

- title,
- subtitle,
- slug,
- episode number,
- hero visual descriptor/media,
- audio/player metadata,
- summary,
- thesis,
- chapter/episode/section beats,
- voice summaries,
- pull quotes,
- public-safe citation/source notes,
- related book/chapter data,
- next/previous/series navigation.

The synthetic preview route in this sprint is the first low-risk proof of that direction.
