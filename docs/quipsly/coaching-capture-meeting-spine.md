# Quipsly Coaching Capture Meeting Spine

Date: 2026-07-04

## Decision

Quipsly should use LiveKit as the real-time meeting spine for coaching, podcast, and interview sessions, with iOS segmented local recording as the resilient fallback and evidence source.

This avoids building a custom WebRTC stack in Swift while preserving Quipsly's product rule: Quipsly owns session, consent, recording, transcript, packet, action-item, and receipt truth. LiveKit provides real-time room transport and optional provider recording evidence.

## Current implementation truth

- Nest owns the `CallRoom`, participants, consent, recording state, upload evidence, transcript jobs, and packet state.
- `POST /api/mobile/capture/rooms/join` returns a short-lived provider join packet when a room is LiveKit-backed and server credentials are configured.
- The join route returns a calm local-fallback packet when LiveKit is not configured or the room has no provider ID.
- The iOS app now has a `RoomSpinePanel` that shows provider readiness, consent state, local capture state, and room status.
- The iOS app now has a `ProviderRoomController` and `ProviderRoomView` seam for native join/leave/mute state.
- The `HighGroundCapture` Xcode target now links the binary LiveKit package `https://github.com/livekit/client-sdk-swift-xcframework.git` exactly at `2.15.1`.
- `apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator` now resolves the LiveKit package and completes a simulator build with `LiveKit`, `LiveKitWebRTC`, and `RustLiveKitUniFFI` linked.
- Token readiness, SDK linkage, and actual room join proof are still separate states. The next proof is joining a Nest-issued room packet on simulator/device.

## Provider recording / egress boundary

Joining a provider room is not recording. The join packet now makes that explicit with three separate contract sections:

- `providerJoin`: whether the user can connect to the meeting provider.
- `recordingBoundary`: consent, visibility, and local/provider recording rules.
- `providerRecording`: the server/provider recording state. It starts as `not-started`, requires an explicit visible Quipsly start action, requires participant consent, and needs provider receipt evidence before transcripts or packets should claim provider-recorded truth.

This keeps LiveKit useful as a meeting spine without letting room transport silently become the source of recording truth. Local segmented recording remains the source-safe fallback until Nest verifies upload. Provider egress can become a higher-quality or redundant recording source only after a server-side receipt exists.

The iOS provider room surface now shows this boundary directly. It can display the provider recording state and disabled start seam, but it does not start LiveKit egress until a Nest-owned provider recording route and receipt ledger exist.

`POST /api/mobile/capture/rooms/provider-recording` currently supports only `PREPARE_RECEIPT_SLOT`. This creates or reuses an app-owned `RecordingAsset` receipt slot using `SERVER_MIX` + `HELD`, after explicit consent exists for every non-observer participant. It does not start LiveKit egress, create provider media, or claim transcript readiness.

Receipt slots are intentionally filtered out of mobile `recordingCount`, latest-recording selection, and transcript creation. They remain visible as provider-recording evidence, but a verified/uploaded cloud object must be attached before the asset can become transcript media.

## Target native meeting flow

1. User signs in to Quipsly on iOS.
2. User chooses a Quipsly session.
3. iOS calls `/api/mobile/capture/rooms/join`.
4. If the response can join:
   - iOS connects to LiveKit using the server URL and short-lived participant token.
   - iOS shows visible room state: connecting, joined, muted, speaking, disconnected.
   - iOS still keeps local recording controls separate and consent-gated.
5. If the response cannot join:
   - iOS shows the provider reason.
   - iOS keeps local recording fallback available only after explicit consent.
6. Quipsly records room state transitions through `/api/mobile/capture/rooms/state`.
7. Upload, transcript, packet, and action-item creation proceed from verified recording evidence.

## Why not custom WebRTC first

Custom peer signaling already exists in older Quipsly surfaces, but a production iOS call app needs reconnects, audio routing, permissions, network adaptation, background behavior, and device edge cases. LiveKit's Swift SDK and SwiftUI components are the practical native path. Quipsly's differentiation should be the capture, consent, transcript, annotation, coaching packet, and reuse workflow around the call, not hand-maintaining low-level WebRTC.

## Implementation steps

1. Keep the existing Nest join route as the server-owned token seam.
2. Keep LiveKit dependency validation bounded and repeatable:
   - `apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh`;
   - `apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator`.
3. Evolve `ProviderRoomController` from linked SDK build proof to real room proof:
   - connect with `serverUrl` and `participantToken`;
   - publish microphone audio only when the user joins;
   - expose connection state, mute state, local participant state, and remote participant count;
   - never start Quipsly local recording automatically.
4. Keep the existing `ProviderRoomView` below `RoomSpinePanel`:
   - Join room;
   - Leave room;
   - Mute/unmute;
   - Visible provider status;
   - Clear fallback message.
5. Keep `Start` local recording locked behind granted Quipsly consent.
6. Add a device smoke script/checklist for: sign in, select session, prepare room, join provider, mute/unmute, grant consent, start local recording, stop, upload, transcript, packet.

## App Store truth boundary

- The app must clearly disclose microphone use and visible recording state.
- Joining a provider room is not the same as recording.
- Recording starts only from explicit Quipsly consent and visible user action.
- Local recording fallback should preserve the source on device until upload is verified.
- Account deletion initiation and privacy routes must remain visible from the app.

## Sources

- LiveKit connecting docs: https://docs.livekit.io/intro/basics/connect/
- LiveKit Swift binary package used by the app target: https://github.com/livekit/client-sdk-swift-xcframework
- LiveKit egress overview: https://docs.livekit.io/transport/media/ingress-egress/egress/
- Apple privacy manifest files: https://developer.apple.com/documentation/bundleresources/privacy_manifest_files

## 2026-07-09 live reviewer and native runtime proof

The capture reviewer password for `codex@dev.test` is stored in macOS Keychain under:

- service: `quipsly-capture-reviewer`
- account: `codex@dev.test`

Use it without printing secrets:

```bash
QUIPSLY_CAPTURE_UI_TEST_BASE_URL=https://nest.quipsly.com \
QUIPSLY_CAPTURE_UI_TEST_EMAIL=codex@dev.test \
QUIPSLY_CAPTURE_UI_TEST_PASSWORD="$(security find-generic-password -s quipsly-capture-reviewer -a codex@dev.test -w)" \
bash apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh
```

Current verified state:

- `bash scripts/quipsly-capture-live-reviewer-proof.sh` passes against `https://nest.quipsly.com` using the Keychain-backed reviewer credential.
- The live proof created session `cmrd9cuv8000x01s60l0glv1t` for `codex@dev.test` and read it back through the authenticated mobile sessions endpoint.
- The created session is Quipsly-owned, LiveKit-ready, and consent-gated: room, participant, and requested consent records exist; `canRecordNow=false`; `providerCanJoin=true`; `lifecycleStage=consent-needed`.
- The live proof explicitly confirms no recording started, no provider join happened, no provider token was minted by session creation, no Calendar mutation occurred, no Stripe mutation occurred, and no external invite was sent.
- `apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh` passes against the real iOS simulator path. It signs in through native Firebase email/password, reaches the signed-in Record tab, and verifies the Record surface exposes the Nest-owned room spine, provider room controls, CallKit boundary copy, and provider readiness/token diagnostic cards.
- `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs --json` passes 404 static App Store/capture readiness checks.
- `QUIPSLY_MOBILE_CAPTURE_SOURCE_ONLY=1 node scripts/quipsly-mobile-capture-contract-smoke.mjs --json` passes 46 source-contract checks.

Implementation notes:

- `AuthManager` now respects `QUIPSLY_API_BASE_URL` from the native app runtime environment before falling back to bundled config and `https://nest.quipsly.com`.
- The runtime UI smoke writes a short-lived credential packet and launches the app with `--quipsly-capture-runtime-smoke`; the app uses that path only for real smoke automation and still performs real Firebase/Nest sign-in. This is not an auth bypass.
- The Record tab has an explicit `RecorderControlBoard` accessibility identifier, and the provider/CallKit boundary cards preserve their accessibility children so Codex and UI tests can inspect the same truth a human sees.

Next strongest proof:

1. Run the explicit consent and room-readiness proof:
   `bash scripts/quipsly-capture-consent-room-live-proof.sh`.
   This grants app-owned reviewer consent, inspects the room diagnostics without side effects, prepares a short-lived LiveKit join token, redacts token details, and confirms no recording, provider join, Stripe mutation, Calendar mutation, invite, media mutation, or provider recording starts.
2. Run the same runtime smoke on a physical iPhone/TestFlight build.
3. Add a no-secret screenshot or structured UI state export for the signed-in Record surface.
4. Exercise the visible join room -> local recording start/stop -> upload/transcript packet path with explicit human approval before any real provider recording or external account mutation.
