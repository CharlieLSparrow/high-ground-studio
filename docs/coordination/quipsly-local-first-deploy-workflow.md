# Quipsly local-first deploy workflow

Last updated: 2026-06-10

## Why this exists

Quipsly now has enough surface area that one deploy path cannot serve every job.
The full beta release lane is supposed to coordinate many agents, docs, public
surfaces, schema safety, and stakeholder readiness. That is correct for a major
release, but it is the wrong tool for an urgent auth or routing hotfix.

The working rule is not "always deploy this way." The rule is: pick the smallest
lane that proves the change without hiding risk.

## Lane 1: local development proof

Use this first for normal feature work.

1. Run the local Nest app.
2. Exercise the exact route in the browser, Codex in-app browser, Chrome, or
   Quipsly Mac, depending on the feature.
3. Run the local smoke script for cheap route-level proof.

Commands:

```bash
pnpm --filter quipsly exec next dev -p 3012
TARGET_URL=http://127.0.0.1:3012 pnpm quipsly:local:smoke
```

This catches broken auth pages, health routes, and Mac session boundary behavior
before Cloud Build enters the room and starts eating the furniture.

## Lane 2: targeted hotfix deploy

Use this for small urgent app fixes: auth, direct route recovery, obvious 500s,
or a high-priority production blocker.

The hotfix lane intentionally skips the beta manifest scan. It still:

- runs Quipsly typecheck by default
- runs local smoke automatically when the local app is already up
- builds with Cloud Build
- deploys a no-traffic tagged Cloud Run revision
- smokes the tagged preview URL
- promotes only when explicitly requested

Commands:

```bash
pnpm quipsly:hotfix:deploy
PROMOTE=1 pnpm quipsly:hotfix:deploy
```

For a faster repeat where the image already exists:

```bash
PROMOTE=1 SKIP_CLOUD_BUILD=1 IMAGE_TAG=<existing-tag> pnpm quipsly:hotfix:deploy
```

## Lane 3: full beta release

Use this when multiple lanes have landed and the release should represent the
current beta state of the product.

This lane keeps the beta manifest scan because that is its job. If Antigravity
lanes say "Needs Codex Review," the release should stop.

Commands:

```bash
pnpm quipsly:cloudrun:promote-preview
```

## Lane 4: Database Schema Sync (Production)

Use this when you have added new tables or columns to `schema.prisma` (like Auth models or `pgvector`) and need them deployed to the live Cloud SQL database.

**Crucial Context:** You cannot run `prisma db push` directly from your local machine to production because the production database requires the Google Cloud SQL Auth Proxy. Furthermore, standard Prisma migrations might fail if they conflict with the raw additive SQL files in `ops/`.

To safely sync the production database:
1. Make your changes to `schema.prisma`.
2. Do **NOT** run `prisma migrate dev` if it crashes on shadow DB constraints.
3. Run the schema sync Cloud Run Job, which automatically connects to the live database using the Secret Manager connection string:

```bash
# Deploys the new schema.prisma to a Cloud Run Job and executes prisma db push --accept-data-loss
bash scripts/release/quipsly-schema-sync.sh

# If the Docker image is already built and you just need to re-run the push:
SKIP_BUILD=1 IMAGE_TAG=<existing-tag> bash scripts/release/quipsly-schema-sync.sh
```

## Escalation rule

If the same class of failure appears three times, stop patching the symptom and
re-architect that slice. Examples:

- repeated Google OAuth redirect mismatches means fix auth ownership and
  provider configuration, not another button label
- repeated deploy context failures means split build contexts and ignore rules,
  not another one-off retry
- repeated Mac session failures means separate native API auth from embedded web
  session truth, not another hidden WebView hack

This is a bias toward learning, not a permanent law. If the rule itself causes
friction, revisit it with evidence.

## Deploy Captain role

The deploy captain should use the same lane selection:

- hotfix lane for urgent production blockers
- full beta release lane for broad multi-agent releases
- no deploy when local proof is enough

The deploy captain should report:

- lane chosen
- exact image tag and Cloud Run revision
- smoke results
- whether traffic was promoted
- any new failure class that should trigger escalation
