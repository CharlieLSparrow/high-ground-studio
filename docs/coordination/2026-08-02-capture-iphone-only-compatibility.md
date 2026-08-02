# Quipsly Capture iPhone-only compatibility checkpoint

Date: 2026-08-02

## Outcome

Quipsly Capture's committed distribution source now explicitly opts out of
Designed-for-iPhone compatibility on both Apple silicon Mac and Apple Vision
Pro. The prior project already targeted only `UIDeviceFamily = [1]`, supported
only `iphoneos`/`iphonesimulator`, disabled Mac Catalyst, and disabled
Designed-for-iPhone on Mac. It did not override Xcode's resolved
`SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD = YES` default.

The app and Share Extension Debug/Release configurations now set:

```text
TARGETED_DEVICE_FAMILY = 1
SUPPORTED_PLATFORMS = iphoneos iphonesimulator
SUPPORTS_MACCATALYST = NO
SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = NO
SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD = NO
```

The source verifier reads the resolved Release build settings for both
distribution targets. The static App Store gate requires all source controls,
and the signed-artifact verifier now proves `UIDeviceFamily = [1]` and
`CFBundleSupportedPlatforms = ["iPhoneOS"]` from both the archive and IPA.

## Build 26 provider truth

The exact signed Build 26 IPA already proves:

- app `UIDeviceFamily = [1]`;
- app `CFBundleSupportedPlatforms = ["iPhoneOS"]`;
- App Store distribution signatures and profiles; and
- unchanged IPA SHA-256
  `ffc30e329e4f872bc384f8f4d02ed88ee098bf8921cd4e1a9f1d1131766264f3`.

App Store Connect's supported build-bundle include independently reports:

- provider build `0ef2cf7a-43d1-49bb-800f-c08239730b96`, Build 26;
- app bundle `com.highgroundodyssey.HighGroundCapture`;
- architecture and required capability `arm64`; and
- `isIosBuildMacAppStoreCompatible = true`.

That final value is Apple's computed ability to run the iOS binary, not the
app-level Mac Store availability choice. The supported public API exposes the
computed value but not either app-level opt-out toggle. The auditor therefore
records the provider result and preserves one exact manual blocker instead of
claiming the source build setting changed store availability.

The redacted mode-0600 receipt is:

`/Volumes/My Passport/Quipsly QA Artifacts/Build 26/App Store Connect/submission-readiness-20260802T153000Z-compatibility.json`

## Required provider operation

App Store Connect authentication had expired in the available browser session,
so no UI mutation was attempted. An Account Holder, Admin, or App Manager must:

1. Open Quipsly Capture in App Store Connect.
2. Open **Pricing and Availability**.
3. Under **iPhone and iPad Apps on Apple Silicon Mac**, deselect **Make this
   app available**, then save.
4. Under **iPhone and iPad Apps on Apple Vision Pro**, deselect **Make this app
   available on Apple Vision Pro**, then save.
5. Reload the page and capture an independent readback of both unchecked
   controls.

Apple documents the app-level [Apple silicon Mac
opt-out](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-of-iphone-and-ipad-apps-on-macs-with-apple-silicon)
and [Apple Vision Pro
opt-out](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-of-iphone-and-ipad-apps-on-apple-vision-pro).

Build 26 remains the public TestFlight target. The XR source correction is
queued for the next spaced release; it did not create or upload a new build.

## Verification

- App Store metadata and submission-auditor coverage: 12/12 passed;
- Capture App Store static contract: 1,009/1,009 passed;
- resolved Release app and extension settings: iPhone-only with Mac/XR `NO`;
- source release verifier plus Nest evidence contract: passed;
- exact signed Build 26 archive and IPA verification: passed;
- fresh credentialed App Store readback: expected readiness exit 2 with the
  exact compatibility blocker; and
- no build upload, App Store mutation, release, submission, or cloud cost.
