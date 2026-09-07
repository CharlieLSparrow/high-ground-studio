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
The workflow accepts PRs into integration branches as well as the main branch.
It can also be run manually against a selected branch and comparison ref; the
manual path checks changes since their merge base, not just the latest commit.
Pushes alone do not run this workflow. Confirm a workflow run for the exact
commit before calling it CI-validated; local results are separate evidence.
The full suite uses two workers with an absolute 512 MB idle recycle threshold;
focused debugging can still use `--runInBand`. Database integration tests explicitly opt in with
`QUIPSLY_LOCAL_DB_SMOKE=1` and `QUIPSLY_LOCAL_DATABASE_URL`; the ordinary Jest PR
step does not claim those integration tests ran. A separate PR step applies all
migrations to a fresh disposable PostgreSQL 15/pgvector service and executes the
Nest-creation, project-access, project-command, canonical-note-edit, conversation,
follow-through, client-space membership, and Session-access database
suites. It checks real membership, revocation, private-goal visibility,
cross-project IDs, transactions, message retry deduplication, complete paginated
history, private-client isolation from Nest owners/editors, single-Session guest
access, membership revocation over retained bookings, and persistence; only the request identity and
Next.js cache adapter are mocked for the command tests. It does not prove the
Firebase login flow or deployed permissions. The scheduling endpoint suite also
converts held time into a booking and room in the original client space, checks
participant identities and retained notes, races duplicate submissions, and
rejects removed members and other coaches. Only request identity and subscription
eligibility are mocked there; scheduling and persistence use the real database.
No production database or cloud
credentials are available to that step. Migration and test logs are retained.
The same selected-suite list is passed to Jest and its result verifier. Each
selected file must report executed passing assertions; skipped, empty, missing,
substituted, or duplicated suites fail even if Jest exits successfully. This
checks execution, not the completeness of the assertions or real login behavior.
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

The manual Nest deployment preflight also runs the full application Jest suite
from its materialized commit before the production build. Before installing
dependencies it recomputes the materializer's source-file inventory and checks
the receipt's release identity. Modified, added, missing, or symlinked inputs
stop before installation; the ordinary preflight automatically creates a fresh
context each time. For a direct retry, materialize the commit again rather than
reuse a directory containing generated dependencies and build outputs. This is
an accidental-drift check, not an independently signed provenance attestation.
A failed test prevents
the build from starting; stdout and JSON results remain in the printed temporary
results directory outside the upload context. This does not opt into database
tests or substitute for the separate database and operated-workflow checks.
Cloud Run workflow runs use one deployment-target concurrency group across
branches, without cancelling an active deployment. This coordinates GitHub
runs; it is not a distributed lock against separately invoked local scripts.

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

Capture evaluates PRs into every branch. A lightweight Linux job uses the same
release-manifest planner as local validation to decide whether Mac tests are
needed; there is no separate workflow path allowlist. Manual runs always test
Capture, with critical or full coverage selectable. The stable `Capture
validation` check distinguishes an unaffected change from successful simulator
tests and fails if required planning or testing failed, was cancelled, or was
unexpectedly skipped. Use this stable check when configuring branch protection;
workflow files alone do not enable protection. Pushes alone do not run this lane.

The routing regression test executes the workflow's actual shell steps against
a disposable Git repository, including multi-commit PRs, web-only changes,
previously omitted release tools, invalid comparison refs, and failed jobs:

```bash
node --experimental-strip-types --test scripts/ci/capture-ci-routing.test.mjs
```

This avoids the skipped-workflow/pending-check problem described in
[GitHub's workflow filtering documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore).

CI runs the deterministic Capture suite on the pinned iOS simulator. Release
claims additionally require:

1. archive and App Store export from an exact source SHA;
2. IPA signing and privacy-key verification;
3. install and workflow smoke on a physical iPhone;
4. TestFlight-installed smoke;
5. App Store Connect processing and compliance readback.

The shared UI runner checks both console execution/skip counts and every test's
bundle, class, method, and passing result in Xcode's structured `.xcresult`.
Matching counts alone are insufficient: substituted, missing, skipped, failed,
or repeated tests fail the run. Results are retained in the requested evidence
directory, or a printed temporary directory for local runs. Missing or unreadable
result bundles fail rather than falling back to a console-only success.
Fastlane qualification and pre-upload evidence readback use this same identity
verifier. CI and Fastlane route tests containing `RegularWidthIPad` to iPad;
an executable parity test checks all currently discovered selectors, avoiding a
separate release-only list that can silently omit new iPad coverage.

Native shared-work save recovery has a local fault-injection lane. Start Nest
and Firebase Auth emulators, then run the proxy in a separate terminal:

```bash
CAPTURE_WORK_RETRY_TITLE='Unique synthetic retry test title' \
  node apps/mobile-capture/HighGroundCapture/Testing/coaching-work-retry-proxy.mjs
```

Use the ordinary `run-capture-runtime-ui-smoke.sh` runner with mode
`coaching-work-retry`, base URL `http://127.0.0.1:3014`, synthetic account
credentials, an exact coaching Session ID/title, and task edit source/updated
titles. The source title must match `CAPTURE_WORK_RETRY_TITLE`; use new titles
for each run. The proxy forwards to local Nest on port 3012 only. It lets the
real create and amendment persist, then substitutes a failure response once
for each. The UI must retain the draft and finish with one work card. Also
read back the client-space API and confirm one canonical entry, not merely
one visible title. Stop the proxy after the run. Never use real client data.

`test-coaching-work-save.sh` tests immutable retry commands and field-level
amendments without a server. The native runtime runner also warms local
startup routes before launch; authentication errors are expected for protected
warm-up requests, but missing routes, redirects, and server failures stop the
run. Neither check substitutes for authenticated runtime or device evidence.

For ordinary transcript correction, use the native runtime runner's
`transcript-text-edit` mode with a synthetic account, Session ID/title, one
`QUIPSLY_CAPTURE_UI_TEST_TRANSCRIPT_SEGMENT_IDS` value, and
`QUIPSLY_CAPTURE_UI_TEST_TRANSCRIPT_PHONE_CORRECTION_TEXT`. It edits through the
real UI without listening or marking the passage reviewed, then relaunches and
reads the saved correction. No local-media fixture is required. Independently
read the corrections API afterward and verify the original provider text,
timing, recording identity, and participant-derived speaker remain intact.

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

The source mode validates historical configuration without claiming it qualifies
a newer binary. The final mode additionally requires provider/aggregate privacy
evidence to match the current release target, every declared screenshot to exist
at its recorded dimensions and be approved, and no remaining submission blockers.
Never change an old audit's build number to satisfy that check.

The Capture static checker reports all assertion failures together and exits
unsuccessfully if any fail. Its regression test removes permission declarations
in a disposable source-only copy and verifies the actual CLI reports both
failures; missing required files also fail. These are source checks, not
runtime evidence. Exact colors and superseded navigation labels do not belong
in App Store validation.

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

`quipsly-mobile-capture-contract-smoke.mjs` separates `source` checks from
`runtime` probes in its JSON and text reports. `--source-only` never claims
network proof; `--runtime-only` requires no source checkout. Production status
uses runtime-only mode so local code or UI wording cannot masquerade as a live
server failure. Neither mode proves a recorded artifact or physical device.
Navigation and recording-activity placement belong to rendered `SidebarLayout`
tests and `CaptureExperienceUITests`, not duplicate source-string expectations.

Shared logs and screenshots must use synthetic or approved data. Never attach
credentials, auth tokens, production database rows, private recordings,
transcripts, coaching details, or unpublished source material to CI or issues.
