# TypeScript 7 migration

The High Ground Studio workspace runs every TypeScript project with the native
TypeScript `7.0.2` compiler. Each owning package declares the same exact
side-by-side toolchain:

- `@typescript/native: npm:typescript@7.0.2` supplies the `tsc` executable.
- `typescript: npm:@typescript/typescript6@6.0.2` supplies the temporary
  programmatic API used by Next.js, `ts-node`, and other embedded tooling.

This follows the [TypeScript team's 7.0 transition
guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0).
TypeScript 7.0 intentionally ships without a programmatic API; Microsoft expects
7.1 to introduce a new one. Installing 7.0 as the unaliased `typescript`
package made direct `tsc` checks pass but caused Next's production build worker
to reject the package. The paired aliases give us the TS7 compiler today
without breaking API-dependent production tooling.

The toolchain is a project-level development dependency, not an accidental
transitive tool or an unbounded workspace-wide range. Every application and
package therefore remains independently installable and understandable to a
collaborator.

Run the compiler contract locally with:

```bash
bash scripts/ci/typecheck-typescript-7.sh
```

For a Next.js project, the gate runs `next typegen` before the pinned compiler
so route-aware types and ignored `next-env.d.ts` are generated from the current
source rather than inherited from a developer's last `next dev` or
`next build`.

List the projects currently protected by the gate with:

```bash
bash scripts/ci/typecheck-typescript-7.sh --list
```

## Migration rules

1. Pin both workspace aliases exactly in the owning package.
2. Remove options deleted by TypeScript 7 instead of suppressing diagnostics.
3. Use explicit relative `paths` targets; do not reintroduce `baseUrl`.
4. Match module resolution to the real runtime or bundler.
5. Fix correctness errors exposed by stricter inference.
6. Verify the consuming Next.js, Electron, Node.js, or package build.
7. Add the project to `scripts/ci/typecheck-typescript-7.sh`.
8. Update the shared lockfile only in a reviewed, release-surface-aware
   dependency slice.

The gate verifies all four parts of that contract: every tracked project is
registered, the manifest has both exact aliases, the package resolves the
expected installed TS7 compiler, and every project configuration passes it. It
also rejects CI or package scripts that download a shadow TypeScript compiler
with `pnpm dlx` or `npx`, so local and CI results exercise the compiler that
production builds actually resolve.

## Verified TypeScript 7 set

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

## Holdouts

There are no compiler holdouts in the current workspace. Every tracked
`tsconfig.json` and test-project configuration runs with TypeScript 7. The
TypeScript 6 compatibility API is an explicit ecosystem bridge, not the
compiler used by the gate. Remove it only after the relevant framework and
tooling builds have been proven against TypeScript's future API.

The focused pull-request checks for Quipsly and High Ground web use that same
package-pinned compiler. The workspace compatibility workflow independently
checks all registered projects; neither path downloads a second compiler.

New projects must declare both exact aliases and join the gate in the same
change that introduces their compiler configuration.

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
