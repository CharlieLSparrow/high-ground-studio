# Episodes Build Investigation Result

Date: 2026-04-27

Scope:
- Narrow investigation only.
- No Stripe recovery files changed.
- No episodes route or MDX content files changed in this pass.

What was verified:
- `apps/web/src/app/episodes/[[...slug]]/page.tsx` depends on `apps/web/src/lib/source.ts`.
- `apps/web/src/lib/source.ts` imports `docs` from `fumadocs-mdx:collections/server` and builds the route source through `loader(...)`.
- `apps/web/source.config.ts` points Fumadocs at `content/publish`.
- `apps/web/next.config.mjs` enables Fumadocs MDX via `createMDX()`.
- A stale `next build` process from prior work had been holding `.next/lock`; by the time cleanup was attempted, those old PIDs had already exited and the lock file was gone.
- One fresh clean production build was run with the default app script: `pnpm --filter web build`.

Observed result from the clean default build:
- The default build started normally:
  - `next build`
  - `Next.js 16.1.6 (Turbopack)`
  - `Creating an optimized production build ...`
- After that point, the build did not emit a concrete compiler error.
- The process remained in the Turbopack compile phase for roughly 90 seconds with no further output.
- The build was then terminated intentionally so the investigation could stop cleanly without leaving a background process running.

Conclusion on current failure mode:
- The default Turbopack production build did not produce a concrete error in this pass.
- The currently reproducible failure mode is a compile stall, not a surfaced exception.

Does the remaining blocker appear to be in the episodes / MDX / Fumadocs pipeline?
- Yes, that is still the strongest evidence-based suspect.
- The episodes route is the app code path that directly depends on `fumadocs-mdx:collections/server`.
- Earlier build evidence already showed the content stack as the next build blocker once the Stripe route issue was removed.
- No evidence from this pass points back to Stripe/coaching or another unrelated application area.

Recommended next 3 options, lowest risk first:
1. Run a dedicated episodes-path build investigation with deeper build instrumentation only.
   - Goal: collect Turbopack trace/debug evidence around `apps/web/src/app/episodes/**` and `apps/web/src/lib/source.ts` without changing runtime behavior yet.
2. Add a temporary, reversible guard around the episodes content loader integration.
   - Goal: confirm whether `fumadocs-mdx:collections/server` is the actual compile trigger while keeping the rest of the app unchanged.
3. Replace the current MDX-backed episodes route with a minimal fallback page temporarily.
   - Goal: get the full app build green if framework/tooling incompatibility is confirmed and no smaller integration fix is available.
