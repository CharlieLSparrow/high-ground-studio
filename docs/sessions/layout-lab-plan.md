# Layout Lab Plan

Date: 2026-04-28

Scope:
- add a team-only layout variant switch for previewing alternate presentation layers
- keep one app, one data layer, and one content system
- make only the high-signal public-facing routes variant-aware in v1:
  - `/`
  - `/coaching`
  - `/library`
  - `/episodes/*`

Current repo facts:
- the site already has a team-only cookie-driven preview control pattern via `ModeSwitcher`
- header auth and team-role detection already exist in `SiteHeader`
- the target routes are server-rendered and already share business/data logic
- the current public presentation is the cinematic default and should remain the public fallback

Planned implementation:
- add a shared cookie helper for layout variants
- add a team-only `LayoutVariantSwitcher` in site chrome
- store the selected variant in a cookie and refresh server-rendered routes
- make the following surfaces variant-aware without duplicating business logic:
  - home hero/feed/cards
  - coaching landing page wrappers/cards
  - library wrappers/cards
  - docs/episode shells

Variants:
- `cinematic`
  - current/default public look
- `editorial`
  - warmer, bookish, calmer composition
- `signal`
  - cleaner, sharper, more structured media-library feel

Constraints:
- no database-backed preference
- no public toggle for non-team users
- no duplicate route trees
- no dashboard/team/Stripe/scheduling/membership refactor
