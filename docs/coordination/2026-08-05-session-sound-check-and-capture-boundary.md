# Session sound check and capture-boundary checkpoint

Date: 2026-08-05

## Outcome

Quipsly's browser Session preflight now includes a deliberate private sound
check and fails closed when an older Session does not have a canonical capture
group. A missing capture identity no longer crashes the Episode Room or tempts
the client to relabel a room identifier as a retained-source identifier.

The resulting boundary is:

- device enumeration, call-path metering, private playback, and the live
  conversation can remain available;
- browser retained-source controls mount only when the server supplies a
  non-empty canonical capture-group identity;
- provider call media, optional provider safety recording, and protected local
  masters remain distinct products with distinct truth claims; and
- changing the selected microphone or camera invalidates the old preview and
  meter evidence before the user can join with a different physical path.

## Private sound check

`StudioSoundCheck` uses the audio track from the exact preflight stream that the
Session already opened. It records at most ten seconds with the browser's
`MediaRecorder`, creates a tab-local object URL, and offers playback through the
selected output when `setSinkId` is available. The component has no upload or
Session mutation path. Clearing the sample, selecting another microphone, or
unmounting the room revokes the object URL.

The guidance is derived from the same call-path RMS and sample-peak evidence as
the live meter. It deliberately does not call those observations LUFS, true
peak, mastering evidence, or proof of the protected local master. Its purpose
is to catch wrong-device selection, mute, bad gain, room noise, mouth noise, and
monitoring problems before a participant joins.

## Missing capture-group repair

The retained Episode 4 Part 2 Session predates the canonical capture-group
contract. Its runtime payload reached `BrowserSourceRecorder` without a usable
`captureGroupId`, and the recorder called `.slice()` on that missing field.
That was the immediate crash, but the ownership defect was broader: the UI
treated a nominal type as stronger evidence than the durable runtime payload.

The server projection and dock contract now preserve the missing state as
`null`. `LiveSessionRoom` renders an explicit `Conversation available ·
recording held` boundary and refuses to mount `BrowserSourceRecorder`. It does
not substitute the LiveKit room ID because room access and synchronized source
identity are different contracts.

## Verification

Focused automated verification covers the meter guidance, private recorder,
live Session preflight, dock, Episode Room projection, and recording-session
mapping. The checkpoint passed 6 suites and 35 tests, Quipsly TypeScript
checking, and whitespace validation.

The signed local browser operation used the existing disposable verified QA
identity with its explicit High Ground Odyssey `EDITOR` grant. Episode 4 Part 2
opened without a runtime overlay, the live dock mounted, and the browser
enumerated the available microphone and output paths. The UI visibly retained
device testing and join controls while holding retained recording because the
legacy Session has no capture group. The in-app browser did not complete its
native microphone permission prompt, so this operation does not claim that a
real ten-second playback sample was captured. That remaining hardware/browser
permission check should be repeated in Safari or Chrome without changing the
application boundary.

No live room was joined, provider recording started, retained source created,
timeline mutated, review decision made, or publication action taken during this
operation.
