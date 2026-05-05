# Living Manuscript System

Date: 2026-05-05

This document defines the first preserved folder and file layout for the `Learning to Lead` living manuscript system.

## Why this exists

The manuscript is the asset.
Outputs are derivatives.

The repo already has several real content layers:

- `apps/web/content/publish` for current route-facing public MDX
- `apps/web/content/episodes/.../packet.mdx` for canonical episode packets
- `apps/web/content/_staging` and `apps/web/content/_inbox` for upstream working material

What is missing is a preserved, whole-manuscript layer for the book itself.

This system fills that gap without disturbing the current public site or packet workflow.

## Core model

The intended long-term stack is:

1. original source and provenance files are preserved
2. a baseline conversion is preserved
3. one living MDX manuscript becomes the canonical creative manuscript source
4. arrangement maps select block IDs for outputs
5. generated outputs are derived from the manuscript plus arrangements

Short version:

- the manuscript stays whole
- outputs get sliced

## Why one living MDX manuscript instead of many chapter files

A single living manuscript is the right first structure because it preserves narrative continuity and avoids premature fragmentation.

Reasons:

- the original source arrives as one whole manuscript
- future derivatives will cut across chapter boundaries, especially for podcast episodes and public pages
- a single manuscript makes provenance and editorial evolution easier to track early
- splitting into many chapter files too soon would freeze assumptions before the real block model has been tested
- database rows or story cards would introduce management overhead before the manuscript-block language is stable

This does not forbid later evolution.
It only avoids paying that complexity cost before the workflow has earned it.

## Content layers and their roles

### 1. Source files

Path:

- `apps/web/content/books/learning-to-lead/sources/`

Role:

- preserved provenance inputs
- original DOCX
- baseline Markdown conversion
- extracted comments or inventories later

Rule:

These files are source evidence, not the living co-written manuscript and not route-facing content.

### 2. Living manuscript

Path:

- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`

Role:

- future canonical creative manuscript source once populated
- one MDX manuscript containing tagged blocks

Rule:

This file is the future whole-manuscript source of truth for book-shaped creative work.
It is not populated in this setup pass.

### 3. Arrangement maps

Path:

- `apps/web/content/books/learning-to-lead/arrangements/*.yml`

Role:

- playlists of block IDs
- define which blocks appear in book chapters, podcast episodes, public pages, and later other outputs

Rule:

Arrangements do not contain the source text.
They select from block IDs that live in the manuscript.

### 4. Generated outputs

Path:

- `apps/web/content/books/learning-to-lead/generated/`

Role:

- derivative content artifacts generated from manuscript blocks and arrangements

Rule:

Generated files are derivative, not source of truth.
Do not hand-edit them unless explicitly asked and the workflow is clear.

### 5. Current public publish layer

Path:

- `apps/web/content/publish`

Role:

- current route-facing MDX for the website

Rule:

`apps/web/content/publish` remains the current route-facing layer.
This living manuscript setup does not replace or modify it.

### 6. Current episode packet layer

Path:

- `apps/web/content/episodes/.../packet.mdx`

Role:

- canonical packet layer for episode prep and episode-first editorial work

Rule:

Episode packets remain valid and intact.
The living manuscript system is a new whole-book source layer that can eventually feed packet generation or packet seeding workflows.

## Block model

The living manuscript is expected to contain tagged blocks with stable IDs.

Illustrative shape:

```mdx
<ManuscriptBlock
  id="preface-write-it-down"
  type="story"
  voice="homer"
  status="baseline"
  chapter="preface"
  tags={["legacy", "writing", "story"]}
  source="Leadership My Story 24MAR19.docx"
  pairsWith={["charlie-preface-reflection"]}
  notes="Baseline block seeded from preserved source."
>
This is where the source text will go later.
</ManuscriptBlock>
```

Important rule:

- block IDs must remain stable once arrangements point at them

Suggested metadata fields:

- `id`
- `type`
- `voice`
- `status`
- `chapter`
- `tags`
- `source`
- `pairsWith`
- `notes`

## Arrangement model

Arrangement files are playlists of block IDs.

Example concept:

```yml
episodes:
  write-it-down:
    title: "Write It Down"
    status: "published"
    blocks:
      - preface-origin-of-book
      - preface-write-it-down
      - charlie-preface-reflection
```

This keeps the selection logic separate from the source text.

## Relationship to existing public and packet content

Current truth:

- public `/episodes/*` pages still read from `apps/web/content/publish`
- episode prep and packet workflows still center on `apps/web/content/episodes/.../packet.mdx`

Future direction:

- the living manuscript can later seed or regenerate packet-friendly slices
- arrangement maps can later define which whole-manuscript blocks belong in podcast episodes, book chapters, or public pages
- generated packet inputs or generated public drafts can be derived later without making the raw source ambiguous

## Why not a database yet

A database-backed story-card system may become useful later, but it is premature now.

Reasons not to do it yet:

- the manuscript block vocabulary is not stable enough yet
- the ingestion pipeline from DOCX has not been proven yet
- editorial trust is easier to build in readable files first
- file-based provenance is clearer during early migration

## How this could evolve later

Possible later evolution, only if needed:

1. preserve the original DOCX in `sources/`
2. add a baseline Markdown conversion in `sources/`
3. seed coarse manuscript blocks into `learning-to-lead.living.mdx`
4. generate arrangement-driven draft outputs
5. add a database-backed index only if search, editorial metadata, or reuse pressure justifies it

A later database should index or augment the manuscript system, not replace the source-of-truth files by surprise.

## Setup status for this pass

Created in this pass:

- folder structure under `apps/web/content/books/learning-to-lead/`
- starter `README.md` files
- starter living manuscript shell
- starter arrangement maps
- starter template files

Intentionally not done in this pass:

- DOCX conversion
- comment extraction
- block seeding
- generation logic
- packet migration
- public route changes
