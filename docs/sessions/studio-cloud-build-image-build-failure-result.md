# Studio Cloud Build Image Build Failure Result

Date: 2026-05-19

## Summary

During the first live Studio Cloud Run operator session, the operator ran:

```bash
pnpm studio:cloudbuild:image:sha
```

Cloud Build uploaded source and started the Docker build, but the image build
failed during:

```dockerfile
RUN pnpm install --frozen-lockfile
```

The reported failure was:

```text
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts:
@prisma/engines@7.7.0, esbuild@0.21.5, esbuild@0.27.3, prisma@7.7.0, sharp@0.34.5
```

The Cloud Build log also showed Corepack downloading `pnpm 11.1.3`, while the
local operator preflight reports `pnpm 10.30.3`.

## Why It Failed

The Docker build path did not have an explicit root package-manager pin, so
Corepack selected a newer pnpm version in Cloud Build than the local workspace
uses.

The workspace already has the narrow pnpm build-script approval list in
`pnpm-workspace.yaml`:

```yaml
onlyBuiltDependencies:
  - '@prisma/engines'
  - esbuild
  - prisma
  - sharp
```

Those are the packages needed for this build path. The fix is to make Cloud
Build use the same pnpm major/minor behavior as local tooling, not to approve
every package.

## What Changed

Added an explicit package-manager pin to the root `package.json`:

```json
"packageManager": "pnpm@10.30.3"
```

Updated `apps/studio/Dockerfile` so Corepack explicitly prepares and activates
the same pnpm version:

```dockerfile
ARG PNPM_VERSION=10.30.3

RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate
```

Updated `docs/runbooks/studio-cloud-run.md` with a note about the pnpm pin and
the narrow `onlyBuiltDependencies` approval list.

## What Did Not Change

- No dependencies were added.
- No package versions were changed.
- No broad build-script approval was added.
- No Cloud Build was rerun from Codex.
- No deploy was run.
- No Google Cloud resources were created or mutated.
- No IAM, DNS, Secret Manager, or database mutation happened.

## Validation

Completed local validation for this pass:

```bash
pnpm studio:cloudrun:test
pnpm studio:structure:test
pnpm --filter @high-ground/studio-domain typecheck
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```

The first sandboxed `pnpm --filter studio build` attempt hit the known
Turbopack/PostCSS process and local-port restriction. The same command passed
when rerun outside the sandbox.

Also checked:

```bash
pnpm ignored-builds
```

It reported no automatically ignored builds in the local workspace.

The optional local Docker build was skipped. Docker is installed, but the local
daemon was not reachable from this session:

```bash
Cannot connect to the Docker daemon at unix:///Users/wall-e/.docker/run/docker.sock.
```

## Next Operator Step

After this commit is pushed, the operator should rerun:

```bash
pnpm studio:cloudbuild:image:sha
```

Do not deploy until the image build succeeds and the operator is ready to
continue the Cloud Run deployment checklist.
