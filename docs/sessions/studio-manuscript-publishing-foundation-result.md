# Studio Manuscript Publishing Foundation Result

Date: 2026-05-21

## Purpose

Add a first-class publishing and Homer handoff foundation inside
`/manuscript` without changing infrastructure or manuscript persistence
semantics.

This pass is app code, pure helpers, UI, tests, and docs only. It does not add
autosave, Yjs, simultaneous editing, Prisma schema changes, database schema
changes, Cloud SQL changes, Cloud Run configuration changes, or canonical
manuscript/content writes.

## What Changed

- Added architecture notes for:
  - Studio manuscript publishing workflow
  - future Studio collaboration roadmap
- Added pure Manuscript Desk publishing helpers for:
  - publish readiness reports
  - publishing packet Markdown
  - recording handoff Markdown
  - quote review appendix Markdown
  - author contribution Markdown
  - Chapter / Episode export options
- Added a `Publish` sidebar mode to `/manuscript`.
- Added Publish-mode readiness summary UI for:
  - word, character, and block counts
  - Chapter / book, Episode, and Section region counts
  - structure coverage
  - author summaries
  - quote review status counts
  - manual snapshot cautions
  - readiness issue severity
- Added browser-only Markdown generation and download actions for:
  - publishing packet
  - recording handoff
  - quote appendix
  - author contribution summary
- Added Publish handoff actions to mobile Tools without moving Publish controls
  above the manuscript.
- Added footnote help notes for Publish mode and the new export concepts.
- Expanded synthetic-only tests for readiness reports and export Markdown.

## Product Behavior

Publish mode is a handoff and inspection layer. It derives its output from the
current browser-local draft plus existing metadata:

- block summaries
- structure regions
- author marks
- cited quotation marks
- quote review metadata
- manual snapshot status

Exports are generated in the browser and downloaded by the browser. Generating
or downloading Publish exports does not save a server snapshot, mutate
database state, write files on the server, or promote material into public
content.

The readiness report is intentionally practical rather than punitive. It flags
missing book/episode structure, unresolved quote review states, unassigned
author spans, uncovered blocks, and local changes since the last known server
save or load.

## Boundaries Preserved

- No Prisma schema changes.
- No DB schema changes.
- No `db:push`.
- No Cloud SQL infrastructure changes.
- No Cloud Run config, env, secret, IAM, DNS, OAuth, or billing changes.
- No autosave.
- No Yjs or simultaneous editing.
- No canonical manuscript/content path changes.
- No real manuscript text added to tests or fixtures.

## Smoke Guidance

The smoke checklist now includes a Publishing / Handoff section. Use synthetic
draft text first. Confirm exports are browser-only and confirm Publish mode
does not imply canonical publishing, autosave, or collaboration.
