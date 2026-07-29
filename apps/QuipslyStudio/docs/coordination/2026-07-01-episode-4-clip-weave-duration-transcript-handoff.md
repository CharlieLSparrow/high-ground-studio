# Episode 4 clip-weave, duration, and transcript handoff - 2026-07-01

## Current proof state

- Active session: `episode-4-v001-rough-show-decisions`
- Active sequence: `Episode 4 clip weave proof v001`
- Sequence duration: `1:53:13` / `6792.533333s`
- Live lane count: `19`
- Live media count: `19`
- Live source lane inventory count: `19`
- Short recipes currently visible: `5`

## What is true

- Episode 4 has a credible synced/editable spine.
- The session has six ready production video lanes:
  - Charlie Phone Camera 1 - `IMG_3746.MOV`
  - Charlie Phone Camera 2 - `IMG_3749.MOV`
  - Charlie Phone Camera 3 - `IMG_3751.MOV`
  - Homer Insta360 Camera 1 - `VID_20260225_163604_00_005.insv`
  - Homer Insta360 Camera 2 - `VID_20260225_163604_00_006.insv`
  - Homer Insta360 Camera 3 - `VID_20260225_163604_00_007.insv`
- The local Episode 4 media folder contains 19 media files, and all 19 are already attached to lanes.
- No unattached local source/reference/watched clip files were found in `/Volumes/My Passport/Episode 4`.
- Therefore source/reference clip weaving into the long-form episode is not proven yet.
- Multiple output lengths should be created as separate metadata branches/recipes over the same synced spine, not duplicated source media or chopped clips.

## Duration branch targets

- `Episode 4 clip weave proof 8-12 v001`: prove commentary -> source clip -> reaction -> meaning flow.
- `Episode 4 YouTube standard 35-45 v001`: main publish-candidate YouTube version.
- `Episode 4 tight feature 22-30 v001`: focused shorter feature version.
- `Episode 4 full review v001`: generous human-review/podcast-truth version.
- `Episode 4 shorts family v001`: 30s, 45s, 60s, and 90s vertical candidates.

## Transcript runway

- Transcript source workorders are ready at:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-source-workorders/latest-transcript-source-workorders.json`
- Transcript provider doctor is available through:
  - `script/local_transcript_provider.py --doctor`
- Provider status: available.
- Episode 4 transcript candidates:
  - Sources: `142`
  - High priority: `69`
  - External audio: `20`
  - Video scratch: `48`
  - Podcast masters: `49`
- Preferred first transcript sources include full-length/HQ audio:
  - `Charlie Ep4.wav` (`1:53:13`)
  - `TX00_MIC005_20260226_070456_orig.wav` (`30:00`)
  - `TX00_MIC006_20260226_073457_orig.wav` (`30:00`)
  - `TX00_MIC007_20260226_080457_orig.wav` (`30:00`)
  - `TX00_MIC008_20260226_083457_orig.wav` (`22:02`)
  - `Untitled_1 #02.wav` (`1:53:12`)

## Fixed this pass

- `script/agentctl.sh` now treats `load-session-wait` as ready only when session name plus nonzero lane/duration truth exists.
- `WorkspaceView.swift` publishes visible store changes when loading native sessions.
- `WorkspaceView.swift` keeps the heavy production-details drawer lazy so Studio can boot before constructing downstream publishing panels.
- `script/episode4_clip_weave_duration_plan.py` now reports:
  - synced production video lanes,
  - held/review lanes,
  - external media scan status,
  - source/reference clip absence,
  - duration branch recipes,
  - Episode 4 transcript workorder readiness.
- `script/experimental/build_episode_transcript_source_workorders.py` now points at the real transcript provider path: `script/local_transcript_provider.py`.

## Latest generated evidence

- Episode 4 plan folder:
  - `/Volumes/My Passport/Quipsly/QuipslyExports/EpisodeEditPlans/20260701T0702020000-episode-4-clip-weave-duration-plan`
- Transcript workorder board:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-source-workorders/20260701-070107-688269-transcript-source-workorders/index.html`

## Next safest action

1. Run ASR for the preferred Episode 4 full-length/high-quality audio sources.
2. Import or attach the actual watched/source clips as whole reference/source lanes.
3. Create the `Episode 4 clip weave proof 8-12 v001` branch.
4. Use transcript timing plus source lanes to build the first proof weave.
5. Only after that proof works, create the 35-45, 22-30, full review, and shorts-family branches.

## Safety boundary

- No source media was mutated.
- No exports were overwritten.
- No external publication or upload occurred.
- The generated plans and workorders are read-only truth surfaces until explicit commands are run.

## 2026-07-01 focused Episode 4 transcript execution packet

- Added focused transcript source workorders: `script/agentctl.sh studio-transcript-source-workorders --episode 4`.
- Added focused transcript execution readiness: `script/agentctl.sh studio-transcript-execution-readiness --episode 4`.
- Focused source workorders write `latest-transcript-source-workorders-episode-04.json` and do not overwrite the global latest all-episode pointer.
- Focused execution readiness writes `latest-transcript-execution-readiness-episode-04.json` and does not overwrite the global latest all-episode pointer.
- Provider path was corrected to the real `script/local_transcript_provider.py` bridge.
- Current focused source packet found Episode 4 transcript evidence: 142 audio-bearing sources, 69 high-priority, 0 probe failures.
- Current execution packet selected 6 first-pass sources and de-duplicates equivalent source copies.
- First recommended ASR candidate: `/Volumes/My Passport/Episode 4/Charlie Ep4.wav`.
- Current focused execution board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-execution-readiness/20260701-073135-750407-transcript-execution-readiness/index.html`.
- Safety truth: no ASR was run, no transcript sidecars were written, no transcript was imported, no timeline decisions changed, no exports or publication truth were created.

Next safe action: run one ASR command for `/Volumes/My Passport/Episode 4/Charlie Ep4.wav`, normalize/review it, then decide whether it is good enough as the first Episode 4 transcript spine candidate before using transcript timing for cadence/J-cut/L-cut decisions.

## 2026-07-01 Episode 4 transcript pilot executed

- Updated `script/experimental/run_transcript_pilot.py` so the pilot uses the real provider path, can create a managed excerpt from a long source, and records original source lineage plus excerpt offsets.
- Executed focused Episode 4 transcript pilot through `script/agentctl.sh studio-transcript-pilot --episode 4 --readiness-pointer '/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-execution-readiness/latest-transcript-execution-readiness-episode-04.json' --execute --timeout 900`.
- Selected source: `/Volumes/My Passport/Episode 4/TX00_MIC005_20260226_070456_orig.wav`.
- Managed excerpt: 120 seconds starting at 60 seconds, written under the transcript pilot session folder.
- Latest focused pilot pointer: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-pilots/latest-transcript-pilot-episode-04.json`.
- Latest focused pilot board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-pilots/20260701-074521-496298-transcript-pilot/index.html`.
- Result: ASR ran once, raw provider output written once, normalized transcript JSON written once, 14 timed segments, 208 word timings.
- Safety truth: no source media mutation, transcript import, transcript reconciliation, timeline edit, export, approval, upload, publication, schedule, overwrite, delete, or receipt truth occurred.

Next safe action: review the pilot transcript timing quality, then run full Episode 4 ASR on the best full source or build the full-source/reconciliation command packet.
