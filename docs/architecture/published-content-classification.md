# Published Content Classification

Date: 2026-04-28

This file classifies the extra published files currently reported by `scripts/verify-published-discovery.mjs` as being outside the canonical discovery comparison set.

Current context:
- canonical published episode discovery is driven by `apps/web/src/lib/site.ts`
- canonical published reading discovery is driven by `apps/web/src/lib/reading.ts`
- canonical published MDX source is `apps/web/content/publish`
- the flagged files are still inside the live published content tree, so they should not be treated as safe-to-remove by default

## High-Level Conclusion

The six flagged files split into two groups:

1. Root-level prose pages that substantially overlap with canonical `book/*` pages
- `preface.mdx`
- `introduction.mdx`
- `chapter-zero-in-the-beginning.mdx`

2. Older episode-form pages that substantially overlap with canonical episode pages
- `episode-001.mdx`
- `episode-002.mdx`
- `episode-003.mdx`

None of these should be auto-moved in a mechanical cleanup pass yet, because the published content tree still references them in:
- `apps/web/content/publish/meta.json`
- `apps/web/content/publish/index.mdx`

## Classification Table

| File | Likely Role | Evidence | Recommended Action |
| --- | --- | --- | --- |
| `apps/web/content/publish/preface.mdx` | Duplicate/alternate draft | It overlaps directly with `apps/web/content/publish/book/preface.mdx`. The root file is a fuller prose draft without the newer structured frontmatter used by the canonical book section. It is also listed in `publish/meta.json` and linked from `publish/index.mdx`. | Leave for human decision |
| `apps/web/content/publish/introduction.mdx` | Duplicate/alternate draft | It overlaps directly with `apps/web/content/publish/book/introduction.mdx`. The root file appears to be an earlier or alternate chapter page, while the `book/` version carries the canonical `contentType: "book-section"` metadata and current paired-reading structure. It is also listed in `publish/meta.json` and linked from `publish/index.mdx`. | Leave for human decision |
| `apps/web/content/publish/chapter-zero-in-the-beginning.mdx` | Duplicate/alternate draft | It overlaps directly with `apps/web/content/publish/book/in-the-beginning.mdx`. The title and body track the same chapter/topic, but the root file uses the older “Chapter Zero” naming while the canonical book page uses `book/in-the-beginning.mdx` with current structured metadata. It is listed in `publish/meta.json` and linked from `publish/index.mdx`. | Leave for human decision |
| `apps/web/content/publish/episode-001.mdx` | Duplicate/alternate draft | It overlaps directly with the canonical discovery episode `apps/web/content/publish/write-it-down.mdx`. Both use the same YouTube ID `96LN__TA-T8`, and the newer canonical episode file includes `aliases` covering “Preface Pilot Episode.” The older file also links to an older `/docs/preface` route shape. | Leave for human decision |
| `apps/web/content/publish/episode-002.mdx` | Duplicate/alternate draft | It overlaps directly with `apps/web/content/publish/look-for-lessons.mdx`. Both use the same YouTube ID `7Rn4rV2cLy4`, and the canonical episode file carries the current `contentType: "episode"` metadata and paired-reading structure. The older file points at `/docs/introduction`, which suggests an earlier route model. | Leave for human decision |
| `apps/web/content/publish/episode-003.mdx` | Duplicate/alternate draft | It overlaps directly with `apps/web/content/publish/know-where-you-came-from.mdx`. Both use the same YouTube ID `rf3L1xki_Nk`, and the canonical episode file carries the current structured metadata while the older file links to `/docs/chapter-zero-in-the-beginning`, another older route shape. | Leave for human decision |

## Why These Are Not Safe To Move Yet

Even though discovery does not currently use these six files, there is still in-tree evidence that they remain part of the published MDX corpus:
- `apps/web/content/publish/meta.json` explicitly includes all six
- `apps/web/content/publish/index.mdx` links to all six

That means they are not just invisible leftovers on disk. They still look like intentionally reachable content inside the published doc set, even if they are no longer part of the curated homepage/library discovery model.

## Recommended Interpretation By Group

### `preface.mdx`, `introduction.mdx`, `chapter-zero-in-the-beginning.mdx`

Likely classification:
- duplicate/alternate draft

Why:
- each has a direct `book/*` counterpart covering the same conceptual chapter
- the `book/*` files use the newer structured frontmatter and paired-reading metadata
- the root-level versions look like an earlier published layout, not future unpublished work

Low-risk recommendation:
- leave for human decision until someone explicitly decides whether the older root-level chapter pages are still meant to be public aliases, historical artifacts, or candidates for archive

### `episode-001.mdx`, `episode-002.mdx`, `episode-003.mdx`

Likely classification:
- duplicate/alternate draft

Why:
- each matches a canonical current episode by YouTube ID and topic
- the newer canonical episode files use semantic slugs:
  - `write-it-down`
  - `look-for-lessons`
  - `know-where-you-came-from`
- the numbered files point to older `/docs/...` companion links and do not carry the current structured episode frontmatter

Low-risk recommendation:
- leave for human decision until someone decides whether numbered episode pages should remain as alternate public aliases or move out of the published tree

## What Future Agents Should Assume

Assume:
- the six flagged files are non-canonical for current curated discovery
- the newer canonical comparison set is the correct one for verification tooling

Do not assume:
- that these six files are safe to delete
- that they are safe to move to `_staging` or `_archive` without checking route expectations and editorial intent

## Lowest-Risk Next Step

The next safe step is not a file move. It is a narrow decision pass that answers:
- should these six files remain reachable as alternate public pages
- should they become explicit aliases/redirects
- or should they be archived after route-level confirmation

Until that decision exists, the correct operational stance is:
- keep them in `publish`
- treat them as duplicate/alternate published content
- keep them outside the canonical discovery verification set
