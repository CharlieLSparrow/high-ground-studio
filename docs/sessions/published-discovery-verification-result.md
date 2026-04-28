# Published Discovery Verification Result

Date: 2026-04-28

What was verified:
- `apps/web/content/publish` contains the current published MDX page source
- `apps/web/src/lib/site.ts` contains curated episode discovery metadata
- `apps/web/src/lib/reading.ts` contains curated reading discovery metadata
- homepage and library discovery surfaces consume those metadata arrays directly

What was created:
- `scripts/verify-published-discovery.mjs`

What was updated:
- `docs/runbooks/local-dev.md`

What the script checks:
- published canonical episode page routes from `content/publish`
- published canonical reading page routes from `content/publish/book`
- discovery hrefs from `src/lib/site.ts`
- discovery hrefs from `src/lib/reading.ts`
- pairingId alignment for matched entries

Current script result:
- no likely canonical published/discovery mismatches found
- additional published files were reported as informational:
  - `chapter-zero-in-the-beginning.mdx`
  - `episode-001.mdx`
  - `episode-002.mdx`
  - `episode-003.mdx`
  - `introduction.mdx`
  - `preface.mdx`

Interpretation:
- the current canonical discovery layer is aligned with the current canonical published episode and book-section pages
- the publish directory still contains extra historical or alternate published files that are outside the current discovery comparison set
