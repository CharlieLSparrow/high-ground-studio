# iOS Capture Reviewer Smoke Checklist

Date: 2026-07-04
Status: draft, local/TestFlight readiness checklist
Target app: `apps/mobile-capture/HighGroundCapture`

## Purpose

This checklist is the human/device proof path for Quipsly Capture. Passing build checks proves the app compiles. This checklist proves the app behaves honestly for a reviewer or beta tester.

Quipsly Capture must make sensitive state obvious: signed in, selected session, provider readiness, consent, recording, upload, transcript, packet, privacy, and deletion.

Production calls should happen inside Quipsly-owned session rooms. LiveKit/WebRTC
is the first provider path for actual in-app room media when enabled. CallKit starts
with the native room workflow so those rooms can feel native on iOS, but it is not the recording system.
Regular Phone or FaceTime calls are fallback/import sources only and are not a
passing production capture path unless imported recording/transcript evidence is
visible in Quipsly.

LiveKit join readiness and LiveKit server-recording readiness are separate. The
readiness panel should make this visible: joining a room is not recording, local
recording still requires consent, and server/provider egress stays held unless
Nest reports explicit operator enablement.

## Before starting

- Run local preflight:

```bash
scripts/quipsly-mobile-capture-preflight.sh
```

- Run the source-only reviewer runway smoke whenever the reviewer setup UI,
  coaching runway, native auth smoke, or review digest route changes:

```bash
node scripts/quipsly-capture-reviewer-runway-static-smoke.mjs
```

  This does not sign in or mutate data. It proves the repo still contains the
  full reviewer path: `/admin/users` login setup, `/coaching` reviewer preset,
  app-owned booking/capture room creation, visible-session smoke, and review
  digest expectations.

- When Firebase/Admin credentials and the target Nest environment are ready,
  run the generated signed-in mobile proof:

```bash
RUN_GENERATED_AUTH_SMOKE=1 BASE_URL=https://nest.quipsly.com scripts/quipsly-mobile-capture-preflight.sh
```

- When a reviewer/test account has a Firebase email/password login and at
  least one planned coaching or podcast capture session, run the native-auth
  contract smoke. This mirrors the iOS sign-in path without printing tokens:

```bash
QUIPSLY_MOBILE_CAPTURE_AUTH_EMAIL=<reviewer email> \
QUIPSLY_MOBILE_CAPTURE_AUTH_PASSWORD=<reviewer password> \
RUN_NATIVE_AUTH_CONTRACT_SMOKE=1 \
BASE_URL=https://nest.quipsly.com \
scripts/quipsly-mobile-capture-preflight.sh
```

- Direct native-auth contract smoke, useful when you do not need the full
  iOS preflight:

```bash
QUIPSLY_MOBILE_CAPTURE_AUTH_EMAIL=<reviewer email> \
QUIPSLY_MOBILE_CAPTURE_AUTH_PASSWORD=<reviewer password> \
node scripts/quipsly-mobile-capture-native-auth-smoke.mjs \
  --base-url=https://nest.quipsly.com \
  --json
```

Secret-safe variant for local operator machines:

```bash
QUIPSLY_MOBILE_CAPTURE_AUTH_EMAIL=<reviewer email> \
node scripts/quipsly-mobile-capture-native-auth-smoke.mjs \
  --base-url=https://nest.quipsly.com \
  --password-file=/path/to/local-password-file \
  --json
```

Or use the macOS Keychain so passwords do not land in shell history:

```bash
QUIPSLY_MOBILE_CAPTURE_AUTH_EMAIL=<reviewer email> \
node scripts/quipsly-mobile-capture-native-auth-smoke.mjs \
  --base-url=https://nest.quipsly.com \
  --password-keychain-service=quipsly-capture-reviewer \
  --password-keychain-account=<reviewer email> \
  --json
```

- Direct reviewer visible-session smoke, useful when you only need to prove
  that the reviewer/test account has at least one real app-owned capture room
  visible to the native app:

```bash
bash scripts/quipsly-capture-live-reviewer-proof.sh
```

This is the preferred local operator command. It runs the static reviewer runway
contract first, reads the reviewer password from macOS Keychain, and then runs
the live visible-session proof with the standard reviewer defaults. The wrapper
is read-only by default and reuses retained private QA Sessions. Create a new
Session only when the account has none by setting
`QUIPSLY_CAPTURE_REVIEWER_CREATE_SESSION=1`. If the Keychain item is missing,
run:

```bash
bash scripts/quipsly-store-capture-reviewer-password.sh
```

The lower-level command is still useful when credentials are supplied by CI or a
different secret manager:

```bash
QUIPSLY_CAPTURE_REVIEWER_EMAIL=<reviewer email> \
QUIPSLY_CAPTURE_REVIEWER_PASSWORD=<reviewer password> \
node scripts/quipsly-capture-reviewer-session-smoke.mjs \
  --base-url=https://nest.quipsly.com \
  --json
```

This script supports the same secret-safe options:
`--password-file`, `--password-keychain-service`, and
`--password-keychain-account`.

- The native-auth smoke proves Firebase email/password sign-in, Quipsly bearer
  `/api/mac/session-check`, and authenticated `/api/mobile/capture/sessions`.
  It should fail if the reviewer account has no visible capture session. That
  failure is useful because App Review and beta testers need a real session,
  not an empty signed-in shell.
- The reviewer visible-session smoke is narrower. It reports the visible session count, candidate room, participant boundary, recording consent state,
  lifecycle/readiness state, and next safe action without printing tokens or
  passwords.
- When LiveKit room readiness needs to be proved after the visible-session
  smoke, run the consent-to-room proof:

```bash
bash scripts/quipsly-capture-consent-room-live-proof.sh
```

  This intentionally grants app-owned reviewer consent, inspects room join
  diagnostics, and prepares a short-lived LiveKit join token. It redacts token
  details and must still report no recording start, no provider join, no Stripe
  mutation, no Calendar mutation, no invite, and no media/storage mutation.
- If the visible-session smoke fails with no sessions, follow its
  `setupRunbook`: create or repair the login in `/admin/users`, then use the
  `/coaching` reviewer preset with `Schedule and create the private Session`. A signed-in
  empty shell is not enough for TestFlight or App Review.

- Confirm a reviewer/test account exists and can sign in.
- To create one intentionally, open `/admin/users` as a Quipsly admin and use
  the `Capture reviewer setup` card. That card creates or updates the Firebase
  email/password login, links the Firebase UID to the app-owned Quipsly user,
  and repairs free starter/Home Nest state. It does not create a coaching
  session by itself.
- Create a visible reviewer capture session before handing the app to App
  Review or a beta tester:
  - Open `/coaching` as a Quipsly staff/admin user.
  - Use the local session creator and load the `Reviewer-safe capture session
    preset`.
  - Confirm the email is `reviewer-capture@dev.test`, or replace it with the
    actual reviewer account.
  - Use `Schedule and create the private Session`, not a hold-only path, when the goal
    is a reviewable iOS capture session.
  - Keep the side-effect boundary intact: this creates Quipsly-owned booking,
    room, requested consent, and calendar receipt-slot state. It does not
    charge, invite, publish, or create an external calendar event.
- Confirm the account has at least one planned coaching or podcast capture session.
- Confirm the authenticated review digest loads:
  `/api/mobile/capture/review-digest`.
- Confirm the digest reports
  `packetKind:"quipsly-mobile-capture-review-digest-v1"`, at least one visible
  session, blockers if any, and the next safe action. The digest is read-only:
  it must not join a room, start recording, mutate payment state, or publish.
- Confirm the native Session screen shows the same digest in the
  `MobileCaptureReviewDigestPanel` after sign-in, beside the capture runway.
- Confirm the digest shows `Read-only reviewer packet`. Refreshing this panel
  must not join rooms, start recording, charge, publish, schedule, invite,
  upload, or delete media.
- Confirm the selected session lifecycle card shows "Safe next actions" and
  at least one action boundary. These rows should explain what is safe to do
  next; they must not auto-record, auto-charge, auto-publish, or hide external
  side effects.
- Confirm the app frames Quipsly in-app rooms as the production call path.
  Regular Phone/FaceTime calls should not be presented as the primary recording
  workflow.
- Confirm the session starts with recording consent not granted.
- Confirm the app can reach the intended Nest environment.
- Use fake/test content only.
- Do not record a real coaching call without explicit approval.

## Device smoke path

1. Install the app on a physical iPhone or TestFlight build.
2. Open the app cold.
3. Sign in with the reviewer/test account.
4. Confirm the home/session screen explains what Quipsly Capture does.
   - On iPad, confirm the Session screen also shows the capture runway with session, consent, recording, upload recovery, transcript, review digest, and next-action state.
5. Select a planned coaching or podcast session.
6. Confirm the selected session shows:
   - session title;
   - participant/role context;
   - provider readiness or local fallback;
   - consent state;
   - upload/transcript/packet readiness;
   - next safe action;
   - safe next-action rows with plain-English boundaries.
7. Tap provider room controls if available:
   - Join room;
   - Mute/unmute;
   - Leave room.
8. Confirm joining a provider room does not automatically start Quipsly recording.
9. Grant recording consent.
10. Confirm consent is visible and revocable.
11. Trigger microphone permission if not already granted.
12. Start a short local test recording.
13. Confirm recording state is visibly active while recording.
14. Stop recording.
15. Confirm local recording evidence is visible.
16. Trigger upload if not automatic.
17. Confirm upload success or recoverable held state is visible.
18. If upload fails, confirm retry/recovery language is calm and actionable.
19. Run transcript if available.
20. Confirm transcript status and segment count appear after completion.
21. Build packet if available.
22. Confirm notes/action items/packet evidence appear without claiming fake publication.
23. Open Account or privacy area.
24. Confirm privacy route is visible.
25. Confirm account deletion request path is visible.
26. Force quit and relaunch.
27. Confirm held recordings/upload state survive relaunch.

## Pass criteria

- Recording never starts secretly.
- Recording cannot start until explicit consent is granted.
- Provider-room join is visibly separate from Quipsly recording.
- Local recording is preserved until upload is verified or visibly held for recovery.
- Failed upload has a retry path.
- Transcript and packet state are evidence-based, not fake success copy.
- Privacy and deletion paths are easy to find.
- The app is calm when something is not configured.

## Fail immediately if

- The app records without a visible user action.
- Consent is auto-granted as part of starting a recording.
- The app hides active recording state.
- Upload failure discards or hides the local recording.
- The app claims a transcript, packet, publication, payment, or provider recording exists without evidence.
- The user cannot find account deletion initiation from inside the app.

## Notes for App Review

Suggested reviewer note:

Quipsly Capture is an explicit-consent capture app for coaching, podcast, interview, and field-note sessions. The reviewer account includes a test session. Recording starts only after the user selects a session and grants visible recording consent. Provider-room join and Quipsly recording are separate actions. Local recordings are preserved until upload is verified, and users can initiate account deletion from the app.
