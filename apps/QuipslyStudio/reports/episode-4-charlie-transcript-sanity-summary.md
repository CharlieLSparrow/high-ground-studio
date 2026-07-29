# Episode 4 Charlie Transcript Sanity Check

Date: 2026-07-08

## Question

Do the Charlie MOV files appear to match `Charlie Ep4.wav`, or did we accidentally use mismatched source media?

## Short answer

The files are not obviously wrong, but the previous Episode 4 offsets were wrong. Transcript matching found strong anchors for two Charlie MOV files and exposed the older session as correlation-based rather than transcript-proven.

## Evidence

Transcript spine:

- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-spines/episode-04/20260701-131412-466404-transcript-spine/episode-04.transcript-spine.draft.json`
- Source audio: `Charlie Ep4.wav`

Sanity reports:

- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-charlie-mov-transcript-sanity/20260709-001937/episode4-charlie-mov-transcript-sanity.json`
- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-charlie-mov-transcript-sanity/20260709-002430/episode4-charlie-mov-transcript-sanity.json`
- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-charlie-mov-transcript-sanity/20260709-002430/episode4-charlie-mov-offset-search.json`
- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-charlie-mov-transcript-sanity/20260709-002430/episode4-charlie-mov-offset-search.md`

## Applied sync repair

New transcript-anchored session:

- `/Users/wall-e/Library/Application Support/Quipsly/MediaVault/sessions/episode-4-sync-baseline-v3-transcript-anchored.quipsly-session.json`

Report:

- `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/reports/episode-4-sync-baseline-v3-transcript-anchored-report.json`

Applied transcript-backed offsets:

- `IMG_3749.MOV`: `-7.545s`
- `IMG_3751.MOV`: `5871.469s`

Held for review:

- `IMG_3746.MOV`: appears to contain setup chatter that is probably absent from the current `Charlie Ep4.wav` transcript spine, so it should not be promoted into the edit until reviewed against a raw spine or manually confirmed.

## App proof

After rebuilding and loading the v3 session through the real app path, agent state confirmed:

- At sequence `174s`, `IMG_3749.MOV` is present with source time `181.545s` and proxy-ready playback.
- At sequence `6033s`, `IMG_3751.MOV` is present with source time `161.531s` and proxy-ready playback.
- Both are whole-source lanes with SKIP metadata by default, not chopped clips.

## Important interpretation

`Charlie Ep4.wav` appears to be an edited Logic-style export rather than a raw continuous capture spine. That means transcript anchors are safer than envelope correlation, and some raw setup material may not appear in the spine at all.

## Next safest action

Use `episode-4-sync-baseline-v3-transcript-anchored` as the review baseline for Charlie phone video, but do not call Episode 4 fully synced yet. Next, run the same transcript/audio sanity process for Homer/Insta360 sources and decide whether `Charlie Ep4.wav` is the true editing spine or whether a raw call/audio spine exists.
