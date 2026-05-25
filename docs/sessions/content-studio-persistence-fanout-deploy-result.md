# Content Studio Persistence Fanout Deploy Result

Date: 2026-05-25

## Scope

Merged and deployed the first multi-agent fanout slice:

- Content Studio durable project persistence
- Weekly Commitments coaching tool loop
- private HGO episode publish operator handoff packets

## Merge

- PR: https://github.com/CharlieLSparrow/high-ground-studio/pull/23
- Merge commit: `928d68f`

## Database Rollout

Built one-off Prisma db-push image:

```text
us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/prisma-db-push:6b12434
```

Cloud Build:

```text
21a319e8-a70b-4d11-8619-3c274e947836
```

Studio schema sync:

```text
job: studio-db-push-6b12434
execution: studio-db-push-6b12434-658xk
database secret: studio-database-url
```

Web schema sync:

```text
job: web-cloudsql-db-push-6b12434
execution: web-cloudsql-db-push-6b12434-49qpc
database secret: web-cloudsql-database-url
```

Both job logs reported:

```text
Your database is now in sync with your Prisma schema.
```

## Studio Deploy

```text
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:928d68f
Cloud Build: f4f25dc4-58aa-48d4-980b-8ae702a92132
revision: studio-00047-zm2
url: https://studio-hm2odnvjga-uc.a.run.app
```

Smokes passed:

- `/api/health`
- `/content-studio`

Rollback:

```bash
gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00045-8k4=100
```

## Web Deploy

```text
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:928d68f
Cloud Build: 43420d27-7a3b-4a59-99a8-3024033cbdaa
revision: web-00074-n9v
url: https://web-hm2odnvjga-uc.a.run.app
canonical app URL: https://app.highgroundodyssey.com
```

Smokes passed:

- `/api/health`
- `/`
- `/projection-stage/import`
- `/team/progress` unauthenticated sign-in redirect
- `/team/hgo-publish-queue` unauthenticated sign-in redirect

Rollback:

```bash
gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00073-lnw=100
```

## Public Progress Story

Added public `/updates` entry:

```text
content-studio-persistence-fanout-live
```

## Boundaries

This rollout did not add provider calls, a public publish action, payment
collection, Patreon reconciliation, merch fulfillment calls, `/episodes`
replacement, secrets/IAM/DNS/OAuth/billing changes, or real manuscript/source
content in tests.

