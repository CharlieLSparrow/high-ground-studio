# Canonical Tag Merge — 2026-07-23

## Shipped locally

- Work previews the exact impact of a tag merge before it can be applied.
- The preview counts tasks, goals, Sessions, coaching notes, source
  annotations, anchored spans, knowledge nodes, and media clips.
- Already-shared relationships are deduplicated without deleting either
  underlying record.
- Same-range anchored-span conflicts block the merge instead of guessing.
- Applying a merge requires an explicit human confirmation tied to the
  previewed source, target, and impact hash.
- The merge runs in a serializable transaction and rechecks both access and
  impact before writing.
- The source tag remains as an inactive redirect to the canonical target.
- Former labels and aliases resolve to the canonical tag for Capture/API quick
  entry and Search All.
- `StudioTagMergeReceipt` retains the exact pre-merge associations needed for
  inspected rollback tooling.

No merge sends a message, creates provider or calendar state, edits immutable
source evidence, publishes, or calls an external service.

## Operated proof

The signed-in QA account used local Nest at `http://127.0.0.1:3012`, local
PostgreSQL, and the Firebase Auth emulator. Two reusable QA tags were created
from the rendered tag editor and applied to the existing Capture-authored task:

- task id: `mobile-task-6538486a-f8a9-4462-8753-64b01515dd81`
- source tag: `cmrxf9hdg0000awxll3ezge7p`
- source label: `Merge proof source 20260723T112218Z`
- target tag: `cmrxfa3t70001awxl1y3ol92n`
- target label: `Merge proof canonical 20260723T112218Z`
- merge receipt: `2b1dd20d-b163-444c-a935-ee78d0452714`
- impact hash:
  `cc304b848395ff6c8434bf0fea389b3034e5f30b934ec6b5425b3c81a7332dea`

The rendered preview reported one task use and one duplicate relationship.
The Apply control remained gated behind the exact-impact confirmation.

After applying:

1. the task displayed only the canonical target tag;
2. the source tag displayed a redirect instead of a restore action;
3. Search All returned the canonical target when queried with the source
   label and showed that label under Former names;
4. PostgreSQL readback found zero source task links, one target task link,
   one redirect, and one merge receipt.

## Verification

- Prisma migration `20260723143000_add_tag_merge_redirects` is applied; all 19
  local migrations are current.
- Quipsly TypeScript typecheck passed.
- 41 focused Work, action, lifecycle, and Search tests passed.
- 7 local-database lifecycle and full-relational merge tests passed.
- The production Next.js build completed across 150 routes.
- `git diff --check` passed for the isolated slice.
- The merge UX uses native `details`/`summary`, labeled select and checkbox
  controls, an explicit action button, and a status region so the destructive
  scope remains keyboard- and assistive-technology legible.

The production build still emits the existing broad file-tracing warning from
`next.config.mjs`; it does not fail the build and is separate from this slice.

## Git boundary

Only the schema, additive migration, merge service and integration test, Work
actions/model/page/client tests and UI, canonical resolver behavior, and this
checkpoint belong in the merge commit. The many unrelated Studio, media,
deployment, and legacy-web changes in the working tree remain unstaged.

## Intentionally remaining

- Build explicit, permissioned receipt inspection and rollback tooling before
  offering rollback in the product UI.
- Add imported-keyword provenance and reviewed promotion into canonical Nest
  vocabulary.
- Repeat physical-iPhone and TestFlight-installed old-label quick-entry proof
  after production billing and device visibility gates clear.
