# Content Management Studio

Date: 2026-05-23

## Purpose

The Content Management Studio is the long-term creative operating system for
High Ground Studio, High Ground Odyssey, QuipLore, WorldHub, and future
education/content sites.

Its job is to help the team move from source material and rough ideas into
structured drafts, production assets, publishing schedules, public sites,
audience feedback, and business follow-through without losing provenance or
private source boundaries.

## Product Spine

The durable spine is:

```text
research -> structure -> produce -> publish -> learn
```

Every major feature should attach to that spine:

- `research`: source material, quotations, principles, examples, notes,
  evidence, interviews, and Quipsly-assisted context
- `structure`: books, speeches, podcast outlines, video story arcs, course
  modules, campaigns, and reusable templates
- `produce`: drafts, scripts, recording prep, audio/video edit notes, review
  packets, and export packages
- `publish`: High Ground Odyssey pages, future education sites, social posts,
  email campaigns, embeds, Kindle/Audible-ready packages, and scheduled drops
- `learn`: analytics, SEO, marketing feedback, supporter signals, coaching
  demand, offer performance, and next-content recommendations

The spine matters because the full vision is large. A feature that cannot be
placed on the spine is probably premature or belongs in a separate experiment.

## App Relationships

### `apps/studio`

Studio owns private creative workflows:

- tagging and semantic source work
- writing and manuscript work
- structure mode
- collaboration labs
- future content project planning
- future research assistant workflows
- future production and publishing handoff tools

Studio is private. It must not publish private manuscript/source material or
make public content canonical without an explicit review/promotion workflow.

### `apps/web`

The public web app owns public High Ground Odyssey surfaces and internal team
operations that already live there:

- public pages
- library/episode routes
- HGO staged projection prototypes
- coaching front door
- client dashboard
- internal team console
- WorldHub shell under `/team/worldhub`

`apps/web` can receive published or staged artifacts from Studio later, but
private Studio draft material should not be moved directly into public routes.

### WorldHub

WorldHub owns business infrastructure and access follow-through:

- people/users
- offers
- products/prices
- orders/subscriptions
- entitlements
- coaching packages/sessions
- provider connections
- supporter/Patreon posture
- merch/POD posture
- embeds

Content Studio can create the need for offers, memberships, supporter calls to
action, merch, coaching workflows, and embeds. WorldHub should own those
business objects instead of forcing commerce concepts into the creative source
model.

### QuipLore / Quipsly

QuipLore and Quipsly should sit beside Studio as research and knowledge
infrastructure:

- quote API and database
- principles and ideas
- example banks
- research assistant context
- explainers with many examples
- citation/provenance support

The first integration should be typed task packets and provider-neutral
interfaces, not live API calls.

## Capability Areas

The full Content Management Studio can eventually include:

- book writing
- speech writing
- podcast planning
- podcast audio editing
- podcast video editing
- travel video planning and editing
- social post generation and scheduling
- content calendars
- analytics snapshots
- SEO briefs
- marketing campaign planning
- research assistants
- Quipsly quote/principle/example assistance
- public site publishing handoff
- direct Kindle/Audible package preparation
- Patreon/supporter handoff
- merch/POD handoff
- Homer coaching operations through WorldHub

These should not all be built at once. The first durable version should make the
spine visible, then ship one useful vertical slice at a time.

## First Useful Vertical Slice

The best first slice is:

```text
research note / source -> structured project -> draft/review packet -> content schedule item -> WorldHub follow-through idea
```

Why this slice:

- it proves Studio is broader than a manuscript editor
- it helps prepare real content for Homer quickly
- it does not require payment providers
- it does not require social publishing credentials
- it does not require production database schema changes before the workflow is
  understood
- it connects naturally to existing HGO staged projection and WorldHub shell
  work

## Agentic AI Posture

Agentic AI should operate on explicit task packets:

- goal
- source boundaries
- allowed material
- excluded/private material
- required output shape
- citation/provenance expectations
- examples requested
- review state

This keeps research assistants and Quipsly-powered helpers from becoming loose
chat surfaces that lose context, source safety, or reviewability.

## Provider Posture

External providers should be adapters:

- social platforms
- Kindle/Audible publishing tools
- Patreon/supporter systems
- Stripe/payment systems
- POD/merch vendors
- analytics/SEO providers
- email providers

Core Studio objects should describe content, source, review, production,
publishing intent, and schedule state. Provider-specific ids, payloads, webhook
state, and credentials belong at the edge.

## What Not To Build Yet

Do not build these until the core workflow is useful and deployable:

- live social posting
- live Kindle/Audible publishing
- Stripe Checkout
- Patreon API calls
- POD vendor calls
- production fulfillment workers
- production analytics ingestion
- public manuscript promotion
- destructive source cleanup
- automatic canonical publishing
- broad Prisma schema changes without a concrete migration and rollback plan

## Current Runtime Marker

The first visible runtime marker is the protected Studio route:

```text
/content-studio
```

It is a static internal command surface. It does not write data, call providers,
change Prisma, publish content, or expose private manuscript material.
