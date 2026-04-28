# Layout Lab Style Tokens Result

Date: 2026-04-28

What changed:
- added a shared variant style helper at `apps/web/src/lib/layout-variant-styles.ts`
- moved repeated variant-specific class selection out of route/components where the same mappings were showing up multiple times
- kept the existing cookie-based variant selection and route coverage unchanged

Centralized concerns:
- surface background treatments for:
  - home
  - coaching
  - library
  - docs
  - episode
- panel/card treatments for:
  - standard cards
  - featured cards
  - featured badges
- repeated text/accent treatments for common variant-driven labels, titles, body copy, rails, and links
- a small `glow` helper so `signal` can stay intentionally flatter without repeating the same conditional inline

Files updated to consume the shared layer:
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/coaching/page.tsx`
- `apps/web/src/app/library/page.tsx`
- `apps/web/src/components/docs/DocsPageShell.tsx`
- `apps/web/src/components/docs/EpisodePageShell.tsx`
- `apps/web/src/components/home/EpisodeCard.tsx`
- `apps/web/src/components/home/EpisodeFeed.tsx`
- `apps/web/src/components/home/HeroSection.tsx`

Intentionally left inline:
- hero-specific composition and layout blocks that are unique to one variant and one route
- route-specific copy and one-off labels
- one-off hover/layout details where turning them into tokens would make the component harder to read

Verification:
- `pnpm --filter web build` passed
- `pnpm --filter web exec next build --webpack` passed

Result:
- the three layout variants still render through the same app/content/data paths
- the current visual behavior is preserved closely, but the main repeated style decisions now live in one shared module that is easier to tune later
