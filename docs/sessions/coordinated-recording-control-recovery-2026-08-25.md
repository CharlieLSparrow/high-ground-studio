# Coordinated recording control recovery

Date: 2026-08-25
Status: authority drift repaired and participant waiting UX operated; physical two-endpoint recording remains deferred

## Outcome

Quipsly now presents one conventional recording model across Capture and Nest:

- the coach, host, producer, Session creator, staff member, or authorized Nest owner/editor controls the room-wide **Record** and **Stop** intent;
- every participant still owns the consent, hardware permission, and retained source on their exact endpoint;
- a ready participant who does not control the room sees a positive **Ready** state rather than a disabled Record button that looks broken;
- the ready state is shown only after the exact iPhone has current Session consent and the required iOS microphone/camera access;
- a late endpoint or a recorder that failed to start receives an explicit local start/retry action against the existing durable START; and
- a coach whose own endpoint failed now retries that same durable START instead of issuing a second room command that must conflict.

The recording directive remains coordination intent. Endpoint receipts, the append-only local ledger, verified upload/finalization evidence, and the immutable RecordingAsset remain the evidence that media actually exists.

## Authority convergence

The browser consent/readiness endpoint previously computed controller status from direct Session roles only, while the recording-command endpoint correctly reused the canonical Session invitation/control boundary and therefore also recognized authorized project owners/editors. The consent response now falls back to that same canonical boundary. Browser readiness, iPhone session projection, and the command endpoint can no longer disagree for that role class.

## Automated and operated evidence

- Capture App Store static smoke: **1,243/1,243 passed**.
- Focused consent/readiness route tests: **5/5 passed**, including project owner/editor control projection.
- Strict Quipsly TypeScript (`next typegen` plus non-incremental `tsc`): passed.
- Capture compiles as an unsigned universal iOS Simulator binary with `arm64` and `x86_64` slices.
- `CaptureExperienceUITests.testReadyParticipantSeesWaitingStatusInsteadOfDisabledRecord` passed **1/1** on iPhone 17 Pro / iOS 26.3.1 Simulator. It operated the Record workspace, found the positive microphone-ready status, and proved the non-controller did not receive a disabled start button. Result: `/private/tmp/quipsly-recording-control-waiting-host-20260825.xcresult`.

## Deferred validation, not inferred completion

In one real two-account Session, confirm the coach has the single Record action; the client becomes Ready only after current consent and device access; START reaches both exact endpoints; both endpoint statuses advance from getting ready to recording; one endpoint failure exposes retry without issuing another room START; Stop safely closes both local sources; and both sources upload, verify, and play from the Session. Repeat with browser/iPhone combinations, a late join, a project-owner controller, permission denial/recovery, and a temporarily offline endpoint. Capture directive, endpoint receipt, local capture, upload/finalization, RecordingAsset, and playback identities. Simulator UI and server tests do not prove physical media, cross-device timing, audibility, or human comprehension.
