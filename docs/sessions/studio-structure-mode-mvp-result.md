# Studio Structure Mode MVP Result

Date: 2026-05-19

## Summary

This pass turned the disabled Structures lane into a first private Structure
Mode route:

```text
/structure
```

The route uses the same Studio access boundary as the Tagging Desk and Writing
Desk. Signed-out visitors see the Studio sign-in shell, and signed-in users
without an approved Studio role see the restricted-access shell.

## What The MVP Does Now

Structure Mode now supports the paste-and-highlight workflow:

- paste source text into a textarea
- name the pasted source
- choose a source type
- select a meaningful span with native textarea selection
- create a highlight card from the selected text
- assign a semantic type or tag-like category
- add an optional note
- place the card into a structure lane
- move cards between lanes
- move cards up and down inside a lane
- export and import the browser draft as JSON

Default lanes:

- Opening
- Story
- Principle
- Evidence
- Application
- Closing
- Parking Lot

This is intentionally a fast human meaning-capture tool. It is not an importer.

## What Local Storage Persists

The MVP stores one browser-local draft under:

```text
high-ground-studio.structure-mode.v1
```

That draft includes:

- source title
- source type
- pasted source text
- highlight card IDs
- selected text snapshots
- start and end offsets
- semantic types
- optional notes
- source title and type snapshots per card
- created timestamps
- lane assignments
- card order

The UI states plainly that this is an MVP browser draft, saved locally in this
browser, and not yet synced to the Studio database.

## What Is Not Database Backed

Structure Mode does not yet write Prisma rows. It does not create durable
source documents, span records, lane records, ordered placements, public
projections, or provenance chains.

That is deliberate. The goal of this pass was to validate the core
paste-highlight-arrange loop without schema churn or remote database risk.

## Canonical File Safety

This pass did not import manuscripts or write canonical manuscript files.

These surfaces were intentionally untouched:

- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
- `apps/web/content/publish`
- `apps/web/content/_staging`
- `apps/web/content/_inbox`

Structure Mode writes only to browser `localStorage`.

## Validation

Completed validation for this pass:

```bash
pnpm --filter @high-ground/studio-domain typecheck
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```

The first sandboxed `pnpm --filter studio build` attempt hit the known
Turbopack/PostCSS process and local-port restriction. The same command passed
when rerun outside the sandbox.

## Docker And Database Status

Docker daemon status was checked during preflight. The Docker client is
installed, but the daemon was not reachable from this session.

No `db:push` was run. No local or remote database mutation was performed.

## Next Recommended Slice

The next strongest slice is database-backed Structure Mode persistence:

- durable structure container
- durable pasted source or source reference
- highlight/span rows with offsets and selected text snapshots
- structure lane records
- ordered card placements
- export/import compatibility with the browser-local MVP shape

That should come before importer work. The MVP should first prove that the
manual paste, highlight, and lane workflow is the right working surface.
