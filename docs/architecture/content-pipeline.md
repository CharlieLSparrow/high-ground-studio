# Content Pipeline

Date: 2026-04-27

This file maps the real content layers in `apps/web/content` and clarifies which ones are authoritative for current live behavior.

## High-Level Rule

For current live/published behavior, treat:
- `apps/web/content/publish`

as the authoritative content directory.

Do **not** treat:
- `apps/web/content/_staging`
- `apps/web/content/_inbox`

as live source-of-truth directories for the currently running site.

## Directory Map

### `apps/web/content/publish`

Purpose:
- current published MDX content set
- the only content directory explicitly wired into the Fumadocs source config

Direct code evidence:
- `apps/web/source.config.ts` sets `dir: "content/publish"`
- `apps/web/src/lib/source.ts` loads the guarded Fumadocs source from that config
- `apps/web/src/app/episodes/[[...slug]]/page.tsx` is the dynamic route that renders pages from that source when enabled

What is in it:
- published MDX files such as:
  - `write-it-down.mdx`
  - `look-for-lessons.mdx`
  - `know-where-you-came-from.mdx`
  - `book/*`
- `meta.json`

How future agents should treat it:
- authoritative for the current Fumadocs-backed published content path
- safe to treat as the live published content layer
- any changes here should be assumed user-facing if the guarded episodes source is enabled

### `apps/web/content/_staging`

Purpose:
- structured staging/work-prep area for future content
- intermediate organization layer between raw manuscript inputs and polished published content

Observed shape:
- `learning-to-lead/episodes/*`
- `research-library/*`
- `worth-the-risk/sections/*`
- multiple `manifest.json` files
- split `main.md`, `research/*`, `extras/*`, `perspectives/*`, and alternates

Direct code evidence:
- no current app code in this pass reads `_staging` directly for route rendering
- no current source config points Fumadocs at `_staging`

How future agents should treat it:
- structured working material
- likely useful for editorial or pipeline tasks
- not authoritative for current live site behavior unless/until code is explicitly changed to consume it

### `apps/web/content/_inbox`

Purpose:
- raw source material, manuscript fragments, research notes, and working author files

Observed shape:
- large “Podcast Year 1” tree
- “Worth The Risk” tree
- Obsidian config files under `.obsidian`
- many draft/research/alternate source files

Direct code evidence:
- no current app code reads `_inbox` for live route rendering
- no current source config points Fumadocs at `_inbox`

How future agents should treat it:
- raw material and editorial intake
- not authoritative for current published behavior
- high risk for confusion if mistaken for live content

## Current Live Behavior Split

There are two separate content-related behaviors in the app today:

### 1. Published MDX route behavior

Path:
- `/episodes/[[...slug]]`

Inputs:
- guarded Fumadocs source
- source config pointing at `content/publish`

Important caveat:
- the route is currently stabilized with a guarded loader in `apps/web/src/lib/source.ts`
- published MDX is therefore the intended route content source, but the loader remains a transitional implementation detail

### 2. Curated discovery/index behavior

Paths:
- `/library`
- home episode surfaces

Inputs:
- `apps/web/src/lib/site.ts`
- `apps/web/src/lib/reading.ts`

Important implication:
- the library and homepage are not dynamically enumerating `content/publish`
- they currently rely on hand-maintained metadata arrays

This means there are effectively two “published” layers to keep aligned:
- live MDX page files in `content/publish`
- curated route metadata in `src/lib/site.ts` and `src/lib/reading.ts`

## What Is Authoritative Right Now

Authoritative for published MDX page source:
- `apps/web/content/publish`

Authoritative for curated episode/reading discovery links:
- `apps/web/src/lib/site.ts`
- `apps/web/src/lib/reading.ts`

Not authoritative for live published behavior:
- `apps/web/content/_staging`
- `apps/web/content/_inbox`

## Risks And Ambiguities

1. `publish` is authoritative for the Fumadocs source config, but `/library` is driven by separate metadata arrays.
   - Risk: an agent may update MDX content without updating curated discovery metadata, or vice versa.

2. `_staging` is structured enough to look “official.”
   - Risk: future agents may mistakenly edit `_staging` expecting live site changes.

3. `_inbox` contains a large amount of raw material and editorial clutter.
   - Risk: future agents may overestimate how much of the raw manuscript tree is currently surfaced by the app.

4. The episodes loader is still guarded.
   - Risk: content changes in `publish` may not behave as expected if an agent forgets the guarded loader state.

## Guidance For Future Agents

When asked to change currently published episode content:
- inspect `content/publish`
- inspect `src/lib/site.ts` and `src/lib/reading.ts`
- verify whether the request affects page content, discovery metadata, or both

When asked to organize or normalize editorial material:
- work in `_staging` or `_inbox` only if the task explicitly concerns the editorial pipeline

When asked “what is the source of truth for live content?”:
- answer `content/publish` for published MDX page source
- answer `src/lib/site.ts` and `src/lib/reading.ts` for the current curated library/home discovery layer
