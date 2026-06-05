# Quarantined duplicate research route

Quarantined during release cleanup on 2026-06-04.

Reason: `apps/quipsly/src/app/research/page.tsx` conflicted with the canonical app route at `apps/quipsly/src/app/(app)/research/page.tsx`, causing Next.js to fail with duplicate `/research` pages.
