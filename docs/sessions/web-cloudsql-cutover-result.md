# Web Cloud SQL Cutover Result

Date: 2026-05-24

## Result

The live `web` Cloud Run service now uses Cloud SQL for its Prisma
`DATABASE_URL`.

Live service:

```text
service: web
region: us-central1
url: https://web-hm2odnvjga-uc.a.run.app
current revision: web-00036-rl9
cutover revision: web-00033-den
runtime secret: web-cloudsql-database-url
database: web
Cloud SQL instance: high-ground-odyssey:us-central1:studio-postgres
```

## Preparation

- Created Cloud SQL database `web`.
- Created Cloud SQL user `web_app`.
- Created Secret Manager secret `web-cloudsql-database-url`.
- Granted the web runtime service account access to the staged secret.
- Confirmed the web runtime service account has Cloud SQL client access.
- Applied the Prisma schema to the staged target with Cloud Run Job
  `web-cloudsql-db-push-47d8200`.

## Data Copy

Successful copy:

```text
job: web-neon-to-cloudsql-copy-f14c4c7
execution: web-neon-to-cloudsql-copy-f14c4c7-w27bk
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/postgres-copy:f14c4c7
source-before rows: 20
target-before rows: 0
target-after rows: 20
```

The copy job dumped only the `public` schema, copied data only, refused
non-empty targets by default, stripped Secret Manager line endings from
connection strings, and did not print database URLs or row data.

## Smoke Checks

Before live routing, revision `web-00033-den` was deployed with 0% traffic and
tagged:

```text
https://cloudsql-smoke---web-hm2odnvjga-uc.a.run.app
```

Smoke results on the tagged revision:

```text
/api/health -> 200
/ -> 200
/projection-stage/import -> 200
/team/progress -> 307 unauthenticated redirect
```

After live routing to `web-00033-den`, the same smoke checks passed against:

```text
https://web-hm2odnvjga-uc.a.run.app
```

The cutover record and progress story entry were then deployed as
`web-00034-n4p` from commit `41dc418`. Tagged smoke passed on
`https://story-smoke---web-hm2odnvjga-uc.a.run.app` before live traffic moved
to that revision.

The deploy-helper pinned-traffic fix was then deployed from commit `d4ebbfe`.
The fixed helper routed live traffic to `web-00036-rl9` and passed the same live
smoke checks.

`pnpm web:db:target:report` confirmed:

- `DATABASE_URL` is mounted from `web-cloudsql-database-url`
- the secret targets Cloud SQL
- Cloud SQL attachment is present
- database `web` exists
- user `web_app` exists
- no pending work, warnings, or blocked items

## Rollback

Immediate rollback to the previous Cloud SQL-backed revision is:

```bash
gcloud run services update-traffic web \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=web-00034-n4p=100
```

While the legacy Neon source remains valid, deeper rollback is:

```bash
gcloud run services update-traffic web \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=web-00031-4r2=100
```

Keep the old `web-database-url` secret as a source/rollback anchor until the
Cloud SQL path has enough runtime history.

## Follow-Ups

- Monitor live web logs after real signed-in team usage.
- Keep future web deploys mounted to `web-cloudsql-database-url`.
- Decide later when to retire or archive the legacy Neon secret.
- Add a domain/OAuth pass for `app.highgroundodyssey.com` once DNS access is
  available.
