# Coordinated recording receipt outbox

Date: 2026-08-25
Status: protected iPhone outbox implemented and operated; physical outage delivery remains deferred

## Outcome

Quipsly Capture no longer says a failed coordinated recording-status receipt
will retry without retaining any work to retry. Every iPhone endpoint transition
(`OBSERVED`, `STARTED`, `START_FAILED`, `STOPPING`, `STOPPED`, or
`STOP_FAILED`) is now written to a protected installation-scoped outbox before
network delivery.

The outbox preserves the original idempotency identity across process death,
retries automatically after a retryable failure, resumes during ordinary app
load, and flushes before each room-command poll. Pending receipts do not expire.
Acknowledged or terminally rejected diagnostic rows are retained for 24 hours.

Receipt identities and visible rows are partitioned by the active opaque Quipsly
account ID. An account switch cannot expose or replay another person's endpoint
status. Terminal protocol errors are retained as rejected diagnostics rather
than retried forever. Network, authentication, rate-limit, unknown-endpoint,
and server failures remain pending.

## Truth boundary

This outbox improves collaboration status only. It cannot create recording
bytes, promote a local take, prove an upload, verify a `RecordingAsset`, or
delete media. The local capture ledger and immutable source remain authoritative
even when Nest accepts, delays, or rejects an endpoint status.

## Automated and operated evidence

- Capture App Store static smoke: **1,254/1,254 passed**.
- Capture compiled as an unsigned universal iOS Simulator binary with `arm64`
  and `x86_64` slices.
- `CaptureExperienceUITests.testRecordingReceiptOutboxSurvivesRelaunchAndStaysAccountPartitioned`
  passed **1/1** on iPhone 17 Pro / iOS 26.3.1 Simulator with parallel clones
  disabled. The test staged one genuinely random pending receipt through the
  shipping protected store, relaunched under the same account, switched to a
  second account, and switched back. Result:
  `/private/tmp/quipsly-recording-receipt-outbox-20260825.xcresult`.

## Deferred physical validation

During a real two-account recording, interrupt one iPhone's network before
`STARTED`, force-quit after the local source begins, relaunch offline, then
restore the same account and network. Confirm the original receipt identity is
replayed idempotently, Nest changes the exact endpoint from getting ready to
recording, no duplicate room `START` exists, and the retained source uploads,
verifies, and plays. Repeat across `STOPPING` and `STOPPED`, then switch accounts
while a receipt is pending and prove the other account cannot see or deliver it.
