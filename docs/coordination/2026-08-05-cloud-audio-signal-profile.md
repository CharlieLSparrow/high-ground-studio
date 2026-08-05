# Generation-bound cloud audio signal profile

Date: 2026-08-05
Source: `b3d257d85a78231a87131dcda3a73dc142ae5c0d`
Status: committed worker and credentialed GCS fixture qualified; deployment and physical-take acceptance remain

## Outcome

Nest can now request the same complete-decode waveform and broad-frequency
evidence for a protected GCS recording that it already used for local media.
The worker reads one exact object generation, verifies its bytes against the
job receipt, analyzes without modifying media, and writes a create-once JSON
result. Nest independently rechecks the source before making the evidence
visible in the editor.

Provider room recording is not a dependency. Device-local high-quality sources
remain authoritative; optional provider media may still be attached later as a
witness source for recovery or comparison.

## Durable boundaries

- generation-bound `gcs://...?...generation=` source locator;
- SHA-256, byte length, content type, asset, project, and analyzer binding;
- create-once manifest, queue, result, and terminal dead letter;
- expiring retry lease with generation preconditions;
- full decoded waveform capped at 1,200 windows;
- six-band frequency overview capped at 1,200 windows;
- no derivative media and no source mutation;
- explicit retained `blocked` UI when processor execution is not configured;
- DB completion only after current-source reinspection and result validation.

The shared Cloud Run job now attempts capture proxy, Episode proxy, alignment,
mastery, and signal profiling as isolated sequential lanes. A lane failure is
reported and makes the execution retryable, but cannot prevent later lanes
from servicing their queues.

## Proof

The real `high-ground-odyssey-media` fixture produced:

- source duration: 8 seconds;
- waveform windows: 80;
- frequency windows: 80;
- bands: rumble, warmth, body, speech, presence, air;
- full decode: true;
- source hash unchanged after analysis: true;
- create-once replay: true;
- provider recording required: false.

The fixture deleted every exact source, manifest, queue, result, and dead-letter
name it owned. A separate `gcloud storage ls --all-versions` readback matched no
remaining objects under either fixture prefix.

## Remaining release gates

1. Build and deploy the exact committed Nest and media-processor contexts after
   the cost-aware remote-build interval.
2. Read back immutable image digest, source revision, service account, bucket,
   queue permissions, and execution environment.
3. Run the credentialed fixture through the deployed processor job.
4. Record one physical browser+iPhone Session with distinct protected source
   IDs and one canonical capture group.
5. Verify exact-byte upload, waveform display, opening and late alignment
   anchors, residual drift, assembled playback, interruption recovery, and
   provider-off behavior.
