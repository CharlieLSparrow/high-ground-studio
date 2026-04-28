# Published Discovery Alignment Result

Date: 2026-04-27

What was verified:
- `apps/web/content/publish` is the only content directory currently wired into `apps/web/source.config.ts`
- `apps/web/src/lib/source.ts` loads the guarded Fumadocs source for the episodes/doc route
- `apps/web/src/app/episodes/[[...slug]]/page.tsx` renders live MDX route content from that source when enabled
- `apps/web/src/lib/site.ts` feeds homepage and library episode discovery
- `apps/web/src/lib/reading.ts` feeds library paired-reading discovery
- current discovery surfaces are hand-maintained metadata arrays, not dynamic enumeration of `content/publish`

What was created:
- `docs/architecture/published-discovery-alignment.md`

What was updated:
- `docs/project-context/current-state.md`
- `docs/analysis/repo-audit-2026-04-27.md`
- `docs/plans/now-next-later.md`

Key conclusion:
- live page source and live discovery metadata are currently separate published layers
- drift can happen whenever `content/publish` changes without matching updates to `src/lib/site.ts` and/or `src/lib/reading.ts`
- the lowest-risk near-term response is documentation plus alignment discipline, not content-loading refactors
