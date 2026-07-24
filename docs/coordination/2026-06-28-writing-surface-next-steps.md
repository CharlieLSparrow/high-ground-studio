# Writing Surface Next Steps - OneNote Floor

## Purpose

Make `/create` trustworthy enough for Charlie, Homer, and collaborators to write the High Ground Odyssey book and episode/article drafts without needing to understand Quipsly internals.

## Current validated floor

See `docs/coordination/2026-06-28-writing-surface-checkpoint.md`.

## Next build steps

### 1. Page list clarity

Status: implemented in code; needs visual/runtime review.

Goal: a user can scan the sidebar and know what each page is and when it was last touched.

Build:

- Show updated/last touched date where available. Done.
- Keep page kind badges visible but subtle. Done.
- Avoid crowding the rail. Needs visual review with real document counts.

Proof:

- Writing, Notes, and Sources shelves remain readable with several documents.
- Typecheck passes.

### 2. Section/page model decision

Goal: decide whether sections are metadata on documents or generated from structure blocks inside documents.

Current state:

- Chapter/Episode structure is generated from tagged blocks.
- That is useful for long manuscripts but not enough for notebook page organization.

Recommendation:

- Keep Chapter/Episode block tags for manuscript/episode structure.
- Add explicit notebook sections later for page organization.
- Do not overload Chapter/Episode tags to behave like OneNote sections.

Proof:

- Users can create pages without understanding structure tags.
- Users can still mark manuscript headings as Chapter/Episode.

### 3. Safe duplicate / branch draft

Status: implemented in code and typechecked; needs runtime review.

Goal: let users experiment without fear.

Build:

- Duplicate current page as Draft. Done.
- Preserve sourceLabel lineage. Done via `branched-from-document` and `branched-from-label` source labels.
- Add clear copy: duplicate creates a new editable page, not a publication event. Done in notebook rail.

Proof:

- Fixed source documents duplicate into Draft, not another fixed source unless explicitly chosen.
- Original document remains unchanged.
- Typecheck passed with `./node_modules/.bin/tsc -p apps/quipsly/tsconfig.json --noEmit`.

### 4. Move/promote note to writing page

Status: implemented in code and typechecked; needs runtime review.

Goal: quick captures should not become dead ends.

Build:

- From a Note, offer “Promote to writing page”. Done.
- Preserve original note or mark relation; do not delete by default. Done via `promoted-from-document` and `promoted-from-label` metadata.

Proof:

- Note remains recoverable.
- New writing page opens after promotion.
- Typecheck passed with `./node_modules/.bin/tsc -p apps/quipsly/tsconfig.json --noEmit`.

### 5. Recovery and export trust

Status: implemented in code; needs typecheck and runtime review.

Goal: writers always have an obvious escape hatch.

Build:

- Keep Markdown recovery/export visible. Done as a calmer `Copy/export page` or `Copy/export section` action.
- Add page-only export option later. Current Panic Export now exports the current notebook page/document, or the focused Chapter/Episode section when a section is active.
- Explain whether export is full document, current section, or current page. Done in Markdown export metadata.

Proof:

- A user can get local Markdown out without understanding app state.

## Guardrails

- Do not create another canonical writing surface.
- Do not make source documents silently editable rewrites.
- Do not make publishing packets look like manuscript truth.
- Do not require tags before writing.
- Do not add more assistant UI until the notebook surface feels calm.
