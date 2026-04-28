# Content Pipeline Map Plan

Date: 2026-04-27

Scope:
- Inspect the content tree and the app code that currently consumes it.
- Add a durable content-pipeline map.
- Only update broader docs if the authoritative/live-vs-staging distinction needs to be clarified.

Verified code paths:
- `apps/web/source.config.ts` points Fumadocs at `content/publish`
- `apps/web/src/lib/source.ts` loads the guarded Fumadocs source from that config
- `apps/web/src/app/episodes/[[...slug]]/page.tsx` renders the guarded episodes/doc content route
- `apps/web/src/lib/site.ts` and `apps/web/src/lib/reading.ts` provide curated metadata used by `/library`
- no current app code reads directly from `content/_staging` or `content/_inbox`

Plan:
1. Write `docs/architecture/content-pipeline.md`.
2. Explain what `publish`, `_staging`, and `_inbox` each represent.
3. State clearly which directory currently feeds live/published behavior.
4. Tighten `current-state.md` and `repo-audit-2026-04-27.md` only where that source-of-truth distinction needs to be more explicit.
