# Client follow-up source readiness

Date: 2026-08-03

Status: implemented and operated on signed-in local Nest, disposable local
PostgreSQL data, and the compiled iPhone 17 Pro simulator; physical-iPhone and
production acceptance remain open

## Outcome

Coaches can no longer release an old client follow-up draft after one of its
selected notes, goals, or tasks changes or becomes ineligible. Every private
draft remains an immutable client-visible snapshot. Nest derives a separate
readiness projection by comparing that snapshot with the current canonical
records, and release fails closed until the coach saves a new private revision.

Nest and Quipsly Capture now show one of two explicit states:

- `Current sources verified` names the immutable revision and selected-record
  count while keeping release behind a separate recipient confirmation.
- `Release held — review current sources` names each invalid, missing,
  ineligible, selection-mismatched, or content-changed source and disables both
  confirmation and release.

Saving the current selections creates a new private revision; it never rewrites
the previous snapshot. A held draft is not silently refreshed and nothing is
released automatically.

## Canonical and concurrency boundary

- Each new source manifest stores the selected canonical IDs, their complete
  source anchors, and a deterministic SHA-256 of the client-visible fields.
  The manifest also records that its snapshot hash uses canonical JSON.
- Readiness independently verifies the follow-up body hash, manifest schema,
  room and recipient identity, body/manifest selection parity, current
  eligibility, and current canonical content for every selected record.
- A changed title, body/detail/description, status, date, or source anchor holds
  release. A deleted, private, otherwise ineligible, malformed, or mismatched
  selection also holds release.
- Legacy private drafts without the new canonical-hash boundary retain their
  historical body-hash behavior while all newly saved revisions use the
  stronger contract.
- Release repeats the complete readiness check inside the existing serializable
  transaction after reloading Session authority, recipient, output status, and
  revision. A racing change returns HTTP 409 `FOLLOW_UP_SOURCE_CHANGED` with
  structured readiness rather than releasing stale material.
- Drafts remain coach-only. Release stays inside the client's private Quipsly
  Session and does not send email, mutate a provider calendar, publish, or
  create notes, goals, tasks, or Studio edits.

## Operated Nest workflow

The rendered local app at `http://127.0.0.1:3012` was operated while signed in
as the retained coach on Session `retained-coaching-follow-up-20260731`.

1. Created a new private follow-up draft without changing the Session's
   existing released output.
2. Created one clearly named disposable canonical task and selected it into
   immutable draft revision 2 with three retained eligible records.
3. Read back `READY`, four selected canonical records, and revision 2 in the
   rendered interface.
4. Changed only the disposable task's canonical detail in local PostgreSQL.
5. Reloaded Nest and read the `SOURCE_CHANGED` alert naming that exact task.
   The confirmation and release controls were both disabled.
6. Saved revision 3 through the rendered interface and read back the changed
   task detail plus `Current sources verified` for all four selected records.
7. Stopped without releasing anything.

The disposable task and private revisions remain in the retained local QA
Session so later long-term testing can inspect them. They are test data, not a
real client delivery. The machine-readable receipt is retained at
`/Volumes/My Passport/Quipsly QA Artifacts/Client Follow-up Source Readiness 2026-08-03/nest-client-follow-up-source-readiness-receipt.json`.

## Verification

- Focused Nest unit, route, readiness, and component proof: 3 suites, 14 tests,
  pass. The database operation is opt-in and therefore skipped in this default
  group.
- Disposable-PostgreSQL integration operation: 1/1 pass. It proves stale hold,
  save-forward, release, revoke, idempotency, and cleanup. Its intentional
  concurrent mutation produces one Prisma serialization retry signal while the
  user-visible contract still passes.
- Nest strict TypeScript: pass.
- Mobile capture source contract: pass, including the shared readiness model
  and release-lock requirements.
- iOS App Store static contract: 1,016/1,016 pass.
- Compiled iPhone 17 Pro / iOS 26.3.1 simulator operation: 1/1 pass. It opens
  the coaching follow-up, reads the exact changed-source reason, captures the
  held interface as a permanent test attachment, and proves confirmation and
  release remain disabled.
- `git diff --check`: pass after documentation finalization.

The successful native result bundle is retained at
`/Volumes/My Passport/Quipsly QA Artifacts/Client Follow-up Source Readiness 2026-08-03/HighGroundCapture-client-follow-up-source-readiness.xcresult`.

## Remaining acceptance

This is signed-in local Nest, disposable local database, and simulator proof,
not physical-iPhone or production proof. A future acceptance run must save a
real coaching follow-up on a paired iPhone, make a deliberate canonical change
from another authorized surface, observe the hold on both devices, save the
new immutable revision, and read the released identity and wording back as the
client. Separate-account privacy, network-loss/retry, production deployment,
and authorized delivery readback also remain required by the unified goal.

No Cloud Build, Cloud Run deployment, production database write, provider
mutation, TestFlight/App Store action, invitation, external message, calendar
change, delivery, or publication occurred in this slice.
