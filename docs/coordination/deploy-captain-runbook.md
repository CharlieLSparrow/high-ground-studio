# Deploy Captain runbook

Last updated: 2026-07-31

Status: active operating pattern

## Mission

Deploy Captain owns release mechanics so Codex can keep building product during long waits.

This lane runs exact-source builds, guarded schema releases, zero-traffic Cloud
Run previews, signed smokes, promotion, and rollback readback. It does not make
product changes unless specifically assigned.

## Current production surfaces

- Quipsly Nest app service: `studio`
- Region: `us-central1`
- Primary app URL: `https://nest.quipsly.com`
- Cloud Run fallback URL: `https://studio-hm2odnvjga-uc.a.run.app`
- Artifact repository: `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio`
- Runtime Cloud SQL instance: `high-ground-odyssey:us-central1:studio-postgres`
- Runtime service account: `studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com`

## Runtime lane split

Deploy Captain is responsible for the Nest Web release lane only unless explicitly assigned otherwise.

- Nest Web: `apps/quipsly`, Cloud Run service `studio`, built inside Linux Cloud Build.
- Quipsly Mac: `apps/quipsly-mac`, native SwiftPM/macOS app, never part of the web Cloud Build context.
- Local Engine: `apps/local-engine`, local Node/WebSocket media worker, never part of the web Cloud Build context.
- Static app assets: currently bundled from `apps/quipsly/public`; do not exclude them from production web deploys until they have moved to object storage/CDN.

See `docs/quipsly/runtime-lanes-and-deploy.md` for the product/runtime boundary.

## Hard rules

- Never print secret values.
- Production releases use committed Prisma migrations through
  `scripts/release/quipsly-schema-release.sh`; never use `db push` or a
  targeted additive job as a release stage.
- The legacy `quipsly-schema-sync.sh` bridge and targeted schema jobs are
  recovery tools only. They require a reviewed incident plan and may not be
  enabled merely to make a deploy proceed.
- Product code changes belong to feature lanes. Deploy Captain reports failures with exact command, build id, error, and proposed fix.
- A failed Cloud Build or deploy identity is an IAM/release blocker, not
  permission to bypass exact-source preview and traffic gates with a direct
  local deploy.
- Treat `gcloud run services update --set-secrets` as a full secret environment rewrite. Include every required mounted secret, not only the new one being added.
- Preserve existing Cloud Run env vars, secrets, Cloud SQL bindings, service account, and custom-domain assumptions when deploying a new image. Do not "simplify" a deploy command by dropping runtime config.
- Always use preview/no-traffic deploy, revision-bound smoke, and explicit
  promotion for normal releases.

## 2026-06-07 pain update

Tonight's release failures were mostly release-mechanics failures, not product failures. Carry these lessons forward:

1. Preserve secrets on Cloud Run deploy.
   - `--set-secrets` replaces the secret env mapping with exactly what is passed.
   - If adding one secret such as `GEMINI_API_KEY`, include all required secrets in the command.
   - Use `gcloud run services describe studio --region=us-central1 --format=yaml` to inspect current env/secrets before changing them.
   - Never print secret values. It is safe to print secret names such as `studio-gemini-api-key`.

2. Broad Prisma push is not a production release mechanism.
   - `prisma db push` can hide an incomplete migration history and collide with
     enum drift, unique constraints, or partially deployed work.
   - Model every release change as a committed migration and prove the full
     chain from baseline before touching production.

3. Production schema releases are backup- and receipt-gated.
   - Use one clean source SHA and one immutable schema-image digest.
   - Create and independently read back a successful on-demand Cloud SQL
     backup before migration.
   - Require `prisma migrate status` and zero production schema diff after
     `prisma migrate deploy`.
   - Preserve the mode-0600 receipt; do not infer success from a Cloud Run Job
     exit code alone.

4. Google OAuth redirect must match the live app host.
   - For Nest auth, Google OAuth must include the `nest.quipsly.com` callback URL used by the app.
   - Keep `AUTH_URL=https://nest.quipsly.com` and `AUTH_TRUST_HOST=true` aligned with the deployed host.
   - If login loops, callback mismatch errors, or redirect-to-marketing behavior appears, inspect OAuth redirect configuration before debugging manuscript/editor code.

5. Chrome smoke is required for auth/session-sensitive routes.
   - CLI curl is enough for static routes and health endpoints.
   - Use Chrome for signed-in flows, admin tools, invite flows, and routes that depend on browser cookies.
   - Minimum Chrome smoke after a Nest deploy:
     - Open `https://nest.quipsly.com/projects`.
     - Confirm the app shell appears, not the marketing site.
     - Open `https://nest.quipsly.com/admin/users`.
     - Confirm only one top nav is visible.
     - Invite a safe test email to a known Nest and confirm no foreign-key error.
     - Open the assigned Nest/project and confirm it is visible after refresh.

6. Cloud Build context bloat is a release blocker.
   - Before `.gcloudignore` cleanup, `gcloud meta list-files-for-upload .` estimated `5700` files / `566.4 MiB`.
   - The biggest accidental upload was `apps/quipsly-mac/.build` at about `450.5 MiB`.
   - After ignoring local build products and non-deploy workspaces, upload estimate is `942` files / `113.5 MiB`.
   - If deploys become slow again, measure context size before blaming Cloud Build itself.

## Canonical exact-source preview and promotion

Run the preflight before spending time on Cloud Build:

```bash
REGION=us-central1 \
PROJECT_ID=high-ground-odyssey \
  scripts/release/quipsly-release-preflight.sh
```

The deploy identity must pass the preflight's access-token, project, Cloud Run,
Firebase, media-vault, and recovery checks. Do not substitute the
`local-engine-uploader` service account; it does not own this lane.

Resolve and preserve the exact clean commit, then deploy it at zero traffic:

```bash
release_revision=$(git rev-parse HEAD)
test -z "$(git status --porcelain=v1)"

SOURCE_REF="$release_revision" \
IMAGE_TAG="preview-${release_revision:0:12}-$(date -u +%Y%m%dT%H%M%SZ)" \
PREVIEW_TAG=quipsly-preview \
PROJECT_ID=high-ground-odyssey \
REGION=us-central1 \
  bash scripts/release/quipsly-deploy-preview.sh
```

`quipsly-deploy-preview.sh` materializes the committed release manifest, runs
the beta blocker scan and strict production build, builds that exact context,
and deploys a tagged `--no-traffic` revision. Do not replace this with a direct
`gcloud run deploy` command that silently moves traffic or rewrites runtime
configuration.

Smoke the tagged URL with the revision-bound release receipt and a real
separate-account journey. Keep secret values out of command history. After the
same preview passes every required check, promote through the guarded script:

```bash
PREVIEW_URL=<tagged-preview-url> \
HOST_HEADER=nest.quipsly.com \
  bash scripts/release/quipsly-smoke-preview.sh

PROJECT_ID=high-ground-odyssey \
REGION=us-central1 \
  bash scripts/release/quipsly-promote-preview.sh
```

Read back the serving revision, image digest, source SHA, and traffic split
after promotion. Retain the previous revision and
`scripts/release/quipsly-rollback.sh` path until the production smoke passes.


## Guarded production schema release

Schema changes are released before a dependent app revision receives traffic.
The lane accepts only committed Prisma migrations from the exact clean source
SHA being released.

Plan first:

```bash
schema_revision=$(git rev-parse HEAD)
bash scripts/release/quipsly-schema-release.sh \
  --revision "$schema_revision" \
  --confirm-target high-ground-odyssey/studio-postgres
```

Review the printed mode-0600 receipt, then apply from the unchanged checkout:

```bash
bash scripts/release/quipsly-schema-release.sh \
  --revision "$schema_revision" \
  --apply \
  --confirm-target high-ground-odyssey/studio-postgres
```

The guarded lane must prove:

1. the full migration chain replays twice in a disposable database;
2. the disposable database has zero diff from committed Prisma schema;
3. one immutable schema-image digest is used for all jobs;
4. a successful on-demand Cloud SQL backup is created and independently read
   back for the exact target instance;
5. `prisma migrate deploy` succeeds;
6. the migration ledger is current; and
7. production has zero diff from committed schema.

Preserve the receipt with release evidence. A successful job exit without the
backup, ledger, and zero-diff readbacks is not a successful schema release.

`/api/production-core/readiness` remains a useful runtime query, but it is not a
substitute for the migration receipt. The legacy `quipsly-schema-sync.sh`
bridge and targeted additive jobs are incident-recovery tools only; they are
not listed in normal release commands.


## Smoke checklist

Run these after deploy:

```bash
PREVIEW_URL=<preview-or-live-url> HOST_HEADER=nest.quipsly.com bash scripts/release/quipsly-smoke-preview.sh
curl -I -L -s -o /dev/null -w '%{url_effective} %{http_code}\n' https://nest.quipsly.com
curl -I -L -s -o /dev/null -w '%{url_effective} %{http_code}\n' https://quipsly.com/quipsly-app-icon.png
curl -I -L -s -o /dev/null -w '%{url_effective} %{http_code}\n' https://studio-hm2odnvjga-uc.a.run.app/projects
```

Expected:

- `https://nest.quipsly.com/projects 200`
- Quipsly static assets return `200`
- Studio fallback `/projects` returns a non-500 status.
- `quipsly-smoke-preview.sh` passes `/api/production-core/readiness` and confirms `/api/mac/session-check` returns an expected unauthenticated `401`, not a `500`.

Then run a Chrome smoke for anything auth, admin, invite, editor, or chat related. Curl cannot prove those flows.

## Context-size check

Run this before starting a release if upload time feels suspicious:

```bash
tmp=/tmp/quipsly-gcloud-upload.txt
gcloud meta list-files-for-upload . > "$tmp"
python3 - "$tmp" <<'PY'
import os, sys
count = 0
total = 0
for raw in open(sys.argv[1]):
    p = raw.strip()
    if p and os.path.isfile(p):
        count += 1
        total += os.path.getsize(p)
print(f"files={count}")
print(f"mib={total/1024/1024:.1f}")
PY
```

If it is much higher than roughly `115 MiB`, inspect large included folders before deploying:

```bash
python3 - "$tmp" <<'PY'
import os, sys, collections
sizes = collections.Counter()
for raw in open(sys.argv[1]):
    p = raw.strip()
    if p and os.path.isfile(p):
        sizes[p.split(os.sep, 1)[0]] += os.path.getsize(p)
for name, size in sizes.most_common(20):
    print(f"{size/1024/1024:8.1f} MiB  {name}")
PY
```

## Pipeline improvement backlog

- Keep the manifest-built Nest release context near the current `112 MiB`
  measured size and investigate material growth.
- Make every CI and local deploy identity pass the same preflight instead of
  maintaining bypass commands.
- Keep the schema image source-scoped, digest-pinned, and independently
  replayable.
- Preserve signed smoke, schema, promotion, and rollback receipts under one
  exact source SHA.
