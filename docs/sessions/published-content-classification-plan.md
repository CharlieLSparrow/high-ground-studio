# Published Content Classification Plan

Date: 2026-04-28

Scope:
- inspect only the currently flagged extra published files in `apps/web/content/publish`
- compare them against the current published-discovery docs and verification notes
- classify each file without moving, deleting, or editing content

Files under review:
- `chapter-zero-in-the-beginning.mdx`
- `episode-001.mdx`
- `episode-002.mdx`
- `episode-003.mdx`
- `introduction.mdx`
- `preface.mdx`

Checks:
- determine whether each file overlaps with a current canonical episode or book page
- determine whether each file still appears referenced from the published content tree itself
- classify each file as legacy artifact, future content, intentionally non-discoverable published page, duplicate/alternate draft, or unknown
- recommend a low-risk next action for each file

Constraints:
- no runtime behavior changes
- no content moves
- no Stripe or unrelated cleanup
