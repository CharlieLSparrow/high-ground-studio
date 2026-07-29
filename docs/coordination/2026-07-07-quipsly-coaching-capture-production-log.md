# Quipsly coaching/capture production log

Purpose: concise deploy and architecture notes for the coaching/capture, media-vault, and Nest readiness lane.

## 2026-07-07 media-vault and calendar deploy

- Deployed live revision `studio-00379-zoc` to `nest.quipsly.com` at 100% traffic.
- Added shared media-vault path policy in `apps/quipsly/src/lib/server/media-vault.ts`.
- Standardized direct upload, mobile capture chunk ingest, and LiveKit egress around `media-vault/...` prefixes.
- Confirmed live readiness reports `QUIPSLY_MEDIA_BUCKET`, `media-vault/proxy`, `media-vault/recordings/livekit`, and `media-vault/recordings/mobile` without exposing provider secrets.
- Confirmed static public assets are packaged into the Cloud Run image after Dockerfile public-copy fix.
- Confirmed live route smoke and public auth boundary smoke pass for `https://nest.quipsly.com`.
- Confirmed no Cloud Run error logs for revision `studio-00379-zoc` immediately after promotion.
- Kept external publication, upload-to-platform, and account mutation out of this pass.

Next storage follow-ups:

1. Build verified `RecordingAsset` -> editor/source asset promotion.
2. Build cloud proxy registration: local proxy -> `media-vault/proxy/...` -> `StudioMediaAsset` variant.
3. Add editor-facing proxy inventory and processing state in one place.
4. Dry-run legacy bucket/object backfill before moving any old media.


## Recording-to-media promotion seam

- Added explicit POST `/api/mobile/capture/recordings/promote` for verified `RecordingAsset` records.
- Promotion creates a reusable `StudioVideoSource`, `StudioMediaAsset`, Nest attachment, workflow job, and `RecordingAsset.localManifestJson.promotion` audit trail.
- Promotion now also writes known-episode recordings into `StudioEpisodeProduction.productionJson.importedMedia` as whole-source media when `episodeSlug` is supplied. That gives the editor role/sync/proxy state without copying or mutating the recording blob.
- Promotion does not copy, mutate, trim, normalize, delete, publish, or move original recording evidence.
- `/api/mobile/capture/sessions`, `/api/mobile/capture/review-digest`, and `/api/mobile/capture/readiness` now expose promotion links/status so reviewers and agents can see the next safe action.
- Direct episode media imports now use `media-vault/raw/...` instead of legacy `episode-imports/...` paths.
- Next storage step: register cloud/local proxies under `media-vault/proxy/...` and expose a single editor inventory showing raw source, proxy, thumbnail, waveform, transcript, and processing state.

### Deployment evidence

- Local validation: `pnpm --filter quipsly typecheck` passed.
- Preview deploy: `studio-00381-rah` with tag `quipsly-recording-promotion` passed route smoke.
- Live deploy: `studio-00382-cav` promoted to 100% live traffic on `https://nest.quipsly.com`.
- Live targeted smoke passed:
  - `/api/mobile/capture/readiness` reports media vault configured and advertises `/api/mobile/capture/recordings/promote`.
  - unauthenticated POST `/api/mobile/capture/recordings/promote` returns structured JSON 401.
  - recent Cloud Run error log check for `studio-00382-cav` returned no entries.

## Media-vault proxy inventory seam

- Added read-only GET `/api/media-vault/inventory` for Nest/raw-asset media truth: raw assets, proxy derivatives, variants, workflow jobs, attachments, and safe next actions.
- Added POST `/api/media-vault/proxies/register` to register an already-created proxy derivative against an immutable raw `StudioMediaAsset`.
- Proxy registration creates/reuses a `StudioVideoSource`, proxy `StudioMediaAsset`, `StudioAssetVariant`, Nest attachment when applicable, and completed workflow evidence.
- `/api/mobile/capture/readiness` now advertises media-vault routes: inventory, presigned upload, proxy registration, and recording promotion.
- Local validation: `pnpm --filter quipsly typecheck` passed.
- Boundary: proxy registration does not copy, trim, normalize, delete, or mutate original media. It records derivative metadata so Studio/Capture/Tower can reason about proxy readiness.

### Proxy inventory deployment evidence

- Preview deploy: `studio-00384-bis` with tag `quipsly-media-vault-inventory` passed route smoke.
- Live deploy: `studio-00385-hiy` promoted to 100% live traffic on `https://nest.quipsly.com`.
- Live targeted smoke passed:
  - `/api/mobile/capture/readiness` advertises `/api/media-vault/inventory` and `/api/media-vault/proxies/register`.
  - unauthenticated GET `/api/media-vault/inventory?nestSlug=test` returns structured JSON 401.
  - unauthenticated POST `/api/media-vault/proxies/register` returns structured JSON 401.
  - recent Cloud Run error log check for `studio-00385-hiy` returned no entries.

## Native Capture media-vault handoff

- Confirmed current bucket posture: keep `gs://high-ground-odyssey-media` as the primary Quipsly media vault and use `media-vault/...` prefixes instead of creating workflow-specific buckets.
- Extended `HighGroundCapture` native models to decode Nest media-vault readiness routes, `canPromoteRecordingToMedia`, and recording promotion fields: media asset id, playback URL, and promotion status.
- Added a native `Make Studio media` action that calls `POST /api/mobile/capture/recordings/promote` for verified recordings. This promotes capture evidence into reusable Studio/Nest media without copying or mutating the recording blob.
- Updated Capture readiness, action-packet, diagnostics, and receipt UI to show the difference between local recording evidence, verified server storage, Studio media handoff, transcript state, and packet state.
- Validation:
  - `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs` passed.
  - `node scripts/quipsly-mobile-capture-session-evidence.test.mjs` passed.
  - `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj -scheme HighGroundCapture -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build` passed.
- Environment note: default `xcodebuild` points at `/Library/Developer/CommandLineTools`; use explicit `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` for iOS builds unless the global developer directory is intentionally changed.
- Local schema smoke note: `node scripts/quipsly-coaching-schema-readiness.mjs` is currently blocked against local `postgresql://localhost:5432/high_ground_studio`; this did not block the native app build or route-contract smokes.

## LiveKit native SDK probe and default-build safety

- Investigated the current LiveKit Swift package path for native iPhone rooms. LiveKit `client-sdk-swift-xcframework` advertises product `LiveKit` and binary artifacts for LiveKit, WebRTC, and Rust UniFFI.
- Attempted a controlled Xcode target wiring pass against `client-sdk-swift-xcframework` `2.15.1`. Xcode checked out the package but stalled during artifact acquisition, matching the prior dependency-lane warning.
- Removed the half-installed package references and `Package.resolved` from the `HighGroundCapture` project so the default iOS app build stays stable.
- `/api/mobile/capture/readiness` now distinguishes server LiveKit token readiness from native SDK readiness. This prevents the app or agents from confusing “Nest can mint a join token” with “the iPhone app can join the room today.”
- Current rule: do not wire LiveKit into the production app target until `scripts/quipsly-livekit-swift-probe.sh` completes both resolve and build in the controlled lane.
- Validation after cleanup:
  - `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs` passed.
  - `node scripts/quipsly-mobile-capture-session-evidence.test.mjs` passed.
  - `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj -scheme HighGroundCapture -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build` passed.

## Calendar readiness and Homer timezone default

- Added non-secret Google Calendar readiness to `/api/mobile/capture/readiness`, beside media-vault and provider readiness.
- Centralized the active Quipsly coaching default timezone as `America/Los_Angeles`, overridable with `COACHING_DEFAULT_TIMEZONE`.
- Documented that Homer/Orange County coaching defaults to Pacific unless a coach profile, booking, or explicit client choice overrides it.
- Added `.env.example` entries for `COACHING_DEFAULT_TIMEZONE`, `GOOGLE_CALENDAR_INCLUDE_ATTENDEES`, and `GOOGLE_CALENDAR_ALLOW_METADATA_TOKEN`.
- Boundary: Google Calendar is scheduling evidence and convenience. Quipsly remains the source of truth for bookings, call rooms, consent, recording evidence, transcripts, notes, goals, follow-up packets, and receipts.

## Native calendar readiness visibility

- Extended `HighGroundCapture` to decode `calendarReadiness` from Nest readiness.
- Added calendar evidence status to the native Capture readiness grid so the app shows calendar configuration, default timezone, credential path, and update mode before a user joins or records.
- Added native copy that keeps the boundary visible: Google Calendar is evidence; Quipsly owns booking truth.
- Extended `scripts/quipsly-ios-capture-app-store-static-smoke.mjs` so future changes must preserve native calendar readiness decoding and UI visibility.

## Read-only calendar access check

- Added `GET /api/coaching/calendar/readiness` as a side-effect-free calendar readiness route.
- Default call returns configured posture only. Staff can add `?verify=1` to perform a read-only Google Calendar metadata check.
- The verification route reports `externalMutated:false` and does not create, update, delete, send, invite, or schedule anything externally.
- `/api/mobile/capture/readiness` now advertises the calendar readiness route so native Capture and reviewer tooling can discover it.

## Media-vault bucket reality check

- Non-mutating `gcloud storage buckets list --project high-ground-odyssey` confirmed the current project has `high-ground-odyssey-media`, `high-ground-odyssey-quipsly-media`, `high-ground-raw-assets`, `high-ground-raw-footage`, build buckets, and run source buckets.
- `gs://high-ground-odyssey-media/media-vault/raw/...` already contains Episode 4 source media.
- `media-vault/proxy`, `thumb`, `recordings/livekit`, `recordings/mobile`, `exports`, `packets`, and `review` are the correct target prefixes even if currently empty.
- Decision: do not create a separate proxy bucket right now. Populate `media-vault/proxy/...`, register derivatives through `/api/media-vault/proxies/register`, and keep raw/proxy meaning in Quipsly metadata.

## Local-engine proxy-vault alignment

- Updated `apps/local-engine` to use `high-ground-odyssey-media` as the no-env fallback instead of the legacy `high-ground-raw-footage` bucket.
- Aligned generated object paths with the media-vault policy: `media-vault/raw/...`, `media-vault/proxy/...`, and `media-vault/thumb/...`.
- After local-engine uploads raw/proxy/thumb files and registers the raw episode source with Nest, it now attempts `/api/media-vault/proxies/register` so cloud proxies become inspectable derivative assets instead of orphaned bucket objects.
- If a Nest token or raw asset id is missing, the proxy registration is held and reported in the result; Quipsly does not pretend the proxy is attached.

## LiveKit join-token contract hardening

- Moved LiveKit provider-room token creation into `apps/quipsly/src/lib/server/livekit-join-token.ts` so the room-join route is not hand-rolling JWT details inline.
- Join tokens are short-lived, room-scoped, metadata-backed, and carry explicit `iat`, `nbf`, `exp`, `jti`, participant identity, room join grant, publish/data/subscribe grants, and Quipsly metadata keys.
- The shared meeting-spine response now includes a `tokenBoundary` that states provider credentials are not exposed, joining does not start recording, tokens are not reusable across rooms, and provider recording remains a visible receipt-backed action.
- Added `scripts/quipsly-livekit-join-token-contract.test.mjs` to decode a deterministic test token and prove the claim shape without calling LiveKit Cloud or exposing secrets.

## Native provider-room token-boundary readback

- `HighGroundCapture` now decodes the meeting-spine `tokenBoundary` from both flat and nested provider-join fields.
- Added a native `ProviderJoinTokenBoundaryCard` under the live-room controls. It shows whether the prepared provider key is short-lived, room-scoped, not reusable across rooms, not recording, and free of provider secret exposure.
- This gives App Review, Mako/Homer, Charlie, and agent operators a visible explanation of what the LiveKit join packet does before the native SDK join path is fully proven.
- Validation: `swiftc -parse` passed for `BridgeModels.swift` and `QuipslyMobileComponents.swift`; `scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only --json` passed 36/36 source contract checks.

## Side-effect-free room join diagnostics and bucket truth

- Added a separate `/api/mobile/capture/rooms/join/diagnostics` route for reviewer, native-app, and agent checks that must not create participants, join LiveKit, start recording, mint provider tokens, mutate Stripe, mutate Calendar, or mutate media state.
- Extracted shared room-join boundary helpers into `apps/quipsly/src/lib/server/mobile-capture-room-join-diagnostics.ts` so the real join route and diagnostic route share payment/access/readiness language instead of drifting.
- `/api/mobile/capture/readiness` now advertises the diagnostics route separately from the real `POST /api/mobile/capture/rooms/join` action.
- Bucket inventory currently includes `high-ground-odyssey-media`, `high-ground-odyssey-quipsly-media`, legacy raw-looking buckets, Cloud Build buckets, and run-source buckets. Current code policy remains: use `high-ground-odyssey-media` as the primary media-vault bucket and route raw/proxy/thumb/mobile/livekit/exports/review objects through `media-vault/...` prefixes.
- Product boundary: buckets store bytes; `CallRoom`, `RecordingAsset`, `StudioMediaAsset`, transcript jobs, manifests, packets, and receipts own meaning, access, attachment, review state, and publishing truth.

## Native room diagnostics readback

- `HighGroundCapture` now decodes `MobileCaptureRoomJoinDiagnosticResponse` separately from `MobileCaptureRoomJoinResponse`.
- Added a native `Inspect readiness` action that calls `/api/mobile/capture/rooms/join/diagnostics` before the provider join-key path.
- Added `RoomJoinDiagnosticsCard` and `ProviderRoomDiagnosticCard` so the app shows that inspection is side-effect-free: no participant creation, no provider join, no token mint/return, no recording start, and no Stripe/Calendar/media mutation.
- Adjusted local recording start so it inspects room readiness instead of preparing a provider join token. Provider token minting now stays attached to the explicit provider join-key action.
- The native copy now repeats the media-vault boundary: buckets store bytes; Quipsly records own meaning, access, review, and publishing truth.

## Coaching runway payment readiness UI repair

- The broader mobile capture preflight caught that the coaching runway API exposed the Stripe/Customer Portal/payment-boundary truth, but the operator UI did not make the Customer Portal evidence rule explicit enough.
- Added visible runway copy: Customer Portal requires existing Stripe customer evidence and does not create bookings, subscriptions, course access, SaaS access, recordings, or entitlements.
- This keeps Stripe/Portal in the evidence-provider lane while Quipsly owns booking, recording, transcript, packet, and entitlement truth.

## 2026-07-08 media-vault bucket consolidation follow-up

- User concern: proxy video files, podcast recordings, LiveKit recordings, and editor attachments still felt like a confusing bucket/file-management tangle.
- Decision reinforced: do not create a separate proxy bucket by default. Continue using `gs://high-ground-odyssey-media` as the primary Quipsly media vault, with source/proxy/thumbnail/recording/export meaning expressed through `media-vault/...` object prefixes plus app-owned records.
- Cleaned active drift:
  - Legacy one-shot `/api/ingest/mobile` uploads now call `buildMobileRecordingObjectName(...)` and land under `media-vault/recordings/mobile/...`, matching chunked mobile capture.
  - Legacy/dev helper scripts no longer default executable uploads to `high-ground-raw-footage`; they point at `high-ground-odyssey-media` and `media-vault/raw/...` or use configured env.
  - `apps/local-engine/scripts/process-media.ts` now uses the shared local-engine media-vault path helper for raw/proxy object names.
  - Added a contract-smoke assertion that one-shot mobile ingest uses the shared media-vault mobile-recording path and does not reintroduce `recordings/source`.
- Validated:
  - `pnpm --filter quipsly typecheck`
  - `pnpm --filter local-engine typecheck`
  - `node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only --json`
- Product truth: buckets hold bytes; Quipsly/Nest records own attachment, access, source role, proxy relationship, review state, promotion into editor, and publication receipts.

## 2026-07-08 coaching calendar runway hardening

- User context: Homer is in Orange County, so coaching workflows should default to Pacific time unless a coach profile, booking, room, or explicit client-facing selection overrides it.
- Confirmed the shared Google Calendar adapter already exposes `DEFAULT_COACHING_TIMEZONE = "America/Los_Angeles"` through `getCoachingDefaultTimezone()`.
- Cleaned runway drift: `apps/quipsly/src/app/api/coaching/runway/route.ts` now uses `getCoachingDefaultTimezone()` instead of route-local `"America/Los_Angeles"` literals for coach setup, booking creation, calendar packets, room creation, and rescheduling fallbacks.
- Fixed a real route mismatch: the coaching page sends `sync-google-calendar-event` and the runway route had implementation code for it, but the early supported-action allowlist omitted it. The action is now allowed so the explicit Google Calendar sync path can reach its implementation.
- Strengthened `scripts/quipsly-coaching-scheduling-static-smoke.mjs` to prove the runway uses the shared default timezone helper and that explicit Google Calendar sync is part of the supported scheduling action set.
- Validated:
  - `node scripts/quipsly-coaching-scheduling-static-smoke.mjs`
  - `pnpm --filter quipsly typecheck`
  - `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs`
- Product truth: Calendar sync is an explicit human/operator action that creates provider receipt evidence. Quipsly-owned booking/call-room state remains the source of truth.

## 2026-07-08 LiveKit egress readiness and media-vault bucket truth

- User concern: LiveKit recording, podcast recording, video-editor proxies, and Nest/media attachment were still too easy to confuse because different surfaces answered bucket readiness differently.
- Repaired drift: `apps/quipsly/src/lib/server/coaching-livekit-egress.ts` now exports a shared `getQuipslyLiveKitEgressReadiness()` helper.
- `/api/mobile/capture/readiness` and `/api/coaching/runway` now use that same helper instead of route-local bucket folklore.
- `QUIPSLY_MEDIA_BUCKET` and the shared media-vault bucket env list are valid for LiveKit egress readiness. LiveKit recordings write under `media-vault/recordings/livekit/...`.
- Added an explicit operator start gate: LiveKit egress must be fully configured and `LIVEKIT_EGRESS_ENABLED=true` before Quipsly will start provider/server recording. Stop/reconcile remain separate recovery controls.
- Reinforced product truth: one media-vault bucket with prefixes is the default. Buckets store bytes; Quipsly/Nest records own attachment, proxy relationship, episode/podcast meaning, access, review state, transcript handoff, packets, exports, and receipts.

## 2026-07-08 native Capture provider-egress readback

- Strengthened `HighGroundCapture` readiness decoding so the native app can distinguish LiveKit room join readiness from server/provider recording readiness.
- Added native readiness copy for the provider egress start gate: configured egress can still be held until `LIVEKIT_EGRESS_ENABLED=true`.
- The Capture readiness panel now shows provider/server recording readiness, egress detail, and the provider media-vault source-of-truth line instead of leaving humans or agents to infer it from backend configuration.
- Updated App Store readiness docs and reviewer checklist: joining a LiveKit room, local recording, and LiveKit server egress are three separate states.

## 2026-07-08 full iOS capture preflight proof

- Resolved the apparent `xcodebuild` blocker without changing global machine state: full Xcode exists at `/Applications/Xcode.app`, while `xcode-select` still points at Command Line Tools.
- Direct simulator build succeeds when run with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.
- Full `scripts/quipsly-mobile-capture-preflight.sh` now passes from the repo. It validates privacy manifest, Quipsly TypeScript, capture/coaching/static contract smokes, ingestion idempotency, mobile capture session evidence, and the iOS simulator build.
- Production lesson: use explicit `DEVELOPER_DIR` in repo scripts and handoffs. Do not treat CommandLineTools `xcode-select` as an app-code blocker.

## 2026-07-08 media-vault bucket/proxy/recording sanity check

- Confirmed the active product media bucket is `gs://high-ground-odyssey-media`.
- Confirmed cloud already contains raw product media under `media-vault/raw/...`.
- Confirmed `media-vault/proxy`, `media-vault/thumb`, `media-vault/recordings/livekit`, `media-vault/recordings/mobile`, `media-vault/exports`, `media-vault/packets`, and `media-vault/review` are currently empty or not yet producing visible objects in the live bucket listing.
- Decision retained: do not create a separate proxy bucket by default. Use the primary Quipsly media vault with object prefixes plus app-owned records. Buckets store bytes; Quipsly/Nest metadata owns meaning, attachment, access, review, and publishing truth.
- Editor implication: local full-length proxies should upload/register under `media-vault/proxy/...` against immutable raw `StudioMediaAsset` records before collaborative editing treats them as portable.
- Podcast/capture implication: provider and mobile recordings attach to `CallRoom` first, then promote into reusable editor media and episode production metadata after verified storage, consent, and transcript evidence exist.
- Live check: deployed `/api/mobile/capture/readiness` reports `QUIPSLY_MEDIA_BUCKET=high-ground-odyssey-media`, but production is behind local code for the newer LiveKit egress readiness fields and `/api/coaching/calendar/readiness` route. Next safe action is deploy the already-validated local Quipsly web code, preserving secrets.

## 2026-07-08 capture/media-vault live deploy

- Built and deployed Quipsly web preview revision `studio-00387-von` from Cloud Build `42c82223-2480-4876-8668-373bb46b4f1d`.
- Cloud Build reported a known image lookup failure after Kaniko pushed the image, but the deploy script verified the image existed and deployed it safely as a no-traffic preview first.
- Preview URL tested: `https://quipsly-web-preview---studio-hm2odnvjga-uc.a.run.app`.
- Preview checks passed:
  - `/api/mobile/capture/readiness` exposed LiveKit egress readiness, `QUIPSLY_MEDIA_BUCKET`, media-vault prefixes, and calendar readiness.
  - `scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=<preview>` passed `64/64`.
  - `scripts/hgo-quipsly-public-integration-smoke.mjs --nest-base-url=<preview> --warn-only` passed with no warnings.
- Promoted `studio-00387-von` to 100% live traffic.
- Live checks passed after promotion:
  - `/api/mobile/capture/readiness` reports LiveKit egress configured/enabled, storage prefix `media-vault/recordings/livekit`, `configuredBucketEnvName=QUIPSLY_MEDIA_BUCKET`, and bucket `high-ground-odyssey-media`.
  - `scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=https://nest.quipsly.com --json` passed `64/64`.
  - `scripts/hgo-quipsly-public-integration-smoke.mjs --nest-base-url=https://nest.quipsly.com --warn-only` passed with no warnings.
- Standalone `/api/coaching/calendar/readiness` correctly requires sign-in; safe non-secret calendar readiness remains available through mobile capture readiness.
- Follow-up: deploy script should tolerate or explicitly document the Kaniko image-lookup false-negative and should resolve tagged preview URLs more robustly.

### 2026-07-08 native provider-room runtime honesty pass

- Kept `gs://high-ground-odyssey-media` as the single media-vault bucket and reinforced that proxy files live under `media-vault/proxy/...` while podcast/coaching recordings live under `media-vault/recordings/...`.

## 2026-07-08 proxy inventory operator tightening

- User concern: video-editor proxy files, podcast recordings, and recording-to-editor attachment still felt too easy for agents to treat as folder magic.
- Reaffirmed the product decision: do not create a separate proxy bucket by default. Use `gs://high-ground-odyssey-media/media-vault/proxy/...` and app-owned source/proxy records.
- Improved `scripts/quipsly-local-media-vault-inventory.mjs` with operator-safe filters:
  - `--proxies-only` for video-editor proxy migration questions.
  - `--exports-only` for release/review packet questions.
  - `--summary-only` for calm dashboards without huge item lists.
  - `--limit` for sample review packets.
- Current local dry-run summary remains large enough to deserve caution: 173 local proxy derivatives and 28,519 export/review artifacts, about 97.78 GiB total.
- Bucket verifier could not run live because local gcloud/ADC credentials need reauth. No bucket mutation was attempted.
- Product truth: moving local proxy bytes to cloud is not the hard part. The hard part is proving the raw source parent, Nest/episode attachment, role, proxy derivative relation, and safe next action before upload/register.

## 2026-07-08 LiveKit app-target package correction

- Resolver evidence showed the Xcode project was pointed at the LiveKit source SDK package, `https://github.com/livekit/client-sdk-swift.git`, while the app-target spike had identified the dedicated binary package, `https://github.com/livekit/client-sdk-swift-xcframework.git`.
- The source SDK path resolved a broader graph and stalled with no SwiftPM artifacts installed. The process sat at 0% CPU and was stopped instead of waiting through the full timeout.
- Corrected `HighGroundCapture` to point at the exact-pinned binary package `client-sdk-swift-xcframework` `2.15.1`.
- Updated the LiveKit artifact doctor to include all three binary artifacts: `LiveKit.xcframework.zip`, `LiveKitWebRTC.xcframework.zip`, and `RustLiveKitUniFFI.xcframework.zip`.
- Updated smoke/docs so future agents do not restore the source SDK package by accident.
- Current proof status: static contract can prove the app target references the correct package, but provider-media readiness still requires artifact doctor, package resolution, simulator build, and a real Nest-issued join packet test.
- Probed LiveKit Swift 2.15.1 outside the iOS project. Package metadata resolved, but SwiftPM timed out while downloading LiveKit/WebRTC binary XCFramework artifacts, so the real app target was not polluted with half-installed package state.
- Hardened HighGroundCapture so native provider-room readiness distinguishes Nest/server join-token readiness from app-binary LiveKit SDK availability.
- Added visible CallKit audio-session state and made provider recording use explicit Nest-backed operator actions instead of stale “not wired” copy.
- Added `scripts/quipsly-mobile-provider-room-static-smoke.mjs` and wired it into the mobile capture preflight so future agents cannot silently blur CallKit, LiveKit, recording, and media-vault boundaries.

Next seam: either let the LiveKit Swift artifact fetch complete in a long, isolated run before adding the package to the Xcode target, or keep building the native Capture UX around the explicit provider-runtime boundary while local recording remains the reliable App Store path.

### 2026-07-08 LiveKit artifact setup lane

- Added `scripts/quipsly-livekit-artifact-doctor.sh` as the explicit diagnostic/prefetch lane for LiveKit Swift binary artifacts.
- Wired the doctor into `scripts/quipsly-mobile-capture-preflight.sh` behind `RUN_LIVEKIT_ARTIFACT_DOCTOR=1` so normal Capture builds stay fast and do not depend on provider SDK artifact fetches.
- Updated `.env.example` with LiveKit join/egress variables and the product boundary: credentials make Nest server readiness possible, but native media readiness still requires the SDK artifacts to be available and linked.
- Updated the App Store readiness doc with the safe LiveKit setup ladder: artifact doctor first, isolated probe second, Xcode package attachment only after the provider dependency lane is repeatable.

Lesson: a provider SDK dependency is not a product feature until acquisition, build linkage, runtime behavior, consent state, recording state, and receipt evidence are all visible separately.

## 2026-07-08 media-vault and session-context hardening

- Added `/api/mobile/capture/sessions/context` as the Nest-owned session-context seam for native Capture notes, goals, and tasks.
- Exposed the session-context route and boundary in `/api/mobile/capture/readiness`.
- Native Capture now keeps context local-first but makes `Load Nest` and `Save Nest` explicit, with Nest truth stored at `CallRoom.metadataJson.captureSessionContext`.
- Added `scripts/quipsly-mobile-capture-session-context-static-smoke.mjs` to guard the route, native bridge, and visible sync controls.
- Added `scripts/quipsly-media-vault-contract-smoke.mjs` to guard the shared bucket/prefix policy: raw, proxy, thumb, LiveKit recordings, mobile recordings, exports, packets, and review artifacts all stay under the primary media-vault contract.
- Updated mobile preflight to run the new session-context and media-vault contract smokes.
- Updated `docs/quipsly/media-vault-policy.md` with a dry-run-first audit/migration rule for loose proxy files, old raw footage, and recording objects.
- Validation passed: `node scripts/quipsly-media-vault-contract-smoke.mjs`, `node scripts/quipsly-mobile-capture-session-context-static-smoke.mjs`, `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs`, and `scripts/quipsly-mobile-capture-preflight.sh`.
- Live GCP bucket list confirmed multiple media-adjacent buckets exist, but object-prefix inspection of `gs://high-ground-odyssey-media/media-vault/` is currently blocked by `403` because the owning project billing account is disabled/delinquent. Do not attempt cloud proxy movement or bucket cleanup until billing is fixed.

## 2026-07-08 recording-to-podcast/editor attachment pass

- Added `recordingPromotionBoundary` to `/api/mobile/capture/readiness` so the native app, reviewers, and agents can see how a verified `RecordingAsset` becomes reusable podcast/editor material.
- Added `docs/quipsly/capture-recording-to-podcast-editor-flow.md` to make the source-of-truth split explicit: `CallRoom` owns the session, `RecordingAsset` owns recording evidence, `StudioMediaAsset` owns reusable editor/media assets, and `StudioEpisodeProduction.productionJson.importedMedia` owns episode-editor meaning.
- Added `scripts/quipsly-recording-podcast-attachment-static-smoke.mjs` and wired it into `scripts/quipsly-mobile-capture-preflight.sh`.
- Changed the native post-capture button label from `Make Studio media` to `Attach to Studio` so the UI matches the product truth: preserve the recording, attach it into Studio/editor workflows, do not imply publishing or destructive transformation.
- Validation passed: `node scripts/quipsly-recording-podcast-attachment-static-smoke.mjs`, `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs`, and `scripts/quipsly-mobile-capture-preflight.sh`.
- Known external blocker remains separate: live GCS object inspection/movement is blocked by project billing state. Do not attempt proxy/recording bucket migration until billing is healthy and a dry-run manifest exists.

## 2026-07-08 media-vault bucket consolidation guardrail

- Aligned local `QUIPSLY_MEDIA_BUCKET` with the active media-vault policy bucket: `high-ground-odyssey-media`.
- Kept `high-ground-odyssey-quipsly-media` as reserved/non-default instead of letting proxy and recording uploads scatter there.
- Added readiness fields in `media-vault.ts` so operators can see whether the configured bucket matches the policy bucket.
- Strengthened `scripts/quipsly-media-vault-contract-smoke.mjs` to fail when local env drifts away from the primary media vault.
- Verified the project still has the legacy/reserved buckets present, but the product path remains one primary bucket plus `media-vault/...` prefixes and app-owned records.

## 2026-07-08 native post-capture runway clarity

- Added a native `CapturePostCaptureRunwayCard` to the iPhone Capture session surface.
- The card makes the post-capture sequence explicit: source evidence -> Studio attachment -> transcript -> packet review.
- The UI now says Attach to Studio does not publish, charge, schedule, delete local media, or start provider recording.
- This keeps the same data model while making the state machine easier for humans, reviewers, and agents to inspect.
- Updated recording/editor policy docs and static smoke coverage to protect the runway language and named SwiftUI surface.
- Validated with:
  - `node scripts/quipsly-recording-podcast-attachment-static-smoke.mjs`
  - `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs`
  - `node scripts/quipsly-media-vault-contract-smoke.mjs`
  - `scripts/quipsly-mobile-capture-preflight.sh`

## 2026-07-08 native reviewer digest read-only proof

- Added `ReviewerDigestBoundaryCard` to the native `MobileCaptureReviewDigestPanel`.
- The digest panel now labels itself as a read-only reviewer packet and repeats that refresh does not join rooms, start recording, charge, publish, schedule, invite, upload, or delete media.
- Updated App Store readiness docs and the reviewer smoke checklist so physical-device review includes the read-only boundary.
- Strengthened `scripts/quipsly-ios-capture-app-store-static-smoke.mjs` to protect the native read-only proof card and side-effect copy.
- Validated with:
  - `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs`
  - `scripts/quipsly-mobile-capture-preflight.sh`
- iOS simulator build passed. AppIntents metadata warning remains expected because the app does not depend on AppIntents.

## 2026-07-08 local proxy/export vault inventory seam

- Confirmed the current media-vault policy remains one primary bucket, `high-ground-odyssey-media`, with prefixes for raw media, proxies, thumbnails, LiveKit/mobile recordings, exports, packets, and review artifacts.
- Local reality check found about 16.8 GiB of local proxy derivatives under `~/Library/Application Support/Quipsly/MediaVault/proxy` and about 81 GiB of review/export artifacts under `/Volumes/My Passport/Episode_and_Shorts_Test`.
- Added `scripts/quipsly-local-media-vault-inventory.mjs` so future proxy/export movement starts with a dry-run manifest instead of blind cloud copies.
- The inventory marks loose local proxies as `held-unattached` until they can be tied to a raw `StudioMediaAsset`, `RecordingAsset`, or episode source association.
- Cloud prefix inspection was not completed in this pass because `gcloud storage ls` hit a non-interactive reauthentication wall. Do not infer that the cloud prefixes are empty or full from this pass alone.
- Product boundary remains unchanged: buckets store bytes; Quipsly/Nest records own asset meaning, access, episode attachment, review state, publishing state, and receipts.

## 2026-07-08 - Pacific scheduling + media vault boundary pass

- Added the public coaching scheduling contract to the shared Quipsly public coaching packet.
- Default coaching scheduling remains `America/Los_Angeles` / Pacific time because Homer operates from Orange County unless a booking explicitly overrides it.
- Exposed scheduling truth on the HighGroundOdyssey.com coaching handoff page: Google Calendar is scheduling evidence and convenience, while Quipsly owns booking, payment evidence, room, consent, recording, transcript, notes, goals, and follow-up truth.
- Tightened the HGO fallback normalizer for the full native capture contract so the public site keeps compiling when Quipsly's native-call architecture evolves.
- Reconfirmed the media-vault policy: do not create a separate proxy-only bucket by default. Use the primary `high-ground-odyssey-media` bucket with explicit prefixes such as `media-vault/proxy/...`, `media-vault/recordings/...`, and `media-vault/exports/...`.

Validation:
- PASS `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json`
- PASS `pnpm --filter @high-ground/quipsly-domain typecheck`
- PASS `pnpm --filter web build`
- PASS `node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs`
- PASS `node scripts/quipsly-media-vault-contract-smoke.mjs`
- PASS `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs`

Notes:
- `pnpm --filter web build` still reports existing non-blocking warnings for the deprecated `middleware` convention and Turbopack tracing around `apps/web/src/lib/server/living-manuscript.ts`.
- Cloud object-prefix inspection was not completed in this pass because non-interactive gcloud storage reads previously required reauth. Do not treat cloud proxy-prefix contents as verified until that readback succeeds.

## 2026-07-08 - Direct media-vault readiness route + explicit mock upload gate

- Added `/api/media-vault/readiness` as a side-effect-free storage contract endpoint for the native app, local engine, humans, and deploy smoke checks.
- Linked Mobile Capture readiness to the direct media-vault readiness route so storage/proxy/recording policy is no longer only embedded inside the capture response.
- Kept the bucket policy intentionally boring: one primary `high-ground-odyssey-media` bucket, explicit `media-vault/...` prefixes, app-owned metadata for meaning/access.
- Removed silent mock upload success from the shared GCS helper. Mock upload URLs now require `QUIPSLY_ALLOW_MOCK_UPLOADS=true` outside production and return a visible local-only warning.
- Updated `.env.example`, `docs/quipsly/media-vault-policy.md`, and `scripts/quipsly-media-vault-contract-smoke.mjs` to guard the new route and mock-upload boundary.

Validation:
- PASS `node scripts/quipsly-media-vault-contract-smoke.mjs`
- PASS `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs`
- PASS `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json`
- PASS `pnpm --filter @high-ground/quipsly-domain typecheck`
- PASS `pnpm --filter quipsly build`

Notes:
- `pnpm --filter quipsly build` still reports an existing non-blocking Turbopack tracing warning involving `apps/quipsly/src/app/(app)/nests/[slug]/actions.ts`.
- Cloud bucket/prefix readback remains unverified from this non-interactive session until `gcloud` token refresh can run interactively.

## 2026-07-08 - Native Capture media-vault readiness visibility

- Wired direct media-vault readiness into the native Capture readiness model instead of relying only on media-vault route presence.
- The iPhone readiness UI can now distinguish an aligned media vault from a configured-but-wrong bucket and show the direct storage source-of-truth line.
- Added route decoding for `/api/media-vault/readiness` beside inventory, upload, proxy registration, and recording promotion routes.
- Strengthened the App Store static smoke so future changes must preserve native decoding of `MobileCaptureMediaVaultReadiness`, primary bucket policy match, configured bucket warning, and the direct readiness route.

Validation:
- PASS `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs`
- PASS `node scripts/quipsly-media-vault-contract-smoke.mjs`
- PASS `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json`
- PASS `pnpm --filter quipsly build`
- PASS `swiftc -parse apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift apps/mobile-capture/HighGroundCapture/HighGroundCapture/QuipslyMobileComponents.swift`

Native build caveat:
- Full `xcodebuild` validation is blocked in this environment because `xcode-select` points to `/Library/Developer/CommandLineTools` instead of a full Xcode developer directory. Device/TestFlight validation remains required.

## 2026-07-08 - Media-vault proxy and podcast-recording consolidation note

- Reconfirmed the storage architecture: use `high-ground-odyssey-media` as the primary media vault with boring `media-vault/...` prefixes, not separate ad hoc buckets for proxies or podcast recordings.
- Ran a dry-run local inventory: 28,692 files, 97.78 GiB, 173 local proxy files, and 28,519 export/review artifacts. Nothing was moved, uploaded, deleted, or mutated.
- Added `docs/quipsly/media-vault-consolidation-workorder.md` so future proxy movement follows: inventory -> map to app-owned source record -> upload/register -> then optional cleanup.
- Clarified that podcast/coaching recordings attach to `CallRoom` and verified `RecordingAsset` first, then promote into `StudioMediaAsset` and `StudioEpisodeProduction.productionJson.importedMedia` as whole-source editor media.
- Next implementation target remains an editor-facing inventory surface that shows raw source, proxy, thumbnail, waveform/transcript, recording evidence, episode role, sync status, and safe next action together.

## 2026-07-08 - Native Capture post-capture runway proxy boundary

- Strengthened the native post-capture runway copy so Studio attachment explicitly says promotion creates whole-source episode-editor meaning without mutating the original.
- Added visible proxy boundary copy: video recordings need a media-vault proxy before collaborative editing treats them as playback-ready.
- Extended the iOS Capture static smoke so this whole-source/proxy boundary cannot quietly disappear from the native app.

Validation:
- PASS `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs`
- PASS `swiftc -parse apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift apps/mobile-capture/HighGroundCapture/HighGroundCapture/QuipslyMobileComponents.swift`
- PASS `node scripts/quipsly-media-vault-contract-smoke.mjs`

## 2026-07-08 - Episode media truth endpoint

- Added read-only `/api/media-vault/episode-inventory` for one Nest episode's media truth.
- The endpoint reports `StudioEpisodeProduction` state, `productionJson.importedMedia`, attached `StudioMediaAsset` records, proxy readiness, linked `RecordingAsset` evidence, transcript job counts, and safe next actions.
- Added the endpoint to `/api/media-vault/readiness` and `/api/mobile/capture/readiness` so web, native Capture, local engine, and agents discover the same media-truth menu.
- Extended the native readiness model to decode and summarize the `episode inventory` route.
- Extended the media-vault contract smoke so this route remains side-effect-free and whole-source oriented.

Validation:
- PASS `node scripts/quipsly-media-vault-contract-smoke.mjs`
- PASS `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs`
- PASS `swiftc -parse apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift apps/mobile-capture/HighGroundCapture/HighGroundCapture/QuipslyMobileComponents.swift`
- PASS `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json`

### 2026-07-08 - Episode editor media-vault truth panel
- Made the existing read-only episode inventory endpoint visible inside the web editor with an `Episode media truth` panel.
- The panel shows imported media, recording evidence, proxy readiness, transcript counts, attached asset counts, and safe next actions without uploading, promoting, transcribing, publishing, or mutating originals.
- Tightened refresh behavior so the panel refreshes the media truth endpoint directly instead of piggybacking on timeline reload state.
- Product decision reinforced: keep one primary media bucket (`high-ground-odyssey-media`) with intentional prefixes; bucket paths hold bytes, while Nest/Quipsly records own meaning, access, podcast/editor attachment, review, and publishing receipts.
- Validation: `node scripts/quipsly-media-vault-contract-smoke.mjs` passed.
- Validation: `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.

### 2026-07-08 - Calendar readiness truth sharpening
- Local `.env` now has non-secret `COACHING_DEFAULT_TIMEZONE="America/Los_Angeles"` so Homer/Orange County coaching flows do not drift to machine-local time.
- Hardened Google Calendar readiness language: configured calendar ID plus credentials is now a provider-sync candidate, not a proof that external calendar writes are verified.
- Added explicit readiness fields for `credentialConfigured`, `metadataTokenCandidate`, `configurationStatus`, and `verificationRecommended`.
- Native Capture now labels unverified calendar setup as `Calendar evidence candidate` or `Calendar verify needed`; it only turns green when a verified access check returns `accessOk`.
- Test invariant added: do not let calendar readiness regress into fake green provider certainty.

### 2026-07-08 - Coaching runway calendar evidence visibility
- Added `calendarReadiness` to `/api/coaching/runway` so the web coaching dashboard can show Google Calendar provider posture beside Stripe and LiveKit readiness.
- Added a Calendar readiness card and Calendar evidence boundary panel to `/coaching`.
- The web dashboard now distinguishes `access verified`, `verify first`, and `setup needed` instead of implying that a configured calendar ID means an external calendar event can be trusted.
- The panel reinforces the product rule: Pacific is the coaching default; Google Calendar is scheduling evidence; Quipsly owns booking, room, consent, recording, transcript, notes, goals, and follow-up truth.
- Validation: `node scripts/quipsly-coaching-scheduling-static-smoke.mjs` passed.
- Validation: `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.

## 2026-07-08 media-vault bucket/proxy safety pass

- Tightened `scripts/verify-cloud-bucket.sh` into a dry-run-first media-vault verifier.
- The verifier now checks the primary bucket policy, warns on `LIVEKIT_EGRESS_GCS_BUCKET` split, lists expected `media-vault/...` prefixes, and refuses bucket mutation unless `--create` or `--apply-cors` is explicit.
- Documented that video editor proxies belong under `gs://high-ground-odyssey-media/media-vault/proxy/...`, not in a new proxy-only bucket by default.
- Reiterated that podcast/coaching recordings attach to `CallRoom` and promote into `StudioMediaAsset` / episode imported media; the editor must not infer role from bucket path.
- Validation: `bash -n scripts/verify-cloud-bucket.sh` passed.
- Validation: `node scripts/quipsly-media-vault-contract-smoke.mjs` passed.
- Live GCS listing was blocked by gcloud reauthentication; no bucket mutation was attempted.

## 2026-07-08 LiveKit join boundary hardening

- Strengthened the real room-join response to distinguish diagnostic inspection from join preparation.
- The real join endpoint may create a Quipsly `CallParticipant` and mint a short-lived room-scoped provider token, but it reports that the server did not join the provider room, start recording, mutate Stripe, mutate Calendar, mutate media/storage, or expose provider secrets.
- Extended the native Capture decode/UI surface so the Provider key boundary card shows token scope, consent-before-recording, no-secret, and join-effects evidence.
- Validation: `node scripts/quipsly-livekit-join-token-contract.test.mjs` passed.
- Validation: `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs` passed.
- Validation: `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- Validation: `swiftc -parse apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift apps/mobile-capture/HighGroundCapture/HighGroundCapture/QuipslyMobileComponents.swift` passed.

## 2026-07-08 native LiveKit dependency wiring

- Linked the `HighGroundCapture` Xcode target to the LiveKit Swift package (`https://github.com/livekit/client-sdk-swift.git`) with product `LiveKit` and an up-to-next-major version rule from 2.9.0.
- This moves `ProviderRoomController` away from a permanent `canImport(LiveKit)` fallback and toward the actual production call path: Nest-issued join token -> native LiveKit room connect -> CallKit presentation -> recording remains separate.
- Added `apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh` so future runs use full Xcode through `DEVELOPER_DIR` without changing global `xcode-select`.
- Updated `docs/quipsly/ios-capture-app-store-readiness.md` to reflect that LiveKit is now intentionally part of the native target.
- Validation: `bash -n apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh` passed.
- Validation: `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs` passed.
- Validation: `swiftc -parse apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift apps/mobile-capture/HighGroundCapture/HighGroundCapture/QuipslyMobileComponents.swift apps/mobile-capture/HighGroundCapture/HighGroundCapture/ProviderRoomController.swift` passed.
- Validation: `apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json` passed.
- Toolchain note: global `xcode-select` points at Command Line Tools, so raw `xcodebuild` fails unless `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` is set. With `DEVELOPER_DIR` set, Xcode began resolving LiveKit, WebRTC, Swift Protobuf, and LiveKit UniFFI packages and checked out artifacts into `/tmp/quipsly-livekit-spm`, but the resolver did not return a final success line before being stopped after several minutes. Next proof is to rerun the validator and then build on simulator/device.

## 2026-07-08 LiveKit simulator build and media-vault stance

- Corrected a Swift getter regression in `HighGroundCapture/BridgeModels.swift` that surfaced once the app target compiled against the real LiveKit binary package.
- Re-ran `apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator`.
- Result: PASS. `HighGroundCapture` resolves `client-sdk-swift-xcframework.git @ 2.15.1`, links `LiveKit`, `LiveKitWebRTC`, and `RustLiveKitUniFFI`, and completes a simulator build.
- Next proof: join a Nest-issued room packet on simulator/device and verify room state, consent, recording evidence, upload handoff, and transcript handoff.
- Product/data stance reinforced: keep one primary media-vault bucket with intentional prefixes unless lifecycle/security policy later forces bucket separation. Bucket paths store bytes; Quipsly/Nest records own attachment, role, access, review, recording evidence, editor readiness, and publication truth.

## 2026-07-08 local/live auth proof blocker

- Live Nest endpoints such as `/api/mobile/capture/readiness` and `/api/auth/firebase-admin-preflight` returned Google Frontend `503 Service Unavailable`, so live room-packet proof needs Cloud Run inspection after local gcloud/ADC reauth.
- Local Quipsly web started successfully at `http://127.0.0.1:3000`, but `scripts/quipsly-mobile-capture-generated-auth-smoke.mjs --base-url=http://127.0.0.1:3000` was blocked by Firebase Admin ADC: local server could not verify Firebase ID tokens with application-default credentials.
- Required operator action before the next local/live auth proof: `gcloud auth login --update-adc --brief`, then `bash scripts/release/quipsly-gcloud-auth-check.sh`, then restart local Quipsly web.
- This is an environment/auth proof blocker, not a regression in the media-vault policy or the native LiveKit SDK linkage.

## 2026-07-08 - Local native capture auth + LiveKit join proof

Public-site incident was left alone per Charlie after billing was re-enabled and Cloud Run began showing capacity/billing recovery symptoms. Do not keep hammering the public domains unless the issue persists.

Local capture spine proof:
- Docker was already running `high-ground-db` on port 5432 with database `high_ground_studio`; `compose.studio.yml` wanted another Postgres on the same port, so the right move was to reuse `high-ground-db`, not start a second DB.
- Local Prisma client/schema sync completed against `postgresql://postgres:postgres@localhost:5432/high_ground_studio`.
- Firebase Admin preflight initially failed because ADC lacked the quota project for Identity Toolkit. Fixed with `gcloud auth application-default set-quota-project quipsly-reef`.
- Root `.env` contained LiveKit and media bucket values, but the stale local Next server on port 3000 did not inherit them. Stopped the stale Quipsly Next process and started an env-loaded Quipsly dev server on `http://127.0.0.1:3012`.
- Readiness on `3012` now reports LiveKit join configured and media vault bucket configured. Provider egress still lacks GCP egress credentials, which correctly keeps server recording start held.

Validation run:
- `DATABASE_URL='postgresql://postgres:postgres@localhost:5432/high_ground_studio' pnpm db:generate && DATABASE_URL='postgresql://postgres:postgres@localhost:5432/high_ground_studio' pnpm db:push` passed.
- `curl http://127.0.0.1:3012/api/auth/firebase-admin-preflight` returned `ok: true` with Firebase Admin reachable via ADC.
- `curl http://127.0.0.1:3012/api/mobile/capture/readiness` returned `liveKitJoinConfigured: true`, `mediaVaultConfigured: true`, and bucket `high-ground-odyssey-media`.
- `node scripts/quipsly-mobile-capture-generated-auth-smoke.mjs --base-url=http://127.0.0.1:3012` passed:
  - generated Firebase user created
  - app-owned Quipsly user/session exchanged
  - Home Nest created
  - free-tier onboarding active
  - disposable capture room seeded
  - LiveKit room join returned `canJoin: true`, `providerReadiness: livekit-ready`, short-lived token present
  - join did not start recording
  - provider recording does not start with join
  - 96 mobile capture contract checks passed
  - generated DB/Firebase artifacts cleaned up
- `node scripts/quipsly-media-vault-contract-smoke.mjs` passed.

Code changes made for this proof:
- `scripts/quipsly-mobile-capture-generated-auth-smoke.mjs` now surfaces safe failed-check summaries, seeds a disposable capture room for generated users, proves the real LiveKit join packet, and cleans up the disposable room.
- `scripts/quipsly-mobile-capture-contract-smoke.mjs` now matches the stronger current native UI wording for provider recording boundaries instead of stale copy.

Current truth:
- Firebase self-serve login and Quipsly app-owned onboarding are locally proven.
- LiveKit provider join token flow is locally proven when the server inherits root env.
- Provider/server recording egress is not yet enabled because egress GCP credentials are not configured. That is a held next step, not a broken join path.

## 2026-07-08 - Google Calendar ADC path and current blocker

Added explicit Application Default Credentials support to the coaching calendar adapter:
- `GOOGLE_CALENDAR_ALLOW_APPLICATION_DEFAULT=true` enables ADC as a real credential path.
- Dedicated service-account and refresh-token credentials remain preferred production paths.
- Metadata-token fallback remains for intentionally configured deployed runtimes.

Added repeatable smoke:
- `scripts/quipsly-coaching-calendar-generated-auth-smoke.mjs`
- It creates a disposable Firebase/Quipsly user, grants temporary `OWNER`, calls `/api/coaching/calendar/readiness?verify=1`, and cleans up the DB/Firebase artifacts.
- It prints no passwords, bearer tokens, session cookies, or database URLs.

Validation run against local `http://127.0.0.1:3012`:
- Server readiness recognized `credentialPath: application-default`.
- Generated staff verification reached Google Calendar but returned `google-403`.
- OAuth token introspection showed ADC belongs to `charlie@highgroundodyssey.com`, but current scopes are cloud/admin scopes only and do not include Calendar scopes.
- No external calendar event was created, updated, deleted, invited, or sent.

Next user/operator action:

```bash
gcloud auth application-default login --scopes="openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/appengine.admin,https://www.googleapis.com/auth/sqlservice.login,https://www.googleapis.com/auth/compute,https://www.googleapis.com/auth/accounts.reauth,https://www.googleapis.com/auth/calendar.events"
gcloud auth application-default set-quota-project quipsly-reef
```

After reauth, restart local Quipsly with:

```bash
set -a; source .env; set +a; DATABASE_URL='postgresql://postgres:postgres@localhost:5432/high_ground_studio' GOOGLE_CALENDAR_ALLOW_APPLICATION_DEFAULT='true' pnpm --filter quipsly dev --hostname 127.0.0.1 --port 3012
```

Then rerun:

```bash
set -a; source .env; set +a; DATABASE_URL='postgresql://postgres:postgres@localhost:5432/high_ground_studio' GOOGLE_CALENDAR_ALLOW_APPLICATION_DEFAULT='true' node scripts/quipsly-coaching-calendar-generated-auth-smoke.mjs --base-url=http://127.0.0.1:3012
```

If that still returns `google-403`, the remaining issue is calendar sharing/API access for `charlie@highgroundodyssey.com` or the eventual production service account, not the Quipsly route shape.

## 2026-07-08 - Runtime proof for Nest-owned session context

Strengthened the generated mobile capture auth smoke so it now proves the notes/goals/tasks seam that makes Capture useful before a call starts:

- creates a disposable Firebase user
- exchanges it for an app-owned Quipsly session
- creates a Home Nest/free-tier onboarding state
- seeds a disposable LiveKit-backed `CallRoom`
- proves the LiveKit join packet returns a short-lived token without starting recording
- saves session context to `/api/mobile/capture/sessions/context`
- reads the same context back from Nest
- verifies `sourceOfTruth: Quipsly CallRoom.metadataJson.captureSessionContext`
- verifies `externalSideEffects: false`
- verifies note/goals/tasks round-trip
- runs the existing mobile capture contract smoke
- deletes disposable room, Home Nest, membership, user, and Firebase account

Validation:

```bash
node --check scripts/quipsly-mobile-capture-generated-auth-smoke.mjs
node scripts/quipsly-mobile-capture-session-context-static-smoke.mjs
node scripts/quipsly-mobile-capture-generated-auth-smoke.mjs --base-url=http://127.0.0.1:3012
```

Observed runtime proof summary:

```json
{
  "sessionContext": {
    "saved": true,
    "loaded": true,
    "sourceOfTruth": "Quipsly CallRoom.metadataJson.captureSessionContext",
    "externalSideEffects": false,
    "goalCount": 2,
    "taskCount": 2,
    "updatedAtPresent": true
  }
}
```

Current meaning:
- Native Capture is no longer only a recorder/join surface in the proof path. It now has a verified shared prep/context lane for notes, goals, and tasks.
- This still does not send calendar invites, mutate Stripe, start provider recording, upload media, or publish anything.

## 2026-07-08 native CallKit room boundary

- Added a visible `CallKitBoundaryCard` to the iPhone live-room panel.
- Product boundary preserved: CallKit is native iPhone call presentation for a Quipsly-owned LiveKit room. It is not a phone or FaceTime call, does not start recording, and does not create recording evidence.
- Nest remains source of truth for room lifecycle, participant consent, recording receipts, transcript jobs, and packets.
- Static App Store smoke now guards the new UI copy and accessibility identifier so future refactors cannot quietly blur the join-vs-record boundary.

Validation for native CallKit room boundary:

- `node --check scripts/quipsly-ios-capture-app-store-static-smoke.mjs` passed.
- `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs` passed.
- `node --check scripts/quipsly-mobile-capture-contract-smoke.mjs` passed.
- `apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator` passed with LiveKit `client-sdk-swift-xcframework.git @ 2.15.1` linked and HighGroundCapture simulator build succeeded.

Next proof remains device/simulator runtime join with a Nest-issued room packet. Calendar provider verification still needs ADC Calendar scope or a dedicated calendar credential; it is not blocking this CallKit/UI proof.

## 2026-07-08 native Capture runtime UI smoke seam

- Added a DEBUG-only `QUIPSLY_API_BASE_URL` launch-environment override to the shared native Nest URL normalizer. This lets simulator/UI tests target local Nest without introducing an auth bypass.
- Added stable accessibility identifiers for the capture runtime spine: `RecorderControlBoard`, `RoomSpinePanel`, and `ProviderRoomView`.
- Added `CaptureRoomRuntimeSmokeTests`, a focused XCTest UI smoke that signs in through the real native Firebase screen when needed, opens the Record tab, and proves the Nest meeting spine, provider room controls, and CallKit boundary are visible.
- Added `apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh` so the runtime proof has one repeatable entrypoint instead of a copy/paste-only `xcodebuild` spell.
- Static smokes now guard the DEBUG-only backend override and the runtime landmarks.

Runtime command shape:

```bash
QUIPSLY_CAPTURE_UI_TEST_EMAIL="reviewer@example.com" \
QUIPSLY_CAPTURE_UI_TEST_PASSWORD="..." \
QUIPSLY_CAPTURE_UI_TEST_BASE_URL="http://127.0.0.1:3012" \
apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh
```

Current meaning: the app has a real runtime proof seam for the iPhone capture-room surface. It still depends on a real test account and at least one capture session; if either is missing, the correct fix is seeding that test state, not faking UI success.

## 2026-07-08 generated-user runtime UI proof mode

- Extended `scripts/quipsly-mobile-capture-generated-auth-smoke.mjs` with `--run-runtime-ui-smoke=1`.
- The generated-auth smoke can now create a disposable Firebase user, exchange it into Quipsly, seed a LiveKit-backed `CallRoom`, prove the join/context/mobile contracts, run the real native iOS runtime UI smoke with generated credentials, and then clean up.
- The generated password, Firebase token, session cookie, database URL, and bearer token are not printed.
- This is the preferred local end-to-end proof once Nest is running locally:

```bash
node scripts/quipsly-mobile-capture-generated-auth-smoke.mjs \
  --base-url=http://127.0.0.1:3012 \
  --run-runtime-ui-smoke=1
```

Current meaning: the Capture proof can move from static contract and simulator build into real native UI runtime evidence without maintaining a long-lived fake reviewer account. Long-lived reviewer accounts remain useful for App Review/TestFlight, but generated runtime proof is better for everyday development.

Runtime proof run after implementation:

```json
{
  "ok": true,
  "baseUrl": "http://127.0.0.1:3012",
  "roomJoin": {
    "canJoin": true,
    "provider": "livekit",
    "providerReadiness": "livekit-ready",
    "tokenReturned": true,
    "recordingStarted": false,
    "providerRecordingStartsWithJoin": false,
    "recordingConsentGranted": true
  },
  "sessionContext": {
    "saved": true,
    "loaded": true,
    "sourceOfTruth": "Quipsly CallRoom.metadataJson.captureSessionContext",
    "externalSideEffects": false,
    "goalCount": 2,
    "taskCount": 2
  },
  "runtimeUISmoke": {
    "requested": true,
    "passed": true
  },
  "mobileCaptureContract": {
    "authenticated": true,
    "pass": 96,
    "authenticatedCheckCount": 12
  },
  "cleanup": {
    "deletedCallRooms": 1,
    "deletedHomeProjects": 1,
    "deletedMemberships": 1,
    "deletedUsers": 1,
    "deletedFirebaseUser": true,
    "cleanupWarning": null
  }
}
```

Meaning: local Nest, Firebase Admin, Firebase client signup, app-owned Quipsly session exchange, Home Nest/free tier onboarding, LiveKit join-token minting, session context sync, authenticated mobile contracts, real iOS UI smoke, and cleanup were all proven in one command. The generated password, Firebase token, session cookie, database URL, and bearer token were not printed.
