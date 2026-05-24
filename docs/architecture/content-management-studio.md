# Content Management Studio

Date: 2026-05-23

## Purpose

The Content Management Studio is the private operating surface for moving High
Ground work from rough source material into finished creative and business
outcomes.

The top-priority lanes are:

- podcast editing and publishing
- book writing and publishing
- HGO episode pages

The close-second lanes are:

- monetization
- merch and supporter follow-through
- Patreon/supporter posture
- own podcast-hosting posture
- Homer coaching operations

## Current Runtime Surface

The first usable runtime marker is:

```text
apps/studio /content-studio
```

It is a private Studio route behind the existing Studio access gate. The route
is browser-local and stores its working board in:

```text
high-ground-studio.content-studio.v1
```

Current capabilities:

- create projects from podcast, book, episode-page, monetization, and coaching
  templates
- track source, shape, produce, publish, and follow-through checklists
- edit project title, notes, status, priority, and active stage
- add custom checkpoints to the active stage
- show a next-action handoff packet for the selected project
- export a browser JSON handoff packet with explicit safety flags and derived
  project handoff summaries
- import a Content Studio packet or raw workspace JSON back into the board
- generate a selected-project production packet with provider-safe delivery
  targets, flattened task checklist, agent task prompts, and workflow-specific
  publishing handoffs
- generate a valid staged HGO projection draft for podcast and episode-page
  projects so HGO can review it through `/projection-stage/import`
- manually save/load server checkpoints through private
  `StudioContentWorkspaceSnapshot` rows when the Studio database schema has
  been applied

The provider-neutral type/sample-data contract from the WorldHub foundation
branch lives in `packages/content-studio-domain`. The active board still uses
browser-local state as the immediate working copy, while manual server
checkpoints provide recovery and cross-device handoff.

## Current Boundaries

This slice does not:

- autosave Prisma data
- call provider APIs
- publish public content
- promote HGO staged projection drafts to live/public pages
- deploy anything
- use real manuscript or HGO source content
- change canonical manuscript truth
- replace the HGO staged projection review path
- replace existing coaching request or appointment workflows

Browser-local state remains the fast working surface. Manual server checkpoints
are explicit persistence anchors. They are not canonical public content, not
provider state, and not a strategic refusal to add cleaner APIs or services
when those become the smallest correct boundary.

## Live Deployment Posture

Content Studio should be deployed to the private Studio Cloud Run service as
soon as each coherent slice is validated. The expected path is:

```bash
pnpm studio:cloudrun:deploy
```

The service remains private behind Google auth and the Studio allowlist. The
route can be live while still browser-local because the only customer right now
is the operator and the rollback path is fast.

## When To Add Persistence

Move beyond browser-local plus manual checkpoints when one of these becomes
true:

- multiple agents or people need shared project state
- Content Studio needs to feed HGO staged artifacts or WorldHub offers
- a project needs auditability beyond manual JSON export
- the board becomes an operational source of truth instead of a personal
  planning surface

Reasonable next persistence options:

- a Prisma-backed Studio model if the state belongs inside the existing Studio
  app
- a focused API boundary if HGO, Studio Cut, or WorldHub need to consume the
  same project packets
- a small deployable service if content operations need independent scale,
  queueing, provider adapters, or a separate release cadence

Do not over-contort the monorepo to avoid a clean database/API/service boundary
when that boundary is the smallest correct move.

## Product Spine

Current workflow stages:

```text
source -> shape -> produce -> publish -> follow-through
```

Stage intent:

- `source`: source material, recordings, transcripts, manuscript snapshots,
  staged artifacts, citations, and private/public safety review
- `shape`: episode structures, chapter maps, outlines, page sections, and
  review blockers
- `produce`: edits, drafts, scripts, show notes, assets, excerpts, and review
  packets
- `publish`: HGO pages, podcast metadata, public-safe copy, discovery metadata,
  social/email drafts, and future host/provider packages
- `follow-through`: analytics, supporter signals, coaching tie-ins, merch
  ideas, and next-content prompts

## Integration Direction

Content Studio should not own everything. It should coordinate creative state
and hand off clean packets:

- HGO owns public episode/page rendering and public-safe promotion.
- Content Studio can emit staged HGO projection drafts, but HGO review gates
  decide whether a projection is blocked, needs review, or a future
  promotion candidate.
- WorldHub owns offers, entitlements, payments, supporter state, merch,
  provider connections, and business follow-through.
- Studio Cut owns media-editing workflows and rescue/publish packages.
- Existing coaching request and appointment workflows remain in `apps/web`
  until a deliberate migration is planned.

The near-term build path should favor useful vertical slices over perfect
architecture. No existing route, package, or app boundary is sacred if a cleaner database/API/service split lets the system move faster.
