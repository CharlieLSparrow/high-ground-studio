# Native Session protected playback

Date: 2026-08-24

## Decision

Quipsly Capture can prepare and play a verified retained Session source even
when the source was recorded by another endpoint or is no longer present in
the local recording library. This is post-call review, not a second recording
authority and not a replacement for the retained server original.

The mobile Session projection now carries the exact RecordingAsset identity,
byte count, SHA-256, duration, optional Studio identity, and canonical
same-origin Session playback path. Playback does not require a Project,
episode, MediaAsset, or StudioVideoSource. Those identities remain optional
editorial projections over the retained Session source.
Capture offers playback only when all of the following agree:

- the RecordingAsset is verified and released;
- the SHA-256 is a canonical 64-character digest;
- the byte count is positive;
- the RecordingAsset and immutable finalization receipt agree on room, object,
  generation, byte count, and SHA-256; and
- the playback path is exactly
  `/api/sessions/{roomId}/recordings/{recordingAssetId}/media`.

The protected route authenticates before storage lookup, applies the ordinary
Session access boundary, refuses held sources, pins the exact GCS generation,
supports HTTP byte ranges and HEAD, and never redirects to a private object.
Missing or inconsistent evidence leaves the source visible but does not expose
a playback action. `/api/ingest/media/{sourceId}` remains the Studio/editor
source route; it is no longer a prerequisite for coaching playback.

## Native custody

Playback preparation is deliberate because a high-quality source may be
large. The sheet shows the size and duration before downloading. The app uses
the authenticated large-download path bound to the stable signed-in account,
requires an HTTP 200 response from the configured Nest origin and exact path,
checks the response length when available, hashes the complete temporary file,
and compares both bytes and SHA-256 with the retained source receipt before
creating an AVPlayer.

The protected copy is:

- stored under an account-digested and RecordingAsset-digested application
  support path;
- protected until first device unlock so ordinary playback can continue while
  respecting iOS file protection;
- excluded from device backup;
- rejected and removed when its receipt, owner, path, hash, size, or 30-day
  lifetime no longer matches; and
- removable from the review sheet without changing the server original.

Changing or signing out of the Quipsly account stops playback and clears the
protected playback cache. A capacity check reserves headroom before a new
download rather than beginning a source the device cannot safely retain.

## UX

Each qualified retained source gets one familiar **Listen** or **Watch**
action inside the existing Call and recording check. Opening it does not
download automatically. After preparation, the sheet provides native video or
audio presentation, play/pause, a scrubber, elapsed and total time, and local
copy removal. It does not expose provider, bucket, token, or checksum ceremony
in the ordinary interface.

## Evidence and limits

- The focused 61-test server/projection suite passes, including authenticated
  projectless playback, tenant denial, held-source refusal, receipt drift,
  immutable generation, complete response, byte ranges, and HEAD coverage.
- Another 23 adjacent Session journey, listening navigator, finishing cockpit,
  and player-component tests pass against the new RecordingAsset identity.
- Strict Quipsly TypeScript passes.
- A signing-independent iOS simulator build passes after compiling the
  protected download, receipt, hashing, cache, audio-session, and player path.
- The focused iPhone 17 Pro/iOS 26.3.1 UI test passes. It selects a completed
  multi-source Session, opens the audio review sheet, verifies the exact-source
  summary, and proves deterministic preview cannot download protected media.

Automated evidence does not prove a real authenticated GCS download, audible
beginning/middle/ending playback, video decode, cross-participant sync, or a
physical iPhone's storage and interruption behavior. Those observations remain
in the deferred validation ledger.
