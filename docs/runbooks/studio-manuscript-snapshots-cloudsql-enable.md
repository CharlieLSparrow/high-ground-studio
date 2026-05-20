# Studio Manuscript Snapshots Cloud SQL Enablement

Date: 2026-05-20

## Purpose

This runbook is the operator plan for turning the checked-in Studio Manuscript
server snapshot foundation into a live Cloud Run feature.

The feature is manual server snapshots only:

- no autosave
- no Yjs or real-time collaboration
- no canonical manuscript database model
- no public projection
- no Quote Engine or QuipLore integration

The current committed foundation is:

```text
30d1181 app: add manuscript server snapshot foundation
```

Live Studio is still running without manuscript snapshot persistence until this
runbook is explicitly executed.

## Current Read-Only Inventory

Read-only checks on 2026-05-20 showed:

- project: `high-ground-odyssey`
- Cloud Run region: `us-central1`
- live Studio revision: `studio-00016-r88`
- Studio service URL: `https://studio-hm2odnvjga-uc.a.run.app`
- enabled APIs include:
  - `cloudbuild.googleapis.com`
  - `run.googleapis.com`
  - `secretmanager.googleapis.com`
- `sqladmin.googleapis.com` is not enabled
- Cloud SQL instances cannot be listed until Cloud SQL Admin API is enabled
- Cloud Run `studio` has no `DATABASE_URL`
- no `studio-database-url` secret exists
- existing Studio secrets are:
  - `studio-allowed-emails`
  - `studio-auth-secret`
  - `studio-google-client-secret`
- runtime service account:
  - `studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com`

No resource creation, API enablement, IAM change, Secret Manager write, Cloud
Run config change, database mutation, `db:push`, deploy, or migration happened
during this planning pass.

## Recommendation

Use a new, isolated Cloud SQL PostgreSQL database for the internal Studio MVP
snapshot feature.

Recommended resources:

```text
Project: high-ground-odyssey
Region: us-central1
Cloud SQL instance: studio-postgres
Cloud SQL connection name: high-ground-odyssey:us-central1:studio-postgres
Database: studio
Database user: studio_app
Secret Manager secret: studio-database-url
Cloud Run service: studio
Cloud Run runtime service account: studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com
```

Recommended database shape:

```text
Engine: PostgreSQL
Version: POSTGRES_16
Edition: Enterprise
Tier: db-f1-micro, if available
Availability: zonal
Storage: 10 GB HDD, if available
Backups: keep enabled unless the operator deliberately accepts disposable data
```

Cost caveat:

- exact Cloud SQL prices must be checked in the Google Cloud Console pricing
  estimate before creation
- if `db-f1-micro`, 10 GB storage, HDD, or zonal availability is unavailable or
  the console presents a materially larger cost, stop before creating the
  instance
- if this is only a short synthetic smoke, delete the empty instance afterward
  to avoid ongoing cost

## Hard Stops

Stop before continuing if any of these are true:

- Cloud SQL tier is not small or cheap enough for the internal MVP.
- Google Cloud Console cost estimate is unclear.
- Cloud SQL Admin API enablement reveals an existing database that might hold
  important production data.
- The selected database is not brand-new and empty.
- The operator expects `pnpm db:push` to create only
  `StudioManuscriptSnapshot`; this repo's current Prisma schema creates the
  full app schema on an empty database.
- `pnpm db:push` would alter or drop existing important tables.
- IAM requires a broad project-level grant that the operator is not willing to
  approve.
- Commands would print a database password, place it directly in shell history,
  or write it to command logs.
- Cloud Run update commands would remove existing env vars or secret bindings.
- The runtime owner identity for snapshot API access is unclear.
- Any command would touch canonical manuscript/content paths.

## Phase 0: Reconfirm Current State

Run these before any mutation:

```bash
gcloud config get-value project
gcloud config get-value run/region

gcloud services list --enabled \
  --project=high-ground-odyssey \
  --filter='config.name:(sqladmin.googleapis.com OR cloudbuild.googleapis.com OR run.googleapis.com OR secretmanager.googleapis.com)' \
  --format='table(config.name)'

gcloud secrets list \
  --project=high-ground-odyssey \
  --format='table(name,replication.policy)'

gcloud run services describe studio \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --format='yaml(spec.template.spec.serviceAccountName,spec.template.spec.containers[0].env,spec.template.metadata.annotations,status.latestReadyRevisionName,status.url,status.traffic)'

gcloud projects get-iam-policy high-ground-odyssey \
  --flatten='bindings[].members' \
  --filter='bindings.members:studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com' \
  --format='table(bindings.role)'
```

Try to list Cloud SQL instances, but do not answer yes to API enablement in this
read-only phase:

```bash
gcloud sql instances list \
  --project=high-ground-odyssey \
  --format='table(name,databaseVersion,region,tier,state)'
```

Expected current result before enablement: this reports that
`sqladmin.googleapis.com` is disabled.

## Phase 1: Enable Cloud SQL Admin API

Mutation begins here. Do not run this until resource creation is approved.

```bash
gcloud services enable sqladmin.googleapis.com \
  --project=high-ground-odyssey
```

After the API is enabled, inspect before creating anything:

```bash
gcloud sql instances list \
  --project=high-ground-odyssey \
  --format='table(name,databaseVersion,region,tier,state)'
```

Stop if an existing Cloud SQL instance appears and the operator intends to use
it without first confirming it is safe and empty for Studio snapshots.

## Phase 2: Create The Cloud SQL Instance

Recommended command:

```bash
gcloud sql instances create studio-postgres \
  --project=high-ground-odyssey \
  --database-version=POSTGRES_16 \
  --edition=enterprise \
  --tier=db-f1-micro \
  --region=us-central1 \
  --availability-type=zonal \
  --storage-size=10 \
  --storage-type=HDD \
  --backup-start-time=09:00 \
  --retained-backups-count=7 \
  --no-retain-backups-on-delete \
  --deletion-protection
```

Notes:

- `--deletion-protection` avoids accidental deletion once real manuscript
  snapshots exist.
- Use `--no-deletion-protection` only for a deliberately disposable synthetic
  smoke instance.
- If `db-f1-micro`, `HDD`, or any other cost-sensitive flag is rejected, stop
  and check the Cloud Console estimate before choosing a larger replacement.

Confirm the created instance:

```bash
gcloud sql instances describe studio-postgres \
  --project=high-ground-odyssey \
  --format='yaml(name,databaseVersion,region,gceZone,settings.tier,settings.dataDiskSizeGb,settings.dataDiskType,settings.availabilityType,settings.backupConfiguration.enabled,connectionName,state)'
```

## Phase 3: Create Database And User

Create the database:

```bash
gcloud sql databases create studio \
  --project=high-ground-odyssey \
  --instance=studio-postgres
```

Create a password locally without printing it:

```bash
umask 077
STUDIO_DB_PASSWORD_FILE="$(mktemp -t studio-db-password.XXXXXX)"
openssl rand -hex 32 > "$STUDIO_DB_PASSWORD_FILE"
```

Create the user. The safest no-history path is interactive:

```bash
gcloud sql users create studio_app \
  --project=high-ground-odyssey \
  --instance=studio-postgres

pbcopy < "$STUDIO_DB_PASSWORD_FILE"

gcloud sql users set-password studio_app \
  --project=high-ground-odyssey \
  --instance=studio-postgres \
  --prompt-for-password
```

When prompted, paste the password from the clipboard.

If `gcloud sql users create` rejects creating the user without a password, stop
and use the Cloud Console masked-password flow, or explicitly approve a command
that passes the password from the local temp file. Do not paste the password
literal into the terminal command.

## Phase 4: Create DATABASE_URL Secret

The Studio runtime should connect through the Cloud Run Cloud SQL Unix socket,
not through an authorized public network.

Construct the connection string into a temp file without printing it:

```bash
INSTANCE_CONNECTION_NAME="high-ground-odyssey:us-central1:studio-postgres"
STUDIO_DATABASE_URL_FILE="$(mktemp -t studio-database-url.XXXXXX)"

printf 'postgresql://studio_app:%s@localhost/studio?host=/cloudsql/%s\n' \
  "$(cat "$STUDIO_DB_PASSWORD_FILE")" \
  "$INSTANCE_CONNECTION_NAME" \
  > "$STUDIO_DATABASE_URL_FILE"
```

Create the secret and first version:

```bash
gcloud secrets create studio-database-url \
  --project=high-ground-odyssey \
  --replication-policy=automatic \
  --data-file="$STUDIO_DATABASE_URL_FILE"
```

If the secret already exists, add a new version instead:

```bash
gcloud secrets versions add studio-database-url \
  --project=high-ground-odyssey \
  --data-file="$STUDIO_DATABASE_URL_FILE"
```

Clean up local temp files after the schema is applied and the secret is
verified:

```bash
rm -f "$STUDIO_DB_PASSWORD_FILE" "$STUDIO_DATABASE_URL_FILE"
```

## Phase 5: Grant Minimum Runtime Access

Grant the runtime service account access to the database URL secret:

```bash
gcloud secrets add-iam-policy-binding studio-database-url \
  --project=high-ground-odyssey \
  --member='serviceAccount:studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com' \
  --role='roles/secretmanager.secretAccessor'
```

Cloud Run's Cloud SQL connection normally also requires the runtime service
account to have `roles/cloudsql.client`.

First check whether it already has that role:

```bash
gcloud projects get-iam-policy high-ground-odyssey \
  --flatten='bindings[].members' \
  --filter='bindings.members:studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com AND bindings.role:roles/cloudsql.client' \
  --format='table(bindings.role)'
```

If no role is present, stop for IAM approval. The common command is
project-level:

```bash
gcloud projects add-iam-policy-binding high-ground-odyssey \
  --member='serviceAccount:studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com' \
  --role='roles/cloudsql.client'
```

Do not run that command if the operator requires instance-scoped or conditional
IAM and it has not been designed. Broad project-level IAM is a hard stop unless
explicitly accepted for this small internal service.

## Phase 6: Apply The Prisma Schema

Important:

- The repo has one Prisma schema.
- `pnpm db:push` will create the full app schema in a new empty database, not
  only `StudioManuscriptSnapshot`.
- That is acceptable only because this runbook recommends a brand-new empty
  Studio-owned database.
- Do not run `pnpm db:push` against an existing shared or production-critical
  database.

### Option A: Cloud SQL Auth Proxy

Install the Cloud SQL Auth Proxy using the official Google path for the
operator machine, then run it in one terminal:

```bash
cloud-sql-proxy \
  --port=5433 \
  high-ground-odyssey:us-central1:studio-postgres
```

In a second terminal, apply the schema to the new empty database:

```bash
DATABASE_URL="postgresql://studio_app:$(cat "$STUDIO_DB_PASSWORD_FILE")@127.0.0.1:5433/studio?schema=public" \
  pnpm db:push
```

Verify Prisma can generate after the schema sync:

```bash
pnpm db:generate
```

### Option B: Direct `psql` Inspection Through The Proxy

If `psql` is installed, inspect the empty database before `db:push`:

```bash
PGPASSWORD="$(cat "$STUDIO_DB_PASSWORD_FILE")" \
  psql 'host=127.0.0.1 port=5433 dbname=studio user=studio_app sslmode=disable' \
  -c '\dt'
```

Expected before `db:push`: no relations.

After `db:push`, inspect again:

```bash
PGPASSWORD="$(cat "$STUDIO_DB_PASSWORD_FILE")" \
  psql 'host=127.0.0.1 port=5433 dbname=studio user=studio_app sslmode=disable' \
  -c '\dt'
```

Expected after `db:push`: the full Prisma schema tables, including
`StudioManuscriptSnapshot`.

### Option C: Public IP Or Authorized Network

Do not use public IP authorized networks as the default path. If an operator
chooses this, treat it as a separate security decision and document the exact
temporary network, expiration, and cleanup command before connecting.

## Phase 7: Build And Deploy The Snapshot Foundation Image

After schema application succeeds, build the committed image:

```bash
pnpm studio:cloudbuild:image:sha
```

Capture the image tag:

```bash
IMAGE="us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:$(git rev-parse --short HEAD)"
echo "$IMAGE"
```

Deploy the image and attach the database in the same controlled Cloud Run
revision:

```bash
gcloud run services update studio \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --image="$IMAGE" \
  --add-cloudsql-instances=high-ground-odyssey:us-central1:studio-postgres \
  --update-secrets=DATABASE_URL=studio-database-url:latest
```

Use `--update-secrets`, not `--set-secrets`, so existing secret-backed env vars
are preserved.

Do not use `--clear-env-vars`, `--set-env-vars`, `--clear-secrets`, or
`--set-secrets` in this pass unless the operator has separately reviewed the
entire Cloud Run env surface.

## Phase 8: Post-Deploy Checks

Health check:

```bash
curl -fsS https://studio-hm2odnvjga-uc.a.run.app/api/health
```

Confirm revision and traffic:

```bash
gcloud run services describe studio \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --format='yaml(status.latestReadyRevisionName,status.traffic,status.url)'
```

Read logs:

```bash
gcloud run services logs read studio \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --limit=100
```

If the CLI shape changes, use:

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="studio"' \
  --project=high-ground-odyssey \
  --limit=100 \
  --format='value(timestamp,severity,textPayload)'
```

## Phase 9: Synthetic Smoke

Do not use the real manuscript as the first persistence smoke.

Manual browser smoke:

1. Open live `/manuscript`.
2. Sign in with an authorized Studio account.
3. Create or import a tiny synthetic draft.
4. Add at least one structure region.
5. Mark one synthetic cited quotation.
6. Add one quote review metadata entry.
7. Switch to `Backup`.
8. Click `Save server snapshot`.
9. Confirm the snapshot appears in the recent snapshot list.
10. Open live `/manuscript` in another browser profile or phone.
11. Click `Load latest snapshot`.
12. Confirm text, block IDs, structure regions, cited quotations, and quote
    review metadata survived.
13. Confirm browser-local full draft JSON download still works.
14. Confirm no autosave occurs; no server snapshot is created unless `Save
    server snapshot` is clicked.

Only after synthetic smoke passes should the operator try the real manuscript.

## Rollback

If the new revision fails before useful data is saved:

1. Route traffic back to the previous known good revision:

```bash
gcloud run services update-traffic studio \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=studio-00016-r88=100
```

2. Remove the database secret binding from the current service when ready:

```bash
gcloud run services update studio \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --remove-secrets=DATABASE_URL \
  --remove-cloudsql-instances=high-ground-odyssey:us-central1:studio-postgres
```

3. Keep the database if it contains any snapshots that may matter.
4. If the database is empty and the operator wants to stop all ongoing Cloud
   SQL cost, remove deletion protection and delete the instance:

```bash
gcloud sql instances patch studio-postgres \
  --project=high-ground-odyssey \
  --no-deletion-protection

gcloud sql instances delete studio-postgres \
  --project=high-ground-odyssey
```

5. If deleting the instance, decide separately whether to delete
   `studio-database-url`. Do not delete the secret while any service revision
   might still reference it.

## Cost-Control Cleanup Notes

- Cloud SQL instances cost money while they exist, even when idle.
- If the feature is not being used after synthetic smoke, stop or delete the
  empty instance according to the operator's cost policy.
- If real manuscript snapshots have been saved, export/download browser-local
  backups before deleting server storage.
- Keep a short session note recording:
  - instance name
  - database name
  - applied schema method
  - secret name
  - revision deployed
  - smoke result
  - whether any real manuscript data was ever saved
