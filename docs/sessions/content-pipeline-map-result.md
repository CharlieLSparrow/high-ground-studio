# Content Pipeline Map Result

Date: 2026-04-27

What was verified:
- `apps/web/source.config.ts` points Fumadocs at `content/publish`
- `apps/web/src/lib/source.ts` loads the guarded Fumadocs source from that config
- `apps/web/src/app/episodes/[[...slug]]/page.tsx` is the route that renders the guarded MDX content path
- `apps/web/src/lib/site.ts` and `apps/web/src/lib/reading.ts` provide curated discovery metadata for `/library`
- no current app code in this pass reads directly from `content/_staging` or `content/_inbox`

What was created:
- `docs/architecture/content-pipeline.md`

What was updated:
- `docs/project-context/current-state.md`
- `docs/analysis/repo-audit-2026-04-27.md`

Key conclusion:
- `apps/web/content/publish` is the current source of truth for published MDX route content
- `apps/web/content/_staging` is structured working/staging material, not live route source
- `apps/web/content/_inbox` is raw manuscript/research input, not live route source
- current curated discovery behavior also depends on `src/lib/site.ts` and `src/lib/reading.ts`, so published page content and published discovery metadata are not fully unified
