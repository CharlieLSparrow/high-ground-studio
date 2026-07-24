# Release manifests

These manifests are the machine-readable ownership boundary for every
supported application release. They replace duplicated path knowledge in CI
with one validated contract per app.

Each manifest declares:

- the owning application root and lifecycle status;
- exact files and path prefixes that trigger deploy, validation-only, or schema
  work;
- the artifact identity, exact-Git-SHA authority, materializer, and provenance
  receipt;
- required source, deterministic, local-runtime, credentialed-runtime, and
  delivery-readback proof;
- the external delivery target and promotion policy;
- a bounded release context when the current pipeline materializes one.

The four required manifests are:

| ID | Product | Artifact | Delivery |
| --- | --- | --- | --- |
| `capture` | Quipsly Capture for iPhone | signed IPA | App Store Connect |
| `nest` | Quipsly Nest | container image | Cloud Run `studio` service |
| `hgo-web` | High Ground Odyssey web | container image | Cloud Run `web` service |
| `quipsly-studio` | native production editor | macOS application/operator artifact | operator workflow |

## Validate

```bash
pnpm release:manifests:audit
node --experimental-strip-types --test \
  packages/repository-governance/src/release-manifest.test.ts \
  scripts/ci/plan-changed-surfaces.test.mjs
BUILD_WEB_CONTEXT=1 \
  bash scripts/release/materialize-release-context.test.sh hgo-web
```

The TypeScript 7 validator rejects unknown properties, missing proof levels,
unsafe repository paths, duplicate ownership, missing declared files,
non-Git provenance, and a manifest that does not trigger its own boundary.
The JSON Schema provides editor and external-tool interoperability; the
repository validator is the CI authority.

Nest and HGO web use the shared exact-SHA materializer. It reads
`releaseContext` from the owning manifest stored in the selected commit. Source
allowlists, size ceilings, and provenance receipt names therefore cannot drift
from a second shell-script list. HGO deterministic checks also run inside that
materialized context, so ambient worktree state is neither build nor test
input.

## Change a boundary

Treat manifest changes as release architecture changes:

1. update the owning manifest and its tests together;
2. prove representative positive and negative changed-path cases;
3. update the materializer when `releaseContext` changes;
4. run the affected deterministic build;
5. document new credentialed or delivery proof in the owning runbook.

Do not add an application path to another manifest merely to make CI pass.
Declare a real runtime/build dependency or remove the accidental coupling.
