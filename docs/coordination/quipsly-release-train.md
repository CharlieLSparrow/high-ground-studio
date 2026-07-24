# Quipsly Release Train

This is the working release discipline for Quipsly/Nest while the Cloud Run service is still named `studio`.

## Current service reality

- Public app host: `nest.quipsly.com`
- Marketing host: `quipsly.com`
- Legacy/direct Cloud Run host: `studio-hm2odnvjga-uc.a.run.app`
- Cloud Run service name: `studio`
- Dockerfile: `apps/quipsly/Dockerfile`
- Build config: `cloudbuild.quipsly-web.yaml`

The service name can be renamed later. For beta, stability matters more than a cosmetic service rename.

## Release shape

1. Choose a committed source SHA. The deploy script archives that commit into a
   bounded release context; the dirty working tree is never build input.
2. Run release preflight. Standalone preflight materializes the same
   manifest-bounded context as Cloud Build, installs its frozen dependency
   graph, generates Prisma clients, and runs the strict webpack production
   build with type-error suppression disabled. Cloud Build is not started
   unless that exact committed context compiles. Local `.next-*` output and the
   rest of the monorepo are never treated as release evidence.
3. Check production schema status. Back up and migrate in separate, explicit
   jobs when needed; app deployment never silently changes schema.
4. Deploy a tagged Cloud Run preview with zero traffic.
5. Run anonymous-boundary, authenticated-workspace, schema, public-host, and
   signed-receipt smoke against that exact revision.
6. Resolve the preview tag to one immutable revision, verify its embedded source
   SHA, and repeat the signed smoke immediately before promotion.
7. Promote that revision—not the movable tag—and run production readback. If
   readback fails, automatically restore 100% traffic to the previous revision.

## Scripts

Preview deploy:

```bash
PROJECT_ID=high-ground-odyssey \
SOURCE_REF=<committed-sha> \
IMAGE_TAG=preview-<short-sha>-<date> \
bash scripts/release/quipsly-deploy-preview.sh
```

The deploy requires an enabled Secret Manager version named
`quipsly-release-smoke-secret` by default. Cloud Run receives it as
`QUIPSLY_RELEASE_SMOKE_SECRET`; it is never a `NEXT_PUBLIC_*` variable.

Preview smoke with the existing reviewer credential stored in macOS Keychain:

```bash
QUIPSLY_RELEASE_SMOKE_SECRET="$(
  gcloud secrets versions access latest \
    --secret=quipsly-release-smoke-secret \
    --project=high-ground-odyssey
)" \
QUIPSLY_AUTH_SMOKE_EMAIL=codex@dev.test \
QUIPSLY_AUTH_SMOKE_PASSWORD="$(
  security find-generic-password \
    -s quipsly-capture-reviewer \
    -a codex@dev.test \
    -w
)" \
PREVIEW_URL=https://quipsly-preview---studio-hm2odnvjga-uc.a.run.app \
bash scripts/release/quipsly-smoke-preview.sh
```

Do not paste a reviewer password or signing secret directly into shell history.
For a different secure credential store, supply the same environment variables
without printing their values.

The promotion receipt is accepted only when it is fresh, signed by the same
managed secret as the runtime, bound to the serving revision, covers the exact
configured public-host set, and includes every server-required route ID. The
authenticated leg proves Firebase login, session-cookie creation, native bearer
verification, Home Nest/free-tier state, Nest index, writing, editor, recorder,
research, publishing, logout, and cookie clearing.

Cloud Run tagged URLs ignore host-header overrides. A host header remains useful
only for a non-Cloud-Run target:

```bash
PREVIEW_URL=https://example-preview-url \
HOST_HEADER=nest.quipsly.com \
bash scripts/release/quipsly-smoke-preview.sh
```

Inspect current traffic:

```bash
scripts/release/quipsly-traffic.sh
```

Promote the exact preview revision. Promotion requires the reviewer credential
through the environment, retrieves the managed smoke secret without printing
it, repeats the full candidate smoke, refuses a tag that moved during smoke,
and verifies that the candidate embeds `SOURCE_REF`:

```bash
QUIPSLY_AUTH_SMOKE_EMAIL=codex@dev.test \
QUIPSLY_AUTH_SMOKE_PASSWORD="$(
  security find-generic-password \
    -s quipsly-capture-reviewer \
    -a codex@dev.test \
    -w
)" \
SOURCE_REF=<committed-sha> \
PROJECT_ID=high-ground-odyssey \
bash scripts/release/quipsly-promote-preview.sh
```

The current production audit can report route drift while a no-traffic repair
preview is being prepared. That drift is never accepted as candidate evidence:
preview smoke and post-promotion production readback remain mandatory.

`QUIPSLY_PREFLIGHT_BUILD=0` exists only for a fast diagnostic audit. Never use
it for preview deployment or promotion; those lanes must compile the exact
committed release context before invoking Cloud Build.

Rollback to a known revision:

```bash
ROLLBACK_REVISION=studio-00042-abc scripts/release/quipsly-rollback.sh
```

## Health endpoints

- `/api/health` is backward-compatible for old probes.
- `/api/healthz` is the richer release-captain endpoint.

`/api/healthz` intentionally reports only safe booleans and release metadata. It must never print secret values.

## Deploy Captain rules

- Do not deploy directly to live traffic unless Codex/user explicitly says to skip preview.
- Do not build from a dirty checkout. Release only a committed SHA.
- Do not run database pushes in the same mental step as app promotion.
- Take a Cloud SQL backup before a production migration and verify migration
  status afterward.
- If `/api/healthz` reports missing required runtime config, stop and report.
- If `nest.quipsly.com` serves marketing/article routes instead of the app shell, stop and report host routing drift.
- If preview smoke fails, do not promote and do not retry blindly.
- A signed-out shell is authentication-boundary evidence, not proof that the
  protected workspace rendered. The signed-in smoke is mandatory for the
  promotion receipt.
- `ready: true` does not claim live-provider completion, App Store review,
  TestFlight installation, or physical-iPhone behavior. Those gates retain
  separate evidence.
