# Episode 4 Produced Shorts v001

This pass replaces approximate timestamp extraction with producer-owned edit recipes.

## Editorial model

- The reviewed Episode 4 v003 master remains untouched.
- Each short stores one or more source-time ranges as metadata.
- Multiple ranges may remove a dead pause without creating fake source clips.
- Captions come from fresh large-v3-turbo handled transcription, then receive explicit corrections where the recognizer changed meaning.
- The short renderer creates 1080x1920 H.264/AAC output, burned dialogue captions, sidecar SRT, thumbnail, copy packet, and validation manifest.

## Producer choices

1. Reliability Beats Raw Talent begins at the complete personal lesson and ends before the next thought.
2. Work Needs Humanity keeps the car-accident joke and lands on the serious military-workplace point.
3. Communication Is Not Always a Meeting starts at the useful claim, not the preceding equipment setup.
4. Leadership Is Environment Design preserves the full incentive-to-environment argument.
5. Simple Solutions Still Count is deliberately concise instead of carrying an incomplete character exchange.
6. The Costa Rica Buffet Test removes one dead pause but preserves Charlie's story, its interpretation, and Homer's reaction.

## Reproduce

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 script/quipsly_produced_shorts.py \
  --config config/episode4-produced-shorts-v001.json
```

The renderer refuses to replace a non-empty output directory unless `--force` is supplied. Production versions should normally use a new config and a new output root instead.

## Visual QA promotion

The first render established the durable recipe and exposed review-only defects: unscaled contact-sheet tiles, unbalanced caption wraps, an unintended italic font match, and a non-square output pixel ratio. The v002 config promotes corrected typography, square pixels, BT.709 output metadata, balanced caption lines, and explicit transcript corrections without overwriting v001.
