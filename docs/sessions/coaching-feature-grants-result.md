# Coaching Feature Grants Result

Date: 2026-05-25

## Summary

Added app-owned coaching feature access so Homer can enable useful client tools
manually without forcing everything through subscription tiers.

Runtime routes:

```text
/team/clients
/dashboard
```

## What Changed

New Prisma models:

- `CoachingFeature`
- `CoachingFeatureGrant`

New coaching feature catalog:

- Session Prep
- Weekly Commitments
- Reflection Journal
- Values Scorecard
- Milestone Tracker
- Resource Library
- Post-Session Actions
- Between-Session Check-ins

Team controls:

- `/team/clients` can seed the coaching tool catalog.
- `/team/clients` can grant one tool to one client manually.
- Grants support `enabled`, `paused`, and `disabled`.
- Grants support `client_and_coach` and `coach_only` visibility.
- Grants include optional staff notes.

Client surface:

- `/dashboard` now has a Coaching Tools panel.
- The dashboard shows only enabled, non-expired, client-visible grants.

## Boundaries

This slice does not:

- create subscriptions
- call Stripe, Patreon, Google Calendar, SMS, or email providers
- send notifications
- create client-entered journal/action records yet
- replace membership plans
- publish public content

## Validation

Passed:

```bash
pnpm db:generate
pnpm coaching:features:test
pnpm web:cloudrun:test
pnpm --filter web exec next build --webpack
git diff --check
```

## Live Schema Sync

Schema image:

```text
Cloud Build: 6a867633-5cad-4811-9a2e-d15b6f81d7b2
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/prisma-db-push:456cc68
```

Schema job:

```text
job: web-cloudsql-db-push-456cc68
execution: web-cloudsql-db-push-456cc68-kxx65
secret: web-cloudsql-database-url:latest
Cloud SQL attachment: high-ground-odyssey:us-central1:studio-postgres
service account: web-cloud-run@high-ground-odyssey.iam.gserviceaccount.com
result: succeeded
```

Logs reported:

```text
Your database is now in sync with your Prisma schema.
```

## Deploy

Functional commit:

```text
c80eeb4 feat(web): add coaching feature grants
```

Progress story commit:

```text
456cc68 docs: record coaching feature controls
```

Web image:

```text
Cloud Build: 223faf4d-a16e-4013-9382-659dbd2c8ec2
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:456cc68
digest: sha256:ad0e2b7d9cc8fcc2c89df302b6fb2788a561d133225856f7b803c1a9b3232979
```

Live Cloud Run:

```text
service: web
revision: web-00072-2tl
traffic: 100%
service URL: https://web-hm2odnvjga-uc.a.run.app
custom domain: https://app.highgroundodyssey.com
optional provider/growth secrets mounted: 0
```

## Live Smoke

Passed:

- `https://app.highgroundodyssey.com/api/health` returned `200`.
- `https://app.highgroundodyssey.com/team/clients` returned the expected
  unauthenticated sign-in redirect.
- `https://app.highgroundodyssey.com/dashboard` returned the expected
  unauthenticated sign-in redirect.
- `https://app.highgroundodyssey.com/updates` returned `200` and includes
  `Coaching tools get manual controls` with commit `c80eeb4`.

## Rollback

Immediate runtime rollback:

```bash
gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00071-w7g=100
```

The Prisma change is additive, so the new coaching feature tables can remain in
Cloud SQL without affecting previous runtime revisions.

## Next Steps

1. Sign into `/team/clients` and click `Sync coaching tools`.
2. Enable one or two tools for a test client.
3. Sign in as that client and verify the dashboard Coaching Tools panel.
4. Build the first actual client tool workflow, likely Weekly Commitments or
   Session Prep, on top of these grants.

