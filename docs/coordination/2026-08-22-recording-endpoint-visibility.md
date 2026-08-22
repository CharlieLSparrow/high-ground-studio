# Recording endpoint visibility

## Outcome

The standard call remains one green room and one `Join call` action. Recording
health now appears automatically after the host starts a coordinated take; no
participant has to open diagnostics, repeat consent, or perform an additional
setup step.

Browser and iPhone hosts receive the latest durable state for each responding
Quipsly endpoint: getting ready, recording, stopping, stopped safely, or needs
attention. The surface labels the person and device in ordinary language and
explicitly distinguishes recorder state from later exact-byte upload
verification.

## Privacy and authority

- Coach, host, producer, Session creator, staff, and authorized Nest
  owner/editor controllers may read all endpoint states for the Session.
- An ordinary participant receives only their own endpoint state.
- A project viewer who is not a Session participant receives no endpoint
  state.
- API responses use a room-scoped opaque endpoint ID. Raw installation IDs,
  actor user IDs, participant IDs, and credentials are not returned.
- A START acknowledgment is operational visibility, not proof of uploaded or
  verified media. Local capture and exact-byte RecordingAsset verification
  remain the source of truth.

## Evidence

- Quipsly typecheck passed.
- 23 focused web tests passed across the recording-directive route, browser
  client, and standard live-room experience.
- Native iOS simulator build succeeded for both arm64 and x86_64 with the
  endpoint-health model and host status surface linked into Quipsly Capture.
- `git diff --check` passed.

## Safe browser leave follow-up

The call-to-playback trace found that browser `Leave` could disconnect while a
retained local master was active. Component teardown attempted to stop the
encoder, but it did not give the person a durable completion boundary and
could leave the Session's endpoint projection stale.

The connected control now becomes `Stop recording & leave` only while this
device owns an active retained source. One click requests the local stop,
waits for queued chunks, writer close, full-file hash, and the durable STOP
receipt, publishes this endpoint's `STOPPED` coordination state, then leaves
automatically. A stale device-refresh result is generation-cancelled so it
cannot overwrite the final safe-leave message. Upload remains an independent,
recoverable operation over the protected local file.

Focused call/coordination coverage is now 24/24, including the operated safe
leave sequence. Quipsly typecheck and whitespace validation pass.

## Safe iPhone leave follow-up

Quipsly Capture now uses the same ordinary one-tap contract. While this iPhone
is retaining a local source, `Leave` becomes `Stop recording & leave`. It stops
and validates only this endpoint's source, waits for an AVFoundation movie to
finish finalizing, then disconnects automatically. It does not issue the
room-wide STOP directive, so another participant's phone or browser keeps its
independent master. If iOS is still finalizing or the local stop fails, Quipsly
keeps the call connected and explains why instead of risking the source.

The endpoint STOPPED/STOP_FAILED update is sent independently after the local
truth is known, so room-status latency cannot delay the safe disconnect and
upload recovery remains separate. The full native simulator application build
and release-source contract pass with this behavior compiled for both simulator
architectures. Physical iPhone proof remains a release-acceptance step rather
than something inferred from a simulator build.

## Release boundary

This is post-Build-34 continuous work. Build 34 remains the sealed qualified
candidate at revision `120a9090`; endpoint visibility must receive a new build
identity and release qualification after the matching Nest release is live.
