# Create editor page switcher checkpoint - 2026-06-28

## Why this pass happened

The writing lane needs to meet the OneNote floor: notebook, section, page, and fast switching. The previous pass gave `/create` breadcrumb context, but once a writer opened a page, nearby pages were still not visible enough.

## What changed

- Added a `Notebook pages` switcher inside the `/create` editor header.
- The switcher shows up to 10 recent pages from the current Nest.
- The active page is highlighted.
- Each page card links directly to `/create?project=<projectSlug>&document=<documentId>`.
- A `Table of contents` link returns to `/notebooks/[projectSlug]`.

## Product rule reinforced

Navigation is not decoration in a writing tool. Navigation is the user's memory prosthetic.

If Charlie or Homer cannot tell where they are, what page they are editing, and how to jump to another nearby page, Quipsly is failing the OneNote floor no matter how clever the tags or AI assistant are.

## Validation

```bash
./node_modules/.bin/tsc -p apps/quipsly/tsconfig.json --noEmit
```

Result: passed.

## Next best hardening

1. Add a true left-side notebook page list when the editor enters writing-first mode.
2. Add custom lightweight sections with drag/move later, but do not schema-migrate until the UX proves it.
3. Add quick capture from anywhere into the current/Home Nest.
4. Keep tags secondary until navigation is boringly reliable.

