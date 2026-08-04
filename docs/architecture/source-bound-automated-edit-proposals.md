# Source-bound automated edit proposals

Date: 2026-08-03

## Product position

Quipsly's automated editor is a review system over immutable source media, not
an opaque button that silently changes an episode. The competitive interaction
model is familiar—transcript-based editing, silence and filler-word assistance,
speaker-aware framing, and clip generation—but the differentiator is visible
evidence and reversibility.

Current market references include
[Riverside's AI editor](https://riverside.fm/tools/ai-video-editor),
[Riverside Magic Clips](https://riverside.fm/magic-clips),
[Descript Underlord](https://www.descript.com/underlord), and
[Descript Edit for Clarity](https://help.descript.com/hc/en-us/articles/36841959272717-Edit-for-Clarity).
The implementation substrate remains deterministic media composition through
[FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html) and platform-native
composition through
[AVVideoComposition](https://developer.apple.com/documentation/avfoundation/avvideocomposition).

## Contract

Every generated proposal set is bound to:

- one authorized project and episode;
- the SHA-256 fingerprint of the exact editable timeline;
- the SHA-256 fingerprint of a canonical, ordered transcript representation;
- the transcript block count and complete covered time range; and
- exact source intervals plus hashed transcript evidence for each proposal.

Proposal generation requires episode write access before provider availability
is inspected. The client re-computes both fingerprints before proof-watch or
apply. Any changed transcript, timing, timeline, project, or episode makes the
set stale and blocks the operation.

## Review model

Each proposal displays a rationale, confidence class, exact source range, and
an explicit statement that the original is unchanged. A reviewer can:

1. proof-watch the untouched source with 1.5 seconds of surrounding context;
2. dismiss one proposal or the complete set; or
3. apply one proposal to the editable timeline.

Apply does not save, render, promote, or publish. Normal timeline playback and
the existing save/render gates remain separate acceptance decisions.

## Current proposal vocabulary

- `deactivate`: mark an exact transcript block inactive in the editable cut;
- `add_keyframe`: add a bounded source-timed reframe keyframe.

The vocabulary is intentionally small while the evidence spine is established.
Upcoming deterministic analyzers should propose silence and retake candidates,
speaker-view changes, multicamera switches, and short-form extracts using this
same contract rather than adding unbound automation paths.

## Non-negotiable boundaries

- source bytes are never changed;
- provider output is never treated as applied state;
- a stale proposal never degrades to a warning-only apply;
- provider failures and raw provider messages stay private;
- no proposal can imply that a render, save, promotion, or publication occurred;
- proof-watch is a real source-playback action, not a thumbnail or text preview.

## Acceptance gates still open

- persisted proposal/audit ledger rather than response-lifetime state;
- real provider run over a retained HGO transcript and media timeline;
- deterministic silence, overlap, retake, and speaker-change evidence;
- automated draft timeline with before/after proof-watch and render receipts;
- multicamera and local-device media synchronization;
- physical-iPhone source, TestFlight, and full episode proof-watch;
- real coaching-session privacy and consent validation.
