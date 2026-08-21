# Quipsly Coaching cohort release handoff

Status: Build 33 and the matching Nest release are live; physical human
acceptance remains open.

This is the short operational handoff for the coaching-certification cohort.
It complements the detailed acceptance history in
[`coaching-cohort-release-acceptance.md`](./coaching-cohort-release-acceptance.md)
and the silent-observer journey in
[`coaching-human-flight-runbook.md`](./coaching-human-flight-runbook.md).
The current evidence matrix is
[`coaching-build33-release-report.md`](./coaching-build33-release-report.md).

## Release identity

Release only a clean committed source:

```bash
cd /Users/wall-e/Dev/high-ground-studio-coaching-20260819
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --short
```

Expected branch: `codex/quipsly-coaching-20260819`.

Do not copy a commit identifier into this document and let it become stale.
The fresh-flight receipt records the exact 40-character source commit and the
tracked-worktree state at the beginning of the operated flight. The preview
release maps that same commit to immutable image tag `source-<commit>`.

### Current deployed checkpoint

Read-only production checks on 2026-08-21 returned:

- Nest revision `studio-00523-yun` at 100% production traffic;
- immutable image tag
  `source-e73fef64880362f3c6c5fc793c5b047408d22a40` and matching source SHA;
- Cloud Run health `ok: true` at `https://nest.quipsly.com/api/healthz`;
- Quipsly Capture `1.0 (33)`, build ID
  `9a7944d0-55d7-46da-9755-694384fbe9fd`, as the intended public beta;
- HTTP 200 from `https://testflight.apple.com/join/XwRRcYUm`, an open beta,
  matching Quipsly Capture title and heading, and the exact `itms-beta`
  handoff.

The production revision intentionally retains release channel `preview`: the
guarded release process qualified one immutable no-traffic revision and moved
that exact revision to production. Creating a replacement revision merely to
rename the channel would discard the preview-to-production identity proof.

## What this candidate is intended to deliver

- one Quipsly account and one canonical data model across Nest and Capture;
- self-service coach setup without staff privileges;
- coach-created private client relationship, appointment, and exact-email
  Session invitation;
- a simple client surface that omits coach setup and unrelated Nest controls;
- browser and iPhone entry to the same consent-aware LiveKit room;
- independently owned local masters, resumable upload, verification, sync
  evidence, source-bound transcript, and protected playback;
- editable human-reviewed notes, goals, tasks, and commitments with explicit
  shared/private visibility;
- reversible light editing, private preview, named-recipient release,
  playback/download, and revocation;
- a public TestFlight installation recovery path when Capture is not installed.

## Evidence ladder

These lanes are complementary and never interchangeable.

1. **Source and contract** — production build, route tests, mobile contract,
   migration status, privacy tests, and release-script tests.
2. **Fresh UI start** — new coach and client accounts complete signup, coach
   setup, scheduling, the primary invitation action, one-time invitation
   acceptance, and client return through normal rendered surfaces without
   fixture IDs or database repair. Reserved local recipients are stopped before
   any external provider request and remain explicitly different from real mail.
3. **Fresh phone start** — a newly verified ordinary account enters the normal
   iPhone Today surface; the compiled app performs coach setup, client and
   relationship creation, scheduling, invitation attempt, fallback sharing,
   opens that relationship through ordinary navigation, creates a shared note,
   assigned task, assigned goal, and author-private note, then enters the exact
   Session. Independent API readback must find those canonical records and
   privacy boundaries. The local adapter verifies only the disposable mailbox
   identity and is named in the receipt.
4. **Fresh product automation** — the same new relationship continues through
   rendered call, work, and sharing surfaces plus explicitly identified service
   mechanics. Its receipt reports surface coverage and never calls the combined
   run pure UI automation.
5. **Fresh audible automation** — two isolated endpoints retain overlapping
   participant-owned masters and recover role-specific controlled speech.
6. **Physical-device flight** — real iPhone Capture plus browser/Mac operate the
   same Session, including interruption and upload recovery.
7. **Minimally instructed human flight** — real coach and client receive only
   the one-sentence mission and product invitation.
8. **Cohort operation** — release to 2, then 10, then 50 real coaches while
   support, privacy, recovery, and capacity evidence remain healthy.

Automation receipts must keep human, physical-device, real-mailbox, natural
speech, human-listening, and production-scale claims false.

## Local re-entry commands

```bash
cd /Users/wall-e/Dev/high-ground-studio-coaching-20260819

# Exact optimized web candidate.
pnpm --dir apps/quipsly build

# Product paths must not contain retained people or fixture identifiers.
npm run quipsly:coaching:fixture-boundary:test

# Local database must match the complete committed migration chain.
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio' \
  pnpm exec prisma migrate status

# Source and runtime contract, including unauthenticated privacy boundaries.
node scripts/quipsly-mobile-capture-contract-smoke.mjs \
  --base-url=http://127.0.0.1:3012 --json

# Full fresh two-account audible workflow. Its private receipt binds to HEAD.
npm run quipsly:fresh:coaching-speech-flight

# Fresh compiled-iPhone setup/schedule/invite/Session-entry workflow. The local
# adapter creates only a verified disposable identity; Capture owns the product work.
npm run quipsly:fresh:coaching-phone-start

# Fresh compiled-iPhone AVAudioRecorder, interruption, offline relaunch,
# immutable-source recovery, verification, and durable Studio handoff.
npm run quipsly:fresh:coaching-native-recovery

# Capacity identity/isolation ladder. These call authenticated service
# contracts; they do not operate or prove the rendered self-service UI.
QUIPSLY_DISTINCT_COACH_COUNT=2 npm run quipsly:local:distinct-coach-capacity
QUIPSLY_DISTINCT_COACH_COUNT=10 npm run quipsly:local:distinct-coach-capacity
QUIPSLY_DISTINCT_COACH_COUNT=50 npm run quipsly:local:distinct-coach-capacity
```

Receipts live under ignored, owner-readable directories:

- `artifacts/coaching-acceptance/<run>/fresh-coaching-flight-receipt.json`
- `artifacts/coaching-acceptance/phone-start-<run>/phone-start-receipt.json`
- `artifacts/coaching-capacity/distinct-<batch>-<count>.json`

## Production environment manifest

This lists names and policy, never secret values.

| Boundary | Production authority | Required readback |
| --- | --- | --- |
| Deploy project | `high-ground-odyssey` | accessible, billing enabled, billing account open |
| Firebase project | `quipsly-reef` | Admin preflight succeeds; authorized domains include Quipsly hosts |
| Web service | Cloud Run `studio`, `us-central1` | Ready revision, exact source/image labels, explicit traffic |
| Database | Cloud SQL `studio-postgres` | runnable, backup before migration, zero migration drift |
| Media | configured Quipsly media bucket | runtime identity can create/read only expected objects |
| Calls | LiveKit URL, API key, and API secret from Secret Manager | real two-participant join and provider reconciliation |
| Provider recording | separate LiveKit egress credentials and bucket | remains explicitly gated; never implied by joining |
| Transcription | dedicated worker plus provider secret | verified source creates completed source-bound job |
| Calendar | Google OAuth client, state secret, token encryption key | connection and event receipt readback without private-content leakage |
| Invitations | dedicated Resend API-key secret and verified sender | real message, delivery receipt, wrong-account denial, acceptance, resend, expiry, revoke |
| Release smoke | private release-smoke signing secret | preview receipt matches exact revision, hosts, and routes |
| Image proxy | dedicated proxy token secret | configured without exposing token |

The guarded preview script validates the exact Secret Manager names before it
creates a no-traffic revision. Feature flags must stay explicit; a missing
provider cannot silently become a successful local-only state in production.

## Schema and rollback plan

1. Materialize release context from the committed source.
2. Replay the complete migration chain against a disposable database.
3. Confirm no drift.
4. Create and read back a production Cloud SQL backup.
5. Run `prisma migrate deploy` through the guarded schema release job.
6. Confirm production migration status and drift again.
7. Deploy the immutable image to a no-traffic revision.
8. Smoke the preview before changing traffic.
9. Preserve the previously live revision identifier.
10. Promote only the qualified revision.

If runtime verification fails after promotion, restore traffic—not source or
database files—with:

```bash
ROLLBACK_REVISION=<previous-ready-revision> \
  scripts/release/quipsly-rollback.sh
```

Database rollback is restore-forward: stop writes, preserve the failed-state
evidence, restore the pre-migration backup to a separately named instance,
compare, and make an explicit recovery decision. Never destructively reverse a
production database from an unreviewed local command.

## Guarded production release

```bash
cd /Users/wall-e/Dev/high-ground-studio-coaching-20260819
bash scripts/release/quipsly-gcloud-auth-check.sh

PROJECT_ID=high-ground-odyssey \
SOURCE_REF=HEAD \
MIN_INSTANCES=0 \
MAX_INSTANCES=2 \
ENABLE_SESSION_INVITATION_EMAIL=1 \
ENABLE_TRANSCRIPT_WORKER=1 \
scripts/release/quipsly-deploy-preview.sh
```

The deploy command receives no production traffic. Follow its emitted preview
URL with `quipsly-smoke-preview.sh`, the authenticated two-account privacy
checks, and `quipsly-promote-preview.sh`. Run
`quipsly-production-status.sh` after promotion.

The invitation and transcript flags are part of this coaching release profile,
not optional demonstrations. The deploy fails closed before creating a preview
unless the invitation provider secret and the isolated transcript worker's
secret, immutable image, service account, media bucket, and exact executor IAM
boundary all read back successfully.

Do not change Cloud Run memory, concurrency, maximum instances, provider
recording, outbound invitation email, calendar attendee notification, or other
cost/external-communication settings without recording the proposal and
approval. A scale-to-zero minimum does not make unbounded maximum scale safe.

## TestFlight handoff

- App Store name: **Quipsly Capture**.
- Public beta URL: `https://testflight.apple.com/join/XwRRcYUm`.
- The public-link readback must report HTTP 200, open beta, matching title and
  heading, and the exact `itms-beta` handoff.
- App Store Connect must report the intended build valid, processed, assigned
  to the public group, and approved for external beta.
- A real iPhone must install or update through TestFlight, sign in through the
  ordinary account path, open the exact Session, and retain its own local
  master. Simulator and App Store API evidence do not prove installation.

Use [`ios-capture-release-runbook.md`](./ios-capture-release-runbook.md) for
archive/signing/privacy/upload procedure and
[`ios-capture-reviewer-smoke-checklist.md`](./ios-capture-reviewer-smoke-checklist.md)
for the reviewer journey.

## Open gates that must remain visible

- Google Cloud CLI user and ADC authorization passed on 2026-08-21. Re-run the
  repository auth check before a later release rather than assuming that
  time-limited credentials remain current.
- Production invitation email is not a pass until the dedicated credential and
  verified sender deliver to a real inbox.
- The earlier same-millisecond production burst failure remains useful limit
  evidence, not the current readiness result. A realistic 50-coach arrival over
  60 seconds passed 150/150 authenticated reads, and a local 50-distinct-coach
  identity/isolation run passed 150/150 reads with exact cleanup. Neither run
  proves 50 concurrent calls, uploads, transcripts, or people.
- No current physical iPhone is visible to Xcode, so physical installation,
  real microphone/camera behavior, backgrounding, restart, and human listening
  remain unproved.
- Minimally instructed human acceptance has not happened. No automated receipt
  may promote that state.

## Human release decision

Run the smaller Build 33 call milestone in
[`coaching-human-flight-runbook.md`](./coaching-human-flight-runbook.md) first.
It protects the people's time by proving installation, identity, invitation,
call entry, participant-owned recording, shared work, and return before asking
them to evaluate transcript correction and editing. It is a milestone, not a
replacement for this complete release decision.

After automated gates pass, give the coach only:

> Use Quipsly to invite this client, schedule and record a coaching Session,
> keep a shared note, task, and goal, then lightly edit and share the recording
> and transcript with the client.

Give the client only Quipsly's invitation. If the observer supplies a route,
menu name, record identifier, workaround, or database repair, retain the useful
diagnostic result but keep self-service acceptance failed. Release to 50 humans
only after the 2- and 10-coach cohorts complete the repaired journey without an
unresolved privacy, data-loss, invitation, call-entry, recording, transcript,
or recipient-access failure.
