# Published Route Reachability Plan

Date: 2026-04-28

Scope:
- inspect only the six flagged published files
- inspect the in-tree files that define the current published route path and link references
- document likely reachability without changing content or routing behavior

Files to inspect:
- `apps/web/content/publish/chapter-zero-in-the-beginning.mdx`
- `apps/web/content/publish/episode-001.mdx`
- `apps/web/content/publish/episode-002.mdx`
- `apps/web/content/publish/episode-003.mdx`
- `apps/web/content/publish/introduction.mdx`
- `apps/web/content/publish/preface.mdx`
- `apps/web/content/publish/meta.json`
- `apps/web/content/publish/index.mdx`
- `apps/web/source.config.ts`
- `apps/web/src/lib/source.ts`
- `apps/web/src/app/episodes/[[...slug]]/page.tsx`
- directly relevant discovery or link-generation files only if needed

Checks:
- determine the likely route path generated from each flagged file
- determine whether the app currently exposes those pages through `/episodes/...`
- determine whether any `/docs/...` links still map to a real route in the current app tree
- record overlap with newer canonical routes and recommend the next decision class for each file

Constraints:
- no content file edits
- no route refactors
- no Stripe or coaching work
