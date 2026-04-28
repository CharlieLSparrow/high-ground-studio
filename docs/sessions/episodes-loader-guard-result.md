# Episodes Loader Guard Result

Date: 2026-04-27

Scope:
- Added a temporary, reversible guard around the episodes/Fumadocs loader integration.
- Kept the change limited to:
  - `apps/web/src/lib/source.ts`
  - `apps/web/src/app/episodes/[[...slug]]/page.tsx`
- No Stripe/coaching files changed.

What changed:
- Replaced the top-level `fumadocs-mdx:collections/server` import in `apps/web/src/lib/source.ts` with a guarded runtime load.
- Added `ENABLE_EPISODES_FUMADOCS=1` as the explicit opt-in switch for the Fumadocs-backed episodes source.
- When the flag is not set, the episodes route now receives an empty source instead of loading the Fumadocs collection at module initialization time.
- The episodes route remains intact and now shows a clear diagnostic note when the loader guard is active.

Build result after the guard:
- Ran one clean build with the default script:
  - `pnpm --filter web build`
- The build no longer reproduced the prior silent compile stall behavior.
- Instead, Turbopack failed with a concrete error:

`TurbopackInternalError: Failed to write app endpoint /page`

Concrete failing chain from the build output:
- `[project]/apps/web/src/app/globals.css [app-client] (css)`
- `creating new process`
- `binding to a port`
- `Operation not permitted (os error 1)`
- `Execution of evaluate_webpack_loader failed`
- `Execution of PostCssTransformedAsset::process failed`

What this means:
- The guard strongly implicates the Fumadocs loader path as the trigger for the earlier compile stall, because removing the top-level collection import changed the failure mode from "indefinite compile stall" to a different, surfaced Turbopack error.
- The build does **not** pass yet.
- There is now a second concrete blocker in the default Turbopack build path, and it appears to be in Turbopack's CSS/PostCSS worker execution rather than in the episodes route itself.

Assessment:
- Did the guard confirm the Fumadocs loader as the trigger?
  - Partially, yes.
  - It did not yield a green build, but it did remove the prior silent stall pattern and expose a different downstream Turbopack failure.
- Does the build pass now?
  - No.

Next 3 recommended steps:
1. Re-run the guarded build outside the current sandbox restrictions to verify whether the new `globals.css` / PostCSS worker error is environment-specific.
2. If that error disappears outside the sandbox, keep the loader guard in place temporarily and separately verify whether `ENABLE_EPISODES_FUMADOCS=1` reintroduces the original stall.
3. If the guarded build still fails outside the sandbox, open a separate narrow task on the Next 16.1.6 Turbopack CSS/PostCSS production path before making any larger episodes-route fallback.
