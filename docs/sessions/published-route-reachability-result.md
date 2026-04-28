# Published Route Reachability Result

Date: 2026-04-28

What was inspected:
- the six flagged published files
- `apps/web/content/publish/meta.json`
- `apps/web/content/publish/index.mdx`
- `apps/web/source.config.ts`
- `apps/web/src/lib/source.ts`
- `apps/web/src/app/episodes/[[...slug]]/page.tsx`
- directly relevant discovery and link-consumer files

What was created:
- `docs/architecture/published-route-reachability.md`

What was verified:
- current repo evidence supports `content/publish` feeding the `/episodes/...` route family
- `apps/web/src/lib/source.ts` sets `baseUrl: "/episodes"`
- the dynamic content route is `apps/web/src/app/episodes/[[...slug]]/page.tsx`
- no `src/app/docs/...` route exists in the current app tree
- the six flagged files are still referenced in-tree through `publish/meta.json` and `publish/index.mdx`
- some of the older episode files also still contain internal `/docs/...` links to older companion pages

Route-status conclusion:
- the six flagged files are likely reachable as `/episodes/...` pages when `ENABLE_EPISODES_FUMADOCS=1`
- current repo evidence does not confirm `/docs/...` as a live app route
- the numbered episode pages look like the clearest candidates for future redirect decisions
- the root-level prose pages still need human/editorial judgment before any archive or alias decision

Recommended next-action split:
- `episode-001.mdx`, `episode-002.mdx`, `episode-003.mdx`: convert to redirect later
- `preface.mdx`, `introduction.mdx`, `chapter-zero-in-the-beginning.mdx`: leave for human/editorial decision
