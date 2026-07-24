# TypeScript 7 migration

Quipsly uses a compatibility-first migration instead of changing the monorepo's
root dependency in one step. A project joins the TypeScript 7 compatibility
gate only after its existing compiler check and its consuming build or package
path have been verified.

The compatibility compiler is pinned to `typescript@7.0.2`. Run the same gate
locally with:

```bash
bash scripts/ci/typecheck-typescript-7.sh
```

List the projects currently protected by the gate with:

```bash
bash scripts/ci/typecheck-typescript-7.sh --list
```

## Migration rules

1. Keep the project's current compiler check green.
2. Remove options deleted by TypeScript 7 instead of suppressing diagnostics.
3. Use explicit relative `paths` targets; do not reintroduce `baseUrl`.
4. Match module resolution to the real runtime or bundler.
5. Fix correctness errors exposed by stricter inference.
6. Verify the consuming Next.js, Electron, Node.js, or package build.
7. Add the project to `scripts/ci/typecheck-typescript-7.sh`.
8. Upgrade its package dependency and the shared lockfile only in a reviewed,
   release-surface-aware dependency slice.

The production Quipsly container continues to use its package-pinned compiler
while the compatibility gate proves the next compiler independently. This keeps
the deployable product stable without allowing migration debt to grow.

## Verified compatibility set

As of 2026-07-23, the gate covers:

- Quipsly Nest and the High Ground web app
- Quiplore, including a production build and warning-free browser proof of the
  React Three Fiber Constellation
- the local media engine, with its CommonJS runtime boundary preserved and
  ESM-only dependencies loaded explicitly
- AI, photography, video, and motion hubs
- the desktop companion
- the Remotion render engine, with its React 18 type graph kept consistent with
  the engine's declared runtime
- Studio Cut and its restored shared schema, including word-timed transcript
  validation, schema regression tests, and the Vite production build
- the Quipsly API
- content-studio, motion, Quipsly document, Quipsly domain, Studio domain, and
  Worldhub domain packages
- the Quipsly document-kernel Node test project, executed directly as ESM
  instead of using the removed Node 10/CommonJS emitter

## Explicit holdouts

There are no known TypeScript project holdouts in the current workspace. New
projects must join the gate in the same change that introduces their compiler
configuration.

Do not add a holdout to the gate by weakening strictness, skipping library
checks that affect runtime contracts, or excluding the failing source.

## Related runtime follow-up

The render engine's TypeScript 7 admission includes a real 300-frame H.264
render, not compiler-only evidence. Remotion currently also reports a
workspace-wide package-version warning: the Quipsly app requests
`@remotion/three` 4.0.473 while the remaining Remotion packages resolve to
4.0.469, and its Zod requirement differs from the hoisted version. Normalize
and pin that dependency family in a dedicated Quipsly rendering slice before
claiming workspace-wide render dependency health.
