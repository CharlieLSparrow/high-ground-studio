# Shorts automatic quality features

This is the practical automation track for better short-form output.

## Principle

Automation should help the editor make better choices, not silently pretend it has taste.

Quipsly can propose, score, export, inspect, and package. The human or agent editor can accept, refine, reject, or override.

## Current feature stack

```bash
script/shortsctl.sh growth-quality-board --html
script/shortsctl.sh local-export-board --html
script/shortsctl.sh platform-package-board --html
script/shortsctl.sh improvement-plan --html
```

## Automatic quality dimensions

1. Hook quality.
   - Is the opening sentence clear?
   - Does it create curiosity without lying?
   - Can it be understood in one second?

2. Standalone clarity.
   - Does the clip make sense without the full episode?
   - Is there enough context before the point lands?

3. Pacing.
   - Is the duration right for the idea?
   - Should the clip be tightened or split?

4. Vertical visual safety.
   - Are faces framed well?
   - Is headroom acceptable?
   - Do captions avoid faces and platform UI zones?

5. Audio confidence.
   - Does it avoid clipping, silence, harsh jumps, and awkward cut points?

6. Platform packaging.
   - Does the title/caption/hashtag set make the promise clear?
   - Does the copy feel native to each destination?

## Near next features

- Transcript-aware hook finder.
- Face/caption safe-zone overlays in the native editor.
- A/B hook variants attached to each short.
- Auto-generated caption chunks with editable timing.
- Short-specific crop presets and keyframes.
- Exported-short contact sheet plus waveform/audio sanity in one packet.
- Post-publish analytics feedback into future candidate scoring.
