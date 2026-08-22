# Coordinated recording rollout

Date: 2026-08-22  
Status: implementation complete; production rollout pending

## User contract

- The coach or host sees one conventional **Record** and **Stop recording** control.
- A participant already in the call and ready when Record is pressed starts one
  protected local source on that endpoint.
- A participant who enters an already-recording call sees **Join recording**.
  Entering the room never silently starts capture.
- Every participant can stop their own local recorder. The host can stop the
  room even if the host endpoint failed to start.
- A Start/Stop directive is intent, an endpoint acknowledgment is device state,
  and neither is proof of media. Canonical capture receipts, verified bytes, and
  RecordingAsset evidence remain the source of truth.

## Release order

1. Apply `20260822223000_add_call_recording_directives` to the target database.
2. Deploy Nest with the private recording-directive route and the mobile
   `canControlRecording` projection.
3. Smoke two authenticated browser endpoints in one disposable Session:
   consent, join, Record, two STARTED acknowledgments, Stop, two STOPPED
   acknowledgments, retained upload, checksum verification, and playback.
4. Ship the matching Quipsly Capture build to internal TestFlight.
5. Repeat the disposable Session with one browser and one physical iPhone.
6. Release to the external coaching group only after the release ledger links
   the exact Nest revision, migration, Capture build, room ID, capture group,
   source identities, and playback result.

## Compatibility and rollback

- The migration is additive. Existing Capture builds do not read or write the
  new tables and retain their current manual local controls.
- The Nest route must not deploy before the migration.
- If coordination is unhealthy, roll back the Nest revision and hold the new
  Capture build. Do not drop the additive tables during an incident; retained
  directives and receipts are useful audit evidence and contain no media bytes.
- Never reinterpret a directive or acknowledgment as a successful recording
  during rollback, recovery, analytics, or transcript processing.

## Evidence still required

- Production migration receipt and deploy revision.
- Deployed authenticated browser-to-browser runtime result. The local fresh-user
  product flight passed on 2026-08-22 at source `5b0558fa`: two rendered
  participants, one host Record/Stop, four endpoint directive receipts, two
  independently verified participant masters, 25.772 seconds of source
  overlap, protected playback, source-bound transcription, light editing,
  recipient playback, release, and revoke. Its machine-readable receipt is
  `artifacts/coaching-acceptance/68827737/fresh-coaching-flight-receipt.json`.
- Physical iPhone plus browser runtime result, including late join.
- Background/interruption recovery and final upload completion.
- Cross-account negative read proving one participant cannot inspect another
  participant's endpoint installation receipts.
