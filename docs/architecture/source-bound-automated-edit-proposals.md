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

Undo and redo also surface explicit timeline-state feedback. In particular,
Undo cannot leave behind an "applied" status after the editable block has been
restored; the banner names the completed history operation and reiterates that
source media was never changed.

## Current proposal vocabulary

- `deactivate`: mark an exact transcript block inactive in the editable cut;
- `deactivate_range`: skip an exact source-time interval in active-edit playback
  and render projection while preserving source-review playback; and
- `add_keyframe`: add a bounded source-timed reframe keyframe.

The vocabulary is intentionally small while the evidence spine is established.
Upcoming deterministic analyzers should propose silence and retake candidates,
speaker-view changes, multicamera switches, and short-form extracts using this
same contract rather than adding unbound automation paths.

## Deterministic transcript evidence

The first local analyzer now runs without provider disclosure or provider
configuration. Its deliberately narrow vocabulary is:

- explicit restart language: a high-confidence, exact-block reversible cut
  proposal that still requires source proof-watch before apply;
- recording retake markers: high-confidence listen-only evidence;
- adjacent repeated openings of four or more words: medium-confidence
  listen-only evidence because repetition may be intentional; and
- transcript timing gaps from 1.25 through 30 seconds: low-confidence
  listen-only evidence that explicitly says timing is not proof of silence.

Stable candidate identities derive from kind, ordered block identities, and
millisecond source bounds. Each candidate hashes only its exact canonical
transcript evidence. A timing gap sets `requiresSignalEvidence: true`; it cannot
become a silence-cut proposal until decoded audio measurement corroborates it.
This is the bridge into the next analyzer layer, which will join time-aligned
waveform, RMS, clipping, dropout, and standards loudness evidence without
turning provider inference into signal truth.

## Decoded signal and speaker evidence

The deterministic route now resolves decoded signal server-side from canonical
episode attachments. It accepts evidence only from one unambiguous, verified,
SHA-bound Capture recording whose current normalized media-processing gate is
released. A held source stays held, and multiple signal-bearing sources require
explicit source selection rather than a guessed match.

Covered transcript gaps now split into three honest states:

- measured low energy, when full-resolution decoded windows cover at least 85%
  of the interval and the strongest RMS window remains at or below the source's
  near-silence threshold;
- measured signal present, when the strongest covered RMS window reaches the
  source's surrounding-signal threshold; or
- timing only, when evidence is absent, ambiguous, held, incomplete, or between
  thresholds.

Measured low energy is not approved silence. When the decoded signal covers the
entire interval and remains beneath the source threshold, Quipsly can offer an
unapplied `deactivate_range` proposal. The reviewer must proof-listen the
untouched interval before applying the reversible timeline decision. Signal in
a transcript gap is a transcription-accuracy alert because it may contain
missing words or intentional sound. RMS dBFS is never relabeled as LUFS.

Canonical speaker labels are now part of the transcript hash. Exact timing
overlap creates a listening candidate, and a real label transition creates a
camera-review candidate. Neither becomes a timing repair or multicamera switch
without review and source-camera mapping.

## Persisted range decisions

Episode artifact v3 persists exact range decisions separately from transcript
blocks. Each range carries its reason, source class, confidence, proposal
identity, creation time, and—when signal-backed—the immutable recording SHA,
storage generation, signal-profile SHA, coverage, RMS observation, and
threshold. The same range contributes to the canonical timeline fingerprint,
active-edit playback skip, ripple render projection, and duration display.

The Playback cockpit exposes a persistent decision ledger. A reviewer can
proof-listen each interval against complete source playback or restore it to the
active edit after a save/reload. Restore and immediate Undo/Redo are normal
timeline history operations. Save persists the resulting decision; none of
these operations rewrites captured media.

## Durable proposal and review ledger

Proposal generation now commits `StudioEpisodeEditProposalSet` before the
server returns anything actionable. The append-only record retains the complete
proposal JSON, payload SHA-256, provider/model, actor snapshot, exact transcript
and timeline fingerprints, covered bounds, and immutable signal identity. A
provider response that cannot be preserved is not shown as reviewable work.

`StudioEpisodeEditReviewReceipt` distinguishes three scopes:

- `REVIEW_ONLY` for proposal creation, proof-listen/proof-watch, and dismiss;
- `LOCAL_DRAFT` for apply and restore choices that have changed only the
  current editor state; and
- `CANONICAL_TIMELINE` only after the episode timeline transaction commits.

Client request IDs are actor-and-episode idempotency keys. Reusing one with a
different request hash fails closed. Receipt source ranges use integer
milliseconds; timeline, transcript, source, and signal bindings remain exact
SHA-256 values. A successful save links the draft-action receipt IDs it commits
and writes its canonical receipt in the same serializable transaction. The
server independently hashes the submitted timeline fingerprint before
accepting the receipt claim.

This is accountability without an approval bureaucracy: proof playback is
always available, draft automation can be fast, and the interface truthfully
shows what is merely reviewed, what is locally changed, and what collaborators
will actually reload.

## Non-negotiable boundaries

- source bytes are never changed;
- provider output is never treated as applied state;
- a stale proposal never degrades to a warning-only apply;
- provider failures and raw provider messages stay private;
- no proposal can imply that a render, save, promotion, or publication occurred;
- proof-watch is a real source-playback action, not a thumbnail or text preview.

## Acceptance gates still open

Local database-backed browser operation has proved deterministic analysis,
listen-only timing evidence, exact-block apply, and undo against a dedicated
High Ground QA episode. Because that fixture intentionally has no attached
media, it proves state and boundary behavior—not audible or visual source
playback.

- real provider run over a retained HGO transcript and media timeline;
- decoded-signal corroboration for silence/dropout candidates plus overlap and
  speaker-change evidence on genuine Capture media;
- automated draft timeline with before/after proof-watch and render receipts;
- multicamera and local-device media synchronization;
- physical-iPhone source, TestFlight, and full episode proof-watch;
- real coaching-session privacy and consent validation.
