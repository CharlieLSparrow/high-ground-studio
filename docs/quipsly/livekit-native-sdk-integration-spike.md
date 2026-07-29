# LiveKit native SDK integration spike

Date: 2026-07-05
Updated: 2026-07-08
Status: active app-target decision with artifact/build proof still required

## Why this exists

Quipsly Capture needs real in-app meeting behavior, not a fake `Join room` button. The server has a safe join-token seam at `/api/mobile/capture/rooms/join`; the iOS app has `ProviderRoomController`, which can join, mute, unmute, and leave when `canImport(LiveKit)` is true.

The missing piece is making native LiveKit dependency resolution repeatable enough that App Store/TestFlight builds do not hang on binary artifact acquisition.

## SDK paths researched

- LiveKit source SDK: `https://github.com/livekit/client-sdk-swift`
- LiveKit binary app-target package: `https://github.com/livekit/client-sdk-swift-xcframework`
- Current release line checked: `2.15.1`
- Swift package product: `LiveKit`

## Earlier source-SDK result

An earlier spike pointed the Xcode target at `https://github.com/livekit/client-sdk-swift.git`. The project reference was syntactically valid and `Package.resolved` was generated, but Xcode stalled while resolving the package graph and binary artifact state.

Observed graph included:

- `client-sdk-swift` `2.15.1`
- `webrtc-xcframework` `144.7559.10`
- `livekit-uniffi-xcframework` `0.0.6`
- `swift-protobuf` `1.38.1`

That path made the app target depend on a broader source-package graph than necessary for our immediate app build.

## Current decision

Use the dedicated binary package for the iOS app target:

```text
https://github.com/livekit/client-sdk-swift-xcframework.git @ 2.15.1
```

The binary package exposes product `LiveKit` and binary targets:

- `LiveKit.xcframework.zip`
- `LiveKitWebRTC.xcframework.zip`
- `RustLiveKitUniFFI.xcframework.zip`

This is the better app-target seam because it links the binary SDK surface directly and avoids pulling the broader source SDK dependency graph into the main app build.

## Current safe state

- `HighGroundCapture` points at the exact-pinned binary xcframework package.
- `ProviderRoomController` still keeps conditional LiveKit support so the UI can report provider-media readiness honestly until the build proof is complete.
- Local consented recording remains available as a resilient fallback, not as the production replacement for Quipsly-owned rooms.
- Server-side join tokens remain short-lived, room-scoped, and separate from provider recording/egress.

## Required proof before claiming provider-media ready

- `scripts/quipsly-livekit-artifact-doctor.sh` verifies all three binary artifact URLs and cached downloads.
- `apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh` completes `xcodebuild -resolvePackageDependencies` with bounded timeout.
- `apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator` completes with `CODE_SIGNING_ALLOWED=NO`.
- `ProviderRoomController` compiles the real LiveKit path, not only the fallback path.
- A signed-in reviewer account can prepare room join, connect, mute/unmute, leave, and still record only after explicit Quipsly consent.
- Provider recording controls show separate not-started, starting, recording, stopped, and failed states with server-side receipt evidence.

## Commands

Check artifact headers and cache status:

```bash
scripts/quipsly-livekit-artifact-doctor.sh
```

Download or refresh the binary artifact cache:

```bash
DOWNLOAD=1 scripts/quipsly-livekit-artifact-doctor.sh
```

Resolve the exact-pinned app-target package:

```bash
apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh
```

Run the simulator build proof:

```bash
apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator
```

## Product boundaries

Provider room join and provider recording are separate App Review truths. Joining a LiveKit room must not start recording. Provider recording/egress needs explicit consent, visible start action, visible recording state, and server-side receipt evidence before Quipsly treats it as transcript-ready.

Do not point the app target back at the source SDK repo unless there is a documented reason. The current app-target package path is the binary xcframework repo.
