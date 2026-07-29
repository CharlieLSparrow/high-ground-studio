# Quipsly coaching and capture goal handoff

Date: 2026-07-04
Status: active goal, safe to pause and resume

## Goal

Build Quipsly coaching and capture into a real App Store-ready production lane across HighGroundOdyssey, Quipsly, and the iOS capture app.

The working product path is:

1. A client requests or books a real-time one-to-one coaching or podcast session.
2. Quipsly owns the booking, payment evidence, call-room state, recording consent, recording assets, transcripts, notes, and action items.
3. Stripe may collect eligible one-to-one coaching payments, but Stripe is evidence, not source of truth.
4. The iOS capture app selects a Quipsly session, shows consent and provider readiness, records only after explicit consent, uploads safely, and exposes transcript/readiness state.
5. HighGroundOdyssey can present coaching pages and requests, but Quipsly remains the operational source of truth.

## Current implementation seams

- Prisma has additive coaching/capture models for coaches, services, availability, booking holds, bookings, Stripe records, rooms, participants, consent, recordings, upload chunks, transcript jobs, transcript segments, notes, action items, and deletion requests.
- The team coaching/capture runway exists at the web team surface with seed, availability, draft booking, checkout, portal, LiveKit room prep, provider recording, reconciliation, transcript controls, and packet build controls.
- Public coaching pages can collect request intent and route it into Quipsly-owned coaching request metadata.
- Nest has public privacy and account deletion routes.
- Nest mobile capture routes exist for sessions, consent, room join, room state, transcript run, packets, and readiness.
- The iOS capture app has a first session-selection and consent-aware capture path.
- A mobile readiness endpoint now exists at `GET /api/mobile/capture/readiness`.
- The iOS capture surface now reads the readiness endpoint and shows signed-in, provider, upload/transcript, Stripe, App Store, privacy, and account-deletion state in-app.
- The iOS auth callback scheme was moved from the Mac-specific `quipslymac` scheme to the shared `quipsly` scheme, and the Xcode project declares that URL scheme.
- App Store readiness docs now include a privacy-label and reviewer matrix.

## Verified in this pause pass

- The privacy-label matrix exists at `docs/quipsly/ios-capture-privacy-label-matrix.md`.
- The App Store readiness checklist points to the new readiness endpoint and matrix.
- The iOS readiness surface was added in code and passed iOS Simulator build validation.
- Prisma schema validation passed with local project Prisma.
- Quipsly TypeScript validation passed with local app `tsc`.
- The iOS capture app builds for iOS Simulator through full Xcode when `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` is supplied.
- The mobile capture contract smoke passes against local Nest at `http://127.0.0.1:3000`.
- The same smoke currently fails against live `https://nest.quipsly.com` because the live service returns deployed 404 HTML for the mobile capture API routes. Treat this as a deploy/promotion gap, not a local route-contract failure.
- No schema generation, migration, deploy, device runtime smoke, or real App Store/device validation was run in this pause pass.

Validation commands run:

```bash
/Users/wall-e/Dev/high-ground-studio/node_modules/.bin/prisma validate --schema /Users/wall-e/Dev/high-ground-studio/prisma/schema.prisma
/Users/wall-e/Dev/high-ground-studio/apps/quipsly/node_modules/.bin/tsc --noEmit --project /Users/wall-e/Dev/high-ground-studio/apps/quipsly/tsconfig.json
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project /Users/wall-e/Dev/high-ground-studio/apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj -scheme HighGroundCapture -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
node /Users/wall-e/Dev/high-ground-studio/scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000
```

Validation note:

- Running through workspace `pnpm` still triggers a full workspace install/status check and fails on the unrelated `apps/desktop-companion` Electron exotic subdependency policy. Use local project binaries for narrow validation until that dependency policy is resolved.
- The default active developer directory is still Command Line Tools. Use `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` for Xcode validation unless the system developer directory is intentionally switched.
- Live Nest has not yet proven these mobile capture routes. Run `node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=https://nest.quipsly.com` after deployment.

## High-risk unvalidated items

- Prisma schema validates, but Prisma generation and database migration have not been run in this pass.
- Web dependency install needs a deliberate check because adding `@google-cloud/storage` was complicated by an unrelated Electron exotic dependency in another app.
- LiveKit egress helper is architected but needs validation against actual LiveKit API behavior and configured storage.
- iOS provider-room UI is not implemented yet.
- iOS simulator build validation passed, but real device/runtime validation has not been run.
- iOS auth callback behavior still needs real ASWebAuthenticationSession validation after the scheme cleanup.
- App Store privacy labels and deletion behavior need final legal/product review before submission.
- Provider recording verification currently proves object existence/nonzero size, not duration, stream health, or transcript quality.

## Research-backed boundary decisions

- Apple allows non-IAP payments for real-time one-to-one person-to-person services, but one-to-few and one-to-many real-time services still require IAP. Keep Stripe scoped tightly to eligible one-to-one coaching.
- Apps that support account creation must let users initiate account deletion inside the app.
- LiveKit egress can export rooms or tracks and can record to MP4/HLS or stream to RTMP. Treat it as the provider recording spine, with local segmented recording as fallback.
- Stripe Checkout is a good hosted payment path for test-mode one-time coaching payments; webhooks and Quipsly records must remain the proof layer.

Source anchors:

- Apple App Review Guidelines 3.1.3(d): `https://developer.apple.com/app-store/review/guidelines/`
- Apple account deletion guidance: `https://developer.apple.com/support/offering-account-deletion-in-your-app/`
- LiveKit egress overview: `https://docs.livekit.io/transport/media/ingress-egress/egress/`
- Stripe Checkout overview: `https://docs.stripe.com/payments/checkout`

## Next safest resume step

Promote the validated local lane carefully:

1. Run Prisma generation and the intended additive migration in the target environment.
2. Deploy/promote Nest with the mobile capture API routes.
3. Run `node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=https://nest.quipsly.com`.
4. Run a real iOS simulator/device runtime smoke: sign in, load readiness, load sessions, grant/decline/revoke consent, and start/stop a short local recording only with explicit test approval.
5. Then continue provider-room UI, transcript execution, Stripe webhook hardening, and App Store reviewer account preparation.

## Product principle

This lane should reduce systems anxiety around sensitive work. Every important state should be visible: signed in, session selected, consent status, recording state, upload state, provider state, payment evidence, transcript state, packet state, and deletion/request state.

## 2026-07-05 public HGO/Quipsly route matrix

Added a public integration route-matrix probe:

```bash
node scripts/hgo-quipsly-public-route-matrix.mjs --warn-only --json
```

Why it exists:

- `highgroundodyssey.com` is the public coaching/story/business surface.
- `app.highgroundodyssey.com` is the High Ground app service surface.
- `quipsly.com` is the product education and creator funnel.
- `nest.quipsly.com` is the operational source of truth for users, Nests, booking/session state, capture assets, transcript jobs, coaching packets, payment/session evidence, and publishing receipts.

Current live route truth from this pass:

- `quipsly.com` is current enough to explain Quipsly Research, Quipsly Studio, Quipsly Tower, and the intended storyteller/coach/trainer/researcher audience.
- `highgroundodyssey.com/coaching` and `app.highgroundodyssey.com/coaching` both still show the older donation-supported coaching page.
- `nest.quipsly.com/api/coaching/public` still returns deployed 404 HTML instead of the local side-effect-free coaching packet route.
- `scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs` passes locally, proving the intended local HGO-to-Quipsly handoff code and shared coaching packet contract exist.
- `bash scripts/release/quipsly-gcloud-auth-check.sh` still reports stale local gcloud/ADC credentials, so live promotion cannot proceed from this operator session yet.

Next useful deploy sequence after operator reauth:

1. Run `gcloud auth login --update-adc --brief`.
2. Run `bash scripts/release/quipsly-gcloud-auth-check.sh`.
3. Deploy/promote `apps/quipsly` so Nest exposes `/api/coaching/public`.
4. Deploy/promote `apps/web` so both HGO coaching surfaces show the Quipsly operational handoff.
5. Run `node scripts/hgo-quipsly-public-route-matrix.mjs --json`.
6. Run `node scripts/hgo-quipsly-public-integration-smoke.mjs --json`.

## 2026-07-06 meeting spine / provider recording boundary

The mobile room join contract now separates provider-room transport from provider recording/egress:

- `providerJoin` says whether the app can connect to the meeting provider.
- `recordingBoundary` says joining is not recording and all recording remains consent-gated and visible.
- `providerRecording` says provider/server recording starts as `not-started`, requires an explicit visible Quipsly start action, requires consent, and needs receipt evidence before transcripts or packets rely on provider media.
- `localFallback` remains available only when safe, preserving local source files until Nest verifies upload.

Validation commands for this pass:

```bash
node --check scripts/quipsly-mobile-capture-contract-smoke.mjs
node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only --json
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj -scheme HighGroundCapture -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Result: all commands passed. The source-only mobile capture contract now reports 22/22 checks, including `roomJoinProviderRecordingTruth`. The iOS simulator build recompiled `BridgeModels.swift`, proving the new native decode model is compile-safe.

Why it matters: LiveKit can be the meeting spine, but Quipsly still owns consent, recording state, local fallback, provider receipt evidence, transcripts, packets, and review truth.

Follow-up UI pass: the iOS provider room now includes a visible `ProviderRecordingCard`. It shows provider recording as separate from room join, explains consent and receipt requirements, and keeps the start button disabled until Nest has a real provider-egress start route and receipt ledger. Validation passed with `node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only --json` reporting 23/23 checks and the iOS simulator build succeeding after `QuipslyMobileComponents.swift` recompiled.

Provider receipt-slot pass: added `POST /api/mobile/capture/rooms/provider-recording` with action `PREPARE_RECEIPT_SLOT`. It creates/reuses a `SERVER_MIX` + `HELD` `RecordingAsset` receipt slot only after every non-observer participant has granted recording consent. It records `externalRecordingStarted:false` and `receiptRequiredBeforeTranscript:true`, and it does not start LiveKit egress or claim provider media exists.

Provider receipt-slot guard: mobile session mapping now filters `provider-recording-receipt-slot` assets out of `recordingCount`, latest recording selection, lifecycle recording evidence, and transcript repair prompts. Transcript creation and execution reject receipt-slot assets explicitly; a slot is evidence that provider media still needs to be attached, not media that can be transcribed.

Native provider receipt-slot UI: the iOS session model now decodes `providerRecordingReceiptSlotId`, `providerRecordingReceiptStatus`, and `providerRecordingReceiptNextAction` from Nest. The after-capture panel shows a `Provider receipt slot prepared` notice, diagnostics label the slot as not media, and the transcript guard says `Provider receipt slot is evidence only. Attach verified provider media before transcription.` This keeps provider egress receipt evidence visible without letting it masquerade as a real recording.

Validation for the receipt-slot pass:

```bash
node --check scripts/quipsly-mobile-capture-contract-smoke.mjs
node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only --json
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj -scheme HighGroundCapture -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Result: all passed. The mobile capture source-only contract now reports 24/24 checks, including `providerRecordingReceiptSlotRoute`.

## 2026-07-04 Deploy lane update

- Local mobile-capture/coaching contract remains validated locally, but live `https://nest.quipsly.com` still needs a new Quipsly web image before the new `/api/mobile/capture/*` routes are visible there.
- `scripts/quipsly-web-deploy.sh` now supports `NO_TRAFFIC=1 PREVIEW_TAG=...` so the slim web-runtime context can deploy a tagged Cloud Run preview revision without moving live traffic or rewriting env/secrets.
- Dry-run staging passed with `PROJECT_ID=high-ground-odyssey STAGE_ONLY=1 NO_TRAFFIC=1 LOCAL_VALIDATE=0 IMAGE_TAG=quipsly-web-preview-dryrun scripts/quipsly-web-deploy.sh quipsly-web-preview-dryrun`; staged context size was 261 MB.
- Current blocker: local gcloud credentials are stale. `scripts/release/quipsly-gcloud-auth-check.sh` can see selected account `charlie@highgroundodyssey.com`, but user credentials, ADC, deploy-project access, and Firebase-project access fail because reauthentication cannot prompt non-interactively.
- Recovery command for Charlie/operator: `gcloud auth login --update-adc --brief`, then rerun `bash scripts/release/quipsly-gcloud-auth-check.sh`.
- Safe promotion sequence after reauth:
  1. `PROJECT_ID=high-ground-odyssey LOCAL_VALIDATE=1 NO_TRAFFIC=1 PREVIEW_TAG=quipsly-web-preview scripts/quipsly-web-deploy.sh`
  2. Smoke the tagged preview URL with `node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=<preview-url> --json`.
  3. If preview passes, promote intentionally with `gcloud run services update-traffic studio --project high-ground-odyssey --region us-central1 --to-tags quipsly-web-preview=100 --quiet`.
  4. Smoke `https://nest.quipsly.com` with the same contract script.

## 2026-07-04 After-capture ladder update

Implemented a local capture-to-packet bridge:

- `/api/mobile/capture/sessions` now returns latest recording/transcript/packet evidence per session: latest recording asset, latest transcript job/status/provider/segment count, packet summary/highlight/action-item counts, packet status, and the next safe after-capture action.
- The iOS `HighGroundCapture` session model now decodes that evidence and exposes user-facing labels for recording, transcript, and packet readiness.
- The iOS recorder board now shows an `After capture` panel with recording/transcript/packet chips plus `Run transcript` and `Build packet` controls when the session state makes those actions safe.

Validation evidence:

- Quipsly TypeScript passed: `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json`.
- iOS simulator build passed: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj -scheme HighGroundCapture -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`.
- Local route contract passed: `node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json` returned `ok:true` with `16/16` checks passing.
- Live Nest still fails with `404` HTML for the mobile capture routes, confirming the live gap is deploy/promotion, not local route shape.

## 2026-07-04 Coaching runway truth pass

Implemented the first real Quipsly coaching cockpit slice:

- Added `/api/coaching/runway`, a read-only Quipsly-owned state endpoint for signed-in users.
- The endpoint reports coaches, active offerings, upcoming bookings, capture rooms, open requests, recording/transcript/packet evidence, provider/payment readiness booleans, and plain-English next safe actions.
- The endpoint intentionally distinguishes Quipsly truth from Stripe, calendar, LiveKit, transcription, and publication evidence. No charges, invites, external publishing, or destructive mutations happen here.
- Replaced the static `/coaching` mock page with a client cockpit bound to `/api/coaching/runway`. It now shows real empty states instead of fake clients/sessions, plus bookings, capture rooms, offerings, requests, readiness, and safety boundaries when data exists.

Validation evidence:

- Quipsly TypeScript passed: `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json`.
- New runway unauthenticated API boundary returns JSON 401 locally: `http://127.0.0.1:3000/api/coaching/runway` -> `{ ok:false, error:"Sign in before opening the coaching runway." }`.
- Existing mobile capture smoke script syntax still passes: `node --check scripts/quipsly-mobile-capture-contract-smoke.mjs`.

Next useful implementation step:

- Add safe staff-only runway mutations: create/update service offering, create booking hold, convert hold/request to booking, create capture room, and prepare Stripe test checkout evidence. Keep Stripe as evidence, not source of truth.

## 2026-07-04 Safe coaching session creation pass

Extended the coaching runway from read-only truth to the first safe staff-only write:

- `/api/coaching/runway` now supports `POST { action:"create-booking-room" }` for signed-in staff only.
- The mutation creates app-owned records only: invited/active client user, appointment, coaching booking, optional pending payment record for paid one-to-one policy, planned call room, coach/client participants, requested recording consent rows, and a planned calendar receipt slot.
- The mutation does not create Stripe checkout, charge money, send invites, create external calendar events, publish, or record anything.
- `/coaching` now has a staff-only `Create local session` form that writes those records and refreshes the runway. Non-staff users see the boundary instead of a fake capability.

Validation evidence:

- Quipsly TypeScript passed again: `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json`.
- Local unauthenticated runway GET returns JSON 401.
- Local unauthenticated runway POST returns JSON 401.
- Mobile capture route contract still passes locally: `node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json` -> `ok:true`, `16/16`.

Next useful implementation step:

- Add a Stripe test-mode checkout route in Quipsly for bookings whose `paymentPolicy` is `PAID_ONE_TO_ONE`, writing `StripeCheckoutSessionLedger` and updating `PaymentRecord` evidence without making Stripe the source of truth. Guard live mode behind an explicit env gate.

## 2026-07-04 - Quipsly coaching Stripe evidence seam

Added the first Quipsly-native Stripe evidence path for one-to-one coaching without making Stripe the source of truth.

Implemented:
- `POST /api/coaching/checkout`: signed-in booking participants or staff can create Stripe Checkout evidence for `PAID_ONE_TO_ONE` coaching bookings.
- `POST /api/coaching/customer-portal`: signed-in users can open their own billing portal when portal support is explicitly enabled and Stripe customer evidence exists; staff can target a user for recovery/admin flows.
- `POST /api/coaching/webhooks/stripe`: records verified Stripe webhook evidence, reconciles matched checkout sessions to `PaymentRecord` and `CoachingBooking`, and records valid unmatched events as `processed_unmatched` instead of crashing.
- `/coaching` now shows checkout count/status/link/evidence next action beside app-owned booking truth and exposes staff-only checkout creation.

Boundaries:
- Stripe is receipt/evidence for eligible one-to-one coaching only.
- Quipsly-owned `CoachingBooking`, `PaymentRecord`, `CallRoom`, consent, transcript, packet, and calendar receipt slots remain the durable app truth.
- No SaaS subscription, course, group coaching, library, or Patreon entitlement logic was mixed into this seam.
- Live Stripe keys are blocked unless `QUIPSLY_ALLOW_LIVE_STRIPE=true` is explicitly set.

Validation:
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- Local unauthenticated route smokes passed for `/api/coaching/runway`, `/api/coaching/checkout`, `/api/coaching/customer-portal`, and controlled webhook config failure.
- `node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json` passed 16/16.
- `cd apps/quipsly && npm run build` initially hit stale `.next/standalone` cleanup output; after clearing disposable `.next`, full Next build passed and listed the new coaching routes.

Live gap:
- This still needs deploy/promotion before `nest.quipsly.com` has the new routes.
- For real Stripe test flow, configure `STRIPE_SECRET_KEY`, `STRIPE_COACHING_WEBHOOK_SECRET`, and test offering price evidence. Keep live guard off until explicit launch approval.

## 2026-07-05 - HGO / Quipsly coaching release runway

Added a small release-runway helper:

```bash
node scripts/hgo-quipsly-coaching-release-runway.mjs --json
node scripts/hgo-quipsly-coaching-release-runway.mjs --smoke-previews --json
```

Why it exists:

- `scripts/hgo-quipsly-release-readiness.mjs` proves local contract and live drift, but the next action previously pointed mostly at the Nest deploy.
- The actual public integration requires two no-traffic previews before promotion:
  1. `apps/quipsly` / Nest so `/api/coaching/public` and mobile capture routes exist live.
  2. `apps/web` / HGO so `/coaching` shows the Quipsly operational handoff.
- The helper resolves the tagged Cloud Run preview URLs for `studio:quipsly-web-preview` and `web:web-preview`, then can run the strict public integration smoke against those preview URLs.

Current validation:

- `node --check scripts/hgo-quipsly-release-readiness.mjs` passed.
- `node --check scripts/hgo-quipsly-coaching-release-runway.mjs` passed.
- `node scripts/hgo-quipsly-coaching-release-runway.mjs --json` correctly reports stale operator auth when trying to inspect preview tags.
- `node scripts/hgo-quipsly-release-readiness.mjs --json` still reports:
  - deploy blocker: `operator-gcloud-auth`
  - local HGO-to-Quipsly static contract: pass
  - local coaching/capture schema readiness: pass
  - live HGO coaching route: stale old page
  - live Nest public coaching packet: 404
  - Quipsly.com marketing: pass

Runway after operator reauth:

```bash
gcloud auth login --update-adc --brief
bash scripts/release/quipsly-gcloud-auth-check.sh
node scripts/hgo-quipsly-release-readiness.mjs --json
PROJECT_ID=high-ground-odyssey LOCAL_VALIDATE=1 NO_TRAFFIC=1 PREVIEW_TAG=quipsly-web-preview scripts/quipsly-web-deploy.sh
WEB_CLOUD_RUN_PROJECT=high-ground-odyssey WEB_CLOUD_RUN_SERVICE=web node scripts/web-cloud-run-deploy.mjs
node scripts/hgo-quipsly-coaching-release-runway.mjs --smoke-previews --json
```

If preview smoke passes, promote intentionally:

```bash
gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-tags=quipsly-web-preview=100 --quiet
gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-tags=web-preview=100 --quiet
node scripts/hgo-quipsly-public-route-matrix.mjs --json
node scripts/hgo-quipsly-public-integration-smoke.mjs --json
```

Product invariant:

- HGO explains and routes.
- Quipsly.com educates and funnels.
- Nest owns operational coaching/capture truth.
- Preview smokes must prove that split before live traffic moves.

## 2026-07-05 - Canonical mobile capture upload route

Aligned native capture upload naming with the product boundary:

- Added canonical route: `/api/mobile/capture/uploads/chunk`
- Kept compatibility route: `/api/ingest/mobile/chunk`
- Updated `HighGroundCapture` native uploads to prefer `/mobile/capture/uploads/chunk`
- Kept both routes on the same source-safe upload implementation so the older ingest path does not fork business logic.

Why it matters:

- Native capture should read like native capture, not generic media ingest.
- The route response remains contract-backed with `contractKind`, `serverVerification`, and `localRetention`.
- A successful HTTP response is still not permission to delete local source recordings.
- Local files remain source truth until Nest verifies durable storage and an explicit retention policy allows pruning.

Validation:

```bash
node --check scripts/quipsly-mobile-capture-contract-smoke.mjs
node --check scripts/quipsly-ios-capture-app-store-static-smoke.mjs
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json
```

Result:

- iOS App Store static smoke passed.
- Quipsly TypeScript passed.
- Local mobile capture contract smoke passed `32/32`.
- New `canonicalChunkUploadUnauthenticatedBoundary` proves `/api/mobile/capture/uploads/chunk` rejects unauthenticated uploads calmly with JSON 401.

## 2026-07-05 - Mobile capture journey summary

Added a shared session-journey read model to the mobile capture lane so Nest and the native iOS app explain the same coaching/capture state.

Implemented:

- `apps/quipsly/src/lib/server/mobile-capture-sessions.ts` now adds `journeySummary` to each mobile capture session.
- The journey summary reports the current stage, payment stage, provider stage, packet stage, evidence booleans, blockers, and next safe action.
- `canRecordNow` now follows the computed capture readiness verdict instead of only checking whether a room is `PLANNED`, `OPEN`, or `RECORDING`.
- `apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift` now decodes `MobileCaptureJourneySummary` and exposes display labels/evidence chips.
- `apps/mobile-capture/HighGroundCapture/HighGroundCapture/QuipslyMobileComponents.swift` now shows a `MobileCaptureJourneyCard` beside the capture readiness card.
- `scripts/quipsly-mobile-capture-contract-smoke.mjs` now guards the server payload, Swift model, and Swift UI card so the journey seam does not silently regress.

Validation:

```bash
node --check scripts/quipsly-mobile-capture-contract-smoke.mjs
node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
bash scripts/quipsly-mobile-capture-preflight.sh
```

Results:

- Mobile capture contract smoke passed locally with `30/30` checks.
- Quipsly TypeScript passed.
- Full mobile capture preflight passed.
- iOS simulator build succeeded.
- Existing iOS 26 deprecation warnings remain in `ExportManager.swift` and `NativeEditorView.swift`; they are not introduced by this journey-summary pass, but they should be handled before App Store polishing.

Product note:

This is a read model, not a new source of truth. Booking, payment evidence, consent, provider state, recordings, transcripts, and packets remain app-owned records. The phone receives a calm explanation of the current path through those records so users know what is safe next.

## 2026-07-05 - Public integration release readiness wrapper

Added a non-mutating release-readiness wrapper:

```bash
node scripts/hgo-quipsly-release-readiness.mjs --json
```

What it checks:

- Operator `gcloud` and ADC credentials through `scripts/release/quipsly-gcloud-auth-check.sh`.
- Local HGO-to-Quipsly handoff static contract through `scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs`.
- Live public route matrix through `scripts/hgo-quipsly-public-route-matrix.mjs --warn-only --json`.
- Live public integration smoke through `scripts/hgo-quipsly-public-integration-smoke.mjs --warn-only --json`.

Current result from this pass:

- Deploy readiness wrapper: blocked.
- Blocker: `operator-gcloud-auth`.
- Local HGO/Quipsly handoff static contract: pass.
- Live Quipsly.com marketing: pass for Research, Studio, Tower, and target audiences.
- Live HighGroundOdyssey.com `/coaching`: stale older donation-supported page, missing `Open Quipsly Booking`, `Quipsly live packet`, `Inspect packet`, and `Quipsly Nest`.
- Live `app.highgroundodyssey.com/coaching`: same stale coaching page.
- Live `nest.quipsly.com/api/coaching/public`: 404 HTML, not the local side-effect-free coaching packet JSON.

Exact operator recovery:

```bash
gcloud auth login --update-adc --brief
node scripts/hgo-quipsly-release-readiness.mjs --json
```

If readiness becomes green, deploy the Quipsly/Nest preview without moving traffic:

```bash
PROJECT_ID=high-ground-odyssey LOCAL_VALIDATE=1 NO_TRAFFIC=1 PREVIEW_TAG=quipsly-web-preview scripts/quipsly-web-deploy.sh
```

Then smoke the preview, promote intentionally, and rerun:

```bash
node scripts/hgo-quipsly-public-route-matrix.mjs --json
node scripts/hgo-quipsly-public-integration-smoke.mjs --json
```

Boundary:

- The wrapper does not build, deploy, promote, publish, charge, send invites, start recordings, or mutate external accounts.
- It is a release-readiness readout, not a release action.

## 2026-07-05 - iOS capture warning cleanup

Cleaned a small App Store-readiness warning cluster in the iOS capture app:

- Removed a non-optional `clip.duration ?? ...` fallback in `ExportManager.swift`.
- Removed an unnecessary `try?` around `insertEmptyTimeRange` in `NativeEditorView.swift`.
- Updated two SwiftUI `onChange` calls to the modern two-parameter closure form.

Validation:

```bash
bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- Full preflight passed.
- iOS simulator build succeeded.
- Remaining warnings are now concentrated in the older prototype export/editor AVFoundation seam:
  - `AVMutableVideoComposition` deprecated in iOS 26.
  - `tracks(withMediaType:)` deprecated in iOS 16.
  - `AVAssetExportSession.exportAsynchronously`, `status`, and `error` deprecated in iOS 18.

Next App Store polish target:

- Modernize the local export/editor renderer deliberately instead of patching warnings piecemeal. This should be treated as an export-engine pass because it touches final media generation, not merely UI polish.

### Follow-up validation note

After adding paid-session creation controls, `tsc --noEmit` stayed green. The previously running local server on port 3000 returned broad 500s after disposable `.next` output was cleared/rebuilt, so it should be treated as stale process state. A fresh isolated dev server on port 3017 returned the expected route boundaries:

- `GET /api/coaching/runway` -> 401 signed-in required.
- `POST /api/coaching/checkout` -> 401 signed-in required.
- `POST /api/coaching/customer-portal` -> 401 signed-in required.
- `POST /api/coaching/webhooks/stripe` -> 503 because local `STRIPE_SECRET_KEY` is not configured.
- Mobile capture contract smoke on port 3017 passed 16/16.

Staff runway form now supports manual/free/donation/paid one-to-one session creation, including a dollar amount that becomes pending Quipsly payment evidence before any Stripe checkout link exists.

### Build after paid-session form update

Ran `cd apps/quipsly && npm run build` after the paid-session UI controls were added. Build passed and listed the coaching routes:

- `/api/coaching/checkout`
- `/api/coaching/customer-portal`
- `/api/coaching/runway`
- `/api/coaching/webhooks/stripe`
- `/coaching`

Known unrelated warning remains: Turbopack reports an NFT tracing warning from `apps/quipsly/src/app/(app)/nests/[slug]/actions.ts` through `next.config.mjs`. It is not caused by the coaching Stripe seam, but should be cleaned during deploy-size/runway hardening.

## 2026-07-04 iOS Capture App Store readiness and recovery pass

Implemented a native capture readiness hardening pass:

- Added `HighGroundCapture/PrivacyInfo.xcprivacy` for the iOS capture app. It declares no tracking, app-functionality use for account/session/audio/user-content data, and required-reason API entries for app-scoped settings and local file metadata access.
- Added `docs/quipsly/ios-capture-app-store-readiness.md` with the App Store submission boundary, expected privacy label categories, reviewer note draft, and remaining blockers.
- Strengthened `UploadManager` so failed chunk uploads preserve local recordings visibly, expose a recoverable upload count, and give the operator a retry path rather than silently stranding a recording.
- Added a visible recording safety strip to the iOS capture UI: consent state, recording visibility, local fallback, hidden-capture boundary, and next safe action for the selected session.
- Added preserved-upload recovery language and retry controls to the recorder board.

Validation evidence:

- Privacy manifest lints locally: `plutil -lint apps/mobile-capture/HighGroundCapture/HighGroundCapture/PrivacyInfo.xcprivacy`.
- The built simulator app bundle contains a valid `PrivacyInfo.xcprivacy`: `/Users/wall-e/Library/Developer/Xcode/DerivedData/HighGroundCapture-gkbduygtikskhbarozfvqyxytyrq/Build/Products/Debug-iphonesimulator/HighGroundCapture.app/PrivacyInfo.xcprivacy`.
- iOS simulator build passed: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project HighGroundCapture.xcodeproj -scheme HighGroundCapture -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`.
- Quipsly TypeScript stayed green: `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json`.
- Mobile capture smoke script syntax stayed valid: `node --check scripts/quipsly-mobile-capture-contract-smoke.mjs`.

Known warnings and blockers:

- Xcode build emits existing Swift 6 sendability warnings in `HighGroundCapture/ReframingEngine/ReframingCompositor.swift`. They did not block the capture build, but should be cleaned before treating the mobile app as production-polished.
- Live deploy remains blocked by stale gcloud credentials. `bash scripts/release/quipsly-gcloud-auth-check.sh` still cannot mint user or ADC tokens and cannot access `high-ground-odyssey` or `quipsly-reef`.
- Before TestFlight, run a physical-device smoke for sign-in, readiness, session selection, consent grant/revoke, microphone permission, start/stop recording, upload recovery, and transcript packet creation.

## 2026-07-05 capture reviewer login runway

The native iOS capture app now has a concrete reviewer/operator account setup path:

- `/admin/users` includes a `Capture reviewer setup` card.
- The card uses the existing safe `upsertManagedUserAction`; it does not introduce a second auth system.
- Supplying a password intentionally creates or updates the Firebase email/password account, links the Firebase UID to the app-owned Quipsly user, and repairs free starter/Home Nest state.
- The reviewer card defaults to `reviewer-capture@dev.test`, `Quipsly Capture Reviewer`, and the `CLIENT` app role, but the password is always explicitly entered by the operator.
- `scripts/quipsly-admin-user-management-static-smoke.mjs` now guards this invariant cheaply.
- `scripts/quipsly-mobile-capture-preflight.sh` runs that admin static smoke alongside the native iOS auth static smoke.

Validation:

```bash
node --check scripts/quipsly-admin-user-management-static-smoke.mjs
node scripts/quipsly-admin-user-management-static-smoke.mjs
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- Admin static smoke passed.

## 2026-07-05 public Quipsly/HGO coaching packet gate

Verified the public-product integration seam after updating the goal to include `Quipsly.com` and `HighGroundOdyssey.com`.

Current truth:

- `https://quipsly.com/` is already serving the current Research / Studio / Tower product story for storytellers, coaches, trainers, and researchers.
- `https://highgroundodyssey.com/coaching` is the public coaching doorway and falls back calmly when Quipsly packet truth is unavailable.
- Local source contains `apps/quipsly/src/app/api/coaching/public/route.ts`, which should expose the machine-readable public coaching packet.
- Live `https://nest.quipsly.com/api/coaching/public?source=hgo-coaching` currently returns HTTP 404 HTML from the deployed Next app, so the live Nest image has not proven this route yet.
- `bash scripts/release/quipsly-gcloud-auth-check.sh` currently fails because local gcloud user credentials and ADC cannot mint tokens. Deploy/promotion cannot be run safely from this shell until the operator reauthenticates.

Hardening added:

- `scripts/quipsly-coaching-public-handoff-smoke.mjs` now requires JSON content type and emits a direct deploy/promote hint when the live route returns the Next 404 page.
- `scripts/quipsly-mobile-capture-preflight.sh` now syntax-checks the public coaching handoff smoke.
- `scripts/quipsly-mobile-capture-preflight.sh` can run the public packet route gate with:

```bash
RUN_PUBLIC_COACHING_HANDOFF_SMOKE=1 \
BASE_URL=https://nest.quipsly.com \
bash scripts/quipsly-mobile-capture-preflight.sh
```

Next safe action:

1. Reauthenticate gcloud/ADC:

```bash
gcloud auth login --update-adc --brief
bash scripts/release/quipsly-gcloud-auth-check.sh
```

2. Deploy Quipsly as a no-traffic preview.
3. Run `node scripts/quipsly-coaching-public-handoff-smoke.mjs --base-url=<preview-url> --json`.
4. Promote only after the preview packet returns JSON with `packetKind:"quipsly-public-coaching-handoff-v1"`.

## 2026-07-05 deploy preview smoke gate

`scripts/quipsly-web-deploy.sh` now makes the public coaching packet part of the no-traffic preview deploy flow.

Behavior:

- `NO_TRAFFIC=1` still deploys a tagged preview revision without moving live traffic.
- The script resolves the tagged preview URL from Cloud Run traffic metadata.
- By default, `RUN_PREVIEW_SMOKE=1` runs:

```bash
node scripts/quipsly-coaching-public-handoff-smoke.mjs --base-url=<preview-url> --json
```

- If the tagged URL cannot be resolved, or the packet route does not return JSON, the deploy script exits before giving a promotion command.
- Operators can set `RUN_PREVIEW_SMOKE=0` only when deliberately staging an image without route proof.

Validation run:

```bash
bash -n scripts/quipsly-web-deploy.sh
node --check scripts/quipsly-coaching-public-handoff-smoke.mjs
bash -n scripts/quipsly-mobile-capture-preflight.sh
node scripts/quipsly-coaching-public-handoff-smoke.mjs --base-url=https://nest.quipsly.com --json
```

Results:

- Script syntax checks passed.
- Live route smoke still fails correctly with HTTP 404 HTML and the deploy/promote hint.
- `bash scripts/release/quipsly-gcloud-auth-check.sh` still reports stale gcloud user credentials and ADC, so no deploy was attempted from this shell.

## 2026-07-05 shared public coaching contract

Moved the HGO/Nest public coaching handoff shape into a shared Quipsly domain contract.

Implemented:

- `packages/quipsly-domain/src/coaching-public.ts`
  - `QUIPSLY_PUBLIC_COACHING_PACKET_KIND`
  - `QUIPSLY_PUBLIC_COACHING_OFFERING_KINDS`
  - `QuipslyPublicCoachingPacket`
  - `QuipslyPublicCoachingOfferings`
  - `isQuipslyPublicCoachingPacket`
  - `normalizeQuipslyPublicCoachingOfferings`
- `packages/quipsly-domain/package.json` now exports `@high-ground/quipsly-domain/coaching-public`.
- `packages/quipsly-domain/src/index.ts` re-exports the public coaching contract.
- `apps/quipsly/src/app/api/coaching/public/route.ts` now builds a packet using the shared packet kind, offering kinds, and packet type.
- `apps/web/src/lib/hgo/coaching-handoff.ts` now validates and normalizes the public packet through the shared contract.
- `scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs` now checks the shared contract file for the packet literal and adapter files for contract imports, instead of requiring duplicated strings inside adapters.

Validation:

```bash
cd packages/quipsly-domain && npm run typecheck
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
./node_modules/.pnpm/node_modules/.bin/tsc --noEmit --project apps/web/tsconfig.json
node --check scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node --check scripts/quipsly-coaching-public-handoff-smoke.mjs
```

Result: all passed.

Product/architecture boundary:

- `HighGroundOdyssey.com` remains the public coaching doorway.
- `Quipsly.com` remains product education/funnel.
- `Nest/apps/quipsly` remains operational truth.
- The public packet shape is now a shared contract, not duplicated hidden business vocabulary across marketing apps.
- Quipsly TypeScript passed.
- Mobile capture preflight passed, including iOS simulator build.
- The only runtime caveat remains generated signed-auth mutation smoke: local ADC was previously expired, while live Firebase Admin preflight was healthy. Refresh ADC before running generated local auth smokes.

## 2026-07-05 LiveKit native SDK spike

Provider-room reality check:

- Nest already has a join-token seam at `/api/mobile/capture/rooms/join`.
- The iOS app already has `ProviderRoomController` with a real LiveKit branch guarded by `canImport(LiveKit)`.
- The default iOS build does not currently link LiveKit, so the app correctly falls back to local consented recording and reports provider SDK unavailable.

Spike result:

- Tried linking `https://github.com/livekit/client-sdk-swift.git` product `LiveKit` at `2.15.1`.
- Xcode generated a `Package.resolved` with LiveKit, WebRTC XCFramework, UniFFI XCFramework, and Swift Protobuf pins.
- Both Xcode and direct SwiftPM stalled while downloading the binary WebRTC/UniFFI artifacts, leaving the artifact cache empty.
- The hard package link was removed so `scripts/quipsly-mobile-capture-preflight.sh` remains fast and reliable.

Current instruction:

- Do not claim native provider-room join is complete.
- Do not re-add LiveKit directly to the main app target until binary artifact download/cache behavior is solved.
- See `docs/quipsly/livekit-native-sdk-integration-spike.md` for the exact spike result and acceptance criteria.
- iOS readiness copy now distinguishes `LiveKit server ready, app held` from actual native provider-room readiness, and the provider badge stays caution-colored until `nativeProviderRoomUiReady` is true.

## 2026-07-05 mobile capture session evidence proof

The mobile capture sessions route now has a testable evidence mapper:

- Added `apps/quipsly/src/lib/server/mobile-capture-sessions.ts`.
- `/api/mobile/capture/sessions` now keeps auth/database work in the route and delegates session evidence shaping to `mapMobileCaptureSessionsForUser`.
- The route now selects note `body`, so `coachingPacketPreview` is based on actual selected data rather than an omitted field.
- Added `scripts/quipsly-mobile-capture-session-evidence.test.mjs`.
- The test proves the session surface can expose:
  - provider readiness;
  - consent state;
  - verified recording evidence;
  - completed transcript evidence;
  - packet summary/highlight/action-item evidence;
  - next safe action language for packet-ready, transcript-ready, and recording-only states.
- `scripts/quipsly-mobile-capture-preflight.sh` now runs this evidence proof.

Validation:

```bash
TS_NODE_PROJECT=apps/quipsly/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 apps/quipsly/node_modules/.bin/ts-node-esm scripts/quipsly-mobile-capture-session-evidence.test.mjs
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
RUN_ROUTE_SMOKE=1 RUN_COACHING_PAYMENT_SMOKE=1 BASE_URL=http://127.0.0.1:3000 bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- Session evidence test passed.
- Quipsly TypeScript passed.
- Full mobile capture preflight passed, including route smokes, payment boundary smoke, and iOS simulator build.

## 2026-07-04 iOS meeting spine and Swift warning cleanup

Tightened the native session-capture flow:

- Replaced the loose provider-room button cluster with a `RoomSpinePanel` that shows the meeting spine explicitly: provider room readiness, consent state, local capture state, room status, and room actions.
- Start recording no longer re-grants consent as part of the start path. It now requires pre-existing granted consent, prepares provider room evidence when available, marks the Quipsly room `START_RECORDING`, then starts local capture.
- Transcript and packet actions now actually reload session evidence after success, matching the UI copy.
- Cleaned the Swift 6 AVFoundation sendability warnings in `ReframingCompositor` by matching the SDK's sendable pixel-buffer attribute requirements.
- Removed the follow-on unused-device compiler warning from the compositor render guard.

Validation evidence:

- iOS simulator build passed with the real Xcode developer directory:
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project HighGroundCapture.xcodeproj -scheme HighGroundCapture -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`.
- Explicit warning capture shows only the expected AppIntents metadata notice because this app has no AppIntents dependency, followed by `** BUILD SUCCEEDED **`.
- Quipsly TypeScript stayed green: `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json`.

Next useful implementation step:

- Add the real provider-room join surface once Nest returns a safe LiveKit join URL/token shape for mobile. Until then, the iOS app correctly presents provider readiness as evidence and local capture as the resilient recording spine.

## 2026-07-04 meeting spine decision note

Added `docs/quipsly/coaching-capture-meeting-spine.md`.

Decision:

- Use LiveKit as the production real-time meeting spine.
- Keep Quipsly as the owner of session, consent, recording, transcript, packet, action-item, and receipt truth.
- Keep iOS segmented local recording as the resilient fallback and source-evidence path.
- Do not pretend server token minting equals an in-app meeting. The iOS app still needs a real LiveKit SDK-backed room view before the "voice meetings in the app" requirement is complete.

Next implementation seam:

- Add LiveKit Swift SDK or LiveKit Swift Components to `HighGroundCapture`, then build a small provider room controller/view that can join, leave, mute/unmute, report state, and stay separate from consent-gated Quipsly local recording.

## 2026-07-04 native provider-room seam

Implemented the first native provider-room seam in the iOS capture app without pretending the full LiveKit room is done:

- Added `ProviderRoomController.swift` as the app-side room state controller.
- Added `ProviderRoomView` below `RoomSpinePanel`.
- The view now shows a clear Live room section with Join room, Mute/Unmute, Leave, provider mic state, remote participant count, Quipsly recording state, fallback copy, and calm error text.
- Joining the provider room remains separate from Quipsly local recording. Recording still requires explicit Quipsly consent and visible user action.
- Added the camera usage description string to the iOS target so future provider-video work has the correct privacy prompt language.

LiveKit SDK attempt:

- Tried adding LiveKit's Swift package through the official `client-sdk-swift` package on `main`; SwiftPM fetched XCFramework artifacts but the resolver did not complete.
- Tried pinning exact release `2.15.1`; resolver still did not complete in a useful build loop.
- Removed the half-installed package references from the Xcode project so the app does not carry zombie dependency metadata.
- Kept the controller behind `#if canImport(LiveKit)`. The app builds today without LiveKit; once the package is installed cleanly, the same controller is the join/mute/leave patch point.
- Ran an isolated throwaway probe in `/tmp/quipsly-livekit-probe` with `swift package resolve` and exact `2.15.1`. Package metadata resolved, then timed out after 180 seconds while downloading binary artifacts:
  - `LiveKitWebRTC.xcframework.zip`
  - `RustLiveKitUniFFI.xcframework.zip`
- Conclusion: the blocker is dependency artifact acquisition time/reliability, not the Quipsly iOS app architecture. Keep LiveKit install work isolated until artifact download can finish predictably.

Validation evidence:

- iOS simulator build passed:
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project HighGroundCapture.xcodeproj -scheme HighGroundCapture -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`.
- Build warnings are limited to existing `onChange(of:perform:)` deprecation warnings in `IPadQuipslyStudioView.swift` and `IPhoneQuipslySessionView.swift`, plus the expected AppIntents metadata notice.
- Quipsly TypeScript stayed green:
  `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json`.
- Mobile capture smoke script syntax stayed valid:
  `node --check scripts/quipsly-mobile-capture-contract-smoke.mjs`.
- Privacy manifest still lints:
  `plutil -lint apps/mobile-capture/HighGroundCapture/HighGroundCapture/PrivacyInfo.xcprivacy`.

Next useful implementation step:

- Resolve LiveKit SDK installation in a controlled lane, preferably outside the main app build loop first. Options: add the official `https://github.com/livekit/client-sdk-swift.git` package through Xcode UI and inspect the generated project changes, or build a tiny throwaway SwiftPM/Xcode harness to verify the exact `LiveKit` package product before wiring it into `HighGroundCapture`.

## 2026-07-04 controlled LiveKit probe and iOS warning cleanup

Added `scripts/quipsly-livekit-swift-probe.sh` so LiveKit SDK acquisition can be tested outside the real iOS app project.

Why this matters:

- The app project should not carry half-installed SwiftPM package references.
- LiveKit package metadata resolves quickly, but the binary artifact downloads can be slow or hang.
- We need repeatable dependency evidence before wiring LiveKit into the capture app.

Probe behavior:

- Default version: `LIVEKIT_SWIFT_VERSION=2.15.1`.
- Default timeout: `TIMEOUT_SECONDS=900`.
- Optional build check: `RUN_BUILD=1`.
- Short validation run: `TIMEOUT_SECONDS=20 scripts/quipsly-livekit-swift-probe.sh`.
- The short run timed out at the expected artifact-download step:
  - `LiveKitWebRTC.xcframework.zip`
  - `RustLiveKitUniFFI.xcframework.zip`
- A longer probe was started with `TIMEOUT_SECONDS=900 scripts/quipsly-livekit-swift-probe.sh`. It reached the same artifact-download phase, grew the probe directory to about 161 MB, then showed no further growth across several checks. The probe was stopped manually rather than left to block the build loop.
- Current conclusion: LiveKit metadata and working-copy resolution are viable, but binary artifact acquisition is not reliable enough yet for the main app project. Do not wire LiveKit into `HighGroundCapture` until the artifact path is cache-warmed or verified through Xcode UI / controlled dependency setup.

iOS cleanup:

- Updated `IPhoneQuipslySessionView.swift` and `IPadQuipslyStudioView.swift` to the modern two-argument `onChange` closure.
- Re-ran iOS simulator build. It now reports only the expected AppIntents metadata notice, followed by `** BUILD SUCCEEDED **`.

Validation evidence:

- iOS simulator build passed:
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project HighGroundCapture.xcodeproj -scheme HighGroundCapture -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`.
- Quipsly TypeScript passed:
  `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json`.
- Mobile capture smoke script syntax passed:
  `node --check scripts/quipsly-mobile-capture-contract-smoke.mjs`.

Next useful implementation step:

- Cache/download the two LiveKit binary artifacts deliberately or use Xcode UI once to let Xcode own the package artifact flow, then inspect the generated project changes before committing them. Until then, continue product work through the local recording, consent, upload, transcript, packet, scheduling, and Stripe lanes.

## 2026-07-04 mobile capture preflight command

Added `scripts/quipsly-mobile-capture-preflight.sh` as the default local health check for the capture lane.

Default checks:

- `PrivacyInfo.xcprivacy` lint.
- Quipsly TypeScript contract.
- Mobile capture smoke script syntax.
- iOS simulator build with the real Xcode developer directory.

Optional checks:

- `RUN_ROUTE_SMOKE=1 BASE_URL=http://127.0.0.1:3000 scripts/quipsly-mobile-capture-preflight.sh`
- `RUN_LIVEKIT_PROBE=1 LIVEKIT_TIMEOUT_SECONDS=900 scripts/quipsly-mobile-capture-preflight.sh`

Validation evidence:

- Ran `scripts/quipsly-mobile-capture-preflight.sh`.
- Result: privacy manifest `OK`, TypeScript passed, mobile capture script syntax passed, iOS simulator build reported `** BUILD SUCCEEDED **`.

## 2026-07-05 mobile capture ingestion idempotency pass

Hardened `apps/quipsly/src/lib/server/mobile-capture-records.ts` so upload retries and chunk finalization preserve one app-owned truth instead of quietly creating duplicate evidence.

Behavioral fixes:

- If the iOS app sends `callRoomId`, ingestion now attaches to the existing `CallRoom` by ID before falling back to provider-room upsert behavior.
- Existing room metadata is merged with mobile-ingest evidence instead of replacing all prior context.
- Existing `CallParticipant` is reused when `participantId` belongs to the room.
- Existing recording-asset participant is reused for retry/finalization paths when possible.
- Existing consent rows are reused/updated instead of creating duplicate granted consent rows for repeated uploads.
- Existing recording assets are reused by explicit `recordingAssetId`, or by room/file/start/kind match when the app retries without an asset ID.
- Retry/finalization updates preserve existing room/project/storage/segment evidence when a later upload request omits optional fields.
- Upload chunks remain upserted by `(assetId, chunkIndex)` and now also refresh `uploadedAt` on retry.
- Existing transcript jobs are reused. `HELD` and `FAILED` jobs are requeued to `QUEUED` when the verified asset is ingested again; completed/running/queued jobs are preserved.

Why this matters:

- The iOS capture app can safely retry uploads without making the session look like multiple calls happened.
- Transcript and packet work gets one stable asset/job lineage.
- Recovery stays calm: source recordings remain preserved, while Quipsly state converges instead of multiplying.

Validation evidence:

- Quipsly TypeScript passed:
  `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json`.
- Mobile capture preflight passed:
  `scripts/quipsly-mobile-capture-preflight.sh`.

## 2026-07-05 mobile capture idempotency smoke

Added `scripts/quipsly-mobile-capture-ingestion-idempotency.test.mjs`.

The smoke uses an in-memory Prisma double against the real `recordMobileCaptureIngestion` helper and proves:

- an existing `callRoomId` attaches to the existing room;
- the same participant is reused;
- the same recording consent row is reused and granted;
- retry/finalization keeps one recording asset;
- retry/finalization keeps one transcript job;
- upload chunks are upserted instead of duplicated;
- a previously `FAILED` transcript job is requeued after verified asset evidence returns;
- an already `VERIFIED` recording is not downgraded by a later retry;
- storage bucket/object path are preserved when a retry omits optional storage fields.

Preflight integration:

- `scripts/quipsly-mobile-capture-preflight.sh` now runs the idempotency smoke after route-contract syntax validation and before the iOS simulator build.
- The smoke currently emits Node's `DEP0180` warning through the `ts-node-esm` path. It exits cleanly and does not affect capture behavior.

Validation evidence:

- `TS_NODE_PROJECT=apps/quipsly/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 apps/quipsly/node_modules/.bin/ts-node-esm scripts/quipsly-mobile-capture-ingestion-idempotency.test.mjs` passed.
- `scripts/quipsly-mobile-capture-preflight.sh` passed and included:
  - privacy manifest lint;
  - Quipsly TypeScript;
  - mobile capture contract syntax;
  - ingestion idempotency smoke;
  - iOS simulator build with `** BUILD SUCCEEDED **`.

## 2026-07-05 mobile ingest auth boundary pass

Protected the two recorder upload entrypoints:

- `POST /api/ingest/mobile`
- `POST /api/ingest/mobile/chunk`

Changes:

- Both routes now require a Quipsly session through `getQuipslySessionFromRequest`.
- Anonymous uploads return calm JSON 401 responses before reading multipart/chunk bodies.
- Fallback Home Nest attachment now uses the signed-in Quipsly user's email through `ensureHomeNestForEmail`, rather than relying on ambient legacy `auth()` state.
- The default mobile capture contract smoke now includes unauthenticated boundary checks for both ingest routes.

Why this matters:

- The iOS app sends a Firebase bearer token for chunk uploads.
- Upload routes must not accept arbitrary public media writes.
- Recording/upload recovery stays app-owned and user-owned instead of becoming a public ingest hole.

Validation evidence:

- Quipsly TypeScript passed:
  `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json`.
- Mobile capture preflight passed:
  `scripts/quipsly-mobile-capture-preflight.sh`.
- Local route contract passed:
  `node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json`
  returned `ok:true`, `18/18` checks passing, including:
  - `oneShotIngestUnauthenticatedBoundary`;
  - `chunkIngestUnauthenticatedBoundary`.

## 2026-07-05 authenticated ingest bad-request contract prep

Hardened post-auth upload validation for mobile ingest routes:

- `POST /api/ingest/mobile` now returns calm `{ ok:false, error }` JSON for malformed or missing multipart form data after authentication.
- `POST /api/ingest/mobile` now returns calm `{ ok:false, error:"No file provided" }` when a signed-in request omits the file.
- `POST /api/ingest/mobile/chunk` now uses the same `{ ok:false, error }` shape for bad chunk headers/payloads.
- `scripts/quipsly-mobile-capture-contract-smoke.mjs` now includes optional bearer-token checks for both ingest routes. When `QUIPSLY_MOBILE_CAPTURE_BEARER_TOKEN` or `--token=...` is present, it sends intentionally incomplete upload requests and expects non-mutating JSON `<500` responses.

Validation evidence:

- Quipsly TypeScript passed:
  `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json`.
- Mobile capture preflight passed:
  `scripts/quipsly-mobile-capture-preflight.sh`.
- Local unauthenticated route contract passed:
  `node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json`
  returned `ok:true`, `18/18` checks passing.

Not yet proven:

- The new authenticated ingest bad-request checks were not executed in this shell because no mobile bearer token was available. Run:
  `QUIPSLY_MOBILE_CAPTURE_BEARER_TOKEN=<firebase-id-token> node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json`

## 2026-07-05 mobile capture ingest auth validation

What changed:
- One-shot mobile ingest and chunk ingest now require a Quipsly session before accepting uploads.
- Both upload routes return calm `{ ok: false, error }` JSON for unauthenticated requests instead of relying on implicit actor fallback.
- Malformed/missing multipart upload requests return calm 400 responses after authentication, so bearer-token route smoke can test bad-request behavior without mutating media.
- The mobile capture contract smoke now includes optional authenticated bad-request checks for ingest routes when a real bearer token is supplied.

Validation run:
- `node --check scripts/quipsly-mobile-capture-contract-smoke.mjs` passed.
- `scripts/quipsly-mobile-capture-preflight.sh` passed: privacy manifest OK, Quipsly TypeScript OK, contract syntax OK, ingestion idempotency PASS, iOS simulator build succeeded.
- `node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json` passed 18/18 unauthenticated route checks.

Open proof:
- Authenticated ingest bad-request checks are prepared but were not executed in this run because no real bearer token was provided in the shell environment.
- Next safe proof is to provide a generated dev/test bearer token and run the same contract smoke with `--token` or `QUIPSLY_MOBILE_CAPTURE_BEARER_TOKEN`.

## 2026-07-05 generated mobile capture auth smoke

Added `scripts/quipsly-mobile-capture-generated-auth-smoke.mjs` as the repeatable proof path for signed-in mobile capture behavior.

What it does:
- Creates a disposable Firebase email/password user with a generated `codex-mobile-capture-*.dev.test` identity.
- Exchanges the Firebase ID token through Quipsly `/api/auth/session` so app-owned User, Home Nest, and free-tier onboarding truth exist.
- Runs `scripts/quipsly-mobile-capture-contract-smoke.mjs` with the generated bearer token.
- Requires authenticated proof for the one-shot ingest and chunk ingest bad-request contracts.
- Cleans up generated Quipsly/Firebase artifacts and never prints passwords, Firebase tokens, session cookies, bearer tokens, or database URLs.

Preflight integration:
- `scripts/quipsly-mobile-capture-preflight.sh` now syntax-checks both mobile capture smoke scripts.
- Set `RUN_GENERATED_AUTH_SMOKE=1 BASE_URL=<target>` to include the generated signed-in mobile proof in preflight.

Evidence from this run:
- `node --check scripts/quipsly-mobile-capture-generated-auth-smoke.mjs` passed.
- Local `http://127.0.0.1:3000` generated-auth smoke is blocked before route proof because local Firebase Admin preflight returns credential unavailable.
- Local `http://127.0.0.1:3012` was unreachable.
- Live `https://nest.quipsly.com` generated-auth smoke proved Firebase signup, Quipsly session exchange, Home Nest, and free-tier onboarding, then cleaned up generated artifacts.
- Live generated-auth capture contract still fails because live ingest routes are stale: one-shot ingest returns a 500 for malformed post-auth upload and chunk ingest still returns a pre-auth `Missing X-Session-ID` 400 shape.

Deploy/auth wall:
- `bash scripts/release/quipsly-gcloud-auth-check.sh` still fails user-token, ADC, deploy-project, and Firebase-project checks.
- Reauth is required before local Firebase Admin proof or live deploy/promotion can prove the new capture routes.

Next proof after reauth/deploy:
1. `bash scripts/release/quipsly-gcloud-auth-check.sh`
2. Deploy/promote Nest with the local mobile capture route changes.
3. `RUN_GENERATED_AUTH_SMOKE=1 BASE_URL=https://nest.quipsly.com scripts/quipsly-mobile-capture-preflight.sh`

## 2026-07-05 post-generated-auth harness validation

Validation after adding the generated-auth harness to preflight:
- `scripts/quipsly-mobile-capture-preflight.sh` passed.
  - Privacy manifest lint OK.
  - Quipsly TypeScript OK.
  - Mobile capture contract syntax OK, including generated-auth smoke syntax.
  - Ingestion idempotency PASS.
  - iOS simulator build succeeded.
- `node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json` passed 18/18 unauthenticated checks.

Current blocker is external auth/deploy state, not local code validation:
- `bash scripts/release/quipsly-gcloud-auth-check.sh` reports stale gcloud user credentials, stale ADC, no deploy-project access proof, and no Firebase-project access proof.
- Live `https://nest.quipsly.com` proves generated Firebase signup/session/Home Nest/free-tier, but still runs stale ingest route behavior until deployment.

## 2026-07-05 iPhone capture runway overview

Improved the iPhone session home surface so the first screen points at the real coaching/podcast capture workflow instead of only sample manuscript context.

Changes:
- Added `MobileCaptureRunwayPanel` to the iPhone Session tab.
- The panel loads capture sessions and readiness state, then shows:
  - selected/upcoming Quipsly capture session;
  - consent status;
  - visible recording status and duration when active;
  - preserved upload/recovery status;
  - transcript and packet status;
  - provider-room badge and after-capture next action;
  - App Store risk/readiness line from the readiness endpoint.
- The overview is intentionally read-only for sensitive mutations. It can refresh and jump to the Record tab, but consent grants, room changes, recording start/stop, transcript runs, and packet builds remain in the deeper recorder control surface.

Why this matters:
- App reviewers and beta testers see the safety model before they see a record button.
- Humans get a calm path: session -> consent -> record -> upload -> transcript -> packet.
- The app better reflects the Quipsly rule that recording is explicit, visible, recoverable, and evidence-based.

Validation:
- `scripts/quipsly-mobile-capture-preflight.sh` passed.
  - Privacy manifest lint OK.
  - Quipsly TypeScript OK.
  - Mobile capture smoke syntax OK.
  - Mobile capture ingestion idempotency PASS.
  - iOS simulator build succeeded.
- `node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json` passed 18/18 unauthenticated route checks.

Known non-blocking warning:
- Direct iOS simulator build still reports AppIntents metadata extraction skipped because no AppIntents dependency exists. This is not caused by the capture runway panel.

## 2026-07-05 - Coaching scheduling runway visibility

Added a scheduling visibility layer to the coaching runway without changing schema or touching external providers.

Changed:
- `/api/coaching/runway` now returns active coach availability windows and active/recent booking holds.
- The coaching page now shows a "Scheduling runway" section with availability clues and booking holds before sessions become confirmed bookings.
- The page keeps the product boundary clear: availability is a scheduling clue, holds are temporary, bookings are committed Quipsly truth, calendar/Stripe remain receipt-backed evidence only.

Validation:
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- `bash scripts/quipsly-mobile-capture-preflight.sh` passed, including Quipsly TypeScript, capture smoke syntax, ingestion idempotency, and iOS simulator build.

Notes:
- No schema change was needed.
- No external calendar event, Stripe charge, invite, upload, or publication action was performed.
- Deploy remains gated on healthy gcloud/ADC auth before this can be promoted safely.

## 2026-07-05 - Hold-only scheduling action

Added a safe scheduling middle state before full coaching bookings.

Changed:
- `/api/coaching/runway` now accepts `create-booking-hold` for staff users.
- Hold creation creates or updates the invited app-owned user, writes a `BookingHold`, attaches optional offering/coach profile context when available, and stores metadata that no external calendar, invite, or Stripe checkout was created.
- The coaching page create form now lets staff choose either `Hold slot only` or `Create booking and capture room`.

Validation:
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- `bash scripts/quipsly-mobile-capture-preflight.sh` passed, including the iOS simulator build.

Safety:
- No external provider mutation.
- No charge, invite, calendar event, publication, or account mutation outside Quipsly-owned DB records.
- This keeps lead -> hold -> booking -> room -> recording -> transcript -> packet as inspectable app-owned states.

## 2026-07-05 - Generated coaching runway auth smoke harness

Added a generated-user coaching smoke harness for repeatable runway proof without using Charlie's browser session.

Changed:
- Added `scripts/quipsly-coaching-generated-auth-smoke.mjs`.
- The harness creates a disposable Firebase identity, exchanges it through `/api/auth/session`, promotes only that generated user to `OWNER` in the Quipsly DB, loads `/api/coaching/runway` with a Bearer token, creates a `create-booking-hold`, reloads the runway, verifies the active hold appears, then cleans up generated users, holds, memberships, home nest, grants, invites, and Firebase auth state.
- Added default syntax coverage and optional execution to `scripts/quipsly-mobile-capture-preflight.sh` via `RUN_COACHING_GENERATED_AUTH_SMOKE=1`.

Validation:
- `node --check scripts/quipsly-coaching-generated-auth-smoke.mjs` passed.
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- `bash scripts/quipsly-mobile-capture-preflight.sh` passed, including iOS simulator build.
- Optional local generated coaching smoke was attempted with `RUN_COACHING_GENERATED_AUTH_SMOKE=1 BASE_URL=http://127.0.0.1:3000 bash scripts/quipsly-mobile-capture-preflight.sh` and failed safely before user creation because server Firebase Admin preflight is unavailable locally.

Notes:
- The failure is an environment/credential readiness issue, not a harness syntax or type issue.
- The smoke does not print generated passwords, Firebase tokens, session cookies, bearer tokens, or database URLs.
- The smoke does not charge, invite, publish, upload, or create external calendar events.

## 2026-07-05 - Booking hold release flow

Added the reversible side of the scheduling hold model.

Changed:
- `/api/coaching/runway` now accepts staff-only `release-booking-hold`.
- Converted holds cannot be released because they stay attached to booking evidence.
- Already released holds return idempotent success.
- Active holds update to the schema-backed `CANCELED` status and preserve release metadata in `metadataJson`. In product copy this is still described as "released" because the slot is no longer reserved.
- The coaching runway UI now lets staff release active holds from the Scheduling runway panel.
- `scripts/quipsly-coaching-generated-auth-smoke.mjs` now proves create-hold, reload-visible, release-hold, reload-released when optional generated auth smoke can run against a ready server.

Validation:
- `node --check scripts/quipsly-coaching-generated-auth-smoke.mjs` passed.
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- `bash scripts/quipsly-mobile-capture-preflight.sh` passed, including iOS simulator build.

Safety:
- Release only mutates Quipsly-owned hold state.
- No external calendar, invite, Stripe, upload, recording, or publishing action is performed.

## 2026-07-05 - Booking reschedule/cancel runway truth

Added explicit scheduling transitions for confirmed coaching bookings without pretending external providers changed.

Changed:
- `/api/coaching/runway` now accepts staff-only `reschedule-booking`.
- Reschedule updates the Quipsly `Appointment`, `CoachingBooking`, and planned `CallRoom` schedule, preserves a `scheduleEvents` audit trail in metadata, and creates a new `CalendarEventLink` receipt slot with `status:"reschedule-planned"`.
- `/api/coaching/runway` now accepts staff-only `cancel-booking`.
- Cancel marks the Quipsly `Appointment`, `CoachingBooking`, and planned/open `CallRoom` as `CANCELED`, preserves a `scheduleEvents` audit trail, and creates a `CalendarEventLink` receipt slot with `status:"cancel-planned"`.
- Both actions refuse unsafe transitions from completed, recording, ended, or already-canceled state rather than silently rewriting history.
- `/coaching` now shows a staff-only `Change session safely` panel on booking cards with reschedule/cancel controls, reason notes, state-lock messaging, and plain-English external-receipt boundaries.
- The generated coaching smoke now proves create hold -> release, create hold -> convert, invited client mobile visibility, reschedule visibility, cancel visibility, and canceled mobile sessions being non-recordable.

Safety:
- Reschedule/cancel only mutate Quipsly-owned records.
- External calendar/invite/payment truth remains a receipt slot until a provider receipt is attached.
- No provider calendar event, Stripe charge, upload, recording, invite, or publication is created by these actions.

Validation:
- `node --check scripts/quipsly-coaching-generated-auth-smoke.mjs` passed.
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- `bash scripts/quipsly-mobile-capture-preflight.sh` passed, including the iOS simulator build.
- After the staff UI panel was added, `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` and `node --check scripts/quipsly-coaching-generated-auth-smoke.mjs` still passed.
- `cd apps/quipsly && npm run build` passed and listed `/api/coaching/runway` plus `/coaching`. The known Turbopack NFT tracing warning through `src/app/(app)/nests/[slug]/actions.ts` remains unrelated cleanup debt.

## 2026-07-05 - Convert hold to booking and capture room

Added the scheduling graduation path from temporary hold to real Quipsly session state.

Changed:
- `/api/coaching/runway` now accepts staff-only `convert-booking-hold`.
- Conversion creates the proper app-owned records: `Appointment`, `CoachingBooking`, optional pending `PaymentRecord`, planned `CallRoom`, coach/client `CallParticipant` rows, requested `RecordingConsent` rows, and a planned `CalendarEventLink` receipt slot.
- The original `BookingHold` is marked `CONVERTED` and linked to the created booking.
- Converted/released/expired holds are protected from accidental bad conversion.
- The coaching runway UI now exposes `Convert` for active holds beside `Release`.
- `scripts/quipsly-coaching-generated-auth-smoke.mjs` now proves two generated hold paths when optional runtime smoke can run: create -> release and create -> convert -> booking/room visible.
- Generated smoke cleanup now removes generated booking, room, calendar, checkout ledger, appointment, payment, hold, home nest, membership, and user artifacts precisely.

Validation:
- `node --check scripts/quipsly-coaching-generated-auth-smoke.mjs` passed.
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- `bash scripts/quipsly-mobile-capture-preflight.sh` passed, including iOS simulator build.

Safety:
- Conversion does not create external calendar events, send invites, create provider rooms, charge money, publish, upload, or record.
- Calendar and Stripe remain receipt slots/evidence, not assumed external truth.

## 2026-07-05 - iOS capture booking context

Connected the web scheduling runway more clearly into the iOS capture session surface.

Changed:
- `/api/mobile/capture/sessions` now includes `bookingStatus`, `paymentPolicy`, and latest `calendarStatus` for each capture session.
- `MobileCaptureSession` now decodes those fields and exposes booking/schedule helper labels.
- The iPhone Capture runway panel now shows a booking/schedule safety fact before consent/recording/upload/transcript status.

Why this matters:
- The phone no longer treats a capture room as contextless. It can show whether the room came from a confirmed booking, a payment hold, or a planned room.
- Calendar and Stripe remain evidence/receipt state. The mobile app does not claim an external calendar event or payment unless provider evidence exists.

Validation:
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- `bash scripts/quipsly-mobile-capture-preflight.sh` passed, including iOS simulator build.
- Build emitted a non-blocking AppIntents metadata warning because this app has no AppIntents framework dependency.

## 2026-07-05 - Coaching payment portal visibility and contract smoke

Strengthened the one-to-one coaching payment evidence lane.

Changed:
- `/api/coaching/runway` now exposes `coachingCustomerPortalEnabled`, booking `clientUserId`, Stripe customer evidence, customer evidence livemode, and portal next-action language.
- `/coaching` now shows customer evidence/portal readiness per booking and exposes a staff-only `Open portal` action only when customer evidence exists and `COACHING_CUSTOMER_PORTAL_ENABLED=true`.
- Added `scripts/quipsly-coaching-payment-contract-smoke.mjs` for cheap route-boundary proof.
- Added default syntax coverage and optional execution to `scripts/quipsly-mobile-capture-preflight.sh` via `RUN_COACHING_PAYMENT_SMOKE=1`.

Validation:
- `node --check scripts/quipsly-coaching-payment-contract-smoke.mjs` passed.
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- `bash scripts/quipsly-mobile-capture-preflight.sh` passed.
- Optional local route smoke passed with `RUN_COACHING_PAYMENT_SMOKE=1 BASE_URL=http://127.0.0.1:3000 bash scripts/quipsly-mobile-capture-preflight.sh`.

Observed local route-smoke evidence:
- `POST /api/coaching/checkout` unauthenticated -> JSON 401.
- `POST /api/coaching/customer-portal` unauthenticated -> JSON 401.
- `POST /api/coaching/webhooks/stripe` with missing local `STRIPE_SECRET_KEY` -> controlled JSON 503, no HTML crash and no secret leakage.

Safety:
- Portal action depends on existing Stripe customer evidence. It does not create a booking, charge money, alter calendar state, record, upload, or publish.
- Stripe remains evidence for one-to-one coaching only. Quipsly booking/payment/capture state remains the app-owned truth.

## 2026-07-05 - Firebase Admin credential seam hardening

Made generated-auth coaching proof easier to diagnose and less dependent on one fragile credential shape.

Changed:
- `apps/quipsly/src/lib/firebase/firebase-admin.ts` now supports Firebase Admin credentials from:
  - `FIREBASE_SERVICE_ACCOUNT_JSON`
  - `GOOGLE_APPLICATION_CREDENTIALS_JSON`
  - `GCP_SERVICE_ACCOUNT_JSON`
  - `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`
  - Application Default Credentials as the fallback.
- `/api/auth/firebase-admin-preflight` now returns sanitized runtime evidence: project id, credential source, credential env name, explicit-project flag, and service-account-email presence.
- `scripts/quipsly-coaching-generated-auth-smoke.mjs` now includes sanitized Firebase Admin runtime evidence when it stops before creating generated users.

Validation:
- `node --check scripts/quipsly-coaching-generated-auth-smoke.mjs` passed.
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- `bash scripts/quipsly-mobile-capture-preflight.sh` passed, including iOS simulator build.
- Local `/api/auth/firebase-admin-preflight` returns structured JSON with `credentialSource: application-default` and `projectId: quipsly-reef`.
- Direct generated coaching smoke was attempted and failed safely before creating any Firebase user, Quipsly session, booking hold, booking, or capture room.

Current boundary:
- Local `bash scripts/release/quipsly-gcloud-auth-check.sh` reports stale/unusable gcloud and Application Default Credentials for `charlie@highgroundodyssey.com`.
- Next operator action before full generated smoke: run `gcloud auth login --update-adc --brief`, then verify with `bash scripts/release/quipsly-gcloud-auth-check.sh`, restart the local Next server, and rerun `node scripts/quipsly-coaching-generated-auth-smoke.mjs --base-url=http://127.0.0.1:3000`.

Safety:
- No secrets are printed.
- The failed generated smoke did not create test users or booking artifacts.
- This change does not alter Stripe charging, calendar writes, recording behavior, publishing, uploads, or source media.

## 2026-07-05 - Generated-auth smoke diagnostics aligned

Extended the safer Firebase Admin preflight diagnostics across the generated-auth smoke family.

Changed:
- `scripts/quipsly-mobile-capture-generated-auth-smoke.mjs`
- `scripts/quipsly-generated-native-account-app-smoke.mjs`
- `scripts/quipsly-generated-self-serve-account-smoke.mjs`
- `scripts/quipsly-coaching-generated-auth-smoke.mjs`

Each script now includes sanitized Firebase Admin runtime evidence when `/api/auth/firebase-admin-preflight` stops the run before generated user creation.

Validation:
- `node --check` passed for all four generated-auth smoke scripts.
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed after the shared Firebase Admin initializer change.

Why it matters:
- Coaching and mobile capture generated-auth proof now fail in the same clear way when ADC/server credentials are stale.
- The scripts still stop before creating users, sessions, holds, bookings, rooms, or app artifacts when Firebase Admin preflight is unavailable.

## 2026-07-05 - Capture packet readback and mobile packet visibility

Strengthened the bridge from uploaded/transcribed capture to reusable Quipsly assets.

Changed:
- `/api/mobile/capture/sessions` now includes packet title, packet preview text, latest packet activity, and first open action-item evidence when a transcript-built packet exists.
- `/api/mobile/capture/transcripts/packet` now supports a protected `GET` read path by `callRoomId`, `roomId`, or `transcriptJobId`.
- Packet readback returns room context, latest transcript job evidence, summary note, highlights, action items, counts, and next action.
- The iOS capture app now decodes packet title/preview metadata and displays packet review evidence in the After Capture panel.
- `scripts/quipsly-mobile-capture-contract-smoke.mjs` now includes the packet-read endpoint in protected route boundary checks.

Validation:
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- `node --check scripts/quipsly-mobile-capture-contract-smoke.mjs` passed.
- `node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json` passed with 19/19 boundary checks, including `transcriptPacketReadUnauthenticatedBoundary`.
- Earlier in this slice, `bash scripts/quipsly-mobile-capture-preflight.sh` passed, including the iOS simulator build.

Safety:
- Packet readback is read-only.
- No recording, upload, publish, invite, external calendar mutation, or Stripe charge is performed.
- Packet notes/action items remain app-owned Quipsly records created from transcript evidence; provider transcripts are evidence, not source truth.

## 2026-07-05 HGO to Quipsly coaching handoff seam

Added a public, no-side-effect coaching handoff from High Ground Odyssey to Quipsly Nest.

- `apps/quipsly/src/app/api/coaching/public/route.ts` now returns a public JSON packet that explains the coaching runway, safe links, source-of-truth boundaries, free account/Home Nest behavior, and the fact that the packet does not create bookings, charge cards, publish, send, or record.
- `apps/web/src/lib/hgo/coaching-handoff.ts` centralizes HGO-to-Nest URLs using `NEXT_PUBLIC_NEST_BASE_URL`, `NEXT_PUBLIC_QUIPSLY_NEST_URL`, `NEST_BASE_URL`, or `https://nest.quipsly.com` fallback.
- `apps/web/src/app/coaching/page.tsx` now treats HGO as the public coaching front porch and Quipsly Nest as the booking, consent, capture, transcript, payment-evidence, and packet workbench. The main CTA sends users to `/login?callbackUrl=/coaching?source=hgo-coaching&intent=coaching`; the old HGO request path remains a simple fallback.
- `scripts/quipsly-coaching-public-handoff-smoke.mjs` validates the public packet shape, login/runway links, and explicit no-side-effect boundaries.

Validation:

- `node --check scripts/quipsly-coaching-public-handoff-smoke.mjs` passed.
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- `node scripts/quipsly-coaching-public-handoff-smoke.mjs --base-url=http://127.0.0.1:3000 --json` passed against the already-running Quipsly dev server.
- Direct `curl http://127.0.0.1:3000/api/coaching/public?source=hgo-coaching` returned HTTP 200 JSON.

Known validation boundary:

- `pnpm --filter web exec tsc --noEmit --project tsconfig.json` and `pnpm --filter quipsly exec ...` currently trigger a workspace dependency install that fails on unrelated `apps/desktop-companion` exotic subdependency policy.
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/web/tsconfig.json` reaches the web typecheck but is blocked by existing web drift: generated Prisma client missing coaching/capture models, missing `@google-cloud/storage` resolution for web coaching capture helpers, and duplicate `createCoachingCustomerPortalSession` in `apps/web/src/lib/server/coaching/stripe.ts`.
- Treat the Quipsly public packet as live-smoked; do not treat the whole HGO web app as fully typechecked until those pre-existing blockers are resolved.

Correction after cleanup:

- The duplicate `createCoachingCustomerPortalSession` implementation in `apps/web/src/lib/server/coaching/stripe.ts` was removed. The remaining implementation keeps the `COACHING_CUSTOMER_PORTAL_ENABLED=true` gate and the richer Stripe customer evidence lookup.
- Re-running `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/web/tsconfig.json` confirms the duplicate-function error is gone. Remaining blockers are generated Prisma client/model drift, `@google-cloud/storage` resolution in the web coaching capture helpers, and existing nullability warnings in `capture-transcripts.ts`.

Dependency topology note:

- `prisma generate --schema=prisma/schema.prisma` succeeds and the root schema contains the coaching/capture models.
- The repo currently has multiple pnpm `@prisma/client` package instances. Root `node_modules/@prisma/client` resolves to a different pnpm instance than `apps/web/node_modules/@prisma/client` and `apps/quipsly/node_modules/@prisma/client`.
- Prisma generate is writing to the root-resolved instance, while app-level typechecking can resolve the app-linked instance. That explains why generated model delegates can appear missing even after generation.
- Do not solve this by casting every Prisma call to `any`. The durable fix is workspace dependency hygiene so web/quipsly/root resolve the same generated Prisma client instance, or an explicit Prisma client output path consumed consistently by the apps.

## 2026-07-05 Prisma client topology fix and web typecheck recovery

Fixed the pnpm/Prisma topology issue that made app-level typechecks see a generated client without the coaching/capture model delegates.

What changed:

- Added `scripts/prisma-generate-workspace-clients.mjs`.
- Updated root `postinstall` to run that script instead of plain `prisma generate`.
- The script runs Prisma generate from the root schema, then mirrors the generated `.prisma/client` into every physical pnpm `@prisma/client` instance used by workspace apps.
- This preserves the current package layout while making generated Prisma types line up with app imports.

Also cleaned real web typecheck issues revealed after the generated client was synchronized:

- Added `apps/web/src/lib/server/coaching/gcs-storage.ts`, a lazy server-side Google Cloud Storage loader with a clear runtime error if storage is unavailable.
- Updated coaching transcript and LiveKit egress helpers to use lazy GCS loading instead of static imports that could break local typecheck when optional storage plumbing is not linked.
- Fixed transcript word-group nullability narrowing.
- Fixed Prisma JSON value typing in Stripe and LiveKit capture ledgers.

Validation after fix:

- `node --check scripts/prisma-generate-workspace-clients.mjs` passed.
- `node scripts/prisma-generate-workspace-clients.mjs` passed and synchronized both physical `@prisma/client` instances.
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/web/tsconfig.json` passed.
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- `node scripts/quipsly-coaching-public-handoff-smoke.mjs --base-url=http://127.0.0.1:3000 --json` passed.

Current meaning:

- HGO coaching page and Quipsly public coaching packet now have a typed, smoke-tested handoff path.
- The broader coaching/capture goal is still active: App Store capture readiness, real meeting spine hardening, test-mode Stripe end-to-end proof, transcript packet UX, and reviewer/admin workflows still need more production work.

## 2026-07-05 iPad capture runway surfaced and mobile preflight verified

Made the iPad Session surface behave like a real capture app entry point instead of only a manuscript/studio landing page.

What changed:

- `apps/mobile-capture/HighGroundCapture/HighGroundCapture/IPadQuipslyStudioView.swift` now places `MobileCaptureRunwayPanel` directly on the iPad Session page.
- The iPad hero copy now states that capture readiness is visible alongside the manuscript, cue, and precision-tool flow.
- This reuses the existing runway truth surface for assigned sessions, recording consent, active recording state, upload recovery, transcript packet state, and the route to Record controls.

Validation:

- `bash scripts/quipsly-mobile-capture-preflight.sh` passed.
- Privacy manifest lint passed.
- `apps/quipsly` TypeScript passed.
- Mobile capture contract syntax checks passed.
- Mobile capture ingestion idempotency test passed.
- iOS simulator build passed.

Known warning:

- Xcode emitted `Metadata extraction skipped. No AppIntents.framework dependency found.` This is expected while the capture app has no AppIntents/Siri/Shortcuts surface and is not a blocker.

Current meaning:

- The iPad capture path now has the same safety runway concept as iPhone: users can see consent, session, upload, transcript, and next-action state before recording.
- This does not record, upload, publish, charge, send invitations, or mutate external accounts.

Additional local route validation:

- `RUN_ROUTE_SMOKE=1 RUN_COACHING_PAYMENT_SMOKE=1 BASE_URL=http://127.0.0.1:3000 bash scripts/quipsly-mobile-capture-preflight.sh` passed.
- Mobile capture route smoke passed 19/19 checks against the local Quipsly dev server, including readiness shape, privacy/deletion URLs, explicit consent, visible recording, no hidden recording, no provider secret exposure, and calm unauthenticated boundaries for sessions, consent, room join/state, transcripts, packet read/build, and uploads.
- Coaching payment route smoke passed 3/3 checks: checkout requires sign-in, customer portal requires sign-in, and Stripe webhook returns controlled JSON when `STRIPE_SECRET_KEY` is not configured.
- iOS simulator build passed again in the route-smoke preflight.

## 2026-07-05 reviewer-safe coaching session preset

Added a small staff UX accelerator to the Quipsly coaching runway.

What changed:

- `apps/quipsly/src/app/(app)/coaching/page.tsx` now has a `Reviewer preset` button in the Create local session card.
- The preset fills an editable, reviewer-safe coaching capture session template: manual/no-checkout payment, 30 minutes, next-day local start, and `reviewer-capture@dev.test` placeholder contact.
- The preset does not create records by itself. It only prepares the existing staff form, preserving the same API, permission, and safety boundaries.

Validation:

- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.

Current meaning:

- Staff can prepare reviewer/test capture sessions faster without remembering all fields.
- Actual record creation still uses `/api/coaching/runway` and remains staff-gated.

## 2026-07-05 iOS native auth moved to Firebase email/password

Replaced the iOS capture app's retired native handoff login path with a Firebase-first native reviewer/operator sign-in path.

What changed:

- `apps/mobile-capture/HighGroundCapture/HighGroundCapture/AuthManager.swift` now signs in through Firebase Identity Toolkit email/password REST, stores ID/refresh tokens in Keychain, refreshes ID tokens through `securetoken.googleapis.com`, and verifies app access through `/api/mac/session-check` with a Firebase bearer token.
- `apps/mobile-capture/HighGroundCapture/HighGroundCapture/LoginView.swift` now exposes email/password fields and clear reviewer/test-account copy.
- `UploadManager.swift` now reads the stored bearer token through a nonisolated static accessor instead of reaching into the main-actor auth singleton from URLSession delegate work.
- Added `scripts/quipsly-ios-native-auth-static-smoke.mjs` to protect the invariant that iOS capture uses Firebase email/password plus Quipsly bearer verification, not `/api/mac/session-handoff`, `/api/mac/session-exchange`, or `ASWebAuthenticationSession`.
- `scripts/quipsly-mobile-capture-preflight.sh` now runs that static auth smoke by default.
- Updated `docs/quipsly/mac-native-auth.md` and `docs/quipsly/ios-capture-app-store-readiness.md` with the current iOS implementation and validation path.

Validation:

- `node --check scripts/quipsly-ios-native-auth-static-smoke.mjs` passed.
- `node scripts/quipsly-ios-native-auth-static-smoke.mjs` passed.
- `bash scripts/quipsly-mobile-capture-preflight.sh` passed with privacy manifest lint, Quipsly TypeScript, mobile capture contract syntax, native auth static invariant, ingestion idempotency, and iOS simulator build.
- `RUN_ROUTE_SMOKE=1 RUN_COACHING_PAYMENT_SMOKE=1 BASE_URL=http://127.0.0.1:3000 bash scripts/quipsly-mobile-capture-preflight.sh` passed with 19/19 mobile capture boundary checks and 3/3 coaching payment boundary checks.
- `http://127.0.0.1:3000/api/mac/firebase-client-config` returned public Firebase config shape with `projectId: quipsly-reef` and no secret exposure.

Current meaning:

- iOS Capture now has a boring reviewer/account login path that does not depend on the missing Mac handoff routes.
- Full signed-in generated smoke still needs local Firebase ADC refresh or an explicit local service-account credential path before it can run against local Next.
- No real payment, recording, invite, publication, or external account mutation was performed.

## 2026-07-05 booking-to-capture bridge smoke strengthened

Strengthened the generated coaching auth smoke so it now checks the real invitation-to-capture bridge, not just staff runway creation.

What changed:

- `scripts/quipsly-coaching-generated-auth-smoke.mjs` now creates a generated staff Firebase user, creates/converts a coaching hold into a booking and planned capture room, then creates a generated client Firebase login for the invited booking client email.
- The smoke verifies that the invited client first sign-in links to the existing app-owned booking user, receives Home Nest/free-tier onboarding truth, and can load `/api/mobile/capture/sessions`.
- The smoke asserts that the converted capture room is visible to the invited client with participant row, requested/not-granted consent, local fallback provider readiness, confirmed booking status, and planned calendar receipt truth.
- Cleanup now supports deleting both generated Firebase users while still refusing to touch non-generated `codex-coaching-*@dev.test` identities.

Validation:

- `node --check scripts/quipsly-coaching-generated-auth-smoke.mjs` passed.
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.

Live-smoke blocker:

- `BASE_URL=http://127.0.0.1:3000 node scripts/quipsly-coaching-generated-auth-smoke.mjs` stopped safely before mutation because local Application Default Credentials could not refresh non-interactively.
- `gcloud auth application-default print-access-token --project=quipsly-reef` returned: `Reauthentication failed. cannot prompt during non-interactive execution.`
- `http://127.0.0.1:3000/api/auth/firebase-admin-preflight` returned `503 Firebase Admin credential unavailable` with action: refresh ADC with `gcloud auth application-default login --project quipsly-reef`, then restart the local Next server.

Current meaning:

- Static/script integrity for the generated-auth bridge is clean.
- The real generated staff/client auth bridge is not receipt-proven in this run because local Firebase Admin credentials are expired.
- No real payment, recording, invite, publication, or external account mutation was performed by the blocked live smoke.

## 2026-07-05 iOS capture App Store static invariant guard

Added an App Store-readiness static smoke for the iOS capture lane.

What changed:

- Added `scripts/quipsly-ios-capture-app-store-static-smoke.mjs`.
- Wired it into `scripts/quipsly-mobile-capture-preflight.sh`.
- Updated `docs/quipsly/ios-capture-app-store-readiness.md` with the new guard and when to run it.

The guard checks:

- Privacy manifest declares no tracking plus account, audio, and user-content data.
- App target has explicit microphone/camera purpose strings, background audio mode, production bundle ID, and modern iOS deployment target.
- Native auth uses Firebase email/password plus Quipsly bearer verification, not retired Mac handoff routes.
- Recording is blocked until explicit consent and microphone permission.
- Recording state is visible and broadcast to the UI.
- Local recordings are preserved and uploaded in retryable chunks.
- iPhone and iPad session surfaces show the capture runway.
- Privacy and account deletion routes are visible from app and web.
- Reviewer readiness docs exist.

Validation:

- `node --check scripts/quipsly-ios-capture-app-store-static-smoke.mjs` passed.
- `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs` passed.
- `bash scripts/quipsly-mobile-capture-preflight.sh` passed, including privacy manifest lint, Quipsly TypeScript, mobile capture contract syntax, admin static smoke, native auth static smoke, App Store static smoke, mobile ingestion idempotency, mobile session evidence, and iOS simulator build.

Current meaning:

- Local static and simulator readiness for the capture app is stronger and easier to re-check.
- This is not a substitute for physical-device/TestFlight review, App Store Connect privacy report reconciliation, deployed signed-in reviewer smoke, or real generated-auth smoke after ADC/service-account credentials are healthy.

## 2026-07-05 coaching Stripe live-guard consistency fix

Fixed a split-brain Stripe safety flag between the actual checkout helper and the mobile capture readiness surface.

What changed:

- `apps/quipsly/src/app/api/mobile/capture/readiness/route.ts` now reports `stripeLiveAllowed` from `QUIPSLY_ALLOW_LIVE_STRIPE`, matching `apps/quipsly/src/lib/server/coaching-stripe.ts` and `/api/coaching/runway`.
- `docs/quipsly/coaching-capture-production-spine.md` now documents `QUIPSLY_ALLOW_LIVE_STRIPE=true` instead of the retired `ALLOW_LIVE_COACHING_STRIPE=true`.
- `scripts/quipsly-coaching-payment-contract-smoke.mjs` now includes static boundary checks in addition to route checks.

The payment smoke now guards:

- The single live Stripe guard is `QUIPSLY_ALLOW_LIVE_STRIPE`.
- The retired `ALLOW_LIVE_COACHING_STRIPE` flag is absent from active coaching payment surfaces.
- Stripe checkout remains scoped to `PAID_ONE_TO_ONE` / `ONE_TO_ONE_COACHING`, not SaaS, group coaching, courses, or content libraries.
- Customer Portal remains disabled by default and requires existing Stripe customer evidence.
- Stripe webhook handling stays ledger/evidence-based and handles unmatched checkout sessions calmly.
- Checkout and Customer Portal routes require sign-in.
- Webhook route returns controlled JSON for missing Stripe config or invalid signatures.

Validation:

- `node --check scripts/quipsly-coaching-payment-contract-smoke.mjs` passed.
- `node scripts/quipsly-coaching-payment-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json` passed with 12/12 checks.
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- `RUN_COACHING_PAYMENT_SMOKE=1 BASE_URL=http://127.0.0.1:3000 bash scripts/quipsly-mobile-capture-preflight.sh` passed, including the strengthened payment smoke and iOS simulator build.

Current meaning:

- Mobile readiness, runway readiness, docs, and checkout helper now agree on the live Stripe kill switch.
- This still does not prove a real Stripe test checkout or Customer Portal session, because local signed-in/generated-auth smoke is blocked by expired ADC until `gcloud auth application-default login --project quipsly-reef` is refreshed and the local Next server restarts.

## 2026-07-05 mobile transcript repair seam

Closed the gap between uploaded recording truth and transcript-job machinery:

- `POST /api/mobile/capture/transcripts/run` accepts either `transcriptJobId` or `recordingAssetId`.
- If a verified/uploaded recording has no transcript job, the route creates one before running transcription.
- If the latest job is `HELD` or `FAILED`, the route requeues it with repair metadata instead of making the user understand internal job state.
- The iOS `HighGroundCapture` model now enables transcription when there is either a retryable transcript job or an uploaded/verified recording asset.
- The iOS button says `Repair transcript` when the recording exists but the transcript job is missing.
- The mobile session evidence smoke now locks in the invariant: `Recording exists. Run transcription; Quipsly will create or repair the transcript job if needed.`

Validation:

```bash
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- Quipsly TypeScript passed.
- Mobile capture preflight passed.
- iOS Simulator build passed inside the preflight.

Next useful implementation target:

- Audit the actual recorder/upload code against the recorder non-negotiables from the Quipsly/HGO integration analysis: stable session/participant IDs, no unsafe local deletion, matching background upload identifiers, explicit upload verification before cleanup, and a clean boundary between recording segments and upload chunks.

## 2026-07-05 native upload safety audit

Converted two warnings from the Quipsly/HGO integration analysis into code fixes:

- Confirmed the background upload identifier mismatch was still real.
  - `UploadManager` used `com.quipsly.upload.chunked`.
  - `AppDelegate` listened for `com.quipsly.upload`.
  - Fixed by adding `UploadManager.backgroundSessionIdentifier` and using that shared constant from both places.
- Confirmed generic fallback segment IDs were still present.
  - Segment metadata no longer falls back to `native-ios-session` / `local-user`.
  - Local fallback recordings now get a deterministic per-recording local session ID and a device-derived participant fallback.
  - Real Quipsly `callRoomId` / `participantId` still wins whenever supplied.
- Rechecked the unsafe-delete concern.
  - Blind local cleanup had already been removed from `AudioCaptureController`.
  - Upload hard failures preserve active upload metadata and local recording recovery language.
- Removed deprecated iOS microphone permission calls.
  - `AudioCaptureController` now uses `AVAudioApplication.shared.recordPermission` and `AVAudioApplication.requestRecordPermission`.

Validation:

```bash
bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- Privacy manifest lint passed.
- Quipsly TypeScript check inside preflight passed.
- Admin/user static smoke passed.
- Native auth static smoke passed.
- App Store readiness static smoke passed.
- Mobile capture ingestion idempotency passed.
- Mobile capture session evidence passed.
- iOS Simulator build passed.
- Previous iOS 17 microphone deprecation warnings are gone; only the existing AppIntents metadata warning remains.

Next useful implementation target:

- Add a small native capture upload diagnostics panel or readiness row that exposes background upload identifier, preserved upload count, last recovery detail, and latest transcript repair availability. This would make failures visible to reviewers, Charlie, and Codex instead of hidden in logs.

## 2026-07-05 in-app capture diagnostics panel

Added a visible iOS capture diagnostics panel so upload/transcript failures are not hidden in logs:

- The `After capture` card now includes `Capture diagnostics` with stable accessibility identifier `QuipslyCaptureDiagnosticsPanel`.
- The panel shows preserved upload recovery count, latest recording asset status, transcript repair availability, and the shared background upload session identifier.
- If upload recovery detail exists, the panel surfaces it in calm user-facing language.
- The App Store static smoke now requires this diagnostics panel and its core phrases so future UI work does not accidentally hide recovery truth.

Validation:

```bash
bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- Privacy manifest lint passed.
- Quipsly TypeScript passed.
- Static admin/native-auth/App-Store smokes passed.
- Mobile capture ingestion idempotency passed.
- Mobile capture session evidence passed.
- iOS Simulator build passed.

Remaining known warning:

- Xcode still reports the existing AppIntents metadata warning. It does not block the current capture lane, but should be revisited during final App Store polish.

## 2026-07-05 mobile upload receipt contract

Made the native capture upload seam more explicit and less prototype-shaped:

- Added `@high-ground/quipsly-domain/mobile-capture-upload` with the shared `quipsly-mobile-capture-upload-v1` contract.
- One-shot and chunked mobile ingest responses now include:
  - `contractKind`
  - `uploadStage`
  - `serverVerification`
  - `localRetention`
- The server now says plainly that the client should preserve the local original and that cleanup is not allowed merely because a request returned 200.
- Chunk progress responses report `chunk-received` with pending verification.
- Final chunk responses report `verified` for GCS-backed uploads or `held` for local-dev fallback uploads.
- The iOS `UploadManager` no longer describes `/api/ingest/mobile/chunk` as a mock endpoint.
- `scripts/quipsly-mobile-capture-contract-smoke.mjs` now includes static guards for this upload contract, so future refactors do not silently hide server-verification or local-retention truth.

Current meaning:

- The app-owned upload records were already relationally meaningful. This pass makes the safety contract visible to the native app, smoke tests, reviewers, and future agents.
- This still does not replace the chunk endpoint with a fully separate upload-intent/complete-upload API. That remains the next deeper backend step if we decide the route should become a multi-step protocol rather than a single chunk assembly endpoint.

Validation:

```bash
npm --prefix packages/quipsly-domain run typecheck
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
node --check scripts/quipsly-mobile-capture-contract-smoke.mjs
node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json
bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- Shared domain typecheck passed.
- Quipsly TypeScript passed.
- Local mobile capture contract smoke passed with `23/23` checks, including the new upload-contract guards.
- Full mobile capture preflight passed, including privacy manifest lint, contract/static smokes, ingestion idempotency, mobile session evidence, and iOS simulator build.
- Existing Xcode warning remains: `Metadata extraction skipped. No AppIntents.framework dependency found.` This is not a blocker while the capture app has no AppIntents/Siri/Shortcuts surface.

Live deployment boundary:

- Live `https://nest.quipsly.com/api/coaching/public?source=hgo-coaching` still returns deployed 404 HTML.
- `bash scripts/release/quipsly-gcloud-auth-check.sh` still reports stale `gcloud` and ADC credentials, so deploy/promotion remains blocked until operator reauth.

Next useful implementation target:

- Tie HighGroundOdyssey coaching public/intake surfaces more explicitly to Quipsly-owned booking and capture state without making HGO the source of truth.

## 2026-07-05 HGO-to-Quipsly coaching handoff guard

Tightened the boundary between HighGroundOdyssey.com and Quipsly Nest:

- HighGroundOdyssey.com remains the public coaching doorway and story surface.
- Quipsly Nest remains the operational source of truth for booking, payment evidence, consent, capture rooms, recordings, transcripts, packets, and review state.
- Legacy HGO operational coaching API routes now default to a Quipsly handoff response instead of creating duplicate operational truth.
- The legacy HGO routes can only run when `HGO_LEGACY_COACHING_API_ENABLED=true` is explicitly set for controlled migration/testing.
- Added `scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs` and wired it into `scripts/quipsly-mobile-capture-preflight.sh`.

Affected HGO legacy routes:

- `POST /api/coaching/bookings`
- `POST /api/coaching/checkout`
- `POST /api/coaching/customer-portal`
- `POST /api/coaching/webhooks/stripe`

Validation:

```bash
node --check scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
./node_modules/.pnpm/node_modules/.bin/tsc --noEmit --project apps/web/tsconfig.json
bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- HGO/Quipsly handoff static smoke passed.
- HGO TypeScript passed.
- Mobile capture preflight passed with the new handoff smoke included.

Next useful implementation target:

- Build a Quipsly-owned public/unauthenticated coaching offerings packet for HGO to display richer live offer data without copying booking logic back into HighGroundOdyssey.com.

## 2026-07-05 Quipsly public coaching offerings packet

Extended the HGO/Quipsly coaching handoff so public sites can show Quipsly-owned offer truth without copying booking/payment logic:

- `GET /api/coaching/public` in `apps/quipsly` now returns a read-only `offerings` section.
- The offerings section reads active one-to-one coaching, podcast capture, and research interview offerings from Quipsly/Nest when the database is available.
- Each offering exposes safe display fields only: slug, title, description, kind, payment policy, duration, price label, coach label, and next action.
- The route remains no-side-effects: it does not create bookings, charge cards, publish content, send messages, or start recordings.
- If database access fails, the packet still returns the static handoff plus `offerings.unavailable=true` instead of breaking the public doorway.
- `scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs` now requires the public offerings seam and safe fallback language.

Validation:

```bash
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
./node_modules/.pnpm/node_modules/.bin/tsc --noEmit --project apps/web/tsconfig.json
node --check scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- Quipsly TypeScript passed.
- HGO TypeScript passed.
- HGO/Quipsly handoff static smoke passed.
- Mobile capture preflight passed and includes the HGO/Quipsly handoff smoke.

Next useful implementation target:

- Add a small HGO-side server component or cache-backed adapter that can render the Quipsly public coaching packet on HighGroundOdyssey.com when available, while gracefully falling back to the current static coaching page if Nest is unavailable.

## 2026-07-05 HGO live Quipsly coaching packet adapter

HighGroundOdyssey.com can now render Quipsly-owned public coaching packet data without becoming the source of operational truth:

- Added `getQuipslyPublicCoachingPacket()` to `apps/web/src/lib/hgo/coaching-handoff.ts`.
- The adapter fetches the Quipsly public packet from Nest with a short timeout, normalizes display-only offering fields, and returns a safe fallback instead of throwing.
- `/coaching` on HGO now includes a `Quipsly live packet` panel.
- When Nest is reachable and public offerings exist, HGO shows up to three Quipsly-fed offer cards.
- When Nest is unavailable or no public offerings are active, HGO keeps the existing static coaching story and explains the fallback calmly.
- The `Inspect packet` link points directly at the Quipsly public packet for operator/debug visibility.
- The static handoff smoke now guards the adapter and page panel.

Validation:

```bash
./node_modules/.pnpm/node_modules/.bin/tsc --noEmit --project apps/web/tsconfig.json
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
node --check scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- HGO TypeScript passed.
- Quipsly TypeScript passed.
- HGO/Quipsly handoff static smoke passed.
- Mobile capture preflight passed with iOS Simulator build.

Boundary preserved:

- HGO displays public coaching/story/business context.
- Quipsly/Nest owns users, bookings, session state, capture assets, transcript jobs, coaching packets, payment/session evidence, and publishing receipts.
- Legacy HGO operational coaching APIs remain disabled by default unless `HGO_LEGACY_COACHING_API_ENABLED=true` is intentionally set.

## 2026-07-05 Native upload receipt visibility

Extended the iOS capture app so server upload truth is visible in the same capture diagnostics surface reviewers/operators already use:

- `UploadManager` now keeps last server verification status, verification detail, and local-retention reason from Quipsly upload responses.
- Chunk responses parse `serverVerification` and `localRetention` from the shared mobile upload receipt contract.
- Final upload language now distinguishes verified, held/unverified, and waiting-for-verification states instead of collapsing everything into a vague upload-complete message.
- Hard upload failures mark the server verification state as held and explicitly state that the local recording is preserved for recovery.
- `CaptureDiagnosticsPanel` now shows server verification, local source preservation, verification detail, and local retention reason alongside recovery and transcript repair state.
- The App Store static smoke now guards these invariants so future UI cleanup does not accidentally hide receipt/retention safety language.

Validation:

```bash
node --check scripts/quipsly-ios-capture-app-store-static-smoke.mjs
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- iOS App Store static smoke passed and now includes the invariant: capture diagnostics expose upload recovery, server verification, local retention, and transcript repair state.
- Mobile capture preflight passed, including Quipsly TypeScript, mobile capture contract checks, HGO/Quipsly handoff smoke, idempotency checks, mobile session evidence checks, and iOS Simulator build.
- Existing non-blocking Xcode warning remains: `Metadata extraction skipped. No AppIntents.framework dependency found.`

Live boundary:

- This is local code proof. Live Nest still needs deploy/promotion before `https://nest.quipsly.com` can prove the new mobile capture and public coaching routes.
- Local gcloud/ADC credentials were still stale during the latest check; rerun `gcloud auth login --update-adc --brief` and `bash scripts/release/quipsly-gcloud-auth-check.sh` before deploy.

## 2026-07-05 Public HGO/Quipsly integration smoke

Added a live public integration smoke for the current coaching/capture goal:

- `scripts/hgo-quipsly-public-integration-smoke.mjs`
- Checks `https://highgroundodyssey.com/` for Quipsly/Nest episode packet provenance.
- Checks `https://highgroundodyssey.com/coaching` for the current HGO doorway plus Quipsly-owned coaching handoff markers.
- Checks `https://quipsly.com/` for the Research/Studio/Tower product education story and the storyteller/coach/trainer/researcher audience framing.
- Checks `https://nest.quipsly.com/api/coaching/public?source=public-integration-smoke` for the side-effect-free public coaching packet JSON.
- Strict by default; supports `--warn-only` for drift reporting while deploy credentials are blocked.

Validation:

```bash
node --check scripts/hgo-quipsly-public-integration-smoke.mjs
node scripts/hgo-quipsly-public-integration-smoke.mjs --warn-only --json
node --check scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
bash scripts/release/quipsly-gcloud-auth-check.sh
```

Result:

- Static HGO/Quipsly coaching handoff smoke passed.
- Live public integration smoke reported `2 pass / 2 fail` in warn-only mode.
- Pass: HighGroundOdyssey.com home shows published Quipsly/Nest episode packet provenance.
- Pass: Quipsly.com explains Research, Studio, and Tower for storytellers, coaches, trainers, and researchers.
- Fail: HighGroundOdyssey.com `/coaching` is still the older donation-supported coaching page and does not show `Open Quipsly Booking`, `Quipsly live packet`, or `Inspect packet`.
- Fail: Nest live `/api/coaching/public` still returns deployed 404 HTML, so the live image does not yet include the public coaching packet route.
- Deploy remains blocked by stale local gcloud/ADC credentials: selected account is `charlie@highgroundodyssey.com`, but user token, ADC, deploy project access, and Firebase project access all fail.

Next deploy target after reauth:

1. Run `gcloud auth login --update-adc --brief`.
2. Run `bash scripts/release/quipsly-gcloud-auth-check.sh` until it passes.
3. Deploy/promote `apps/quipsly` so Nest exposes `/api/coaching/public`.
4. Deploy/promote `apps/web` so HGO `/coaching` renders the Quipsly handoff panel.
5. Run `node scripts/hgo-quipsly-public-integration-smoke.mjs` without `--warn-only`; it should pass all four checks before we claim public integration is live.

## 2026-07-05 Public integration smoke added to mobile/capture preflight

Adjusted the normal Quipsly mobile capture preflight so it can optionally report live drift between HighGroundOdyssey.com, Quipsly.com, and Nest without making local development falsely fail while deployment is blocked.

Changed:

- `scripts/quipsly-mobile-capture-preflight.sh`
- Added syntax coverage for `scripts/hgo-quipsly-public-integration-smoke.mjs`.
- Added opt-in live smoke:
  - `RUN_LIVE_PUBLIC_INTEGRATION_SMOKE=1 bash scripts/quipsly-mobile-capture-preflight.sh`
  - warn-only by default
  - set `LIVE_PUBLIC_INTEGRATION_STRICT=1` when deploy/promote is expected to be live and should fail hard on drift

Validation:

```bash
bash -n scripts/quipsly-mobile-capture-preflight.sh
node --check scripts/hgo-quipsly-public-integration-smoke.mjs
RUN_LIVE_PUBLIC_INTEGRATION_SMOKE=1 bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- Preflight passed, including Quipsly TypeScript, contract/static smokes, idempotency/session evidence tests, optional live integration smoke in warn-only mode, and iOS Simulator build.
- iOS Simulator build succeeded.
- Live public integration smoke still reports `2 pass / 2 fail`, as expected:
  - Pass: HighGroundOdyssey.com home shows published Quipsly/Nest episode packet provenance.
  - Pass: Quipsly.com explains Research, Studio, and Tower for storytellers, coaches, trainers, and researchers.
  - Fail: HighGroundOdyssey.com `/coaching` is still the older donation-supported page and needs the current Quipsly handoff deploy.
  - Fail: Nest `/api/coaching/public` still returns 404 until `apps/quipsly` is deployed/promoted.

Trajectory note from GPT analysis review:

- Keep HighGroundOdyssey.com as the public coaching/story/business doorway.
- Keep Quipsly/Nest as the operational truth for bookings, sessions, capture assets, transcript jobs, packet truth, payment/session evidence, and publishing receipts.
- Keep native capture as the production recorder: local source files remain truth until server verification, uploads are resumable/receipt-backed, and local recordings are preserved on verification failure.
- Do not split into a separate greenfield app yet. Evolve `apps/mobile-capture/HighGroundCapture` toward Quipsly Voice/Capture while the product naming catches up.

## 2026-07-05 Deploy path hardening for public coaching integration

Deploy credential check still blocks live promotion:

```bash
bash scripts/release/quipsly-gcloud-auth-check.sh
```

Current result:

- selected account: `charlie@highgroundodyssey.com`
- user credentials cannot mint an access token
- ADC cannot mint an access token
- deploy project `high-ground-odyssey` is not accessible from the current local auth state
- Firebase project `quipsly-reef` is not accessible from the current local auth state

Recovery remains:

```bash
gcloud auth login --update-adc --brief
bash scripts/release/quipsly-gcloud-auth-check.sh
```

Since live deploy is blocked, hardened the deploy proof path instead:

- `scripts/quipsly-web-deploy.sh` now has an optional broader public integration smoke after preview/live deploy.
- The existing preview route smoke still proves the Nest public coaching packet route against the tagged Cloud Run preview URL.
- The broader smoke can then report whether HGO, Quipsly.com, and the chosen Nest base URL agree.
- It is warn-only by default so a Nest deploy can report HGO drift without pretending the Nest route failed.
- Set `PUBLIC_INTEGRATION_STRICT=1` when the full public surface is expected to be live and should fail hard.

Validation:

```bash
bash -n scripts/quipsly-web-deploy.sh
PROJECT_ID=high-ground-odyssey STAGE_ONLY=1 RUN_PUBLIC_INTEGRATION_SMOKE=1 scripts/quipsly-web-deploy.sh quipsly-web-stage-smoke
node scripts/hgo-quipsly-public-integration-smoke.mjs --warn-only --json
```

Result:

- Deploy script syntax passed.
- Stage-only deploy context completed without Cloud Build or Cloud Run mutation.
- Staged Cloud Build context size: `261M`.
- Live public integration smoke remains `2 pass / 2 fail`:
  - Pass: HGO home episode packet provenance.
  - Pass: Quipsly.com Research/Studio/Tower creator funnel.
  - Fail: HGO `/coaching` still needs `apps/web` deploy/promote.
  - Fail: Nest `/api/coaching/public` still needs `apps/quipsly` deploy/promote.

## 2026-07-05 mobile capture readiness verdict validation

Closed the iOS build blocker created by the new mobile capture readiness verdict contract.

Implemented proof state:

- `apps/quipsly/src/lib/server/mobile-capture-sessions.ts` maps every mobile capture session to a calm `captureReadiness` verdict covering packet-ready, post-capture, consent-needed, payment-hold, not-open, provider-ready, and local-fallback states.
- `apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift` preserves `captureReadiness` through local consent and room update merge paths.
- The native capture UI gates recording on `captureReadinessIsSafeToRecord` instead of raw consent alone.
- The native capture UI now has a `CaptureReadinessVerdictCard` surface for the safety verdict.

Validation run:

```bash
node scripts/quipsly-mobile-capture-session-evidence.test.mjs \
  && apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json \
  && bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- Session evidence test passed.
- Quipsly TypeScript passed.
- Privacy manifest lint passed.
- Static admin/user/auth/App Store/coaching handoff smokes passed.
- Mobile capture ingestion idempotency passed.
- Mobile capture session evidence passed.
- iOS simulator build passed.
- Build still emits existing AVFoundation/iOS deprecation warnings in `ExportManager.swift` and `NativeEditorView.swift`; these did not block the capture preflight but should be cleaned before App Store polish.

Current live public integration proof:

```bash
node scripts/hgo-quipsly-public-integration-smoke.mjs --warn-only --json
```

Result: `2 pass / 2 fail`.

- PASS: `https://highgroundodyssey.com/` shows Quipsly/Nest episode provenance.
- PASS: `https://quipsly.com/` explains Research, Studio, and Tower for storytellers, coaches, trainers, and researchers.
- FAIL: `https://highgroundodyssey.com/coaching` is still the older live coaching build without the Quipsly operational handoff markers.
- FAIL: `https://nest.quipsly.com/api/coaching/public?source=public-integration-smoke` still returns HTTP 404 HTML. Local source has the route; live Nest has not proven the route yet.

Deploy/auth gate remains:

```bash
bash scripts/release/quipsly-gcloud-auth-check.sh
```

Result: selected account is `charlie@highgroundodyssey.com`, but gcloud user credentials and ADC cannot mint tokens, and this shell cannot access `high-ground-odyssey` or `quipsly-reef`. Reauth is required before deploy/promotion:

```bash
gcloud auth login --update-adc --brief
bash scripts/release/quipsly-gcloud-auth-check.sh
```

Next safe action after reauth:

1. Run no-traffic Quipsly deploy preview.
2. Smoke the preview with `scripts/quipsly-coaching-public-handoff-smoke.mjs`.
3. Promote only after `/api/coaching/public` returns JSON with `packetKind:"quipsly-public-coaching-handoff-v1"`.
4. Deploy/promote HGO public coaching copy so `/coaching` shows the Quipsly operational handoff instead of the old donation-supported page.

## 2026-07-05 consent-aware upload processing hold

Tightened the server-side capture ingestion boundary so explicit consent is enforced beyond the native UI.

Implemented:

- `apps/quipsly/src/lib/server/mobile-capture-records.ts`
  - Mobile capture uploads without granted recording consent are preserved but marked `RecordingAsset.status = HELD`.
  - Transcript jobs for unconsented recordings are created/updated as `HELD` with provider `consent-required` and a clear consent-required error message.
  - The ingestion result now returns `consentStatus`, `recordingAssetStatus`, and `transcriptJobStatus` so UI/API layers can explain the state without guessing.
  - Consented uploads still queue/requeue transcript jobs normally and preserve verified recording status on retry.
- `apps/mobile-capture/HighGroundCapture/HighGroundCapture/UploadManager.swift`
  - Tracks `lastTranscriptJobStatus` from capture records.
  - If storage is verified but the transcript job is held for consent, the native status says: `Upload verified. Transcript held until consent is confirmed. Local original preserved.`
- `scripts/quipsly-mobile-capture-ingestion-idempotency.test.mjs`
  - Added a no-consent regression case proving durable upload preservation does not imply transcription permission.

Validation run:

```bash
node scripts/quipsly-mobile-capture-ingestion-idempotency.test.mjs \
  && apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json \
  && bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- Consent/idempotency regression passed.
- Quipsly TypeScript passed.
- Full mobile capture preflight passed.
- iOS simulator build succeeded.

Product invariant now proved locally:

- The app blocks recording without explicit consent.
- If an upload still reaches the server without consent evidence, Quipsly preserves it for recovery but holds the recording/transcript processing path until consent is resolved.
- Local originals remain preserved; no destructive cleanup is introduced.

## 2026-07-05 meeting-spine join contract hardening

Tightened the mobile room-join contract so provider readiness, recording consent boundaries, and local fallback are explicit instead of hidden behind a flat `canJoin` boolean.

Implemented:

- `apps/quipsly/src/app/api/mobile/capture/rooms/join/route.ts`
  - Keeps the existing flat fields for the current iOS app.
  - Adds `providerReadiness`, `providerJoin`, `recordingBoundary`, and `localFallback`.
  - Distinguishes `livekit-ready`, `livekit-needs-config`, and `provider-not-configured`.
  - States that joining a provider room does not start recording.
  - States that local recording requires consent, provider/server recording requires all participant consent, and visible recording state is required.
- `apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift`
  - Decodes the structured provider/local/recording-boundary packet while preserving backward-compatible flat fields.
  - Makes the readiness line prefer explicit local-fallback and consent-boundary guidance.
- `scripts/quipsly-mobile-capture-contract-smoke.mjs`
  - Adds static guards so future refactors cannot silently collapse the meeting-spine contract back to ambiguous button text.

Why this matters:

- `canJoin:false` can mean provider missing, credentials missing, consent missing, or local fallback only. Those are different user actions.
- The iOS capture app now has contract-level language for calm recovery without guessing.
- This keeps LiveKit as the real-time spine while preserving local files as the recording source of truth until server verification.

Validation should include:

```bash
node --check scripts/quipsly-mobile-capture-contract-smoke.mjs
node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
bash scripts/quipsly-mobile-capture-preflight.sh
```

Validation run:

```bash
bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- Privacy manifest lint passed.
- Quipsly TypeScript passed.
- Mobile capture contract syntax/static smokes passed, including the new meeting-spine contract guards.
- Admin/user, native auth, App Store, and HGO/Quipsly handoff static smokes passed.
- Mobile capture ingestion idempotency passed.
- Mobile capture session evidence passed.
- iOS simulator build succeeded.
- Existing AppIntents metadata warning remains non-blocking for this lane.

Live deployment note:

- This proves the local source and native build contract, not live `nest.quipsly.com` promotion.
- Live route matrix still needs deploy after `gcloud auth login --update-adc --brief` and `bash scripts/release/quipsly-gcloud-auth-check.sh` pass.

## 2026-07-05 coaching runway journey summary

Strengthened the Quipsly coaching runway so reviewers, operators, humans, and agents do not have to mentally stitch together booking/payment/room/consent/transcript state from raw fields.

Implemented:

- `apps/quipsly/src/app/api/coaching/runway/route.ts`
  - Added `recordingConsentSummary(room)`.
  - Added `roomJourneySummary(room)`.
  - Added `bookingJourneySummary(booking, latestCheckout, hasStripeCustomerEvidence)`.
  - `captureRooms[]` now exposes `journeySummary` and `consentSummary`.
  - `upcomingBookings[]` now exposes `journeySummary` with:
    - `stage`
    - `paymentStage`
    - `roomStage`
    - evidence checklist for app-owned booking, payment record, checkout ledger, Stripe customer evidence, calendar receipt slot, capture room, consent, recording, transcript, and packet evidence
    - next safest booking/payment/room actions
- `scripts/quipsly-coaching-payment-contract-smoke.mjs`
  - Added `--static-only` / `QUIPSLY_COACHING_PAYMENT_STATIC_ONLY=1` so payment/runway source-of-truth boundaries can be checked without a running local web server.
  - Added static guards for `journeySummary`, `bookingJourneySummary`, `roomJourneySummary`, and the named path from `payment-checkout-needed` through `packet-ready`.

Why this matters:

- Database status is not enough product truth. A booking can be requested, paid, pending webhook, planned, open, consent-needed, ready-to-record, transcript-held, or packet-ready.
- The runway now gives one calm interpretation layer without making Stripe, calendar, or LiveKit the source of truth.
- This improves the route from booking to recorded/transcribed/reusable coaching or podcast asset without charging, publishing, inviting, or recording externally.

Validation run:

```bash
node scripts/quipsly-coaching-payment-contract-smoke.mjs --static-only --json
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- Static payment/runway contract smoke passed with `11/11` checks.
- Quipsly TypeScript passed.
- Full mobile capture preflight passed, including privacy manifest lint, static auth/App Store/HGO handoff smokes, mobile capture idempotency, mobile session evidence, and iOS simulator build.

Remaining proof gap:

- This is local source/build proof. Live `nest.quipsly.com` and `highgroundodyssey.com/coaching` still need deploy/promotion after gcloud/ADC reauth.

## 2026-07-05 coaching runway journey UI

Surfaced the new app-owned coaching journey summaries in the Quipsly coaching runway UI so humans and agents can see the route from booking to payment evidence to room readiness to consent to recording to transcript to packet review without interpreting raw database statuses.

Implemented:

- `apps/quipsly/src/app/(app)/coaching/page.tsx`
  - Added a reusable `JourneyPanel`.
  - Added `EvidenceDot` chips for app-owned evidence such as booking, payment record, checkout ledger, calendar receipt slot, capture room, consent, recording, transcript, and packet evidence.
  - Booking cards now show `booking.journeySummary` with journey stage, payment stage, room stage, evidence, and next safe actions.
  - Capture room cards now show `room.journeySummary` and consent state before the raw participant/recording/transcript counters.
- `scripts/quipsly-coaching-payment-contract-smoke.mjs`
  - Static-only mode now checks that the runway API computes journey summaries and the runway UI actually displays them.

Why this matters:

- The operator cockpit should not force Charlie, Homer, Mako, a reviewer, or Codex to mentally combine `booking.status`, `paymentRecord.status`, checkout ledgers, room status, consent rows, and transcript jobs.
- This keeps Stripe, calendar, LiveKit, and transcript providers as evidence feeds while Quipsly presents a calm app-owned interpretation.
- It directly improves the goal path from scheduled coaching/podcast session to recorded/transcribed reusable asset.

Validation run:

```bash
node scripts/quipsly-coaching-payment-contract-smoke.mjs --static-only --json
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- Static payment/runway smoke passed with `13/13` checks.
- Quipsly TypeScript passed.
- Full mobile capture preflight passed, including privacy manifest lint, static auth/App Store/HGO handoff smokes, mobile capture idempotency, mobile session evidence, and iOS simulator build.

Remaining proof gap:

- This is local source/build proof. Live `nest.quipsly.com` and `highgroundodyssey.com/coaching` still need deploy/promotion after gcloud/ADC reauth.

## 2026-07-05 - Native capture source-safety recovery hardening

Tightened the native upload recovery seam so preserved local recordings do not fall into vague limbo states.

Implemented:

- `UploadManager.swift` now routes local file-open failures, temporary chunk-write failures, invalid Nest upload URL configuration, and hard upload errors through one explicit `holdUploadForRecovery(...)` path.
- Held uploads keep their active upload metadata in `UserDefaults`, set server verification status to `held`, preserve a local-retention reason, expose a recovery detail, and notify the UI that the upload is recoverable rather than silently stalled.
- The app still deletes temporary chunk files after upload task completion, but does not delete source recordings. Temp chunk cleanup is not source cleanup.
- Static guards now require the recovery helper and its calm source-preserving messages so future cleanup does not regress into source-loss behavior.

Validation:

```bash
node --check scripts/quipsly-ios-capture-app-store-static-smoke.mjs
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
node --check scripts/quipsly-mobile-capture-contract-smoke.mjs
node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
bash scripts/quipsly-mobile-capture-preflight.sh
```

Result:

- iOS capture App Store static smoke passed.
- Mobile capture contract smoke passed locally with `30/30` checks.
- Quipsly TypeScript passed.
- Full mobile capture preflight passed.
- iOS simulator build succeeded.
- Existing `fs.Stats constructor` deprecation warnings in Node-side test tooling remain unrelated.

Product note:

Native capture now behaves more like a flight recorder: if upload infrastructure is not ready, the recording is held for recovery with visible evidence instead of being discarded or hidden behind ambiguous status text.

## 2026-07-06 - Public packet native capture contract

Turned the GPT analysis/product split into enforceable local code instead of loose guidance.

Implemented:

- Extended the shared public coaching packet contract with `nativeCapture` and explicit capture modes for one-to-one coaching, podcast capture, and research interviews.
- `GET /api/coaching/public` now describes the production capture rule: local recording files remain source truth until Nest verifies durable server storage; uploads are resumable and receipt-backed; originals are never silently deleted.
- HighGroundOdyssey coaching now renders the native production capture section when the Quipsly packet is available, while still falling back calmly if Nest is unavailable.
- The HGO/Quipsly static handoff smoke now guards the product split:
  - HGO is public doorway.
  - Quipsly.com is product education/funnel.
  - Nest owns booking, payment evidence, consent, capture, transcript, packet, and review truth.
  - Native capture is production-first and source-safe.

Validation:

```bash
node --check scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
```

All three passed.

Additional validation note:

```bash
apps/web/node_modules/.bin/tsc --noEmit --project apps/web/tsconfig.json
node_modules/.bin/tsc --noEmit --project apps/web/tsconfig.json
pnpm -C apps/web exec tsc --noEmit --project tsconfig.json
```

The first two cannot run because no local/root `tsc` binary exists. The package-manager path triggers the existing workspace install policy blocker in `apps/desktop-companion` (`ERR_PNPM_EXOTIC_SUBDEP` for Electron Forge), before HGO TypeScript can run. Treat this as the known dependency-layout blocker, not evidence of a coaching page type failure.

Current live/deploy truth remains unchanged:

- `node scripts/hgo-quipsly-release-readiness.mjs --json` is still blocked by `operator-gcloud-auth`.
- Live HGO coaching remains stale until `apps/web` is promoted.
- Live Nest still needs `apps/quipsly` promotion before `/api/coaching/public` returns the packet.

Next safest step after operator reauth: deploy/promote `apps/quipsly` and `apps/web`, then run the public route matrix and integration smoke against live.

## 2026-07-05 - Native capture contract surfaced in iPhone and iPad app

Made the production capture rules visible inside the native app so the iOS surfaces match the public Quipsly/HGO packet contract.

Implemented:

- Added `NativeCaptureContract` and `NativeCaptureMode` to the native capture models.
- Added `NativeCaptureContractPanel` to the shared mobile UI components.
- The iPhone session surface and iPad studio/session surface now show the same source-safe recorder contract as the public packet:
  - local recording files remain source truth until Nest verifies durable server storage,
  - uploads are resumable and receipt-backed,
  - failed uploads preserve local recordings for recovery,
  - originals are never silently deleted,
  - supported modes are one-to-one coaching, podcast capture, and research interview.
- Strengthened `scripts/quipsly-ios-capture-app-store-static-smoke.mjs` so native capture contract drift fails fast.

Validation:

```bash
node --check scripts/quipsly-ios-capture-app-store-static-smoke.mjs
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj -scheme HighGroundCapture -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

All passed. The xcodebuild finished with `** BUILD SUCCEEDED **`.

Remaining proof gap:

- This is static/build proof, not device/TestFlight proof. A real device smoke is still needed for sign-in, session selection, consent grant/revoke, microphone permission, start/stop recording, upload recovery, and transcript/packet follow-through.

## 2026-07-05 - Mobile readiness owns native capture contract

The native production capture contract now has one shared TypeScript source and one native fallback:

- Shared source: `QUIPSLY_NATIVE_CAPTURE_CONTRACT` in `packages/quipsly-domain/src/coaching-public.ts`.
- Public HGO/Quipsly coaching packet uses that shared contract instead of an inline duplicate.
- Nest mobile capture readiness now exposes `nativeCapture` from the same shared contract.
- iPhone/iPad capture UI decodes the readiness contract and prefers server truth, falling back to the local native contract if readiness is unavailable.

Validation run:

- `node --check scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs && node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs` passed.
- `node --check scripts/quipsly-ios-capture-app-store-static-smoke.mjs && node scripts/quipsly-ios-capture-app-store-static-smoke.mjs` passed.
- `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj -scheme HighGroundCapture -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build` passed with `** BUILD SUCCEEDED **`.

Current boundary: static/build truth is good. Device/TestFlight runtime smoke is still needed before calling this App Store-ready.

## 2026-07-05 - Built Nest routes prove live 404 is stale deploy, not missing code

Live pulse still shows `nest.quipsly.com` missing the new public JSON routes:

- `https://nest.quipsly.com/api/coaching/public?source=codex-live-pulse` returned HTTP 404 HTML.
- `https://nest.quipsly.com/api/mobile/capture/readiness` returned HTTP 404 HTML.

Release readiness is blocked by operator cloud auth, not by local code:

- `bash scripts/release/quipsly-gcloud-auth-check.sh` failed because user gcloud credentials and ADC cannot mint tokens and cannot access `high-ground-odyssey` or `quipsly-reef`.
- Required operator action remains: `gcloud auth login --update-adc --brief`, then rerun `bash scripts/release/quipsly-gcloud-auth-check.sh`.

Local deploy proof completed:

- Patched `scripts/quipsly-web-deploy.sh` so `LOCAL_VALIDATE=1` uses the existing `apps/quipsly` local `tsc` and `next` binaries when available. This avoids the unrelated workspace install policy failure from `apps/desktop-companion` / Electron Forge exotic subdependencies.
- `PROJECT_ID=high-ground-odyssey LOCAL_VALIDATE=1 STAGE_ONLY=1 RUN_PUBLIC_INTEGRATION_SMOKE=0 RUN_PREVIEW_SMOKE=0 scripts/quipsly-web-deploy.sh` passed.
- The Next build route list included both `/api/coaching/public` and `/api/mobile/capture/readiness`.
- Staged deploy context size: `261M` at `/var/folders/n8/75lt2yw16752qxw_l6j0khl00000gn/T//quipsly-web-context-quipsly-web-20260705-192254`.
- Local built runtime smoke against `http://127.0.0.1:3027` returned HTTP 200 JSON for:
  - `/api/coaching/public?source=local-built-smoke`
  - `/api/mobile/capture/readiness`
  - `/api/health`

Important schema note:

- When stopping the local built server, Prisma logged `The table public.ServiceOffering does not exist in the current database`.
- The public/readiness JSON routes are proven, but the deeper authenticated coaching runway likely needs a targeted schema sync before it is runtime-trustworthy.
- The Prisma schema contains `ServiceOffering`, `BookingHold`, `CoachingBooking`, `PaymentRecord`, `CallRoom`, `CallParticipant`, `RecordingConsent`, `RecordingAsset`, `TranscriptJob`, `TranscriptSegment`, notes, and action item models. Do not claim full coaching runway runtime readiness until the target database schema is proven in sync.

Next deploy order after reauth:

1. Run `bash scripts/release/quipsly-gcloud-auth-check.sh`.
2. Run `PROJECT_ID=high-ground-odyssey LOCAL_VALIDATE=1 NO_TRAFFIC=1 PREVIEW_TAG=quipsly-web-preview scripts/quipsly-web-deploy.sh`.
3. Smoke the tagged preview for `/api/coaching/public` and `/api/mobile/capture/readiness` JSON.
4. Confirm/perform the targeted Prisma schema sync for coaching tables before relying on `/coaching` runway writes.
5. Promote preview to live only after route and schema proofs are clean.

## 2026-07-05 - Coaching schema readiness gate and local schema sync

Added a focused, non-mutating schema readiness smoke:

```bash
node scripts/quipsly-coaching-schema-readiness.mjs --json
```

The smoke checks the target database for the app-owned coaching/capture tables and core columns required before authenticated booking, payment, call-room, consent, recording, upload, transcript, note, and action-item writes can be trusted.

Tables checked:

- `CoachProfile`
- `ServiceOffering`
- `AvailabilityWindow`
- `BookingHold`
- `CoachingBooking`
- `PaymentRecord`
- `StripeCustomerLink`
- `StripeCheckoutSessionLedger`
- `StripeWebhookEvent`
- `CalendarEventLink`
- `CallRoom`
- `CallParticipant`
- `RecordingConsent`
- `RecordingAsset`
- `UploadChunk`
- `TranscriptJob`
- `TranscriptSegment`
- `CoachingNote`
- `ActionItem`

Also wired the smoke into `scripts/hgo-quipsly-release-readiness.mjs` as a runtime warning, not a public-packet deploy blocker. This keeps the distinction clear:

- Public side-effect-free JSON packet deploy can proceed once Cloud auth is fixed.
- Authenticated coaching/capture runway writes need schema readiness proof before being called runtime-ready.

Local result:

1. Initial local smoke against `postgresql://localhost:5432/high_ground_studio` found 19 missing coaching/capture tables.
2. Ran local-only schema sync:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio node_modules/.bin/prisma db push
```

3. Re-ran schema readiness. Result: `ok:true`, `missingTables:[]`, `missingColumns:[]`, `errors:[]`.
4. Re-ran release readiness. Result: schema runtime warning cleared; deploy remains blocked only by `operator-gcloud-auth`.
5. Local HTTP pulse against built Nest app returned:
   - `/coaching`: HTTP 200 HTML
   - `/api/coaching/runway`: HTTP 401 JSON, `Sign in before opening the coaching runway.`
   - `/api/coaching/public?source=local-after-schema-sync`: HTTP 200 JSON
   - `/api/mobile/capture/readiness`: HTTP 200 JSON

Interpretation: local authenticated runway is now gated rather than broken. Production/staging still needs an explicit target-database schema proof before trusting live coaching/capture writes.

## 2026-07-05 - Coaching local lifecycle DB smoke

Added a generated-data runtime smoke for the app-owned coaching/capture lifecycle:

```bash
node scripts/quipsly-coaching-local-lifecycle-db-smoke.mjs --json
scripts/quipsly-coaching-lifecycle-smoke.sh
```

What it proves locally:

- Quipsly can create generated `@dev.test` coach/client users.
- A coach profile, paid one-to-one service offering, availability window, converted booking hold, appointment, booking, synthetic Stripe test-mode payment evidence, checkout ledger, and webhook ledger can be represented in app-owned records.
- A call room can hold participants, granted recording/transcription consent, verified local recording evidence, verified upload chunks, a completed transcript job, speaker transcript segments, packet notes, and an open action item.
- Stripe, calendar, recording storage, and transcription remain evidence/provider feeds. The smoke does not create real charges, external calendar events, provider rooms, uploads, recordings, or messages.
- Generated records are deleted by default after assertions pass. Use `--keep-artifacts` only when a human wants to inspect the generated rows manually.

Validation evidence from this pass:

```bash
node --check scripts/quipsly-coaching-local-lifecycle-db-smoke.mjs
node scripts/quipsly-coaching-schema-readiness.mjs --json
node scripts/quipsly-coaching-local-lifecycle-db-smoke.mjs --json
```

Result:

- Schema readiness against `postgresql://localhost:5432/high_ground_studio`: `ok:true`.
- Lifecycle DB smoke: `ok:true`.
- Evidence created and read back: completed booking, Stripe test-mode payment evidence, ended room, two participants, two granted consents, one verified recording, two verified chunks, one completed transcript, three transcript segments, two packet notes, one open action item.
- Cleanup removed all generated lifecycle smoke rows.

Operational boundary:

This is a deliberate write-smoke, not a default release-readiness check. Keep `scripts/hgo-quipsly-release-readiness.mjs` focused on deploy/public/runtime warnings. Run this lifecycle smoke when validating a local or staging database before trusting authenticated coaching/capture runway writes.
## 2026-07-06 - Native capture receipt language

Strengthened the iOS after-capture surface so it reads like an operator receipt before it reads like engineering diagnostics:

- Added a `Capture receipt` card to the native capture after-session panel.
- The card shows local original safety, server receipt status, transcript status, packet status, and the next safe action.
- This uses existing mobile session/upload state rather than creating a second receipt model.
- The App Store static smoke now guards the receipt card copy and accessibility identifier.

Validation:

```bash
node --check scripts/quipsly-ios-capture-app-store-static-smoke.mjs
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
```
## 2026-07-06 - Public coaching positioning contract

Integrated the GPT analysis direction into the durable HGO/Quipsly/Nest seam:

- Added shared public coaching positioning to `packages/quipsly-domain/src/coaching-public.ts`.
- The public packet now carries the audience, promise, HGO role, Quipsly operational role, systems-anxiety line, and Research/Studio/Tower coaching pillars.
- `/api/coaching/public` now includes that positioning in the side-effect-free JSON packet.
- HGO's `/coaching` adapter normalizes the positioning section from Nest instead of hard-coding a separate copy island.
- HGO's `/coaching` page now renders a `Research, Studio, Tower` packet section when Quipsly packet truth is reachable.
- Quipsly.com now names the coaching-session-to-reusable-packet workflow in its product examples so the marketing funnel reflects the capture system without owning operational state.
- The static handoff smoke now guards the positioning contract and HGO page rendering markers.

Validation:

```bash
node --check scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
apps/quipsly/node_modules/.bin/tsc -p packages/quipsly-domain/tsconfig.json --noEmit
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
(cd apps/web && ./node_modules/.bin/next build)
```

Result:

- HGO/Quipsly static handoff smoke passed.
- Shared Quipsly domain typecheck passed.
- Nest `apps/quipsly` typecheck passed.
- Nest `apps/quipsly` typecheck passed again after the Quipsly.com coaching workflow copy update.
- HGO `apps/web` production build passed.
- Existing non-blocking warnings remain: Next `middleware` convention deprecation, Turbopack NFT tracing warning through `living-manuscript.ts`, and Postgres SSL mode warning.
- Workspace-wide `pnpm --filter ...` validation still trips over an unrelated `apps/desktop-companion` exotic Electron subdependency policy before reaching the target packages; direct local binaries were used for targeted validation.

## 2026-07-06 - Coaching capture lifecycle receipt checklist

Added `QUIPSLY_COACHING_LIFECYCLE_KIND` and `buildQuipslyCoachingLifecycle` in `@high-ground/quipsly-domain/coaching-lifecycle`. The contract gives web, mobile, and native surfaces the same compact receipt checklist for booking, payment evidence, calendar receipt, capture room, participants, consent, capture route, recording, durable server recording receipt, transcript, packet, and publication receipt slots.

Wired the shared lifecycle into:

- `apps/quipsly/src/app/api/coaching/runway/route.ts` for booking and room runway records.
- `apps/quipsly/src/lib/server/mobile-capture-sessions.ts` for mobile capture session JSON.

Product boundary: this is transparency, not a judgment gate. Missing calendar/publication receipts are visible receipt slots, not proof that the work is invalid. External publication is still never claimed without an actual receipt or URL.

Validation target:

```bash
node --check scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node --check scripts/quipsly-mobile-capture-contract-smoke.mjs
node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json
apps/quipsly/node_modules/.bin/tsc -p packages/quipsly-domain/tsconfig.json --noEmit
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
```

Validation evidence from this pass:

```bash
node --check scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node --check scripts/quipsly-mobile-capture-contract-smoke.mjs
node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json
apps/quipsly/node_modules/.bin/tsc -p packages/quipsly-domain/tsconfig.json --noEmit
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
```

Result:

- HGO/Quipsly coaching handoff static smoke passed with the lifecycle contract and runway UI markers guarded.
- Mobile capture contract smoke passed locally against `http://127.0.0.1:3000` with 33 passing checks, unauthenticated boundaries calm, and no provider secrets exposed.
- Shared Quipsly domain typecheck passed.
- Nest `apps/quipsly` typecheck passed after adding the runway lifecycle UI panel.

## 2026-07-06 - Native capture lifecycle receipts

Extended the iOS capture app to decode the shared coaching lifecycle contract from Nest session JSON and show it as `Capture lifecycle receipts` in the native capture runway, recorder session detail, and after-capture area.

This keeps the native App Store-facing surface aligned with the server-owned receipt slots: booking, payment, calendar, room, participants, consent, capture route, recording, server recording receipt, transcript, and packet. Older server responses remain safe because Swift `Codable` treats `lifecycle` as optional.

Validation target:

```bash
node --check scripts/quipsly-ios-capture-app-store-static-smoke.mjs
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj -scheme HighGroundCapture -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Validation evidence from this pass:

```bash
node --check scripts/quipsly-ios-capture-app-store-static-smoke.mjs
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj -scheme HighGroundCapture -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Result:

- iOS capture App Store static smoke passed with lifecycle receipt card guards.
- Xcode iOS Simulator build passed after carrying optional lifecycle state through consent and room-state merge paths.
- The first Xcode build caught the missing merge-field issue, which is now fixed.

## 2026-07-06 - Authenticated mobile lifecycle proof hook

Strengthened `scripts/quipsly-mobile-capture-contract-smoke.mjs` so the same smoke can now prove live authenticated mobile session lifecycle JSON when a bearer token is supplied. The authenticated path checks that `/api/mobile/capture/sessions` returns visible sessions with:

- `lifecycle.kind === "quipsly-coaching-capture-lifecycle-v1"`
- lifecycle stage and next safe action
- readiness flags for capture, transcript, packet, and review
- receipt checks for booking, payment, room, consent, recording, server recording, transcript, and packet

Without a bearer token, the smoke reports the authenticated proof as explicitly skipped rather than implying it passed. This keeps local/static proof separate from authenticated runtime proof.

Validation evidence from this pass:

```bash
node --check scripts/quipsly-mobile-capture-contract-smoke.mjs
node scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000 --json
apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json
```

Result:

- Mobile capture contract smoke passed locally with 34 checks.
- Authenticated lifecycle endpoint proof was skipped because no bearer token was provided.
- Nest `apps/quipsly` typecheck passed.

## 2026-07-06 - HGO/Quipsly release conductor

Added a release conductor so the public coaching/capture integration has one safe operator path instead of scattered tribal commands:

```bash
node scripts/hgo-quipsly-release-conductor.mjs --json
node scripts/hgo-quipsly-release-conductor.mjs --deploy-previews --json
node scripts/hgo-quipsly-release-conductor.mjs --smoke-previews --json
node scripts/hgo-quipsly-release-conductor.mjs --smoke-previews --promote-live --confirm-promote-hgo-quipsly --json
```

What it coordinates:

- release readiness and operator auth proof
- local HGO/Nest/shared-contract smoke
- local coaching/capture schema readiness
- Nest no-traffic preview deploy for `apps/quipsly`
- HGO no-traffic preview deploy for `apps/web`
- paired preview smoke through the HGO/Quipsly/Nest integration contract
- explicit live traffic promotion for Nest and HGO only after preview evidence exists
- live public route matrix and integration smoke after promotion

Safety behavior:

- Default mode is non-mutating inspection only.
- Preview deploys require `--deploy-previews`.
- Live traffic movement requires both `--promote-live` and `--confirm-promote-hgo-quipsly`.
- The conductor refuses to move forward when `scripts/hgo-quipsly-release-readiness.mjs` reports deploy blockers.
- Promotion preserves the product invariant: HighGroundOdyssey.com teaches and routes, Quipsly.com educates and funnels, Nest owns operational coaching/capture truth through shared side-effect-free contracts.

Validation:

```bash
node --check scripts/hgo-quipsly-release-conductor.mjs
node scripts/hgo-quipsly-release-conductor.mjs --json
```

Result:

- Syntax check passed.
- Default non-mutating run produced the expected release-readiness blocker: `operator-gcloud-auth`.
- Local contract and schema checks still pass.
- Live drift is still visible: HGO `/coaching` is on the older page and Nest `/api/coaching/public` still returns deployed 404 HTML until the preview/deploy path runs after operator auth is fixed.

Next action:

```bash
gcloud auth login --update-adc --brief
bash scripts/release/quipsly-gcloud-auth-check.sh
node scripts/hgo-quipsly-release-conductor.mjs --json
```

## 2026-07-06 - Reviewer native-auth proof hardened

Tightened the iOS capture reviewer/App Store proof path so it distinguishes signed-in shell state from a real reviewable capture session.

Changed:

- `docs/quipsly/ios-capture-reviewer-smoke-checklist.md` now includes the Firebase email/password native-auth contract smoke.
- `docs/quipsly/ios-capture-app-store-readiness.md` now includes both the preflight wrapper and direct native-auth smoke command.
- `scripts/quipsly-ios-capture-app-store-static-smoke.mjs` now guards that reviewer docs include native-auth proof and visible-session proof, not merely generic reviewer language.

Validation:

```bash
node --check scripts/quipsly-ios-capture-app-store-static-smoke.mjs
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
bash -n scripts/quipsly-mobile-capture-preflight.sh
node --check scripts/quipsly-mobile-capture-native-auth-smoke.mjs
```

Result: pass.

Boundary:

- This is static/local proof only.
- Device/TestFlight smoke is still required.
- Live native-auth contract smoke requires `QUIPSLY_MOBILE_CAPTURE_AUTH_EMAIL`, `QUIPSLY_MOBILE_CAPTURE_AUTH_PASSWORD`, deployed Nest routes, and a reviewer account with at least one visible planned coaching or podcast capture session.

## 2026-07-06 - Native upload source-contract guard hardened

Tightened the mobile capture contract smoke so upload-route regressions are caught without requiring a live deploy or local Next server.

Added guardrails:

- Native upload must target `/mobile/capture/uploads/chunk` after `normalizedNestAPIBaseURL(...)`, not the older `/ingest/mobile/chunk` path and not a double-`/api` path.
- Native base URL normalization must strip a trailing `/api` before appending exactly one `/api`.
- Native upload cleanup may delete the temporary chunk file only.
- The local source recording remains preserved until a separate verified-prune policy exists.
- `scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only --json` now validates source-level contract truth when production is stale or gcloud auth is unavailable.

Validation:

```bash
node --check scripts/quipsly-mobile-capture-contract-smoke.mjs
node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only --json
```

## 2026-07-06 - Coaching Stripe/source-of-truth guard hardened

Expanded the HGO/Quipsly coaching handoff static smoke so it now verifies the operational Nest money boundary, not only the public HGO doorway.

Added guardrails:

- HGO legacy coaching booking/checkout/portal/webhook routes remain disabled by default unless the explicit migration flag is enabled.
- Nest coaching checkout requires a signed-in Quipsly actor and a booking ID.
- Live Stripe is blocked unless `QUIPSLY_ALLOW_LIVE_STRIPE=true` is intentionally set.
- Stripe checkout is limited to `PAID_ONE_TO_ONE` bookings and `ONE_TO_ONE_COACHING` offerings.
- Groups, courses, content libraries, and SaaS subscriptions are excluded from this Stripe coaching path.
- Checkout creates pending payment evidence only; payment remains pending until webhook evidence arrives.
- Stripe webhooks must use the raw request body and `stripe-signature` verification.
- Stripe webhook events are preserved in `StripeWebhookEvent`, including unmatched events.
- Payment and booking state advance only from verified `checkout.session.completed` or expire/cancel from `checkout.session.expired` evidence.
- Customer Portal is feature-gated and requires existing Stripe customer evidence.
- Prisma still exposes app-owned records for coaches, offerings, availability, holds, bookings, payments, Stripe ledgers, rooms, participants, consent, recordings, transcripts, notes, and action items.

Validation:

```bash
node --check scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node scripts/hgo-quipsly-release-readiness.mjs --json
```

Result:

- Static coaching handoff contract passed.
- Schema readiness passed.
- Quipsly.com live marketing truth passed.
- Live HGO `/coaching` and Nest `/api/coaching/public` remain stale until deploy/promote.
- Release readiness remains blocked by `operator-gcloud-auth`, not by local coaching/capture code.

## 2026-07-06 - Transcript-to-packet contract guard hardened

Expanded the mobile capture contract smoke so it now verifies the post-recording transcript and coaching-packet path at source level.

Added guardrails:

- `/api/mobile/capture/transcripts/run` requires auth, accepts either an existing transcript job or an uploaded recording, can create/repair a job from the recording, and enforces room/user access.
- `capture-transcripts.ts` only runs provider transcription on uploaded/verified cloud-backed recordings with a storage path.
- Route transcription holds safely when recording storage is unverified, cloud path is missing, route payload is too large, provider is unsupported, or `DEEPGRAM_API_KEY` is missing.
- Deepgram requests use diarization and utterances, then persist speaker/time-aligned `TranscriptSegment` rows.
- `/api/mobile/capture/transcripts/packet` keeps reading/building packet state authenticated and room-scoped.
- Packet states remain distinct: `NOT_READY`, `PACKET_READY_TO_BUILD`, and `READY_FOR_REVIEW`.
- `coaching-packets.ts` requires a completed segmented transcript before building packet material.
- Packet material is stored as review-required `CoachingNote` summary/highlights and `ActionItem` rows with `source: "transcript-packet-builder"` provenance.
- The local lifecycle DB smoke proves the app-owned chain can represent booking, payment evidence, consent, verified recording, completed transcript, packet notes, and action items without external side effects.

Validation:

```bash
node --check scripts/quipsly-mobile-capture-contract-smoke.mjs
node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only --json
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
```

Result:

- Mobile capture source-only contract smoke passed `21/21`.
- iOS App Store static smoke passed.
- HGO/Quipsly coaching handoff static smoke passed.
- This is source/local proof. Live Nest still needs deploy/promote after `operator-gcloud-auth` is fixed.

## 2026-07-06 - Scheduling/runway contract guard hardened

Expanded the HGO/Quipsly coaching handoff static smoke so the scheduling MVP is
protected as a state machine, not just a pile of form fields.

Added guardrails:

- The Nest coaching runway must expose create hold, release hold, convert hold,
  reschedule booking, and cancel booking actions.
- Hold language must stay honest: a hold is not a booking until a human converts
  it, and a released hold no longer reserves time.
- Reschedule language must stay honest: Quipsly can move the internal booking
  state, but the outside calendar/invite remains unproven until external
  evidence is updated.
- Cancel language must stay honest: Quipsly can cancel internal state, but the
  outside calendar/payment world still needs separate reconciliation before we
  claim it is done.
- Payment-required bookings must remain out of confirmed capture while they are
  still waiting on Stripe evidence.
- Calendar evidence markers for `reschedule-planned` and `cancel-planned` must
  remain present.
- Prisma enum vocabulary for hold, booking, and payment states must remain
  present: `BookingHoldStatus`, `CoachingBookingStatus`,
  `PaymentRecordStatus`, `CONVERTED`, `HOLDING_PAYMENT`, `CONFIRMED`, and
  `PENDING`.

Why it matters:

- Scheduling is where systems anxiety gets created fast if state words lie.
- A human should always be able to tell whether something is merely held,
  internally rescheduled, externally calendar-backed, payment-backed,
  capture-ready, or done.

Validation:

```bash
node --check scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
```

Current boundary:

- This is source/local proof only.
- Live HGO and Nest still need preview deploy, preview smoke, promotion, and
  live smoke after `operator-gcloud-auth` is fixed.

## 2026-07-06 - iOS reviewer visible-session setup guarded

Tightened the App Store readiness lane so reviewer auth is not mistaken for a
reviewable capture experience.

Added guardrails:

- `scripts/quipsly-ios-capture-app-store-static-smoke.mjs` now includes the
  staff `/coaching` page in its checked surfaces.
- The static smoke guards the reviewer-safe capture preset:
  `reviewer-capture@dev.test`, `Reviewer test capture session`, and the
  `Create booking and capture room` path.
- The smoke guards the side-effect boundary: reviewer session setup creates
  Quipsly-owned booking/room/requested-consent/calendar receipt-slot state, but
  does not charge, invite, publish, or create an external calendar event.
- `docs/quipsly/ios-capture-reviewer-smoke-checklist.md` now tells the operator
  to create a visible reviewer capture session after creating the reviewer
  Firebase/Quipsly login.
- `docs/quipsly/ios-capture-app-store-readiness.md` now separates reviewer login
  evidence from reviewer visible-session evidence.

Why it matters:

- App Review/beta readiness needs a signed-in reviewer account with something
  safe and representative to do. An empty signed-in app shell is not a
  production-ready capture experience.

Validation:

```bash
node --check scripts/quipsly-ios-capture-app-store-static-smoke.mjs
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
node --check scripts/quipsly-admin-user-management-static-smoke.mjs
node scripts/quipsly-admin-user-management-static-smoke.mjs
node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only --json
```

Result:

- iOS App Store static smoke passed.
- Admin user-management static smoke passed.
- Mobile capture source-only contract smoke passed `21/21`.

Current boundary:

- This proves source/docs/contracts only.
- Device/TestFlight smoke still requires a built app, reviewer credentials, a
  visible reviewer capture session, and deployed Nest routes.

## 2026-07-07 release readiness truth-label pass

Added explicit release-readiness state labels so operators and agents do not confuse source readiness with live public proof.

`node scripts/hgo-quipsly-release-readiness.mjs --local-only --json` now reports:

- `readinessState: "source-contract-ready"`
- `currentTruth: "Local source contracts and builds can be ready, but this local-only run does not prove the public websites."`
- `nextSafeAction: "Run the full release readiness check with operator auth, then preview deploy only if it passes."`
- `sourceReadyButLiveUnproven: true`
- `liveChecksSkipped: true`

`bash scripts/release/hgo-quipsly-public-loop-preflight.sh` now prints a state-boundary reminder before deploy commands:

- Source preflight passing means the repo contract is coherent.
- Preview deploy readiness also requires production builds and operator auth.
- Live proof requires promoted public routes and JSON endpoints to pass smokes.
- Do not call the public loop fixed while HGO copy is stale, Quipsly.com/coaching falls into Nest, or Nest JSON routes return 404 HTML.

Validation run:

```bash
node --check scripts/hgo-quipsly-release-readiness.mjs
bash -n scripts/release/hgo-quipsly-public-loop-preflight.sh
node scripts/hgo-quipsly-release-readiness.mjs --local-only --json
RUN_BUILDS=0 RUN_LIVE_PACKET=0 RUN_LIVE_MATRIX=0 RUN_LIVE_INTEGRATION=0 RUN_OPERATOR_AUTH=0 bash scripts/release/hgo-quipsly-public-loop-preflight.sh
```

Current external state remains deploy/auth blocked:

```bash
bash scripts/release/quipsly-gcloud-auth-check.sh
```

still reports that gcloud user credentials and ADC cannot mint access tokens and cannot access `high-ground-odyssey` or `quipsly-reef`. Current live route matrix still has 6 failures: stale HGO coaching copy, Quipsly.com/coaching falling into Nest, and Nest public/mobile capture JSON routes returning deployed 404 HTML.

Next operator action remains:

```bash
gcloud auth login --update-adc --brief
bash scripts/release/quipsly-gcloud-auth-check.sh
```

## 2026-07-07 public-loop status command and trajectory note

Added a compact status surface for agents and operators:

```bash
node scripts/hgo-quipsly-public-loop-status.mjs --warn-only
node scripts/hgo-quipsly-public-loop-status.mjs --json --warn-only
node scripts/hgo-quipsly-public-loop-status.mjs --deep-local --json --warn-only
```

Use it before asking whether the coaching/capture public loop is ready to deploy. It reports source contract, deploy auth, live route drift, current truth, next safe action, and route-matrix work orders in one place. It does not deploy, promote, publish, charge, record, or mutate external systems.

The attached Quipsly/HGO architecture analysis reinforced the current direction:

- HighGroundOdyssey owns the public coaching doorway and business service framing.
- Quipsly.com owns product education for Research, Studio, Tower, coaching capture, and source-safe creative workflows.
- Nest owns operational truth and app-owned records.
- Native capture owns local-first recording reliability and should never behave like disposable browser cache.

Goal trajectory adjustment:

- Keep the current coaching/capture goal.
- Do not rewrite it into a broad new platform goal yet.
- Add the status command as the shared "where are we really?" checkpoint.
- After operator auth is repaired, the next concrete step is preview deploy plus preview route/integration smokes, not more route theory.

## 2026-07-07 shared public loop map

Centralized the public-loop owner/proof/safe-action ladder in `packages/quipsly-domain/src/coaching-public.ts` as `QUIPSLY_PUBLIC_LOOP_STATUS`.

Current consumers:

- Nest public packet route serves it as `publicLoop`.
- Quipsly.com coaching page renders its owner cards, proof ladder, and safe next actions from it.
- Static smoke now verifies the shared contract owns the language and consumers use the shared constant.

Why this matters:

- Public websites should not drift into different source-of-truth claims.
- HGO can stay a doorway, Quipsly.com can stay education, and Nest can stay operational truth without copy/paste contract archaeology.
