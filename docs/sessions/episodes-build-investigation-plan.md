# Episodes Build Investigation Plan

Date: 2026-04-27

Scope:
- Investigate the remaining production build problem in the episodes / MDX / Fumadocs path.
- Avoid touching Stripe recovery files or unrelated app areas.

Current evidence:
- `apps/web/src/app/episodes/[[...slug]]/page.tsx` depends on `apps/web/src/lib/source.ts`.
- `apps/web/src/lib/source.ts` imports `docs` from `fumadocs-mdx:collections/server`.
- `apps/web/next.config.mjs` enables Fumadocs MDX through `createMDX()`.
- A stale `next build` process is currently holding `.next/lock`, which needs to be cleared before a clean reproduction.

Investigation steps:
1. Terminate the stale build process and rerun clean production builds under Turbopack and webpack.
2. Confirm the first concrete failure tied to the episodes/content pipeline.
3. Inspect the minimum code/config surface involved:
   - `apps/web/src/app/episodes/**`
   - `apps/web/src/lib/source.ts`
   - `apps/web/source.config.ts`
   - Fumadocs/Next integration points
4. Apply the smallest coherent stabilization:
   - either a focused code/config fix, or
   - a temporary fallback for the episodes route if the issue is clearly a framework/tooling blocker.
5. Rebuild, record the result, and document the remaining risk or next steps.
