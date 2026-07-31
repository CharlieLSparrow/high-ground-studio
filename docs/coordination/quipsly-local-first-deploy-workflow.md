# Quipsly local-first deploy workflow

Last updated: 2026-07-31

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

## Lane 4: guarded production schema release

Use this only when the exact release commit adds committed Prisma migrations.
Production schema work is not a hotfix shortcut: it must be replayable from
baseline, recoverable from a verified backup, and bound to one source SHA.

1. Create and review a migration under `prisma/migrations/`.
2. Run the guarded command without `--apply`; review its mode-0600 plan receipt.
3. Re-run from the same clean commit with `--apply` and the exact target
   confirmation.
4. Preserve the receipt with the release evidence.

```bash
release_sha=$(git rev-parse HEAD)
bash scripts/release/quipsly-schema-release.sh \
  --revision "$release_sha" \
  --confirm-target high-ground-odyssey/studio-postgres

bash scripts/release/quipsly-schema-release.sh \
  --revision "$release_sha" \
  --apply \
  --confirm-target high-ground-odyssey/studio-postgres
```

The apply lane proves the complete migration chain and zero schema diff in a
disposable database, pins an immutable schema-image digest, creates and reads
back an on-demand Cloud SQL backup, runs `prisma migrate deploy`, then requires
both a current migration ledger and zero production diff. The legacy
`quipsly-schema-sync.sh` bridge and targeted additive jobs are recovery tools,
not release stages.

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
