# Web Cloud Run First Deploy Result

Date: 2026-05-23

## Scope

Created the first Google Cloud Run service for `apps/web` and deployed the
current web app, including the team-only progress story route at
`/team/progress`.

## Cloud Setup Completed

- Seeded web Secret Manager secret versions from local env files using
  `pnpm web:cloudrun:seed-secrets`.
- Ensured `web-cloud-run@high-ground-odyssey.iam.gserviceaccount.com` can read
  the web runtime secrets.
- Granted `roles/cloudsql.client` to the web runtime service account.
- Created Cloud Run service `web`.
- Attached Cloud SQL instance
  `high-ground-odyssey:us-central1:studio-postgres`.
- Mounted web runtime secrets:
  - `web-database-url`
  - `web-auth-secret`
  - `web-google-client-id`
  - `web-google-client-secret`
  - `web-owner-emails`
  - `web-team-scheduler-emails`
  - `web-coach-emails`
- Set runtime env:
  - `AUTH_TRUST_HOST=true`
  - `AUTH_URL=https://web-hm2odnvjga-uc.a.run.app`
  - `HGO_SITE_URL=https://web-hm2odnvjga-uc.a.run.app`
- Applied the same disabled invoker-IAM-check setting used by Studio because
  org policy blocked the public invoker IAM binding.

## Deployment Result

- service: `web`
- project: `high-ground-odyssey`
- region: `us-central1`
- first deployed image:
  `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:742690e`
- first image digest:
  `sha256:66ea1896093097f0f77f646d2d9e3c15b6121ba53a8d7f0d50d462498311856c`
- first Cloud Build: `dd3c4756-ea24-443c-8906-ac3b6726c4eb`
- first ready revision after env update: `web-00002-vjt`
- final deployed image for the progress-story update:
  `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:29b1bfb`
- final image digest:
  `sha256:503620b1e67751c698a16ea2508617d958ae44451fa75d03126563d31a1c4bfd`
- final Cloud Build: `38e4197f-903b-461c-be64-11ce4425695a`
- latest ready revision: `web-00003-fc2`
- traffic: `web-00003-fc2` serving 100%
- live URL: `https://web-hm2odnvjga-uc.a.run.app`
- canonical Cloud Run URL: `https://web-659427658635.us-central1.run.app`

## Verification

Before deploy:

- `pnpm web:cloudrun:test` passed.
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm --filter web exec next build --webpack` passed.
- `pnpm web:cloudrun:preflight` passed repository and cloud readiness checks
  with the expected warning that service `web` did not exist before first
  deploy.

Cloud Build:

- built `apps/web/Dockerfile`
- ran `pnpm --filter web exec next build --webpack`
- generated `/team/progress` in the route table
- pushed image digest
  `sha256:66ea1896093097f0f77f646d2d9e3c15b6121ba53a8d7f0d50d462498311856c`

Live smoke after disabled invoker-IAM-check update:

- `https://web-hm2odnvjga-uc.a.run.app/api/health` returned `200`
- health body: `{"ok":true,"service":"high-ground-studio","app":"web"}`
- `https://web-hm2odnvjga-uc.a.run.app/` returned `200`
- `https://web-hm2odnvjga-uc.a.run.app/team/progress` returned `307` to
  `/api/auth/signin?callbackUrl=%2Fteam%2Fclients`

Final deploy smoke for `web-00003-fc2`:

- `/api/health` passed
- `/` passed
- `/team/progress` redirected unauthenticated visitors to sign-in

## Rollback

```bash
gcloud run services update-traffic web \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=web-00002-vjt=100
```

## Follow-Up

- Add the Cloud Run web callback URL to the Google OAuth client:
  `https://web-hm2odnvjga-uc.a.run.app/api/auth/callback/google`
- Decide whether to migrate `highgroundodyssey.com` DNS to this Cloud Run
  service, put Cloud Run behind a custom subdomain first, or keep the current
  public site while this app becomes the private/team operations surface.
- After custom-domain routing, update `AUTH_URL` and `HGO_SITE_URL` to the final
  public origin and add the matching OAuth callback.

## Boundaries Preserved

- No Prisma schema changes.
- No `db:push`.
- No real manuscript or HGO source content changes.
- No Stripe, Patreon, merch, social, analytics, email, or podcast-host provider
  calls.
- No DNS or OAuth client mutation yet.
