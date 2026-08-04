# Shared-clock source sync evidence map

Date: 2026-08-04

## Outcome

Guided sync now exposes the evidence that was previously split between two
players, checkboxes, and numeric fields. Spine and target signals occupy two
lanes on the same episode clock, with the opening anchor and later comparison
point visible together. A magnified drift view keeps millisecond error legible
even when the full source spans minutes or hours.

The map distinguishes four different claims instead of collapsing them into a
generic “synced” badge:

- whether each source has a validated decoded waveform;
- where target source zero is proposed on the episode clock;
- whether a later comparison was actually measured; and
- what residual drift, observed rate in parts per million, and projected
  end-of-source error follow from that measurement.

Positive residual is defined as the target event arriving late relative to the
audio spine. The calculation is deterministic: observed ppm is residual
milliseconds multiplied by 1,000 and divided by the seconds between review
points. Projection is informational only. Quipsly does not silently stretch,
resample, approve, or mutate media.

## Standards and implementation research

Apple's immutable `AVAudioTime` represents one moment as host time, audio
sample time, or both. That supports Quipsly's existing decision to preserve
clock evidence while keeping sample-accurate claims separate from human
waveform review:

- https://developer.apple.com/documentation/avfaudio/avaudiotime

For audio-to-video review only, the map provides population-level perception
context from ITU-R BT.1359. Its reported average detectability thresholds are
45 ms with sound advanced and 125 ms with sound delayed; average acceptability
thresholds are 90 ms and 185 ms respectively. Quipsly uses those bands as
context, never as an automatic approval gate:

- https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1359-0-199802-S!!PDF-E.pdf
- https://qc.ebu.io/items/0098B/versions/1-0-0/

The EBU quality-control catalogue classifies lip-sync review as human-only.
That reinforces the product boundary: measurement and visualization can be
automated, while content-specific acceptance remains an explicit review.

## Operated retained proof

The rendered local product opened retained episode
`sync-evidence-map-episode-4-20260804` and selected the promoted 60-second
Episode 4 audio as its spine. The map rendered the real Capture signal profile
and made the second source's missing decoded waveform explicit rather than
inventing one.

The operation entered a 10-second later comparison and +5 ms residual, then
read back +500 ppm and the projected error from the rendered map. It confirmed
the opening and later markers, no accidental approval, unchanged source media,
no browser exception, and no horizontal overflow. It deliberately did not save
a sync-review receipt because the registered target had no playable or decoded
evidence. That held state is the useful result: the UX now shows exactly what
evidence must exist before a premium automated alignment system can make a
stronger claim.

## Next boundary

Generate and bind target audio signal profiles for imported camera/video
sources, then operate a real Canon R8 plus MV7i pair through opening cue, later
drift comparison, reviewer approval, persistence reload, and exact undo. Once
both decoded lanes exist, add deterministic correlation candidates as visible
proposals—not silent placement—and evaluate them against retained ground-truth
events.
