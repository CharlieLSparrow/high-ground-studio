# Learning to Lead Living Manuscript

This directory is the preservation-first workspace for the `Learning to Lead` book manuscript.

## Purpose

This layer keeps the manuscript whole and lets downstream outputs slice from it later.

The intended flow is:

1. preserve original source files
2. preserve baseline conversions
3. maintain one canonical living MDX manuscript
4. define output arrangements as playlists of block IDs
5. generate public or product-facing derivatives later

## Current rules

- Do not treat this directory as route-facing website content.
- Do not hand-edit anything in `generated/` unless explicitly asked.
- Do not move or delete the current public MDX layer in `apps/web/content/publish` from this workspace.
- Do not assume the root DOCX has been ingested yet. In this pass it remains preserved at the repo root.

## Directory map

- `sources/`: source and provenance files such as the original DOCX, baseline Markdown, extracted comments, and inventories
- `manuscript/`: the future canonical living MDX manuscript
- `arrangements/`: YAML maps that describe which block IDs belong in which outputs
- `generated/`: derivative outputs or notes about generated outputs
- `templates/`: starter examples for manuscript blocks and arrangement maps

## Source of truth rule

Today, the live public website still reads route-facing MDX from:

- `apps/web/content/publish`

The future creative manuscript source for the book will live here:

- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`

That living manuscript is not populated yet in this pass.
