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
- export a browser JSON handoff packet with explicit safety flags

## Current Boundaries

This slice does not:

- write Prisma data
- call provider APIs
- publish public content
- deploy anything
- use real manuscript or HGO source content
- change canonical manuscript truth
- replace the HGO staged projection review path
- replace existing coaching request or appointment workflows

Browser-local state is a fast first slice. It is not a strategic refusal to use
databases, APIs, services, or deployable boundaries.

## When To Add Persistence

Move beyond browser-local state when one of these becomes true:

- projects need to move between devices
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
- WorldHub owns offers, entitlements, payments, supporter state, merch,
  provider connections, and business follow-through.
- Studio Cut owns media-editing workflows and rescue/publish packages.
- Existing coaching request and appointment workflows remain in `apps/web`
  until a deliberate migration is planned.

The near-term build path should favor useful vertical slices over perfect
architecture.
