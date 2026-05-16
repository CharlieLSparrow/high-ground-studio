# Studio Priorities and Architecture Boundary

This file is the root-level constitution for this repository while High Ground Studio evolves into the writing, research, learning, and publishing system that feeds HighGroundOdyssey.com, Quiplore, podcast prep, books, songs, and future agent workflows.

## Core priority

High Ground Studio is the primary architecture.

Existing HighGroundOdyssey.com features, motion experiments, marketing pages, coaching flows, render pipelines, and public-site conveniences are allowed to remain useful, but they are subordinate to the Studio architecture. They should not dictate the long-term data model, deployment model, or service boundaries for the writing and research system.

In plain terms: the public site can orbit the Studio. The Studio should not orbit the public site.

## Product north star

The Studio is a private creative and research operating system for:

- writing and revising original work
- tagging and structuring source material
- preparing podcast episodes
- studying and writing TED talks / public talks
- developing books and chapters
- collecting and curating quotes for Quiplore
- analyzing fiction, nonfiction, comedy, songs, sketches, transcripts, and articles
- building a durable semantic knowledge graph
- giving AI agents structured, source-aware context for drafting and publishing

## Architectural posture

Prefer a modular monorepo with clear internal boundaries first.

Do not split into many separate repositories or microservices just because the future system may become large. Split only when a boundary has earned independence through different scaling needs, security needs, deployment cadence, runtime requirements, or data ownership.

Initial likely boundaries:

- `apps/studio` or equivalent private Studio web app
- public High Ground / Quiplore-facing apps
- collaboration service for real-time editing
- knowledge API for documents, nodes, tags, structures, and search
- ingestion workers for sources, transcripts, imports, and media-derived text
- embedding / AI workers for semantic search and agent support
- projection workers for book, podcast, show-notes, and Quiplore views
- infrastructure as code under `infra/`
- shared domain types and editor schema packages

## Data model priority

The knowledge model is more important than the existing site model.

The durable center of gravity should be a Postgres-backed semantic knowledge system built around concepts such as:

- workspaces
- projects
- sources
- documents
- blocks
- spans
- tags
- nodes
- edges
- structures
- embeddings
- agent runs
- publication/projection records

Existing models may be retained, migrated, wrapped, or retired as needed. Do not force the Studio knowledge graph to contort around older tables whose purpose was appointment scheduling, memberships, marketing, or experimental site behavior.

## Integration rule

Integrate with the existing High Ground codebase loosely.

The current website can consume Studio projections later, but should not reach directly into private authoring tables or become the owner of Studio concepts. Public surfaces should read approved, projected, publication-safe data.

Private Studio data and public publishing data must remain separated by design.

## Automation rule

Admin work should be automated as code.

Prefer:

- Terraform or equivalent infrastructure-as-code over console clicking
- repeatable scripts over manual setup notes
- migrations over ad hoc database edits
- generated docs and runbooks where useful
- CI checks for formatting, tests, type safety, and infrastructure validation
- small reviewable pull requests over sweeping invisible changes

Codex and other coding agents may help scaffold, refactor, document, test, and generate infrastructure, but they should work inside explicit boundaries. They should not invent cloud architecture, commit secrets, create broad permissions, or silently reshape production assumptions.

## Security and privacy rule

The Studio will hold private drafts, unpublished ideas, family creative work, source notes, research trails, and future AI-agent context. Treat it accordingly.

Principles:

- least-privilege service accounts
- no committed secrets
- public APIs read only approved public projections
- private source material stays private unless explicitly published
- agent outputs should preserve provenance and approval status
- source metadata and rights flags matter from the beginning

## Decision rule

When deciding whether to reuse existing code or build fresh, prefer the path that protects the Studio's long-term model.

Reuse existing code when it is helpful and low-friction.

Isolate or replace existing code when it would make the Studio harder to reason about, test, secure, deploy, or evolve.

The repository may be shared. The architecture should stay honest.

## First build target

The first meaningful vertical slice should be:

1. authenticate into the private Studio
2. create a document
3. edit collaboratively or prepare for collaboration
4. apply semantic tags
5. persist document state
6. extract tagged spans into knowledge nodes
7. view those nodes in a structured panel
8. prepare the path for semantic search and future projections

This is the baby dragon. Feed this first.
