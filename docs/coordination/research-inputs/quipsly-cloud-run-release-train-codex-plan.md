# Quipsly Cloud Run Release Train Codex Implementation Plan

Date prepared: 2026-06-05

Audience: local Codex agent working in `CharlieLSparrow/high-ground-studio`

Goal: implement a fast, safe, beta-ready release/deploy pipeline for the Quipsly Cloud Run surface, with build, database mutation, preview deploy, smoke testing, promotion, rollback, and secrets handled as separate, auditable stages.

This file is intentionally implementation-heavy. Treat it as the railway blueprint, signal map, and safety placard collection. The goal is not just to make deploys work. The goal is to make risky deploy behavior hard to do by accident.

---

## 0. The target outcome

Implement a Quipsly release train that follows this shape:

```text
source commit
  -> build immutable container image
  -> build explicit migrator/schema-sync image
  -> run database migration/schema-sync through a dedicated Cloud Run Job
  -> deploy a Cloud Run revision with --no-traffic and a preview tag
  -> smoke test the tagged preview URL, including Host-header tests
  -> stop
  -> require human approval to promote
  -> promote traffic by explicit percentage
  -> rollback by Cloud Run traffic update if needed
```

The MVP should create a safe path for Quipsly without breaking the existing `web` and `studio` deploy paths. Prefer additive files and scripts first. Once the safe path is proven, the older direct-deploy paths can be retired deliberately.

---

## 1. Read these files before touching code

Start at the repo root. Read these files in this order:

```text
AGENTS.md
docs/project-context/current-state.md
docs/architecture/platform-service-boundaries.md
docs/architecture/quipsly-quiplore-foundation.md
docs/agents/quipsly-quiplore-codex-brief.md
docs/deploy/database-migrations.md
package.json
pnpm-workspace.yaml
.dockerignore
apps/quipsly/package.json
apps/quipsly/next.config.mjs
apps/quipsly/Dockerfile
.github/workflows/deploy-cloud-run.yml
```

Important repo memory from those files:

- `AGENTS.md` says this is an active monorepo, agents should verify from files before asserting product state, prefer narrow changes, and update docs when touching auth, Prisma, content loading, or build behavior.
- Root `package.json` declares `pnpm@10.30.3`, workspaces under `apps/*` and `packages/*`, existing Cloud Run scripts for `web`, and existing `quipsly`, `quipsly-api`, `quiplore`, and `quipsly-domain` scripts.
- `docs/architecture/quipsly-quiplore-foundation.md` says Quipsly and QuipLore should be first-class app boundaries, not reuse `web-*` or `studio-*` secrets, service accounts, Cloud Run services, or deploy scripts.
- `docs/agents/quipsly-quiplore-codex-brief.md` says Quipsly/QuipLore work should own `apps/quiplore`, `apps/quipsly-api`, future `apps/quipsly-worker`, `packages/quipsly-domain`, and Quipsly-specific docs/scripts/Cloud Build files. Avoid touching `apps/web`, `apps/studio`, existing HGO content, and existing web/studio deployment files unless explicitly required.
- `docs/deploy/database-migrations.md` says the repo currently has no checked-in `prisma/migrations/` history. That means the migration plan needs a bridge from current `db push` reality to a future committed-migrations-first Prisma workflow.

Do not skip the reading step. This repo has naming drift and deployment fossils in it, which is normal for a living system, but it means “obvious” changes may be trapdoors wearing friendly shoes.

---

## 2. Current repo observations that matter for this implementation

### 2.1 Monorepo and package manager

Root `package.json` declares:

```json
{
  "name": "high-ground-studio",
  "private": true,
  "packageManager": "pnpm@10.30.3",
  "workspaces": ["apps/*", "packages/*"]
}
```

`pnpm-workspace.yaml` also includes:

```yaml
packages:
  - apps/*
  - packages/*

onlyBuiltDependencies:
  - '@prisma/engines'
  - esbuild
  - prisma
  - sharp
```

Use pnpm. Do not add npm/yarn lockfiles.

### 2.2 Existing Quipsly surfaces

The repo currently contains these relevant app surfaces:

```text
apps/quipsly
apps/quipsly-api
apps/quiplore
packages/quipsly-domain
```

Observed package names:

```text
apps/quipsly/package.json       -> "name": "quipsly"
apps/quipsly-api/package.json   -> "name": "quipsly-api"
apps/quiplore/package.json      -> "name": "quiplore"
```

`apps/quipsly` is a Next.js app with Prisma, NextAuth, Tiptap, Remotion, Three, and Yjs dependencies. Its current `next.config.mjs` already uses standalone output:

```js
output: "standalone",
outputFileTracingRoot: repoRoot,
transpilePackages: [
  "@high-ground/content-studio-domain",
  "@high-ground/studio-domain",
],
serverExternalPackages: [
  "@remotion/bundler",
  "@remotion/renderer",
  "esbuild",
],
```

`apps/quipsly-api` and `apps/quiplore` also use standalone output, but this plan focuses on the user-requested Quipsly Cloud Run release train. Make the scripts generic enough to reuse for `quipsly-api` and `quiplore` later, but do not overbuild the first pass.

### 2.3 Existing Quipsly Dockerfile has naming drift

`apps/quipsly/Dockerfile` exists, but currently appears to be a renamed/stale Studio Dockerfile. It references `apps/studio` and builds the `studio` package even though the current package is `apps/quipsly`:

```dockerfile
COPY apps/studio/package.json ./apps/studio/package.json
RUN pnpm --filter studio build
COPY --from=builder /app/apps/studio/.next/standalone ./
CMD ["node", "apps/studio/server.js"]
```

This is a release blocker. The Quipsly release train must not use this Dockerfile as-is. Fix it or replace it with a new release Dockerfile that targets `apps/quipsly` correctly.

### 2.4 Existing web deploy scripts are direct-deploy scripts, not safe release-train scripts

The existing `scripts/web-cloud-run-deploy.mjs` is useful as a source of patterns, but it is not safe enough for the desired Quipsly release train. It currently:

- builds an image,
- deploys directly with `gcloud run deploy`,
- updates secrets/env vars,
- then ensures the deployed revision receives 100% traffic if traffic is pinned elsewhere.

That last behavior is the opposite of a beta-safe release train. Do not copy it blindly. Borrow helper ideas only.

The existing `scripts/studio-cloud-run-deploy.mjs` has the same direct-deploy shape and also references old `studio` naming. Treat it as legacy operator tooling until reconciled.

### 2.5 Existing GitHub Actions workflow auto-deploys on push

`.github/workflows/deploy-cloud-run.yml` currently runs on pushes to `main` and can deploy `web` and `studio`. The plan job maps `apps/quipsly` changes to the `studio` deploy path:

```bash
studio_re='^(apps/quipsly/|packages/|prisma/|package.json$|pnpm-lock.yaml$|pnpm-workspace.yaml$|cloudbuild\.studio(\.deploy)?\.yaml$|scripts/studio-cloud-run|\.dockerignore$)'
```

The workflow then calls:

```bash
pnpm studio:cloudrun:deploy
```

This conflicts with explicit preview, smoke, and human-approved promotion. The release train implementation should either disable this automatic deploy path for Quipsly changes or replace it with build-only behavior before production use.

Do not casually break existing `web` deployment during this Quipsly task. Add a separate Quipsly release workflow or Cloud Build configs first, then make a deliberate follow-up to retire the old path.

### 2.6 Current health route is too small for release verification

`apps/quipsly/src/app/api/health/route.ts` currently returns a static response through `apps/quipsly/src/lib/studio-health.mjs`:

```js
{
  ok: true,
  service: "high-ground-studio",
  app: "studio"
}
```

For release-train smoke tests, Quipsly needs a non-sensitive health endpoint that can confirm:

```text
ok
service/app identity
release SHA
observed Host header
optional deep database connectivity
no-store cache header
```

Keep `/api/health` backward compatible if existing scripts depend on it. Add `/api/healthz` for release tests.

### 2.7 Database migration reality is transitional

The repo currently has:

```text
prisma/schema.prisma
prisma.config.ts
no committed prisma/migrations/ history
root scripts:
  pnpm db:generate  -> prisma generate
  pnpm db:push      -> prisma db push
  pnpm db:migrate   -> prisma migrate dev
```

The existing docs explicitly say this is not yet a committed-migrations-first Prisma project. Prior live schema changes have been applied through Cloud Run Jobs that ran `pnpm db:push` images. That is not ideal, but it is the current operational reality.

The new release train should therefore support two migration modes:

```text
MVP bridge mode:
  Cloud Run Job runs an explicit schema-sync command using current repo reality.
  This may be pnpm db:push, guarded by human approval.

Target mode:
  Repo has a Prisma baseline migration.
  New schema changes use checked-in migrations.
  Cloud Run Job runs prisma migrate deploy.
```

Do not silently pretend `prisma migrate deploy` will work today if no migrations exist.

---

## 3. Official-source architecture decisions

Use these official docs as the source of truth when implementing commands.

### 3.1 Cloud Run no-traffic revisions, preview tags, traffic split, rollback

Official doc:

```text
https://cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration
```

Required implementation details:

```bash
gcloud run deploy SERVICE \
  --image IMAGE_URL \
  --region REGION \
  --no-traffic \
  --tag TAG_NAME
```

Promote by tag:

```bash
gcloud run services update-traffic SERVICE \
  --region REGION \
  --to-tags TAG_NAME=TRAFFIC_PERCENT
```

Rollback to a known good revision:

```bash
gcloud run services update-traffic SERVICE \
  --region REGION \
  --to-revisions REVISION_NAME=100
```

Remove stale tags:

```bash
gcloud run services update-traffic SERVICE \
  --region REGION \
  --remove-tags TAG_NAME
```

Important: the release script must not use `--to-latest` for production promotion. Promotion should name the exact tag or revision.

### 3.2 Cloud Run Jobs for migration/schema-sync

Official docs:

```text
https://cloud.google.com/run/docs/create-jobs
https://cloud.google.com/run/docs/execute/jobs
```

Required implementation details:

```bash
gcloud run jobs execute JOB_NAME \
  --region REGION \
  --wait
```

Use jobs for finite tasks. Do not run Prisma migrations on service startup.

### 3.3 Secret Manager references for services and jobs

Official docs:

```text
https://cloud.google.com/run/docs/configuring/services/secrets
https://cloud.google.com/run/docs/configuring/jobs/secrets
```

Required implementation details:

Services and jobs should reference Secret Manager secrets with `--set-secrets` or `--update-secrets`. Do not bake secrets into Docker images. Do not pass production database URLs as Docker build args.

### 3.4 Cloud Build approvals

Official doc:

```text
https://cloud.google.com/build/docs/securing-builds/gate-builds-on-approval
```

Required implementation details:

Cloud Build trigger approvals are configured on triggers, not in YAML alone. The repo should include YAML and runbook instructions. The operator configures approval gates in Google Cloud.

### 3.5 Next.js standalone output

Official doc:

```text
https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
```

Required implementation details:

Standalone output creates `.next/standalone`, but does not automatically copy `public` or `.next/static`. The Dockerfile must copy them manually when they exist.

Cloud Run runtime should run the standalone `server.js` with:

```text
PORT=8080
HOSTNAME=0.0.0.0
node apps/quipsly/server.js
```

### 3.6 Prisma production migrations and baselining

Official docs:

```text
https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production
https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining
https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate
```

Required implementation details:

Production target command after baseline:

```bash
npx prisma migrate deploy
```

Do not use in production:

```bash
prisma migrate dev
prisma migrate reset
prisma db push --accept-data-loss
```

Current repo bridge caveat: because this repo currently lacks committed migrations, the MVP may need a human-approved Cloud Run Job running `pnpm db:push` until the baseline migration is created, reviewed, and marked applied in existing databases.

---

## 4. Naming model and environment contract

Use a parameterized release contract so this can work whether the live service is finally named `quipsly`, `studio`, or `quipsly-api`.

Recommended default names for the new Quipsly release train:

```text
GCP project:                 high-ground-odyssey
Region:                      us-central1
Artifact Registry repo:       high-ground-studio
Cloud Run service:            quipsly
App workspace package:        quipsly
Runner image name:            quipsly
Migrator image name:          quipsly-migrator
Preview tag:                  beta-${SHORT_SHA}
Runtime service account:      quipsly-run@PROJECT.iam.gserviceaccount.com
Migration service account:    quipsly-migrate@PROJECT.iam.gserviceaccount.com
Promotion service account:    quipsly-promote@PROJECT.iam.gserviceaccount.com
Database secret:              quipsly-database-url or quipsly-cloudsql-database-url
```

Do not assume these names are already provisioned. Local Codex should implement scripts and docs. Human/operator should create or confirm cloud resources.

### 4.1 Standard release environment variables

Use this env contract for scripts:

```bash
export RELEASE_PROJECT="high-ground-odyssey"
export RELEASE_REGION="us-central1"
export RELEASE_ARTIFACT_REPOSITORY="high-ground-studio"

export RELEASE_APP="quipsly"
export RELEASE_SERVICE="quipsly"
export RELEASE_IMAGE_NAME="quipsly"
export RELEASE_MIGRATOR_IMAGE_NAME="quipsly-migrator"

export RELEASE_SHA="$(git rev-parse HEAD)"
export RELEASE_SHORT_SHA="$(git rev-parse --short HEAD)"
export RELEASE_TAG="beta-${RELEASE_SHORT_SHA}"

export RELEASE_RUNTIME_SERVICE_ACCOUNT="quipsly-run@${RELEASE_PROJECT}.iam.gserviceaccount.com"
export RELEASE_MIGRATION_SERVICE_ACCOUNT="quipsly-migrate@${RELEASE_PROJECT}.iam.gserviceaccount.com"

export RELEASE_DATABASE_URL_SECRET="quipsly-database-url"
export RELEASE_CLOUDSQL_INSTANCE=""

export RELEASE_HOSTS="quipsly.com,nest.quipsly.com"
export RELEASE_OPTIONAL_HOSTS=""
export RELEASE_STUDIO_URL=""
export RELEASE_USE_ID_TOKEN="0"
```

If the current production service is still named `studio`, set:

```bash
export RELEASE_SERVICE="studio"
export RELEASE_IMAGE_NAME="studio"
```

But do not keep `studio` naming in new Quipsly files unless it reflects actual Cloud Run reality. The code should make the target obvious and configurable.

---

## 5. Proposed file changes

Create or modify these files.

### 5.1 New release docs

```text
docs/runbooks/quipsly-cloud-run-release-train.md
```

Update these docs after implementation:

```text
docs/agents/quipsly-quiplore-codex-brief.md
docs/deploy/database-migrations.md
```

The docs should say where the new scripts live, how to run build/release/promote, what is human-approved, and how to rollback.

### 5.2 Quipsly health endpoint

Add:

```text
apps/quipsly/src/app/api/healthz/route.ts
apps/quipsly/src/lib/release-health.ts
```

Keep existing `/api/health` if it is used by legacy scripts. Optionally make `/api/health` call the same helper, but avoid breaking existing tests that expect the old shape unless you update them.

### 5.3 Dockerfile

Modify:

```text
apps/quipsly/Dockerfile
```

Or, if you want zero risk to legacy paths during the first PR, create:

```text
apps/quipsly/Dockerfile.release
```

Recommended: fix `apps/quipsly/Dockerfile`, because the current file points at missing/stale `apps/studio` paths and is likely broken for its intended name.

### 5.4 Release scripts

Add:

```text
scripts/release/quipsly-run-migration-job.sh
scripts/release/quipsly-deploy-preview.sh
scripts/release/quipsly-smoke-preview.sh
scripts/release/quipsly-promote.sh
scripts/release/quipsly-rollback.sh
scripts/release/quipsly-cleanup-preview-tags.sh
```

Use shell for the gcloud/curl scripts. Shell is easier for local operators and Cloud Build. Make scripts fail loudly with `set -euo pipefail`.

### 5.5 Cloud Build configs

Add:

```text
cloudbuild.quipsly.build.yaml
cloudbuild.quipsly.release.yaml
cloudbuild.quipsly.promote.yaml
```

Optional later:

```text
cloudbuild.quipsly.rollback.yaml
```

### 5.6 Tests and preflight

Add:

```text
scripts/quipsly-cloud-run-release-train.test.mjs
scripts/quipsly-cloud-run-preflight.mjs
```

Root `package.json` should get scripts:

```json
{
  "scripts": {
    "quipsly:cloudrun:preflight": "node scripts/quipsly-cloud-run-preflight.mjs",
    "quipsly:cloudrun:release:test": "node --test scripts/quipsly-cloud-run-release-train.test.mjs",
    "quipsly:cloudbuild:image": "gcloud builds submit --config cloudbuild.quipsly.build.yaml .",
    "quipsly:cloudbuild:image:sha": "gcloud builds submit --config cloudbuild.quipsly.build.yaml --substitutions=_IMAGE_TAG=$(git rev-parse --short HEAD) ."
  }
}
```

Do not add a script that deploys and promotes in one command.

---

## 6. Implementation phase 0: inventory and branch safety

### 6.1 Start branch

```bash
git fetch origin
git switch -c codex/quipsly-cloud-run-release-train origin/main
```

### 6.2 Inspect repo shape

Run:

```bash
git status --short
ls apps
ls packages
find apps/quipsly -maxdepth 3 -type f | sort | sed -n '1,200p'
find apps/quipsly-api -maxdepth 3 -type f | sort | sed -n '1,200p'
find apps/quiplore -maxdepth 3 -type f | sort | sed -n '1,200p'
```

Confirm:

```text
apps/quipsly exists
apps/quipsly/package.json name is quipsly
apps/quipsly/next.config.mjs uses standalone output
apps/quipsly/Dockerfile currently references apps/studio and must be fixed
```

### 6.3 Local validation before changes

Run what is safe locally:

```bash
pnpm install --frozen-lockfile
pnpm --filter quipsly typecheck
pnpm --filter quipsly build
```

If `pnpm --filter quipsly build` fails due missing env, use a local placeholder only for build-time checks:

```bash
DATABASE_URL=postgresql://build:build@localhost:5432/high_ground_build pnpm --filter quipsly build
```

Do not use production `DATABASE_URL` locally unless the human operator explicitly provides it for a controlled operation.

### 6.4 Stop conditions

Stop and ask the human before proceeding if:

```text
apps/quipsly is not the app currently deployed at quipsly.com
quipsly.com is served by apps/quipsly-api or another service
existing production deploy relies on .github/workflows/deploy-cloud-run.yml auto-deploy behavior
there is an uncommitted local change that touches auth, Prisma, deploy, or Docker files
local build fails for reasons unrelated to env placeholders
```

Do not ask about minor naming defaults if you can keep scripts parameterized. Continue with parameterized names and document the unresolved mapping.

---

## 7. Implementation phase 1: release-aware health endpoint

### 7.1 Add `apps/quipsly/src/lib/release-health.ts`

Create a helper that returns non-sensitive release state.

Recommended implementation:

```ts
import { Client } from "pg";

export type ReleaseHealthOptions = {
  host: string;
  deep: boolean;
};

export type ReleaseHealthBody = {
  ok: boolean;
  service: string;
  app: string;
  releaseSha: string;
  host: string;
  db?: "skipped" | "not_configured" | "ok" | "error";
};

const DEFAULT_RELEASE_SHA = "unknown";

async function checkDatabase(): Promise<"not_configured" | "ok" | "error"> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return "not_configured";
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query("select 1");
    return "ok";
  } catch {
    return "error";
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function createReleaseHealthBody({
  host,
  deep,
}: ReleaseHealthOptions): Promise<ReleaseHealthBody> {
  const db = deep ? await checkDatabase() : "skipped";
  const ok = db !== "error";

  return {
    ok,
    service: "quipsly",
    app: "quipsly",
    releaseSha: process.env.RELEASE_SHA || DEFAULT_RELEASE_SHA,
    host,
    db,
  };
}
```

Notes:

- Do not return `DATABASE_URL`, exception messages, secret names, OAuth client ids, or provider state.
- The deep check should only run on `?deep=1`.
- If Quipsly already has a shared Prisma client, it is acceptable to use Prisma for `SELECT 1`. The direct `pg` example is intentionally tiny and already available in `apps/quipsly` dependencies.
- If the app uses a pooled Cloud SQL or Neon URL that requires SSL options, inspect existing Prisma/PG client setup and adjust `Client` accordingly. Do not invent SSL behavior without checking existing code.

### 7.2 Add `apps/quipsly/src/app/api/healthz/route.ts`

Recommended implementation:

```ts
import { type NextRequest } from "next/server";
import { createReleaseHealthBody } from "@/lib/release-health";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const deep = url.searchParams.get("deep") === "1";
  const host = request.headers.get("host") || "";
  const body = await createReleaseHealthBody({ host, deep });

  return Response.json(body, {
    status: body.ok ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
```

### 7.3 Keep `/api/health` compatible

Option A, safest:

Leave `/api/health` alone and add `/api/healthz` only.

Option B, useful later:

Update `/api/health` to include release metadata only if all existing tests are updated.

For MVP, choose Option A.

### 7.4 Health tests

Add tests in `scripts/quipsly-cloud-run-release-train.test.mjs` verifying:

```text
apps/quipsly/src/app/api/healthz/route.ts exists
apps/quipsly/src/lib/release-health.ts exists
release-health does not include DATABASE_URL in response shape
health route sets Cache-Control: no-store
health route includes RELEASE_SHA
health route includes host
health route supports deep=1
```

If importing TypeScript from a Node test is annoying, keep the first test file static/read-only. Do not overcomplicate test transpilation in this infrastructure PR.

---

## 8. Implementation phase 2: fix Quipsly Dockerfile

### 8.1 Required Dockerfile properties

The Quipsly Dockerfile must:

```text
use pnpm 10.30.3
install from the monorepo root lockfile
copy only needed package manifests before install for cache reuse
build apps/quipsly, not apps/studio
use Next standalone output
copy .next/static manually
copy public manually if it exists
run node apps/quipsly/server.js
set PORT=8080 and HOSTNAME=0.0.0.0
include a migrator/schema-sync target
not copy .env files
not bake secrets into the image
```

### 8.2 Recommended Dockerfile

Replace `apps/quipsly/Dockerfile` with this structure, adjusting package manifests only after checking which packages are actually required by the lockfile and workspace dependencies.

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-slim AS base

ARG PNPM_VERSION=10.30.3

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma

# App/package manifests needed for workspace install resolution.
# Keep this list synchronized with package.json workspace dependencies.
COPY apps/quipsly/package.json ./apps/quipsly/package.json
COPY apps/quipsly-api/package.json ./apps/quipsly-api/package.json
COPY apps/quiplore/package.json ./apps/quiplore/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/motion-lab/package.json ./apps/motion-lab/package.json
COPY packages/content-studio-domain/package.json ./packages/content-studio-domain/package.json
COPY packages/quipsly-domain/package.json ./packages/quipsly-domain/package.json
COPY packages/studio-domain/package.json ./packages/studio-domain/package.json
COPY packages/worldhub-domain/package.json ./packages/worldhub-domain/package.json
COPY packages/motion-engine/package.json ./packages/motion-engine/package.json

RUN pnpm install --frozen-lockfile

FROM base AS builder

ENV NEXT_TELEMETRY_DISABLED=1
# Build-time placeholder only. Runtime DATABASE_URL must come from Secret Manager.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/high_ground_build
ENV RELEASE_SHA=build

COPY --from=deps /app ./
COPY . .

RUN pnpm --filter quipsly build

FROM node:22-slim AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/quipsly/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/quipsly/.next/static ./apps/quipsly/.next/static

# Copy public only if apps/quipsly/public exists. If it does not exist, either
# create an empty directory in the repo or omit this line after checking.
COPY --from=builder --chown=nextjs:nodejs /app/apps/quipsly/public ./apps/quipsly/public

USER nextjs

EXPOSE 8080

CMD ["node", "apps/quipsly/server.js"]

FROM deps AS migrator

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .

# Default command is target-state migration after the repo is baselined.
# During bridge mode, override this command from the Cloud Run Job to pnpm db:push.
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
```

### 8.3 Public directory issue

Docker `COPY` fails if the source does not exist. Before committing the Dockerfile, check:

```bash
test -d apps/quipsly/public && echo "public exists" || echo "public missing"
```

If `apps/quipsly/public` is missing, use one of these options:

Option A, create an empty keep file:

```bash
mkdir -p apps/quipsly/public
touch apps/quipsly/public/.gitkeep
```

Option B, remove the public copy line for now.

Preferred: create the directory if the app may later serve static assets.

### 8.4 Dockerfile tests

Add static tests asserting:

```text
apps/quipsly/Dockerfile does not contain apps/studio
apps/quipsly/Dockerfile contains pnpm --filter quipsly build
apps/quipsly/Dockerfile contains apps/quipsly/.next/standalone
apps/quipsly/Dockerfile contains apps/quipsly/server.js
apps/quipsly/Dockerfile has runner and migrator targets
apps/quipsly/Dockerfile has DATABASE_URL placeholder only in builder
```

### 8.5 Local Docker validation

Run:

```bash
docker build --file apps/quipsly/Dockerfile --target runner --tag quipsly-local:runner .
docker build --file apps/quipsly/Dockerfile --target migrator --tag quipsly-local:migrator .
```

If this is too slow for a first Codex pass, at least make the tests precise and leave the Docker commands in the handoff checklist.

---

## 9. Implementation phase 3: migration/schema-sync job

### 9.1 Recommendation

Use a dedicated Cloud Run Job for database mutation.

Do not run migrations in:

```text
Cloud Run service startup
Next.js server boot
Docker build
Cloud Build shell with direct DATABASE_URL access
```

Cloud Build should orchestrate the job. The database secret should be read by the Cloud Run Job runtime service account, not by the Cloud Build service account.

### 9.2 Bridge mode vs target mode

Because this repo currently lacks `prisma/migrations/`, implement a variable command:

```bash
RELEASE_MIGRATION_MODE="db-push"        # bridge mode
RELEASE_MIGRATION_MODE="migrate-deploy" # target mode after baseline
```

Bridge command:

```bash
pnpm db:push
```

Target command:

```bash
pnpm exec prisma migrate deploy
```

Rules:

```text
Bridge mode is temporary.
Bridge mode must require human approval for production.
Bridge mode must never use --accept-data-loss in automation.
Target mode becomes default after Prisma baseline is committed and resolved.
```

### 9.3 Add `scripts/release/quipsly-run-migration-job.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_PROJECT:?RELEASE_PROJECT is required}"
: "${RELEASE_REGION:?RELEASE_REGION is required}"
: "${RELEASE_SERVICE:=quipsly}"
: "${RELEASE_MIGRATOR_IMAGE:?RELEASE_MIGRATOR_IMAGE is required}"
: "${RELEASE_MIGRATION_SERVICE_ACCOUNT:?RELEASE_MIGRATION_SERVICE_ACCOUNT is required}"
: "${RELEASE_DATABASE_URL_SECRET:?RELEASE_DATABASE_URL_SECRET is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"

RELEASE_MIGRATION_MODE="${RELEASE_MIGRATION_MODE:-migrate-deploy}"
RELEASE_CLOUDSQL_INSTANCE="${RELEASE_CLOUDSQL_INSTANCE:-}"
RELEASE_MIGRATION_JOB="${RELEASE_MIGRATION_JOB:-${RELEASE_SERVICE}-migrate}"

case "${RELEASE_MIGRATION_MODE}" in
  migrate-deploy)
    JOB_COMMAND="pnpm"
    JOB_ARGS="exec,prisma,migrate,deploy"
    ;;
  db-push)
    echo "WARNING: RELEASE_MIGRATION_MODE=db-push is bridge mode only."
    echo "Production use requires human approval. Do not use --accept-data-loss."
    JOB_COMMAND="pnpm"
    JOB_ARGS="db:push"
    ;;
  skip)
    echo "Skipping migration job because RELEASE_MIGRATION_MODE=skip"
    exit 0
    ;;
  *)
    echo "Unsupported RELEASE_MIGRATION_MODE: ${RELEASE_MIGRATION_MODE}" >&2
    exit 1
    ;;
esac

COMMON_FLAGS=(
  "--project=${RELEASE_PROJECT}"
  "--region=${RELEASE_REGION}"
  "--image=${RELEASE_MIGRATOR_IMAGE}"
  "--service-account=${RELEASE_MIGRATION_SERVICE_ACCOUNT}"
  "--tasks=1"
  "--parallelism=1"
  "--task-timeout=${RELEASE_MIGRATION_TIMEOUT:-10m}"
  "--max-retries=${RELEASE_MIGRATION_MAX_RETRIES:-0}"
  "--set-secrets=DATABASE_URL=${RELEASE_DATABASE_URL_SECRET}:latest"
  "--set-env-vars=RELEASE_SHA=${RELEASE_SHA},RELEASE_MIGRATION_MODE=${RELEASE_MIGRATION_MODE}"
  "--command=${JOB_COMMAND}"
  "--args=${JOB_ARGS}"
)

if [[ -n "${RELEASE_CLOUDSQL_INSTANCE}" ]]; then
  COMMON_FLAGS+=("--set-cloudsql-instances=${RELEASE_CLOUDSQL_INSTANCE}")
fi

if gcloud run jobs describe "${RELEASE_MIGRATION_JOB}" \
  --project "${RELEASE_PROJECT}" \
  --region "${RELEASE_REGION}" >/dev/null 2>&1; then
  gcloud run jobs update "${RELEASE_MIGRATION_JOB}" "${COMMON_FLAGS[@]}"
else
  gcloud run jobs create "${RELEASE_MIGRATION_JOB}" "${COMMON_FLAGS[@]}"
fi

gcloud run jobs execute "${RELEASE_MIGRATION_JOB}" \
  --project "${RELEASE_PROJECT}" \
  --region "${RELEASE_REGION}" \
  --wait
```

Make it executable:

```bash
chmod +x scripts/release/quipsly-run-migration-job.sh
```

### 9.4 Target Prisma baseline plan

This is a separate human-approved operation. Do not sneak it into the release-train PR unless the human asks for it.

Baseline steps for a later migration discipline PR:

```bash
mkdir -p prisma/migrations/0_init
pnpm exec prisma migrate diff \
  --from-empty \
  --to-schema prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql
```

Review `prisma/migrations/0_init/migration.sql` carefully. It represents the current full schema from empty. Test it on a disposable database.

For an existing database that already matches the schema, mark the baseline as applied:

```bash
pnpm exec prisma migrate resolve --applied 0_init
```

For production, run the resolve command from a dedicated Cloud Run Job using the production database secret, not from a random local shell.

After baseline:

```text
new development changes: pnpm exec prisma migrate dev --create-only --name meaningful_name
production deploy job: pnpm exec prisma migrate deploy
```

### 9.5 Migration approval rules

Production migration/schema-sync requires human approval when any of these changed:

```text
prisma/schema.prisma
prisma/migrations/**
prisma.config.ts
package.json
pnpm-lock.yaml
any database access library
any Cloud SQL or DATABASE_URL secret mapping
```

Human approval is mandatory for SQL containing:

```text
DROP
TRUNCATE
ALTER COLUMN TYPE
ALTER COLUMN SET NOT NULL
CREATE UNIQUE INDEX on existing populated table
large table rewrite
backfill of many rows
data copy or dedupe
manual prisma migrate resolve
manual prisma db execute
```

---

## 10. Implementation phase 4: deploy tagged no-traffic preview

### 10.1 Add `scripts/release/quipsly-deploy-preview.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_PROJECT:?RELEASE_PROJECT is required}"
: "${RELEASE_REGION:?RELEASE_REGION is required}"
: "${RELEASE_SERVICE:?RELEASE_SERVICE is required}"
: "${RELEASE_IMAGE:?RELEASE_IMAGE is required}"
: "${RELEASE_TAG:?RELEASE_TAG is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${RELEASE_RUNTIME_SERVICE_ACCOUNT:?RELEASE_RUNTIME_SERVICE_ACCOUNT is required}"
: "${RELEASE_DATABASE_URL_SECRET:?RELEASE_DATABASE_URL_SECRET is required}"

RELEASE_CLOUDSQL_INSTANCE="${RELEASE_CLOUDSQL_INSTANCE:-}"
RELEASE_EXTRA_ENV_VARS="${RELEASE_EXTRA_ENV_VARS:-}"
RELEASE_EXTRA_SECRET_BINDINGS="${RELEASE_EXTRA_SECRET_BINDINGS:-}"

ENV_VARS="NODE_ENV=production,APP_ENV=production,RELEASE_SHA=${RELEASE_SHA},NEXT_PUBLIC_RELEASE_SHA=${RELEASE_SHA}"

if [[ -n "${RELEASE_EXTRA_ENV_VARS}" ]]; then
  ENV_VARS="${ENV_VARS},${RELEASE_EXTRA_ENV_VARS}"
fi

SECRET_BINDINGS="DATABASE_URL=${RELEASE_DATABASE_URL_SECRET}:latest"

if [[ -n "${RELEASE_EXTRA_SECRET_BINDINGS}" ]]; then
  SECRET_BINDINGS="${SECRET_BINDINGS},${RELEASE_EXTRA_SECRET_BINDINGS}"
fi

DEPLOY_ARGS=(
  "run"
  "deploy"
  "${RELEASE_SERVICE}"
  "--project=${RELEASE_PROJECT}"
  "--region=${RELEASE_REGION}"
  "--image=${RELEASE_IMAGE}"
  "--no-traffic"
  "--tag=${RELEASE_TAG}"
  "--service-account=${RELEASE_RUNTIME_SERVICE_ACCOUNT}"
  "--port=8080"
  "--update-env-vars=${ENV_VARS}"
  "--update-secrets=${SECRET_BINDINGS}"
  "--labels=app=quipsly,release-sha=${RELEASE_SHA},release-tag=${RELEASE_TAG}"
  "--quiet"
)

if [[ -n "${RELEASE_CLOUDSQL_INSTANCE}" ]]; then
  DEPLOY_ARGS+=("--add-cloudsql-instances=${RELEASE_CLOUDSQL_INSTANCE}")
fi

gcloud "${DEPLOY_ARGS[@]}"

SERVICE_JSON="$(gcloud run services describe "${RELEASE_SERVICE}" \
  --project "${RELEASE_PROJECT}" \
  --region "${RELEASE_REGION}" \
  --format=json)"

PREVIEW_URL="$(printf '%s' "${SERVICE_JSON}" | jq -r --arg tag "${RELEASE_TAG}" '.status.traffic[]? | select(.tag == $tag) | .url' | head -n 1)"

if [[ -z "${PREVIEW_URL}" || "${PREVIEW_URL}" == "null" ]]; then
  echo "Could not find tagged preview URL for tag ${RELEASE_TAG}" >&2
  exit 1
fi

printf '%s\n' "${PREVIEW_URL}"
```

Make it executable:

```bash
chmod +x scripts/release/quipsly-deploy-preview.sh
```

### 10.2 Preview deployment rules

The preview deploy must:

```text
use --no-traffic
use --tag
set RELEASE_SHA
mount secrets from Secret Manager
use the runtime service account
not use --to-latest
not update traffic
not run smoke tests against the production service URL
print the tagged preview URL
```

### 10.3 Optional secret bindings

Do not reuse `web-*` or `studio-*` secrets for Quipsly unless the human explicitly says this deployment is still sharing the legacy service. Prefer Quipsly-specific secrets:

```text
quipsly-database-url
quipsly-auth-secret
quipsly-google-client-id
quipsly-google-client-secret
quipsly-owner-emails
quipsly-storage-bucket
quipsly-gemini-api-key or provider-specific names, only if needed
```

For MVP, only mount secrets the app actually requires to boot and pass smoke tests. Do not mount every future provider key.

---

## 11. Implementation phase 5: smoke tests with Host headers

### 11.1 Smoke test requirements

Smoke the tagged preview URL before any traffic promotion.

Required checks:

```text
preview URL /api/healthz returns ok
preview URL /api/healthz includes releaseSha equal to candidate SHA
preview URL /api/healthz sees Host header for quipsly.com
preview URL /api/healthz sees Host header for nest.quipsly.com
preview URL /api/healthz?deep=1 verifies DB connectivity or reports not_configured when expected
preview URL / returns a non-5xx response
studio URL is checked if configured
HighGroundOdyssey.com is checked only if configured as applicable
```

Host-header tests matter because host-based routing, auth callbacks, tenant behavior, canonical URLs, redirects, cookies, and middleware can differ by host. The default `run.app` URL passing health is necessary but not sufficient.

### 11.2 Add `scripts/release/quipsly-smoke-preview.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_PREVIEW_URL:?RELEASE_PREVIEW_URL is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"

RELEASE_HOSTS="${RELEASE_HOSTS:-quipsly.com,nest.quipsly.com}"
RELEASE_OPTIONAL_HOSTS="${RELEASE_OPTIONAL_HOSTS:-}"
RELEASE_STUDIO_URL="${RELEASE_STUDIO_URL:-}"
RELEASE_USE_ID_TOKEN="${RELEASE_USE_ID_TOKEN:-0}"

AUTH_ARGS=()

if [[ "${RELEASE_USE_ID_TOKEN}" == "1" ]]; then
  TOKEN="$(gcloud auth print-identity-token)"
  AUTH_ARGS=(-H "Authorization: Bearer ${TOKEN}")
fi

curl_text() {
  local url="$1"
  shift

  curl --fail --show-error --silent \
    --retry 3 \
    --retry-delay 2 \
    --connect-timeout 5 \
    --max-time 25 \
    "${AUTH_ARGS[@]}" \
    "$@" \
    "${url}"
}

smoke_json_health() {
  local url="$1"
  shift

  local body
  body="$(curl_text "${url}" "$@")"

  printf '%s' "${body}" | jq -e '.ok == true' >/dev/null
  printf '%s' "${body}" | jq -e --arg sha "${RELEASE_SHA}" '.releaseSha == $sha' >/dev/null
}

smoke_host_health() {
  local host="$1"
  local body

  echo "Smoke health Host=${host} via ${RELEASE_PREVIEW_URL}"
  body="$(curl_text "${RELEASE_PREVIEW_URL}/api/healthz?deep=1" -H "Host: ${host}")"

  printf '%s' "${body}" | jq -e '.ok == true' >/dev/null
  printf '%s' "${body}" | jq -e --arg sha "${RELEASE_SHA}" '.releaseSha == $sha' >/dev/null
  printf '%s' "${body}" | jq -e --arg host "${host}" '.host == $host' >/dev/null

  # If db is present, it should be ok. not_configured is acceptable only for
  # non-DB preview environments. Production/beta should set RELEASE_REQUIRE_DB=1.
  if [[ "${RELEASE_REQUIRE_DB:-1}" == "1" ]]; then
    printf '%s' "${body}" | jq -e '.db == "ok"' >/dev/null
  fi
}

echo "Smoke default preview health"
smoke_json_health "${RELEASE_PREVIEW_URL}/api/healthz"

echo "Smoke default preview home"
curl_text "${RELEASE_PREVIEW_URL}/" >/dev/null

IFS=',' read -r -a REQUIRED_HOSTS <<< "${RELEASE_HOSTS}"
for host in "${REQUIRED_HOSTS[@]}"; do
  host="$(printf '%s' "${host}" | xargs)"
  [[ -z "${host}" ]] && continue
  smoke_host_health "${host}"
done

if [[ -n "${RELEASE_OPTIONAL_HOSTS}" ]]; then
  IFS=',' read -r -a OPTIONAL_HOSTS <<< "${RELEASE_OPTIONAL_HOSTS}"
  for host in "${OPTIONAL_HOSTS[@]}"; do
    host="$(printf '%s' "${host}" | xargs)"
    [[ -z "${host}" ]] && continue
    echo "Optional smoke Host=${host}"
    smoke_host_health "${host}"
  done
fi

if [[ -n "${RELEASE_STUDIO_URL}" ]]; then
  echo "Smoke configured studio URL: ${RELEASE_STUDIO_URL}"
  smoke_json_health "${RELEASE_STUDIO_URL}/api/healthz"
fi

echo "Preview smoke passed: ${RELEASE_PREVIEW_URL}"
```

Make it executable:

```bash
chmod +x scripts/release/quipsly-smoke-preview.sh
```

### 11.3 HighGroundOdyssey.com handling

The user specifically asked to include `HighGroundOdyssey.com` if applicable.

Implementation rule:

```text
Do not include HighGroundOdyssey.com in required Quipsly smoke tests by default.
Include it through RELEASE_OPTIONAL_HOSTS only if the operator confirms that hostname is intentionally routed through the Quipsly service or the same Next.js app handles it.
```

Recommended env when applicable:

```bash
export RELEASE_OPTIONAL_HOSTS="highgroundodyssey.com,HighGroundOdyssey.com"
```

HTTP hostnames are case-insensitive, but the app may read the raw header. Testing both is cheap if the user cares about the exact casing.

### 11.4 Studio URL handling

The request mentions “studio Cloud Run URL.” There are two possible meanings:

```text
A. Quipsly itself is the private Studio app currently served by Cloud Run.
B. Studio is a separate Cloud Run service that should be smoked as part of cross-surface release confidence.
```

Do not guess. Make `RELEASE_STUDIO_URL` optional. If configured, smoke it. If not configured, skip it and print a clear message.

---

## 12. Implementation phase 6: promotion and rollback scripts

### 12.1 Add `scripts/release/quipsly-promote.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_PROJECT:?RELEASE_PROJECT is required}"
: "${RELEASE_REGION:?RELEASE_REGION is required}"
: "${RELEASE_SERVICE:?RELEASE_SERVICE is required}"
: "${RELEASE_TAG:?RELEASE_TAG is required}"
: "${RELEASE_TRAFFIC_PERCENT:?RELEASE_TRAFFIC_PERCENT is required}"

case "${RELEASE_TRAFFIC_PERCENT}" in
  1|5|10|25|50|100) ;;
  *)
    echo "RELEASE_TRAFFIC_PERCENT must be one of: 1, 5, 10, 25, 50, 100" >&2
    exit 1
    ;;
esac

echo "Promoting ${RELEASE_SERVICE} tag ${RELEASE_TAG} to ${RELEASE_TRAFFIC_PERCENT}%"

gcloud run services update-traffic "${RELEASE_SERVICE}" \
  --project "${RELEASE_PROJECT}" \
  --region "${RELEASE_REGION}" \
  --to-tags "${RELEASE_TAG}=${RELEASE_TRAFFIC_PERCENT}"
```

Make it executable:

```bash
chmod +x scripts/release/quipsly-promote.sh
```

### 12.2 Add `scripts/release/quipsly-rollback.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_PROJECT:?RELEASE_PROJECT is required}"
: "${RELEASE_REGION:?RELEASE_REGION is required}"
: "${RELEASE_SERVICE:?RELEASE_SERVICE is required}"

if [[ -z "${RELEASE_ROLLBACK_REVISION:-}" && -z "${RELEASE_ROLLBACK_TAG:-}" ]]; then
  echo "Set RELEASE_ROLLBACK_REVISION or RELEASE_ROLLBACK_TAG." >&2
  echo "Current traffic:" >&2
  gcloud run services describe "${RELEASE_SERVICE}" \
    --project "${RELEASE_PROJECT}" \
    --region "${RELEASE_REGION}" \
    --format='table(status.traffic.revisionName,status.traffic.tag,status.traffic.percent,status.traffic.url)' >&2
  exit 1
fi

if [[ -n "${RELEASE_ROLLBACK_REVISION:-}" ]]; then
  gcloud run services update-traffic "${RELEASE_SERVICE}" \
    --project "${RELEASE_PROJECT}" \
    --region "${RELEASE_REGION}" \
    --to-revisions "${RELEASE_ROLLBACK_REVISION}=100"
  exit 0
fi

if [[ -n "${RELEASE_ROLLBACK_TAG:-}" ]]; then
  gcloud run services update-traffic "${RELEASE_SERVICE}" \
    --project "${RELEASE_PROJECT}" \
    --region "${RELEASE_REGION}" \
    --to-tags "${RELEASE_ROLLBACK_TAG}=100"
  exit 0
fi
```

Make it executable:

```bash
chmod +x scripts/release/quipsly-rollback.sh
```

### 12.3 Add `scripts/release/quipsly-cleanup-preview-tags.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_PROJECT:?RELEASE_PROJECT is required}"
: "${RELEASE_REGION:?RELEASE_REGION is required}"
: "${RELEASE_SERVICE:?RELEASE_SERVICE is required}"
: "${RELEASE_REMOVE_TAGS:?RELEASE_REMOVE_TAGS is required, comma-separated}"

gcloud run services update-traffic "${RELEASE_SERVICE}" \
  --project "${RELEASE_PROJECT}" \
  --region "${RELEASE_REGION}" \
  --remove-tags "${RELEASE_REMOVE_TAGS}"
```

Tags are useful, but stale tags are tiny signposts to old castles. Keep a few recent ones, remove the rest.

---

## 13. Implementation phase 7: Cloud Build YAMLs

### 13.1 `cloudbuild.quipsly.build.yaml`

This config builds and pushes images only. It should be safe to run automatically on Quipsly app changes because it does not mutate Cloud Run, secrets, IAM, DNS, or databases.

```yaml
substitutions:
  _REGION: us-central1
  _ARTIFACT_REPOSITORY: high-ground-studio
  _APP_IMAGE_NAME: quipsly
  _MIGRATOR_IMAGE_NAME: quipsly-migrator
  _IMAGE_TAG: $COMMIT_SHA

options:
  logging: CLOUD_LOGGING_ONLY
  substitutionOption: ALLOW_LOOSE

steps:
  - id: build-quipsly-runner-image
    name: gcr.io/cloud-builders/docker
    args:
      - build
      - --file
      - apps/quipsly/Dockerfile
      - --target
      - runner
      - --tag
      - ${_REGION}-docker.pkg.dev/$PROJECT_ID/${_ARTIFACT_REPOSITORY}/${_APP_IMAGE_NAME}:${_IMAGE_TAG}
      - .

  - id: build-quipsly-migrator-image
    name: gcr.io/cloud-builders/docker
    args:
      - build
      - --file
      - apps/quipsly/Dockerfile
      - --target
      - migrator
      - --tag
      - ${_REGION}-docker.pkg.dev/$PROJECT_ID/${_ARTIFACT_REPOSITORY}/${_MIGRATOR_IMAGE_NAME}:${_IMAGE_TAG}
      - .

  - id: push-quipsly-runner-image
    name: gcr.io/cloud-builders/docker
    args:
      - push
      - ${_REGION}-docker.pkg.dev/$PROJECT_ID/${_ARTIFACT_REPOSITORY}/${_APP_IMAGE_NAME}:${_IMAGE_TAG}

  - id: push-quipsly-migrator-image
    name: gcr.io/cloud-builders/docker
    args:
      - push
      - ${_REGION}-docker.pkg.dev/$PROJECT_ID/${_ARTIFACT_REPOSITORY}/${_MIGRATOR_IMAGE_NAME}:${_IMAGE_TAG}

images:
  - ${_REGION}-docker.pkg.dev/$PROJECT_ID/${_ARTIFACT_REPOSITORY}/${_APP_IMAGE_NAME}:${_IMAGE_TAG}
  - ${_REGION}-docker.pkg.dev/$PROJECT_ID/${_ARTIFACT_REPOSITORY}/${_MIGRATOR_IMAGE_NAME}:${_IMAGE_TAG}
```

### 13.2 `cloudbuild.quipsly.release.yaml`

This config assumes images already exist. It runs migration/schema-sync, deploys preview with no traffic, and smokes the preview. It does not promote traffic.

```yaml
substitutions:
  _REGION: us-central1
  _ARTIFACT_REPOSITORY: high-ground-studio
  _SERVICE: quipsly
  _APP_IMAGE_NAME: quipsly
  _MIGRATOR_IMAGE_NAME: quipsly-migrator
  _IMAGE_TAG: $COMMIT_SHA
  _RUNTIME_SERVICE_ACCOUNT: quipsly-run@$PROJECT_ID.iam.gserviceaccount.com
  _MIGRATION_SERVICE_ACCOUNT: quipsly-migrate@$PROJECT_ID.iam.gserviceaccount.com
  _DATABASE_URL_SECRET: quipsly-database-url
  _CLOUDSQL_INSTANCE: ""
  _MIGRATION_MODE: migrate-deploy
  _HOSTS: quipsly.com,nest.quipsly.com
  _OPTIONAL_HOSTS: ""
  _STUDIO_URL: ""
  _REQUIRE_DB: "1"

options:
  logging: CLOUD_LOGGING_ONLY
  substitutionOption: ALLOW_LOOSE

steps:
  - id: install-script-tools
    name: gcr.io/google.com/cloudsdktool/cloud-sdk:slim
    entrypoint: bash
    args:
      - -ceu
      - |
        apt-get update >/dev/null
        apt-get install -y jq curl >/dev/null

  - id: run-quipsly-migration-job
    name: gcr.io/google.com/cloudsdktool/cloud-sdk:slim
    entrypoint: bash
    env:
      - RELEASE_PROJECT=$PROJECT_ID
      - RELEASE_REGION=${_REGION}
      - RELEASE_SERVICE=${_SERVICE}
      - RELEASE_SHA=$COMMIT_SHA
      - RELEASE_MIGRATOR_IMAGE=${_REGION}-docker.pkg.dev/$PROJECT_ID/${_ARTIFACT_REPOSITORY}/${_MIGRATOR_IMAGE_NAME}:${_IMAGE_TAG}
      - RELEASE_MIGRATION_SERVICE_ACCOUNT=${_MIGRATION_SERVICE_ACCOUNT}
      - RELEASE_DATABASE_URL_SECRET=${_DATABASE_URL_SECRET}
      - RELEASE_CLOUDSQL_INSTANCE=${_CLOUDSQL_INSTANCE}
      - RELEASE_MIGRATION_MODE=${_MIGRATION_MODE}
    args:
      - -ceu
      - |
        ./scripts/release/quipsly-run-migration-job.sh

  - id: deploy-quipsly-preview
    name: gcr.io/google.com/cloudsdktool/cloud-sdk:slim
    entrypoint: bash
    env:
      - RELEASE_PROJECT=$PROJECT_ID
      - RELEASE_REGION=${_REGION}
      - RELEASE_SERVICE=${_SERVICE}
      - RELEASE_SHA=$COMMIT_SHA
      - RELEASE_TAG=beta-${SHORT_SHA}
      - RELEASE_IMAGE=${_REGION}-docker.pkg.dev/$PROJECT_ID/${_ARTIFACT_REPOSITORY}/${_APP_IMAGE_NAME}:${_IMAGE_TAG}
      - RELEASE_RUNTIME_SERVICE_ACCOUNT=${_RUNTIME_SERVICE_ACCOUNT}
      - RELEASE_DATABASE_URL_SECRET=${_DATABASE_URL_SECRET}
      - RELEASE_CLOUDSQL_INSTANCE=${_CLOUDSQL_INSTANCE}
    args:
      - -ceu
      - |
        apt-get update >/dev/null
        apt-get install -y jq >/dev/null
        ./scripts/release/quipsly-deploy-preview.sh | tee /workspace/quipsly-preview-url.txt

  - id: smoke-quipsly-preview
    name: gcr.io/google.com/cloudsdktool/cloud-sdk:slim
    entrypoint: bash
    env:
      - RELEASE_SHA=$COMMIT_SHA
      - RELEASE_HOSTS=${_HOSTS}
      - RELEASE_OPTIONAL_HOSTS=${_OPTIONAL_HOSTS}
      - RELEASE_STUDIO_URL=${_STUDIO_URL}
      - RELEASE_REQUIRE_DB=${_REQUIRE_DB}
    args:
      - -ceu
      - |
        apt-get update >/dev/null
        apt-get install -y jq curl >/dev/null
        export RELEASE_PREVIEW_URL="$(tail -n 1 /workspace/quipsly-preview-url.txt)"
        ./scripts/release/quipsly-smoke-preview.sh
```

Important: Cloud Build substitutions do not always behave like Bash variables in all fields. After adding the YAML, run a test build in a non-production project or with `RELEASE_MIGRATION_MODE=skip` and adjust syntax if Cloud Build rejects a substitution. Do not discover syntax errors during production release.

### 13.3 `cloudbuild.quipsly.promote.yaml`

This config only moves traffic. It should always require human approval for production.

```yaml
substitutions:
  _REGION: us-central1
  _SERVICE: quipsly
  _TAG: ""
  _TRAFFIC_PERCENT: "100"

options:
  logging: CLOUD_LOGGING_ONLY
  substitutionOption: ALLOW_LOOSE

steps:
  - id: promote-quipsly-tag
    name: gcr.io/google.com/cloudsdktool/cloud-sdk:slim
    entrypoint: bash
    env:
      - RELEASE_PROJECT=$PROJECT_ID
      - RELEASE_REGION=${_REGION}
      - RELEASE_SERVICE=${_SERVICE}
      - RELEASE_TAG=${_TAG}
      - RELEASE_TRAFFIC_PERCENT=${_TRAFFIC_PERCENT}
    args:
      - -ceu
      - |
        test -n "${RELEASE_TAG}"
        ./scripts/release/quipsly-promote.sh
```

Example manual invocation:

```bash
gcloud builds submit \
  --config cloudbuild.quipsly.promote.yaml \
  --substitutions=_SERVICE=quipsly,_TAG=beta-abc123,_TRAFFIC_PERCENT=10 \
  .
```

---

## 14. Implementation phase 8: preflight and static tests

### 14.1 Add `scripts/quipsly-cloud-run-release-train.test.mjs`

This should be a static test suite. Keep it fast and local.

Recommended contents:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(path, "utf8");
}

test("quipsly Dockerfile targets apps/quipsly and not stale apps/studio", () => {
  const body = read("apps/quipsly/Dockerfile");

  assert.match(body, /FROM node:22-slim AS base/);
  assert.match(body, /--target/); // optional if YAML owns target use
  assert.match(body, /pnpm --filter quipsly build/);
  assert.match(body, /apps\/quipsly\/\.next\/standalone/);
  assert.match(body, /apps\/quipsly\/server\.js/);
  assert.match(body, /FROM deps AS migrator/);
  assert.doesNotMatch(body, /apps\/studio/);
  assert.doesNotMatch(body, /--accept-data-loss/);
});

test("quipsly healthz route and release-health helper exist", () => {
  assert.equal(existsSync("apps/quipsly/src/app/api/healthz/route.ts"), true);
  assert.equal(existsSync("apps/quipsly/src/lib/release-health.ts"), true);

  const helper = read("apps/quipsly/src/lib/release-health.ts");
  const route = read("apps/quipsly/src/app/api/healthz/route.ts");

  assert.match(helper, /RELEASE_SHA/);
  assert.match(helper, /select 1/);
  assert.match(route, /Cache-Control/);
  assert.match(route, /no-store/);
  assert.match(route, /deep/);
  assert.doesNotMatch(helper, /DATABASE_URL.*return/);
});

test("release scripts enforce no-traffic preview, tag promotion, and rollback", () => {
  const deploy = read("scripts/release/quipsly-deploy-preview.sh");
  const smoke = read("scripts/release/quipsly-smoke-preview.sh");
  const promote = read("scripts/release/quipsly-promote.sh");
  const rollback = read("scripts/release/quipsly-rollback.sh");
  const migrate = read("scripts/release/quipsly-run-migration-job.sh");

  assert.match(deploy, /--no-traffic/);
  assert.match(deploy, /--tag=/);
  assert.match(deploy, /RELEASE_SHA/);
  assert.doesNotMatch(deploy, /--to-latest/);
  assert.doesNotMatch(deploy, /update-traffic/);

  assert.match(smoke, /Host:/);
  assert.match(smoke, /quipsly\.com/);
  assert.match(smoke, /nest\.quipsly\.com/);
  assert.match(smoke, /releaseSha/);

  assert.match(promote, /update-traffic/);
  assert.match(promote, /--to-tags/);
  assert.doesNotMatch(promote, /--to-latest/);

  assert.match(rollback, /--to-revisions/);
  assert.match(rollback, /--to-tags/);

  assert.match(migrate, /gcloud run jobs execute/);
  assert.match(migrate, /--wait/);
  assert.match(migrate, /migrate-deploy/);
  assert.match(migrate, /db-push/);
  assert.doesNotMatch(migrate, /--accept-data-loss/);
});

test("Cloud Build configs separate build, release, and promote", () => {
  const build = read("cloudbuild.quipsly.build.yaml");
  const release = read("cloudbuild.quipsly.release.yaml");
  const promote = read("cloudbuild.quipsly.promote.yaml");

  assert.match(build, /apps\/quipsly\/Dockerfile/);
  assert.match(build, /--target/);
  assert.doesNotMatch(build, /run deploy/);
  assert.doesNotMatch(build, /update-traffic/);

  assert.match(release, /quipsly-run-migration-job\.sh/);
  assert.match(release, /quipsly-deploy-preview\.sh/);
  assert.match(release, /quipsly-smoke-preview\.sh/);
  assert.doesNotMatch(release, /quipsly-promote\.sh/);
  assert.doesNotMatch(release, /update-traffic/);

  assert.match(promote, /quipsly-promote\.sh/);
  assert.match(promote, /_TRAFFIC_PERCENT/);
});
```

Adjust the `--target` assertion if it is awkward. The key is to test that Dockerfile/YAML support the separate runner/migrator images.

### 14.2 Add `scripts/quipsly-cloud-run-preflight.mjs`

Make this read-only like the existing `web-cloud-run-preflight.mjs`.

It should check:

```text
apps/quipsly/Dockerfile exists
apps/quipsly/Dockerfile does not reference apps/studio
cloudbuild.quipsly.build.yaml exists
cloudbuild.quipsly.release.yaml exists
cloudbuild.quipsly.promote.yaml exists
healthz route exists
release scripts exist and are executable
.dockerignore ignores .env and .env.*
package.json has quipsly release test/preflight scripts
gcloud/docker/pnpm availability, if installed
optional cloud resource reads only, if gcloud project configured
```

Do not let preflight mutate anything. Its output should explicitly say it does not deploy, create IAM, mutate secrets, run Cloud Build, change DNS, or touch databases.

---

## 15. Implementation phase 9: root package scripts

Add these scripts to root `package.json`:

```json
{
  "scripts": {
    "quipsly:cloudrun:preflight": "node scripts/quipsly-cloud-run-preflight.mjs",
    "quipsly:cloudrun:release:test": "node --test scripts/quipsly-cloud-run-release-train.test.mjs",
    "quipsly:cloudbuild:image": "gcloud builds submit --config cloudbuild.quipsly.build.yaml .",
    "quipsly:cloudbuild:image:sha": "gcloud builds submit --config cloudbuild.quipsly.build.yaml --substitutions=_IMAGE_TAG=$(git rev-parse --short HEAD) .",
    "quipsly:cloudbuild:release:sha": "gcloud builds submit --config cloudbuild.quipsly.release.yaml --substitutions=_IMAGE_TAG=$(git rev-parse --short HEAD) ."
  }
}
```

Do not add `quipsly:deploy` if it hides migration, preview, smoke, and promotion behind one command. Convenience should not become a trapdoor.

---

## 16. Implementation phase 10: GitHub Actions safety

The current `.github/workflows/deploy-cloud-run.yml` deploys on push to `main` and maps `apps/quipsly` changes into the `studio` deploy path. That is not compatible with the new release train.

Recommended MVP action:

1. Add a new workflow for Quipsly release-train build only, or rely on Cloud Build triggers.
2. Modify the existing workflow so `apps/quipsly` changes do not auto-trigger the old `studio` direct deploy path.
3. Leave existing `web` behavior untouched unless the human explicitly approves broader deployment-policy changes.

### 16.1 Minimal safe patch to old workflow

In `.github/workflows/deploy-cloud-run.yml`, change the `studio_re` so `apps/quipsly/` is not auto-deployed through `studio`:

Current shape:

```bash
studio_re='^(apps/quipsly/|packages/|prisma/|package.json$|pnpm-lock.yaml$|pnpm-workspace.yaml$|cloudbuild\.studio(\.deploy)?\.yaml$|scripts/studio-cloud-run|\.dockerignore$)'
```

Safer temporary shape:

```bash
studio_re='^(cloudbuild\.studio(\.deploy)?\.yaml$|scripts/studio-cloud-run|\.dockerignore$)'
```

But this could unintentionally stop desired studio deploys if the repo still treats `apps/quipsly` as Studio. Therefore only make this patch if the human confirms the new release train replaces the old `studio` deploy behavior for `apps/quipsly`.

### 16.2 Better new workflow

Add `.github/workflows/quipsly-cloud-run-build.yml` as build-only if GitHub Actions remains the entrypoint:

```yaml
name: Quipsly Cloud Run Build

on:
  workflow_dispatch:
  push:
    branches:
      - main
    paths:
      - apps/quipsly/**
      - packages/**
      - prisma/**
      - package.json
      - pnpm-lock.yaml
      - pnpm-workspace.yaml
      - cloudbuild.quipsly.build.yaml
      - apps/quipsly/Dockerfile
      - .dockerignore

concurrency:
  group: quipsly-cloud-run-build-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: read
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WIF_PROVIDER }}
          service_account: ${{ secrets.GCP_BUILD_SERVICE_ACCOUNT }}
      - uses: google-github-actions/setup-gcloud@v2
      - run: |
          gcloud builds submit \
            --project high-ground-odyssey \
            --config cloudbuild.quipsly.build.yaml \
            --substitutions=_IMAGE_TAG=${{ github.sha }} \
            .
```

Do not add auto-release or auto-promote workflow for production.

---

## 17. IAM and cloud resource plan

Local Codex should document these commands, but should not run them unless explicitly instructed by the human operator.

### 17.1 Service accounts

Recommended service accounts:

```bash
gcloud iam service-accounts create quipsly-build \
  --project high-ground-odyssey \
  --display-name "Quipsly build service account"

gcloud iam service-accounts create quipsly-run \
  --project high-ground-odyssey \
  --display-name "Quipsly Cloud Run runtime"

gcloud iam service-accounts create quipsly-migrate \
  --project high-ground-odyssey \
  --display-name "Quipsly migration job runtime"

gcloud iam service-accounts create quipsly-promote \
  --project high-ground-odyssey \
  --display-name "Quipsly traffic promotion"
```

### 17.2 Suggested roles

Use the narrowest roles feasible. Exact role choices may depend on existing project policy.

Build service account:

```text
Artifact Registry Writer on the repository
Cloud Run Developer or Admin only if it will run release deploys
Service Account User on quipsly-run and quipsly-migrate only if it deploys services/jobs
Logs Writer
```

Runtime service account:

```text
Secret Manager Secret Accessor on only Quipsly runtime secrets
Cloud SQL Client if using Cloud SQL
Artifact Registry Reader if required by project policy
Cloud Storage access only for specific Quipsly buckets if needed
```

Migration service account:

```text
Secret Manager Secret Accessor on Quipsly database secret
Cloud SQL Client if using Cloud SQL
Artifact Registry Reader if required
No broad app provider secrets unless migration code actually needs them
```

Promotion service account:

```text
Cloud Run traffic update permissions for the Quipsly service
No Secret Manager access
No database access
No Artifact Registry write access
```

### 17.3 Secrets

Create Quipsly-specific secrets. Do not reuse `web-*` or `studio-*` by default.

Recommended starting set:

```text
quipsly-database-url
quipsly-auth-secret
quipsly-google-client-id
quipsly-google-client-secret
quipsly-owner-emails
```

Only add provider secrets the app really needs:

```text
quipsly-storage-bucket
quipsly-google-cloud-storage-credentials, only if not using workload identity
quipsly-gemini-api-key or provider-specific key, only if needed
quipsly-next-server-actions-encryption-key, if server actions need stable keying
```

Never put these in:

```text
Docker build args
NEXT_PUBLIC_*
next.config.mjs env
Cloud Build substitutions
committed .env files
```

---

## 18. Release operation runbook

Add this in `docs/runbooks/quipsly-cloud-run-release-train.md` after implementation.

### 18.1 Build image

```bash
export PROJECT_ID="high-ground-odyssey"
export REGION="us-central1"
export IMAGE_TAG="$(git rev-parse --short HEAD)"

gcloud builds submit \
  --project "${PROJECT_ID}" \
  --config cloudbuild.quipsly.build.yaml \
  --substitutions=_REGION=${REGION},_IMAGE_TAG=${IMAGE_TAG} \
  .
```

This builds and pushes:

```text
us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/quipsly:${IMAGE_TAG}
us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/quipsly-migrator:${IMAGE_TAG}
```

### 18.2 Release preview

For current bridge mode:

```bash
gcloud builds submit \
  --project high-ground-odyssey \
  --config cloudbuild.quipsly.release.yaml \
  --substitutions=_IMAGE_TAG=$(git rev-parse --short HEAD),_MIGRATION_MODE=db-push \
  .
```

For target mode after Prisma baseline:

```bash
gcloud builds submit \
  --project high-ground-odyssey \
  --config cloudbuild.quipsly.release.yaml \
  --substitutions=_IMAGE_TAG=$(git rev-parse --short HEAD),_MIGRATION_MODE=migrate-deploy \
  .
```

This should:

```text
run the migration/schema-sync job
create a tagged no-traffic Cloud Run revision
smoke test the tagged preview URL
stop without moving production traffic
```

### 18.3 Promote 1%, 10%, 50%, 100%

```bash
gcloud builds submit \
  --project high-ground-odyssey \
  --config cloudbuild.quipsly.promote.yaml \
  --substitutions=_SERVICE=quipsly,_TAG=beta-abc123,_TRAFFIC_PERCENT=1 \
  .
```

Repeat with:

```text
_TRAFFIC_PERCENT=10
_TRAFFIC_PERCENT=50
_TRAFFIC_PERCENT=100
```

Production promotion should require human approval.

### 18.4 Rollback

List traffic and revisions:

```bash
gcloud run services describe quipsly \
  --project high-ground-odyssey \
  --region us-central1 \
  --format='table(status.traffic.revisionName,status.traffic.tag,status.traffic.percent,status.traffic.url)'

gcloud run revisions list \
  --project high-ground-odyssey \
  --region us-central1 \
  --service quipsly
```

Rollback to previous revision:

```bash
RELEASE_PROJECT=high-ground-odyssey \
RELEASE_REGION=us-central1 \
RELEASE_SERVICE=quipsly \
RELEASE_ROLLBACK_REVISION=quipsly-00042-good \
./scripts/release/quipsly-rollback.sh
```

Important: Cloud Run rollback does not roll back database schema changes. If a database mutation was destructive or incompatible, do not assume traffic rollback is enough.

---

## 19. Human approval gates

These require human approval before production execution.

### 19.1 Always human-approved

```text
Production traffic promotion above 0%
Production migration/schema-sync job
Any `db-push` bridge-mode production run
Prisma baseline creation or migrate resolve in production
Any Secret Manager version change for database/auth/encryption/provider secrets
Any IAM role grant to build/runtime/migration/promotion accounts
Any Cloud Run ingress/auth/public access change
Any custom domain or DNS change
Any change to .github/workflows/deploy-cloud-run.yml push-to-main behavior
```

### 19.2 Human-approved when detected in code

```text
prisma/schema.prisma changes
prisma/migrations/** changes
Cloud SQL instance binding changes
DATABASE_URL secret mapping changes
Dockerfile changes that affect runtime user, command, port, install, or build env
Cloud Build release YAML changes
release scripts that touch deploy, promote, rollback, secrets, or jobs
NextAuth/Auth URL or host trust changes
```

### 19.3 Never automated without explicit incident procedure

```text
prisma migrate reset
prisma db push --accept-data-loss
manual DROP/TRUNCATE SQL
manual data repair SQL
prisma migrate resolve in production
production DB restore
production secret rotation for auth/session/encryption keys
```

---

## 20. Risks and anti-patterns to avoid

### 20.1 Startup migrations

Do not run Prisma migration or `db push` from Next.js startup. Cloud Run can scale multiple instances. Startup migration couples app availability to schema mutation and makes rollback messy.

### 20.2 Cloud Build direct database mutation

Do not give the Cloud Build service account broad access to production database secrets just to run Prisma. Let Cloud Build invoke a Cloud Run Job. Let the job identity access the database secret.

### 20.3 Direct deploy to 100%

Do not copy the current `web-cloud-run-deploy.mjs` behavior into Quipsly. Preview first. Smoke first. Promote later.

### 20.4 Mutable `latest` release source

Do not promote `latest`. Use commit SHA tags or image digests.

### 20.5 Secrets in build

Do not use production secrets in Docker build args or `NEXT_PUBLIC_*`. Next public variables are public. Build logs are not a secret safe.

### 20.6 Leaving old preview tags forever

Preview tags are excellent, but old tags clutter traffic state and can carry cost if revision-level min instances are used. Add cleanup.

### 20.7 Treating `db push` as the destination

`db push` is the repo’s current bridge, not the final migration discipline. The target state is committed Prisma migrations and `migrate deploy` from a Cloud Run Job.

---

## 21. Open questions for the human/operator

Codex should surface these in the PR or final handoff, not block all implementation unless the answer affects file paths or safety.

1. Which app actually serves `quipsly.com` today: `apps/quipsly`, `apps/quipsly-api`, `apps/quiplore`, or something else?
2. What is the current Cloud Run service name: `quipsly`, `studio`, `quipsly-api`, or another name?
3. Is `nest.quipsly.com` the same Cloud Run service, a route inside Quipsly, or a separate service?
4. Is `HighGroundOdyssey.com` intentionally routed through the Quipsly service, or should it remain only an optional smoke host?
5. Is the studio Cloud Run URL a separate service to smoke, or is `apps/quipsly` the renamed Studio service?
6. Is Quipsly’s production database Cloud SQL, Neon, or not yet provisioned?
7. What should the Quipsly production database secret be named: `quipsly-database-url` or `quipsly-cloudsql-database-url`?
8. Should the first release use `db-push` bridge mode, or should Prisma baselining happen first?
9. Should GitHub Actions remain in the deploy chain, or should Cloud Build triggers become the primary release system?
10. Which human should approve production promotion and production migration jobs?

---

## 22. Suggested PR breakdown

This can be one big PR if needed, but safer review is three PRs.

### PR 1: Quipsly release train scaffolding, no cloud mutation

Includes:

```text
healthz endpoint
release health helper
Dockerfile fix
release scripts
Cloud Build YAMLs
static tests
preflight
runbook docs
package scripts
```

Does not include:

```text
GitHub Actions push behavior changes
Prisma baseline
production IAM changes
production secret changes
production release
```

### PR 2: Automation policy cleanup

Includes:

```text
safe build-only GitHub workflow or Cloud Build trigger docs
remove apps/quipsly from old studio direct deploy trigger, if approved
Cloud Build trigger setup docs
approval gate docs
```

### PR 3: Prisma migration discipline

Includes:

```text
baseline migration proposal
reviewed baseline SQL
staging validation notes
production migrate resolve runbook
switch RELEASE_MIGRATION_MODE default from db-push to migrate-deploy
```

---

## 23. Acceptance checklist

Before marking the Codex implementation complete, verify:

```bash
git diff --check
pnpm --filter quipsly typecheck
pnpm --filter quipsly build
pnpm quipsly:cloudrun:release:test
pnpm quipsly:cloudrun:preflight
```

Docker build checks:

```bash
docker build --file apps/quipsly/Dockerfile --target runner --tag quipsly-local:runner .
docker build --file apps/quipsly/Dockerfile --target migrator --tag quipsly-local:migrator .
```

Static review checks:

```text
apps/quipsly/Dockerfile no longer references apps/studio
cloudbuild.quipsly.build.yaml does not deploy
cloudbuild.quipsly.release.yaml does not promote traffic
cloudbuild.quipsly.promote.yaml only moves traffic
release scripts require explicit env vars
release scripts do not contain --to-latest
release scripts do not contain --accept-data-loss
healthz does not leak secrets
smoke script tests Host headers
runbook documents rollback limitations
```

Staging/preview checks, operator-run only:

```text
Cloud Build build succeeds
migration/schema-sync job succeeds in staging
no-traffic tagged revision is created
preview URL is printed
smoke tests pass for quipsly.com and nest.quipsly.com Host headers
no production traffic moves during release build
promotion requires separate command/approval
rollback command is documented and tested on staging
```

---

## 24. Final implementation notes for local Codex

This task is about separation of concerns. Keep each action in its own box:

```text
build:      create images
migrate:    mutate schema through Cloud Run Job
preview:    deploy candidate revision with 0% traffic
test:       smoke tagged URL and Host-header behavior
promote:    move traffic explicitly
rollback:   move traffic back explicitly
cleanup:    remove stale tags/images later
```

Do not create a single magic command that does everything. Magic commands are how goblins get root access.

The most important repo-specific fixes are:

```text
1. Fix apps/quipsly/Dockerfile so it targets apps/quipsly, not apps/studio.
2. Add release-aware healthz with release SHA and Host echo.
3. Add Cloud Run no-traffic/tag deploy script.
4. Add Host-header smoke tests.
5. Add Cloud Run Job migration/schema-sync script with db-push bridge and migrate-deploy target mode.
6. Add Cloud Build YAMLs that keep build, release, and promote separate.
7. Prevent old push-to-main direct deploy behavior from accidentally shipping Quipsly changes, if approved.
8. Document the Prisma baseline path instead of pretending migrations already exist.
```

When in doubt, choose the boring safe path. The release train should move like a little brass locomotive with labeled levers, not a shopping cart full of fireworks.
