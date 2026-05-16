# Studio Boundary

Date: 2026-05-12

## Purpose

This document turns `STUDIO_PRIORITIES.md` into a practical repo boundary.

High Ground Studio is becoming the private writing, research, learning,
semantic tagging, podcast prep, book development, quote curation, and
AI-agent support system for High Ground Odyssey, Quiplore, and related future
publishing surfaces.

The repo can stay shared. The architecture should not be blurry.

## Decision

Introduce the Studio as its own app boundary in the next implementation pass:

- `apps/studio`

Do not grow the private Studio as another `/team/*` area inside `apps/web`.

The existing web app has useful auth, Prisma, team tools, content readers, and
publishing history. Those should be reused where they help. They should not
define the long-term Studio product shape.

## Why Studio Gets `apps/studio`

`apps/web` is already carrying several jobs:

- public High Ground Odyssey pages
- public coaching and support surfaces
- signed-in client dashboard
- internal team operations
- current episode and library routes
- route-facing published MDX behavior
- transitional content tooling

That is enough gravity for one app.

The Studio needs a different center:

- private creative work
- unpublished source material
- document editing
- semantic tagging
- quote and citation curation
- knowledge graph operations
- source-aware AI-agent context
- projection workflows into public surfaces

Putting those inside `apps/web` would make the public site feel like the owner
of the private knowledge system. That is the wrong dependency direction.

## What `apps/web` Remains Responsible For

`apps/web` remains the public and operations-facing app.

Current responsibilities:

- public High Ground / High Ground Odyssey pages
- `/coaching` and related public coaching handoff pages
- `/dashboard` client dashboard
- `/team/*` operational tools that already exist
- current public episode/library routes
- route-facing `apps/web/content/publish` behavior
- current client, coaching request, membership, appointment, and support flows

Future responsibility:

- consume approved Studio projections
- render publication-safe book, podcast, quote, and guide outputs
- avoid direct ownership of private Studio authoring tables

`apps/web` should read public derivatives. It should not become the private
editor, source archive, or knowledge graph control plane.

## What `apps/studio` Becomes Responsible For

`apps/studio` should become the private creative operating system.

Initial responsibilities:

- authenticate trusted Studio users
- create and edit Studio documents
- organize workspaces and projects
- persist source-aware document blocks
- tag documents, blocks, and spans
- extract tagged spans into knowledge nodes
- show nodes, tags, source references, and provenance in structured panels
- prepare for semantic search and future agent workflows

## First Auth And Ownership Boundary

As of the 2026-05-16 auth-boundary pass, `apps/studio` has its first private
access gate.

The boundary intentionally reuses the existing app identity shape:

- Google sign-in through NextAuth
- canonical `User` lookup/provisioning in Prisma
- env-bootstrapped `OWNER`, `TEAM_SCHEDULER`, and `COACH` roles
- a Studio-specific authorization helper that treats those roles as the first
  approved Studio access set

This is not the final Studio role model. It avoids new Prisma schema and keeps
the change reversible while preventing the Studio workbench from being a public
dev page.

Current ownership behavior is deliberately lightweight:

- page access requires an approved signed-in user
- tag creation requires the same Studio access check server-side
- newly created `StudioTaggedSpan` and `StudioKnowledgeNode` rows keep the
  signed-in user's primary email in `createdByLabel`

This gives Studio records an accountable human label without adding real `User`
foreign keys before the Studio ownership model is ready. A later pass should
replace label-only creator tracking with explicit owner/creator/reviewer
relations once the role model is stable.

Later responsibilities:

- collaboration and revision history
- quote verification and citation workflow
- ingestion from transcripts, manuscripts, notes, and media-derived text
- AI-agent runs with provenance and approval state
- projection review and approval queues
- semantic search over private Studio material

## Likely Package Boundaries

Start with a modular monorepo. Do not split repositories or services until a
boundary earns independence.

Likely packages:

- `packages/studio-domain`
  - Studio domain types, constants, validation schemas, and pure helpers.
  - Good home for `Workspace`, `Project`, `Document`, `Block`, `Span`, `Tag`,
    `KnowledgeNode`, `KnowledgeEdge`, `Source`, `Projection`, and `AgentRun`
    shapes.
- `packages/editor-schema`
  - Editor document schema, block model, mark/span model, and import/export
    transforms.
  - Keep this separate if the editor layer grows beyond plain forms.
- `packages/db`
  - Possible future home for Prisma client access, generated types, and shared
    database helpers.
  - Do not create this until multiple apps need the same database boundary.
- `packages/content-ingest`
  - Possible later home for file parsers and import pipelines.
  - Useful once manuscript, packet, transcript, and quote ingestion become
    repeatable workflows.

Keep package code boring and testable. UI belongs in apps. Pure domain logic
belongs in packages.

## Public Projections

Public surfaces should consume approved projections, not private source tables.

Useful future projection records may include:

- book chapter draft
- podcast episode packet
- show notes
- public article
- quote card
- Quiplore quote entry
- reading guide
- social excerpt

Projection records should carry:

- source Studio project/document references
- approval status
- publication target
- generated or curated output body
- provenance summary
- rights/citation status
- created/updated/reviewed metadata

The public site should be able to answer: "Is this approved for public use?"
without understanding the entire private authoring graph.

## Private And Public Data Separation

Private Studio data includes:

- raw notes
- unpublished drafts
- family creative work
- source trails
- rough AI-agent output
- research fragments
- unverified quotes
- private tags and structures

Public publishing data includes:

- approved projections
- route-facing public copy
- publication metadata
- public-safe summaries
- public quote records after verification

Rules:

- private Studio tables are not public route sources
- public routes read approved projection data or checked-in public content
- unverified quotes stay private or clearly marked until reviewed
- agent output needs provenance and approval state before public reuse
- source metadata and rights flags matter from the first schema pass

## First Vertical Slice

The first useful Studio slice should prove the core loop:

1. sign in to the private Studio
2. create or import one document
3. view document blocks with stable IDs
4. apply semantic tags to a block or selected span
5. persist tags and span references
6. extract tagged spans into knowledge nodes
7. view nodes beside the document
8. preserve source provenance for every extracted node

Recommended first source:

- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`

Reason:

- it already has structured `ManuscriptBlock` metadata
- it is real creative source material
- it already exposed the need for Story Candidates, Story Drafts, quote refs,
  and future semantic nodes

Collaboration can be prepared through stable document/block/span identity. It
does not need to be real-time on day one.

## What Not To Build Yet

Do not build these in the first Studio pass:

- real-time collaborative editing
- a full knowledge graph UI
- public projection publishing automation
- Quiplore integration
- Gemini/OpenAI agent orchestration
- Terraform
- Cloud Run deployment
- multi-tenant workspace billing
- complete quote verification workflow
- migration of all existing content into database truth
- replacement of `apps/web` episode routes

Those are valid later. The first pass should make the private document, tag,
span, node, and provenance loop real.

## Automation Path

Codex can help make setup repeatable without turning the first pass into
infrastructure theater.

Near-term automation:

- generate Studio schema drafts and migrations
- create import dry-run scripts
- add parser fixtures for manuscript blocks and packet frontmatter
- create validation scripts for document/block/tag integrity
- keep `.env.example`, local-dev docs, and deploy notes synchronized
- add focused CI checks after the app boundary exists

Later automation:

- Cloud Run service scaffolding
- Dockerfile and build command standardization
- Secret Manager mapping docs
- Terraform modules for services, IAM, secrets, and database access
- AI-review loops where Gemini or another model critiques boundary docs and
  migration plans before large changes

## Open Decisions For Chuck And Skippy

- Should the first Studio slice import `Learning to Lead` only, or support a
  generic project/document model from the first schema pass?
- Should Studio access start with existing owner/team roles, or should the next
  pass add explicit roles like `STUDIO_EDITOR`, `STUDIO_RESEARCHER`, and
  `STUDIO_AGENT`?
- Should the first editor be a simple textarea/block editor, or should the repo
  choose an editor foundation such as TipTap/ProseMirror immediately?
- Should Studio share the existing Prisma schema file at first, or should the
  repo introduce a clearer database package before the first Studio tables?
- What is the first public projection target: High Ground Odyssey episode
  prep, book chapter draft, or Quiplore quote curation?

## Strong Recommendation

Next pass: scaffold `apps/studio` and build the smallest private document
tagging slice against one imported Learning to Lead source.

Do not start with public publishing, collaboration, cloud deployment, or agent
automation. Make the core private knowledge loop real first.
