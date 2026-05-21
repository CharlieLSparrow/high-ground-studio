# Studio To HGO Projection Bridge

Date: 2026-05-21

## Position

Studio is the private source and tagging cockpit. HGO is the projection renderer
and staged review surface.

The first bridge is deliberately browser-only:

- Studio generates an HGO episode projection draft JSON export.
- HGO imports pasted projection JSON in a client-side preview route.
- No server write, database table, publish API, deployment pipeline, or content
  file write is involved.

The final output is not the source. It is a projection of tagged source
material.

## First Bridge

Studio emits projection JSON, not raw manuscript draft JSON.

The export may include:

- projection lifecycle and visibility
- title, slug, summary, and staged-review page copy
- structure-derived beats
- author-summary voice cards
- cited quotations with citation state
- source-note summaries
- browser-safe generation metadata

The export must not include:

- full TipTap / ProseMirror draft JSON
- private manuscript notes
- server snapshot metadata
- raw browser-local state
- canonical manuscript or content paths

Because there is no explicit public-safe flag on arbitrary manuscript text yet,
the current helper excludes private/editor notes by default and only includes
synthetic-safe source file names. Shared package extraction is deferred until
the contract has survived real operator use.

## Safety Review

The current Studio helper intentionally does not export raw `editorJson`,
`quoteReviews`, `structureRegions`, inline marks, server snapshot metadata,
browser-local draft state, private editor notes, or canonical content paths.

It can include these projection-facing fields:

- Cited quotation text: included as pull quote text because the HGO renderer
  needs visible quote cards. This means real-manuscript exports are not
  public-safe until citation and public-safety review is complete.
- Source titles and citation text: included only in source-note summaries for
  review context. These can reveal real source/citation work and should remain
  private/staged until reviewed.
- Structure titles: included in page titles, beats, and related chapter
  summaries because they are the current projection outline. Real structure
  titles may reveal editorial intent.
- Source file name: included only when the filename is synthetic. Non-synthetic
  source filenames are omitted.
- Backstage notes: included as static bridge/citation/source-safety notes only;
  private Studio notes are not copied.
- Author summaries: included as span/word counts for Charlie and Homer lenses,
  not as raw author-marked text.
- Block counts: included to describe projection scale without exposing block
  text or block IDs.
- Target Episode region ID: omitted from the exported projection source metadata
  to avoid leaking internal Studio structure IDs.

Treat generated JSON as a projection draft or staged review draft. Do not use
with real manuscript material until citation/public-safety review is complete,
and do not paste real projection drafts into public places.

## HGO Import Preview

HGO receives the pasted projection JSON and validates it before rendering with
the existing projection renderer.

The same renderer should support:

- `synthetic`
- `staged`
- `live`
- `archived`

The import route is for development and staged review only. It does not persist
the JSON, write local storage, publish a page, or mutate server state.

## Citation Gates

These citation states must block live publishing later:

- `needs-source`
- `needs-review`
- `do-not-use`

The current browser-only import route shows warnings for Studio browser bridge
origin, staged status/visibility, pull quote presence, unresolved citation
states, `live` status, and `public` visibility. It does not promote or publish.

## Manual Approval Gates

The intended future human gates are:

1. Generate projection in Studio.
2. Preview staged page in HGO.
3. Review quote and citation status.
4. Promote to live later through a separate approved workflow.

## Deferred

Not built in this bridge pass:

- DB projection table
- live publish API
- public deployment pipeline
- QuipLore integration
- Quote Engine integration
- Yjs or collaboration
- autosave
- canonical manuscript/content writes
