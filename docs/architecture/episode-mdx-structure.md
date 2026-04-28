# Published Episode MDX Structure

Date: 2026-04-28

This file documents the current structure of the website-facing episode MDX pages under `apps/web/content/publish`.

It is **not** the canonical long-term episode authoring model anymore.

For the canonical episode packet architecture, use:

- `docs/architecture/episode-content-system.md`
- `apps/web/content/episodes/<project>/<slug>/packet.mdx`

## What This Document Covers

This document now covers the current public derivative layer:

- `apps/web/content/publish/write-it-down.mdx`
- `apps/web/content/publish/look-for-lessons.mdx`
- `apps/web/content/publish/know-where-you-came-from.mdx`

Those files still matter because the current `/episodes/*` route is pointed at `content/publish` when the guarded Fumadocs source is enabled.

## Current Published Page Pattern

The current website-facing episode pages follow a narrower shape than the canonical packet files:

1. frontmatter
2. short framing paragraph
3. `## Scott's Book Excerpt`
4. `## Charlie's Section`
5. hidden editorial comment scaffold

That structure is still useful for the public derivative layer, but it is too constrained to act as the main long-term creative working file.

## Relationship To The Canonical Packet

Current rule:

- `apps/web/content/episodes/<project>/<slug>/packet.mdx` is the canonical creative source
- `apps/web/content/publish/<slug>.mdx` is the current website-facing derivative

This split is intentional.

The packet holds the fuller working surface.
The `publish` file holds the current public route copy.

## Current Supporting Template

The existing public-page template remains at:

- `apps/web/content/_templates/episode-template.mdx`

Use that template only when editing or normalizing the current public derivative layer.

For new canonical packet work, use:

- `apps/web/content/episodes/_templates/episode-packet.mdx`
