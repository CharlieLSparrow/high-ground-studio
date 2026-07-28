# QuipslyStudio Production Log

Status: active lightweight ship's log.

Purpose: preserve the story of what we worked on, what changed, what proved
true, what stayed risky, and what we learned about pace. This is not a timesheet
and not a substitute for tests, commits, or release proof.

Use this format for meaningful work blocks:

```text
## YYYY-MM-DD HH:MM TZ - Short title

Started:
Finished:
Duration:
Mode:
Canonical path:

What changed:
- ...

Proof or evidence:
- ...

Still risky:
- ...

Lesson:
- ...

Next:
- ...
```

## 2026-06-18 15:29 MDT - Canonical editor guardrails and launch recovery

Started: earlier in the active QuipslyStudio recovery run
Finished: 2026-06-18 15:29 MDT
Duration: rough multi-turn block, exact start not captured
Mode: recovery, guardrails, validation policy
Canonical path: `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio`

What changed:
- Confirmed QuipslyStudio is the canonical native editor implementation.
- Added canonical implementation registry.
- Added legacy editor quarantine note.
- Added warning tombstones inside `apps/quipsly-mac` and `apps/quipsly-video`.
- Added production runbook sections for naming, output readiness, Apple distribution, and judgment-based validation.
- Added a production editor gap map tied to the full 16:9, 9:16, podcast, and proof-ledger objective.
- Fixed canonical QuipslyStudio build blockers in `TimelineEditorView.swift` and `WorkspaceView.swift`.

Proof or evidence:
- Canonical build/launch command succeeded:
  `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/build_and_run.sh`
- Running process path showed QuipslyStudio build output:
  `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/DerivedData/Build/Products/Debug/QuipslyMac.app/Contents/MacOS/QuipslyMac`

Still risky:
- App process/bundle still visibly says `QuipslyMac`, which can confuse humans and agents even though the source path is correct.
- Warning debt remains in `WorkspaceView.swift`, `TimelineEditorView.swift`, and AVFoundation export code.
- Legacy trees are tombstoned but not moved outside the repo yet.
- Production editor objective is not complete; export, publication, podcast, shorts, and receipt proof still need requirement-by-requirement validation.

Lesson:
- "Open the canonical app" is a real product smoke test, not vanity. It caught source-tree/build drift immediately.
- Validation should be judgment-based: build after Swift/source changes, skip builds for docs-only changes, and offload long-running observation when it saves Codex focus.
- Guardrails belong where agents actually land, not only in memory.

Next:
- Return to QuipslyStudio product work.
- Strengthen the Ship/readiness surface so 16:9 episode, 9:16 social clips, podcast audio, and proof receipts are visible as one production ladder.
- Then tighten shared-playhead/scrub/zoom proof and selected-short timeline visualization.

## 2026-06-18 15:40 MDT - Ship map per-output readiness rungs

Started: 2026-06-18 15:34 MDT
Finished: 2026-06-18 15:40 MDT
Duration: about 6 minutes
Mode: product UI hardening, proof pass
Canonical path: `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio`

What changed:
- Added mini readiness rungs to each Ship output tile so 16:9 episode, 9:16 shorts, and podcast outputs show their own progress instead of only relying on the global production ladder.
- The rungs are intentionally simple: `EDIT`, `PREP`, `POST`, and `PROOF`.
- Kept this as visibility over judgment: the UI shows what exists and what is missing without pretending to grade the creative work.

Proof or evidence:
- Canonical build/launch command succeeded:
  `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/build_and_run.sh`

Still risky:
- The Ship screen still needs direct real-export receipt checks for YouTube, shorts platforms, Patreon, and podcast destinations.
- The readiness rungs are derived from current in-app packet state; they still need a human/editor smoke pass against real Episode 1 outputs.

Lesson:
- Output readiness should be visible at the artifact level. A creator should never have to infer whether the episode, the short, or the podcast is the thing blocking publication.

Next:
- Tighten the shared-playhead and timeline zoom proof path, then improve selected-short visualization so the editor makes it obvious what part of the episode is being pulled into each social clip.

## 2026-06-18 15:46 MDT - Selected short pull-out map

Started: 2026-06-18 15:42 MDT
Finished: 2026-06-18 15:46 MDT
Duration: about 4 minutes
Mode: editor UX hardening, social clip visibility
Canonical path: `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio`

What changed:
- Added a selected short pull-out map to the Episode Spine timeline surface.
- The map renders each selected 9:16 short recipe segment as an ordered span over the source episode range.
- Multi-segment shorts now read as recipes made from episode moments, not as chopped source media.

Proof or evidence:
- Canonical build/launch command succeeded:
  `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/build_and_run.sh`

Still risky:
- This pass proves compile/launch, not a human visual smoke of a selected short in the running app.
- The timeline still needs stronger pinch-zoom and shared-playhead proof from direct app interaction.
- Warning debt remains around deprecated SwiftUI `onChange` calls and optional JSON payload coercions.

Lesson:
- Social shorts need to be visible as pull-out recipes. If the user has to mentally translate text rows into episode spans, the editor is still making them carry too much state in their head.

Next:
- Prove and harden shared timeline scrubbing/zooming through the app path, then make selected short segments directly selectable and adjustable from the map/timeline.

## 2026-06-18 15:55 MDT - Shared playhead proof contract

Started: 2026-06-18 15:49 MDT
Finished: 2026-06-18 15:55 MDT
Duration: about 6 minutes
Mode: editor control-plane hardening, semantic smoke
Canonical path: `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio`

What changed:
- Added `sharedPlayheadContract` to the live editor state payload.
- The contract summarizes playhead, source monitor count, playable source count, max source-player delta, timeline zoom state, human proof steps, and Codex proof commands.
- Kept the detailed `sourceSyncProof.samples` intact for deeper debugging.

Proof or evidence:
- Canonical build/launch command succeeded:
  `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/build_and_run.sh`
- Semantic observe showed `sharedPlayheadContract.status = synced`, `passing = true`, `sourceMonitorVideoCount = 4`, and `maxSourcePlayerDeltaSeconds = 0` before scrub testing.
- After `scrub 420` and `program-scroll 5`, live state showed playhead `425`, shared-playhead status `synced`, passing `true`, and max source delta about `0.08s`.

Still risky:
- This proves semantic/app-state sync, not a visual human smoke of dragging and pinching in the window.
- Program scroll and timeline pinch still need direct UI interaction proof after the next interaction pass.
- Warning debt remains in SwiftUI `onChange` calls and optional JSON payload coercions.

Lesson:
- A professional editor needs visible truth, but an AI-editable editor also needs machine-readable truth. The same playhead contract should be inspectable by humans, agents, and future training/evaluation tools.

Next:
- Use direct app interaction to prove timeline drag, program scroll, and pinch zoom from the human path, then tighten any mismatch between physical gestures and semantic commands.

## 2026-06-18 16:16-16:45 MDT - Physical Program Output scroll proof attempt and worklog start

- Built and relaunched canonical QuipslyStudio successfully with `./script/build_and_run.sh`.
- Confirmed only canonical `com.highground.QuipslyMac` app was running; no legacy `apps/quipsly-mac` process.
- Reloaded Episode 1 rescue session and confirmed proxy production readiness remained intact.
- Added a local worklog at `docs/quipsly/quipslystudio-worklog.md` so long development runs have start/finish/proof/risk history.
- Hardened Program Output scroll hit detection and added window-relative UI event helpers.
- Current result: semantic shared-playhead proof passes; physical Program Output scroll still does not move the playhead reliably and remains the next hardening target.

## 2026-06-18 16:33-16:47 MDT - Program Output physical scroll proof passed

- Added a live `programMonitorHitbox` to `/state` so agents and humans can inspect the actual Program Output scroll target.
- Added `script/studioctl.sh ui-scroll-program` and `script/studioctl.sh prove-program-scroll`.
- Validated the canonical app path with `./script/build_and_run.sh` and verified no legacy QuipslyMac process was running.
- `prove-program-scroll` passed: physical scroll over Program Output moved the shared playhead from 2.50s to 18.90s while Source Grove sync stayed passing.
- Remaining hardening target: timeline drag and pinch zoom need the same repeatable proof command and visual/state contract.

## 2026-06-18 16:53 MDT - Lightweight captain's log practice

Started: 2026-06-18 16:50 MDT
Finished: 2026-06-18 16:53 MDT
Duration: about 3 minutes
Mode: process hardening, continuity
Canonical path: `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio`

What changed:
- Clarified that QuipslyStudio keeps two lightweight logs: the production log for milestone narrative and the worklog for operational work blocks.
- Added a worklog practice section with triggers, a short format, and the rule that entries should usually take under two minutes.
- Kept this intentionally non-bureaucratic: capture intent, proof, risk, next move, and approximate time.

Proof or evidence:
- Updated `docs/quipsly/quipslystudio-worklog.md` with the logging practice.
- Did not run a build because this was docs-only.

Still risky:
- Logs can become performative if they are too detailed.
- Logs can become useless if they skip blockers and failed attempts.

Lesson:
- The useful version is a captain's log: enough history to estimate, debug, and feel progress without creating a second job.

Next:
- Continue using the worklog around meaningful editor proof blocks, especially timeline drag, pinch zoom, proxy readiness, export, and publication receipts.

## 2026-06-18 17:41-17:54 MDT - Agent-editable editor proof turn

QuipslyStudio crossed an important line: the running app now has both physical human-path proof and semantic agent-path proof for the shared playhead/editor control layer.

Evidence:
- `prove-timeline-drag` passed against the canonical app. A physical drag over the Episode Spine ruler scrub surface moved the shared playhead from `0.0s` to `37.9s` while source monitor sync stayed passing.
- `prove-agent-test-driver` passed. Codex can load Episode 1, zoom the timeline, scrub/select a real video decision, open the shorts workbench, switch output format, and verify source sync through semantic editor commands.

Product interpretation:
- Agent Test Driver is not a toy. It is the shared command spine for QA, accessibility, keyboard-first editing, collaboration automation, and future learning-from-editor-corrections.
- The next editor phase should use this control plane for a real Codex editorial run, not merely for tests.

## 2026-06-18 18:05 MDT - Agent action receipts become product infrastructure

QuipslyStudio's Agent Test Driver now writes durable proof packets for semantic editor actions. This supports the larger production goal: Codex should be able to edit like a real user while leaving clear proof of observed state, actions taken, safety boundaries, and remaining human-review work.

Product interpretation:
- Receipts make agent editing less magical and more accountable.
- The same structure can power undo history, Mako/Charlie collaboration review, and future ML training data.

## 2026-06-18 18:20 MDT - Agent receipts enter the editor UI

The Agent Test Driver receipt system now has a visible workbench inside QuipslyStudio. This makes agent proof review part of the editor, not an external debugging ritual.

Evidence:
- Canonical app build/run verification passed.
- Agent proof receipt generation passed on `episode-1-codex-original-edit`.
- `left-workbench agent` opened the Agent workbench in the real app.
- Screenshot proof: `/tmp/quipslystudio-agent-workbench-front.png`.

Product interpretation:
- The editor is now closer to a shared human/agent workspace: humans can see Codex receipts; Codex can use the same mode deck humans use.
- Next UI redesigns should treat receipts, decisions, shorts, source monitors, and publish readiness as emotional safety surfaces, not just data panels.

## 2026-06-18 19:18 MDT - Atomic agent edit plans replace command-race rebuilds

Episode 1 was re-rooted from noisy imported decisions into `episode-1-codex-real-edit-v1` using a JSON edit plan applied atomically inside the app. This fixed the command-queue race where hundreds of single `/edit` requests could acknowledge faster than the UI consumed them.

Production implication: future AI/editor/collaboration operations should prefer inspectable edit-plan payloads with receipts over long chains of tiny imperative commands. The user sees a calmer timeline, agents get deterministic proof packets, and protected source media remains untouched.
## 2026-06-19 - Episode 1 proof receipts

Decision:

- Treat `episode-1-codex-real-edit-v1` as the active Episode 1 proof edit branch.
- Treat generated exports as proof artifacts until audio mixdown and full-run review are complete.

Evidence:

- Running app session: `episode-1-codex-real-edit-v1`
- Build path: `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/build_and_run.sh --verify`
- 300-second proof exports:
  - 16:9 `/Users/wall-e/Movies/QuipslyExports/Episode1RealEditProofs/20260619T013216Z/episode-1-codex-real-edit-v1-gap-proof-16x9.mp4`
  - 9:16 `/Users/wall-e/Movies/QuipslyExports/Episode1RealEditProofs/20260619T013216Z/episode-1-codex-real-edit-v1-gap-proof-9x16.mp4`
- Contact sheets visually show real Charlie/Homer camera switching in both aspect ratios.
- Source sync state remained passing after rebuild and relaunch.

Risk:

- MP4 proofs currently preserve two AAC audio streams. Before publication, prefer a single mixed stereo program track unless there is a deliberate multi-audio delivery reason.
- The 300-second proof crosses more editorial state than the 90-second proof, but it is still not a full 36-minute review.

Next production step:

- Add/export a publishable audio mixdown path and generate a longer/fuller Episode 1 review master.

Update:

- ExportEngine now attaches an explicit audio mix to program exports.
- Proof files generated at `/Users/wall-e/Movies/QuipslyExports/Episode1RealEditProofs/20260619T015219Z-audio-mix-test`.
- `ffprobe` confirms the short 16:9 and 9:16 proofs each contain one AAC audio stream and one H.264 video stream.

Remaining production step:

- Regenerate a longer/full Episode 1 review master using the fixed audio-mix export path.

Longer mixed proof:

- Current proof folder: `/Users/wall-e/Movies/QuipslyExports/Episode1RealEditProofs/20260619T015745Z-mixed-gap-proof`
- 16:9 proof: `episode-1-codex-real-edit-v1-mixed-gap-proof-16x9.mp4`
- 9:16 proof: `episode-1-codex-real-edit-v1-mixed-gap-proof-9x16.mp4`
- Both probe as one AAC audio stream plus one H.264 video stream.
- Contact sheets visually show the same valid camera switching and framing as the earlier proof.

Updated remaining production step:

- Review/iterate the edit itself in the app, then generate a full-length mixed-audio review master.

## 2026-06-19 - Episode 1 review-master proof

Proof artifact exists for the current metadata-first Episode 1 edit: `/Users/wall-e/Movies/QuipslyExports/Episode1RealEditProofs/20260619T021041Z-full-review-master`. Both 16:9 and 9:16 review masters probe as H.264 + AAC stereo with visible source switching in contact sheets. Not publication-final yet: audio duration/tail mismatch must be reviewed before release.

## 2026-06-22 - App-owned proxy shorts export path verified

QuipslyStudio's queued-shorts export path now uses an app-owned proxy-first FFmpeg bridge instead of the fragile AVFoundation batch path that could wedge the app/agent server. The Mac app writes an explicit export request JSON, launches `script/shorts_proxy_export.py`, exposes progress/manifest paths through `/state`, and marks each short from the resulting manifest.

Evidence:

- Build/launch verification: `apps/QuipslyStudio/script/build_and_run.sh --verify` passed.
- Helper preflight: `python3 -m py_compile script/shorts_proxy_export.py` passed.
- Agent server stayed responsive: `script/agentctl.sh health` returned `status: ok` before and after export validation.
- Clean app-owned Desktop proof folder: `/Users/wall-e/Desktop/Quipsly-App-Owned-Shorts-Export-Verified-20260622-081914`.
- Episode 1 queued export: 12/12 non-empty MP4 files, manifest status `completed`, failed `0`.
- Episode 2 queued export: 9/9 non-empty MP4 files, manifest status `completed`, failed `0`.
- Episode 3 queued export: 5/5 non-empty MP4 files, manifest status `completed`, failed `0`.
- Total app-owned export proof: 26 MP4 files, 80,838,827 bytes, with one manifest per episode.
- Manifest source policy: `proxy-only; original media untouched`.
- `/state.exportState` includes `manifestPath`, `progressPath`, `bridgeProgress`, `currentItem`, `currentOutputPath`, artifact states, stalled status, and `isExporting` truth.

Important correction discovered during validation:

- `load-session` is asynchronous. Running export immediately after a load command can race and export the previously active session. `script/agentctl.sh load-session-wait <session> [timeout]` was added so future automation waits until `/state.activeSessionName` matches the expected session before exporting.

Product interpretation:

- Final master export can remain strict about unresolved source recovery, but proxy shorts export should not be blocked by unrelated missing Premiere placeholder lanes. The short-export gate now allows production-ready sessions or sessions with available proxy editing; the manifest still reports exact per-short failures if a specific recipe needs missing media.

Remaining hardening candidates:

- Convert selected-short export to the same proxy bridge or add an explicit fallback when AVFoundation fails.
- Add cancel/retry controls around bridge exports.
- Add a dedicated manifest/recovery viewer in the UI rather than showing only compact path rows.

### 2026-06-22 - Episode 1 editor loop proof and agent accessibility pass

Goal: make Episode 1 editing loop publication-real and human/agent usable.

Changed:
- Added `/editor_loop_proof` plus `script/agentctl.sh editor-loop-proof` as compact read-only agent proof.
- Updated Episode 1 architecture/production smoke contracts to accept current `Audio proxy-safe` readiness.
- Tightened main timeline/shorts language from hidden SHOW jargon toward visible user terms: gold visible spans, red clay skipped spans, green short recipe rails.
- Kept SHOW/SKIP as model terms where appropriate.

Validated:
- `./script/build_and_run.sh --verify` passed.
- `script/smoke_episode1_editor_architecture.sh --no-build` passed.
- `script/smoke_episode1_production_ready.sh --no-build` passed.
- `script/smoke_episode1_transports.sh` passed: Play Edit 33 ranges, Play Through 1 range, restored Play Edit 33 ranges.
- `script/smoke_episode1_scrub_monitor_sync.sh` passed: 3 source players, max source delta 0.001-0.002s.
- `script/smoke_episode1_program_scroll.sh` passed: Program Output scroll moved the shared playhead and kept source delta ~0.000708s.
- `script/smoke_episode1_timeline_zoom.sh` passed: fit/cut/frame/set/in/out kept monitor sync.
- `script/smoke_episode1_selected_decision_precision.sh` passed: nudge/trim/restore kept counts stable.
- `script/smoke_episode1_short_clip_queue.sh` passed.

Notes:
- Compact proof endpoint is intentionally read-only and should become the default agent preflight.
- Endpoint currently reports source monitor counts, but detailed source-player deltas are still proven by smoke scripts; future pass can persist/expose last sync proof in compact state.
- Visual design is clearer, not final. Next UX pass should further reduce visible SHOW/SKIP jargon and improve left/sidebar density.

### 2026-06-22 - Episode 1 shorts publication-real proof pass

Goal: make Episode 1 shorts usable to discover, inspect, refine, export, and prepare as real social clips while preserving Quipsly's whole-source metadata model.

Changed:
- Added a visible Publication Passport for selected shorts and compact passport chips on short cards: platform target, score, readiness, export proof, missing items, and next action.
- Added `publicationPassport` payloads to short queue/selected-short state so humans and agents can inspect review/export/platform readiness without guessing.
- Converted selected-short export to the app-owned proxy bridge path used by batch shorts export. Selected exports now write request/progress/manifest JSON and derivative MP4s without touching original media.
- Hardened `/shorts_export_selected` and `script/agentctl.sh shorts-export-selected` so agent commands carry selected short id/title instead of relying on delayed global selection state.
- Made `/state` and `/health` respond from a cached status payload so export progress stays observable while the main actor is busy.
- Updated `script/smoke_episode1_short_export.sh` to follow the agent control contract: add a range, wait for state proof, then export.

Episode 1 proof shorts:
- `The Wednesday Rule opening` -> `/Users/wall-e/Library/Application Support/Quipsly/MediaVault/exports/short-review/episode-1-premiere-rescue-The-Wednesday-Rule-opening-9x16-short.mp4`
- `Ask why, not just what` -> `/Users/wall-e/Library/Application Support/Quipsly/MediaVault/exports/short-review/episode-1-premiere-rescue-Ask-why-not-just-what-9x16-short.mp4`
- `Mentorship is attention` -> `/Users/wall-e/Library/Application Support/Quipsly/MediaVault/exports/short-review/episode-1-premiere-rescue-Mentorship-is-attention-9x16-short.mp4`

Validated:
- `./script/build_and_run.sh --verify` passed through the real QuipslyStudio app path.
- `script/smoke_episode1_short_export.sh --no-build` passed; it created a temporary selected 9:16 short, exported a non-empty proxy derivative, and removed the temp short.
- `script/smoke_episode1_short_clip_queue.sh` passed; temporary queue item was removed successfully.
- Final Episode 1 shorts queue contains exactly 3 real review candidates, all `exported`, all still `draft`, all with existing proof files and `publicationPassport.exportProofReady = true`.

Product truth:
- These shorts are review-ready derivatives, not publication-approved posts. Next human/agent action is to watch/listen, mark Keep/Refine/Reject, then package for Tower/social distribution.
- Source media remains whole. Shorts are ordered sequence-time recipes over proxy-backed source lanes.

### 2026-06-23 - Episodes 1-3 shorts readiness board

Goal: make the first three episodes visible as one publication-real shorts lane, not three scattered session files or a live-app-only Episode 1 board.

Changed:
- Added `script/episodes_shorts_readiness.py`, a saved-session scanner that reads explicit `project.sequences[*].shortClipQueue` truth instead of fuzzy-recursing through timeline edit decisions.
- Added `script/shortsctl.sh episodes-readiness` for a running-app-independent operator report.
- Added `script/agentctl.sh episodes-shorts-readiness` so Codex/agents can inspect Episodes 1-3 shorts readiness without fragile OS mouse control.
- Generated current-state artifacts:
  - `docs/quipsly/current-state/episodes-1-3-shorts-readiness.json`
  - `docs/quipsly/current-state/episodes-1-3-shorts-readiness.md`
  - `docs/quipsly/current-state/episodes-1-3-shorts-readiness.html`

Evidence:
- `python3 -m py_compile script/episodes_shorts_readiness.py` passed.
- `./script/build_and_run.sh --verify` passed through the real QuipslyStudio app path.
- `./script/agentctl.sh health` returned `status: ok` on port `8080`.
- `./script/agentctl.sh episodes-shorts-readiness --json ...` returned `27` total shorts across Episodes 1-3.
- Episode coverage from saved sessions:
  - Episode 1: `13` shorts, `12` exported by status, `12` local exported files, status `needs-human-review`.
  - Episode 2: `9` shorts, `5` exported by status, `5` local exported files, status `needs-human-review`.
  - Episode 3: `5` shorts, `5` exported by status, `5` local exported files, status `needs-human-review`.
- Platform packaging metadata exists for all `27` current short candidates.

Important correction:
- The first draft of the report incorrectly counted `not-exported` as exported because it used substring matching. The parser now treats negative export states explicitly before accepting `exported`/`completed` states. Tiny parser bugs are product trust bugs.

Product truth:
- Episodes 1-3 now satisfy the minimum visible candidate target (`>=5` shorts each), but the board correctly keeps all three in `needs-human-review` until the exported files are watched/listened to and marked Keep/Refine/Reject.
- This is a readiness and operator visibility improvement. It does not publish, approve, mutate source media, or convert shorts into chopped clips.

Next practical action:
- Use the readiness board to choose the next batch of shorts to watch/listen/reframe, then mark Keep/Refine/Reject and promote the best clips toward Tower/social publishing.

### 2026-06-23 - Short card next-action visibility pass

Goal: reduce shorts-review anxiety by making each short card answer the practical operator question: what moment is this, what is the hook, and what should happen next?

Changed:
- Added a `Review this moment` banner to each short workbench card in `WorkspaceView`.
- The banner surfaces the episode source range, the best available hook/overlay/caption/title text, and the safest next production action from the short quality/readiness model.
- Added a stable accessibility identifier per short card banner so agent/human tooling can locate the same truth surface.

Validated:
- `./script/build_and_run.sh --verify` passed through the real QuipslyStudio app path.
- `./script/agentctl.sh health` returned `status: ok` on port `8080`.
- `./script/agentctl.sh episodes-shorts-readiness --json ...` still reports `27` total shorts across Episodes 1-3, with `13/9/5` candidates respectively.
- `./script/agentctl.sh shorts-select index 1` followed by `editor-loop-proof` selected `Test Short - Wednesday Rule moment` and exposed review `needs-captions`, export `exported`, primary platform `Instagram/Facebook Reels`, and next action `Watch the proof file and resolve the missing items before publishing.`

Product truth:
- This does not publish or approve anything. It makes the review/editing surface more honest: a short card now shows why the moment might work and what to do next before it can move toward Tower/social publishing.
- Source media remains whole; shorts remain metadata recipes over sequence time.

### 2026-06-23 - Visible short in/out refinement controls

Goal: make short refinement feel like editing instead of hunting through hidden menus.

Changed:
- Promoted short recipe in/out edge nudges from a hidden `Nudge` menu into visible card-level controls.
- Each short card now exposes `In -1`, `In -0.1`, `In +0.1`, `In +1`, `Out -1`, `Out -0.1`, `Out +0.1`, and `Out +1` as direct refinement controls.
- Added stable accessibility identifiers for the refinement group and each boundary nudge button so human and agent workflows can target the same controls.

Validated:
- `./script/build_and_run.sh --verify` passed through the real QuipslyStudio app path.
- `./script/agentctl.sh health` returned `status: ok` on port `8080`.
- `./script/agentctl.sh shorts-select index 1` followed by `editor-loop-proof` selected `Test Short - Wednesday Rule moment` with review `needs-captions`, export `exported`, and next action `Watch the proof file and resolve the missing items before publishing.`
- `./script/agentctl.sh episodes-shorts-readiness --json ...` still reports `27` total shorts across Episodes 1-3, with `13/9/5` candidates respectively.

Product truth:
- This does not change the core media model. The buttons adjust short recipe metadata only; whole synced source lanes and original media stay intact.
- The refinement loop is now more visible: cue, preview, export, review, then nudge in/out points without leaving the short card.

## 2026-06-23 - Agent-safe short range refinement proof

- Active lane: Episode 1 shorts/editor control surface.
- Added explicit agent commands for selected-short range control: `shorts-nudge-selected start|end <delta>` and `shorts-set-selected start|end <time>`.
- Hardened the HTTP-to-editor command bridge so selected short range updates carry projected short id/title hints instead of relying on stale SwiftUI sidebar selection.
- Added `apps/QuipslyStudio/script/smoke_episode1_short_refinement.sh` as a real app-path proof: select a short recipe, nudge start, restore start, nudge end, restore end, then verify source media remains untouched.
- Validation run: `./script/build_and_run.sh --verify` passed, then `./script/smoke_episode1_short_refinement.sh` passed against `http://127.0.0.1:8080`.
- Evidence: Farm Work Teaches Stewardship was nudged from `524.357 -> 524.457`, restored to `524.357`, nudged end from `547.005 -> 546.905`, and restored to `547.005`.
- Lesson: editor commands are asynchronous UI-driven operations. Agent smoke tests need evidence windows and explicit target ids, not immediate ack-only assumptions.
- Next proof lane candidate: Episode 6 has the most complete media set. Start by syncing Charlie video, Homer Insta360 video, and possibly call audio as the spine/context layer. Treat external clips as contextual weave-ins over the conversation instead of hard "we watched this whole thing" blocks.

## 2026-06-23 - Agent-safe selected-short metadata and cue controls

- Active lane: Episode 1 shorts publication workflow and agent-accessible refinement controls.
- Hardened selected-short metadata updates so `/shorts_queue_update_selected` carries explicit projected short id/title hints instead of trusting stale SwiftUI sidebar selection.
- Hardened selected-short preview/cue commands the same way so agent commands can target the intended short recipe by id.
- Added friendly CLI aliases: `shorts-rename-selected`, `shorts-set-selected title|hook|caption|overlay|notes`, `shorts-cue-selected`, `shorts-jump-selected`, and `shorts-play-selected`.
- Added `apps/QuipslyStudio/script/smoke_episode1_short_metadata_controls.sh`.
- Validation run: `./script/build_and_run.sh --verify` passed.
- Validation run: `./script/smoke_episode1_short_metadata_controls.sh` passed. It selected `Farm Work Teaches Stewardship`, temporarily renamed it, restored the title, moved playhead away to `531.357`, then cued back to `524.357`.
- Validation run: `./script/smoke_episode1_short_refinement.sh` passed after the resolver refactor. It nudged/restored start and end boundaries for the same short without touching source media.
- Validation run: `./script/shortsctl.sh local-export-board --json` emitted parseable JSON with 13 cards.
- Known follow-up: `/state.lastMediaAction` can lag behind cue commands even when command receipt and playhead evidence prove the cue worked. Treat playhead + command receipt as stronger evidence until cached status messaging is tightened.

## 2026-06-23 - Episode 6 first sync stack

- Active lane: Episode 6 media intake and whole-source sync stack.
- Added `apps/QuipslyStudio/script/build_episode6_sync_stack.py` to create a native Quipsly session from `/Volumes/My Passport/Episode 6` without copying, trimming, or mutating originals.
- Generated session: `/Users/wall-e/Library/Application Support/Quipsly/MediaVault/sessions/episode-6-sync-stack-v1.quipsly-session.json`.
- Generated report: `apps/QuipslyStudio/reports/episode-6-sync-stack-v1-report.json`.
- Generated current-state note: `docs/quipsly/current-state/episode-6-sync-stack-v1.md`.
- The stack contains 16 whole-source lanes: 6 candidate lanes, 10 held lanes, 3 proxy-ready Homer LRV-backed lanes, and 9 video lanes still needing deterministic proxies before serious editing.
- Sync truth: CharlieVideo.mp4 is the provisional visual timebase; Homer Insta360 offsets are inferred from embedded LRV creation times relative to Charlie; phone call audio is the provisional conversation spine but still needs waveform sync proof; HQ WAV #03 is held as likely final-quality audio until aligned.
- Product truth: this is a sync stack, not a final edit. Context clips are held as weave-in candidates; SHOW/SKIP decisions should be created after sync proof and conversation review. Whole sources remain intact.

### Episode 6 sync stack decoder fix

- The first Episode 6 session file was Python-valid JSON but failed Swift `NativeEditorSession` decode because `editPassContext.updatedAt` was required by `EditPassContext`.
- Updated `build_episode6_sync_stack.py` to emit both `startedAt` and `updatedAt`, then regenerated the session/report/current-state note.
- Lesson: Python JSON validation is not enough for native session proof. Swift model decode is the correct gate before claiming a session can load in the app.

## 2026-06-23 - Episode 6 sync stack proxy proof

- Built and loaded `episode-6-sync-stack-v1` from `/Volumes/My Passport/Episode 6` as a whole-source native Quipsly session.
- Generated a managed vault proxy for `CharlieVideo.mp4` from a 45GB 4K source to `/Users/wall-e/Library/Application Support/Quipsly/MediaVault/proxy/3206fd92ce6604eb/CharlieVideo_proxy.mp4`; original source was not mutated.
- Generated managed vault proxies from Homer Insta360 LRV sidecars for the three INSV source segments, keeping the raw INSV files as canonical sources and the MP4 proxies as editor playback surfaces.
- Updated `build_episode6_sync_stack.py` so Homer lanes use deterministic vault-managed LRV proxies instead of raw `.lrv` sidecars as proxy URLs.
- Verified the session decodes through `QuipslyVideoCore` and loads in the running app with 16 whole-source lanes.
- Visual app proof: at sequence time 648.00s, Charlie is visible in Program Output while Homer Insta360 Segment 1 is visible in Source Grove at source time 0.00s, proving the rough offset mapping is active.
- Remaining work: audio/context proxy readiness, waveform/fingerprint alignment, visual confirmation of Homer segment offsets, then real SHOW/SKIP decisions and contextual clip weaving.

## 2026-06-23 - Episodes 1-3 shorts readiness/report truth pass

- Returned focus to the active shorts goal after Episode 6 sync-stack work.
- Fixed `shorts_board_common.py` so report tooling prefers authoritative `clips`/`shorts` rows and no longer mistakes nested platform-target rows for actual short clips.
- Added timeline range, hook, overlay/caption, and platform target fields to classified short cards so reports answer what moment the short maps to and what packaging still needs work.
- Improved `shorts_local_export_board.py` cards/Markdown to show source ranges, platforms, hook, and overlay status.
- Added top-level count fields to `shorts_mission_control.py` and `episodes_shorts_readiness.py` for agent-friendly inspection.
- Fixed `episodes_shorts_readiness.py` repo-root detection so generated current-state packets land under `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state`, not `/apps/docs`.
- Validation: `python3 -m py_compile` passed for touched shorts scripts.
- Validation: `script/shortsctl.sh episodes-readiness --json` produced `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episodes-1-3-shorts-readiness.{json,html,md}` with `27` shorts, `3` episodes with at least five shorts, `22` local exported files detected, and `27` platform-packaged candidates.
- Validation: `apps/QuipslyStudio/script/build_and_run.sh --verify` exited successfully; post-launch `agentctl health` returned `status: ok`.
- Current gaps: Episode 1 has one missing export; Episode 2 has four missing exports and one unresolved Premiere placeholder lane; Episode 3 has five exported candidates but still needs visual/listen/hook/overlay review. The false Episode 3 ghost/unknown-short report is fixed.

## 2026-06-23 - Episode 6 intake note

Read-only inventory found a stronger Episode 6 proof lane at `/Volumes/My Passport/Episode 6`: Charlie video, Homer Insta360 `.insv` chunks with LRV companions, phone/call recordings, Logic/WAV exports, and reference clips. Wrote `docs/quipsly/current-state/episode-6-intake-plan.md` with the proposed sync order: temporary spine first, Charlie aligned first, Homer chunks stacked and nudged independently, reference clips held for editorial weave-ins. Originals remain untouched.

## 2026-06-23 - Shorts export evidence ladder

Continued the Episodes 1-3 shorts publication-real lane in `apps/QuipslyStudio`.

What changed:
- Updated shorts board/export commands to use explicit short IDs: `script/agentctl.sh shorts-export-selected <outputDir> <basename> id <shortId>`. This avoids fragile UI selection state.
- Made the readiness board detect expected local export files even when the session metadata has not yet persisted the export path.
- Added durable contact-sheet fields to shorts readiness cards: `contactSheetPath` and `contactSheetExists`.
- Added durable audio-sanity fields to shorts readiness cards: `audioSanityPath` and `audioSanityExists`.
- Changed stage semantics so a short with contact-sheet proof advances from `exported-needs-visual-review` to `exported-needs-listen-through` when visual proof exists; if audio sanity also exists, the next action says to watch/listen through and mark keep/refine/reject.

Evidence generated:
- Episode 1: 1 newly exported short has a durable contact sheet and audio-sanity receipt.
- Episode 2: 4 newly exported shorts have durable contact sheets and audio-sanity receipts.
- Episodes 1-3 readiness now reports 27 total shorts and 27 detected local exported files.
- Current stage ladder: 22 `exported-needs-visual-review`, 5 `exported-needs-listen-through`.

Validation:
- `python3 -m py_compile script/shorts_board_common.py script/shorts_local_export_board.py script/shorts_mission_control.py script/episodes_shorts_readiness.py`
- `./script/shortsctl.sh episodes-readiness --json`
- `./script/build_and_run.sh --verify`
- `./script/agentctl.sh health`

Remaining gap:
- 22 exported shorts still need durable contact sheets before they can move to listen-through review.
- The 5 evidence-backed shorts still need actual watch/listen-through judgment before keep/refine/reject or publishing queue movement.

## 2026-06-23 - Episodes 1-3 shorts evidence complete

Continued the publication-real shorts lane for Episodes 1-3.

What changed:
- Generated durable contact sheets for every remaining exported short that lacked visual evidence.
- Generated durable audio-sanity receipts for every remaining exported short that lacked objective audio evidence.
- Regenerated the broad Episodes 1-3 readiness board in JSON, HTML, and Markdown.

Current broad readiness truth:
- 27 total shorts across Episodes 1-3.
- 27/27 local exported files detected.
- 27/27 durable contact sheets detected.
- 27/27 durable audio-sanity receipts detected.
- 27/27 platform-packaged entries visible.
- Stage ladder is now 27 `exported-needs-listen-through`.

Interpretation:
- Machine evidence is complete for the first 27 shorts.
- No short has been auto-approved. The next required step is actual watch/listen-through and keep/refine/reject judgment.
- `shortsctl local-export-board`, `growth-quality-board`, and `platform-package-board` currently operate on the active app session queue even though older filenames can imply Episodes 1-3 scope. The broad proof surface for this goal is `episodes-readiness`.

Validation:
- `python3 -m py_compile script/shorts_board_common.py script/shorts_local_export_board.py script/shorts_mission_control.py script/episodes_shorts_readiness.py`
- `./script/shortsctl.sh episodes-readiness --json`
- `./script/shortsctl.sh episodes-readiness --html`
- `./script/shortsctl.sh episodes-readiness --md`
- `./script/build_and_run.sh --verify`
- `./script/agentctl.sh health`

Next best target:
- Build or tighten a listen-through review queue so each evidence-backed short can be opened, judged, and marked keep/refine/reject without hunting through JSON or filesystem paths.

## 2026-06-23 - Episodes 1-3 listen-through review board

Added a broad Episodes 1-3 listen-through review board for the shorts publication-real lane.

What changed:
- Added `script/shorts_listen_review_board.py`.
- Added `script/shortsctl.sh listen-review-board [--json|--html|--md]`.
- Generated durable review artifacts:
  - `docs/quipsly/current-state/episodes-1-3-shorts-listen-review-board.json`
  - `docs/quipsly/current-state/episodes-1-3-shorts-listen-review-board.html`
  - `docs/quipsly/current-state/episodes-1-3-shorts-listen-review-board.md`

Current review-board truth:
- 27 shorts.
- 27 exports.
- 27 contact sheets.
- 27 audio-sanity receipts.
- 27 ready for listen-through.
- 0 listen-through decisions recorded.

Product behavior:
- The board is read-only over exported derivatives and evidence artifacts.
- It does not mutate original media, mark listen-through complete, approve shorts, or publish.
- Each card includes session-aware commands so the operator/agent loads the correct episode session before selecting, previewing, jumping, or marking a short.

Validation:
- `python3 -m py_compile script/shorts_listen_review_board.py script/shorts_board_common.py`
- `bash -n script/shortsctl.sh`
- `./script/shortsctl.sh listen-review-board --json`
- `./script/shortsctl.sh listen-review-board --html`
- `./script/shortsctl.sh listen-review-board --md`
- `./script/build_and_run.sh --verify`
- `./script/agentctl.sh health`

Next best target:
- Use the listen-through board to review the first batch of shorts and record actual keep/refine/reject decisions, or tighten the in-app Shorts panel so this board is visible and operable from inside Quipsly Studio.

## 2026-06-23 - Listen-through board surfaced in Quipsly Studio

Tightened the Episodes 1-3 shorts listen-through lane so the review board is no longer hidden in generated files only.

What changed:
- Added a visible Listen-through board card to the Quipsly Studio Shorts sidebar.
- The card reads the generated board snapshot from `docs/quipsly/current-state/episodes-1-3-shorts-listen-review-board.json`.
- The card shows counts for shorts, exports, contact sheets, audio receipts, ready-for-listen-through items, and recorded listen-through decisions.
- Added native actions to open the HTML board, copy the regenerate command, and copy JSON/HTML/Markdown artifact paths.

Current product truth:
- The board remains read-only over exported derivatives and evidence artifacts.
- It does not mutate source media, mark review complete, approve shorts, or publish.
- Episode 6 is queued as the next messy real-sync proving lane after the current Episodes 1-3 shorts/listen-through surface is stable. Start there by syncing Charlie video, Homer Insta360, and call audio, then weave source clips as contextual inserts; high-quality audio can come later.

Validation:
- `python3 -m py_compile script/shorts_listen_review_board.py script/shorts_board_common.py`
- `bash -n script/shortsctl.sh`
- `./script/shortsctl.sh listen-review-board --json`
- `./script/shortsctl.sh listen-review-board --html`
- `./script/shortsctl.sh listen-review-board --md`
- `./script/build_and_run.sh --verify`
- `./script/agentctl.sh health`

Next best target:
- Use the in-app board to start real listen-through judgments, or move to Episode 6 sync once the shorts judgment lane is acceptable.

## 2026-06-23 - Broad listen-through next target and safe cue control

Strengthened the Episodes 1-3 shorts listen-through workflow so the broad review board is actionable instead of passive.

What changed:
- Added `nextReadyCard` to `episodes-1-3-shorts-listen-review-board.json`.
- Added `--next-json` and `--next-md` modes to `script/shorts_listen_review_board.py`.
- Added `script/shortsctl.sh listen-review-next [--md|--json|--open-evidence|--open-export|--open-contact-sheet|--cue|--preview]`.
- Updated broad board review commands so keep/refine/reject first load and select the correct source session, then call `shorts-review-selected`; this avoids cross-episode review mutations when the app is currently on another episode.
- Added longer `QUIPSLY_AGENT_TIMEOUT=60` session-load commands for broad listen-through helpers because full editor session loads can exceed the default health/read timeout.
- Updated generated HTML to feature the next ready listen-through target and its commands at the top of the board.

Validated next target:
- Current broad next target: Episode 1 Word-Timed Proof Short.
- Source session: `episode-1-codex-real-edit-v1-youtube-wordtimed`.
- Short id: `8F4A6296-A542-49B5-A6AC-7D6A712474AA`.
- Counts remain: 27 shorts, 27 exports, 27 contact sheets, 27 audio sanity receipts, 27 ready for listen-through, 0 listened.

Control-plane finding:
- First cue attempt timed out at the default 15 seconds while loading the Episode 1 session, but the app stayed healthy.
- After adding the longer timeout, `./script/shortsctl.sh listen-review-next --cue` successfully loaded the Episode 1 session, selected the short, and scheduled the non-playing preview cue.

Validation:
- `python3 -m py_compile script/shorts_listen_review_board.py script/shorts_board_common.py`
- `bash -n script/shortsctl.sh`
- `./script/shortsctl.sh listen-review-next --json`
- `./script/shortsctl.sh listen-review-next --md`
- `./script/shortsctl.sh listen-review-board --html`
- `./script/build_and_run.sh --verify`
- `./script/agentctl.sh health`
- `./script/shortsctl.sh listen-review-next --cue`

Truth:
- `listen-review-next --cue` mutates only app selection/playhead preview state. It does not mark listen-through complete, approve, publish, upload, schedule, or mutate original media.

Next best target:
- Either start real listen-through on the first ready short and record keep/refine/reject, or add an in-app first-ready card action if we want the whole flow clickable inside the Shorts workbench before judging.
## 2026-06-23T22:42:25-06:00 - Episode 5 sync-stack truth and Episode 1 short repair

- Episode 5 is no longer an unknown folder. Built `episode-5-sync-stack-v1` from `/Volumes/My Passport/Episode 5` as whole-source lanes and loaded it in Quipsly Studio.
- Episode 5 source truth: 10 lanes total, 6 production candidate lanes, 4 held context clips, sequence duration 6358.435s, and Homer Insta360 sequential LRV proxy coverage of 5475.776s.
- Remuxed four Homer LRV sidecars into managed MP4 proxies in MediaVault without touching raw originals. The session now reports 4 source monitor videos and `visualRoughCutReady=true`.
- Stopped the first full-span `MVI_4011.mp4` proxy attempt because it was too slow and would have monopolized the goal. Logged the remaining blocker: Episode 5 still needs one predictable full-length proxy for `CharlieVideo.mp4` or `MVI_4011.mp4` before long-form/short exports should proceed.
- Repaired Episode 1 v001 short handoff: short 04 was restored from an older matching proof run; short 03 was filled with a valid Episode 1 fallback proof short because all matching short-03 sources found failed ffprobe. Manifest now reports 5/5 valid shorts.
- Episode 1 caveat remains explicit: v001 long-form artifacts are proof-only, not full manual-publishable episode masters, and short 03 needs creative review/regeneration.
- Updated `/Users/wall-e/Desktop/Quipsly_Episode_Export_Blockers.md`, Episode 1 manifest/notes, and Episode 5 manifest/notes so the next pass can continue without rediscovering this truth.
## 2026-06-23T23:12:07-06:00 - Episode 5 long-source proxy strategy tightened, full run still blocked

- Added configurable draft proxy controls to `script/create_proxy_for_file.py`: video scale, output FPS, and optional hardware acceleration can now be set by environment instead of being hard-coded.
- Benchmarked 30-second Episode 5 samples from `MVI_4011.mp4` and `CharlieVideo.mp4`; both completed successfully at 640px / 15fps / h264_videotoolbox in roughly 12 seconds.
- Attempted the full `MVI_4011.mp4` draft proxy. It initially wrote data but stalled around 28 MB with ffmpeg in uninterruptible I/O wait and no file growth, so the attempt was stopped and the partial was removed.
- Current Episode 5 truth: the sync stack and Homer LRV review proxies are useful, but long-form export remains blocked until one full-span host/source proxy is created through a safer strategy.
- Next proxy strategy should be copy-to-scratch, alternate `CharlieVideo.mp4`, or chunked/resumable proxy generation. Do not blindly rerun the same MVI full-proxy command.


## 2026-06-23T23:42:16-06:00 - Episode 6 v001 artifacts exported; wrapper finalization needs repair

- Reloaded Quipsly Studio through `./script/build_and_run.sh --verify` after the visible app reported a stale `Load session failed: The data couldn't be read because it is missing` modal.
- Verified `episode-6-sync-stack-v1` loads in the live app: 16 lanes, 4 video source monitors, 4 video proxies ready, 6 queued shorts, and `productionReady=true` after proxy preparation.
- Exported Episode 6 v001 proof artifacts into `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_06/v001`:
  - `video/episode-06-v001-16x9.mp4`
  - `video/episode-06-v001-9x16.mp4`
  - `audio/episode-06-v001-podcast-audio.m4a`
  - six 9:16 shorts in `shorts/`
- ffprobe validated the 16:9 master as H.264 1920x1080 with AAC stereo at 4454.20s, the 9:16 master as H.264 1080x1920 with AAC stereo at 4454.20s, and podcast audio as AAC stereo at 4454.25s.
- Current caveat: the release wrapper process did not exit cleanly because the finalization receipt stayed `running` even though the manifest says `v001-full-artifacts-exported-needs-review` and media artifacts validate. Treat this as an orchestration/receipt bug, not a failed export.

## 2026-06-24T00:13:09-06:00 - Episode 6 v001 root full-release completed

- Correction to the prior mid-export note: the root full-release task was slow, not failed. The shell waiter timed out while the app continued rendering.
- Final receipt: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_06/v001/episode-06-v001-full-release-release-finalization-receipt.json` reports `status=completed`, `phase=completed`, and `9/9 artifact(s) ready`.
- Filled the compact wait receipt and wrote ffprobe validation to `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_06/v001/episode-06-v001-full-release-ffprobe-validation.json`.
- Validated root artifacts: 16:9 master, 9:16 master, podcast audio, and six 45s 9:16 shorts.
- Current truth: Episode 6 v001 has real local review artifacts and handoff packets. It still needs human creative review before publishing.

## 2026-06-24T00:18:00-06:00 - Release wrapper wait hardening

- Hardened `script/agentctl.sh release_export_prepare` after Episode 6 proved full exports can outlive short wait windows.
- For `full` exports, omitted wait seconds now defaults to 7200 seconds instead of 180 seconds.
- `wait_export` timeouts no longer abort release manifest/report generation under `set -e`; the wait receipt is preserved and later review can distinguish slow rendering from real failure.

## 2026-06-24 00:51:22 MDT - Episode 1 v002 proof release tolerance verified

- Built and launched Quipsly Studio through `./script/build_and_run.sh --verify` after hardening release prep for invalid short recipes.
- Loaded `episode-1-codex-real-edit-v1-youtube-wordtimed` and ran proof release prep to `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_01/v002`.
- Result: release prep completed and produced 15 playable proof media files: 16:9 proof, 9:16 proof, podcast audio proof, and 12 valid 9:16 short proofs.
- Receipt confirms one invalid short was skipped rather than blocking the release: `Episode 1 Review Candidate 01 - 04:27` (`0F028DF4-76EF-4245-9349-1EE266C1AAEB`).
- Product meaning: malformed short recipes are now visible repair items, not episode/audio release blockers.

## 2026-06-24T01:09:00-06:00 - Release wrapper truth hardening

- Hardened `script/agentctl.sh release_export_prepare` after Episode 1 v002 proof exports showed artifact truth and wrapper truth could diverge.
- Release prep now gives full-release prepare, delivery packet, publish packet, podcast packet, and artifact-smoke calls a longer `QUIPSLY_RELEASE_PREP_TIMEOUT` window instead of the default 15-second agent health timeout.
- Release manifest generation now classifies a run as `completed-artifacts-ready` when the app state still lags but every planned local derivative exists and is non-empty.
- Release smoke now accepts `completed` or `completed-artifacts-ready`, while still requiring every planned artifact to exist.
- Remaining caveat: existing folders created before this patch may still have stale or missing `latest-release-export-manifest.json`; regenerate release prep for canonical handoff folders when needed.

## 2026-06-24T01:21:00-06:00 - Episode 5 chunked proxy strategy started

- Added `script/create_chunked_proxy_for_file.py` for resumable huge-source proxy generation.
- The script writes deterministic chunks under the Quipsly MediaVault proxy folder and concatenates only after all chunks exist.
- Smoke-tested `CharlieVideo.mp4` from Episode 5: the first three 60-second chunks generated successfully with `h264_videotoolbox` at 640px / 15fps.
- Started a background full proxy job for `/Volumes/My Passport/Episode 5/CharlieVideo.mp4` using 60-second chunks.
- Job PID is stored at `reports/proxy-jobs/episode-5-charlie-chunked-proxy.pid`; latest logs match `reports/proxy-jobs/episode-5-charlie-chunked-proxy-*.log`.
- Product meaning: Episode 5 is still waiting on a completed long-source proxy, but it now has a resumable path instead of a single fragile full-length transcode.

## 2026-06-24T08:24:54Z - Episode 5 managed audio spine + proof release
- Created and attached a managed audio-spine proxy for Episode 5 so release export no longer depends on original media audio.
- Release smoke passed for `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_05/v001`: 16:9, 9:16, 5 social-short proofs, and podcast audio are present.
- Proof exports remain non-publication artifacts until receipts/URLs are captured.

## 2026-06-24T08:32:06Z - Episode 4 proof-release package passed
- Episode 4 now has a smoke-passing local release proof in `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_04/v001`: 16:9, 9:16, 5 social-short proofs, and podcast audio.
- Proof exports remain non-publication artifacts until receipts/URLs are captured.

## 2026-06-24T03:57:35-06:00 - Manual publish packet reconciliation

- Added `script/refresh_release_manifest.py` to refresh release manifests from disk without re-rendering media.
- Refreshed Episode 5 full-release manifest from stale 7/8 to current 8/8 artifact truth; `release-export-smoke` now passes against `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_05/v001`.
- Added `script/write_episode_publish_packet.py` to write `manifest.json`, `notes.md`, and `sync-gap-report.md` for each episode version from artifact/session truth.
- Rebuilt v001 packet files for Episodes 1-6. Current status: Episode 1 needs work because it only has proof-style long-form video; Episodes 2, 3, 5, and 6 are local manual-review-ready; Episode 4 is local manual-review-ready with a 2023.776s video/audio duration mismatch warning.
- Publication truth remains separate: these packets prove local derivative readiness only, not upload/schedule/public URL receipts.

## 2026-06-24 - Episode 6 non-modal session-load hardening

- Hardened `WorkspaceView.loadNativeSession` so agent-driven and launch-restore session loads report failures through editor state instead of blocking the visible editor behind a modal.
- Kept manual session-picker failures modal so Charlie still gets direct feedback when a clicked session truly cannot load.
- Expanded native session load diagnostics to include the session name, session file path, file size when present, and unwrapped decoding context when available.
- Validated through `./script/build_and_run.sh --verify` and `./script/agentctl.sh load-session-wait episode-6-sync-stack-v1 45`.
- Confirmed Episode 6 settles to `productionReady=true` after async audio proxy validation and remains visible in the running app without the stale `Load session failed` alert.

## 2026-06-24 - Episode 1 v003 release artifact salvage

- Reconciled `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_01/v003` after the original full release worker failed before podcast audio and three planned shorts.
- Exported `episode-01-v003-full-release-podcast-audio.m4a` via the audio-only export path without rerendering completed long-form video masters.
- Exported missing selected shorts 11-13 individually through the proxy-only selected-short worker and copied each result into the planned release filenames.
- Updated `refresh_release_manifest.py` so a failed/stalled manifest can be promoted to `completed-artifacts-ready` only when all planned local artifacts exist and are non-empty; the original failed status is preserved in `exportStatusBeforeRefresh`.
- Validated Episode 1 v003 with `release-export-smoke`: 15/15 planned artifacts ready, all known files exist, publication still receipt-bound.
- Current review note: publish packet reports `manual-review-ready` with a 128.792s long-form video/audio duration spread that should be reviewed before actual publication.

## 2026-06-24 - Episodes 1-6 local release status board

- Refreshed publish packets for the current best local export versions: Episode 1 v003; Episodes 2-6 v001.
- Wrote `/Volumes/My Passport/Episode_and_Shorts_Test/release-status.json` and `release-status.md` as the external-drive truth board.
- Current board: Episodes 1-6 all have local manual-review-ready packages with long-form video, audio-only podcast/RSS files, at least five shorts, manifest, notes, and sync-gap report.
- Warnings remain review-facing, not artifact blockers: Episode 1 has a 128.792s long-form video/audio duration spread; Episode 4 has a 2023.776s spread.

## 2026-06-24 - Quipsly Studio review runway hardening

- Fixed selected-short export naming in `apps/QuipslyStudio` so selected exports include broad basename plus selected short ordinal/title, avoiding generic overwrite-prone output names.
- Rerouted selected-short agent export through the live editor command bridge so agent and human export flows share the visible selected short recipe.
- Added local release review board, platform-prep packet generator, and validation scripts.
- Generated reviewer handoff artifacts in `/Volumes/My Passport/Episode_and_Shorts_Test/review-board` and platform-prep packets under each current-best Episode 1-6 version folder.
- Validation currently reports zero blockers, with warning episodes 1 and 4 due to long-form video/audio duration spreads requiring human review before publication.
- No upload, scheduling, publishing, account mutation, or external receipt claim occurred.

## 2026-06-24 - Review validation and receipt-slot hardening

- Quipsly Studio package validation now checks expected aspect/resolution for long-form and shorts deliverables.
- Added a local human review/receipt ledger for Episodes 1-6 current-best packages. It preserves future human edits and keeps publication receipt truth empty until real URLs/proofs exist.
- Agent command surface now includes `release-human-review-ledger` alongside review board, platform prep, and package validation.
- Current validation evidence: zero blockers; Episodes 1 and 4 remain warning-only for A/V duration spread human review.

## 2026-06-24 - HTML review-room pass

- The external-drive review board now has inline local media players for each current-best Episode 1-6 package, making the manual review path easier for Charlie, Mako, and Homer.
- Latest validation remains zero blockers, with Episodes 1 and 4 still warning-only for A/V duration spread review.

## 2026-06-28 - Writing surface consolidation rail

- Added `docs/quipsly/writing-surface-history-and-consolidation-plan.md` after the writing workflow review exposed too many competing partial authoring surfaces.
- Product decision: Quipsly writing must meet the OneNote ease-of-organization bar before advanced tagging, assistant, publishing, or research abstractions dominate the user experience.
- Current recommendation: crown web `/create` as the first canonical writing surface, treat `/manuscript`, `/write`, native Mac shells, and QuipslyStudio writing packets as supporting/experimental until deliberately promoted.
- This is a consolidation rail, not a solved editor claim. The next implementation work should make the canonical writing surface feel like `Nest -> Notebook / Document -> Section -> Page -> Blocks`.
- First UI alignment pass: renamed the `/create` left rail from internal "Views & Filters" language to "Nest Notebook", added a writing-first rule card, reframed documents as notebook/documents, and fixed the local outline reorder rendering path so it uses the local boundary order it updates.
- Added `/create` Quick Capture actions to the Nest Notebook rail for New writing page, Quick note, and New study source, reusing the existing Nest document server action instead of creating another competing authoring path.
- Added notebook search in `/create` so the left rail can filter writing pages, drafts, notes, study sources, source labels, document kinds, chapters, and episodes without changing the underlying manuscript data.
- Added a `/create` "You are here" card that shows the current Nest, document, document kind, and active section/whole-document state so the writing surface feels more like a stable notebook than an abstract filter workbench.
- Added `/create` notebook rail counts and recovery actions: visible document count, writing page count, study source count, "Return to full document", and "Clear notebook search" so hidden/focused state is obvious and reversible.
- Added `/create` structure creation from the notebook rail: `+ Chapter` and `+ Episode` dispatch into Tagger, which inserts a real tagged heading block through the editor's local block state and existing save/blur path instead of creating a parallel document mutation path.

## 2026-07-28 - Episode 4 proxy, checkpoint, and playback acceptance

- Recovered the real
  `episode-4-part-2-proxy-recovery-working` native session in the exact
  Apple Development-signed Mac app built from commit `8053fb3` (Team
  `585GUXMY5M`, CDHash
  `b251846675f522f411790574e6a41cc1ad79bf23`).
- Fixed video readiness to use source/proxy video-track duration rather than
  container duration. The Part 2 recap source container is `57.200000s`, but
  its source video track is `55.156738s` and proxy video track is
  `55.166667s`. After restoring only the previously granted media-folder
  bookmark, the app reconciled the lane to `55.157s` with persisted
  source-track/proxy-track evidence.
- Independent `ffprobe` readback verified exactly one video stream in all ten
  ready proxies. App duration versus proxy video-track duration differed by no
  more than `0.010s`. Final readiness was ten ready video lanes, three
  proxy-safe audio lanes, one intentionally held context lane, and
  `productionReady=true`.
- Proved checkpoint protection with the 21.6 MB real session. Explicit
  checkpoint `episode-4-session-safety-acceptance-v001` retained SHA-256
  `f85550a2807afcb6dc64a60e722043bf120672487e4a9759f4825324e87d979b`
  before and after the first autosave. That autosave created unique working
  copy
  `episode-4-session-safety-acceptance-v001-working-20260728T211324618Z-97d8758f`
  with SHA-256
  `d46bb07c3cf44613fdc9edad6719bbc87d0c8b59227b20fc852e9b212a44f83a`.
- A complete quit/relaunch and explicit load restored all 14 lanes, the
  correction-note marker, production readiness, checkpoint role truth, and
  hashes.
- The first playback attempt exposed duplicate command ownership: a registered
  typed command was executed and then replayed through the legacy trigger with
  its playback parameters lost. Commit `8053fb3` makes registered commands
  single-delivery and records handled command serials. The cold-reloaded real
  session then held `Play Through`, advanced from `600.000s` to `602.726s`,
  and paused at `603.347s`.
- The complete QuipslyVideoCore suite passes 96/96 and the signed QuipslyMac
  Debug target builds. This is app-owned playback proof, not human
  proof-watch/listen. Native account verification, production Nest handoff,
  physical iPhone qualification, TestFlight, and the broader end-to-end goal
  remain open.
