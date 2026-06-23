# Shorts platform target readiness proof - 2026-06-23

## What changed

Quipsly Studio now surfaces a platform target readiness layer for selected shorts and agent state. The goal is to make exported shorts easier to move toward real social publication without pretending direct publishing is complete.

## Product truth

- Whole synced sources remain intact.
- Shorts remain ordered timeline recipes over episode sequence time.
- Platform packaging is metadata and review state, not a publish action.
- Original media is not touched.

## UI change

The selected short publication passport now shows explicit platform targets, including:

- YouTube Shorts
- Instagram
- Facebook
- LinkedIn
- Patreon teaser
- Additional scored targets such as Instagram/Facebook Reels and HighGroundOdyssey.com when suggested by the quality model

Each target reports a plain status such as `needs copy`, `needs export`, `needs review`, `held`, or `ready` with the next safe action.

## Agent/read-model change

The `/state` short clip payload now includes:

- `platformTargets`
- `platformTargetSummary`
- top-level `nextSafeAction`
- matching `publicationPassport.platformTargets`

This lets Codex and future automation inspect publication readiness without using fragile UI scraping.

## Validation

Ran:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
git diff --check
./script/build_and_run.sh --verify
```

Result: passed. The build emitted existing Swift warnings, but the app launched and verified through the real Quipsly Studio path.

Runtime `/state` proof for the first Episode 1 short reported:

```json
{
  "sequenceTitle": "Episode 1 Premiere Rescue",
  "shortClipQueueCount": 13,
  "title": "Test Short - Wednesday Rule moment",
  "nextSafeAction": "Resolve platform target: needs copy.",
  "platformTargetSummary": {
    "nextAction": "needs copy",
    "readyCount": "0",
    "readyFraction": "0/7",
    "totalCount": "7"
  },
  "platforms": [
    "YouTube Shorts:needs copy:88",
    "Instagram:needs copy:91",
    "Facebook:needs copy:91",
    "LinkedIn:needs copy:84",
    "Patreon teaser:needs copy:56",
    "Instagram/Facebook Reels:needs copy:91",
    "HighGroundOdyssey.com:needs copy:68"
  ]
}
```

## Next useful step

Use the platform target layer to drive a real review/package loop:

1. Draft or complete platform copy for a selected short.
2. Mark proof watched.
3. Mark Keep/Refine/Reject.
4. Move Keep + exported + platform-ready shorts into a Tower/manual upload queue.
