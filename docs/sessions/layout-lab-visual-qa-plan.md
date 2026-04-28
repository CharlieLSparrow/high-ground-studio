# Layout Lab Visual QA Plan

Date: 2026-04-28

Scope:
- inspect the current layout-lab presentation across the existing v1 variant-aware routes
- review `/`, `/coaching`, `/library`, and one representative `/episodes/*` page
- compare `cinematic`, `editorial`, and `signal`

Approach:
- run the local app
- generate a local team-capable JWT session cookie so the server will honor the layout-variant cookie
- capture screenshots for the target routes under each variant
- review the screenshots for obvious regressions, spacing, contrast, readability, and overall presentation strength
- write grounded findings and small polish recommendations without changing behavior

Constraints:
- no route or behavior refactors unless a tiny fix is absolutely required to complete inspection
- no variant expansion to new routes
- no changes to dashboard, team, auth, Stripe, scheduling, or memberships
