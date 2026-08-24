# Session-protected transcript playback

Date: 2026-08-24

## Problem closed

Session inventory, transcript correction, and the private media route had
separate definitions of “safe to play.” Transcript review also depended on a
Studio promotion before an otherwise released participant recording could be
heard. In a two-source conversation that could leave a valid passage readable
but not playable from the correction desk.

## Canonical binding

`sessionProtectedPlaybackBinding` is now the single pure contract used by all
three surfaces. It returns a player binding only when the current Session,
RecordingAsset, finalization receipt, immutable upload binding, SHA-256, byte
size, vault object, and exact storage generation agree. The asset must be
verified, have a verification timestamp, and carry `exactBytesVerified`; the
exact finalization receipt must retain an upload identity and be released.

The byte-serving route repeats object metadata checks against the bound storage
generation before serving authenticated range responses. It never promotes,
copies, mutates, or replaces source media.

## Transcript behavior

- Browser transcript review prefers the authenticated Session media URL and
  source identity from this binding. A Studio promotion is no longer required.
- Multi-participant assembly carries each source's distinct protected playback
  binding onto its passages, so selecting a passage switches media before it
  seeks on source time.
- Correction and speaker-attribution mutations reconstruct the same binding;
  a client cannot submit a playback receipt for a source the server would no
  longer serve.
- Legacy promoted media remains a compatibility fallback when the exact Session
  binding is unavailable.

## Automated evidence

- Six focused Jest suites pass with 100 tests across the pure binding, Session
  inventory, protected byte route, correction mutations, multi-source assembly,
  and browser source switching.
- Strict Quipsly TypeScript passes.
- The App Store static gate and broader mobile Capture contract gate pass.

## Honest native boundary

Capture still authorizes transcript corrections only against the exact retained
original already on that iPhone. The existing Session protected-download
controller uses the same route and receipt shape, but it is not yet connected to
the transcript review player's listened-position receipts. Until that connection
is made and tested, another participant's passage remains readable on iPhone but
cannot be called playback-reviewed there.
