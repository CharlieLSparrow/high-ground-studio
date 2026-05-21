# Studio Manuscript Synthetic Smoke Readiness Result

Date: 2026-05-21

## Purpose

Add a synthetic rehearsal path before real manuscript material enters Studio
Manuscript Desk.

This pass keeps the current persistence architecture unchanged. It adds app
code, pure helpers, browser-local UI state, synthetic-only tests, and docs. It
does not add autosave, Yjs, simultaneous editing, Prisma schema changes,
database schema changes, Cloud SQL changes, Cloud Run configuration changes, or
canonical manuscript/content writes.

## What Changed

- Added `createSyntheticManuscriptSmokeDraft()` as a pure helper that returns a
  complete fake `ManuscriptDraft`.
- Added `createRealManuscriptReadinessGate()` as a pure checklist helper for
  first-real-manuscript readiness.
- Added Publish-mode controls for:
  - loading the synthetic smoke draft
  - downloading synthetic smoke draft JSON
  - generating smoke publishing packet Markdown
  - generating smoke recording handoff Markdown
  - generating smoke quote appendix Markdown
  - confirming synthetic server snapshot save
  - confirming phone / second-browser load
  - confirming full draft JSON backup
- Added help notes for the synthetic smoke draft, real manuscript readiness
  gate, phone-load smoke, and first real manuscript import.
- Expanded synthetic tests for the smoke draft, quote review coverage, Publish
  exports, and readiness gate behavior.

## Synthetic Draft Coverage

The built-in smoke draft is fake text only. It intentionally includes:

- 10 manuscript blocks
- headings and paragraphs
- one Chapter / book region
- one Episode region
- one Section region
- Charlie author marks
- Homer / Scott author marks
- unassigned material
- semantic tags for story, insight, question, and transition
- five cited quotation highlights
- quote review states for needs source, needs verification, verified, do not
  use, and no review metadata

## Readiness Gate Behavior

The gate is browser-local and practical. It requires:

- the synthetic smoke draft loaded
- structure, author, cited quotation, and quote review paths present
- publishing packet generated
- recording handoff generated
- quote appendix generated
- synthetic server snapshot saved
- synthetic snapshot loaded on phone or second browser
- full draft JSON backup downloaded

Until every item is complete, Studio says the real manuscript is not ready to
enter. If everything except the phone / second-browser confirmation is done,
the gate says it is ready after manual phone-load confirmation.

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

## First Real Manuscript Rule

Run the synthetic smoke path first. After the real manuscript is imported,
immediately download a full draft JSON backup and save the first real manual
server snapshot with a clear note.
