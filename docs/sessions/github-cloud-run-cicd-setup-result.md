# GitHub Cloud Run CI/CD Setup Result

Date: 2026-05-23

Branch:

```text
codex/github-cloud-deploy-001
```

## Goal

Move web and Studio deploys toward a low-human-intervention Google Cloud path.
The first CI/CD slice should avoid long-lived Google service account keys and
reuse the deploy helpers that already passed live Cloud Run smoke checks.

## Google Cloud Admin Work

Enabled APIs in project `high-ground-odyssey`:

```text
iamcredentials.googleapis.com
sts.googleapis.com
```

Created deployer service account:

```text
github-actions-deployer@high-ground-odyssey.iam.gserviceaccount.com
```

Granted project-level deploy permissions:

```text
roles/cloudbuild.builds.editor
roles/run.admin
roles/storage.objectAdmin
```

Granted scoped runtime impersonation:

```text
web-cloud-run@high-ground-odyssey.iam.gserviceaccount.com
studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com
```

The deployer has `roles/iam.serviceAccountUser` on those runtime service
accounts only. It was not granted broad project-level service-account-user
authority.

Created Workload Identity Federation:

```text
pool: github-actions
provider: github
provider resource:
projects/659427658635/locations/global/workloadIdentityPools/github-actions/providers/github
```

Provider restriction:

```text
CharlieLSparrow/high-ground-studio
```

Granted Workload Identity User on the deployer service account to:

```text
principalSet://iam.googleapis.com/projects/659427658635/locations/global/workloadIdentityPools/github-actions/attribute.repository/CharlieLSparrow/high-ground-studio
```

## Repo Changes

Added:

```text
.github/workflows/deploy-cloud-run.yml
```

The workflow:

- runs on pushes to `main`
- supports manual dispatch for `all`, `web`, `studio`, or `auto`
- deploys web only when web/shared/runtime files change
- deploys Studio only when Studio/shared/runtime files change
- uses GitHub OIDC through Google Workload Identity Federation
- runs `pnpm web:cloudrun:deploy` for web
- runs `pnpm studio:cloudrun:deploy` for Studio
- lets web and Studio deploy in parallel during a manual `all` release

Updated:

```text
docs/runbooks/web-cloud-run.md
docs/runbooks/studio-cloud-run.md
docs/coordination/progress-thread.md
apps/web/content/internal/progress-story.json
```

## Verification Completed

Local verification:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('apps/web/content/internal/progress-story.json','utf8'))"
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/deploy-cloud-run.yml')"
git diff --check
pnpm web:cloudrun:test
pnpm studio:cloudrun:test
```

After merging:

1. Push to `main` should run the workflow.
2. This branch should deploy `web` because it updates checked-in web content
   for the team progress story.
3. A manual GitHub Actions dispatch with target `all` should deploy both live
   Cloud Run services and print rollback commands in the job logs.

## First Workflow Run

The first push run started correctly:

```text
run: 26347264413
url: https://github.com/CharlieLSparrow/high-ground-studio/actions/runs/26347264413
```

The plan job selected `web` and skipped `studio`, as expected for the checked-in
web story update.

The first deploy attempt failed before Cloud Build because
`google-github-actions/auth` created a temporary `gha-creds-*.json` file in the
GitHub Actions checkout. The deploy helper refused the dirty working tree.

Follow-up fix:

- keep the dirty-tree safety check
- ignore only the known ephemeral `gha-creds-*.json` auth file
- apply the same fix to web and Studio deploy helpers
- cover the behavior through the Cloud Run readiness tests

## Cloud Build Bucket Blocker

After the dirty-tree fix, the workflow reached the deploy helpers and passed
their local validation, but both web and Studio failed at `gcloud builds submit`
with access denied to the Cloud Build source staging bucket:

```text
high-ground-odyssey_cloudbuild
```

Additional IAM was applied for the GitHub deployer service account and the
restricted GitHub Workload Identity principal:

```text
roles/serviceusage.serviceUsageConsumer
roles/storage.objectAdmin on gs://high-ground-odyssey_cloudbuild
```

The failure persisted, so the CI path was changed instead of spending more time
on the Cloud Build source-upload edge. The deploy helpers now keep Cloud Build
as the default local/operator strategy, but GitHub Actions sets:

```text
WEB_IMAGE_BUILD_STRATEGY=docker
STUDIO_IMAGE_BUILD_STRATEGY=docker
```

That mode authenticates Docker to Artifact Registry through `gcloud auth
configure-docker`, builds from the checked-out repo on the GitHub runner, pushes
the image to Artifact Registry, then deploys the same image to Cloud Run.

The deployer service account has scoped writer access on the existing Artifact
Registry repository:

```text
repository: high-ground-studio
location: us-central1
role: roles/artifactregistry.writer
member: github-actions-deployer@high-ground-odyssey.iam.gserviceaccount.com
```

## First Successful Push-To-Main Deploy

The direct Docker strategy succeeded from `main`:

```text
run: 26347727705
commit: b80f140274d94e2a5d7a85f4bdb386d56a769867
```

Web:

```text
revision: web-00004-fml
url: https://web-hm2odnvjga-uc.a.run.app
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:b80f140274d94e2a5d7a85f4bdb386d56a769867
rollback: gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00003-fc2=100
```

Studio:

```text
revision: studio-00026-hpm
url: https://studio-hm2odnvjga-uc.a.run.app
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:b80f140274d94e2a5d7a85f4bdb386d56a769867
rollback: gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00025-shp=100
```

Live smokes passed:

```text
https://web-hm2odnvjga-uc.a.run.app/api/health
https://web-hm2odnvjga-uc.a.run.app/
https://web-hm2odnvjga-uc.a.run.app/team/progress redirects to sign-in
https://studio-hm2odnvjga-uc.a.run.app/api/health
https://studio-hm2odnvjga-uc.a.run.app/content-studio
```

The Docker logs exposed a Prisma/OpenSSL warning in the slim images, so the
next hardening slice should install `openssl` and `ca-certificates` in both
builder and runner stages for web and Studio.

## Rollback

Cloud Run rollback remains service-specific:

```bash
gcloud run services update-traffic web \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=KNOWN_GOOD_WEB_REVISION=100
```

```bash
gcloud run services update-traffic studio \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=KNOWN_GOOD_STUDIO_REVISION=100
```

CI/CD rollback, if the workflow itself misbehaves:

```bash
git revert COMMIT_THAT_ADDED_OR_CHANGED_THE_WORKFLOW
```

Then disable or pause the GitHub Actions workflow from the repository Actions
tab until a corrected workflow lands.

## Not Changed

- No database schema was changed.
- No `db:push` or database migration was run.
- No runtime secrets were printed or committed.
- No DNS records were changed.
- No OAuth callback was changed.
- No billing or provider integrations were changed.
