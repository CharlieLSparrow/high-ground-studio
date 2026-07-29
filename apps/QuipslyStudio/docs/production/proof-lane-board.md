# Proof-Lane Board

`script/proof_lane_board.py` is a read-only reviewer and agent surface for the
local Episode 1-6 proof lanes.

Use it when Episode 4 clips are pending and we need to keep broader progress
moving without losing truth about what is blocked.

## Commands

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
script/proof_lane_board.py --format markdown
script/proof_lane_board.py --format json
script/proof_lane_board.py --ffprobe --format markdown
```

The default root is:

```text
/Volumes/My Passport/Episode_and_Shorts_Test
```

Override it with:

```bash
QUIPSLY_EPISODE_EXPORT_ROOT="/Volumes/My Passport/Episode_and_Shorts_Test" script/proof_lane_board.py
```

## Truth boundary

- It reads versioned package folders.
- It may use `ffprobe` when requested.
- It does not mutate original media.
- It does not overwrite exports.
- It does not record publication receipts.
- It does not publish externally.
- It does not prove human approval.

## Product purpose

The board answers:

- Which proof lanes are ready to review?
- Which proof lanes need review?
- Which proof lanes are missing package evidence?
- Which proof lanes have blockers or warnings?
- What is the next safest action?

This keeps Episodes 1-3, 5, and 6 moving while Episode 4 waits for missing
watched/source clips.
