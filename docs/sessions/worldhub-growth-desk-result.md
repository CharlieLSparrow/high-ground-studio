# WorldHub Growth Desk Result

Date: 2026-05-24

## Summary

Added the first database-backed Growth desk for SEO, analytics, ads, affiliate
marketing, and direct sponsor planning.

Runtime route:

```text
/team/growth
```

Public/runtime support:

```text
/ads.txt
Google Analytics tag gate: HGO_GA_MEASUREMENT_ID
AdSense Auto ads gate: GOOGLE_ADSENSE_CLIENT + HGO_ADSENSE_AUTO_ADS_ENABLED=1
```

## What Changed

New Prisma models:

- `WorldHubSeoBrief`
- `WorldHubAnalyticsSnapshot`
- `WorldHubMonetizationPlacement`

New Growth route:

- private `/team/growth`
- starter foundation seed action
- SEO brief form and recent brief list
- manual analytics snapshot form and recent snapshot list
- monetization placement form and recent placement list

Provider readiness now includes:

- `google-analytics`
- `google-search-console`
- `google-adsense`
- `affiliate-links`
- `direct-sponsors`

Deploy tooling now treats the related values as optional Secret Manager mounts,
only mounting them when matching secrets exist with enabled versions.

## Boundaries

This slice does not:

- import Google Analytics reports
- call Search Console APIs
- enable AdSense without env gates
- create public ad units
- add public affiliate links to content
- mutate public episode pages
- run Stripe Checkout or payment reconciliation
- call merch providers

## Validation

Passed:

```bash
pnpm db:generate
pnpm worldhub:integrations:test
pnpm worldhub:domain:typecheck
pnpm progress:story:test
pnpm web:cloudrun:test
pnpm --filter web exec next build --webpack
git diff --check
```

The default Turbopack build was also started and then killed after stalling at
the known historical `Creating an optimized production build ...` point. The
documented webpack build path passed locally and inside the Cloud Build image.

## Live Schema Sync

Schema image:

```text
Cloud Build: 896aca5f-ea23-46d0-8c33-3d36714e3af5
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/prisma-db-push:e4b8543
```

Schema job:

```text
job: web-cloudsql-db-push-e4b8543
execution: web-cloudsql-db-push-e4b8543-t9454
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

Deploy head:

```text
e4b8543 feat(web): add WorldHub growth desk
```

Web image:

```text
Cloud Build: 20ba19bc-ae03-44d4-a87e-708f529a08f9
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:e4b8543
digest: sha256:95670dfb5fb65204d170f4ad3f870ccd44ebd974fef8427b6e4ccba151352e1f
```

Live Cloud Run:

```text
service: web
revision: web-00066-xgr
traffic: 100%
service URL: https://web-hm2odnvjga-uc.a.run.app
custom domain: https://app.highgroundodyssey.com
optional provider/growth secrets mounted: 0
```

Runtime env values confirmed:

```text
AUTH_URL=https://app.highgroundodyssey.com
HGO_SITE_URL=https://app.highgroundodyssey.com
AUTH_TRUST_HOST=true
```

## Live Smoke

Passed:

- `https://app.highgroundodyssey.com/api/health` returned `200`.
- `https://app.highgroundodyssey.com/team/growth` returned the expected
  unauthenticated sign-in redirect.
- `https://app.highgroundodyssey.com/ads.txt` returned `404` because AdSense
  is not configured yet.
- `https://app.highgroundodyssey.com/updates` returned `200` and includes the
  Growth desk story entry.
- `https://app.highgroundodyssey.com/api/auth/signin` returned `200` and set
  its callback cookie to `https://app.highgroundodyssey.com`.

## Rollback

Immediate runtime rollback:

```bash
gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00065-89q=100
```

The Prisma schema change is additive. If a rollback uses `web-00065-89q`, the
new Growth tables can remain in Cloud SQL without affecting the previous
runtime.

## Next Steps

1. Sign into `/team/growth` and run `Seed Growth Foundation`.
2. Add the first real SEO brief for `/coaching` and one episode-page template.
3. Add enabled Secret Manager versions for:
   - `web-hgo-ga-measurement-id`
   - `web-google-search-console-site-url`
   - `web-google-adsense-client`
   - `web-hgo-adsense-auto-ads-enabled`
   - affiliate/sponsor values only when accounts are ready
4. Add GA/Search Console report import jobs after the provider accounts are
   verified.
5. Keep affiliate and ad placements private until disclosure and public page
   context are reviewed.
