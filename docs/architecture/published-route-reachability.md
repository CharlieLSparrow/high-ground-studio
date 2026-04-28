# Published Route Reachability

Date: 2026-04-28

This file audits the six extra published MDX files that are outside the canonical discovery comparison set and documents whether they still appear reachable in the current app.

## Current Route Model

Repo evidence points to the current published MDX route model being:
- `apps/web/source.config.ts` sets `dir: "content/publish"`
- `apps/web/src/lib/source.ts` builds the Fumadocs source with `baseUrl: "/episodes"`
- `apps/web/src/app/episodes/[[...slug]]/page.tsx` is the only app route in this pass that renders that content source

Practical implication:
- when the episodes loader is enabled, a file in `apps/web/content/publish` likely maps to an `/episodes/...` route derived from its relative path
- there is no `apps/web/src/app/docs/...` route in the current app tree

That means current repo evidence supports `/episodes/...` as the active app route shape, while `/docs/...` references inside content appear to be legacy link shapes unless some external routing layer exists outside this repo.

## Reachability Caveat

Route reachability is conditional on the current episodes loader path:
- `apps/web/src/lib/source.ts` only returns the Fumadocs-backed source when `ENABLE_EPISODES_FUMADOCS === "1"`
- otherwise `apps/web/src/app/episodes/[[...slug]]/page.tsx` renders its diagnostic zero-pages state instead of a content page

So the route conclusions below use this language:
- likely reachable as `/episodes/...` when the loader is enabled
- not evidenced as reachable at `/docs/...` in the current repo

## Per-File Audit

| File | Likely current route | Evidence of intentional link exposure | Overlap with newer canonical route | Likely current status | Recommended next action |
| --- | --- | --- | --- | --- | --- |
| `apps/web/content/publish/preface.mdx` | `/episodes/preface` | still listed in `apps/web/content/publish/meta.json`; still linked from `apps/web/content/publish/index.mdx` as `/docs/preface` | overlaps with `/episodes/book/preface` from `apps/web/content/publish/book/preface.mdx` and `apps/web/src/lib/reading.ts` | likely reachable as `/episodes/preface` when loader enabled, but effectively legacy-linked in-tree because the surviving link points at `/docs/preface` | leave for human/editorial decision |
| `apps/web/content/publish/introduction.mdx` | `/episodes/introduction` | still listed in `apps/web/content/publish/meta.json`; still linked from `apps/web/content/publish/index.mdx` as `/docs/introduction`; also referenced by `episode-002.mdx` as `/docs/introduction` | overlaps with `/episodes/book/introduction` from `apps/web/content/publish/book/introduction.mdx` and `apps/web/src/lib/reading.ts` | likely reachable as `/episodes/introduction` when loader enabled, but legacy-linked through `/docs/introduction` in-tree | leave for human/editorial decision |
| `apps/web/content/publish/chapter-zero-in-the-beginning.mdx` | `/episodes/chapter-zero-in-the-beginning` | still listed in `apps/web/content/publish/meta.json`; still linked from `apps/web/content/publish/index.mdx` as `/docs/chapter-zero-in-the-beginning`; also referenced by `episode-003.mdx` as `/docs/chapter-zero-in-the-beginning` | overlaps with `/episodes/book/in-the-beginning` from `apps/web/content/publish/book/in-the-beginning.mdx` and `apps/web/src/lib/reading.ts` | likely reachable as `/episodes/chapter-zero-in-the-beginning` when loader enabled, but legacy-linked through an older `/docs/...` route shape | leave for human/editorial decision |
| `apps/web/content/publish/episode-001.mdx` | `/episodes/episode-001` | still listed in `apps/web/content/publish/meta.json`; still linked from `apps/web/content/publish/index.mdx` as `/docs/episode-001` | overlaps with `/episodes/write-it-down` from `apps/web/content/publish/write-it-down.mdx` and `apps/web/src/lib/site.ts`; both use YouTube ID `96LN__TA-T8` | likely reachable as `/episodes/episode-001` when loader enabled, but the in-tree public link still uses a legacy `/docs/episode-001` shape | convert to redirect later |
| `apps/web/content/publish/episode-002.mdx` | `/episodes/episode-002` | still listed in `apps/web/content/publish/meta.json`; still linked from `apps/web/content/publish/index.mdx` as `/docs/episode-002` | overlaps with `/episodes/look-for-lessons` from `apps/web/content/publish/look-for-lessons.mdx` and `apps/web/src/lib/site.ts`; both use YouTube ID `7Rn4rV2cLy4` | likely reachable as `/episodes/episode-002` when loader enabled, but linked in-tree via the older `/docs/episode-002` path | convert to redirect later |
| `apps/web/content/publish/episode-003.mdx` | `/episodes/episode-003` | still listed in `apps/web/content/publish/meta.json`; still linked from `apps/web/content/publish/index.mdx` as `/docs/episode-003` | overlaps with `/episodes/know-where-you-came-from` from `apps/web/content/publish/know-where-you-came-from.mdx` and `apps/web/src/lib/site.ts`; both use YouTube ID `rf3L1xki_Nk` | likely reachable as `/episodes/episode-003` when loader enabled, but linked in-tree via the older `/docs/episode-003` path | convert to redirect later |

## What Is Actually Exposed Now

From repo evidence, the app intentionally exposes these published surfaces today:
- `/episodes/write-it-down`
- `/episodes/look-for-lessons`
- `/episodes/know-where-you-came-from`
- `/episodes/book/preface`
- `/episodes/book/introduction`
- `/episodes/book/in-the-beginning`

Evidence:
- homepage discovery consumes `apps/web/src/lib/site.ts`
- library discovery consumes `apps/web/src/lib/site.ts` and `apps/web/src/lib/reading.ts`
- those arrays only point at the newer canonical `/episodes/...` routes

What is not evidenced as intentionally exposed from current discovery surfaces:
- `/episodes/preface`
- `/episodes/introduction`
- `/episodes/chapter-zero-in-the-beginning`
- `/episodes/episode-001`
- `/episodes/episode-002`
- `/episodes/episode-003`

These six are still linked inside the published MDX tree itself, but not from the main homepage/library discovery layer.

## `/docs/...` Link Audit

Current in-tree `/docs/...` links still appear in:
- `apps/web/content/publish/index.mdx`
- `apps/web/content/publish/episode-001.mdx`
- `apps/web/content/publish/episode-002.mdx`
- `apps/web/content/publish/episode-003.mdx`

Current repo evidence does not show:
- a `src/app/docs/...` route
- a link-generation layer that rewrites `/docs/...` to `/episodes/...`

So the safest repo-grounded reading is:
- `/docs/...` links are legacy reachable-path assumptions, not current app-route truth proven by the repo

## Decision Guidance

### Root-level prose pages

Files:
- `preface.mdx`
- `introduction.mdx`
- `chapter-zero-in-the-beginning.mdx`

Likely state:
- older alternate reachable pages, if the loader is enabled
- not part of current public discovery
- still intentionally linked in-tree, but only through legacy `/docs/...` references

Recommended next action:
- leave for human/editorial decision

Reason:
- these may represent intentional alternate reading pages, but current repo evidence does not clarify whether they should remain public aliases or be retired

### Numbered episode pages

Files:
- `episode-001.mdx`
- `episode-002.mdx`
- `episode-003.mdx`

Likely state:
- legacy reachable pages that overlap with the newer semantic-slug canonical episode pages
- not part of current homepage/library discovery
- still linked in-tree using old `/docs/...` paths

Recommended next action:
- convert to redirect later

Reason:
- these have clearer one-to-one overlap with newer canonical episode pages than the root-level prose pages do
- redirect/alias decisions should happen in a dedicated route pass, not by silently moving or deleting content

## Operational Guidance For Future Agents

Assume:
- `/episodes/...` is the current route family supported by repo evidence
- the six flagged files are likely still renderable as `/episodes/...` pages when the episodes loader is enabled
- the six flagged files are not part of the curated public discovery layer

Do not assume:
- that `/docs/...` still works in the current app
- that the six files are safe to archive without route/SEO/editorial confirmation
- that in-tree links are current just because they still exist in MDX
