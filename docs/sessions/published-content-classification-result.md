# Published Content Classification Result

Date: 2026-04-28

What was inspected:
- the six extra published files currently flagged by `scripts/verify-published-discovery.mjs`
- the existing published-discovery docs
- the verification result note
- direct in-tree references showing whether those files still appear intentionally published

What was created:
- `docs/architecture/published-content-classification.md`

Classification outcome:
- `preface.mdx`: duplicate/alternate draft
- `introduction.mdx`: duplicate/alternate draft
- `chapter-zero-in-the-beginning.mdx`: duplicate/alternate draft
- `episode-001.mdx`: duplicate/alternate draft
- `episode-002.mdx`: duplicate/alternate draft
- `episode-003.mdx`: duplicate/alternate draft

Key evidence:
- the three root-level prose pages overlap directly with canonical `book/*` pages
- the three numbered episode pages overlap directly with canonical semantic-slug episode pages and share the same YouTube IDs
- all six files still appear in `apps/web/content/publish/meta.json`
- all six files are still linked from `apps/web/content/publish/index.mdx`

Recommended action for this pass:
- keep all six files in `publish` for now
- do not move them to `_staging` or `_archive` without a separate human decision on whether they should remain reachable as alternate public pages

Interpretation:
- these files are non-canonical for current curated discovery
- they are not yet confirmed dead content
- the lowest-risk classification is “duplicate/alternate draft, leave for human decision”
