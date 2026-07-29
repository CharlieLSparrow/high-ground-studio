# Source-aware episode sync

## Product invariant

An episode is not synced because one render sounds right at one checkpoint.
Every source segment must remain traceable to one shared sequence clock.

Quipsly keeps five separate layers:

1. **Immutable source media**: original camera and recorder files. Camera scratch
   audio is retained as sync evidence even when it is never used in the mix.
2. **Refined speaker stems**: one full-length, source-aware track per host or
   participant. These drive the final mix and remain independently adjustable.
3. **Protected sync baseline**: each source maps to sequence time with an offset
   and, when required, a clock-rate correction. No edit decisions live here.
4. **Edit branches**: SHOW, SKIP, layout, framing, notes, tags, and complex
   sub-edits are reversible metadata above the protected baseline.
5. **Versioned renders**: delivery artifacts record the baseline, edit branch,
   source hashes, and validation receipts that produced them.

The basic time mapping is:

`sequenceTime = sourceTime * clockRate + offset`

A stable residual across a segment means the offset is wrong. A residual that
changes over the segment means the source clock drifts and requires a rate
correction. Quipsly must never disguise clock drift as a global offset tweak.

## Promotion gate

`episode_audio_drift_audit.py` compares camera scratch audio with the refined
stem for the same speaker at multiple checkpoints per source segment.

- Residual under `0.10s`: pass.
- Residual from `0.10s` through `0.25s`: requires attention.
- Residual over `0.25s`: hard stop.
- Stable offset failures may be repaired in a new session version.
- True drift over `0.02s/min` is not eligible for fixed-offset repair.
- Low-confidence isolated matches are outliers, not correction evidence.
- A repaired session cannot be promoted by the native-session importer without
  a matching passing audit report with zero hard stops.

The importer also refuses to replace a browser baseline after a human or agent
has created real edit revisions. An untouched derived baseline may be rebuilt
from a newer protected session because it contains no irreplaceable work.

## Episode 4 Part 2 proof

The v012 audit found that Charlie camera segments 2 through 5 were consistently
about `1.8s` late. Charlie segments 1 and 6 and both Homer segments passed.
This proved a piecewise camera-offset problem rather than a global stem problem.

`apply_episode_audio_drift_repair.py` created v013 without overwriting v012 or
changing any media samples. It moved only the four failing camera segments.
The independent v013 audit then passed all eight host-camera segments with zero
hard stops. The local browser editor was promoted from the v013 session plus
its passing audit receipt.

Current evidence:

- Session: `/Users/wall-e/Library/Application Support/Quipsly/MediaVault/sessions/episode-4-part-2-producer-v013.quipsly-session.json`
- Repair receipt: the adjacent `.sync-repair.json` sidecar.
- Audit: `/Users/wall-e/Library/Application Support/Quipsly/MediaVault/diagnostics/episode-4-part-2-v013-audio-drift.json`

## Commands

Audit a session:

```bash
uv run --with numpy python apps/QuipslyStudio/script/episode_audio_drift_audit.py \
  --session /absolute/path/to/session.quipsly-session.json \
  --output /absolute/path/to/audio-drift.json \
  --cache-dir "$HOME/Library/Caches/Quipsly/AudioAnalysis"
```

Create a corrected version when the audit proves stable offset failures:

```bash
python3 apps/QuipslyStudio/script/apply_episode_audio_drift_repair.py \
  --session /absolute/path/to/v012.quipsly-session.json \
  --audit /absolute/path/to/v012-audio-drift.json \
  --output /absolute/path/to/v013.quipsly-session.json
```

Promote only after the corrected version passes its own audit:

```bash
node scripts/quipsly/import-native-episode-session.mjs \
  --session=/absolute/path/to/v013.quipsly-session.json \
  --audio-drift-audit=/absolute/path/to/v013-audio-drift.json \
  --project-slug=high-ground-odyssey \
  --episode-slug=episode-4-part-2 \
  --replace
```

## Renderer requirement

Render jobs should consume the protected sync baseline plus separate refined
stems, not a flattened intermediate mix. A future render orchestrator must fail
closed when the promoted baseline lacks a passing audio-drift receipt. That
keeps sync correction upstream of Part 1, Part 2, shorts, and alternate edits.
