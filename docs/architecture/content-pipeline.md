# Content Pipeline

Date: 2026-04-28

This file maps the real content layers in `apps/web/content` and clarifies which ones are authoritative for:

- the current website behavior
- the new canonical episode working model

## High-Level Rule

For current live/published website behavior, treat:

- `apps/web/content/publish`

as the authoritative route-facing MDX directory.

For canonical episode authoring going forward, treat:

- `apps/web/content/episodes`

as the authoritative episode packet directory.

Do **not** treat:

- `apps/web/content/_staging`
- `apps/web/content/_inbox`

as canonical live route sources.

## Directory Map

### `apps/web/content/episodes`

Purpose:

- canonical episode working layer
- one obvious packet file per episode
- the engine-facing content source for future editorial and AI work

Observed shape:

- validated creative packets:
  - `learning-to-lead/pilot/packet.mdx`
  - `learning-to-lead/its-a-metaphor/packet.mdx`
  - `learning-to-lead/chub-and-jack/packet.mdx`
- preserved first-pass bridge packets:
  - `learning-to-lead/write-it-down/packet.mdx`
  - `learning-to-lead/look-for-lessons/packet.mdx`
  - `learning-to-lead/know-where-you-came-from/packet.mdx`
- `_templates/episode-packet.mdx`

Direct code evidence:

- no current app route reads `content/episodes` directly in this pass
- this is an editorial architecture layer, not yet the website route source

How future agents should treat it:

- canonical for episode packet authoring
- the first place to edit when the task is about episode content itself
- safe to treat as the long-term episode source of truth even though the current website still reads `publish`
- for the first three episodes, prefer the validated creative packets that follow the upstream editorial slugs
- do not mistake the preserved first-pass bridge packets for the final creative canonical paths

### `apps/web/content/publish`

Purpose:

- current published MDX content set for the live website route layer
- the content directory explicitly wired into the Fumadocs source config

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
- legacy or alternate public files such as:
  - `episode-001.mdx`
  - `episode-002.mdx`
  - `episode-003.mdx`
- `meta.json`

How future agents should treat it:

- authoritative for the current website-facing MDX route layer
- not the preferred long-term creative source for episode authoring anymore
- changes here should be assumed user-facing if the guarded episodes source is enabled

### `apps/web/content/_staging`

Purpose:

- structured staging/work-prep area for future content
- intermediate organization layer between raw manuscript inputs and canonical packets or polished public derivatives

Observed shape:

- `learning-to-lead/episodes/*`
- `research-library/*`
- `worth-the-risk/sections/*`
- `manifest.json` files
- split `scott_main.md`, `charlie.md`, `research/*`, and `extras/*`

Direct code evidence:

- no current app code in this pass reads `_staging` directly for route rendering
- no current source config points Fumadocs at `_staging`

How future agents should treat it:

- upstream structured working material
- useful as migration input when building or updating canonical episode packets
- not authoritative for the live site and not the final canonical destination

### `apps/web/content/_inbox`

Purpose:

- raw source material, manuscript fragments, research notes, and working author files

Observed shape:

- large `Podcast Year 1` tree
- `Worth The Risk` tree
- Obsidian config files under `.obsidian`
- many draft, research, alternate, and chapter-level source files

Direct code evidence:

- no current app code reads `_inbox` for live route rendering
- no current source config points Fumadocs at `_inbox`

How future agents should treat it:

- raw material and editorial intake
- not authoritative for current live route behavior
- not authoritative for final episode packet canonicality either
- valuable when a packet needs to be seeded or repaired from older source text

### `apps/web/content/_templates`

Purpose:

- checked-in templates for route-facing content shapes that are not themselves canonical live content

Direct code evidence:

- no current app code reads `_templates` for route rendering
- no current source config points Fumadocs at `_templates`

How future agents should treat it:

- scaffolding only
- currently useful for the public derivative page shape via `episode-template.mdx`
- not authoritative for live route behavior or canonical episode packet truth

## Current Split To Keep Straight

There are now three different roles that matter:

### 1. Canonical episode authoring

Path:

- `apps/web/content/episodes`

This is the new engine-first episode packet layer.

### 2. Current published MDX route behavior

Path:

- `apps/web/content/publish`

This is the current website route layer for `/episodes/*`.

### 3. Curated discovery/index behavior

Paths:

- `apps/web/src/lib/site.ts`
- `apps/web/src/lib/reading.ts`

This is the curated discovery metadata layer.

## What Is Authoritative Right Now

Authoritative for canonical episode packet authoring:

- `apps/web/content/episodes`

Authoritative for current website-facing MDX episode pages:

- `apps/web/content/publish`

Authoritative for curated episode and reading discovery links:

- `apps/web/src/lib/site.ts`
- `apps/web/src/lib/reading.ts`

Not authoritative for either live route behavior or canonical episode packets:

- `apps/web/content/_staging`
- `apps/web/content/_inbox`

## Risks And Ambiguities

1. `publish` still drives the website route while `episodes` is now the canonical episode packet layer.
   - Risk: an agent may update one and forget the other.

2. `_staging` is structured enough to look official.
   - Risk: future agents may mistake it for the canonical destination instead of the upstream working source.

3. `_inbox` contains a large amount of valuable but messy material.
   - Risk: future agents may confuse raw history with current canonicality.

4. Discovery still lives separately in `site.ts` and `reading.ts`.
   - Risk: even if `episodes` and `publish` are aligned, discovery metadata can still drift.

## Guidance For Future Agents

When asked to improve episode content itself:

1. inspect `apps/web/content/episodes`
2. inspect the matching `apps/web/content/publish` derivative if the public page matters
3. inspect `apps/web/src/lib/site.ts` and `apps/web/src/lib/reading.ts` if discovery copy or links matter

When asked to seed or repair an episode packet:

1. inspect the canonical packet first
2. inspect `_staging` for structured upstream material
3. inspect `_inbox` when the staging layer is incomplete or a richer older draft exists

When asked what the episode source of truth is, answer precisely:

- canonical episode packet truth: `apps/web/content/episodes`
- current website-facing episode route truth: `apps/web/content/publish`
- current curated discovery truth: `apps/web/src/lib/site.ts` and `apps/web/src/lib/reading.ts`
