# Unified Session candidate review queue

Date: 2026-08-03

Status: implemented and operated on Nest's rendered component boundary and the
compiled iPhone 17 Pro simulator; physical-iPhone and production acceptance
remain open

## Outcome

Nest and Quipsly Capture now present transcript-derived note, goal, and task
candidates as one chronological human review queue. The queue follows source
time instead of splitting one conversation into three distant category
sections, while retaining the existing source evidence and explicit mutation
contracts for each candidate type.

The default view shows only candidates that need attention. Reviewers can move
between active, deferred, decided, and complete views; see overall progress;
jump to the next unfinished decision; and retain immediate readback of the
candidate they just decided. iPhone uses the compact labels Review, Later,
Done, and All over the same state model.

## Canonical safety boundary

- The queue is a projection over the existing packet note, goal, and task
  candidates. It introduces no database migration and no new canonical entity.
- Accepted or merged candidates and rejected candidates are classified as
  decided. Deferred candidates remain deliberately separate. Candidates whose
  source span is not human reviewed are labelled listen first.
- Sorting is deterministic by source start, source end, candidate kind, and
  stable identity. Candidate identities are kind-qualified so equal IDs across
  different candidate types cannot collide.
- Every card still calls its existing hardened note, goal, or task review
  endpoint. The queue does not batch decisions, create implicit work, change
  due dates, assign people, mutate calendars, send messages, deliver client
  material, edit Studio media, or publish anything.
- Packet-stale and release-evidence holds lock the entire queue while preserving
  inspectable state. Preview exposes the full queue but disables every
  mutation.

## UX details

### Nest

- One prominent follow-through section replaces three disconnected candidate
  sections.
- Progress separately reports ready, listen-first, deferred, and decided work.
- Continue review moves keyboard focus and scroll position to the earliest
  unfinished source-linked candidate.
- A newly completed decision remains visible as Just decided while the queue
  advances, so server acknowledgement does not disappear before it can be
  read.
- Empty and held states explain exactly why no decision is available.

### Quipsly Capture

- The transcript jump menu has one Review queue destination.
- The phone shows the same chronological mixed-candidate order, compact
  progress, state counts, a Continue review action, and a segmented state
  filter.
- Existing note, task, and goal cards remain the mutation owners, including
  exact-source return, edit, accept/create, merge, defer, and reject behavior.
- The built-in Library preview now renders this same queue with note, task, and
  goal samples. The operated test found and corrected an initial regression
  where preview had been excluded from the new queue.

## Verification

- Nest review model and rendered interaction suites: 2 suites, 45 tests, pass.
- Nest strict TypeScript: pass.
- Mobile capture source contract: pass in source-only mode, including the
  updated unified-queue invariants.
- iOS App Store static contract: 1,015/1,015 pass.
- Swift compile plus operated iPhone 17 Pro / iOS 26.3.1 simulator journey:
  1/1 pass. It navigates from Library into transcript review, verifies the
  queue progress and state filter, reaches task and goal candidates, confirms
  provider-only mutation locks, inspects both editors, and completes the
  accessibility audit.
- Retained result bundle:
  `/Volumes/My Passport/Quipsly QA Artifacts/Unified Session Review Queue 2026-08-03/HighGroundCapture-product-final.xcresult`.
- `git diff --check`: pass.

The operated run also exposed accumulated disposable XCTest device clones that
filled the local disk. Only the failed slice-specific result bundles, invalid
derived-data copy, and disposable XCTest clones were removed. The successful
result bundle and final external DerivedData were retained.

## Remaining acceptance

This is simulator and rendered-component proof, not physical-iPhone or
production proof. A future acceptance pass should open a real completed Session
on a paired iPhone, listen through an exact retained recording span, exercise
each queue filter, make at least one deliberate note/task/goal decision, and
read back the same canonical identity in Nest. No Cloud Build, deployment,
production database write, TestFlight/App Store action, provider mutation,
calendar mutation, invitation, delivery, or publication occurred in this
slice.
