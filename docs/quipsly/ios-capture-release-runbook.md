# Quipsly Capture release runbook

Owner: Quipsly release operator

Applies to: `com.highgroundodyssey.HighGroundCapture`

Canonical entry point: `scripts/deploy-testflight.sh`

This runbook releases one immutable Quipsly Capture commit. It deliberately
separates source, archive, upload, processing, tester assignment, installation,
and operated-product truth. Reaching an earlier state never implies a later one.

## Release state model

| State | Required evidence | Does not prove |
|---|---|---|
| Source ready | Exact commit SHA; TypeScript 7, contracts, source verifier, and local release gates pass | Signed app, production parity |
| Production compatible | The same backend commit is deployed; production mobile routes and privacy boundaries pass | iOS archive or upload |
| Archive verified | Signed `.xcarchive` and `.ipa`; packaged metadata, entitlements, profiles, and SHA-256 receipt pass | App Store Connect received it |
| Upload returned | Fastlane upload returns and its processing wait completes; receipt says `uploadPerformed: true` | Tester assignment or installation |
| Tester available | App Store Connect shows the exact version/build in the intended internal group | A device installed it |
| Device operated | TestFlight installs the exact build on a physical iPhone and the critical drills pass | App Review approval |
| Submission ready | Privacy, export compliance, screenshots, review account/session, notes, support, deletion, and legal surfaces match the binary and production | Apple approval |

Apple requires every uploaded build to have a unique build string and processes
the upload before it appears in App Store Connect. TestFlight builds remain
available for testing for up to 90 days. See
[Uploading builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds),
[TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/),
and [View builds and metadata](https://developer.apple.com/help/app-store-connect/manage-builds/view-builds-and-metadata/).

## Non-negotiable source boundary

Never release directly from the primary checkout. The canonical entry point:

1. resolves `--revision` to a full commit SHA;
2. creates a temporary detached Git worktree at that SHA;
3. invokes the repository-pinned Ruby, Bundler, Fastlane, Xcode project, scheme,
   and package graph inside that worktree;
4. writes artifacts below a SHA- and run-keyed output directory outside both
   the worktree and repository;
5. removes the disposable worktree after success or failure.

Uncommitted files in the primary monorepo cannot enter the archive. This is
the intended use of a detached worktree for isolated testing/build work; see
[git-worktree](https://git-scm.com/docs/git-worktree.html).

The direct Fastlane `beta` lane also rejects an upload unless the isolation
marker is present. `scripts/deploy-testflight.sh` is therefore the supported
upload interface.

## Operator credentials

### Google Cloud and Firebase

The production-parity phase requires working user credentials and Application
Default Credentials:

```bash
gcloud auth login --update-adc --brief
gcloud auth application-default set-quota-project quipsly-reef
bash scripts/release/quipsly-gcloud-auth-check.sh
```

The check must pass token minting, `high-ground-odyssey` access,
`quipsly-reef` access, and a Firebase Admin call. It prints no tokens.

### GitHub

The candidate commit must be pushed and its protected checks read back:

```bash
gh auth login
gh auth status
```

### App Store Connect

Keep the Fastlane API-key JSON outside the repository, use an absolute path,
and restrict the file:

```bash
chmod 600 /absolute/private/path/app-store-connect-api-key.json
export APP_STORE_CONNECT_API_KEY_PATH=/absolute/private/path/app-store-connect-api-key.json
```

Do not paste the key, issuer ID, or private key into a command, issue, log,
commit, receipt, or runbook. Fastlane recommends App Store Connect API-key
authentication and waits for build processing when
`skip_waiting_for_build_processing: false`; see
[upload_to_testflight](https://docs.fastlane.tools/actions/upload_to_testflight/).

## Candidate preflight

Start from the intended commit, not an uncommitted working-tree snapshot:

```bash
candidate_sha="$(git rev-parse HEAD)"
git show --stat --oneline "$candidate_sha"
git branch --contains "$candidate_sha"
```

The candidate must have a unique `CURRENT_PROJECT_VERSION`, shared by the app
and Share Capture extension. Do not let automation silently increment it.

Run the complete TypeScript 7 authority and Quipsly release gates:

```bash
bash scripts/ci/typecheck-typescript-7.sh
pnpm quipsly:contracts:test
pnpm quipsly:release:local
node scripts/quipsly-mobile-capture-contract-smoke.mjs \
  --base-url=http://127.0.0.1:3012
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
apps/mobile-capture/HighGroundCapture/scripts/verify-release-source.sh
scripts/release/quipsly-capture-release-from-commit.test.sh
```

The TypeScript gate is repository-wide and pinned to TypeScript 7.0.2. Every
tracked `apps/**/tsconfig*.json` and `packages/**/tsconfig*.json` must be
registered. New or touched TypeScript should use strict current constructs,
but compatibility work must not weaken the shared compiler gate or add a
shadow TypeScript compiler.

## Deploy and prove Nest first

Do not upload an iOS candidate whose required production routes return an HTML
404, redirect, or obsolete contract.

Build a no-traffic Nest preview from the same committed source and smoke it:

```bash
PROJECT_ID=high-ground-odyssey \
SOURCE_REF="$candidate_sha" \
corepack pnpm quipsly:cloudrun:deploy-preview

# Use the preview URL and credentials held outside source control.
PREVIEW_URL=<preview-url> \
QUIPSLY_AUTH_SMOKE_EMAIL=<reviewer-email> \
QUIPSLY_AUTH_SMOKE_PASSWORD=<secure-environment-value> \
scripts/release/quipsly-smoke-preview.sh
```

Promote only the verified preview through
`pnpm quipsly:cloudrun:promote-preview`, then require the full mobile contract
against production:

```bash
node scripts/quipsly-mobile-capture-contract-smoke.mjs \
  --base-url=https://nest.quipsly.com
pnpm quipsly:production:status
```

The deployed health/release evidence must identify the intended committed SHA.
A generic `{"ok":true}` response is availability evidence, not source parity.

## Build without uploading

Use this before any external mutation:

```bash
candidate_sha="$(git rev-parse HEAD)"
scripts/release/quipsly-capture-release-from-commit.sh \
  release \
  --revision "$candidate_sha"
```

Expected output directory:

```text
/tmp/quipsly-capture-release/<first-12-SHA>/<UTC-run-ID>/
```

It contains the signed archive, exported IPA, and
`QuipslyCapture-<version>.<build>-release-receipt.json`. Before upload, the
receipt must say:

```json
{
  "sourceRevision": "<full candidate SHA>",
  "sourceIsolation": "detached-worktree",
  "uploadAttempted": false,
  "uploadPerformed": false,
  "uploadOutcome": "not-attempted",
  "buildProcessingWaitReturned": false,
  "testerAssignmentPerformed": false,
  "physicalTestFlightInstallReadbackPerformed": false
}
```

Retain the receipt and SHA-256, not signing secrets or provisioning material,
with the release record.

## Upload to TestFlight

Uploading is an authorized external mutation. Supply concise, testable release
notes:

```bash
candidate_sha="$(git rev-parse HEAD)"
export QUIPSLY_CAPTURE_WHAT_TO_TEST="Verify Today, Record, Work, Library, and Account. Create a tagged Task in Work, record a consented short take, force-quit, relaunch, play the local original, and confirm protected upload/readback."

scripts/deploy-testflight.sh --revision "$candidate_sha"
```

The lane runs the deterministic iPhone/Share Capture suite, builds and verifies
the archive and IPA, uploads without external distribution or notification,
and waits for App Store Connect processing. Immediately before the network
call, an atomic receipt update records `uploadAttempted: true` and
`uploadOutcome: "unknown-until-app-store-connect-readback"`. This is the safe
state if the client times out after Apple may have accepted the build: inspect
App Store Connect before retrying. Only after the call and processing wait
return does the receipt set `uploadPerformed` and
`buildProcessingWaitReturned` to `true` with
`uploadOutcome: "returned-successfully"`. Tester assignment and physical
installation remain `false`.

## App Store Connect readback

In App Store Connect, read back the exact:

- app: Quipsly Capture, Apple ID `6780995957`;
- marketing version and build number;
- upload/processing state;
- export-compliance state;
- internal tester group assignment;
- “What to Test” text;
- build expiration date.

The app declares `ITSAppUsesNonExemptEncryption = NO`. The source audit found
only operating-system CryptoKit SHA-256 integrity/identifier hashing, HTTPS/TLS
transport, and the linked LiveKit/WebRTC media stack; no custom encryption,
proprietary algorithm, or app-enabled LiveKit end-to-end encryption was found.
This declaration means the binary uses no **non-exempt** encryption. The
account holder remains responsible for confirming export compliance for every
material dependency change. See
[ITSAppUsesNonExemptEncryption](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption)
and [Export compliance overview](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance).

If App Store Connect still says Missing Compliance, stop and inspect the
processed build and its packaged `Info.plist`; do not guess through the legal
questionnaire.

## Physical TestFlight acceptance

Install from TestFlight on the trusted iPhone and record the exact version/build
from the installed app and TestFlight. Perform at minimum:

1. sign in with the real beta identity and open a real visible Session;
2. create, tag, reopen, edit, complete, and sync a Task through Work/Nest;
3. create and tag a Note and Goal, then verify the same identities on Nest;
4. start a consented recording with the built-in microphone;
5. lock/unlock, background/foreground, route-change, interruption, and network
   loss/reconnect while preserving recording truth;
6. force-quit and relaunch; play the original through declared EOF;
7. resume/finalize upload and read back matching size, SHA-256, owner, Session,
   source, media, and processing state;
8. verify separate-account denial for the exact private URL/identity;
9. repeat the critical audio path with supported Bluetooth, wired, and USB
   routes that will be claimed;
10. hand the verified recording to Studio and proof-listen the canonical source.

Record failures with build number, device/iOS version, route, network state,
steps, screenshot or screen recording, and the durable source/receipt identity.
Never delete a local original merely to make a retry look clean.

## App Store submission gate

Submission requires all of the following for the exact installed build:

- production Nest committed-SHA parity and separate-account privacy proof;
- reviewer credentials plus a real visible Session and non-destructive steps;
- current privacy labels and generated archive privacy report;
- account deletion, Privacy, Terms, support, and retention behavior matching
  the binary and reviewer notes;
- current screenshots and metadata;
- export-compliance readback;
- physical capture, recovery, upload, transcript, Work, Nest, and Studio proof;
- no unresolved crash, data-loss, consent, accessibility, or reviewer blocker.

If the candidate fails after upload, increment the committed build number,
create a new commit, and repeat from source ready. Never replace evidence for
one build with evidence from another.

## Rollback and cleanup

- A failed isolated build removes only its temporary linked worktree. It does
  not alter the primary checkout.
- Release artifacts remain in the SHA-keyed output directory for diagnosis.
- A bad Nest preview receives no traffic; do not promote it.
- A bad TestFlight build is removed from tester groups or expires naturally;
  it is never treated as the next candidate.
- Source changes are repaired in a new commit. Do not patch an archived source
  tree or upload a locally modified rebuild under the same release record.
