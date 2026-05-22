# Platform Service Boundaries

Date: 2026-05-19

## Purpose

This document names the first service boundaries for High Ground Studio / High
Ground Odyssey before the first private Cloud Run deployment.

The goal is to keep the platform honest as it grows toward:

- private Studio workflows
- public High Ground Odyssey surfaces
- Quiplore and other future public sites
- commerce and subscriptions
- source-aware AI and ML workflows

It is not an infrastructure-as-code plan yet.

WorldHub is the future central infrastructure hub for cross-site offers,
entitlements, provider connections, embeds, commerce, fulfillment, and coaching
coordination. See `docs/architecture/worldhub-foundation.md` for the first
provider-neutral WorldHub boundary before implementation work begins.

## Current Services

### `apps/studio`

Private creative operating system.

Current responsibilities:

- private Google-authenticated Studio access
- Tagging Desk
- Writing Desk
- Structure Mode
- local-only Studio persistence guard
- browser-local Structure Mode MVP under
  `high-ground-studio.structure-mode.v1`
- browser-local Manuscript Desk under
  `high-ground-studio.manuscript-editor.v1`
- optional explicit Manuscript server snapshots through
  `StudioManuscriptSnapshot` once a safe Studio database is configured
- health check at `/api/health`

First deployment target:

- Google Cloud Run private MVP
- no remote `DATABASE_URL`
- temporary Google OAuth plus `STUDIO_AUTH_MODE=allowlist`

Studio should own private drafts, source trails, semantic tags, structures,
research notes, agent context, and future private knowledge graph operations.
It should not become the public website.

### `apps/web`

Public and operations-facing app.

Current responsibilities:

- High Ground Odyssey public site
- public coaching front door
- signed-in client dashboard
- internal team operations
- current episode/library routes
- current appointment, coaching request, membership, and support workflows

`apps/web` may later consume approved Studio projections. It should not reach
directly into private Studio authoring tables.

## Future Service Boundaries

### Commerce And Subscriptions

Commerce should become its own clear boundary when it is time to move beyond
external links.

Current reality:

- full Stripe Checkout is not active
- coaching payment support is an external URL
- membership plans exist as internal app records, not live billing products

Future responsibilities for a commerce/subscriptions service or module:

- checkout session creation
- webhook verification and idempotency
- subscription state reconciliation
- product/price mapping
- entitlement grants
- billing portal handoff
- payment failure handling
- audit logs for paid access decisions

Boundary rule:

Commerce may grant access or entitlements, but it should not own Studio drafts,
source material, public content, or knowledge graph records.

### Public Projection Service

Public projections should sit between private Studio material and public sites.

Future responsibilities:

- approved book chapter outputs
- podcast packets and show notes
- Quiplore quote entries
- newsletters and public essays
- rights/citation status
- publication approval state

Boundary rule:

Public routes should read approved projections or checked-in public content, not
raw private Studio source tables.

### Multi-Site Public Surfaces

Future public sites may include:

- High Ground Odyssey
- Quiplore
- book-specific sites
- course or workshop sites
- campaign or event sites

These surfaces can share design primitives, projected content, identity, and
commerce entitlements where appropriate. They should not share private Studio
editing routes or private source data.

### AI And ML Services

AI/ML work should become its own worker/API boundary once it needs external
model calls, embeddings, or index refresh.

Future responsibilities:

- source-aware drafting assistance
- quote/story retrieval
- embeddings for spans and nodes
- vector index refresh
- evaluation datasets
- agent run logs
- model/provider cost controls

Boundary rule:

AI output must preserve provenance and approval state. It should not publish
directly to public surfaces.

## Deployment Boundary

Cloud Run is the first runtime target for `apps/studio`, and the first prepared
deploy target for `apps/web` once the web app has confirmed runtime secrets,
database configuration, OAuth callback URLs, and rollback.

Near-term Cloud Run services should stay narrow:

- `studio` for the private Studio web app
- `web` for the public and operations-facing High Ground Odyssey app
- later worker services only when ingestion, embedding, or projection jobs need
  separate scaling and permissions

Do not create broad service accounts that can mutate every platform resource.
Each service should earn its own runtime identity and permissions.

## What Not To Split Yet

Do not split prematurely into separate repos or services for:

- every public site idea
- every Studio feature lane
- every output type
- every source type
- every future AI helper

Keep boundaries modular inside the monorepo until runtime, security, scaling,
or ownership needs justify a separate service.

## First Operator-Led Deployment Implication

For the first Cloud Run deployment, the only service being prepared is:

```text
studio
```

That service should prove:

- container build works
- health route responds
- Google OAuth works
- allowlist access works
- `/structure` is usable
- no remote database is required for the browser-local MVP surfaces
- no public projection or commerce behavior is exposed

Commerce, subscriptions, multi-site public surfaces, and AI/ML services remain
future platform boundaries.
