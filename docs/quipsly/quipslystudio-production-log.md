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

## 2026-07-03 MDT - Intentional structure and next-short watch/listen brief

Started: active shorts-review hardening pass
Finished: 2026-07-03 05:10 UTC
Duration: not captured
Mode: agent/human review tooling
Canonical path: `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio`

What changed:
- Reaffirmed the source-map rule: Quipsly structure may change, but live surfaces, reasons, replacement truth, compatibility decisions, and proof paths must be named so agents do not follow stale paths or rabbit holes.
- Added a separate next-short watch/listen brief command instead of overloading the app-selected short brief.
- Kept the app-selected brief and local-package brief intentionally separate because one describes current UI state and the other describes the ranked review queue.

Proof or evidence:
- `bash -n script/agentctl.sh` passed.
- `python3 -m py_compile script/experimental/build_studio_next_short_watch_listen_brief.py` passed.
- `./script/agentctl.sh studio-next-short-watch-listen-brief --json` returned `studio-next-short-watch-listen-brief-ready` for `episode-2-short-01`, a 22.6s 9:16 local short with audio/video present.
- `./script/agentctl.sh studio-next-short-watch-listen-brief-save` wrote:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-watch-listen-briefs/20260703T051611Z-next-short-watch-listen-brief.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-watch-listen-briefs/20260703T051611Z-next-short-watch-listen-brief.md`
- `./script/agentctl.sh studio-short-review-decision-dry-run episode-2-short-01 refine Codex ...` passed with `dryRun: true` and `ledgerMutated: false`.
- Rebuilding `studio-short-review-decision-ledger` and rerunning the watch/listen brief fixed `episode-2-short-01` file-size truth from `bytes: 0` to `bytes: 2838128` in the downstream brief.

Still risky:
- The brief can guide review, but it cannot truthfully claim a short was watched, listened to, approved, or published.
- More file-size consistency checks should be added later for carry-forward batch rows, not just current-version shorts.

Lesson:
- Durable architecture is not "never move paths." Durable architecture is making path moves explicit, purposeful, and provable.

Next:
- Use the watch/listen brief to drive actual short review decisions, then add broader file-size consistency checks for carry-forward rows.

## 2026-07-03 MDT - Next-short evidence packet orchestration

Started: active shorts-review hardening pass
Finished: 2026-07-03 05:39 UTC
Duration: not captured
Mode: agent/human review tooling
Canonical path: `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio`

What changed:
- Added a next-short evidence packet command that selects the same ranked local short as the watch/listen brief.
- The packet calls existing cut-quality contact-sheet and audio-probe tools instead of inventing a duplicate evidence system.
- The packet summarizes visual frames, waveform/audio probe, silence/cadence warnings, and safe review commands in one place.

Proof or evidence:
- `bash -n script/agentctl.sh` passed.
- `python3 -m py_compile script/experimental/build_studio_next_short_review_evidence_packet.py` passed.
- `./script/agentctl.sh studio-next-short-review-evidence --json` returned `studio-next-short-review-evidence-ready` for `episode-2-short-01`.
- The evidence packet created 8 contact-sheet frames and an audio/cadence probe with waveform.
- Audio probe warnings for `episode-2-short-01`: 3 pauses >= 0.75s and 27% silence fraction, both requiring listen-through before tightening.
- `./script/agentctl.sh studio-next-short-review-evidence-save` wrote:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T053904Z-next-short-review-evidence.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T053904Z-next-short-review-evidence.md`

Still risky:
- The packet creates evidence artifacts, but it still cannot truthfully claim that a human or agent watched/listened to the short.
- Each packet invocation creates fresh timestamped contact/audio artifacts. That is safe, but later we may want an explicit `--reuse-latest` option to reduce artifact noise.

Lesson:
- The better architecture is one stable next-short doorway over existing specialized tools, not a pile of parallel review commands with overlapping meanings.

Next:
- Use the evidence packet to drive a specific cut-quality note or local review decision for `episode-2-short-01`, preferably after opening/listening to the short.

## 2026-07-03 MDT - System-check notes visible without fake review completion

Started: active shorts-review hardening pass
Finished: 2026-07-03 05:51 UTC
Duration: not captured
Mode: review-trust boundary hardening
Canonical path: `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio`

What changed:
- Recorded a cadence `system-check` note for `episode-2-short-01` from the audio probe: 7 silences, 3 pauses >= 0.75s, longest pause 1.834s, and 27% silence fraction.
- Updated the cut-quality worksheet to show system-check notes as measurement hints.
- Kept review completion strict: a system-check does not fill the worksheet field or count as listen-backed review evidence.

Proof or evidence:
- Dry-run note command returned `dryRun: true` and no mutation truth.
- Live note command wrote:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-worksheets/episode-2-short-01/notes/20260703T054127Z-cadence-cut-quality-note.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-worksheets/episode-2-short-01/notes/20260703T054127Z-cadence-cut-quality-note.md`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-worksheets/episode-2-short-01/notes/20260703T054127Z-cadence-cut-quality-note.html`
- `python3 -m py_compile script/studio_shorts_cut_quality_worksheet.py` passed.
- `./script/agentctl.sh studio-shorts-cut-quality-worksheet --short-id episode-2-short-01` produced:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-worksheets/episode-2-short-01/20260703T055052Z-episode-2-short-01-cut-quality-worksheet.json`
  - cadence field status `empty`
  - cadence system-check count `1`

Still risky:
- The short still needs actual watch/listen review before any keep/refine/hold/reject decision should be recorded.

Lesson:
- Probe evidence should help the reviewer, not impersonate the reviewer. Measurement can guide attention, but review completion needs actual watch/listen evidence.

Next:
- Either open/listen to `episode-2-short-01` and record real review-evidence notes, or keep building reviewer tools that make that step faster and clearer.

## 2026-07-03 MDT - Episode 2 short 01 visual review notes and local queue movement

Started: active shorts-review pass
Finished: 2026-07-03 06:05 UTC
Duration: not captured
Mode: local review evidence and queue hygiene
Canonical path: `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio`

What changed:
- Inspected the `episode-2-short-01` visual contact frames as a montage.
- Recorded review-evidence sidecar notes for:
  - `cropFraming`
  - `captionPlan`
  - `jumpCutCover`
- Regenerated the cut-quality worksheet so those visual fields read as filled while cadence remains unfilled with one system-check hint.
- Recorded local short review intent as `needs-more-evidence`, not keep/refine/reject, because no actual listen-through was completed.
- The next short handoff advanced to `episode-3-short-01`.

Proof or evidence:
- Visual montage created at `/tmp/quipsly-episode-2-short-01-visual-review-montage.jpg`.
- Review-evidence notes were written under `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-worksheets/episode-2-short-01/notes/`.
- Worksheet readback:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-worksheets/episode-2-short-01/20260703T060413Z-episode-2-short-01-cut-quality-worksheet.json`
  - `cropFraming`, `captionPlan`, and `jumpCutCover` status `filled`
  - `cadence` status `empty` with `1` system-check hint
- `studio-short-review-decision-dry-run episode-2-short-01 needs-more-evidence ...` returned no mutation truth.
- `studio-short-review-decision episode-2-short-01 needs-more-evidence ...` updated only the local review ledger, with no media mutation and no receipt truth.
- `studio-next-short-review-handoff --json` returned `episode-3-short-01` as the next pending short.

Still risky:
- `episode-2-short-01` still requires real playback/listen review before final keep/refine/reject.
- The visual note mentions motion softness from sampled frames, but playback may make that better or worse.

Lesson:
- The right queue state after partial agent inspection is often `needs-more-evidence`, not a fake creative verdict. That keeps momentum without laundering incomplete review as approval.

Next:
- Generate evidence for `episode-3-short-01`, then repeat the same honest visual/audio boundary.

## 2026-07-03 MDT - Episode 3 short 01 visual review notes and queue movement

Started: active shorts-review pass
Finished: 2026-07-03 06:12 UTC
Duration: not captured
Mode: local review evidence and queue hygiene
Canonical path: `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio`

What changed:
- Generated a next-short evidence packet for `episode-3-short-01`.
- Inspected the visual contact frames as a montage.
- Recorded review-evidence sidecar notes for:
  - `hook`
  - `cropFraming`
  - `captionPlan`
- Recorded a cadence `system-check` from the audio probe because the probe found 9 silences, 6 pauses >= 0.75s, longest pause 2.231s, and 58% silence fraction.
- Regenerated the cut-quality worksheet so visual fields read as filled while cadence remains unfilled with a system-check hint.
- Recorded local short review intent as `needs-more-evidence`, not keep/refine/reject, because no true listen-through was completed.
- The next short handoff advanced to `episode-5-short-01`.

Proof or evidence:
- Evidence packet:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T060748Z-next-short-review-evidence.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T060748Z-next-short-review-evidence.md`
- Visual montage created at `/tmp/quipsly-episode-3-short-01-visual-review-montage.jpg`.
- Review-evidence notes were written under `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-worksheets/episode-3-short-01/notes/`.
- Worksheet readback:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-worksheets/episode-3-short-01/20260703T061124Z-episode-3-short-01-cut-quality-worksheet.json`
  - `hook`, `cropFraming`, and `captionPlan` status `filled`
  - `cadence` status `empty` with `1` system-check hint
- `studio-short-review-decision-dry-run episode-3-short-01 needs-more-evidence ...` returned no mutation truth.
- `studio-short-review-decision episode-3-short-01 needs-more-evidence ...` updated only the local review ledger, with no media mutation and no receipt truth.
- `studio-next-short-review-handoff --json` returned `episode-5-short-01` as the next pending short.

Still risky:
- `episode-3-short-01` still requires actual playback/listen review before final keep/refine/reject.
- The visual evidence suggests a stronger hook but also darker framing and a heavy lower-frame block; playback may change the refinement priority.

Lesson:
- Visual review can still be useful without audio authority. It should narrow the next human/agent listen task instead of pretending to finish the creative review.

Next:
- Generate evidence for `episode-5-short-01` and continue moving through current-version shorts while preserving the listen-through boundary.

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

## 2026-07-02 - Agent load-session and removable-volume launch hardening

- Active product surface remains `apps/QuipslyStudio`; the old `apps/quipsly-mac` shell can still be launched by generic app targeting and must not be used as QuipslyStudio proof.
- Fixed `GET /load_session` to queue through the same static HTTP command drain used by seek/scrub/cut commands. The route now returns `load_session_queued`; execution proof still requires `/state` showing `activeSessionName` plus nonzero lanes or duration.
- Found the apparent `load_session` timeout was mostly a launch blocker: macOS displayed a removable-volume privacy sheet owned by `UserNotificationCenter`, not the Quipsly app window. Normal app accessibility saw zero Quipsly windows while `/state` still had stale mounted-editor data.
- Granted/dismissed the active removable-volume prompt through `System Events` targeting `UserNotificationCenter`, then relaunched via `./script/build_and_run.sh --verify`.
- Changed startup behavior so `WorkspaceView.restoreActiveSessionIfPossible()` lists remembered sessions but does not auto-load the previous active session. Launch should be metadata-first; explicit load commands decide when to touch media/session paths.
- Validation: `./script/build_and_run.sh --verify` passed, then `./script/agentctl.sh load-session-wait episode-2-native-proof 90` returned `active_session_ready` with 9 lanes, 5 shorts, and 4218.756208s duration.


## 2026-07-02 - Stricter QuipslyStudio launch verification

- Hardened `apps/QuipslyStudio/script/build_and_run.sh --verify` so it no longer accepts process/server/cached-state proof by itself.
- Verify now checks for noncanonical `QuipslyMac` processes, Quipsly permission prompts owned by `UserNotificationCenter`, and a visible CoreGraphics window for the active `QuipslyMac` Studio bundle.
- This protects future editor work from accidentally testing the older `apps/quipsly-mac` shell or a blocked invisible launch.
- Validation: `bash -n script/build_and_run.sh`, inline Swift argument probe, `./script/build_and_run.sh --verify`, and `./script/agentctl.sh load-session-wait episode-2-native-proof 90` all passed.
- Current proof lane: `episode-2-native-proof` loaded with 9 lanes, 5 shorts, and 4218.756208s duration.


## 2026-07-02 - Purposeful structure, not rigid structure

Captured the operating rule that Quipsly structure can change aggressively when the product needs it, but changes need current-surface awareness and proof. This addresses the recurring failure mode where stale paths, abandoned app shells, or old docs confuse agents into building on the wrong surface.

Current proof after verify hardening: `apps/QuipslyStudio` launches the active `QuipslyMac` bundle, the agent server listens on port 8080, Episode 2 proof loads through the command drain, and CoreGraphics reports a visible `Quipsly Studio` window.

## 2026-07-02 - Agent playhead context cockpit

Added a compact read-only Studio endpoint for the editing loop:

- Endpoint: `GET /agent_playhead_context`
- CLI: `apps/QuipslyStudio/script/agentctl.sh playhead-context`
- Aliases: `playhead-context`, `agent-playhead-context`, `current-edit-context`

Purpose: give Codex and future Quipsly agents a small current-playhead cockpit before writing metadata. It summarizes active session, branch truth, shared playhead, Program Output, Source Grove readiness at the playhead, selected decision, selected short context, cut-awareness warnings, and next safe actions.

Safety boundary: this endpoint is read-only. It does not select, trim, switch sources, export, publish, or mutate media. It exists to reduce pixel scraping and prevent decisions from being made from stale or oversized `/state` payloads.

Proof run:

```sh
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/build_and_run.sh --verify
./script/agentctl.sh load-session-wait episode-2-native-proof 90
./script/agentctl.sh playhead-context
./script/agentctl.sh select-decision at_playhead video
./script/agentctl.sh playhead-context
```

Observed proof after selection: the compact context reported the selected ACTIVE decision on `Unresolved Camera V2 - temp_video_352730263597350912.MP4`, start `639.96`, duration `4.24`, and next safe action changed to decision-intent evidence rather than decision selection.

## 2026-07-02 - Playhead context Markdown review artifacts

Extended the compact agent playhead context into a human-readable review artifact path:

- `apps/QuipslyStudio/script/agentctl.sh playhead-context-markdown`
- `apps/QuipslyStudio/script/agentctl.sh playhead-context-save [output-folder]`

The save command writes timestamped JSON and Markdown to `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/playhead-context` when the external review board is available, otherwise to `~/Desktop/Quipsly_Playhead_Context`.

Proof run:

```sh
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
bash -n script/agentctl.sh
./script/agentctl.sh playhead-context-markdown
./script/agentctl.sh playhead-context-save
```

Observed saved artifact:

- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/playhead-context/20260703T024620Z-episode-2-native-proof-playhead-context.md`
- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/playhead-context/20260703T024620Z-episode-2-native-proof-playhead-context.json`

This is a read-only handoff receipt for current playhead truth: session, branch, playhead, Source Grove readiness, selected decision, short context, cut-awareness risks, and next safe actions. It does not mutate media, edit decisions, exports, or publication receipts.

## 2026-07-02 - Selected decision review cards

Added a combined selected-decision review card workflow on top of the compact playhead context:

- `apps/QuipslyStudio/script/agentctl.sh playhead-decision-card`
- `apps/QuipslyStudio/script/agentctl.sh playhead-decision-card-save [output-folder]`

The card combines:

- compact playhead context from `/agent_playhead_context`
- selected decision evidence from `/selected_decision_intent_evidence`
- selected decision human-cut guidance from `/selected_decision_human_cut_guidance`

Default saved location, when mounted: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/decision-cards`.

Proof run:

```sh
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
bash -n script/agentctl.sh
./script/agentctl.sh playhead-decision-card
./script/agentctl.sh playhead-decision-card-save
```

Observed saved artifact:

- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/decision-cards/20260703T025503Z-episode-2-native-proof-unresolved-camera-v2-temp-video-352730263597350912-mp4-decision-card.md`
- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/decision-cards/20260703T025503Z-episode-2-native-proof-unresolved-camera-v2-temp-video-352730263597350912-mp4-decision-card.json`

The card preserves the crucial distinction between sequence time and source time. In the proof card, sequence start was `0`, source start was `639.96`, and duration was `4.24`. This matters because Quipsly edits metadata over one sequence spine; it must not collapse source media timing into timeline truth.

Safety boundary: read-only review evidence. It does not mutate media, decisions, exports, or publication receipts.

## 2026-07-03 - Decision-card index for review truth

- Added `script/agentctl.sh playhead-decision-card-index [--markdown|--json] [card-root]` so saved selected-decision review cards become an operational review queue instead of loose artifacts.
- Added `script/agentctl.sh playhead-decision-card-index-save [card-root] [output-folder]` for timestamped JSON/Markdown review-board output.
- The index deduplicates repeated saved cards by session, selected tag id, sequence start, and lane name, then classifies the latest unique card as `needs-selection`, `needs-intent`, `needs-listen`, `needs-context`, `reviewable`, or `broken-card`.
- Validation on the current external-drive review board found 3 card files, collapsed 2 duplicates, and surfaced 1 unique Episode 2 decision as `needs-listen` with sequence time 0.0s and source time 639.96s kept separate.
- Saved proof index:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/decision-card-index/20260703T031108Z-decision-card-index.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/decision-card-index/20260703T031108Z-decision-card-index.md`

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
bash -n script/agentctl.sh
./script/agentctl.sh playhead-decision-card-index --json | /usr/bin/python3 -m json.tool
./script/agentctl.sh playhead-decision-card-index --markdown
./script/agentctl.sh playhead-decision-card-index-save | /usr/bin/python3 -m json.tool
```

## 2026-07-03 - Next decision review card shortcut

- Added `script/agentctl.sh playhead-decision-card-next [--markdown|--json] [card-root]` as a one-card view over the saved decision-card index.
- Purpose: reviewers and agents should not have to open a whole artifact pile to know the next safe thing to inspect. The command chooses the highest-priority unresolved card from the same evidence used by the index.
- The command is intentionally a thin mode over `playhead-decision-card-index`, not a new review subsystem. Saved cards remain evidence; the index remains the working queue; `next` is the first actionable review target.
- This keeps the direction aligned with the editor goal: decisions stay transparent metadata, whole source lanes stay intact, and review work becomes less scary.

## 2026-07-03 - Selected-decision guidance status correction

- Fixed a misleading agent-server status in `Sources/SharedUI/AgentServer.swift`: selected-decision human cut guidance no longer reports `needs-selected-decision` when a selected decision exists but structured guidance is missing.
- New distinction:
  - `needs-selected-decision`: no selected decision is present.
  - `selected-decision-needs-guidance`: a decision is selected, but no structured human-cut guidance object is available yet.
  - `ready`: selected decision and structured guidance are both present.
- Cleared a QuipslyMac removable-volume access prompt and reran `./script/build_and_run.sh --verify`; verification passed after the prompt was allowed.
- Revalidated Episode 2 proof state by loading `episode-2-native-proof`, seeking sequence time 0, selecting the at-playhead video decision, and reading human cut guidance. State showed selected lane `BCE0A0A1-C6BB-45EB-999A-3753D6ABFA3D` and selected tag `12D86F6C-4013-4C78-ADBF-4A40FDBA730C`.
- The guidance command now reports `selected-decision-needs-guidance` for the unresolved Episode 2 decision, which is honest and reviewable instead of contradictory.
- Updated `playhead-decision-card-next` output so generated agent review commands include `state` re-observation after `seek` and `select-decision`; the editor bridge can queue UI work asynchronously, so chained commands are less reliable than observe-act-observe.

## 2026-07-03 - Next-decision review handoff packet

- Added `script/agentctl.sh playhead-decision-card-next-save [card-root] [output-folder]`.
- Default output path is `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/decision-card-next` when the external drive is mounted, otherwise `~/Desktop/Quipsly_Decision_Card_Next`.
- The command saves both JSON and Markdown versions of the current next-decision review handoff.
- Purpose: make the highest-priority selected-decision review target durable enough for Charlie, Mako, or Codex to pick up later without reconstructing the card index manually.
- Boundary: this is a review handoff only. It does not mutate source media, timeline decisions, exports, publication packets, or receipts.
- The source-of-truth ladder remains: selected decision state -> saved card evidence -> card index -> next-review handoff.

## 2026-07-03 - Next-decision handoff save validation

- Validated `script/agentctl.sh playhead-decision-card-next-save` after adding the command.
- Command saved a durable review handoff without mutating media, timeline decisions, exports, or publication receipts.
- Saved artifacts:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/decision-card-next/20260703T040601Z-next-decision-review.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/decision-card-next/20260703T040601Z-next-decision-review.md`
- The saved handoff points to the current Episode 2 proof decision:
  - Session: `episode-2-native-proof`
  - Lane: `Unresolved Camera V2 - temp_video_352730263597350912.MP4`
  - Sequence start: `0s`
  - Source start: `639.96s`
  - Duration: `4.24s`
  - Status: `needs-listen`
- The Markdown includes the observe-act-observe agent command sequence, including state re-observation after seek/select.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
bash -n script/agentctl.sh
./script/agentctl.sh playhead-decision-card-next-save | /usr/bin/python3 -m json.tool
sed -n '1,120p' '/Volumes/My Passport/Episode_and_Shorts_Test/review-board/decision-card-next/20260703T040601Z-next-decision-review.md'
/usr/bin/python3 -m json.tool '/Volumes/My Passport/Episode_and_Shorts_Test/review-board/decision-card-next/20260703T040601Z-next-decision-review.json'
```

## 2026-07-03 - Shorts review command path correction and next-short handoff

- Fixed `script/agentctl.sh studio-next-shorts-review-batch` to use the shared `script_path` resolver instead of hardcoding `script/build_studio_next_shorts_review_batch.py`.
- Reason: the live batch builder intentionally lives under `script/experimental`. The command surface should know that; agents should not chase stale paths or move files just to hide launcher drift.
- Added `script/agentctl.sh studio-next-short-review-handoff [--markdown|--json] [/release-root] [--batch path]`.
- Added `script/agentctl.sh studio-next-short-review-handoff-save [/release-root] [--output-dir path]`.
- The new handoff is a thin view over the latest shorts review batch. The batch remains the working queue; the handoff answers which one short should be watched or inspected next.
- Boundary: local review only. It does not approve, publish, upload, schedule, mutate source files, overwrite, delete, mutate accounts, or create receipt truth.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
bash -n script/agentctl.sh
python3 -m py_compile script/experimental/build_studio_next_short_review_handoff.py
./script/agentctl.sh studio-next-shorts-review-batch --limit 3 --include-warnings | /usr/bin/python3 -m json.tool
./script/agentctl.sh studio-next-short-review-handoff --json | /usr/bin/python3 -m json.tool
./script/agentctl.sh studio-next-short-review-handoff --markdown
./script/agentctl.sh studio-next-short-review-handoff-save | /usr/bin/python3 -m json.tool
```

Saved proof:

- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-batches/20260703-042536-173149-shorts-review-batch/shorts-review-batch.json`
- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-batches/20260703-042536-173149-shorts-review-batch/index.html`
- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-next/20260703T042536Z-next-short-review.json`
- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-next/20260703T042536Z-next-short-review.md`

Current next short surfaced by the handoff:

- Short: `episode-1-short-01`
- Title: `Episode 01 01 Test Short Wednesday Rule moment`
- File: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_01/v003/episode-01-v003-full-release-01-Test-Short-Wednesday-Rule-moment-9x16-short.mp4`
- Duration: `0:08`
- Status: `ready`
- Review risk: `episode-warning-review-first`

## 2026-07-03 - Shorts handoff bridged to decision ledger

- Found and fixed a practical mismatch: the latest shorts batch could select an Episode 1 carry-forward row, but `studio-short-review-decision` only knew the native current-version decision ledger. That produced a nice-looking record command that failed with `Short id not found`.
- Updated `build_studio_next_short_review_handoff.py` so the next handoff prefers a short that exists in `studio-short-review-decision-ledger`.
- If the latest batch contains only rows that cannot be recorded in the active ledger, the handoff now falls back to the first pending ledger-backed short.
- Updated handoff commands to expose runnable `recordKeep`, `recordRefine`, `recordHold`, `recordReject`, and `recordNeedsMoreEvidence` commands instead of one shell-dangerous `keep|refine|hold|reject` template.
- Updated `build_studio_short_review_decision_ledger.py` safe commands for the same reason.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/experimental/build_studio_next_short_review_handoff.py script/experimental/build_studio_short_review_decision_ledger.py
./script/agentctl.sh studio-short-review-decision-ledger | /usr/bin/python3 -m json.tool
./script/agentctl.sh studio-next-short-review-handoff --json | /usr/bin/python3 -m json.tool
./script/agentctl.sh studio-next-short-review-handoff --markdown | rg -n 'keep\|refine|<keep|Record local short intent' || true
./script/agentctl.sh studio-short-review-decision-dry-run episode-2-short-01 keep Codex 'Dry-run bridge validation after safer command rebuild; no human approval.' | /usr/bin/python3 -m json.tool
./script/agentctl.sh studio-next-short-review-handoff-save | /usr/bin/python3 -m json.tool
```

Current validated next short:

- Short: `episode-2-short-01`
- File: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_02/v001/shorts/episode-02-short-01-v001.mp4`
- Duration: `22.6s`
- Source kind: `decision-ledger`
- Dry-run review result: ledger accepted a `keep` preview, `ledgerMutated: false`, `externalActionTaken: false`, `mediaMutated: false`, `receiptTruthCreated: false`.

Saved proof:

- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-next/20260703T043623Z-next-short-review.json`
- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-next/20260703T043623Z-next-short-review.md`

## 2026-07-03 - Unified Episode 1 carry-forward shorts into local review ledger

- Updated `build_studio_short_review_decision_ledger.py` so the local shorts review ledger merges both current native shorts from `shorts-command-room` and latest shorts-review-batch rows.
- This brings Episode 1 carry-forward shorts into the same local review-decision flow as Episodes 2, 3, 5, and 6 instead of requiring a separate command universe.
- Merge key: stable short id such as `episode-1-short-01`.
- Added `reviewSource` to each ledger item so agents can tell whether a short came from `shorts-command-room` or `shorts-review-batch`.
- Preserved media shape for batch rows by deriving width/height/aspect from `codecSummary` when direct width/height fields are missing.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/experimental/build_studio_short_review_decision_ledger.py script/experimental/build_studio_next_short_review_handoff.py
./script/agentctl.sh studio-short-review-decision-ledger | /usr/bin/python3 -m json.tool
./script/agentctl.sh studio-next-short-review-handoff --json | /usr/bin/python3 -m json.tool
./script/agentctl.sh studio-short-review-decision-dry-run episode-1-short-01 keep Codex 'Dry-run validation that Episode 1 carry-forward short is ledger backed with media shape preserved; no human approval.' | python3 -c 'import json, sys; payload=json.load(sys.stdin); after=payload.get("afterPreview", {}); print(json.dumps({"ok": payload.get("ok"), "dryRun": payload.get("dryRun"), "shortId": payload.get("shortId"), "aspect": after.get("aspect"), "width": after.get("width"), "height": after.get("height"), "decision": payload.get("decision"), "ledgerMutated": payload.get("ledgerMutated"), "externalActionTaken": payload.get("externalActionTaken"), "mediaMutated": payload.get("mediaMutated"), "receiptTruthCreated": payload.get("receiptTruthCreated"), "countsPreview": payload.get("countsPreview")}, indent=2, sort_keys=True))'
./script/agentctl.sh studio-next-short-review-handoff-save | /usr/bin/python3 -m json.tool
```

Proof:

- Ledger now reports `83` items: `80` native current-version shorts plus `3` Episode 1 batch/carry-forward shorts.
- `episode-1-short-01` dry-run review now succeeds with `ok: true`, `dryRun: true`, `ledgerMutated: false`, `externalActionTaken: false`, `mediaMutated: false`, and `receiptTruthCreated: false`.
- Episode 1 media shape is preserved as `9:16`, `1080x1920`.
- Current saved next-short handoff:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-next/20260703T044450Z-next-short-review.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-next/20260703T044450Z-next-short-review.md`

Tooling note: an initial validation used pipe-plus-heredoc with Python and failed because Python consumed JSON as code. Rerun with `python3 -c` proved the product path. This matches the known validation footgun documented in memory and should not trigger product patching by itself.

## 2026-07-03 - Ranked next-short handoff by review value

- Updated `build_studio_next_short_review_handoff.py` so the next short is no longer simply the first valid ledger-backed row.
- The chooser now ranks candidates from both latest shorts-review-batch rows and pending decision-ledger rows.
- Ranking favors playable audio/video, pending review state, 9:16 shape, useful social-short duration, lower command-room `reviewPriority`, fewer warnings, then episode/short order.
- Expanded the handoff payload and Markdown to show review priority, platform fit, review source, shape, duration bucket, and source kind.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/experimental/build_studio_next_short_review_handoff.py
./script/agentctl.sh studio-next-short-review-handoff --json | /usr/bin/python3 -m json.tool
./script/agentctl.sh studio-next-short-review-handoff --markdown
SHORT_ID=$(./script/agentctl.sh studio-next-short-review-handoff --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["short"]["id"])')
./script/agentctl.sh studio-short-review-decision-dry-run "$SHORT_ID" keep Codex 'Dry-run validation for ranked next-short handoff; no human approval.' | python3 -c 'import json, sys; payload=json.load(sys.stdin); after=payload.get("afterPreview", {}); print(json.dumps({"ok": payload.get("ok"), "dryRun": payload.get("dryRun"), "shortId": payload.get("shortId"), "episode": after.get("episode"), "durationLabel": after.get("durationLabel"), "aspect": after.get("aspect"), "width": after.get("width"), "height": after.get("height"), "decision": payload.get("decision"), "ledgerMutated": payload.get("ledgerMutated"), "externalActionTaken": payload.get("externalActionTaken"), "mediaMutated": payload.get("mediaMutated"), "receiptTruthCreated": payload.get("receiptTruthCreated")}, indent=2, sort_keys=True))'
./script/agentctl.sh studio-next-short-review-handoff-save | /usr/bin/python3 -m json.tool
```

Proof:

- Ranked handoff selected `episode-2-short-01` instead of the first Episode 1 batch row.
- Selection facts:
  - `9:16`, `1080x1920`
  - `22.6s`
  - audio and video present
  - review priority `151`
  - platform fit: YouTube Shorts, Instagram Reels, Facebook Reels, LinkedIn excerpt, Patreon teaser
  - review source: `shorts-command-room`
- Dry-run review succeeded with `ok: true`, `dryRun: true`, `ledgerMutated: false`, `externalActionTaken: false`, `mediaMutated: false`, and `receiptTruthCreated: false`.
- Saved handoff:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-next/20260703T045127Z-next-short-review.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-next/20260703T045127Z-next-short-review.md`

## 2026-07-03 - Episode 5 short 01 visual review notes and queue movement

Processed the next ranked local short review candidate:

- Short: `episode-5-short-01`
- Title: `Episode 5 Test 01 Opening Energy`
- File: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_05/v001/episode-05-v001-full-release-01-Episode-5-Test-Short-01-Opening-energy-9x16-short.mp4`
- Duration/shape: `45.0s`, `9:16`, `1080x1920`
- Evidence packet:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T061856Z-next-short-review-evidence.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T061856Z-next-short-review-evidence.md`
- Visual montage for agent inspection:
  - `/tmp/quipsly-episode-5-short-01-visual-review-montage.jpg`
- Worksheet:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-worksheets/episode-5-short-01/20260703T062230Z-episode-5-short-01-cut-quality-worksheet.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-worksheets/episode-5-short-01/20260703T062230Z-episode-5-short-01-cut-quality-worksheet.md`

Notes recorded:

- `hook`: tight, expressive single-speaker opening with readable face and mouth movement.
- `cropFraming`: face stays visible in the sampled frames; mic/hand movement is present but not face-blocking.
- `captionPlan`: captions need careful lower-third placement around mic/hand motion.
- `platformFit`: 45 second 9:16 single-speaker clip is platform-plausible pending spoken hook/payoff review.
- `cadence`: system-check note only; audio probe reports no pause warnings, `0` long pauses, and `4.52%` silence fraction.

Worksheet readback:

- Review evidence notes: `9`
- System-check notes: `1`
- Filled fields: `hook`, `cadence`, `captionPlan`, `cropFraming`, `audioFeel`, `platformFit`, `riskTradeoff`
- Remaining fields: `jCutLCut`, `jumpCutCover`, `reactionBeat`, `endingPayoff`

Local ledger action:

- Recorded `episode-5-short-01` as `needs-more-evidence`.
- Reason: visually promising and machine-audio-favorable, but still needs real listen-through before `keep`, `refine`, or `reject`.
- Ledger now reports `83` shorts, `3` decisions recorded, `3` `needs-more-evidence`, and `80` pending.

Next ranked local short:

- `episode-6-short-01`
- `Episode 6 Scout 01 Opening Energy`

Safety/truth:

- No source media mutation.
- No old version overwritten.
- No external upload, schedule, publication approval, account mutation, or receipt truth created.

## 2026-07-03 - Episode 2 short 02 refinement candidate

Processed the next ranked local short review candidate:

- Short: `episode-2-short-02`
- Title: `Episode 02 Short 02 V001`
- File: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_02/v001/shorts/episode-02-short-02-v001.mp4`
- Duration/shape: `20.3s`, `9:16`, `1080x1920`
- Evidence packet:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T063305Z-next-short-review-evidence.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T063305Z-next-short-review-evidence.md`
- Visual montage for agent inspection:
  - `/tmp/quipsly-episode-2-short-02-visual-review-montage.jpg`
- Worksheet:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-worksheets/episode-2-short-02/20260703T063550Z-episode-2-short-02-cut-quality-worksheet.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-worksheets/episode-2-short-02/20260703T063550Z-episode-2-short-02-cut-quality-worksheet.md`

Notes recorded:

- `hook`: candid outdoor smiling/laughing gives the clip personality and variety.
- `cropFraming`: face is generally centered/readable, but some sampled frames are soft or slightly blurred.
- `captionPlan`: captions need stronger backing because the image is pale/desaturated; avoid mouth and mic.
- `platformFit`: 20.3 second 9:16 shape is social-friendly, but visual polish makes it feel more casual teaser than flagship clip.
- `cadence`: system-check note only; audio probe reports `2` pauses over `0.75s` and `24.27%` silence fraction.

Worksheet readback:

- Review evidence notes: `4`
- System-check notes: `1`
- Filled fields: `hook`, `captionPlan`, `cropFraming`, `platformFit`
- Remaining fields: `cadence`, `jCutLCut`, `jumpCutCover`, `reactionBeat`, `audioFeel`, `endingPayoff`, `riskTradeoff`

Local ledger action:

- Recorded `episode-2-short-02` as `refine`.
- Reason: worth improving because it has candid personality and usable 9:16 framing, but visual softness and audio silence warnings make it unsafe to treat as post-ready.
- Ledger now reports `83` shorts, `5` decisions recorded, `1` `refine`, `4` `needs-more-evidence`, and `78` pending.

Next ranked local short:

- `episode-3-short-02`
- `Episode 03 Short 02 V001`

Safety/truth:

- No source media mutation.
- No old version overwritten.
- No external upload, schedule, publication approval, account mutation, or receipt truth created.
- The active source map was clarified as a living decision record rather than a freeze: structure may change, but path changes need intent, replacement mapping, and proof.

## 2026-07-03 - Episode 6 short 01 visual review notes and queue movement

Processed the next ranked local short review candidate:

- Short: `episode-6-short-01`
- Title: `Episode 6 Scout 01 Opening Energy`
- File: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_06/v001/episode-06-v001-full-release-01-Episode-6-Scout-01-Opening-Energy-9x16-short.mp4`
- Duration/shape: `45.0s`, `9:16`, `1080x1920`
- Evidence packet:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T062806Z-next-short-review-evidence.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T062806Z-next-short-review-evidence.md`
- Visual montage for agent inspection:
  - `/tmp/quipsly-episode-6-short-01-visual-review-montage.jpg`
- Worksheet:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-worksheets/episode-6-short-01/20260703T063058Z-episode-6-short-01-cut-quality-worksheet.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-worksheets/episode-6-short-01/20260703T063058Z-episode-6-short-01-cut-quality-worksheet.md`

Notes recorded:

- `hook`: expressive face, eye contact, and reaction energy suggest scroll-stopping potential.
- `cropFraming`: face remains readable in sampled frames; foreground mic does not cover the mouth.
- `captionPlan`: captions need to avoid eyes, mouth, and lower-center mic silhouette.
- `reactionBeat`: sampled frames show multiple reaction faces and visible expression changes.
- `cadence`: system-check note only; audio probe reports `4` pauses over `0.75s` and `16.09%` silence fraction.

Worksheet readback:

- Review evidence notes: `4`
- System-check notes: `1`
- Filled fields: `hook`, `reactionBeat`, `captionPlan`, `cropFraming`
- Remaining fields: `cadence`, `jCutLCut`, `jumpCutCover`, `audioFeel`, `endingPayoff`, `platformFit`, `riskTradeoff`

Local ledger action:

- Recorded `episode-6-short-01` as `needs-more-evidence`.
- Reason: visually strong reaction/personality candidate, but cadence needs a real listen-through before `keep`, `refine`, or `reject`.
- Ledger now reports `83` shorts, `4` decisions recorded, `4` `needs-more-evidence`, and `79` pending.

Next ranked local short:

- `episode-2-short-02`
- `Episode 02 Short 02 V001`

Safety/truth:

- No source media mutation.
- No old version overwritten.
- No external upload, schedule, publication approval, account mutation, or receipt truth created.

## 2026-07-03 - Agent short-review readback command and Episode 3 short 02 refinement candidate

Added a new stable agent command:

- `./script/agentctl.sh studio-short-review-readback [--short-id id] [--json|--markdown|--save]`

Purpose:

- Gather the ranked next-short handoff, local decision ledger, latest evidence packet, and latest cut-quality worksheet into one compact readback.
- Replace repeated one-off shell parsers with a first-class agent/human state surface.
- Keep the command read-only: it creates no decisions, approvals, uploads, schedules, account mutations, source-media mutations, overwrites, deletes, or receipt truth.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/experimental/build_studio_short_review_readback.py
bash -n script/agentctl.sh
./script/agentctl.sh studio-short-review-readback --json
./script/agentctl.sh studio-short-review-readback --short-id episode-2-short-02 --json
```

Proof:

- Current next-short readback selected `episode-3-short-02` before review and reported missing evidence plus an empty worksheet.
- Historical readback for `episode-2-short-02` correctly reported decision `refine`, latest evidence status, audio warnings, worksheet filled fields, and local ledger counts.
- The active source map now lists `studio-short-review-readback` as the preferred compact readback rather than writing ad hoc parsers.

Processed the next ranked local short review candidate:

- Short: `episode-3-short-02`
- Title: `Episode 03 Short 02 V001`
- File: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_03/v001/shorts/episode-03-short-02-v001.mp4`
- Duration/shape: `25.9s`, `9:16`, `1080x1920`
- Evidence packet:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T064455Z-next-short-review-evidence.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T064455Z-next-short-review-evidence.md`
- Visual montage for agent inspection:
  - `/tmp/quipsly-episode-3-short-02-visual-review-montage.jpg`
- Saved readback:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-readbacks/20260703T064818Z-episode-3-short-02-review-readback.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-readbacks/20260703T064818Z-episode-3-short-02-review-readback.md`

Notes recorded:

- `hook`: some expression/intensity, but no proven first-second hook without listen-through.
- `cropFraming`: Charlie is visible, but frame is dark and microphone occupies much of the mouth/center-face area.
- `captionPlan`: captions need strong contrast backing and should avoid mouth/glasses/lower black region.
- `riskTradeoff`: possible expressive podcast moment, but visual darkness, mic overlap, and silence risk make it refinement-first.
- `cadence`: system-check note only; audio probe reports `6` pauses over `0.75s` and `45.18%` silence fraction.

Local ledger action:

- Recorded `episode-3-short-02` as `refine`.
- Reason: expressive moment may be usable, but dark framing, mic/face overlap, and high pause/silence warnings require a tighter cut or alternate moment before posting.
- Ledger now reports `83` shorts, `6` decisions recorded, `2` `refine`, `4` `needs-more-evidence`, and `77` pending.

Next ranked local short:

- `episode-5-short-02`
- Current readback says evidence is missing and the next safest action is to create an evidence packet before recording intent.

Safety/truth:

- No source media mutation.
- No old version overwritten.
- No external upload, schedule, publication approval, account mutation, or receipt truth created.

## 2026-07-03 - Episode 5 short 02 refinement candidate

Processed the next ranked local short review candidate:

- Short: `episode-5-short-02`
- Title: `Episode 5 Test 02 Coachable Moment`
- File: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_05/v001/episode-05-v001-full-release-02-Episode-5-Test-Short-02-Coachable-moment-9x16-short.mp4`
- Duration/shape: `45.0s`, `9:16`, `1080x1920`
- Evidence packet:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T065037Z-next-short-review-evidence.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T065037Z-next-short-review-evidence.md`
- Visual montage for agent inspection:
  - `/tmp/quipsly-episode-5-short-02-visual-review-montage.jpg`
- Saved readback:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-readbacks/20260703T065352Z-episode-5-short-02-review-readback.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-readbacks/20260703T065352Z-episode-5-short-02-review-readback.md`

Notes recorded:

- `hook`: memorable head-back/reaction beat plus expressive closeups may make a personality/reaction clip.
- `reactionBeat`: reaction moment may be worth preserving rather than over-tightening if it supports the joke or emotional beat.
- `cropFraming`: 9:16 crop keeps Charlie readable, though lighting is dim and the mic occupies the lower foreground.
- `captionPlan`: use strong caption backing; avoid covering reaction face or lower mic.
- `cadence`: system-check note only; audio probe reports `2` pauses over `0.75s` and `43.9%` silence fraction.

Local ledger action:

- Recorded `episode-5-short-02` as `refine`.
- Reason: memorable reaction/head-back beat and usable 9:16 framing, but the high silence warning means it needs listen-through and likely tighter pacing before posting.
- Ledger now reports `83` shorts, `7` decisions recorded, `3` `refine`, `4` `needs-more-evidence`, and `76` pending.

Next ranked local short:

- `episode-6-short-02`
- Current readback says evidence is missing and the next safest action is to create an evidence packet before recording intent.

Safety/truth:

- No source media mutation.
- No old version overwritten.
- No external upload, schedule, publication approval, account mutation, or receipt truth created.

## 2026-07-03 - Episode 6 short 02 rejected as current export

Processed the next ranked local short review candidate:

- Short: `episode-6-short-02`
- Title: `Episode 6 Scout 02 Strong Exchange`
- File: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_06/v001/episode-06-v001-full-release-02-Episode-6-Scout-02-Strong-Exchange-9x16-short.mp4`
- Duration/shape: `45.0s`, `9:16`, `1080x1920`
- Evidence packet:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T065718Z-next-short-review-evidence.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T065718Z-next-short-review-evidence.md`
- Visual montage for agent inspection:
  - `/tmp/quipsly-episode-6-short-02-visual-review-montage.jpg`
- Saved readback:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-readbacks/20260703T070119Z-episode-6-short-02-review-readback.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-readbacks/20260703T070119Z-episode-6-short-02-review-readback.md`

Notes recorded:

- `hook`: sampled frames do not show a strong first-second hook; Charlie is mostly looking down/quiet and partly off-center at the start.
- `cropFraming`: Charlie remains visible, but opening frames push him partly out of frame and the mic remains prominent.
- `captionPlan`: captioning alone is unlikely to rescue the weak visual hook and quiet sampled posture.
- `riskTradeoff`: reject this exported short, not the underlying source moment; re-scout the source if the exchange matters.
- `cadence`: system-check note only; audio probe reports `12` pauses over `0.75s` and `69.51%` silence fraction.

Local ledger action:

- Recorded `episode-6-short-02` as `reject`.
- Reason: weak visual hook, mostly quiet/downward frames, and severe silence/long-pause warning make this current export a bad standalone social short.
- Ledger now reports `83` shorts, `8` decisions recorded, `3` `refine`, `4` `needs-more-evidence`, `1` `reject`, and `75` pending.

Next ranked local short:

- `episode-2-short-03`
- Current readback says evidence is missing and the next safest action is to create an evidence packet before recording intent.

Safety/truth:

- Reject applies only to the current local exported short artifact.
- No source media mutation.
- No old version overwritten.
- No external upload, schedule, publication approval, account mutation, or receipt truth created.

## 2026-07-03 - Refine bucket converted into concrete polish workorders

Turned the local `refine` short-review state into actionable next-version work:

- Patched `studio-short-review-readback` so it exposes top-level `latestDecision` and `decisionSummary` from the local short review ledger.
- Confirmed `episode-2-short-02` now reads back as `latestDecision: refine` with ledger status `local-review-recorded`.
- Used the existing `studio-shorts-cut-quality-polish-workorder` command instead of adding a redundant batch command.
- Generated concrete 7-task polish workorders for all shorts currently marked `refine`:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-polish-workorders/episode-2-short-02/20260703T071632Z-episode-2-short-02-polish-workorder/episode-2-short-02-polish-workorder.md`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-polish-workorders/episode-3-short-02/20260703T071632Z-episode-3-short-02-polish-workorder/episode-3-short-02-polish-workorder.md`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-polish-workorders/episode-5-short-02/20260703T071633Z-episode-5-short-02-polish-workorder/episode-5-short-02-polish-workorder.md`
- Updated the active source map so future agents know `refine` routes through `studio-shorts-cut-quality-polish-workorder --short-id <id>` before any v002 export candidate is created.

Validation run:

```bash
python3 -m py_compile script/experimental/build_studio_short_review_readback.py script/studio_shorts_cut_quality_polish_workorder.py
bash -n script/agentctl.sh
./script/agentctl.sh studio-short-review-readback --short-id episode-2-short-02 --json
./script/agentctl.sh studio-shorts-cut-quality-polish-workorder --short-id episode-2-short-02 --json
./script/agentctl.sh studio-shorts-cut-quality-polish-workorder --short-id episode-3-short-02 --json
./script/agentctl.sh studio-shorts-cut-quality-polish-workorder --short-id episode-5-short-02 --json
```

Safety/truth:

- Workorders only.
- No timeline edit performed.
- No media export performed.
- No source media mutation.
- No old version overwritten.
- No external upload, schedule, publication approval, account mutation, or receipt truth created.

## 2026-07-03 - Targeted short evidence and Episode 2 short 03 refine decision

Improved the agent-accessible short review loop and processed the next pending candidate:

- Added targeted evidence generation to `studio-next-short-review-evidence --short-id <id>` so agents/reviewers can request evidence for a specific local short instead of relying only on the ranked-next candidate.
- Updated `studio-short-review-readback` to aggregate versioned worksheet sidecar notes, so readback now reports both original worksheet fields and effective fields filled by sidecar notes.
- Generated and saved evidence for `episode-2-short-03`:
  - Evidence packet: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T072714Z-next-short-review-evidence.json`
  - Evidence markdown: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T072714Z-next-short-review-evidence.md`
  - Contact sheet: `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-contact-sheets/episode-2-short-03/20260703T072713Z-episode-2-short-03-contact-sheet/episode-2-short-03-contact-sheet.html`
  - Audio probe: `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-audio-probes/episode-2-short-03/20260703T072713Z-episode-2-short-03-audio-probe/episode-2-short-03-audio-probe.html`
  - Local visual montage for agent inspection: `/tmp/quipsly-episode-2-short-03-contact-montage.jpg`
- Recorded five review-evidence sidecar notes for `episode-2-short-03`:
  - `hook`
  - `cropFraming`
  - `captionPlan`
  - `cadence`
  - `riskTradeoff`
- Recorded local review intent for `episode-2-short-03` as `refine`.
- Generated a concrete polish workorder:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-polish-workorders/episode-2-short-03/20260703T073112Z-episode-2-short-03-polish-workorder/episode-2-short-03-polish-workorder.md`

Review decision rationale:

- Visual contact sheet shows usable direct-to-camera personality energy.
- Current export is soft/gray in sampled frames and drifts blurry/off-center near the end.
- Audio probe reports `6` meaningful pauses, `2` long pauses, and `22.67%` silence over `21.7s`.
- Decision is `refine`, not `keep`: promising source, current v001 needs cadence and visual/framing cleanup before platform posting.

Validation run:

```bash
python3 -m py_compile script/experimental/build_studio_next_short_review_evidence_packet.py script/experimental/build_studio_short_review_readback.py script/studio_shorts_cut_quality_polish_workorder.py
bash -n script/agentctl.sh
./script/agentctl.sh studio-next-short-review-evidence --short-id episode-2-short-03 --json
./script/agentctl.sh studio-short-review-readback --short-id episode-2-short-03 --json
./script/agentctl.sh studio-shorts-cut-quality-polish-workorder --short-id episode-2-short-03 --json
./script/agentctl.sh studio-short-review-decision-ledger
```

Current ledger state:

- `83` shorts total.
- `9` decisions recorded.
- `4` `refine`.
- `4` `needs-more-evidence`.
- `1` `reject`.
- `74` pending.

Next ranked local short:

- `episode-3-short-03`
- Current readback says evidence is missing and next safest action is to create an evidence packet before recording intent.

Safety/truth:

- Local review intent only.
- No timeline edit performed.
- No media export performed.
- No source media mutation.
- No old version overwritten.
- No external upload, schedule, publication approval, account mutation, or receipt truth created.

## 2026-07-03 - Episode 3 short 03 transcript-aware refine decision

Processed the next ranked local short review candidate:

- Short: `episode-3-short-03`
- Title: `Episode 03 Short 03 V001`
- File: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_03/v001/shorts/episode-03-short-03-v001.mp4`
- Duration/shape: `45.0s`, `9:16`, `1080x1920`
- Evidence packet:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T074040Z-next-short-review-evidence.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T074040Z-next-short-review-evidence.md`
- Contact sheet:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-contact-sheets/episode-3-short-03/20260703T074038Z-episode-3-short-03-contact-sheet/episode-3-short-03-contact-sheet.html`
- Audio probe:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-audio-probes/episode-3-short-03/20260703T074039Z-episode-3-short-03-audio-probe/episode-3-short-03-audio-probe.html`
- ASR draft transcript:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/transcript-workorders/episode-3-short-03/episode-3-short-03-asr-draft-transcript.json`
- Local visual montage for agent inspection:
  - `/tmp/quipsly-episode-3-short-03-contact-montage.jpg`
- Polish workorder:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-polish-workorders/episode-3-short-03/20260703T074513Z-episode-3-short-03-polish-workorder/episode-3-short-03-polish-workorder.md`

Evidence summary:

- Visual contact sheet shows stable close-up framing with Charlie's face and mic visible, though the image is dark.
- Audio probe reports `15` meaningful pauses, `8` long pauses, `42.3%` silence, and a `3.589s` longest pause.
- ASR draft begins as a useful identity/setup beat: Charlie Sparrow's brother, trainer/frontline leader/data guy, giant nerd.
- ASR also suggests the current v001 ends mid-thought: `you're more the putting`.

Notes recorded:

- `hook`: useful intro/personality setup, but likely needs a tighter in-point or title setup.
- `cadence`: high silence and long-pause density require cadence surgery before posting.
- `jCutLCut`: the intro and later rambler-guy thought appear disconnected; v002 should bridge intentionally or choose one complete idea.
- `cropFraming`: stable but dark close-up framing.
- `captionPlan`: captions/title context are important because the visual is dark and the idea is setup-heavy.
- `endingPayoff`: current ASR appears to end mid-thought.
- `riskTradeoff`: promising source, current v001 not platform-ready.

Local ledger action:

- Recorded `episode-3-short-03` as `refine`.
- Reason: promising intro/personality source, but v001 has heavy silence and appears to end mid-thought; create a tighter v002 before platform posting.
- Ledger now reports `83` shorts, `10` decisions recorded, `5` `refine`, `4` `needs-more-evidence`, `1` `reject`, and `73` pending.

Validation run:

```bash
python3 -m py_compile script/experimental/build_studio_next_short_review_evidence_packet.py script/experimental/build_studio_short_review_readback.py script/studio_shorts_cut_quality_polish_workorder.py
bash -n script/agentctl.sh
./script/agentctl.sh studio-next-short-review-evidence --short-id episode-3-short-03 --json
./script/agentctl.sh studio-short-review-readback --short-id episode-3-short-03 --json
./script/agentctl.sh studio-shorts-cut-quality-polish-workorder --short-id episode-3-short-03 --json
./script/agentctl.sh studio-short-review-decision-ledger
```

Next ranked local short:

- `episode-5-short-03`
- Current readback says evidence is missing and next safest action is to create an evidence packet before recording intent.

Safety/truth:

- Local review intent only.
- No timeline edit performed.
- No media export performed.
- No source media mutation.
- No old version overwritten.
- No external upload, schedule, publication approval, account mutation, or receipt truth created.

## 2026-07-03 - Episode 5 short 03 rejected as current export

Processed the next ranked local short review candidate:

- Short: `episode-5-short-03`
- Title: `Episode 5 Test 03 Story Turn`
- File: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_05/v001/episode-05-v001-full-release-03-Episode-5-Test-Short-03-Story-turn-9x16-short.mp4`
- Duration/shape: `45.0s`, `9:16`, `1080x1920`
- Evidence packet:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T075000Z-next-short-review-evidence.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T075000Z-next-short-review-evidence.md`
- Contact sheet:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-contact-sheets/episode-5-short-03/20260703T074958Z-episode-5-short-03-contact-sheet/episode-5-short-03-contact-sheet.html`
- Audio probe:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-audio-probes/episode-5-short-03/20260703T074958Z-episode-5-short-03-audio-probe/episode-5-short-03-audio-probe.html`
- ASR draft transcript:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/transcript-workorders/episode-5-short-03/episode-5-short-03-asr-draft-transcript.json`
- Local visual montage for agent inspection:
  - `/tmp/quipsly-episode-5-short-03-contact-montage.jpg`

Evidence summary:

- Visual contact sheet shows warm expressive reaction frames and smiles.
- Audio probe reports `17` meaningful pauses, `16` long pauses, `81.51%` silence, and a `6.062s` longest pause.
- Mean volume is low at `-35.0 dB`.
- ASR draft finds only: `Hahaha! I do...` across the 45-second export.

Notes recorded:

- `hook`: visual reaction is usable, but the current export lacks enough spoken/contextual content.
- `cadence`: current v001 is mostly silence/dead air for social publishing.
- `reactionBeat`: source moment may work as a cover/cutaway if paired with setup/payoff.
- `captionPlan`: captions cannot rescue the current export because there are only a few transcript words.
- `endingPayoff`: current ASR does not show a clear payoff.
- `riskTradeoff`: reject current exported short, not necessarily the source moment.

Local ledger action:

- Recorded `episode-5-short-03` as `reject`.
- Reason: current v001 is mostly silence/reaction fragments: `81.51%` silence, `16` long pauses, and only a tiny ASR draft. Re-scout source if the reaction matters.
- Ledger now reports `83` shorts, `11` decisions recorded, `5` `refine`, `4` `needs-more-evidence`, `2` `reject`, and `72` pending.

Validation run:

```bash
python3 -m py_compile script/experimental/build_studio_next_short_review_evidence_packet.py script/experimental/build_studio_short_review_readback.py
bash -n script/agentctl.sh
./script/agentctl.sh studio-next-short-review-evidence --short-id episode-5-short-03 --json
./script/agentctl.sh studio-short-review-readback --short-id episode-5-short-03 --json
./script/agentctl.sh studio-short-review-decision-ledger
```

Safety/truth:

- Reject applies only to the current local exported short artifact.
- No timeline edit performed.
- No media export performed.
- No source media mutation.
- No old version overwritten.
- No external upload, schedule, publication approval, account mutation, or receipt truth created.

## 2026-07-03 - Episode 6 short 03 refined with transcript-aware evidence readback

### What changed

- Generated a targeted evidence packet for `episode-6-short-03`.
- Inspected visual contact frames, audio/cadence evidence, and the existing ASR draft sidecar.
- Recorded `episode-6-short-03` as `refine` in the local short review ledger.
- Added 11 versioned cut-quality sidecar notes covering hook, cadence, crop/framing, captions, J/L cuts, jump-cut cover, reaction beats, audio feel, ending payoff, platform fit, and risk tradeoff.
- Generated a polish workorder for a future `v002` recut.
- Patched the evidence packet and readback scripts so existing machine transcript drafts are surfaced with contact sheet and audio evidence.

### Decision

- Short: `episode-6-short-03`
- Decision: `refine`
- Reason: promising trust/setup short with expressive single-speaker visuals and usable audio, but the current `v001` starts mid-thought, repeats setup phrasing, and trails off before the payoff.
- Next safest action: create a tighter `v002` around a clearer trust hook, then proof-listen and caption-review before platform posting.

### Evidence

- Evidence packet: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T081112Z-next-short-review-evidence.json`
- Contact sheet: `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-contact-sheets/episode-6-short-03/20260703T075909Z-episode-6-short-03-contact-sheet/episode-6-short-03-contact-sheet.html`
- Audio probe: `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-audio-probes/episode-6-short-03/20260703T075910Z-episode-6-short-03-audio-probe/episode-6-short-03-audio-probe.html`
- ASR draft: `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/transcript-workorders/episode-6-short-03/episode-6-short-03-asr-draft-transcript.json`
- Caption draft: `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/transcript-workorders/episode-6-short-03/episode-6-short-03-caption-draft.srt`
- Local montage used for visual inspection: `/tmp/quipsly-episode-6-short-03-contact-montage.jpg`
- Polish workorder: `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-polish-workorders/episode-6-short-03/20260703T080505Z-episode-6-short-03-polish-workorder/episode-6-short-03-polish-workorder.md`

### Validation

```bash
python3 -m py_compile script/experimental/build_studio_next_short_review_evidence_packet.py script/experimental/build_studio_short_review_readback.py
bash -n script/agentctl.sh
./script/agentctl.sh studio-next-short-review-evidence --short-id episode-6-short-03 --save --json
./script/agentctl.sh studio-short-review-readback --short-id episode-6-short-03 --json
```

Readback confirmed:

- `latestDecision`: `refine`
- `evidenceStatus`: `studio-next-short-review-evidence-ready`
- `transcriptStatus`: `asr-draft-needs-human-review`
- `sidecarReviewNoteCount`: `11`
- `needsNoteFields`: `[]`

### Truth boundary

This created local review evidence, sidecar notes, a local review-ledger decision, a polish workorder, and transcript-aware readback only. It did not mutate source media, overwrite exports, publish, upload, schedule, approve externally, mutate accounts, or create receipt truth.

## 2026-07-03 - Ledger-only short evidence fallback and Episode 2 short 04 evidence hold

### What changed

- `episode-2-short-04` existed in the local short review ledger but was missing from the cut-quality workbench.
- Patched `studio-next-short-review-evidence` to create a one-short fallback workbench from the local review ledger when contact-sheet/audio-probe tools report `Short not found in cut-quality workbench`.
- Regenerated `episode-2-short-04` evidence successfully after fallback support.
- Created a worksheet for `episode-2-short-04` using the fallback workbench.
- Added 8 versioned sidecar notes for visual/audio review evidence.
- Recorded `episode-2-short-04` as `needs-more-evidence`, not reject.
- Updated the active source map to document that ledger-only shorts are a stale-index condition, not proof of invalid media.

### Decision

- Short: `episode-2-short-04`
- Decision: `needs-more-evidence`
- Reason: the short has strong visual contact frames and audio-probe evidence, but no transcript or listen evidence exists yet. Its content may be strong, but promoting it to keep/refine from frames alone would overfit to facial expression and ignore whether the idea lands.
- Next safest action: make transcript/listen evidence available, then decide whether this becomes a keep/refine candidate.

### Evidence

- Evidence packet: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets/20260703T081938Z-next-short-review-evidence.json`
- Fallback workbench: `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-workbench/single-short-fallbacks/episode-2-short-04-from-review-ledger.json`
- Contact sheet: `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-contact-sheets/episode-2-short-04/20260703T081937Z-episode-2-short-04-contact-sheet/episode-2-short-04-contact-sheet.html`
- Audio probe: `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-audio-probes/episode-2-short-04/20260703T081938Z-episode-2-short-04-audio-probe/episode-2-short-04-audio-probe.html`
- Worksheet: `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-worksheets/episode-2-short-04/20260703T082257Z-episode-2-short-04-cut-quality-worksheet.md`
- Local montage used for visual inspection: `/tmp/quipsly-episode-2-short-04-contact-montage.jpg`

### Validation

```bash
python3 -m py_compile script/experimental/build_studio_next_short_review_evidence_packet.py script/experimental/build_studio_short_review_readback.py
./script/agentctl.sh studio-next-short-review-evidence --short-id episode-2-short-04 --save --json
./script/agentctl.sh studio-short-review-readback --short-id episode-2-short-04 --json
./script/agentctl.sh studio-short-review-decision-ledger
```

Readback confirmed:

- `latestDecision`: `needs-more-evidence`
- `evidenceStatus`: `studio-next-short-review-evidence-ready`
- `transcriptStatus`: `missing`
- `sidecarReviewNoteCount`: `8`
- Ledger counts: `13` decisions recorded, `70` pending, `6` refine, `5` needs-more-evidence, `2` reject, `0` keep.

### Follow-up

- The stable `agentctl.sh studio-shorts-cut-quality-note` and `studio-shorts-cut-quality-worksheet` routes still need fallback-workbench awareness. Direct Python calls with `--workbench <fallback>` worked for this pass.
- Transcript intake is still not ledger-aware for `episode-2-short-04`; it returned zero items. Do not treat that as proof the short has no audio or is invalid.

### Truth boundary

This created local evidence, fallback metadata, sidecar notes, a local review-ledger decision, and documentation only. It did not mutate source media, overwrite exports, publish, upload, schedule, approve externally, mutate accounts, or create receipt truth.

## 2026-07-03 - Episode 2 short 04 transcript-aware rejection

- Hardened `studio-shorts-transcript-asr-draft` so an explicit short can resolve from the latest transcript-intake sidecar when the older transcript-intake workbench is stale.
- Proved the fix on `episode-2-short-04`: ASR plan resolved from `reviewSource: transcript-intake-sidecar` with no blockers.
- Ran local Whisper ASR against the 18.6s derivative audio sidecar. Outputs were written under `shorts-command-room/transcript-workorders/episode-2-short-04/` and `shorts-command-room/transcript-intake/asr-drafts/20260703T084521Z-episode-2-short-04-base/`.
- Refreshed evidence/readback so the review board shows `transcriptStatus: asr-draft-needs-human-review` and transcript preview instead of missing transcript evidence.
- Recorded a local `reject` for `episode-2-short-04`: it is visually expressive, but the transcript shows a generic episode welcome rather than a standalone social idea, joke, lesson, or complete emotional beat.
- Truth boundary held: no source media mutation, external upload, publication, schedule, account mutation, overwrite, approval, normalized transcript truth, or receipt truth.

## 2026-07-03 - Episode 3 short 04 transcript-aware refine decision

- Ran local transcript intake and ASR draft for `episode-3-short-04` from its derivative short export.
- Refreshed evidence/readback so the short now carries contact sheet, audio probe, caption draft, ASR draft transcript, and local review state.
- Recorded a local `refine` decision: the short has a promising identity/banter beat around trainer/frontline-leader/data-guy/giant-nerd and the rambler-vs-structure contrast, but v001 has high silence, long pauses, and trails off before the contrast fully lands.
- Refinement target: tighter in/out, preserve human warmth, improve caption placement, and avoid mistaking pauses for dead air without a human/editorial listen pass.
- Truth boundary held: no source media mutation, external upload, publication, schedule, account mutation, overwrite, approval, normalized transcript truth, or receipt truth.

## 2026-07-03 - Agent-safe short triage lane and Episode 5 short 04 refine decision

- Added `studio-short-review-triage`, an agent-facing command that gathers local short evidence, creates transcript/ASR draft evidence when missing, refreshes readback, and returns a recommendation.
- Default behavior is read/recommend only. `--record-decision` is required before it writes the local shorts review ledger.
- Proved the route on `episode-5-short-04`: evidence was created, transcript intake audio sidecar was extracted, local Whisper ASR draft and caption sidecars were created, evidence/readback was refreshed, and a local `refine` decision was recorded.
- Editorial reason: the transcript contains a strong anxiety/accountability beat, but the 45s v001 cut still needs tighter social pacing, silence review, caption placement review, and likely a sharper ending before it can be promoted.
- Truth boundary held: no original media mutation, external upload, publication, schedule, account mutation, overwrite, delete, normalized transcript truth, approval, or receipt truth.

## 2026-07-03 - Episode 6 short 04 saved triage and refine decision

- Added `--save` support to `studio-short-review-triage`, writing durable JSON/Markdown packets under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-triage/`.
- Ran a saved triage pass for `episode-6-short-04`: evidence, transcript intake, local Whisper ASR draft, refreshed readback, and a durable triage artifact were created.
- Recorded a local `refine` decision. The transcript suggests useful trust-framework material, but ASR around names/framework terms is rough, the cut is 45s, and the audio probe warns about over-tight cadence and near clipping.
- Refinement target: verify transcript by listening, recover correct framework/name wording, tighten the social hook, check harshness/clipping, and create captions that do not overclaim ASR truth.
- Truth boundary held: no source media mutation, external upload, publication, schedule, account mutation, overwrite, delete, normalized transcript truth, approval, or receipt truth.

## 2026-07-03 - Short refinement queue generated

- Added `studio-short-refinement-queue`, an agent/human workbench for local shorts marked `refine`.
- The queue ranks refine items, attaches available transcript/contact/audio/triage sidecars, and converts review notes into concrete next actions such as pacing, captions, transcript listen-checks, framing, audio, and ending cleanup.
- Validated with `./script/agentctl.sh studio-short-refinement-queue --limit 12 --all`.
- Output packet: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-refinement-queue/20260703T090954Z-short-refinement-queue.json` plus Markdown and HTML siblings.
- Current result: 9 refine items. All need pacing/transcript/caption work; 5 need audio review; 4 need framing review; 2 need ending cleanup.
- Truth boundary held: no source media mutation, external upload, publication, schedule, account mutation, overwrite, delete, approval, normalized transcript truth, or receipt truth.

## 2026-07-03 - V002 short refinement workorder and weak-hook warning

- Added `studio-short-refinement-workorder`, a source-safe v002 planning artifact for shorts in the refinement queue.
- The workorder includes transcript anchors, target duration, edit recipe, next actions, and a verification checklist.
- Improved hook selection so weak transcript anchors are flagged instead of treated as publishable hooks.
- Proved on `episode-5-short-02`: generated workorder `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-refinement-workorders/20260703T091539Z-episode-5-short-02-v002-workorder.json` with a weak-hook warning. The candidate appears to be context setup/ASR mush around Patreon, so the next safe move is source search/listen review before attempting v002 export.
- Truth boundary held: no source media mutation, export creation, external upload, publication, schedule, account mutation, overwrite, delete, approval, normalized transcript truth, or receipt truth.

## 2026-07-03 - First short v002 candidate export

- Added `studio-short-v002-candidate-export`, a source-safe v002 candidate exporter for refined shorts.
- The exporter reads the refinement queue/workorder, blocks weak-hook items by default, uses transcript timing for trim selection, writes a new v002 derivative candidate, and stores a manifest/Markdown recipe beside the MP4.
- Proved weak-hook safety on `episode-5-short-02`: export blocked by default because the hook candidate is throat-clearing/context setup.
- Proved v002 export on `episode-5-short-04`: created an 18.2s 1080x1920 candidate that starts on the stronger accountability hook: “Scott, I'd like to put you on the spot...”
- Current candidate output: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_05/v002/short-refinement-candidates/episode-5-short-04/20260703T092653Z-episode-5-short-04-v002-candidate-episode-5-test-04-practical-insight.mp4`.
- The embedded probe confirms video/audio present, 1080x1920, 18.199675s, and audio sanity `pass` with no issues/warnings. Human listen/watch review is still required before keep/publish decisions.
- Important boundary: this v002 proof is derivative-from-v001-short, not yet canonical whole-synced-source editing. It is acceptable for short refinement proof, but should not be confused with the final architecture for episode timeline edits.
- Truth boundary held: no original media mutation, v001 overwrite, external upload, publication, schedule, account mutation, delete, approval, normalized transcript truth, or receipt truth.

## 2026-07-03 - V002 candidate index generated

- Added `studio-short-v002-candidate-index`, a local review index for derivative v002 short candidates.
- Validated with `./script/agentctl.sh studio-short-v002-candidate-index --all`.
- Output packet: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-index/20260703T093322Z-short-v002-candidate-index.json` plus Markdown and HTML siblings.
- Current state: 2 current candidates. `episode-5-short-04` is exported and listen-review-ready with audio sanity pass. `episode-5-short-02` remains blocked by weak-hook warning and has no MP4 output.
- This closes the local loop from `refine` decision -> v002 workorder -> v002 candidate export -> v002 candidate index/readback.
- Important boundary: these are derivative v002 candidates from existing v001 short exports, not yet canonical whole-synced-source edits.
- Truth boundary held: no render occurred during indexing, no source media mutation, no overwrite, no external upload, no publication, no schedule, no account mutation, no delete, no normalized transcript truth, no approval, and no receipt truth.

## 2026-07-03 - V002 candidate review ledger proof

- Added `studio_short_v002_candidate_review.py`, a local append-only review lane for v002 short candidates.
- Wired commands through `agentctl.sh`:
  - `studio-short-v002-candidate-review-ledger`
  - `studio-short-v002-candidate-review-dry-run`
  - `studio-short-v002-candidate-review`
- Validated Python syntax and `agentctl.sh` syntax.
- Built the initial ledger from the current v002 candidate index.
- Dry-ran a `needs-listen` review event for `episode-5-short-04`.
- Recorded the conservative local review event for `episode-5-short-04`: objective preflight passed, but human/editorial watch-listen review is still required before any keep or publish decision.
- Regenerated the ledger sequentially after recording the event.

Current readback:

- Items: `2`
- Candidate exports: `1`
- Blocked weak hook: `1`
- Review events: `1`
- Reviewed candidates: `1`
- `episode-5-short-04`: `needs-listen`, reviewer `Codex`, 18.199675s, 1080x1920, audio sanity `pass`
- `episode-5-short-02`: `blocked-before-review`, weak hook, no MP4 output

Primary artifacts:

- Ledger JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-ledger/studio-short-v002-candidate-review-ledger.json`
- Ledger HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-ledger/index.html`
- Event log: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-ledger/studio-short-v002-candidate-review-events.jsonl`
- Snapshot: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-ledger/snapshots/20260703T094531Z-studio-short-v002-candidate-review-ledger.json`

Validation:

```bash
python3 -m py_compile script/studio_short_v002_candidate_review.py script/studio_short_v002_candidate_index.py
bash -n script/agentctl.sh
./script/agentctl.sh studio-short-v002-candidate-review-ledger --json
./script/agentctl.sh studio-short-v002-candidate-review-dry-run episode-5-short-04 needs-listen Codex 'Objective preflight passed; needs human watch/listen before keep.'
./script/agentctl.sh studio-short-v002-candidate-review episode-5-short-04 needs-listen Codex 'Objective preflight passed; needs human watch/listen before keep.' --json
./script/agentctl.sh studio-short-v002-candidate-review-ledger --json
```

Truth boundary: this pass created local review tooling, one local review event, and documentation. It did not mutate source media, overwrite exports, publish, upload, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.

## 2026-07-03 - V002 candidate evidence and v002b polish proof

- Added `studio_short_v002_candidate_evidence.py` and wired `studio-short-v002-candidate-evidence` into `agentctl.sh`.
- Generated an evidence packet for `episode-5-short-04` v002 candidate.
- Evidence showed the 18.2s candidate was visually coherent but contained a likely long trailing dead-air section:
  - longest silence: `4.88125s`
  - silence segments: `4`
  - recommendation: watch/listen before any keep decision
- Added `studio_short_v002_candidate_polish.py` and wired `studio-short-v002-candidate-polish` into `agentctl.sh`.
- First v002b render exposed a heuristic bug: the algorithm ranked by maximum saved time and produced an over-trimmed `5.73s` candidate. This was preserved as a versioned artifact, not overwritten.
- Corrected the heuristic to prefer silence in the trailing half of the candidate and rank by later start time.
- Rendered a corrected v002b candidate:
  - Path: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_05/v002/short-refinement-candidates/episode-5-short-04/20260703T100050Z-episode-5-short-04-v002b-candidate-silence-tail-trim.mp4`
  - Duration: `12.766341s`
  - Resolution: `1080x1920`
  - Audio/video present: `true`
- Regenerated evidence for the corrected v002b candidate:
  - Contact sheet: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-evidence/episode-5-short-04/20260703T100238Z/contact-sheet.jpg`
  - Audio warnings: none from automated checks
  - Longest remaining detected silence: `1.192396s`
- Tightened `studio_short_v002_candidate_index.py` so v002b manifests with media-probe proof report `probe-pass` instead of a false audio-sanity blocker.
- Refreshed candidate index and review ledger. Current readback shows `episode-5-short-04` as v002b, `probe-pass`, still `needs-listen`.

Validation:

```bash
python3 -m py_compile script/studio_short_v002_candidate_evidence.py script/studio_short_v002_candidate_polish.py script/studio_short_v002_candidate_index.py script/studio_short_v002_candidate_review.py
bash -n script/agentctl.sh
./script/agentctl.sh studio-short-v002-candidate-evidence --short-id episode-5-short-04 --json
./script/agentctl.sh studio-short-v002-candidate-polish --short-id episode-5-short-04 --json
./script/agentctl.sh studio-short-v002-candidate-index --all --json
./script/agentctl.sh studio-short-v002-candidate-review-ledger --json
```

Truth boundary: this pass created local evidence packets, derivative v002b candidate exports, versioned manifests, index/readback updates, and documentation. It did not mutate original source media, overwrite old versions, upload, publish, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.

## 2026-07-03 - V002b lineage and transcript-aware review evidence

- Patched `studio_short_v002_candidate_index.py` so v002b candidates can recover hook/source lineage from their `evidencePath` when the polished manifest predates direct hook propagation.
- Patched `studio_short_v002_candidate_polish.py` so future v002b manifests include direct `hookCandidate` and `sourceCandidate` metadata.
- Patched `studio_short_v002_candidate_evidence.py` so evidence packets include available machine transcript/caption sidecars from `shorts-command-room/transcript-workorders/<short-id>/`.
- Added low-overlap hook/transcript warning logic so candidate lineage drift can be surfaced instead of hidden.
- Regenerated the v002 candidate index and review ledger.
- Generated transcript-aware evidence for `episode-5-short-04` v002b.

Current readback for `episode-5-short-04`:

- Target version: `v002b`
- Duration: `12.766341s`
- Shape: `1080x1920`
- Media status: audio/video present, `probe-pass`
- Hook clue: `Scott, I'd like to put you on the spot...`
- Source candidate: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_05/v002/short-refinement-candidates/episode-5-short-04/20260703T092653Z-episode-5-short-04-v002-candidate-episode-5-test-04-practical-insight.mp4`
- Source evidence: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-evidence/episode-5-short-04/20260703T095505Z-episode-5-short-04-v002-candidate-evidence.json`
- Transcript sidecar: `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/transcript-workorders/episode-5-short-04/episode-5-short-04-asr-draft-transcript.json`
- Transcript status: `machine-draft-needs-review`
- Review status: `needs-listen`

Validation:

```bash
python3 -m py_compile script/studio_short_v002_candidate_evidence.py script/studio_short_v002_candidate_index.py script/studio_short_v002_candidate_polish.py
./script/agentctl.sh studio-short-v002-candidate-index --all --json
./script/agentctl.sh studio-short-v002-candidate-review-ledger --json
./script/agentctl.sh studio-short-v002-candidate-evidence --short-id episode-5-short-04 --json
```

Truth boundary: this pass improved metadata, readback, transcript clues, evidence packets, and docs. It did not mutate original source media, overwrite prior exports, upload, publish, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.

## 2026-07-03 - V002 candidate review theater

- Added `studio_short_v002_candidate_review_theater.py` and wired `studio-short-v002-candidate-review-theater` into `agentctl.sh`.
- Generated a local review theater for `episode-5-short-04` v002b.
- Theater output:
  - HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-theater/20260703T102355Z-short-v002-candidate-review-theater.html`
  - JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-theater/20260703T102355Z-short-v002-candidate-review-theater.json`
  - Markdown: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-theater/20260703T102355Z-short-v002-candidate-review-theater.md`
- The theater includes:
  - embedded local MP4 URI for the current v002b candidate
  - contact sheet image URI
  - hook clue
  - machine transcript preview and draft status
  - next safest action
  - copyable `keep`, `refine-again`, `reject`, and `hold` commands
- Performed a structural HTML check confirming the generated file has video, contact image, keep command, transcript preview, and truth text.

Validation:

```bash
python3 -m py_compile script/studio_short_v002_candidate_review_theater.py script/studio_short_v002_candidate_evidence.py
bash -n script/agentctl.sh
./script/agentctl.sh studio-short-v002-candidate-review-theater --short-id episode-5-short-04 --reviewer Codex --json
python3 - <<'PY'
from pathlib import Path
p=Path('/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-theater/20260703T102355Z-short-v002-candidate-review-theater.html')
text=p.read_text(encoding='utf-8')
assert '<video controls' in text
assert '<img src=' in text
assert 'studio-short-v002-candidate-review episode-5-short-04 keep' in text
assert 'machine-draft-needs-review' in text
assert 'does not approve' in text
PY
```

Truth boundary: this pass created local review HTML/JSON/Markdown and documentation only. It did not record a review decision, mutate original source media, overwrite exports, upload, publish, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.

## 2026-07-03 - Exact-candidate ASR sidecar fix

- Found a transcript-boundary bug: `local_transcript_provider.py` accepted any `.json` sidecar beside a media file, so the v002b candidate transcript pass accidentally read the candidate manifest as if it were ASR output.
- Patched `local_transcript_provider.py` so JSON sidecars must contain transcript-shaped text or segment data before they are accepted.
- Patched `local_transcript_provider.py` so SRT/VTT sidecars and whisper.cpp SRT output are normalized into Quipsly transcript JSON instead of leaking raw subtitle text into JSON-only callers.
- Patched `studio_short_v002_candidate_transcript.py` so JSON without usable transcript text fails before writing a `candidate-transcript-draft-ready` artifact.
- Patched `studio_short_v002_candidate_evidence.py` so existing empty candidate transcript sidecars are marked `candidate-machine-draft-empty` with a regeneration warning instead of treated as usable transcript clues.
- Regenerated exact-candidate ASR for `episode-5-short-04` v002b:
  - Transcript: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-transcripts/episode-5-short-04/20260703T111318Z-episode-5-short-04-candidate-transcript.json`
  - Preview: `I'd like to put you on the spot a little bit here and I'd like you to talk about how big of a pain this has been for you for me to be untrustworthy and to being consistent.`
- Regenerated candidate evidence:
  - Evidence: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-evidence/episode-5-short-04/20260703T111406Z-episode-5-short-04-v002-candidate-evidence.json`
  - Transcript status: `candidate-machine-draft-needs-review`
  - Transcript source: `candidate-specific-asr`
  - Recommendation: `needs-listen`
  - Automated warnings: none
- Regenerated review theater:
  - Theater: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-theater/20260703T111405Z-short-v002-candidate-review-theater.html`

Validation:

```bash
python3 -m py_compile script/local_transcript_provider.py script/studio_short_v002_candidate_transcript.py script/studio_short_v002_candidate_evidence.py
bash -n script/agentctl.sh
python3 script/local_transcript_provider.py --doctor
./script/agentctl.sh studio-short-v002-candidate-transcript --short-id episode-5-short-04 --provider auto --model base --json
./script/agentctl.sh studio-short-v002-candidate-evidence --short-id episode-5-short-04 --json
./script/agentctl.sh studio-short-v002-candidate-review-theater --short-id episode-5-short-04 --reviewer Codex --json
```

Truth boundary: this pass fixed transcript-provider integrity, regenerated local review evidence, and updated docs. It did not record a keep/refine/reject review decision, mutate original source media, overwrite prior exports, upload, publish, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.

## 2026-07-03 - Review theater agent readback schema

- Patched `studio_short_v002_candidate_review_theater.py` so generated JSON includes:
  - top-level `reviewer`
  - top-level `selectedShortId`
  - top-level `selectedCandidate`
  - stable `agentReadback` with short id, episode, target version, review status, candidate status, candidate path, evidence path, transcript status, transcript JSON, transcript preview, hook clue, recommendation, warning count, and review commands.
- Regenerated the `episode-5-short-04` review theater:
  - HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-theater/20260703T112816Z-short-v002-candidate-review-theater.html`
- Compact readback confirmed:
  - `selectedShortId`: `episode-5-short-04`
  - candidate path: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_05/v002/short-refinement-candidates/episode-5-short-04/20260703T100050Z-episode-5-short-04-v002b-candidate-silence-tail-trim.mp4`
  - transcript status: `candidate-machine-draft-needs-review`
  - warning count: `0`
  - recommendation: watch/listen with sound before `keep` or `refine-again`

Validation:

```bash
python3 -m py_compile script/studio_short_v002_candidate_review_theater.py
bash -n script/agentctl.sh
./script/agentctl.sh studio-short-v002-candidate-review-theater --short-id episode-5-short-04 --reviewer Codex --json
```

Truth boundary: this pass improved review-surface schema and regenerated local review artifacts only. It did not record a keep/refine/reject review decision, mutate original source media, overwrite prior exports, upload, publish, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.

## 2026-07-03 - V002 candidate index review-state join

- Patched `studio_short_v002_candidate_index.py` so the index reads the local review ledger alongside candidate manifests.
- Rows now expose separate fields for:
  - `status`: manifest/render state
  - `candidateStatus`: candidate export state from the review ledger when available
  - `reviewStatus`: local review decision state from the review ledger
  - `reviewer`
  - `reviewedAt`
  - `reviewNotes`
- Updated index counts so `needsListenReview`, `kept`, `refineAgain`, `held`, and `rejected` count review states instead of assuming every exported file needs listen review forever.
- Regenerated/read back the v002 candidate index.
- Current `episode-5-short-04` readback:
  - `status`: `v002-candidate-exported`
  - `candidateStatus`: `v002-candidate-exported`
  - `reviewStatus`: `needs-listen`
  - `reviewer`: `Codex`
  - `targetVersion`: `v002b`
  - `audioSanityStatus`: `probe-pass`
  - `outputExists`: `true`
  - `durationSeconds`: `12.766341`
  - next safest action: listen/watch with sound before any keep or publish decision

Validation:

```bash
python3 -m py_compile script/studio_short_v002_candidate_index.py
bash -n script/agentctl.sh
./script/agentctl.sh studio-short-v002-candidate-index --all --json
```

Truth boundary: this pass improved local index/readback schema only. It did not record a keep/refine/reject review decision, mutate original source media, overwrite prior exports, upload, publish, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.

## 2026-07-03 - Short v002 review queue

- Added `studio_short_v002_review_queue.py` and wired `studio-short-v002-review-queue` into `agentctl.sh`.
- The queue reads candidate manifests, the v002 candidate review ledger, and available evidence sidecars, then writes versioned local review queue artifacts.
- It produces agent-friendly `agentReadback` with:
  - next short id
  - readiness state
  - review status
  - candidate path
  - transcript status
  - next safest action
  - theater command
- First validation revealed a product-priority bug: missing-output items outranked actionable watch/listen items.
- Corrected priority order so actionable `watch-listen-next` and `unreviewed-export` items come before blocked artifacts. Blocked items stay visible but do not stall the queue.
- Current queue output:
  - JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-review-queue/20260703T121139Z-short-v002-review-queue.json`
- Current readback:
  - items: `2`
  - watch/listen next: `1`
  - blocked: `1`
  - next short: `episode-5-short-04`
  - readiness: `watch-listen-next`
  - review status: `needs-listen`
  - transcript status: `candidate-machine-draft-needs-review`
  - next action: watch/listen with sound, then record `keep` or `refine-again`

Validation:

```bash
python3 -m py_compile script/studio_short_v002_review_queue.py script/studio_short_v002_candidate_index.py
bash -n script/agentctl.sh
./script/agentctl.sh studio-short-v002-review-queue --reviewer Codex --limit 5 --json
```

Truth boundary: this pass created a local review queue/readback surface only. It did not record a keep/refine/reject review decision, mutate original source media, overwrite prior exports, upload, publish, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.

## 2026-07-03 - Short v002 quality brief

- Added `studio_short_v002_quality_brief.py` and wired `studio-short-v002-quality-brief` into `agentctl.sh`.
- The brief reads the v002 review queue and supporting evidence sidecars, then explains:
  - hook quality
  - platform/vertical fit
  - cadence and silence signals
  - risks
  - blockers
  - next safest action
  - explicit local review commands
- Generated the first quality brief for the next actionable queue item:
  - JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-quality-briefs/20260703T122046Z-episode-5-short-04-quality-brief.json`
- Current `episode-5-short-04` readback:
  - readiness: `watch-listen-next`
  - review status: `needs-listen`
  - review bias: `listen-for-keep`
  - hook label: `strong-human-hook`
  - duration: `12.8s`
  - risk count: `0`
  - blocker count: `0`
  - next action: watch/listen with sound; if the hook lands and ending feels complete, record `keep`

Validation:

```bash
python3 -m py_compile script/studio_short_v002_quality_brief.py script/studio_short_v002_review_queue.py script/studio_short_v002_candidate_index.py
bash -n script/agentctl.sh
./script/agentctl.sh studio-short-v002-quality-brief --reviewer Codex --json
```

Truth boundary: this pass created a local explanation/review-aid surface only. It did not record a keep/refine/reject review decision, mutate original source media, overwrite prior exports, upload, publish, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.

## 2026-07-03 - Quality brief edit-decision explanation

- Patched `studio_short_v002_quality_brief.py` so quality briefs include an `editDecisionExplanation` section.
- The explanation is inferred from local manifest/evidence metadata, especially v002b trim metadata.
- For `episode-5-short-04`, the regenerated brief now explains:
  - operation: `trailing-silence-trim`
  - summary: v002b derivative created by trimming likely trailing dead air from a v002 candidate
  - preserved: beginning of candidate through about `12.7s`
  - removed: about `5.4s`
  - selected silence: started near `12.5s`, lasted about `4.9s`
  - tradeoff: derivative proof from a v002 candidate, not canonical whole-source edit path
  - review checks: confirm the ending feels complete and no meaningful pause/reaction was clipped
- Regenerated quality brief:
  - JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-quality-briefs/20260703T122713Z-episode-5-short-04-quality-brief.json`

Validation:

```bash
python3 -m py_compile script/studio_short_v002_quality_brief.py
bash -n script/agentctl.sh
./script/agentctl.sh studio-short-v002-quality-brief --short-id episode-5-short-04 --reviewer Codex --json
```

Truth boundary: this pass improved local edit-explanation metadata only. It did not record a keep/refine/reject review decision, mutate original source media, overwrite prior exports, upload, publish, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.

## 2026-07-03 - V002 source-vs-polished candidate comparison

- Added `studio_short_v002_candidate_compare.py` and wired `studio-short-v002-candidate-compare` into `agentctl.sh`.
- The comparison tool runs local ASR on the current polished candidate and its source candidate, then checks the removed tail for likely clipped words/reaction.
- Patched `studio_short_v002_quality_brief.py` so quality briefs cite the latest candidate comparison when available.
- Generated comparison for `episode-5-short-04`:
  - JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-comparisons/episode-5-short-04/20260703T125230Z-episode-5-short-04-candidate-comparison.json`
  - status: `candidate-comparison-ready`
  - review bias: `tail-likely-safe`
  - removed-tail word count: `0`
  - warnings: `0`
  - next action: tail comparison found no obvious removed speech; still listen once before keep
- Regenerated quality brief with comparison evidence:
  - JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-quality-briefs/20260703T125304Z-episode-5-short-04-quality-brief.json`
  - edit operation: `trailing-silence-trim`
  - comparison bias: `tail-likely-safe`
  - removed-tail word count: `0`

Validation:

```bash
python3 -m py_compile script/studio_short_v002_candidate_compare.py script/studio_short_v002_quality_brief.py script/studio_short_v002_review_queue.py
bash -n script/agentctl.sh
./script/agentctl.sh studio-short-v002-candidate-compare --short-id episode-5-short-04 --provider auto --model base --json
./script/agentctl.sh studio-short-v002-quality-brief --short-id episode-5-short-04 --reviewer Codex --json
```

Truth boundary: this pass created local ASR comparison evidence and regenerated a local quality brief only. It did not record a keep/refine/reject review decision, mutate original source media, overwrite prior exports, upload, publish, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.

## 2026-07-03 - Review theater comparison panel

- Patched `studio_short_v002_candidate_review_theater.py` so the review theater loads latest source-vs-polished candidate comparison evidence.
- The theater now exposes comparison data in JSON/agent readback:
  - `comparisonStatus`
  - `comparisonBias`
  - `removedTailWordCount`
  - `sourceCandidatePath`
  - `comparisonPath`
- The theater HTML now shows:
  - current candidate video
  - source candidate video
  - contact sheet
  - transcript clue
  - source comparison summary
  - removed-tail word count and preview
  - copyable review commands
- Regenerated theater for `episode-5-short-04`:
  - HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-theater/20260703T125910Z-short-v002-candidate-review-theater.html`
- Readback:
  - comparison status: `candidate-comparison-ready`
  - comparison bias: `tail-likely-safe`
  - removed-tail word count: `0`
  - source candidate path: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_05/v002/short-refinement-candidates/episode-5-short-04/20260703T092653Z-episode-5-short-04-v002-candidate-episode-5-test-04-practical-insight.mp4`
- Structural HTML check confirmed current/source headings, source comparison section, `tail-likely-safe`, removed-tail word count, and source MP4 path are present.

Validation:

```bash
python3 -m py_compile script/studio_short_v002_candidate_review_theater.py
bash -n script/agentctl.sh
./script/agentctl.sh studio-short-v002-candidate-review-theater --short-id episode-5-short-04 --reviewer Codex --json
python3 - <<'PY'
from pathlib import Path
p=Path('/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-theater/20260703T125910Z-short-v002-candidate-review-theater.html')
text=p.read_text(encoding='utf-8')
assert 'Current candidate' in text
assert 'Source candidate' in text
assert 'Source comparison' in text
assert 'tail-likely-safe' in text
assert 'Removed-tail words' in text
PY
```

Truth boundary: this pass improved local review theater UI/readback only. It did not record a keep/refine/reject review decision, mutate original source media, overwrite prior exports, upload, publish, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.

## 2026-07-03 - V002 decision rehearsal surface

- Added `studio_short_v002_decision_rehearsal.py` and wired `studio-short-v002-decision-rehearsal` into `agentctl.sh`.
- The rehearsal reads the latest v002 quality brief and review theater evidence, then stages what `keep`, `refine-again`, `hold`, and `reject` would mean before anything writes to the review ledger.
- The surface keeps the current product principle explicit: maps are useful, but not commandments. Changing paths is allowed when it is purposeful, documented, and proven; rabbit-hole drift is the thing we are avoiding.

Useful command:

```bash
./script/agentctl.sh studio-short-v002-decision-rehearsal --short-id episode-5-short-04 --reviewer Codex --all
```

Truth boundary: this pass added dry-run review tooling only. It does not record a keep/refine/reject/hold review decision, mutate original source media, overwrite prior exports, upload, publish, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.

Generated decision rehearsal proof for `episode-5-short-04`:

- JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-decision-rehearsals/episode-5-short-04/20260703T131516Z-episode-5-short-04-decision-rehearsal.json`
- Markdown: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-decision-rehearsals/episode-5-short-04/20260703T131516Z-episode-5-short-04-decision-rehearsal.md`
- HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-decision-rehearsals/episode-5-short-04/20260703T131516Z-episode-5-short-04-decision-rehearsal.html`
- Readback: `listen-then-keep`, `safeToRecordNow: false`, comparison `tail-likely-safe`, removed-tail word count `0`.

## 2026-07-03 - Short v002 hook-rescue state cleanup

- Fixed `apps/QuipslyStudio/script/studio_short_v002_candidate_export.py` so explicit hook-rescue exports clear the current weak-hook warning while preserving it under `qualityWarningHistory` for lineage.
- Regenerated `episode-5-short-02` as a new v002 candidate without overwriting the older artifact.
- Refreshed the v002 candidate index, review ledger, exact candidate transcript, evidence packet, review queue, and decision rehearsal.
- Current queue truth: `episode-5-short-02` is `watch-listen-next`, `v002-candidate-exported`, `needs-listen`, with no automated warnings or blockers.
- Current candidate: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_05/v002/short-refinement-candidates/episode-5-short-02/20260703T135043Z-episode-5-short-02-v002-candidate-episode-5-test-02-coachable-moment.mp4`
- Review evidence: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-evidence/episode-5-short-02/20260703T135328Z-episode-5-short-02-v002-candidate-evidence.json`
- Decision rehearsal: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-decision-rehearsals/episode-5-short-02/20260703T135441Z-episode-5-short-02-decision-rehearsal.json`
- Truth boundary: local review/export artifacts only. No source media was mutated, no old export was overwritten, and no external publishing or receipt truth was created.

## 2026-07-03 - Short v002 decision rehearsal short-id routing

- Fixed `apps/QuipslyStudio/script/studio_short_v002_decision_rehearsal.py` so `--short-id` resolves the requested short instead of blindly using whichever quality brief/theater row was most recently selected globally.
- The rehearsal now loads the latest short-specific quality brief when the global pointer belongs to a different short, and it extracts the requested candidate row from an all-candidates theater payload.
- Re-ran `episode-5-short-04` rehearsal successfully after it previously reported `short-v002-decision-rehearsal-needs-fresh-evidence`.
- Current `episode-5-short-04` rehearsal: `listen-then-keep`, `safeToRecordNow: false`, `comparisonBias: tail-likely-safe`, removed-tail word count `0`.
- Rehearsal artifact: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-decision-rehearsals/episode-5-short-04/20260703T140916Z-episode-5-short-04-decision-rehearsal.json`
- Validation: `python3 -m py_compile apps/QuipslyStudio/script/studio_short_v002_decision_rehearsal.py apps/QuipslyStudio/script/studio_short_v002_candidate_export.py`
- Truth boundary: decision rehearsal remains a dry-run explanation surface. It does not record review decisions, mutate media, overwrite versions, publish, schedule, or create receipt truth.

## 2026-07-03 - Short v002 review gate in theater

- Improved `apps/QuipslyStudio/script/studio_short_v002_candidate_review_theater.py` so every v002 candidate card carries a `reviewGate` with plain-English local readiness boundaries, a watch/listen checklist, and keep/refine/hold/reject decision guidance.
- Regenerated the theater for `episode-5-short-02` and `episode-5-short-04`.
- Current theater artifact: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-theater/20260703T142739Z-short-v002-candidate-review-theater.html`
- Current JSON artifact: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-theater/20260703T142739Z-short-v002-candidate-review-theater.json`
- Current state: both candidates remain `needs-listen`; the theater explains that KEEP is local review readiness only, not publication or receipt truth.
- Validation: `python3 -m py_compile apps/QuipslyStudio/script/studio_short_v002_candidate_review_theater.py apps/QuipslyStudio/script/studio_short_v002_decision_rehearsal.py apps/QuipslyStudio/script/studio_short_v002_candidate_export.py`
- Truth boundary: no review decision was recorded, no source media was mutated, no previous export was overwritten, and no external publication or receipt truth was created.

## 2026-07-03 - Short v002 review gate in CLI queue

- Improved `apps/QuipslyStudio/script/studio_short_v002_review_queue.py` so every queue item now carries the same `reviewGate` semantics as the HTML review theater.
- The queue now exposes `nextReviewGateStatus` and `nextLocalReadinessBoundary` in `agentReadback`, so Codex and other agents can see that `KEEP` means local review readiness only, not publication or receipt truth.
- Regenerated queue artifact: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-review-queue/20260703T143221Z-short-v002-review-queue.json`
- Current queue state: `episode-5-short-02` and `episode-5-short-04` remain `watch-listen-next` / `needs-listen`; no review decision was recorded.
- Validation: `python3 -m py_compile apps/QuipslyStudio/script/studio_short_v002_review_queue.py apps/QuipslyStudio/script/studio_short_v002_candidate_review_theater.py apps/QuipslyStudio/script/studio_short_v002_decision_rehearsal.py`
- Truth boundary: no source media was mutated, no old export was overwritten, no external publishing occurred, and no receipt truth was created.

## 2026-07-03 - Short v002 review write-path boundaries

- Improved `apps/QuipslyStudio/script/studio_short_v002_candidate_review.py` so review ledger rows and dry-run/write events carry explicit `reviewGate`, `localReadinessBoundary`, and `receiptBoundary` data.
- A dry-run `keep` event for `episode-5-short-02` now reports `reviewGate.status: locally-kept` while also saying KEEP is local review readiness only, not YouTube/Instagram/Patreon/podcast/website publication.
- The ledger now exposes `agentReadback.nextReviewGateStatus` and `agentReadback.nextLocalReadinessBoundary` for CLI consumers.
- Current real ledger state remains unchanged: `episode-5-short-02` and `episode-5-short-04` are still `needs-listen`; no keep/refine/reject event was recorded.
- Validation: `python3 -m py_compile apps/QuipslyStudio/script/studio_short_v002_candidate_review.py apps/QuipslyStudio/script/studio_short_v002_review_queue.py apps/QuipslyStudio/script/studio_short_v002_candidate_review_theater.py`
- Dry-run proof: `./script/agentctl.sh studio-short-v002-candidate-review-dry-run episode-5-short-02 keep Codex 'Dry-run only: confirming local readiness boundary.'`
- Truth boundary: no source media was mutated, no old export was overwritten, no external publication occurred, and no receipt truth was created.

## 2026-07-03 - Short v002 review refresh command

Added `studio-short-v002-review-refresh` as the safe one-command refresh path for v002 short candidate review truth. It intentionally runs the review chain in order: candidate index, review ledger, transcript, evidence, quality brief, review theater, review queue, and decision rehearsal.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_review_refresh.py script/studio_short_v002_candidate_review.py script/studio_short_v002_review_queue.py script/studio_short_v002_candidate_review_theater.py script/studio_short_v002_decision_rehearsal.py script/studio_short_v002_candidate_evidence.py script/studio_short_v002_quality_brief.py script/studio_short_v002_candidate_transcript.py
./script/agentctl.sh studio-short-v002-review-refresh --reviewer Codex --json
```

Result: `short-v002-review-refresh-ready`, `failedSteps: 0`, `shorts: 2`, `queueItems: 2`, `sourceFilesMutated: false`, `versionsOverwritten: false`, `externalPublishing: false`, `receiptTruthCreated: false`.

Current queue truth:

- `episode-5-short-02`: `watch-listen-next`, `needs-human-listen`, no candidate warnings.
- `episode-5-short-04`: `watch-listen-next`, `needs-human-listen`, one candidate warning remains.

Truth boundary: this command refreshes local review readiness only. It does not record keep/refine/reject decisions, mutate media, overwrite exports, publish externally, or create receipt-backed platform truth.

## 2026-07-03 - Short v002 warning reasons in refresh readback

Improved `studio-short-v002-review-refresh` so compact queue items now include `warnings` and `warningSummary`, not just `warningCount`. This keeps caution visible without making reviewers or agents chase sidecars to understand what a warning means.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_review_refresh.py
./script/agentctl.sh studio-short-v002-review-refresh --reviewer Codex --skip-transcript --json
```

Result: `short-v002-review-refresh-ready`, `failedSteps: 0`, `queueItems: 2`, `sourceFilesMutated: false`, `versionsOverwritten: false`, `externalPublishing: false`, `receiptTruthCreated: false`.

Current warning truth:

- `episode-5-short-02`: no warnings.
- `episode-5-short-04`: `Derivative v002b proof from a v002 candidate, not canonical whole-source edit path.`

Interpretation: the warning is useful provenance context, not an export failure. The next safe action remains watch/listen review before recording keep/refine/hold/reject.

## 2026-07-03 - Short v002 theater/ledger warning truth alignment

Fixed a split-truth issue between the v002 review queue and review theater. The candidate index knew `episode-5-short-04` had a provenance warning, but the review ledger was dropping `qualityWarnings` and source-lineage fields, so the theater readback showed `warningCount: 0` while the queue showed `warningCount: 1`.

Change:

- `studio_short_v002_candidate_review.py` now preserves `qualityWarnings`, `sourceCandidatePath`, `sourceEvidencePath`, `sourceReviewStatus`, and `sourceTargetVersion` into the review ledger rows.
- `studio_short_v002_candidate_review_theater.py` now exposes `warningSummary` and `warnings` in agent readback, Markdown, and the HTML candidate header.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_candidate_review.py script/studio_short_v002_candidate_review_theater.py
./script/agentctl.sh studio-short-v002-candidate-review-ledger --json
./script/agentctl.sh studio-short-v002-candidate-review-theater --short-id episode-5-short-04 --reviewer Codex --json
```

Result: `episode-5-short-04` theater readback now reports `warningCount: 1` and warning summary `Derivative v002b proof from a v002 candidate, not canonical whole-source edit path.`

Truth boundary: this is local review clarity only. It does not record review decisions, mutate media, overwrite exports, upload, publish, schedule, or create receipt truth.

## 2026-07-03 - Short v002 watch/listen review evidence

Added lightweight review-evidence metadata to local v002 short candidate decisions. Recording a local review can now carry explicit `--watched`, `--listened`, and `--acknowledge-warnings` flags. The generated theater/ledger commands include those flags for KEEP/REFINE/REJECT after watch/listen review, and dry-runs warn when KEEP is attempted without them.

Changed:

- `studio_short_v002_candidate_review.py` records `reviewEvidence` on local review events.
- `studio_short_v002_candidate_review.py` generated safe commands now include `--watched --listened`, plus `--acknowledge-warnings` when the candidate has warnings.
- `studio_short_v002_candidate_review_theater.py` copyable KEEP/REFINE/REJECT commands now include the same evidence flags.
- `agentctl.sh` usage now documents the optional flags.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_candidate_review.py script/studio_short_v002_candidate_review_theater.py
./script/agentctl.sh studio-short-v002-candidate-review-dry-run episode-5-short-04 keep Codex 'Dry-run only; verifying watched/listened warning acknowledgement metadata.' --watched --listened --acknowledge-warnings --json
./script/agentctl.sh studio-short-v002-candidate-review-dry-run episode-5-short-04 keep Codex 'Dry-run only; verifying missing acknowledgement warnings.' --json
./script/agentctl.sh studio-short-v002-candidate-review-theater --short-id episode-5-short-04 --reviewer Codex --json
```

Positive dry-run result: `ledgerMutated: false`, `reviewEvidence.status: watch-listen-acknowledged`, candidate warning acknowledged, no review warnings.

Negative dry-run result: `ledgerMutated: false`, `reviewEvidence.status: missing-watch-listen-acknowledgement`, with warnings that KEEP would be provisional and candidate warnings were not acknowledged.

Truth boundary: these flags improve local review provenance only. They do not publish, upload, schedule, mutate media, overwrite exports, normalize transcript truth, mutate accounts, or create external receipt truth.

## 2026-07-03 - Short v002 decision rehearsal uses fresh theater commands

Aligned the v002 review refresh conveyor belt with the intended evidence order: candidate index, review ledger, candidate transcript/evidence/quality, review theater, decision rehearsal, then review queue. Decision rehearsal now reads the freshly generated theater commands instead of potentially stale theater pointers.

Changed:

- `studio_short_v002_decision_rehearsal.py` now carries `warningSummary`, `warnings`, and `watchListenExpectation` in context and agent readback.
- `studio_short_v002_decision_rehearsal.py` prefers review-theater commands that include `--watched --listened` and warning acknowledgement metadata over older quality-brief commands.
- `studio_short_v002_review_refresh.py` now runs decision rehearsals after rebuilding the review theater, and records decision warning summaries/readiness expectations per short.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_decision_rehearsal.py script/studio_short_v002_review_refresh.py script/studio_short_v002_candidate_review.py script/studio_short_v002_candidate_review_theater.py
./script/agentctl.sh studio-short-v002-review-refresh --reviewer Codex --skip-transcript --json
```

Result: `short-v002-review-refresh-ready`, `failedSteps: 0`, `shorts: 2`, `queueItems: 2`, no source media mutation, no old export overwrite, no external publishing, and no receipt truth.

Episode 5 proof readback:

- `episode-5-short-02`: no warning summary; decision rehearsal says watch/listen before recording local decision.
- `episode-5-short-04`: warning summary preserved as `Derivative v002b proof from a v002 candidate, not canonical whole-source edit path.`
- `episode-5-short-04` KEEP command after listen includes `--watched --listened --acknowledge-warnings`.
- `safeToRecordNow` remains `false` because the tool does not substitute machine evidence for human watch/listen judgment.

Truth boundary: this improves local decision rehearsal and review provenance only. It does not record review decisions, mutate media, overwrite exports, publish, schedule, upload, mutate accounts, normalize transcript truth, or create external receipt truth.

## 2026-07-03 - Short v002 review command alignment across queue, quality, theater, and rehearsal

Aligned the v002 review-command source so the queue, quality brief, review theater, and decision rehearsal all produce the same watch/listen-aware local review commands.

Changed:

- `studio_short_v002_review_queue.py` now generates KEEP/REFINE/REJECT commands with `--watched --listened`, plus `--acknowledge-warnings` when candidate warnings exist.
- `studio_short_v002_review_queue.py` now carries `warningSummary` and `watchListenExpectation` directly on each queue item and renders them in Markdown/HTML.
- `studio_short_v002_quality_brief.py` now carries and renders `warningSummary`, `warnings`, and `watchListenExpectation`, and includes REJECT in the visible command block.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_review_queue.py script/studio_short_v002_quality_brief.py script/studio_short_v002_candidate_review_theater.py script/studio_short_v002_decision_rehearsal.py script/studio_short_v002_review_refresh.py
./script/agentctl.sh studio-short-v002-review-refresh --reviewer Codex --skip-transcript --json
```

Result: `short-v002-review-refresh-ready`, `failedSteps: 0`, `shorts: 2`, `queueItems: 2`, no source media mutation, no export overwrite, no external publishing, and no receipt truth.

Episode 5 proof:

- Queue, quality brief, review theater, and decision rehearsal all report the same warning for `episode-5-short-04`: `Derivative v002b proof from a v002 candidate, not canonical whole-source edit path.`
- Queue, quality brief, review theater, and decision rehearsal all agree on the KEEP command after listen:

```bash
./script/agentctl.sh studio-short-v002-candidate-review episode-5-short-04 keep Codex 'Watched/listened locally; candidate works. Still not externally published.' --watched --listened --acknowledge-warnings
```

Truth boundary: this improves local review command consistency only. It does not record review decisions, mutate media, overwrite exports, upload, publish, schedule, mutate accounts, normalize transcript truth, or create external receipt truth.

## 2026-07-03 - Short v002 review-surface alignment verifier

Added `studio-short-v002-surface-alignment`, a local verifier that checks whether the v002 review queue, quality brief, review theater, and decision rehearsal agree on candidate warning summaries and KEEP/REFINE/REJECT local review commands.

Why: a review artifact can look official while carrying stale command text. The verifier catches that class of split-truth bug before a reviewer or agent copies the wrong local decision command.

Changed:

- Added `studio_short_v002_surface_alignment.py`.
- Wired `studio-short-v002-surface-alignment` into `agentctl.sh`.
- Standardized the upstream queue REJECT command text to match theater/rehearsal wording.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_surface_alignment.py script/studio_short_v002_review_queue.py script/studio_short_v002_quality_brief.py script/studio_short_v002_review_refresh.py
./script/agentctl.sh studio-short-v002-surface-alignment --refresh --skip-transcript --reviewer Codex --json
```

First run correctly failed because queue/theater/rehearsal REJECT commands used different note text. After standardizing the upstream queue command, the verifier passed.

Current proof: `short-v002-surface-alignment-ready`, `items: 2`, `failed: 0`, no source media mutation, no export overwrite, no external publishing, and no receipt truth.

Episode 5 proof items:

- `episode-5-short-02`: aligned, no warning summary.
- `episode-5-short-04`: aligned, warning summary `Derivative v002b proof from a v002 candidate, not canonical whole-source edit path.`

Truth boundary: this verifier reads and optionally refreshes local sidecars. It does not record review decisions, mutate media, overwrite exports, upload, publish, schedule, mutate accounts, normalize transcript truth, or create external receipt truth.

## 2026-07-03 - Short v002 refresh now verifies surface alignment

Integrated `studio-short-v002-surface-alignment` into `studio-short-v002-review-refresh` so every normal v002 review refresh also verifies that queue, quality brief, review theater, and decision rehearsal agree on warning summaries and local review commands.

Changed:

- `studio_short_v002_review_refresh.py` now runs a non-recursive `surface-alignment` step after rebuilding theater, decision rehearsals, and queue artifacts.
- Refresh JSON now includes `surfaceAlignmentStatus`, `surfaceAlignmentFailedShortIds`, `surfaceAlignmentFailed`, and compact per-short alignment results.
- Refresh Markdown now shows the surface-alignment status and per-short problem counts.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_review_refresh.py script/studio_short_v002_surface_alignment.py
./script/agentctl.sh studio-short-v002-review-refresh --reviewer Codex --skip-transcript --json
./script/agentctl.sh studio-short-v002-review-refresh --reviewer Codex --skip-transcript --markdown
```

Result: `short-v002-review-refresh-ready`, `failedSteps: 0`, `steps: 5`, `surfaceAlignmentStatus: short-v002-surface-alignment-ready`, `surfaceAlignmentFailed: 0`, no source media mutation, no export overwrite, no external publishing, and no receipt truth.

Current proof items:

- `episode-5-short-02`: surface-aligned, no warning summary.
- `episode-5-short-04`: surface-aligned, warning summary `Derivative v002b proof from a v002 candidate, not canonical whole-source edit path.`

Truth boundary: refresh remains a local sidecar/readback operation. It does not record review decisions, mutate media, overwrite exports, upload, publish, schedule, mutate accounts, normalize transcript truth, or create external receipt truth.

## 2026-07-03 - Short v002 human review packet

Added `studio-short-v002-human-review-packet`, a calm handoff artifact for current v002 short candidates. It runs the self-checking v002 refresh, then writes JSON/Markdown/HTML packets that tell a reviewer exactly what to watch, what warning matters, where to find theater/quality/rehearsal artifacts, and which local review command to copy after a real watch/listen pass.

Changed:

- Added `studio_short_v002_human_review_packet.py`.
- Wired `studio-short-v002-human-review-packet` into `agentctl.sh`.
- Packet JSON is self-describing and includes its own `outputPaths`.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_human_review_packet.py script/studio_short_v002_review_refresh.py script/studio_short_v002_surface_alignment.py
./script/agentctl.sh studio-short-v002-human-review-packet --reviewer Codex --skip-transcript --all
```

Result: `short-v002-human-review-packet-ready`, `items: 2`, `surfaceAlignmentFailed: 0`, JSON/Markdown/HTML/latest pointer all written under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-human-review-packet/`, no source media mutation, no export overwrite, no external publishing, and no receipt truth.

Current proof items:

- `episode-5-short-02`: surface-aligned, no warning summary, KEEP command includes `--watched --listened`.
- `episode-5-short-04`: surface-aligned, warning summary `Derivative v002b proof from a v002 candidate, not canonical whole-source edit path.`, KEEP command includes `--watched --listened --acknowledge-warnings`.

Truth boundary: this packet is a local handoff and review aid only. It does not record review decisions, mutate media, overwrite exports, upload, publish, schedule, mutate accounts, normalize transcript truth, or create external receipt truth.

## 2026-07-03 - Short v002 human review packet copy-button UI

Improved the v002 human review packet HTML so it works more like a calm reviewer surface instead of a static command dump. Each candidate card now includes artifact links and copy buttons for KEEP, REFINE, HOLD, and REJECT local review commands.

Changed:

- `studio_short_v002_human_review_packet.py` HTML now links to theater, quality brief, decision rehearsal, and evidence artifacts when available.
- Candidate cards now include copy buttons for local review commands.
- Clipboard copy includes a prompt fallback, plus a small toast confirmation.
- The raw command block remains visible for transparency.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_human_review_packet.py
./script/agentctl.sh studio-short-v002-human-review-packet --reviewer Codex --skip-transcript --all
```

Result: `short-v002-human-review-packet-ready`, `items: 2`, `surfaceAlignmentFailed: 0`, JSON/Markdown/HTML/latest pointer all exist. HTML checks confirmed copy buttons for KEEP/REFINE/REJECT, artifact links, clipboard handler, and warning-acknowledgement command text.

Current proof items:

- `episode-5-short-02`: surface-aligned, no warning summary.
- `episode-5-short-04`: surface-aligned, warning summary `Derivative v002b proof from a v002 candidate, not canonical whole-source edit path.` and warning-aware review command present.

Truth boundary: this is a local review UX improvement only. It does not record review decisions, mutate media, overwrite exports, upload, publish, schedule, mutate accounts, normalize transcript truth, or create external receipt truth.

## 2026-07-03 - Short v002 human review packet dry-run proof

Added optional generated-command dry-run verification to the short v002 human review packet. The packet can now run each generated KEEP, REFINE, HOLD, and REJECT command through `studio-short-v002-candidate-review-dry-run`, attach the non-mutating result to JSON/Markdown/HTML, and show a plain reviewer-facing dry-run status in the HTML packet.

Validation:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_human_review_packet.py
./script/agentctl.sh studio-short-v002-human-review-packet --reviewer Codex --skip-transcript --verify-commands --all
```

Result: `short-v002-human-review-packet-ready`; `commandDryRunFailed: 0`; `surfaceAlignmentFailed: 0`; `sourceFilesMutated: false`; `versionsOverwritten: false`; `externalPublishing: false`; `receiptTruthCreated: false`. Current packet paths are under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-human-review-packet/20260703T171329Z-short-v002-human-review-packet.*`.

## 2026-07-03 - Short v002 human packet now carries transcript and semantic edit context

Upgraded `script/studio_short_v002_human_review_packet.py` from a command/candidate handoff into a calmer edit-review handoff. Each packet item now reads existing shared-truth artifacts when present:

- Transcript review cockpit: `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/transcript-review-cockpit/quipsly-studio-shorts-transcript-review-cockpit.json`
- Semantic review queue: `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/semantic-review-queue/quipsly-studio-shorts-semantic-review-queue.json`

The packet now shows transcript status, word/segment counts, transcript sample/first words, hook state, cadence state, semantic flags, transcript next action, semantic next action, links to the transcript cockpit and semantic queue, and generated command dry-run status. This does not create a second scoring system; it exposes the existing transcript/semantic surfaces in the human review packet.

Validation:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_human_review_packet.py
./script/agentctl.sh studio-short-v002-human-review-packet --reviewer Codex --skip-transcript --verify-commands --all
```

Result: `short-v002-human-review-packet-ready`; version `2026-07-03.v2`; `commandDryRunFailed: 0`; `surfaceAlignmentFailed: 0`; `sourceFilesMutated: false`; `versionsOverwritten: false`; `externalPublishing: false`; `receiptTruthCreated: false`.

Current readback: `episode-5-short-02` has transcript status `machine-draft-needs-review`, 57 words, 3 segments, hook state `reviewable-hook-candidate`, cadence state `mini-argument-review`, and flag `machine-draft-needs-audio-check`. `episode-5-short-04` remains visibly missing linked transcript/semantic context while preserving its derivative-proof warning.

Current packet paths are under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-human-review-packet/20260703T180445Z-short-v002-human-review-packet.*`.

## 2026-07-03 - Short v002 review packet missing-context actions

Made missing transcript/semantic context actionable inside `script/studio_short_v002_human_review_packet.py`. The human review packet now reports `missingTranscriptContext` and `missingSemanticContext`, adds per-candidate `missingContext` status, and renders evidence-repair commands in Markdown/HTML when a candidate lacks linked words or semantic guidance.

Validation:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_human_review_packet.py
./script/agentctl.sh studio-short-v002-human-review-packet --reviewer Codex --skip-transcript --verify-commands --all
```

Result: `short-v002-human-review-packet-ready`; `commandDryRunFailed: 0`; `surfaceAlignmentFailed: 0`; `missingTranscriptContext: 1`; `missingSemanticContext: 1`; `sourceFilesMutated: false`; `versionsOverwritten: false`; `externalPublishing: false`; `receiptTruthCreated: false`.

Current readback: `episode-5-short-02` has transcript and semantic context linked. `episode-5-short-04` lacks both and now shows the next safe actions plus copyable local commands:

```bash
./script/agentctl.sh studio-short-v002-candidate-transcript --short-id episode-5-short-04 --json
./script/agentctl.sh studio-shorts-semantic-review-queue --all
```

Current packet paths are under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-human-review-packet/20260703T181114Z-short-v002-human-review-packet.*`.

Truth boundary: these actions prepare local review evidence only. They do not approve, publish, upload, schedule, mutate source media, overwrite exports, or create receipt truth.

## 2026-07-03 - Exact-candidate transcript sidecars wired into short v002 review packet

Repaired the transcript evidence seam for v002 short candidates.

Changes:

- Fixed `script/studio_short_v002_candidate_transcript.py` so transcript JSON is written after `outputPaths` are attached. Older transcript drafts had latest pointers but their payload JSON did not know its own file paths.
- Updated `script/studio_short_v002_human_review_packet.py` to read exact-candidate transcript sidecars from `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-transcripts/<short-id>/latest-<short-id>-candidate-transcript.json`.
- Exact-candidate transcript evidence now overrides broader transcript cockpit context in the human review packet because it is closer to the reviewed v002/v002b file.
- Missing semantic context actions now distinguish between “no words exist yet” and “exact candidate words exist but broad semantic queue guidance does not apply.” In the latter case, the packet routes reviewers to open the exact candidate transcript instead of pretending a semantic queue refresh proves confidence.

Validation:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_candidate_transcript.py script/studio_short_v002_human_review_packet.py
./script/agentctl.sh studio-short-v002-candidate-transcript --short-id episode-5-short-04 --json
./script/agentctl.sh studio-short-v002-candidate-transcript --short-id episode-5-short-02 --json
./script/agentctl.sh studio-short-v002-human-review-packet --reviewer Codex --skip-transcript --verify-commands --all
```

Result: `short-v002-human-review-packet-ready`; `commandDryRunFailed: 0`; `surfaceAlignmentFailed: 0`; `missingTranscriptContext: 0`; `missingSemanticContext: 1`; `sourceFilesMutated: false`; `versionsOverwritten: false`; `externalPublishing: false`; `receiptTruthCreated: false`.

Current readback:

- `episode-5-short-02`: exact-candidate transcript draft ready, 19 words, 2 segments, transcript JSON/Markdown paths exist, semantic context linked.
- `episode-5-short-04`: exact-candidate transcript draft ready, 38 words, 2 segments, transcript JSON/Markdown paths exist, semantic context not linked; packet now shows `Review exact candidate words` instead of an over-broad semantic refresh instruction.

Current packet paths are under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-human-review-packet/20260703T182028Z-short-v002-human-review-packet.*`.

Truth boundary: candidate transcripts are machine draft evidence for exact local candidate files. They are not normalized transcript truth, final caption approval, edit approval, external publishing, upload, schedule, account mutation, or receipt truth.

## 2026-07-03 - Exact-candidate semantic guidance for short v002 review packet

Added exact-candidate semantic fallback guidance to `script/studio_short_v002_human_review_packet.py`. When a v002/v002b candidate has an exact candidate transcript sidecar but is not represented in the broader semantic review queue, the packet now derives scoped heuristic guidance from the exact candidate words instead of leaving semantic context blank or pretending the broad queue applies.

This creates two explicit semantic scopes in the review packet:

- `shared-semantic-queue`: guidance came from the existing batch semantic queue.
- `exact-candidate`: guidance came from the exact candidate transcript draft for the file being reviewed.

Validation:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_human_review_packet.py
./script/agentctl.sh studio-short-v002-human-review-packet --reviewer Codex --skip-transcript --verify-commands --all
```

Result: `short-v002-human-review-packet-ready`; `commandDryRunFailed: 0`; `surfaceAlignmentFailed: 0`; `missingTranscriptContext: 0`; `missingSemanticContext: 0`; `sourceFilesMutated: false`; `versionsOverwritten: false`; `externalPublishing: false`; `receiptTruthCreated: false`.

Current readback:

- `episode-5-short-02`: semantic scope `shared-semantic-queue`, hook `reviewable-hook-candidate`, cadence `mini-argument-review`, flag `machine-draft-needs-audio-check`.
- `episode-5-short-04`: semantic scope `exact-candidate`, hook `candidate-reviewable-hook`, cadence `candidate-mini-argument-review`, flag `candidate-machine-draft-needs-listen-check`.

Current packet paths are under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-human-review-packet/20260703T182621Z-short-v002-human-review-packet.*`.

Truth boundary: exact-candidate semantic guidance is heuristic review evidence from a machine transcript draft. It is not normalized transcript truth, final caption approval, edit approval, export, publication, upload, schedule, account mutation, or receipt truth.

## 2026-07-03 - Candidate review checklist added to short v002 packet

Added candidate-specific watch/listen checklists to `script/studio_short_v002_human_review_packet.py`. Each review item now carries six explicit reviewer questions with evidence and tradeoff language:

- Hook
- Cadence
- Ending payoff
- Cut feel
- 9:16 framing and captions
- Decision tradeoff

The checklist is rendered in JSON, Markdown, and HTML. It uses the packet's existing transcript and semantic context, preserving scope labels such as `shared-semantic-queue` and `exact-candidate` so a reviewer can tell whether guidance came from the batch semantic queue or from the exact v002/v002b candidate transcript.

Validation:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_human_review_packet.py
./script/agentctl.sh studio-short-v002-human-review-packet --reviewer Codex --skip-transcript --verify-commands --all
```

Result: `short-v002-human-review-packet-ready`; `commandDryRunFailed: 0`; `surfaceAlignmentFailed: 0`; `missingTranscriptContext: 0`; `missingSemanticContext: 0`; `sourceFilesMutated: false`; `versionsOverwritten: false`; `externalPublishing: false`; `receiptTruthCreated: false`.

Current readback: both `episode-5-short-02` and `episode-5-short-04` have 6 checklist items. `episode-5-short-02` keeps semantic scope `shared-semantic-queue`; `episode-5-short-04` keeps semantic scope `exact-candidate`. HTML contains `Watch/listen checklist`; Markdown contains `Review checklist:`.

Current packet paths are under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-human-review-packet/20260703T184045Z-short-v002-human-review-packet.*`.

Truth boundary: the checklist is review guidance only. It records no decision, edits no timeline, approves no captions, exports nothing, publishes nothing, uploads nothing, schedules nothing, mutates no source media, overwrites no exports, and creates no receipt truth.

## 2026-07-03 - Exact-candidate caption draft sidecars for short v002 review packet

Added SRT/VTT caption draft generation to `script/studio_short_v002_candidate_transcript.py` for exact v002/v002b candidate transcripts. The script now writes versioned `.srt` and `.vtt` files beside the exact-candidate transcript JSON/Markdown and includes those paths in `outputPaths`.

Updated `script/studio_short_v002_human_review_packet.py` so each packet item links exact-candidate caption drafts as `Draft SRT` and `Draft VTT` when available.

Validation:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_candidate_transcript.py script/studio_short_v002_human_review_packet.py
./script/agentctl.sh studio-short-v002-candidate-transcript --short-id episode-5-short-02 --json
./script/agentctl.sh studio-short-v002-candidate-transcript --short-id episode-5-short-04 --json
./script/agentctl.sh studio-short-v002-human-review-packet --reviewer Codex --skip-transcript --verify-commands --all
```

Result: `short-v002-human-review-packet-ready`; `commandDryRunFailed: 0`; `surfaceAlignmentFailed: 0`; `missingTranscriptContext: 0`; `missingSemanticContext: 0`; `sourceFilesMutated: false`; `versionsOverwritten: false`; `externalPublishing: false`; `receiptTruthCreated: false`.

Current readback:

- `episode-5-short-02`: SRT draft exists, 169 bytes; VTT draft exists, 173 bytes; packet links both; 6 checklist items; 0 command dry-run failures.
- `episode-5-short-04`: SRT draft exists, 237 bytes; VTT draft exists, 241 bytes; packet links both; 6 checklist items; 0 command dry-run failures.

Current packet paths are under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-human-review-packet/20260703T184859Z-short-v002-human-review-packet.*`.

Truth boundary: candidate caption sidecars are machine draft review evidence for exact local candidate files. They are not final caption approval, burned-in captions, edit approval, export approval, publication, upload, schedule, account mutation, source mutation, or receipt truth.

## 2026-07-03 - Exact-candidate caption review stats in short v002 packet

Added caption draft review stats to `script/studio_short_v002_candidate_transcript.py` and surfaced those stats in `script/studio_short_v002_human_review_packet.py`.

Candidate transcript payloads now include `captionDraftReview` with cue count, longest cue length, max words per second, sample cue, status, warnings, and a truth boundary. The review packet now carries this into the `9:16 framing and captions` checklist item so reviewers can tell whether caption sidecars are merely present or actually reviewable.

Validation:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_candidate_transcript.py script/studio_short_v002_human_review_packet.py
./script/agentctl.sh studio-short-v002-candidate-transcript --short-id episode-5-short-02 --json
./script/agentctl.sh studio-short-v002-candidate-transcript --short-id episode-5-short-04 --json
./script/agentctl.sh studio-short-v002-human-review-packet --reviewer Codex --skip-transcript --verify-commands --all
```

Result: `short-v002-human-review-packet-ready`; `commandDryRunFailed: 0`; `surfaceAlignmentFailed: 0`; `missingTranscriptContext: 0`; `missingSemanticContext: 0`; `sourceFilesMutated: false`; `versionsOverwritten: false`; `externalPublishing: false`; `receiptTruthCreated: false`.

Current readback:

- `episode-5-short-02`: caption draft status `caption-draft-reviewable`, 2 cues, longest cue 52 chars, max 2.14 words/sec, no warnings.
- `episode-5-short-04`: caption draft status `caption-draft-needs-review`, 2 cues, longest cue 90 chars, max 3.86 words/sec, warning `long-caption-cue-text`.

Current packet paths are under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-human-review-packet/20260703T185508Z-short-v002-human-review-packet.*`.

Truth boundary: caption review stats are machine draft review hints for exact candidate sidecars. They are not final caption approval, burned-in captions, edit approval, export approval, publication, upload, schedule, source mutation, account mutation, or receipt truth.

## 2026-07-03 - Caption draft cue wrapping and tiny-cue merge

Improved exact-candidate caption draft generation in `script/studio_short_v002_candidate_transcript.py`.

Changes:

- Long transcript segments are split into <=72 character draft cues.
- Word-level timing is used when available, with proportional segment timing as fallback.
- Isolated <0.8s tiny cues are merged into a readable neighbor when that does not create an over-long cue.
- `captionDraftReview` now reports `wrappedCueCount`, `mergedTinyCueCount`, `wrappingPolicy`, timing source, cue counts, longest cue, max words/sec, and warnings.

Validation:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_candidate_transcript.py script/studio_short_v002_human_review_packet.py
./script/agentctl.sh studio-short-v002-candidate-transcript --short-id episode-5-short-04 --json
./script/agentctl.sh studio-short-v002-candidate-transcript --short-id episode-5-short-02 --json
./script/agentctl.sh studio-short-v002-human-review-packet --reviewer Codex --skip-transcript --verify-commands --all
```

Result: `short-v002-human-review-packet-ready`; `commandDryRunFailed: 0`; `surfaceAlignmentFailed: 0`; `missingTranscriptContext: 0`; `missingSemanticContext: 0`; `sourceFilesMutated: false`; `versionsOverwritten: false`; `externalPublishing: false`; `receiptTruthCreated: false`.

Current caption readback:

- `episode-5-short-02`: status `caption-draft-reviewable`, 2 cues, longest cue 50 chars, max 2.14 words/sec, 0 warnings, 0 merged tiny cues.
- `episode-5-short-04`: status `caption-draft-reviewable`, 3 cues, longest cue 81 chars, max 3.95 words/sec, 0 warnings, 1 merged tiny cue.

Current packet paths are under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-human-review-packet/20260703T190521Z-short-v002-human-review-packet.*`.

Truth boundary: these are still machine draft caption sidecars and review hints. They are not final caption approval, burned-in captions, edit approval, export approval, publication, upload, schedule, account mutation, source mutation, or receipt truth.

## 2026-07-03 - Draft platform metadata in short v002 human packet

Added draft platform metadata to `script/studio_short_v002_human_review_packet.py` so exact-candidate short review packets now include editable manual-publishing prep for YouTube Shorts, Instagram Reels, Facebook Reels, and LinkedIn.

Each packet item now includes:

- `platformDraft.status`
- draft title
- draft hook/caption text
- hashtags
- per-platform draft copy/check notes
- evidence scope including semantic scope and caption draft status
- explicit truth boundary that this is not upload approval, publication approval, scheduled content, external publication, or receipt truth

Validation:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
python3 -m py_compile script/studio_short_v002_human_review_packet.py
./script/agentctl.sh studio-short-v002-human-review-packet --reviewer Codex --skip-transcript --verify-commands --all
```

Result: `short-v002-human-review-packet-ready`; `commandDryRunFailed: 0`; `surfaceAlignmentFailed: 0`; `missingTranscriptContext: 0`; `missingSemanticContext: 0`; `sourceFilesMutated: false`; `versionsOverwritten: false`; `externalPublishing: false`; `receiptTruthCreated: false`.

Current readback:

- `episode-5-short-02`: platform metadata draft ready; title draft `I'll announce Patreon before this so I'll just say...`; hashtags include `#HighGroundOdyssey`, `#Leadership`, `#Podcast`, `#Shorts`, `#CreatorSupport`; caption status `caption-draft-reviewable`; semantic scope `shared-semantic-queue`.
- `episode-5-short-04`: platform metadata draft ready; title draft `I'd like to put you on the spot a...`; hashtags include `#HighGroundOdyssey`, `#Leadership`, `#Podcast`, `#Shorts`, `#Trust`, `#Accountability`; caption status `caption-draft-reviewable`; semantic scope `exact-candidate`.

Current packet paths are under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-human-review-packet/20260703T191549Z-short-v002-human-review-packet.*`.

Truth boundary: this is manual publishing prep only. It is not an upload, external publication, scheduled post, approval, account mutation, source mutation, or receipt truth.

## 2026-07-16 - Episode 4 Part 1 v004 publication candidate

- Corrected the v003 closing-insert audio defect without mutating source media.
- Final duration: 25:01.9. Conversation ends on "I'm gonna keep going" at 24:31.84, followed by 30 seconds of the Locutus cliffhanger and the generated "To be continued" stinger.
- Delivery audio: -16.0 LUFS integrated, -1.9 dBTP true peak, 8.1 LU LRA.
- Proofed the rendered MP4 using a full transcript, dedicated tail transcript, tail contact sheet, silence scan, black-frame scan, ffprobe, and local/external SHA-256 comparison.
- Marked v003 as superseded proof because it retained host dialogue under the closing insert.
- Current publication package: /Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Part_1/20260716-part1-v004
- Follow-up: add explicit insert-audio routing to the native exporter so watched clips and stingers can intentionally replace host program audio while camera scratch audio remains excluded by default.
