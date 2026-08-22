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

## Release boundary

This is post-Build-34 continuous work. Build 34 remains the sealed qualified
candidate at revision `120a9090`; endpoint visibility must receive a new build
identity and release qualification after the matching Nest release is live.

