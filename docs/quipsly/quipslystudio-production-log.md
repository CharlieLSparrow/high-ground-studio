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
