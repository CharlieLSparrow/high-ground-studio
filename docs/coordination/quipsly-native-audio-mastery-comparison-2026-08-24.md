# Native audio mastery evidence comparison

Date: 2026-08-24

## Outcome

Quipsly Capture's Recording Quality surface now presents the same verified
mastering measurements that Nest already receives instead of reducing audio
improvement to a blind `play improved copy` action.

For a completed mastering preview, Capture shows:

- original complete-decode integrated loudness in LUFS;
- improved-preview complete-decode integrated loudness in LUFS;
- original and improved true peak in dBTP;
- original and improved loudness range in LU;
- the named delivery profile, loudness target, and true-peak ceiling; and
- coordinated Original and Improved playback beginning at the same selected
  source time.

The comparison has two conventional listening modes. **Fair comparison** is
the default and attenuates the improved preview by the measured integrated-
loudness delta so louder does not automatically sound better. **Final volume**
plays the verified preview at delivery level. The screen states the applied dB
difference and keeps both choices reversible.

This makes the automation explainable on the phone without turning technical
evidence into required ceremony. The default copy stays simple; measurements
sit directly beside the comparison for people who want to understand the
result.

## Integrity and playback boundary

- The improved file still downloads through authenticated, account-bound
  access.
- Capture still verifies the exact SHA-256 and byte count before opening it.
- The temporary preview remains protected and is removed when authorization,
  account, recording identity, or derivative identity changes.
- Starting Original stops Improved; starting Improved stops Original.
- Fair comparison changes only the protected preview player's monitoring
  volume. It does not render, rewrite, or normalize either source file.
- Improved playback clamps the requested source time to the verified file's
  duration.
- The original local recording remains source truth. No media is promoted,
  replaced, published, deleted, or approved by opening or playing this view.
- Measurements come from complete-decode server receipts. They support an
  informed listening decision but do not prove audibility, attention, or
  subjective quality.

## Evidence

- The Capture mobile source contract passes with the measurement, delivery
  target, same-time comparison, fair/final monitoring, and preview UI
  assertions.
- Swift parsing passes for the changed client and evidence view.
- The complete unsigned generic iOS Simulator `build-for-testing` succeeds for
  arm64 and x86_64, including the deterministic UI assertions.
- The deterministic Recording Quality preview exposes the measurement, target,
  and A/B controls while explicitly stating that it downloaded no audio and
  created no evidence receipt.

This checkpoint is local source and automated compile evidence. It does not
claim physical-device listening, authenticated live derivative download, or a
human approval decision.
