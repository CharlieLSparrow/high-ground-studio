# Quipsly / QuipLore Foundation

Date: 2026-05-25

## Purpose

QuipLore and Quipsly are first-class platform products, not add-ons to High
Ground Odyssey.

QuipLore is the public quote exploration, saving, and curation experience at
`quiplore.com`.

Quipsly is the source-aware agent, quote database, API, research, and media
generation layer at `quipsly.com` and related API/service surfaces. Quipsly can
also express the mascot/world layer, but that charm must sit on top of serious
source and attribution rigor.

This document converts the current brainstorm into a buildable foundation. It
does not create a runtime app, database schema, provider integration, or Google
Cloud resource yet.

## Product Boundary

### QuipLore

QuipLore owns the public quote product:

- quote discovery
- canonical Quote Passport pages
- quotable person pages
- saved quotes
- personal Nests
- public and private Lorelists
- curated Trails
- quote cards and share cards
- topic/theme browsing
- source, variant, and misquote visibility

QuipLore should be beautiful and cozy, but it is not a casual meme site. Its
long-term moat is trust: exact wording, attribution posture, source context,
variant handling, and visible uncertainty.

### Quipsly

Quipsly owns the intelligence and source platform:

- SQL-backed quote and source records
- vector-enhanced search over quotes, sources, people, themes, and evidence
- ingestion pipelines
- source evidence and provenance records
- verification and disputed-attribution workflows
- researcher/agent task packets
- agent run logs
- API contracts consumed by QuipLore and future apps
- Quipsly mascot/world assets and card rendering inputs

Quipsly should not silently publish public claims. Agent output must preserve
source evidence, uncertainty, review state, and rollback.

## Relationship To Existing Repo

Use the current monorepo pattern, but do not force Quipsly or QuipLore through
existing HGO routes or Studio internals.

Recommended first camp:

- `apps/quiplore`: public QuipLore web app
- `apps/quipsly-api`: Quipsly API / service surface
- `apps/quipsly-worker`: later worker/job surface for ingestion, embeddings,
  verification queues, and research runs
- `packages/quipsly-domain`: pure domain contracts for quotes, people, sources,
  evidence, curation, agent tasks, and public projections

Do not put the first QuipLore build inside `apps/web`. Do not put Quipsly
runtime behavior inside `packages/worldhub-domain` or
`packages/content-studio-domain`.

WorldHub can later provide shared identity, offers, entitlements, supporter
access, embeds, and commerce. Quipsly should own quote/source intelligence.
QuipLore should own the public quote experience.

## Source Architecture

QuipLore and Quipsly should follow the tagged-source projection architecture:

- preserve source material
- address spans
- tag meaningfully
- branch decisions
- render projections
- preserve rollback

A quote card, QuipStream item, person page section, or Lorelist is a
projection. It must not become the only durable record.

The durable truth lives in source, quote, attribution, evidence, variant,
verification, and review records.

## Core Product Pillars

### Quote Passport

The Quote Passport is the canonical reference page for a quote.

It should include:

- exact quote text
- canonical attribution
- speaker or author
- source/work
- source type
- verification status
- confidence and review notes
- evidence excerpts or citations
- historical/context notes
- variants and paraphrases
- known misattributions
- related quotes
- themes and tags
- save/share/add-to-Lorelist actions
- Quipsly note or contextual companion copy

The Quote Passport is the atomic unit of trust.

### Quotable Person Page

Quotable person pages are major SEO, discovery, and identity surfaces.

They should be part profile, part quote atlas, part source map, and part "why
this person is quotable" page.

Sections should include:

- name
- dates when known
- roles and domains
- concise biography
- top verified quotes
- themes/topics associated with the person
- source works
- disputed or commonly misattributed quotes
- Lorelists featuring the person
- related people
- save/follow/share actions
- Quipsly-only visual treatment

Do not use real human portraits as the default visual language. Use symbolic
Quipsly-led vignettes, archive objects, quote artifacts, environments, or other
non-portrait treatments.

### Quip Card

Quip Card is the reusable quote object across:

- QuipStream
- Quote Passport pages
- person pages
- Lorelists
- Nests
- share cards
- social previews

Every production Quip Card should carry:

- quote text
- attribution
- source hint
- verification badge
- save/add/share controls where appropriate
- visual system hook for Quipsly styling

### Nests, Lorelists, And Trails

Use these names with distinct jobs:

- Nest: a user's personal saved quote space
- Lorelist: an ordered playlist-style quote collection
- Trail: a curated narrative sequence with commentary or a learning arc

The MVP can start with Nests and Lorelists. Trails can follow once commentary,
public curation, and editorial arcs matter.

### QuipStream

QuipStream is the vertical quote discovery experience.

It can borrow the interaction shape of YouTube Shorts and Instagram Reels:
one primary card at a time, quick next/previous navigation, immediate feedback,
and easy escape into deeper context. The QuipLore version should optimize for
curation and source-aware exploration, not raw time spent.

See `docs/architecture/quiplore-discovery-architecture.md` for the deeper
QuipStream product, event, API, and recommendation path.

MVP actions:

- save
- skip
- open Quote Passport
- add to Lorelist
- more like this
- less like this
- too cheesy / not useful

The first prototype should also record impressions and actions in an in-memory
event log so the interaction vocabulary is testable before accounts, database
writes, analytics, or ML.

## Core Entity Map

Initial domain entities:

- Quote
- QuoteText
- QuoteVariant
- Person
- Source
- SourceWork
- Attribution
- Verification
- Evidence
- Misattribution
- Theme
- Tag
- User
- SavedQuote
- Nest
- Lorelist
- LorelistItem
- Trail
- QuipCardTemplate
- AgentTask
- AgentRun
- ResearchNote
- EmbeddingRecord

Important relationship rules:

- A quote can have many text variants.
- A quote can have many attributions.
- One attribution can be canonical for a given public projection.
- Verification belongs to the quote-text, attribution, and source relationship,
  not just to the quote text alone.
- A person can be an author, speaker, translator, editor, character, actor,
  collector, or source contributor.
- A source can be a book, speech, poem, episode, film, interview, article,
  letter, scripture, podcast, archive item, or web page.
- A Lorelist item points at a quote projection plus optional curator notes.
- A Quip Card is a projection over quote/source/review state.

## Verification Posture

QuipLore must make uncertainty visible instead of hiding it.

Suggested public status vocabulary:

- verified
- attributed
- variant
- disputed
- misattributed
- needs source
- needs review

Internal review state can be more granular, but public pages should explain the
status in plain language.

For disputed or popular-but-wrong quotes, the system should create useful pages
instead of dead ends. A misquote page can explain the common wording, why it is
not verified, where it may have come from, and better sourced alternatives.

## Visual Language

Detailed notes from uploaded visual references live in:

```text
docs/reference/quipsly-quiplore/visual-language-study.md
```

Current direction:

- warm storybook archive
- tactile paper/card interface
- cozy, serious, literary, and source-aware
- charming Quipsly mascot/world layer
- trustworthy archive beneath the charm

Base palette direction:

- warm parchment or off-white surfaces
- brown or near-black ink
- muted botanical green
- restrained gold
- occasional plum
- small blue-gray or slate accents for evidence/status UI

Starter tokens from the early vector/reference pass:

```text
parchment: #fdf1dc
warm-paper: #f8d9b0
tan-shadow: #e2b17b
quipsly-brown: #ad6b35
ink-brown: #4c331b
```

Avoid turning the UI into a one-note beige theme. Verification, action, source,
and navigation states need enough contrast and color range to stay legible and
modern.

Shape and material direction:

- paper cards
- archive labels
- bookplate or field-note details
- modest radius, generally 8px or less for cards unless a component has a
  clear reason to be softer
- tactile but not childish
- polished enough for source credibility

Avoid:

- hustle-poster quote cheese
- meme-page looseness
- generic AI gradients
- aggressive gamification
- real human portrait defaults
- cluttered scrapbook UI that weakens source trust

## Quipsly Representation Rules

Quipsly can be playful. The archive cannot be sloppy.

Representation should come through:

- body shape and posture variation
- feather or styling palette
- props and settings
- archive tools
- reading/research poses
- scene context

Do not reduce diversity to costume swaps. Do not use caricatured versions of
real people. For person pages, prefer symbolic scenes or Quipsly-mediated
archive/tableau visuals over direct portrait replacement.

## Google Cloud Native Direction

The intended runtime posture is Google Cloud native:

- Cloud Run for web/API services
- Cloud Run Jobs or worker services for ingestion and embeddings
- Cloud SQL Postgres for relational quote/source data
- vector search via a reviewed Postgres/vector strategy or a later dedicated
  retrieval service if needed
- Secret Manager for service-specific secrets
- Artifact Registry for images
- Cloud Build or GitHub Actions WIF for deploys
- Cloud Storage for source artifacts and import payloads
- Pub/Sub or Cloud Tasks for durable asynchronous jobs
- Vertex AI or other model providers behind Quipsly adapters, not directly
  called from public QuipLore pages

Each service should have its own runtime identity and narrow permissions.

Do not reuse `web-*` or `studio-*` secrets, service accounts, or Cloud Run
services for Quipsly/QuipLore.

## First Build Surfaces

The smallest useful vertical slice:

1. `packages/quipsly-domain` with quote, person, source, verification,
   collection, and projection contracts.
2. `apps/quiplore` with static seed-data prototypes for:
   - home
   - Quote Passport
   - Quotable Person page
   - Lorelist
   - QuipStream
3. Quip Card component system.
4. Seed data using clearly synthetic or public-safe sample quote records.
5. Design tokens and visual system primitives.
6. A docs-only API/database proposal before any Prisma or Cloud SQL work.

The first runtime build can be static or file-backed. Do not block the design
system on final database shape, but keep every mock record shaped like future
source-backed data.

## Naming Decisions

Use:

- QuipLore: public platform and quote exploration product
- Quipsly: agent/API/research/mascot intelligence layer
- Quote Passport: canonical quote page
- QuipStream: discovery feed
- Nest: personal saved library
- Lorelist: ordered quote collection
- Trail: curated quote path with commentary

Keep domain names lowercase in infrastructure docs:

- `quiplore.com`
- `quipsly.com`

## Open Decisions

- Final visual tokens after image handoff arrives.
- Whether `quipsly.com` is an API/docs portal, a public brand site, or both.
- Whether QuipLore accounts use the existing app identity center immediately or
  defer auth until the public UX proves itself.
- First source corpus for seed data.
- Exact Google Cloud project/resource naming.
- Vector strategy and migration tooling.
- How much of Quipsly mascot/media generation is hand-authored versus
  generated from approved brand prompts.

## Non-Negotiables

- First-class app boundaries.
- Source provenance is product core.
- Public charm cannot hide source uncertainty.
- No casual ingestion of private Studio or unreleased HGO material.
- No public publishing from agent output without review state.
- No provider calls, live cloud resources, DNS, secrets, or database mutations
  until the service boundary and rollback path are explicit.
