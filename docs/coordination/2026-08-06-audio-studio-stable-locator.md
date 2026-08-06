# Audio Studio stable project locator

Date: 2026-08-06

## Outcome

Audio Studio now carries the canonical `StudioProject.id` together with its
human-readable slug through every project-scoped operation exposed by the
surface. The exact pair is authorized before protected evidence is read and
before any queue, review receipt, promotion, delivery, or correction can be
created.

This completes the Audio Studio caller migration started by the shared stable
project-locator contract. Slug-only requests remain a compatibility path only
when the slug identifies exactly one project.

## Covered operations

- episode media inventory;
- mastering status, queue, and reconciliation;
- decoded signal-profile status, queue, and reconciliation;
- canonical source-transcript status, queue, and reconciliation;
- transcript correction and confirm-as-heard receipts;
- dialogue-repair candidates, experiments, reconciliation, and reviews;
- audible-event suggestion review and retained qualification corpus;
- spectral status, queue, reconciliation, and protected tile reads;
- mastering approval and rejection;
- delivery-candidate promotion and withdrawal;
- delivery encoding and reconciliation; and
- delivery proof-listen approval and rejection.

Nested review tools receive the same stable ID from the selected Audio Studio
project. The ID is not forwarded into media-processing service coordinates;
it exists at the access boundary, while the existing immutable source and job
coordinates continue to bind the downstream operation.

## Failure behavior

An ID-plus-slug mismatch fails at shared project access. The route does not
authorize the media source and does not invoke the read or mutation service.
This prevents a valid-looking slug from silently selecting a project in a
different workspace.

Current links and requests use the stronger pair. Older slug-only callers do
not guess by recency: they operate only for a unique slug and fail closed if
the slug becomes ambiguous.

## Verification

- Quipsly TypeScript passes after the complete route and component migration.
- Eleven focused suites pass 57 tests across the Audio Studio client, nested
  transcript/dialogue tools, mastering, transcript review, delivery,
  audible-event review/corpus, and protected spectral evidence.
- Client tests verify the stable pair on primary GETs and on mastering,
  signal-analysis, and transcription mutations.
- Nested-tool tests verify stable IDs on dialogue-review and transcript-
  correction mutations and on spectral status/tile reads.
- Route tests verify that mismatched locators stop before source authorization,
  readback, or mutation.
- The complete default Quipsly run passes 348 active suites and 1,812 active
  tests. Forty-two database/provider-gated suites and 136 tests remain
  intentionally skipped in that run.

## Retained browser operation

The retained High Ground Odyssey source opened through the exact project pair,
resolved a protected immutable source, and landed at 1.249 seconds while
paused. Replacing only the project ID with `stale-project-id` displayed the
stale/mismatched Nest warning, rendered no protected media, and did not expose
the source name. Restoring the valid pair restored the same source at 1.249
seconds while paused.

## Broader migration

The shared resolver remains the required boundary for other project-scoped
Nest and Studio surfaces. Migrate each surface as a coherent vertical slice:
carry ID plus slug in its URLs and requests, reject stale pairs visibly, retain
unique-slug compatibility where necessary, and prove that denial occurs before
side effects.

Production readback, separate-account rendered denial, and physical-device
media operation remain distinct acceptance gates.
