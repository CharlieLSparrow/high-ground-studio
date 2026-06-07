# Quipsly Release Handoff - 2026-06-07

Status timestamp: 2026-06-07 15:59 MDT

## Current release branch

- Branch: `codex/quipsly-romance-lab-001`
- Draft PR: https://github.com/CharlieLSparrow/high-ground-studio/pull/53
- Latest pushed commit at handoff: `cda5cac Harden GitHub studio deploy preflight`
- Local/remote state at handoff: clean and synced

## What this branch contains

- Production-core schema and route foundation for Quipsly beta work.
- Native Mac auth/session backing tables wired into additive SQL and schema readiness checks:
  - `StudioNativeAuthCode`
  - `StudioNativeDeviceSession`
- Release cockpit and operator plan updates.
- Targeted schema sync path:
  - `scripts/release/quipsly-schema-sync.sh`
  - `scripts/quipsly-nest-chat-schema-push.mjs`
  - `scripts/quipsly-production-core-schema-sync.mjs`
- Preview deploy/smoke/promote path:
  - `scripts/release/quipsly-deploy-preview.sh`
  - `scripts/release/quipsly-smoke-preview.sh`
  - `scripts/release/quipsly-promote-preview.sh`
- Release preflight:
  - `scripts/release/quipsly-release-preflight.sh`
- GitHub Actions studio deploy hardening:
  - manual `studio` / `all` deploys initialize and run schema sync
  - auto deploy treats additive SQL/schema-sync scripts as schema-affecting
  - studio deploy runs release preflight before schema sync/deploy
  - preview smoke uses `HOST_HEADER=nest.quipsly.com`

## Validation already run locally

```bash
pnpm --filter quipsly exec tsc --noEmit --incremental false
NEXT_PUBLIC_STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app pnpm --filter quipsly build
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/deploy-cloud-run.yml"); puts "YAML OK"'
bash -n scripts/release/quipsly-release-preflight.sh
bash -n scripts/release/quipsly-smoke-preview.sh
bash -n scripts/release/quipsly-schema-sync.sh
bash -n scripts/release/quipsly-deploy-preview.sh
bash -n scripts/release/quipsly-promote-preview.sh
git diff --check
```

## Current deploy blocker

Local `gcloud` auth for `charlie@highgroundodyssey.com` is expired.

The waiting manual auth command is:

```bash
gcloud auth login --no-launch-browser --brief
```

It is waiting for the Google verification code. Once that code is entered, rerun:

```bash
REGION=us-central1 PROJECT_ID=high-ground-odyssey scripts/release/quipsly-release-preflight.sh
```

Expected after auth refresh:

- `PASS gcloud token can access project high-ground-odyssey.`
- `PASS Cloud Run service studio exists in us-central1.`

## Service account finding

`local-engine-uploader@high-ground-odyssey.iam.gserviceaccount.com` is not a deploy operator.

Observed behavior:

- It can authenticate to the project.
- It cannot describe Cloud Run service `studio`.
- It lacks Cloud Build visibility.

Do not use that account for deploy unless IAM is intentionally expanded.

## Local deploy path after auth

```bash
REGION=us-central1 PROJECT_ID=high-ground-odyssey bash scripts/release/quipsly-schema-sync.sh
REGION=us-central1 PROJECT_ID=high-ground-odyssey bash scripts/release/quipsly-deploy-preview.sh
PREVIEW_URL=<preview-url> HOST_HEADER=nest.quipsly.com bash scripts/release/quipsly-smoke-preview.sh
REGION=us-central1 PROJECT_ID=high-ground-odyssey bash scripts/release/quipsly-promote-preview.sh
```

## GitHub Actions deploy path

Workflow: `.github/workflows/deploy-cloud-run.yml`

Manual dispatch target options:

- `studio`: deploys Nest/Quipsly studio service only and runs schema sync.
- `all`: deploys web and studio and runs schema sync for studio.

The workflow uses:

- Workload Identity provider: `projects/659427658635/locations/global/workloadIdentityPools/github-actions/providers/github`
- Deployer service account: `github-actions-deployer@high-ground-odyssey.iam.gserviceaccount.com`

If GitHub Actions deployment fails, first check whether that deployer service account has:

- Cloud Build permissions
- Cloud Run service visibility and deployment permissions for service `studio`
- Permission to deploy/execute Cloud Run Jobs for schema sync
- Access to required secrets and Cloud SQL attachment assumptions already documented in `docs/coordination/deploy-captain-runbook.md`

## Smoke expectations

`quipsly-smoke-preview.sh` is intentionally non-mutating. It must pass:

- `/api/health`
- `/api/healthz`
- `/api/beta-readiness`
- `/api/production-core/readiness`
- unauthenticated `/api/mac/session-check` returning expected `401`, not `500`
- output catalog and art library APIs
- key HTML app routes

If `/api/production-core/readiness` fails, do not promote. Run/fix schema sync first.

## Cloud Build context

Latest measured by release preflight:

- `952` files
- `121.1 MiB`

Warning threshold is currently `150 MiB` via `CONTEXT_WARN_MIB`.

## Current product-owner recommendation

Do not add more product surface before this lands. The branch is large and valuable; ship it through schema sync, preview deploy, smoke, and promotion first. After live deploy, resume Mac auth/user switching validation against `nest.quipsly.com` and then continue local editor/media workflow hardening.
