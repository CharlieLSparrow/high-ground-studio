# Quipsly reusable writing tags result

Date: 2026-07-24

## Outcome

Nest writing now uses the same canonical `StudioTag` vocabulary as tasks,
goals, coaching notes, and sessions. Selecting text exposes an explicit
`Tag passage` control with searchable existing tags and a `Create & apply`
path. A newly created tag is immediately reusable across the current Nest.

This slice does not introduce a writing-only taxonomy or copy tags between
surfaces.

## Persistence and safety contract

- `resolveReusableProjectTag()` owns canonical label normalization, alias and
  merge redirect resolution, archived-tag rejection, and slug-conflict
  rejection.
- Passage creation proves write access and the exact block text range before a
  transaction creates or reuses the tag, creates the `StudioTaggedSpan`, and
  writes a reversible `StudioDocumentOperation`.
- Existing-tag toggles prove project, document, block, and selected-text
  identity. The UI rolls an optimistic change back when persistence rejects or
  fails.
- Add responses return the durable span and operation IDs. Remove responses
  return the operation ID and exact removed span IDs, so client state does not
  retain a synthetic `pending-*` identity.
- Project tags loaded into the writing workbench exclude archived and merged
  records. Built-in presentation metadata is a view concern; `StudioTag`
  remains canonical.
- Writing annotations now flow inline at phone widths and move into the right
  margin only at the extra-large breakpoint.

## Local proof

The following checks passed against the current local checkout:

- Quipsly TypeScript 7 typecheck.
- Focused server-action unit tests.
- Document checkpoint, portable export/restore, passage note, reusable tag,
  exact add/remove receipt, and outsider-access database tests.
- Work-tag create/reuse, replacement, alias, merge, and merge-rollback database
  tests.
- Rendered local Nest dogfood:
  - selected a real passage in the private portable-writing QA document;
  - created and applied `Portable proof thread 2026-07-24`;
  - reloaded and saw the durable passage chip;
  - opened Work, applied the same canonical tag to an existing local QA task,
    and reloaded;
  - read back the same tag ID in `StudioTaggedSpan` and `ActionItemTagLink`,
    together with reversible writing and no-external-side-effects work
    receipts.

These are local-development proofs, not production deployment or TestFlight
proof.

## Toolchain

The slice compiles with the package-pinned TypeScript 7.0.2 compiler. The
repository-wide TypeScript 7 gate remains the required migration check; the
TypeScript 6 package is retained only for embedded programmatic-API consumers
that cannot yet load TypeScript 7's future API.

## Remaining release boundaries

- Complete the rendered portable restore after Chrome file-upload access is
  enabled, then verify the original text, passage note, IDs, and restore
  receipt.
- Re-authenticate Google Cloud and deploy a committed zero-traffic preview
  before any production traffic change.
- Continue the same vocabulary into the iPhone capture and offline-outbox UX,
  then prove it on the physical phone and through TestFlight.
