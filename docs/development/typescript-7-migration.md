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
- AI, photography, video, and motion hubs
- the desktop companion
- the Quipsly API
- content-studio, motion, Quipsly document, Quipsly domain, Studio domain, and
  Worldhub domain packages

## Explicit holdouts

These projects are intentionally not in the gate yet:

| Project | Blocking work |
| --- | --- |
| `apps/local-engine` | Move its CommonJS runtime and ESM-only dependencies to one deliberate module contract. |
| `apps/quiplore` | Align React 19 with React Three Fiber 9 and Drei 10, then prove `/discovery-lab` in the production build and browser runtime. |
| `apps/render-engine` | Align its React type/runtime version under the hoisted workspace, then repair JSX and Remotion compiler configuration. |
| `apps/studio-cut-web` | Restore the `@high-ground/studio-cut-schema` package boundary, then resolve the resulting strict type errors. |
| `packages/quipsly-document-kernel/tsconfig.test.json` | Replace the removed Node 10/CommonJS test-emission path without breaking the source package's Turbopack resolution. |

Do not add a holdout to the gate by weakening strictness, skipping library
checks that affect runtime contracts, or excluding the failing source.
