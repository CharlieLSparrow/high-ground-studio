# Testing and proof

Quipsly uses layered proof. Passing one layer does not imply the next.

| Layer | Question | Examples |
| --- | --- | --- |
| Source | Is the intended committed input present and scoped? | changed-surface planner, release context, source SHA |
| Deterministic | Does code compile and behavior pass without mutable external state? | unit tests, typecheck, simulator UI suite, production build |
| Local runtime | Can a person complete the workflow and read it back? | create note/task/goal/tag, reload, search |
| Credentialed runtime | Do identity, authorization, storage, and persistence work in the intended environment? | separate-account access test, staging upload |
| Delivery | Did the actual artifact reach the user-facing channel? | physical iPhone, TestFlight install, Cloud Run revision, published page |

## Repository checks

```bash
node --test scripts/ci/audit-repository-contract.test.mjs
node scripts/ci/audit-repository-contract.mjs
node --test scripts/ci/audit-binary-assets.test.mjs
node --test \
  scripts/dev/quipsly-local-doctor.test.mjs \
  scripts/dev/quipsly-local-lifecycle.test.mjs
node --test scripts/release/quipsly-production-status.test.mjs
node --test scripts/release/quipsly-capture-app-store-metadata.test.mjs
pnpm quipsly:capture:app-store-metadata
pnpm release:manifests:audit
node --experimental-strip-types --test scripts/ci/plan-changed-surfaces.test.mjs
bash scripts/ci/typecheck-typescript-7.sh
```

The release manifests define app ownership, build inputs, proof levels,
artifact provenance, and delivery targets. The changed-surface planner consumes
that validated contract; workflow path rules are not a separate source of
truth.

## Nest

```bash
pnpm --filter quipsly typecheck
pnpm --filter quipsly test --maxWorkers=2
pnpm quipsly:contracts:test
pnpm quipsly:release:local
```

The Jest application suite is a required PR check for Nest changes, separate
from the script-based source contracts. CI retains its JSON result even when it
fails, and preserves the process log if the runner crashes before writing JSON.
The full suite uses two workers with an absolute 512 MB idle recycle threshold;
focused debugging can still use `--runInBand`. Database integration tests explicitly opt in with
`QUIPSLY_LOCAL_DB_SMOKE=1` and `QUIPSLY_LOCAL_DATABASE_URL`; the ordinary Jest PR
step does not claim those integration tests ran. A separate PR step applies all
migrations to a fresh disposable PostgreSQL 15/pgvector service and executes the
project-access, project-command, canonical-note-edit, and follow-through database
suites. It checks real membership, revocation, private-goal visibility,
cross-project IDs, transactions, and persistence; only the request identity and
Next.js cache adapter are mocked for the command tests. It does not prove the
Firebase login flow or deployed permissions. No production database or cloud
credentials are available to that step. Migration and test logs are retained.
This follows GitHub's [PostgreSQL service-container pattern](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)
using the same [pgvector image family](https://github.com/pgvector/pgvector) as local development.
The contracts runner uses
Node's TypeScript transform mode because production worker classes use
parameter properties; strip-only mode cannot load them. Do not remove worker
coverage or rewrite working production syntax just to hide a runner failure.

The release gate runs the Nest and HGO production builds plus their shared
capture, coaching, public-route, App Store static, and schema contracts. When
`DATABASE_URL` is absent it supplies a loopback build-only value so a clean
checkout remains buildable; schema readiness is then an explicit non-blocking
warning, not a database-proof claim. This local command does not deploy.
Its production builds use ignored `.next-release` directories, so the gate can
run while the local Nest dev server continues using `.next`; a release check
must not require restarting the dogfood app.

Each Next.js output directory also receives an ignored, generated
`.quipsly-tsconfig-*.json` containing only that lane's route validators. The
source `tsconfig.json` stays stable; stale generated routes from a different
lab must not enter a production build. `pnpm --filter quipsly typecheck` runs
route generation and TypeScript against the selected lane. Check this isolation
with `node --test apps/quipsly/scripts/typescript-config.test.mjs`.

For visible product behavior, use the signed-in dogfood sequence in
[Nest local development](../runbooks/quipsly-nest-local.md): create records,
link them, find them across Home Nest, Work, Today, and Search, then reload.

Credentialed actor-private writing proof has a dedicated deployed-preview
harness:

```bash
QUIPSLY_PERSONAL_WRITING_PRIVACY_EXPECTED_SOURCE_SHA=<exact-40-character-sha> \
  pnpm quipsly:cloudrun:privacy-preview
```

The command refuses a non-HTTPS target, a runtime not marked `preview`, or a
health readback whose source/image tag differs from the explicit SHA. It creates
two disposable verified Firebase accounts, makes them Owner and Editor of the
same temporary Nest, creates the Owner's source-backed private draft through the
deployed Capture API, and attempts collaborator reads and mutations across
Today, Research export, Library, the Nest dashboard, a guessed writing URL,
annotation actions, canonical note editing, and document tags. A pass also
requires byte-stable canonical readback and independently verified database and
Firebase cleanup. Receipts redact generated email addresses and never retain
tokens, cookies, passwords, or database credentials.

## Capture

CI runs the deterministic Capture suite on the pinned iOS simulator. Release
claims additionally require:

1. archive and App Store export from an exact source SHA;
2. IPA signing and privacy-key verification;
3. install and workflow smoke on a physical iPhone;
4. TestFlight-installed smoke;
5. App Store Connect processing and compliance readback.

Use the checked-in toolchain runner so a collaborator and release operator use
the same Ruby, Bundler, Fastlane, Gemfile, lock, and lane:

```bash
apps/mobile-capture/HighGroundCapture/scripts/run-fastlane.sh verify
apps/mobile-capture/HighGroundCapture/scripts/run-fastlane.sh ui_test
apps/mobile-capture/HighGroundCapture/scripts/run-fastlane.sh release
```

The App Store listing is checked-in data with a source-level validator and a
stricter final-submission mode:

```bash
pnpm quipsly:capture:app-store-metadata
pnpm quipsly:capture:app-store-metadata --submission
```

The final mode requires every declared screenshot to exist at its recorded
dimensions, be approved, and have no remaining submission blockers.

Draft composition evidence has its own app-owned unit contract and simulator
journey:

```bash
node --test apps/mobile-capture/HighGroundCapture/scripts/app-store-draft-screenshots.test.mjs
bash scripts/release/quipsly-capture-screenshots-from-commit.test.sh
scripts/release/quipsly-capture-screenshots-from-commit.sh --revision <commit-sha>
bash apps/mobile-capture/HighGroundCapture/scripts/capture-app-store-draft-screenshots.sh
```

The preferred committed-source command produces exact-size images plus
fail-closed draft and source-isolation receipts under `/tmp`. The lower-level
simulator command is useful for current-worktree composition checks. Neither
approves assets or satisfies signed-candidate, physical-iPhone, or TestFlight
proof.

The `release` lane archives, exports, and verifies without uploading.
`scripts/deploy-testflight.sh` runs the `beta` lane and therefore requires an
explicit App Store Connect API key path, a clean committed Capture slice, and
all preceding gates. Neither command answers export compliance or substitutes
for installation on a physical iPhone.

## Schema changes

- Add forward-only Prisma migrations.
- Generate the client and validate affected packages.
- Apply only to an explicit safe target.
- Prove runtime behavior after migration.
- Document rollback or forward-repair strategy.

## Evidence safety

Shared logs and screenshots must use synthetic or approved data. Never attach
credentials, auth tokens, production database rows, private recordings,
transcripts, coaching details, or unpublished source material to CI or issues.
