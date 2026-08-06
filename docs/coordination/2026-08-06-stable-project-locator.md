# Stable project locator

Date: 2026-08-06

## Problem

`StudioProject.slug` is unique only within a workspace, while several Nest and
media routes accept only a slug. The former resolver selected the most recently
updated matching project. If two workspaces later used the same slug, recency
could choose authorization and content context. That is not a safe tenant
boundary.

## Contract

Canonical project access now supports an exact locator made of:

- immutable `StudioProject.id`; and
- human-readable `StudioProject.slug`.

When both are supplied, they must identify the same row. A stale or mismatched
pair is denied. A legacy slug-only locator remains compatible only while one
and exactly one project owns that slug; zero or multiple matches fail closed.

The resolver no longer uses update recency to disambiguate project identity.

## Audio Studio integration

Audio Studio now:

- selects projects by stable ID rather than using the slug as the HTML option
  value;
- preserves `projectId` and `project` in its URL;
- resolves the initial project by the exact pair before using a unique-slug
  compatibility fallback; and
- sends the ID-plus-slug pair to episode inventory.

Episode inventory forwards that pair to the shared episode-production access
boundary and declares the locator rule in its read-only response boundaries.

## Retained operation

The retained coach opened the canonical High Ground Odyssey project
`cms5ittfj0001sgxlaf7zdo46` and episode
`capture-sync-rendezvous-qa-20260805`. The project selector's live value was the
stable project ID, the requested episode remained selected, and the protected
source landed at 1.249 seconds while paused. The URL retained both project ID
and slug.

A second rendered operation replaced the ID with `stale-project-id`. Audio
Studio showed the explicit stale/mismatched identity warning and rendered no
immutable source. Returning to the valid pair restored the same project and
exact paused source position.

## Verification

- Quipsly TypeScript passes.
- Five focused suites pass 20 tests across project access, shared episode
  access, episode inventory, Audio Studio server selection, and client requests.
- Enabled disposable-PostgreSQL proof passes 5 tests, including two projects
  with the same slug in different workspaces: slug-only denial, exact-pair
  access, foreign-project denial, and stale-pair denial.
- The complete default Quipsly run passes 348 active suites and 1,806 active
  tests. Forty-two database/provider-gated suites remain intentionally skipped
  there; the locator database suite was enabled separately.

## Remaining migration

The shared resolver is ready to receive stable IDs, but many older project-
scoped API requests and human-facing Nest URLs still send only a slug. They now
fail safely if ambiguity appears, but the affected operation will be
unavailable until its caller carries the stable ID. Migrate project-scoped
media mutations and then the remaining Nest routes in coherent surface-level
slices; do not reintroduce recency, email allowlists, or workspace guesses as
fallbacks.

This is local retained-browser and database evidence. Production readback,
rendered second-account denial, and physical-iPhone source access remain open.
