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

## Native transcript review

Capture decodes the protected binding carried by each passage. If the matching
local original is absent and the protected source is audio, it reuses the
existing account-bound Session download cache, repeats byte-count and SHA-256
verification, and hands only that verified file to the transcript player. The
transcript player keys its listened-through position to the expected
RecordingAsset before correction controls unlock. It will not silently download
a full protected video to play one sentence; that requires the explicit recording
sheet until a source-bound audio derivative exists.

This is compile- and contract-qualified, not physical-device acceptance. A real
two-account flight must still prove the second participant source downloads,
plays the intended words, unlocks only its own passage, survives refresh, and
cannot be substituted with another retained or cached source.
