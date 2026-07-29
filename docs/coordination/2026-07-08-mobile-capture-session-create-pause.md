# Mobile capture session-create pause

Paused: 2026-07-08 16:24 MDT

Reason: Charlie shifted priority back to Episode 4 sync. The mobile capture session-create lane was still safe: only inspection and planning had happened in this continuation, with no partial patch applied.

Current finding:
- `/api/mobile/capture/sessions` is currently GET-only.
- The native iPhone capture UI can list sessions, but still points users elsewhere to create or assign one.
- Next best continuation is a narrow POST route that creates a Quipsly-owned `CallRoom`, host participant, and requested recording consent without external calendar/Stripe/invite/recording side effects.

Resume trigger:
- Return when the coaching/capture app needs native quick-session creation from the iPhone front door.

## Resumed update: 2026-07-08 evening

Status: resumed and advanced.

What changed:
- `/api/mobile/capture/sessions` now has a safe authenticated `POST` contract for quick session creation.
- The native Capture bridge has `CaptureSessionClient.createQuickSession(title:purpose:provider:)`.
- The native Capture UI now shows a first-class `Create Quipsly session` action before consent and recording controls.
- Source contract smoke now checks that session creation creates app-owned room paperwork only: no recording, no LiveKit join/token, no calendar mutation, no Stripe mutation, no invite, no external publish.

Validation:
- `QUIPSLY_MOBILE_CAPTURE_SOURCE_ONLY=1 node scripts/quipsly-mobile-capture-contract-smoke.mjs --json`
  - Result: pass, 44 checks.
- `bash apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator`
  - Result: pass, HighGroundCapture simulator build completed with LiveKit linked.

Current boundary:
- This proves the native app can compile with the quick-session creation surface and that the source contract keeps creation side-effect-safe.
- It does not yet prove a live authenticated device created a production Nest session from the UI. Next proof should use a simulator/device token against local or deployed Nest and then read back the created room/session.

## Resumed update: 2026-07-08 late evening - authenticated create/readback seam

Goal movement:

- Extended `scripts/quipsly-capture-reviewer-session-smoke.mjs` with an explicit opt-in `--create-session=1` mode.
- Default reviewer smoke remains read-only.
- Opt-in mode signs in with Firebase, POSTs to `/api/mobile/capture/sessions`, verifies app-owned room/participant/requested-consent records, verifies no external side effects, reloads sessions, and checks the created room is visible to the native app session list.

Safety boundary proven by code contract:

- `recordingStarted: false`
- `providerJoined: false`
- `providerTokenMinted: false`
- `calendarMutated: false`
- `stripeMutated: false`
- `externalInviteSent: false`

Validation run:

- `node --check scripts/quipsly-capture-reviewer-session-smoke.mjs` passed.
- `QUIPSLY_MOBILE_CAPTURE_SOURCE_ONLY=1 node scripts/quipsly-mobile-capture-contract-smoke.mjs --json` passed with `44` passing checks.

Live proof status:

- Live create/readback was not run because this Mac did not have a reviewer password stored in Keychain for `codex@dev.test` under the checked service names: `quipsly-capture-reviewer`, `quipsly-native-smoke`, `quipsly-mobile-capture-smoke`, or `quipsly-auth-smoke`.
- Next live proof command, after storing the password in Keychain:

```bash
node scripts/quipsly-capture-reviewer-session-smoke.mjs \
  --base-url=https://nest.quipsly.com \
  --email=codex@dev.test \
  --password-keychain-service=quipsly-capture-reviewer \
  --password-keychain-account=codex@dev.test \
  --create-session=1 \
  --json
```

Truth note:

- This is still not goal completion. It improves the native Capture production runway by making app-owned session creation and readback testable without touching Stripe, Calendar, LiveKit media, invites, recordings, publishing, or provider tokens.

## Resumed update: 2026-07-08 night - transcript recovery evidence in native app

Goal movement:

- Preserved the transcript run response in native state via `latestTranscriptRunResponse`.
- Added native transcript evidence copy that distinguishes:
  - transcript job created/repaired from uploaded recording evidence,
  - already-complete transcript reuse,
  - normal linked transcript job execution.
- Added `TranscriptRunEvidenceCard` in the post-capture controls so reviewers, humans, and agents can see what actually happened after pressing transcript actions.
- Updated the mobile capture contract smoke so this evidence affordance stays covered.

Why it matters:

- The backend already supports the important recovery case: a recording asset exists but no transcript job exists yet.
- The native UI now exposes that recovery truth instead of collapsing it into a generic success message.
- This reduces systems anxiety in the exact failure mode where users most need confidence: “I recorded something; did Quipsly actually know what to do with it?”

Validation run:

- `node --check scripts/quipsly-mobile-capture-contract-smoke.mjs` passed.
- `QUIPSLY_MOBILE_CAPTURE_SOURCE_ONLY=1 node scripts/quipsly-mobile-capture-contract-smoke.mjs --json` passed with `44` passing checks.
- `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs --json` passed.
- `bash apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator` passed; HighGroundCapture simulator build succeeded with LiveKit linked.

Truth note:

- This is not goal completion. It improves the capture app’s post-recording recovery path and App Store/reviewer clarity. The next provider proof remains: join a Nest-issued room packet on simulator/device, then record/upload/transcribe through the live app path.

## Resumed update: 2026-07-08 night - native workflow map validated

Goal movement:

- Confirmed the native `RecorderControlBoard` includes `CaptureWorkflowMapCard`.
- The map shows the capture chain explicitly: create session, grant consent, join room, record locally, upload source, transcribe, build packet.
- The map states the critical product boundary in-app: joining a room is not recording; provider receipts are not media; packets are review artifacts until human approval.
- Confirmed source-smoke coverage protects this surface so future capture changes do not erase the calm workflow map.

Validation run:

- `node --check scripts/quipsly-mobile-capture-contract-smoke.mjs` passed.
- `QUIPSLY_MOBILE_CAPTURE_SOURCE_ONLY=1 node scripts/quipsly-mobile-capture-contract-smoke.mjs --json` passed with `44` passing checks and `0` failures.
- `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs --json` passed with `0` failures.
- `bash apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator` passed; HighGroundCapture simulator build succeeded with LiveKit linked.

Truth note:

- This improves native workflow clarity, reviewer clarity, and agent usability.
- This is not goal completion. It does not yet prove a full live device flow through room join, consent, local recording, upload, transcript recovery, packet creation, and Nest review.
- Next best provider proof remains: run an authenticated live create/readback smoke, then use simulator/device to join a Nest-issued room packet and continue through record/upload/transcribe evidence.

## Keychain setup helper for live reviewer proof

Current live-proof blocker:

- No macOS Keychain item exists yet for `codex@dev.test` under `quipsly-capture-reviewer`.
- Do not paste the reviewer password directly into CLI flags, shell history, process lists, or logs.

Safe setup:

```bash
bash scripts/quipsly-store-capture-reviewer-password.sh
```

Then run:

```bash
node scripts/quipsly-capture-reviewer-session-smoke.mjs \
  --base-url=https://nest.quipsly.com \
  --email=codex@dev.test \
  --password-keychain-service=quipsly-capture-reviewer \
  --password-keychain-account=codex@dev.test \
  --create-session=1 \
  --json
```

Truth note:

- The helper stores only the reviewer password in macOS Keychain.
- It does not contact Nest, Firebase, Stripe, Calendar, LiveKit, or storage.
- It exists so live capture smokes can be repeated without leaking credentials.

## Resumed update: 2026-07-08 night - CallKit boundary promoted into main contract smoke

Goal movement:

- Promoted the CallKit/native-room boundary into `scripts/quipsly-mobile-capture-contract-smoke.mjs`.
- The main capture contract now protects that CallKit is only native iPhone presentation for a Quipsly-owned provider room.
- The contract explicitly protects the boundary that CallKit does not own recording, consent, transcript, packet, or review truth.
- The UI boundary card still explains: not phone/FaceTime, join is not recording, and Nest CallRoom truth owns the operational record.

Validation run:

- `node --check scripts/quipsly-mobile-capture-contract-smoke.mjs` passed.
- `QUIPSLY_MOBILE_CAPTURE_SOURCE_ONLY=1 node scripts/quipsly-mobile-capture-contract-smoke.mjs --json` passed with `45` passing checks and `0` failures.
- `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs --json` passed with `0` failures.
- `bash apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator` passed; HighGroundCapture simulator build succeeded with LiveKit linked.

Truth note:

- This strengthens the architecture requirement that CallKit is part of the real native workflow now, not deferred later-work.
- This is not full goal completion. The live provider path still needs authenticated reviewer create/readback and simulator/device proof through join, consent, recording, upload, transcript, packet, and Nest review.

## Resumed update: 2026-07-08 night - room-state evidence card

Goal movement:

- Preserved the latest `/api/mobile/capture/rooms/state` response in native state as `latestRoomStateResponse`.
- Added room-state truth and next-action copy to `MobileCaptureRoomStateResponse`.
- Added `RoomStateEvidenceCard` in the native post-capture controls so OPEN/END/START_RECORDING/STOP_RECORDING actions leave visible app-owned evidence.
- Extended the mobile capture contract smoke to protect the room-state evidence readback alongside transcript and packet evidence.

Validation run:

- `node --check scripts/quipsly-mobile-capture-contract-smoke.mjs` passed.
- `QUIPSLY_MOBILE_CAPTURE_SOURCE_ONLY=1 node scripts/quipsly-mobile-capture-contract-smoke.mjs --json` passed with `45` passing checks and `0` failures.
- `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs --json` passed with `0` failures.
- `bash apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator` passed; HighGroundCapture simulator build succeeded with LiveKit linked.

Truth note:

- This improves native operational truth for room state, but it does not prove live device capture yet.
- The live reviewer create/readback proof is still waiting for the `quipsly-capture-reviewer` Keychain credential.
- Next best live command remains the authenticated create/readback smoke, followed by simulator/device proof through join, consent, room-state update, local recording, upload, transcript recovery, packet creation, and Nest review.

## Resumed update: 2026-07-08 night - session context promoted into main contract smoke

Goal movement:

- Confirmed the native app already has `CaptureSessionContextPanel` for quick notes, goals, and tasks.
- Confirmed the panel supports phone-local drafts plus explicit `Load Nest` / `Save Nest` controls for shared room context.
- Promoted session context into `scripts/quipsly-mobile-capture-contract-smoke.mjs` so the primary capture contract now protects the notes/goals/tasks workflow.
- The protected boundary is: local phone drafts are allowed for recovery, Nest owns shared session context, and recording consent, transcripts, packets, and publishing receipts remain separate evidence.

Validation run:

- `node --check scripts/quipsly-mobile-capture-contract-smoke.mjs` passed.
- `QUIPSLY_MOBILE_CAPTURE_SOURCE_ONLY=1 node scripts/quipsly-mobile-capture-contract-smoke.mjs --json` passed with `46` passing checks and `0` failures.
- `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs --json` passed with `0` failures.
- `bash apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator` passed; HighGroundCapture simulator build succeeded with LiveKit linked.

Truth note:

- This advances the goal requirement that users can see and manage notes/goals/context around a real capture session.
- This is not full goal completion. The live authenticated reviewer proof and full simulator/device flow are still pending.

## Resumed update: 2026-07-08 night - live reviewer proof runner

Goal movement:

- Added `scripts/quipsly-capture-live-reviewer-proof.sh` as the preferred local operator command for App Store/TestFlight reviewer proof.
- The runner checks the static reviewer runway contract, reads the reviewer password from macOS Keychain, and runs `scripts/quipsly-capture-reviewer-session-smoke.mjs` with the standard reviewer defaults.
- The runner defaults to creating a harmless Quipsly-owned reviewer session when needed, but it does not charge, invite, publish, start recording, or create external calendar events.
- Wired the runner into `scripts/quipsly-mobile-capture-preflight.sh` behind `RUN_CAPTURE_LIVE_REVIEWER_PROOF=1`.
- Extended `scripts/quipsly-capture-reviewer-runway-static-smoke.mjs` so the reviewer setup sequence points to the wrapper and protects its Keychain/create-session contract.
- Updated the iOS Capture App Store readiness docs and reviewer smoke checklist to lead with the wrapper, then list lower-level CI/secret-manager commands.

Validation run:

- `bash -n scripts/quipsly-capture-live-reviewer-proof.sh` passed.
- `bash -n scripts/quipsly-mobile-capture-preflight.sh` passed.
- `node --check scripts/quipsly-capture-reviewer-runway-static-smoke.mjs` passed.
- `node scripts/quipsly-capture-reviewer-runway-static-smoke.mjs` passed and reports `bash scripts/quipsly-capture-live-reviewer-proof.sh` as the native visibility proof command.
- `QUIPSLY_MOBILE_CAPTURE_SOURCE_ONLY=1 node scripts/quipsly-mobile-capture-contract-smoke.mjs --json` passed with `46` passing checks and `0` failures.
- `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs --json` passed with `0` failures.
- `node scripts/hgo-quipsly-release-readiness.mjs --json` passed with `0` failures and `0` warnings before this patch.
- Dry live proof with `QUIPSLY_CAPTURE_REVIEWER_CREATE_SESSION=0` stopped safely because no Keychain item exists yet for `codex@dev.test` under `quipsly-capture-reviewer`.

Truth note:

- This reduces reviewer/live-proof friction, but it does not prove a live reviewer session yet.
- Next operator action remains storing the reviewer password in Keychain with `bash scripts/quipsly-store-capture-reviewer-password.sh`, then running `bash scripts/quipsly-capture-live-reviewer-proof.sh`.
- This is not full goal completion. The full device/simulator path through join, consent, local recording, upload verification, transcript recovery, packet creation, and Nest review remains open.

## Resumed update: 2026-07-08 night - retired native mock Patreon auth proof

Goal movement:

- Confirmed the native Capture sign-in surface is `LoginView` plus `AuthManager`, using Firebase email/password and Quipsly bearer verification.
- Confirmed retired native Patreon mock-auth markers are absent from the mobile Capture Swift source.
- Preserved the static smoke tripwire that fails if retired mock-auth names return to the Swift source tree:
  - `mock_patreon_access_token`
  - `PatreonAuthManager`
  - `LoginWithPatreonButton`
  - `QUIPSLY_CLIENT_ID`
  - `PatreonAccessToken`

Why it matters:

- The Xcode project uses a folder-synchronized source group, so stray Swift files in the app folder can become real App Store/TestFlight risk even if a view is not reachable from the main UI.
- Firebase proves reviewer/user identity. Quipsly/Nest owns sessions, Nests, recordings, transcripts, permissions, and review truth. Patreon remains a provider/entitlement integration, not a native mock-login path.

Validation run:

- `node --check scripts/quipsly-ios-capture-app-store-static-smoke.mjs` passed.
- `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs --json` returned `ok: true`.
- `node --check scripts/quipsly-mobile-capture-contract-smoke.mjs` passed.
- `QUIPSLY_MOBILE_CAPTURE_SOURCE_ONLY=1 node scripts/quipsly-mobile-capture-contract-smoke.mjs --json` passed with `46` passing checks and `0` failures.
- `rg` confirmed retired native mock Patreon markers are absent from `apps/mobile-capture/HighGroundCapture/HighGroundCapture`.
- `bash apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator` passed; HighGroundCapture simulator build succeeded with LiveKit linked.

Truth note:

- This improves App Store/auth safety and protects the Firebase-first native sign-in path from regressing into an old mock provider flow.
- This is not full goal completion. The live reviewer proof still needs the `quipsly-capture-reviewer` Keychain credential, and the full simulator/device path through join, consent, recording, upload verification, transcript recovery, packet creation, and Nest review remains open.

## Resumed update: 2026-07-08 night - App Store static smoke now emits named evidence

Goal movement:

- Strengthened `scripts/quipsly-ios-capture-app-store-static-smoke.mjs` so it emits a `checks` array, `checkCount`, and `statusCounts` instead of only returning `ok: true`.
- Cleaned pass labels so the report reads as positive evidence, for example:
  - `privacy manifest declares no tracking`
  - `privacy manifest includes collected data type: NSPrivacyCollectedDataTypeAudioData`
  - `privacy manifest includes required-reason API type: NSPrivacyAccessedAPICategoryUserDefaults`

Why it matters:

- App Store/TestFlight readiness needs audit-friendly evidence, not just a binary pass.
- Future agents and reviewers can now tell which privacy/auth/consent/upload/CallKit/LiveKit/readiness invariants were actually covered by the static smoke.

Validation run:

- `node --check scripts/quipsly-ios-capture-app-store-static-smoke.mjs` passed.
- `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs --json` passed with `398` named pass checks and `0` failures.
- `node --check scripts/quipsly-mobile-capture-contract-smoke.mjs` passed.
- `QUIPSLY_MOBILE_CAPTURE_SOURCE_ONLY=1 node scripts/quipsly-mobile-capture-contract-smoke.mjs --json` passed with `46` passing checks and `0` failures.
- `bash apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator` passed; HighGroundCapture simulator build succeeded with LiveKit linked.

Truth note:

- This improves validation confidence and reviewer readiness evidence.
- This is still static plus simulator-build proof. It does not replace the live reviewer/session proof or physical/simulator capture flow through join, consent, recording, upload, transcript recovery, packet creation, and Nest review.

## Resumed update: 2026-07-08 night - live reviewer missing-credential proof is machine-readable

Goal movement:

- Strengthened `scripts/quipsly-capture-live-reviewer-proof.sh` so a missing reviewer Keychain credential writes a safe JSON artifact before exiting.
- The blocked artifact includes:
  - `status: "blocked"`
  - `blockedReason: "missing-keychain-credential"`
  - `providerSecretsExposed: false`
  - `passwordPrinted: false`
  - `externalMutated: false`
  - `recordingStarted: false`
- Extended `scripts/quipsly-capture-reviewer-runway-static-smoke.mjs` so this blocked-proof contract is protected.

Why it matters:

- Live reviewer proof still needs operator setup, but now automation can tell the difference between "credential missing" and "capture product failed."
- This keeps the App Store/TestFlight runway calm and auditable without printing secrets or creating accidental side effects.

Validation run:

- `bash -n scripts/quipsly-capture-live-reviewer-proof.sh` passed.
- `node --check scripts/quipsly-capture-reviewer-runway-static-smoke.mjs` passed.
- `node scripts/quipsly-capture-reviewer-runway-static-smoke.mjs` passed.
- Running `scripts/quipsly-capture-live-reviewer-proof.sh` without the Keychain item exited `2` and wrote a blocked JSON artifact with `blockedReason: "missing-keychain-credential"`.
- `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs --json` passed with `398` named pass checks and `0` failures.
- `QUIPSLY_MOBILE_CAPTURE_SOURCE_ONLY=1 node scripts/quipsly-mobile-capture-contract-smoke.mjs --json` passed with `46` passing checks and `0` failures.

Truth note:

- This does not satisfy the live reviewer proof. It makes the setup blocker explicit, safe, and machine-readable.
- Next operator action remains storing the reviewer password in Keychain with `bash scripts/quipsly-store-capture-reviewer-password.sh`, then running `bash scripts/quipsly-capture-live-reviewer-proof.sh`.

## Resumed update: 2026-07-09 early morning - transcript packet review lanes

Goal movement:

- Added multi-lane transcript packet review evidence to the coaching packet builder.
- Packet creation now derives review lanes for:
  - client follow-up,
  - goals and tasks,
  - next-session prep,
  - podcast production,
  - quote candidates,
  - article seeds,
  - clip candidates.
- Each review lane is explicitly review-required, human-approval-gated, and external-side-effect-free.
- The packet route now returns saved review lanes for new packets and compatibility fallback lanes for older packets.
- The native Capture bridge decodes packet review lanes and the packet truth panel shows them as first-class reviewer/agent evidence.
- Source contract smokes now protect the review-lane route shape, packet-builder provenance, and native review-lane UI rows.

Why it matters:

- This advances the goal requirement that captured coaching/podcast transcripts become useful follow-up material instead of inert transcripts.
- It keeps the product rule clear: summaries, tasks, goals, clips, quotes, articles, and next-session prep are packet candidates until a human approves them.
- It does not publish, send, schedule, charge, invite, mutate external accounts, or mutate source media.

Validation run:

- `node --check scripts/quipsly-mobile-capture-contract-smoke.mjs` passed.
- `QUIPSLY_MOBILE_CAPTURE_SOURCE_ONLY=1 node scripts/quipsly-mobile-capture-contract-smoke.mjs --json` passed with `46` passing checks and `0` failures.
- `node --check scripts/quipsly-ios-capture-app-store-static-smoke.mjs` passed.
- `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs --json` passed with `404` passing checks and `0` failures.
- `pnpm --filter quipsly exec tsc --noEmit --pretty false` passed.
- `bash apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator` passed; LiveKit dependencies resolved and HighGroundCapture simulator build succeeded.

Truth note:

- This is not full goal completion.
- It proves the source and native build surfaces for transcript-to-packet review lanes.
- It does not yet prove a live authenticated device/simulator flow through room join, consent, local recording, upload verification, transcript execution, packet creation, and Nest review.
- Next best proof remains the live reviewer proof after the `quipsly-capture-reviewer` Keychain credential exists, followed by simulator/device room join and recording/upload/transcript/packet evidence.

## Live reviewer proof attempt: 2026-07-09 early morning

Attempted command:

```bash
QUIPSLY_CAPTURE_REVIEWER_CREATE_SESSION=0 bash scripts/quipsly-capture-live-reviewer-proof.sh
```

Result:

- Stopped safely before contacting live reviewer flow because the reviewer password is not available in macOS Keychain under service `quipsly-capture-reviewer` and account `codex@dev.test`.
- No session was created.
- No provider room was joined.
- No recording, upload, transcript, invite, calendar event, Stripe action, publish action, or external mutation occurred.

Next operator setup:

```bash
QUIPSLY_CAPTURE_REVIEWER_PASSWORD_KEYCHAIN_SERVICE="quipsly-capture-reviewer" \
QUIPSLY_CAPTURE_REVIEWER_PASSWORD_KEYCHAIN_ACCOUNT="codex@dev.test" \
bash scripts/quipsly-store-capture-reviewer-password.sh
```

Then run:

```bash
bash scripts/quipsly-capture-live-reviewer-proof.sh
```

## Consent-to-room proof hardening: 2026-07-09

What changed:

- Added `scripts/quipsly-capture-consent-room-live-proof.sh` as the next proof after visible reviewer session readiness.
- Extended `scripts/quipsly-capture-reviewer-session-smoke.mjs` with opt-in consent and room-readiness flags:
  - `--grant-consent=1`;
  - `--inspect-room-join=1`;
  - `--prepare-room-join=1`.
- The proof grants app-owned reviewer consent, inspects side-effect-free room diagnostics, prepares a short-lived LiveKit join token, and redacts token details in the report.
- The proof asserts no provider join, no local/provider recording start, no Stripe mutation, no Calendar mutation, no invite, no media/storage mutation, and no secret exposure.
- The consent route now reports an explicit no-external-side-effects boundary for consent updates.
- The static reviewer runway smoke now knows about the consent-room proof and includes it in the setup sequence.

Validation passed:

```bash
node --check scripts/quipsly-capture-reviewer-session-smoke.mjs
bash -n scripts/quipsly-capture-consent-room-live-proof.sh
bash -n scripts/quipsly-mobile-capture-preflight.sh
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
node scripts/quipsly-capture-reviewer-runway-static-smoke.mjs
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs --json
```

Deploy status:

- Local code is ready.
- Live deploy was attempted with `scripts/quipsly-web-deploy.sh`.
- Deploy did not start Cloud Build because `gcloud` and ADC could not refresh tokens in non-interactive mode.
- No image was pushed for the attempted tag.

Operator unblock:

```bash
cd /Users/wall-e/Dev/high-ground-studio
gcloud auth login --update-adc --brief
bash scripts/release/quipsly-gcloud-auth-check.sh
```

After auth passes, run:

```bash
PROJECT_ID=high-ground-odyssey REGION=us-central1 RUN_PUBLIC_INTEGRATION_SMOKE=0 RUN_PREVIEW_SMOKE=0 LOCAL_VALIDATE=0 bash scripts/quipsly-web-deploy.sh capture-consent-room-$(date +%Y%m%d-%H%M%S)
bash scripts/quipsly-capture-consent-room-live-proof.sh
```

Truth note:

- The local/static/native build proof is green.
- The live authenticated create/readback proof is still pending only on Keychain credential setup.
