# Session person, endpoint, and retained-source topology

Date: 2026-08-05

## Outcome

The browser Session workspace now gives producers one shared operational view
without collapsing three different identities:

1. a canonical person (`CallParticipant` plus current consent);
2. one or more call endpoints (durable provider-grant history plus separate
   current provider readback); and
3. one or more retained sources (`RecordingAsset`), including an explicit
   waiting state when only iPhone START/STOP receipts exist.

The projection is visible in both **Recording room** and **Takes**. This is a
projection over existing canonical models, not a new mutable readiness table or
a schema migration.

## Architecture

`buildSessionReadinessTopology` projects:

- active canonical Session participants;
- the latest provider grant per participant and client installation;
- current versioned recording, video, and transcription consent;
- attributed RecordingAssets and their reported browser/iPhone source profile;
- capture-owner START/STOP receipt trails that do not yet have a RecordingAsset;
- explicitly unassigned sources rather than guessed ownership.

The client separately reads `/api/sessions/[roomId]/presence`. It refreshes
every twenty seconds only while the page is visible, and on explicit operator
request. Provider identity and credential material never reach the client. The
live readback can show endpoint/track state, but it cannot change invitation,
participant, consent, recording, or source state.

These invariants remain explicit:

- person is not device;
- join grant is not presence;
- call track is not retained source;
- START/STOP receipt is not uploaded media;
- RecordingAsset owns retained-source truth;
- expired or renamed endpoint grants converge by client installation identity;
- staff crash compensation attributes a receipt to `captureOwnerUserId`, not
  the staff process that reconciled it.

The existing iPhone contracts already provide the required durable evidence:
capture owner, capture group, START/STOP receipts, participant binding, and the
source profile containing device model, app build, audio route, camera
position, resolution, frame rate, media format, and clock samples. No parallel
native identity or readiness store was added.

## Local dogfood

`pnpm quipsly:local:session-topology-dogfood` creates or converges a bounded
loopback-only fixture:

- Session `retained-session-topology-20260805`;
- one verified local QA participant and current consent receipt;
- one historical browser endpoint grant;
- one iPhone START/STOP receipt trail;
- zero RecordingAssets.

The script refuses a non-loopback database and requires an explicit operation
flag. It intentionally creates no fake byte-verification claim.

The signed-in local browser operation verified both Session surfaces. **Takes**
showed one person, one prepared endpoint, zero live endpoints, zero retained
assets, and one pending iPhone capture. The existing content-readiness and
source-evidence cards independently agreed that no uploaded media exists.
**Recording room** showed the same topology beside the Capture deep link,
invitation manager, persistent call dock, exact browser device selection,
private sound check, retained browser recorder, and Session thread. An explicit
live-room refresh returned `NOT_REQUIRED` for the planned fixture while
preserving the endpoint grant as history.

This qualifies the local browser projection and its fail-closed boundaries. It
does not claim physical iPhone presence, physical source upload, LiveKit
cross-device presence, TestFlight operation, or waveform alignment. Those
remain the next physical acceptance lane.

## Verification

- 6 focused Jest suites passed, 53 tests total.
- Quipsly `next typegen` and TypeScript typecheck passed.
- `git diff --check` passed before documentation updates.
- Signed-in local browser operation passed on both Recording room and Takes.

## Next acceptance slice

Use one real Session and two people to prove:

1. one person can appear simultaneously through browser call and iPhone
   Capture without becoming two people;
2. provider readback shows only currently connected endpoints;
3. iPhone START/STOP appears as pending source evidence immediately;
4. verified upload replaces the pending-only state with an attributed
   RecordingAsset;
5. browser and iPhone masters share the exact capture group while preserving
   their own clocks and immutable bytes; and
6. the complete source set can be reviewed, aligned, and deliberately attached
   to Studio.
