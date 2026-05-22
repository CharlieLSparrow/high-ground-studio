# HGO Staged Projection Review Gate Result

Date: 2026-05-22

## Scope

Added a synthetic-only staged projection review gate for HGO. The gate prepares
future staged-to-live promotion checks without adding persistence, real content,
public publishing, Studio publish APIs, deployment, or public `/episodes`
replacement.

## Added

- `apps/web/src/lib/hgo/projection-review-gate.ts`
- `/projection-stage/review`

The review gate groups synthetic projection fixtures into:

- blocked
- needs review
- live-safe

## Review Helper

`createHgoProjectionReviewGate()` reports:

- projection id, slug, and title
- status and visibility
- `isLiveSafe`
- `canPromoteToLive`
- blocker count
- warning count
- issue list

Issues include:

- `severity`: `info`, `warning`, or `blocker`
- title and detail
- `blocksLivePromotion`

Blockers cover unresolved citation states, do-not-use source/quote state,
archived projections, missing title/slug, and live/public projections that still
have live-blocking issues.

Warnings cover synthetic fixture data, staged/private visibility, pull quotes
present, unpublished audio, and Studio browser bridge origin.

## Route Behavior

- `/projection-stage/review` lists all synthetic fixtures.
- `/projection-stage` now surfaces review-gate blocker/warning counts.
- `/projection-stage/[slug]` shows whether a projection can promote to live,
  whether it is live-safe, blocker issues, warning issues, and a no-publish
  boundary.

No route includes a real publish action. The page copy states that promotion to
live requires a later approved workflow.

## Smoke Coverage

`pnpm hgo:projection:browser-smoke` now visits:

- `/projection-preview/import`
- `/projection-stage`
- `/projection-stage/review`
- `/projection-stage/synthetic-field-radio`

It confirms grouped review text appears, at least one blocker is visible, the
shared renderer mounts, known real-content markers are absent, and no server
write happens.

## Boundaries

No real manuscript text, real HGO content, DB/schema changes, Cloud SQL, Cloud
Run config, DNS, OAuth, billing, secrets, IAM, deploy, autosave, Yjs, Google
OAuth automation, or real publish action was added.
