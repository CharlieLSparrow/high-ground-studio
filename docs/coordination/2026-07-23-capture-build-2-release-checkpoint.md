# Capture build 2 release checkpoint

**Date:** 2026-07-23
**Status:** Local signing/export ready; upload and physical-device proof remain open

## Current distribution truth

Quipsly Capture `1.0 (1)` was uploaded successfully to App Store Connect on 2026-07-21. The local archive receipt records:

- App Store Connect app ID `6780995957`
- upload event state `success`
- uploaded build number `1`
- archive distribution state `Uploaded to Apple`

That receipt proves upload acceptance only. Current App Store Connect processing state, tester availability, TestFlight installation, and physical-device behavior are not yet verified. The CLI cannot query build status without App Store Connect JWT or app-password credentials, and the active browser lane is not available for that readback.

The Xcode project now uses build number `2` for both the app and Share Capture extension so the current code can be packaged without colliding with uploaded build `1`.

## July 23 local archive/export proof

Before the build-number increment, the current source produced:

- generic-device archive `/tmp/quipsly-capture-archive.JzU3fp/QuipslyCapture.xcarchive`;
- App Store export `/tmp/quipsly-capture-export.GftJHW/HighGroundCapture.ipa`;
- valid strict nested code signatures;
- Apple Distribution signing for team `585GUXMY5M`;
- App Store provisioning profiles for the app and embedded extension;
- bundle identifier `com.highgroundodyssey.HighGroundCapture`;
- SHA-256 `c943270a4fc3df2b050a038f9a038fdb137c6787a12890074535fc3752d6a9bd`.

The archive contains the app privacy manifest plus LiveKit, LiveKitWebRTC, and RustLiveKitUniFFI privacy manifests. The app manifest declares no tracking, the expected linked app-functionality data categories, and required reasons for user defaults, file timestamps, and disk space.

LiveKitWebRTC and RustLiveKitUniFFI still do not ship matching dSYMs. Apple accepted build 1 despite that warning, but third-party crash symbolication remains incomplete.

After incrementing both targets, the actual build 2 candidate also passed:

- 622/622 App Store static checks;
- signed generic-device archive `/tmp/QuipslyCapture-1.0.2-20260723.xcarchive`;
- App Store export `/tmp/QuipslyCapture-AppStoreExport-1.0.2-20260723/HighGroundCapture.ipa`;
- strict nested signature verification;
- matching app and extension versions `1.0 (2)`;
- Apple Distribution plus App Store provisioning;
- 17,193,479-byte IPA;
- SHA-256 `b67b6340e0ec503046ce72efd4b15567ed83235ca0fb38829f79df0fd3819f0c`.

Build 2 was not uploaded. That avoids representing a candidate as usable while its production Nest dependency is unavailable and preserves build 1’s provider receipt for direct status inspection.

## Physical-device gate

Xcode 26.2 and macOS CoreDevice currently list only unavailable iPads `Layla` and `Morbo`. USB inventory contains no iPhone or Apple Mobile Device. This blocks local install, microphone/audio-route proof, interruption/background/force-quit recovery, and TestFlight-installed smoke before app code or signing is reached.

Loop back when the unlocked phone is connected with a data-capable cable and has accepted **Trust This Computer**. The first required readback is:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun devicectl list devices
```

The iPhone must appear as `available` before device launch is attempted.

## Separate production gate

Google Cloud billing remains disabled, so production Nest is unavailable independently of Apple distribution. Do not upload build 2 as a usable tester candidate until production Nest and its reviewer session are reachable again, unless the build is explicitly labeled as a non-functional signing-only artifact.

## Platform-target decision

The compiler currently emits an iOS 17 minimum target while the active platform policy calls for iOS 26. Do not change the minimum blindly before the intended physical iPhone OS version is visible. Once the device is available, either:

1. migrate app, extension, docs, and tests to iOS 26 and prove the real device; or
2. record a concrete supported-device/customer exception to the latest-only policy.
