# Layout Lab Result

Date: 2026-04-28

What changed:
- added a shared cookie/helper layer for layout variants:
  - `apps/web/src/lib/layout-variant.ts`
- added a team-only header switcher:
  - `apps/web/src/components/site/LayoutVariantSwitcher.tsx`
  - `apps/web/src/components/site/LayoutVariantSwitcherClient.tsx`
- added the switcher to site chrome in `apps/web/src/components/site/SiteHeader.tsx`
- made the v1 high-signal public route families variant-aware:
  - `/`
  - `/coaching`
  - `/library`
  - `/episodes/*`

Variants now supported:
- `cinematic`
  - current/default public look
- `editorial`
  - warmer, more literary/bookish composition
- `signal`
  - sharper, cleaner, more structured media-library/conversion feel

How it works:
- internal/team users get a layout-variant select in the site header
- the selection is stored in a cookie, not the database
- server-rendered routes read the cookie through the shared helper
- non-team users always fall back to `cinematic`, even if a cookie exists

Variant-aware v1 surfaces:
- home:
  - `apps/web/src/app/page.tsx`
  - `apps/web/src/components/home/HeroSection.tsx`
  - `apps/web/src/components/home/FeaturedEpisode.tsx`
  - `apps/web/src/components/home/EpisodeFeed.tsx`
  - `apps/web/src/components/home/EpisodeCard.tsx`
- coaching:
  - `apps/web/src/app/coaching/page.tsx`
- library:
  - `apps/web/src/app/library/page.tsx`
- episodes/docs shells:
  - `apps/web/src/app/episodes/[[...slug]]/page.tsx`
  - `apps/web/src/components/docs/DocsPageShell.tsx`
  - `apps/web/src/components/docs/EpisodePageShell.tsx`

What stayed unchanged:
- one app, one content/data layer, one auth flow
- no duplicated route trees
- no Stripe, dashboard, team, scheduling, or membership workflow refactor
- public/default visitors still see `cinematic`

Build verification:
- `pnpm --filter web build` passed
- `pnpm --filter web exec next build --webpack` passed

Verification note:
- root `package.json` had an invalid missing comma from earlier work, which blocked verification
- that syntax-only fix was required before the layout-lab build checks could run
