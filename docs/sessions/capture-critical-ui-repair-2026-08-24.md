# Quipsly Capture critical UI repair — 2026-08-24

## Outcome

The deterministic iPhone critical lane executes all 14 selected scenarios and
passes on the iPhone 17 Pro simulator running iOS 26.3.1.

The final Apple result bundle reported:

- total: 14
- passed: 14
- failed: 0
- skipped: 0
- result: Passed

The run used the shared `HighGroundCapture` scheme, serialized UI execution,
and the selectors emitted by
`scripts/release/quipsly-capture-ui-test-plan.mjs --suite=critical --format=lines`.

## Repairs

1. Updated the critical planner to the shipping standard federated-login test.
   The old selector referenced a renamed test and prevented the lane from
   launching.
2. Gave the persistent recorder dock distinct accessibility identifiers. The
   full recorder remains the canonical `CaptureStartButton` /
   `CaptureStopButton`; compact dock actions now use
   `CapturePersistentRecorder…` identifiers. This removes ambiguous controls
   with different labels and enabled states from the accessibility tree.
3. Allowed the dock status and detail to wrap instead of enforcing one clipped
   line. The primary Record surface now passes the hit-region, description, and
   text-clipping audit.
4. Corrected the Watch staging scenario to explicitly choose the podcast
   fixture. The default preview session is intentionally Coaching and must not
   expose episode-only Watch controls.

## Evidence progression

- Initial trustworthy full run: 14 executed, 9 passed, 5 failed.
- Recorder identity focus: 3 executed, 3 passed.
- Watch plus accessibility focus: 2 executed, 2 passed.
- Final critical run: 14 executed, 14 passed.
- UI planner contract tests: 5 passed.
- Capture/App Store static smoke: 1,177 checks passed.
- Simulator build with LiveKit 2.15.1, Google Sign-In, and the Share extension:
  passed before the UI lane; the final UI runs rebuilt the modified sources.

## Proof boundary

This is deterministic simulator and static release evidence. It does not replace
an authenticated physical-device call, source recording, upload/readback, or
TestFlight smoke. The authenticated simulator smoke was independently deferred
because macOS Keychain access awaited interactive approval; it did not expose an
app failure.
