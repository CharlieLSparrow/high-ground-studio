# QuipslyStudio Worklog

This is the lightweight history log for production editor work. It is intentionally practical, not ceremonial.

Each entry should answer:
- Started / finished: when the work happened.
- Intent: what we were trying to improve.
- Changed: what actually changed.
- Proof: what was validated in the real app or harness.
- Residual risk: what still might bite us.
- Next move: the next smallest useful move.

The point is not bureaucracy. The point is shared memory, better estimates, and fewer haunted debugging loops.

## 2026-06-20 - Content partner doctrine clarified

Intent:
- Prevent Quipsly from accidentally regressing into a tool where agents can only organize, never create.

Changed:
- Strengthened the content partner doctrine and assistant boundaries: Codex and Quipslys are creative participants for workflow purposes and may create serious publishable-intent drafts, edits, packets, and examples when the product needs living material.
- Reaffirmed the real boundary: no hidden mutation, fake provenance, silent canon approval, fake publication, or invisible account/permission changes.

Proof:
- Documentation-only doctrine update. No build needed.

Residual risk:
- UI and schema labels still need to consistently separate `placeholder`, `agent-authored`, `needs-human-review`, `canon-approved`, and `published-with-receipt`.

Next move:
- Keep dogfooding Episode 1 and the Nest/Studio/Tower loop with agent-created work treated as reviewable real material, not filler.

## Logging practice

Use this as a captain's log, not a timesheet.

Log a work block when one of these is true:
- A feature path starts or finishes.
- A proof command passes or fails in a useful way.
- A decision changes direction.
- A blocker costs real time.
- A lesson would save tomorrow-us from repeating the same loop.

Keep entries short enough that they do not steal build time. A good entry should take under two minutes unless it is a handoff.

Recommended block format:

```text
## YYYY-MM-DD HH:MM-HH:MM TZ - Human title

Intent:
- ...

Changed:
- ...

Proof:
- ...

Residual risk:
- ...

Next move:
- ...
```

Timing should be approximate unless the exact time matters. The goal is trend sense: which kinds of work take minutes, which take hours, and which are secretly architecture problems wearing a tiny bug costume.

## 2026-06-18 16:16-16:45 MDT - Shared playhead and physical Program Output input proof

Intent: Make the editor easier for humans and Codex to operate directly by strengthening the Program Output scroll/scrub proof path and logging the work in a durable place.

Changed:
- Hardened `WorkspaceView` Program Output hit detection by tracking the `AVPlayerView` window-frame rectangle and accepting scroll events inside that hitbox, not just hover state.
- Added `script/mac_eventctl.swift` support for app-window-relative scroll/window-frame commands.
- Added `script/studioctl.sh ui-window-frame` and `ui-scroll-window` helpers so agent tests can target the canonical app window by fractions instead of brittle absolute pixels.

Proof:
- `./script/build_and_run.sh` succeeded and relaunched the canonical `com.highground.QuipslyMac` app.
- `./script/studioctl.sh warn-duplicates` showed canonical PID only and no legacy app PID.
- Episode 1 loaded as `episode-1-premiere-rescue` with 3 source monitor videos, 233 SHOW decisions, 121 SKIP decisions, and proxy production readiness.
- Shared playhead semantic proof remained synced after tests: `sharedPlayheadPassing=true`, `sharedPlayheadStatus=synced`, max source-player delta near 0.001s.

Residual risk:
- Physical scroll over Program Output still did not move the playhead in the current harness proof. The semantic `/program_scroll` path is reliable; the actual human/CGEvent scroll route still needs hardening.
- A mis-targeted physical scroll can still hit timeline zoom/live-switch controls, so physical input tests must use observable coordinates and immediate state checks.

Next move:
- Expose the Program Output hitbox in `/state`, add a dedicated `agentctl` physical-scroll proof command that targets that exact hitbox, and then fix the SwiftUI/AppKit scroll path until real two-finger scrolling over Program Output moves the same shared playhead.

## 2026-06-18 16:33-16:47 MDT - Program Output physical scroll proof command

Intent: Make Program Output scrolling reliable and provable for both human editors and Codex, so every scrub path is tied to the same shared episode spine.

Changed:
- Added `programMonitorHitbox` to the live `/state` payload and nested shared-playhead proof contract.
- Added `script/studioctl.sh ui-scroll-program`, which reads the Program Output hitbox from app state, converts window-local AppKit coordinates into global screen coordinates, and sends a real CGEvent scroll there.
- Added `script/studioctl.sh prove-program-scroll` as a repeatable smoke test for physical Program Output scrolling.

Proof:
- `./script/build_and_run.sh` succeeded and relaunched canonical `com.highground.QuipslyMac`.
- `./script/studioctl.sh warn-duplicates` showed only the canonical PID and no legacy app PID.
- `./script/studioctl.sh prove-program-scroll` passed: playhead moved from 2.50s to 18.90s, `sharedPlayheadPassing=true`, `sharedPlayheadStatus=synced`, and max source delta stayed near 0.001s.
- Computer Use visual inspection showed Episode 1 in Quipsly Studio, Program Output at the skipped-gap slate, Source Grove visible, and the masthead playhead at 18.90s.

Residual risk:
- Physical timeline drag proof is still not ratcheted the same way as Program Output scroll.
- Episode 1 remains test fodder; edit decision counts may drift during proof work and should not be treated as canonical final editorial intent.

Next move:
- Add the same style of first-class proof command for timeline drag/pinch zoom, then move into output preparation: 16:9 master, 9:16 shorts queue, podcast audio handoff, and publication receipt cockpit.

## 2026-06-18 17:41-17:54 MDT - Timeline drag and Agent Test Driver proof

Intent:
- Make the Episode Spine physically scrub the shared playhead in the real app, then prove Codex can operate the editor through semantic commands instead of fragile pixel guessing.

Changed:
- Added a broader, high-priority ruler scrub surface in `TimelineEditorView` and reused one bounded sequence-time scrub gesture.
- Updated the live timeline hitbox contract to point agents at `quipsly.timeline.rulerScrubSurface`.
- Added `script/studioctl.sh prove-agent-test-driver` as a semantic observe/act/re-observe proof for Codex editor control.
- Added `docs/quipsly/quipslystudio-agent-test-driver.md` to explain the driver as real product infrastructure, not a novelty backdoor.

Proof:
- `./script/build_and_run.sh --verify` passed with warnings only.
- `./script/studioctl.sh prove-timeline-drag` passed: Episode 1 moved from `0.0s` to `37.9s`, shared playhead status stayed `synced`, and source monitor sync stayed passing.
- `bash -n script/studioctl.sh` passed after fixing the shell proof structure.
- `./script/studioctl.sh prove-agent-test-driver` passed: the agent driver loaded Episode 1, zoomed the timeline, scrubbed near `42s`, selected a real video decision, opened the shorts workbench, switched to `9:16`, and kept shared source sync passing.

Residual risk:
- The driver proof currently validates control-plane capacity, not a full original editorial pass.
- Pinch zoom still needs a physical proof or a stronger semantic/gesture bridge.
- Agent action receipts exist in pieces; the next upgrade should save before/after packets for `prove-agent-test-driver` and show recent agent actions inside the app.

Next move:
- Start an intentional Codex editorial run on Episode 1 using the driver: observe, make original SHOW/SKIP/shorts decisions, re-observe, and improve the editor whenever the tool slows the editing work down.

## 2026-06-18 17:55-18:00 MDT - Codex original Episode 1 edit branch and short preview

Intent:
- Move from editor-control proof into an actual Codex editorial workflow without overwriting the proof/import session.

Changed:
- Saved a named branch session: `episode-1-codex-original-edit`.
- Added `script/agentctl.sh shorts-queue-summary` so agents can review short candidates without dumping repeated export receipt history.
- Loaded the Codex original branch and selected/previewed the short candidate `Farm Work Teaches Stewardship`.

Proof:
- `./script/agentctl.sh sessions` confirmed `episode-1-codex-original-edit` exists.
- `./script/agentctl.sh shorts-queue-summary` passed and showed 12 queued Episode 1 short candidates in a compact review form.
- Active state after preview: `activeSessionName=episode-1-codex-original-edit`, `playbackFormat=9:16`, selected short `Farm Work Teaches Stewardship`, duration `22.648s`, source sync passing.
- Captured visible app state at `/tmp/quipslystudio-codex-original-short-preview.png` and inspected it.

Residual risk:
- The selected short has not yet been creatively judged by watching/listening through the full segment.
- Codex window partially covered the app during screenshot inspection, so future visual QA should temporarily hide Codex or use a dedicated display/Space.
- The shorts queue still contains old exported candidates; the summary helps, but publish receipts and creative recipes should eventually be separated in-app.

Next move:
- Use the Codex original branch to do a real editorial review loop: watch/listen to candidate shorts, tighten boundaries/crops/captions, mark keep/refine/reject, then export a small proof packet.

## 2026-06-18 18:05 MDT - Agent Driver receipt packet hardening

Intent:
- Make Codex editor actions auditable by saving before/after state and command receipts for the Agent Test Driver.

Changed:
- Updated `script/studioctl.sh prove-agent-test-driver` to accept a session name and output folder.
- Defaulted the proof target to `episode-1-codex-original-edit` so agent proof runs happen on Codex's editorial branch, not the rescue/import baseline.
- Added durable proof artifacts under `.quipsly/agent-observations`: before state, after state, command list, and summary receipt.

Proof:
- Run `bash -n script/studioctl.sh` and `./script/studioctl.sh prove-agent-test-driver episode-1-codex-original-edit` after this patch.

Residual risk:
- This still proves command/control capacity, not final creative judgment.
- The next useful step is to make these receipts visible inside the app so human editors can review agent actions without opening JSON.

Lesson:
- Agent editing needs a flight recorder. The receipt is part of the product, not paperwork.

## 2026-06-18 18:15-18:20 MDT - Agent receipt workbench shipped into the real app

Intent:
- Move Agent Test Driver proof from terminal-only JSON into a visible QuipslyStudio workbench so human and Codex editor loops share the same proof surface.

Changed:
- Added an `Agent` mode to the left Workbench alongside Frame, Shorts, Script, and Ship.
- Added an Agent flight-recorder panel that reads `.quipsly/agent-observations` proof receipts.
- Added safe operator actions: refresh receipts, copy proof command, reveal receipt folder, copy summary path, copy commands path, and reveal a receipt.
- Extended `left-workbench agent` semantic control so Codex can open the same receipt surface a human sees.

Proof:
- `./script/build_and_run.sh --verify` passed and relaunched canonical `com.highground.QuipslyMac` with warnings only.
- `./script/studioctl.sh prove-agent-test-driver episode-1-codex-original-edit` passed and wrote durable before/after/commands/summary receipt files.
- `./script/agentctl.sh left-workbench agent` opened the new Agent workbench; `/state` reported `leftWorkbenchMode=agent`, `leftWorkbenchOpen=true`, and shared playhead sync still passing.
- Visual screenshot inspected at `/tmp/quipslystudio-agent-workbench-front.png`; the Agent receipt workbench is visible in the real running app.

Residual risk:
- Agent workbench UI is useful but cramped. It should eventually become calmer, more reviewable, and more like an edit-history surface than a utility drawer.
- Receipt creation still happens from scripts, not from a native in-app command button.

Lesson:
- A receipt is not paperwork if it helps the editor feel safe. For Quipsly, visible proof is part of the creative UX.

## 2026-06-18 18:22 MDT - Shorts review summary made more decision-ready

Intent:
- Make the Episode 1 shorts queue easier for Codex and humans to review honestly without confusing exported artifacts with approved social posts.

Changed:
- Extended `script/agentctl.sh shorts-queue-summary` with exported artifact paths, publish notes, primary export path, and a plain-English `reviewNextAction` for each short candidate.

Proof:
- Run `bash -n script/agentctl.sh` and `./script/agentctl.sh shorts-queue-summary` after this patch.

Lesson:
- Export status is not editorial approval. Quipsly should keep artifact truth and creative judgment separate so future model training can learn from both.

## 2026-06-18 18:25 MDT - Exported-short visual review contact sheets

Intent:
- Help Codex and humans inspect exported 9:16 short artifacts before creative review decisions without touching source media or edit metadata.

Changed:
- Added `script/shorts_contact_sheet.sh` to generate a six-frame PNG sheet from an exported derivative short using `ffmpeg`/`ffprobe`.
- Added `script/agentctl.sh shorts-contact-sheet /absolute/exported-short.mp4 [/absolute/output.png]` so the review aid is part of the same command spine as editing and receipts.

Proof:
- `bash -n script/shorts_contact_sheet.sh` passed.
- Generated `/tmp/quipsly-episode1-farm-work-contact-sheet.png` from the real `Farm Work Teaches Stewardship` exported short and visually inspected sane framing.
- Run `bash -n script/agentctl.sh` and generated another contact sheet through `agentctl` after this patch.

Residual risk:
- Contact sheets help with framing and obvious visual defects only. Keep/refine/reject still requires watching/listening to the actual short.

Lesson:
- Build review aids into the workflow before making judgment calls. That keeps agent editing honest and gives future ML clean examples of what evidence supported a decision.

## 2026-06-18 19:18 MDT - Episode 1 re-rooted into a real Quipsly edit branch

- Created `script/rebuild_episode1_real_edit.py` for a repeatable Episode 1 Codex original edit branch.
- Added `/apply_edit_plan` to the local AgentServer and `applyAgentEditPlan` in the native editor so agent edit plans apply atomically instead of racing hundreds of queued `/edit` commands.
- Rebuilt `episode-1-codex-real-edit-v1` as metadata over whole synced lanes, not chopped Premiere clips.
- Final audit for the branch: 10 kept story ranges, 36.339 minute intended runtime, 56 visual active intervals, 0 overlapping active video intervals.
- Gap scrub proof now reports `Play Edit gap` when no playable SHOW source is active; kept ranges report one active camera source.
- Timeline dense decision overlays now rely on color/icon texture instead of repeating SHOW/SKIP labels on every small block.

Validation run:

- `./script/build_and_run.sh --verify` passed with warnings only.
- `python3 script/rebuild_episode1_real_edit.py --execute` applied through the batch edit-plan route in under two seconds.
- Scrub proof sampled kept and skipped ranges: source sync passed and program state matched SHOW/gap truth.

Product lesson:

- Agent-scale editing needs batch semantic edit plans, not rapid-fire UI commands. The edit plan file is both a safe mutation receipt and early training data for future editor-learning workflows.
## 2026-06-19 - Episode 1 real-edit proof and timeline language cleanup

- Rebuilt the clean Quipsly-native Episode 1 edit as `episode-1-codex-real-edit-v1`.
- Preserved the core editor contract: whole synced sources remain intact; visible and quiet-gap decisions are metadata overlays.
- Verified the running app state after rebuild:
  - `showDecisionCount`: 75
  - `skipDecisionCount`: 82
  - `validRangeCount`: 17
  - estimated Play Edit runtime: about 36.34 minutes
- Exported a 90-second proof package:
  - `/Users/wall-e/Movies/QuipslyExports/Episode1RealEditProofs/20260619T012245Z/episode-1-codex-real-edit-v1-proof-16x9.mp4`
  - `/Users/wall-e/Movies/QuipslyExports/Episode1RealEditProofs/20260619T012245Z/episode-1-codex-real-edit-v1-proof-9x16.mp4`
- Exported a 300-second gap proof package to cross the first Play Edit quiet-gap collapse:
  - `/Users/wall-e/Movies/QuipslyExports/Episode1RealEditProofs/20260619T013216Z/episode-1-codex-real-edit-v1-gap-proof-16x9.mp4`
  - `/Users/wall-e/Movies/QuipslyExports/Episode1RealEditProofs/20260619T013216Z/episode-1-codex-real-edit-v1-gap-proof-9x16.mp4`
- Verified the 300-second proof with `ffprobe`:
  - 16:9: H.264 1920x1080, 30 fps, 300 seconds
  - 9:16: H.264 1080x1920, 30 fps, 300 seconds
  - Both currently export two AAC audio streams; this is acceptable for proof, but publishing should prefer one mixed stereo program track.
- Generated and visually inspected contact sheets:
  - `/tmp/episode1-real-edit-v1-gap-proof-16x9-contact-small.png`
  - `/tmp/episode1-real-edit-v1-gap-proof-9x16-contact-small.png`
- Cleaned timeline language:
  - Replaced dense SHOW/SKIP timeline chrome with visible/quiet wording and glyph counts.
  - Kept action labels explicit where they are verbs, such as source card buttons.
- Built and relaunched through `./script/build_and_run.sh --verify`; warnings are macOS `onChange` deprecations only.

Next hardening target:

- Mix export audio into a single stereo program track for publishable MP4s.
- Render a longer review artifact or chaptered contact sheet before calling the 36-minute Episode 1 edit ready for human review.
- Reconcile or regenerate shorts from `episode-1-codex-real-edit-v1`; old short packets are useful test fodder, not canonical final decisions.

Follow-up completed:

- Added an explicit `AVAudioMix` in `ExportEngine` for video and audio-master exports.
- Rebuilt through `./script/build_and_run.sh --verify`.
- Generated short proof exports:
  - `/Users/wall-e/Movies/QuipslyExports/Episode1RealEditProofs/20260619T015219Z-audio-mix-test/episode-1-codex-real-edit-v1-audio-mix-test-16x9.mp4`
  - `/Users/wall-e/Movies/QuipslyExports/Episode1RealEditProofs/20260619T015219Z-audio-mix-test/episode-1-codex-real-edit-v1-audio-mix-test-9x16.mp4`
- Verified with `ffprobe`: both short proof MP4s now contain one AAC audio stream and one H.264 video stream.

Updated next hardening target:

- Run a longer single-audio proof export now that the export contract is fixed.
- Continue reducing dense timeline language and improve editor readability without hiding source/action truth.

Longer mixed-audio proof completed:

- Generated 300-second mixed-audio gap proof exports:
  - `/Users/wall-e/Movies/QuipslyExports/Episode1RealEditProofs/20260619T015745Z-mixed-gap-proof/episode-1-codex-real-edit-v1-mixed-gap-proof-16x9.mp4`
  - `/Users/wall-e/Movies/QuipslyExports/Episode1RealEditProofs/20260619T015745Z-mixed-gap-proof/episode-1-codex-real-edit-v1-mixed-gap-proof-9x16.mp4`
- `ffprobe` confirms each proof has exactly:
  - one AAC audio stream
  - one H.264 video stream
  - 300 seconds duration
- Visual contact sheets confirm the export still shows the intended Charlie/Homer switching and vertical framing.

Current best proof artifact:

- Use the `20260619T015745Z-mixed-gap-proof` folder as the current Episode 1 proof receipt, not the earlier two-audio-stream proof.

## 2026-06-19 - Episode 1 full review master receipt

- Exported full review masters from `episode-1-codex-real-edit-v1` using the proxy-first Quipsly Studio export path.
- Folder: `/Users/wall-e/Movies/QuipslyExports/Episode1RealEditProofs/20260619T021041Z-full-review-master`.
- 16:9 master: H.264 1920x1080 30fps with AAC stereo, container duration 2180.33s.
- 9:16 master: H.264 1080x1920 30fps with AAC stereo, container duration 2180.33s.
- Contact sheets show real source switching in both formats.
- Watch-through flag: audio stream reports 2051.49s while container/video reports 2180.33s, so publication-final export needs audio tail/duration review.
- UI note captured: repeated `SHOW` / `SKIP` words in the timeline are visual clutter. Timeline should let honey/clay colors and texture do the work; words belong in legend, inspector, details, and accessibility labels.

## 2026-06-19 - Charlie framing baseline tightened for dark Episode 1 source

- Applied non-destructive program crop metadata to the whole Charlie camera lane in `episode-1-codex-real-edit-v1`.
- 16:9 Charlie baseline: `panX=0`, `panY=-0.20`, `zoom=1.22` using the same intent as the hide-desk preset.
- 9:16 Charlie baseline: `panX=0`, `panY=-0.06`, `zoom=1.35` for a tighter vertical solo frame.
- Cleared one stale 9:16 Charlie crop keyframe at 28.5s so the whole-lane baseline is not silently overridden.
- Generated 120s review proof: `/Users/wall-e/Movies/QuipslyExports/Episode1RealEditProofs/20260619T023200Z-charlie-tighten-proof`.
- Probe: both proof files are 120s H.264 video + AAC stereo audio. Contact sheets: `/tmp/episode1-charlie-tighten-16x9-contact.png` and `/tmp/episode1-charlie-tighten-9x16-contact.png`.
- Product lesson: dark source footage can often be improved editorially with tighter face-first framing before true color/light correction exists. Keep this as reversible metadata, not source mutation.

## 2026-06-19 - Charlie upper-third composition proof

- Refined Charlie camera baseline crop to target head/eyes in the upper-middle third rather than merely making the shot tighter.
- 16:9 Charlie baseline: `panX=0.03`, `panY=-0.24`, `zoom=1.26`.
- 9:16 Charlie baseline: `panX=0.04`, `panY=-0.18`, `zoom=1.42`.
- Generated 90s proof: `/Users/wall-e/Movies/QuipslyExports/Episode1RealEditProofs/20260619T023656Z-charlie-upper-third-proof`.
- Contact sheets: `/tmp/episode1-charlie-upper-third-16x9-contact.png` and `/tmp/episode1-charlie-upper-third-9x16-contact.png`.
- Product/UI note: crop controls should grow semantic presets like `upper-third centered` because creator intent is composition language, not pan/zoom math.

## 2026-06-19 - Base framing and editor learning loop captured

- Product insight: base framing needs to be a first-class tool per source lane, with semantic composition presets such as `upper-third centered`, not just numeric crop controls.
- Product insight: Mako correction passes should become learning data. Codex/Quipsly can make first-pass edits, then Mako's corrections and optional notes become structured edit deltas for future first cuts.
- Added durable doctrine: `docs/quipsly/quipslystudio-editor-learning-loop.md`.
- UI pass started: timeline visible text should prefer `Visible` / `Quiet` in guidance while dense bars rely on honey/clay color, icon, texture, and selection state.

## 2026-06-18 21:10 - Base framing and learning loop checkpoint

- Confirmed QuipslyStudio launches through `./script/build_and_run.sh --verify` and opens the Episode 1 proof session in the real Mac app.
- Reframed lane-level default crop as **Base Framing**: whole-source lanes keep a stable default frame, while timed keyframes should become deliberate deviations from that base.
- Captured the next doctrine: Codex/Quipsly first cut -> Mako/human correction pass -> optional notes -> structured edit deltas -> better future first cuts.
- Important follow-up: add semantic agent endpoints for base framing/keyframe edits so Codex can adjust framing without mouse-coordinate hacks, and add a correction ledger for Mako notes and edit-delta capture.

## 2026-06-18 21:35 - Semantic base-frame and correction-note loop

- Added additive `MediaSequence.editCorrectionNotes` with `EditCorrectionNoteRecord` for optional human/agent review notes.
- Added `/correction_note` to the local AgentServer and wired it into Workspace command handling.
- Exposed `editCorrectionNoteCount`, `latestEditCorrectionNote`, and recent `editCorrectionNotes` through `/state`.
- Promoted base-frame/keyframe reframing and human-correction learning loop into `agentCapabilityParity`, safe actions, and the editor control plane.
- Proved on the running Episode 1 session by selecting Charlie's lane, applying the `upper-third` 16:9 base-frame preset, recording a Codex framing correction note, and re-observing `/state`.
- Visible proof: `/tmp/quipsly-correction-loop-proof.png` shows Program Output overlay as `BASE FRAME whole source` with the selected Charlie lane.

## 2026-06-19 - Edit action ledger and Script Now scaffold

- Added additive `MediaSequence.editActionLedger` with `EditActionLedgerRecord`.
- Program crop mutations now automatically store before/after JSON for base-frame changes, crop presets, crop keyframes, and crop keyframe clearing.
- `/state` now exposes `editActionLedgerCount`, `latestEditActionLedgerEntry`, and `editActionLedger`.
- Added a Script sidebar `Script Now` panel that shows the current transcript speaker and estimated active word at the shared playhead.
- `/state` now exposes `currentTranscriptWord` as an agent-readable text-awareness contract.
- Build proof: `./script/build_and_run.sh --verify` passed.
- Ledger proof: applying the 16:9 `upper-third` preset to Charlie's lane created `program-crop-preset-base-frame` in the ledger.
- Transcript proof: `GET /transcript_seed_demo` created 6 demo transcript segments; `/state` reported `currentTranscriptWord.word = This` at playhead 0.
- Screenshot proof: `/tmp/quipsly-script-ledger-proof.png`.
- Next product target: replace estimated word timing with real word-level transcript timing, then use Episode 2 and Episode 3 as transfer-learning stress tests before returning to Episode 1 for a labeled second pass.

## 2026-06-19 - Word-level transcript timing seam

- Added `TranscriptWordTiming` and additive `TranscriptSegment.words` with backward-compatible decoding.
- Extended transcript parsing so SRT/VTT imports get estimated word timings and JSON imports can carry true word-level timings.
- Updated Script Now UI and `/state.currentTranscriptWord` to distinguish `demo_word_timing`, `estimated_from_segment_duration`, and `word_level_timing`.
- Build proof: `./script/build_and_run.sh --verify` passed.
- Runtime proof: seeded demo transcript reports `demo_word_timing`; imported JSON proof at 1.2s reports `gamma` from `json-word-timing` with `word_level_timing`.
- Restored Episode 1 to the demo transcript scaffold after proof so the tiny JSON proof transcript does not remain as active episode context.
- Screenshot proof: `/tmp/quipsly-wordtiming-final-proof.png`.
- Next target: wire a real transcription provider/output into this shape and use word timing for jump-to-word, caption review, and cut suggestions.

## 2026-06-19 04:42Z - Transcript word navigation proof

- Finished the first word-navigation slice in QuipslyStudio.
- Added selected transcript word state, clickable Script Now word chips, `/transcript_word` agent command handling, and `/state.selectedTranscriptWord`.
- Fixed the `script-aware-editing` capability contract so it advertises `/transcript_select` and `/transcript_word` instead of stale route text.
- Build proof: `./script/build_and_run.sh --verify` passed.
- Runtime proof: seeded demo transcript, selected first word, advanced to next word, and confirmed shared playhead at `0.50s` with `currentTranscriptWord.word = is` and `selectedTranscriptWord.word = is`.
- Screenshot proof: `/tmp/quipsly-transcript-wordnav-proof.png`.

## 2026-06-19 04:48Z - Script Now visible word controls

- Added visible `Prev word`, `Next word`, and `At playhead` buttons to Script Now.
- Reused the same selected-word path used by `/transcript_word`, keeping human controls and agent controls aligned.
- Build proof: `./script/build_and_run.sh --verify` passed.
- Runtime proof: `/state` reported `currentTranscriptWord.word = the`, `selectedTranscriptWord.word = the`, and playhead `1.00s` after two next-word commands.
- Screenshot proof: `/tmp/quipsly-transcript-wordnav-ui-proof.png`.

## 2026-06-19 05:05Z - Edit pass context proof

- Added additive `MediaSequence.editPassContext` with decode-default compatibility.
- Added `/edit_pass` to mark current dogfood/review pass context.
- `/state` now exposes `editPassContext`.
- Marking an edit pass writes an `edit-pass-context` ledger entry with before/after JSON.
- Build proof: `./script/build_and_run.sh --verify` passed.
- Runtime proof: set `Codex Episode 1 dogfood pass`; `/state.editPassContext` and `latestEditActionLedgerEntry.actionId = edit-pass-context` confirmed it.
- Doctrine: edit-pass labels are clarity aids, not quality gates or compliance scores.

## 2026-06-19 05:15Z - Episode 2 handoff and ambiguity proof

- Saved Episode 1, loaded `episode-2-native-proof`, and marked `Codex Episode 2 dogfood pass`.
- Confirmed Episode 2 readiness: 9 lanes, 5 video proxies ready, 0 blocked video, 0 blocked audio, 5 queued short recipes.
- Scrubbed 20s, 420s, 900s, and 1800s; source sync stayed green with millisecond-scale deltas.
- Added `/state.programDecisionAmbiguity` to flag multiple active visual lanes at the playhead without mutating decisions.
- Proof at 20s: 3 active visual lanes, 2 active speaker lanes, `needs_program_decision_review`, source sync still `synced`.

## 2026-06-19 05:22Z - Program ambiguity report for Episode 2

- Added on-demand `/program_ambiguity_report` command.
- Added `/state.programDecisionAmbiguityReport` for the latest report.
- The report samples decision-boundary intervals and flags multi-speaker/multi-visual SHOW overlaps without changing edit metadata.
- Build proof: `./script/build_and_run.sh --verify` passed.
- Episode 2 proof: `reviewPointCount=232`, `sampledIntervalCount=273`, `sourceIntervalCount=546`, `maxActiveVisualLaneCount=3`, `maxActiveSpeakerLaneCount=2`.
- Editorial next step: resolve imported overlap ambiguity into intentional Quipsly program decisions instead of trusting Premiere track stacking.

## 2026-06-19 - Episode 2 ambiguity review queue

Added navigable ambiguity review points for Episode 2 dogfooding.

Changed:
- Added selected program ambiguity example state.
- Added `/program_ambiguity_review` agent route.
- Added Prev/Next review buttons to the Program Hearth overlap card.
- Added selected review-point payload to `/state`.
- Updated agent capability wording so agents can map overlaps, jump review points, then make explicit non-destructive SHOW/SKIP decisions.

Validation:
- `./script/build_and_run.sh --verify` passed.
- Loaded `episode-2-native-proof`.
- Ran `/program_ambiguity_report?sample_limit=500`.
- Ran `/program_ambiguity_review?mode=first`, `/program_ambiguity_review?mode=next`, and `/program_ambiguity_review?mode=previous`.
- Confirmed playhead moved 7.30s -> 16.02s -> 7.30s and `/state.selectedProgramDecisionAmbiguityExample` tracked the selected review point.
- Screenshot: `/tmp/quipsly-episode2-reviewnav-proof.png`.

Next useful hardening target: make each selected ambiguity point offer explicit safe resolution actions, such as choose Charlie, choose Homer, keep both, or mark quiet gap for the current interval, while preserving whole synced source lanes.

## 2026-06-19 - Program ambiguity resolve controls

Added one-point ambiguity resolution for Episode 2 dogfooding.

Changed:
- Added `/program_ambiguity_resolve?choice=first|second|third|skip|<lane-id-or-name>`.
- Added visible `Use 1`, `Use 2`, and `Quiet` controls when a review point is selected.
- Reused the shared decision-window replacement path so the selected interval is trimmed/replaced cleanly while surrounding decisions remain intact.
- Marked existing ambiguity reports stale after a resolution so stale counts are not silently presented as fresh truth.

Validation:
- `./script/build_and_run.sh --verify` passed.
- Loaded `episode-2-native-proof`.
- Mapped overlaps, navigated to the first review point, resolved it as the first source, then remapped.
- Confirmed before/after state: 2 active visual/speaker lanes at 7.30s became 1 active visual/speaker lane at 5.72s, and report count dropped 232 -> 231.
- Screenshot: `/tmp/quipsly-episode2-resolve-proof.png`.

Next useful hardening target: add `Resolve + Next` for rapid keyboard/agent pass-through, then start doing an opinionated Episode 2 first-pass cleanup while improving the controls that slow the edit down.

## 2026-06-19 - Resolve + Next proof

Added and verified fast ambiguity queue advancement.

Changed:
- Added `advance=next` to `/program_ambiguity_resolve`.
- Added `Use 1 + Next` visible control.
- Updated agent capability/manual route text.

Validation:
- `./script/build_and_run.sh --verify` passed.
- Loaded `episode-2-codex-overlap-review-v1`.
- Ran `/program_ambiguity_resolve?choice=first&advance=next`.
- Confirmed review count dropped 231 -> 230 and selected next review point moved to 23.80s.
- Saved `episode-2-codex-overlap-review-v2`.
- Screenshot: `/tmp/quipsly-episode2-advance-next-proof.png`.

Next useful hardening target: add clip-preserving resolution choices because some ambiguity points combine speaker choices with source/title/reference overlays.

## 2026-06-19 - First Clip proof

Added clip-preserving ambiguity resolution.

Changed:
- Added `1 + Clip` and `2 + Clip` buttons in the Program Hearth review card.
- Extended `/program_ambiguity_resolve` choices to include `first_clip` and `second_clip`.
- Resolution keeps active source/title/reference/clip lanes from the selected review point while choosing one speaker lane and cutting competing visuals.

Validation:
- `./script/build_and_run.sh --verify` passed.
- Loaded `episode-2-codex-overlap-review-v2`.
- At 23.80s, verified 3 active visual lanes, 2 speaker lanes, 1 source clip lane.
- Resolved with `choice=first_clip`.
- Verified Program became Charlie + Source Clip, with 2 active visual lanes, 1 speaker lane, 1 source clip lane, and clear ambiguity at playhead.
- Remapped review count 230 -> 229.
- Saved `episode-2-codex-overlap-review-v3`.
- Screenshot: `/tmp/quipsly-episode2-first-clip-proof.png`.

## 2026-06-19 - Script read-along and Option-layer review shortcuts

Added a calmer script-awareness surface and keyboard-first review controls while continuing Episode 2 dogfooding.

Changed:
- Reworked `Script Now` into a read-along panel that shows the current speaker, active word, and surrounding word chips tied to the shared playhead.
- Kept transcript text as awareness metadata, not an inline writing editor: words can become jump points, captions, quotes, short hooks, and edit evidence without becoming detached text boxes.
- Added shortcut hints for transcript word navigation: `Option+Comma`, `Option+Period`, and `Option+S`.
- Added an Option-key overlap review layer: `Option+R` maps overlaps, `Option+[` / `Option+]` navigates the review queue, and `Option+1/2/4/5/6` resolves selected ambiguity points while advancing.
- Added a visible `Use 2 + Next` control alongside `Use 1 + Next` so the Episode 2 cleanup queue can move without mouse hunting.

Product lesson:
- The transcript spine is not just captions. It is labeled editing context: who said what, when it happened, what visual decision was active, and later what a human corrected. That is the annotation loop we want Quipsly to grow from.

Validation:
- `./script/build_and_run.sh --verify` passed.
- Runtime proof loaded the Script workbench on `episode-2-codex-overlap-review-v3`, seeded 6 demo transcript segments, selected the current word, and confirmed `currentTranscriptWord.word = search.`, `selectedTranscriptWord.word = search.`, `leftWorkbenchMode = transcript`, and `sharedPlayheadContract.passing = true`.
- Screenshot proof: `/tmp/quipsly-script-readalong-proof.png`.

## 2026-06-19 - Script Follow agent state packet

Added a compact `scriptFollow` payload to `/state`.

Changed:
- `/state.scriptFollow` now reports current segment, current word, selected segment, selected word, surrounding context lines, and relevant keyboard shortcuts in one object.
- This is derived from existing transcript metadata; it does not introduce a new storage model.
- The packet explicitly states that Script Follow is read-only awareness over the same shared playhead used by Program Output, Source Grove, and Episode Spine.

Why it matters:
- Humans get the read-along panel; agents get a clean semantic state packet.
- This keeps agent editing out of screen-scraping and supports future training examples shaped as state -> action -> proof.

Validation:
- `./script/build_and_run.sh --verify` passed.
- Post-launch state proof reported `scriptFollow.status = following`, `scriptFollow.segmentCount = 6`, `scriptFollow.current.word = This`, `scriptFollow.current.speaker = Charlie`, `sharedPlayheadContract.passing = true` on `episode-2-codex-overlap-review-v3`.

## 2026-06-19 - Program ambiguity operator guide

Built and proved a safer Episode 2 overlap-review operator surface inside Quipsly Studio.

What changed:
- Added visible `1 + Clip + Next` and `2 + Clip + Next` actions for overlap review so a source/reference clip can stay visible while the speaker lane is chosen.
- Added `/state.programAmbiguityOperator` so Codex, AG Quipsly, and future automation can see the same safe review workflow the human UI exposes.
- Added clip-preserving endpoints to `nextSafeActions` after runtime proof showed they were present in `choices` but not promoted to the top-level guide.
- Added `programAmbiguityOperator` to the agent capability parity payload under visual-decision-editing.

Runtime proof:
- Built and launched with `./script/build_and_run.sh --verify`.
- Verified `/state` starts with `programAmbiguityOperator.status = needs_map` after relaunch.
- Ran `/program_ambiguity_report?sample_limit=500` and `/program_ambiguity_review?mode=first`.
- Verified Episode 2 reached `ready_to_resolve` with 229 review points, 24 examples, 3 lane choices, and top-level safe actions for `first`, `first_clip`, `second`, `second_clip`, `third`, and `skip`.
- Captured visual proof at `/tmp/quipsly-program-ambiguity-operator-proof.png`.

Why it matters:
- This keeps the editor in the intended model: whole synced lanes stay intact, proxies remain the playback layer, and SHOW/SKIP/source choices are metadata over the spine.
- It gives Codex a direct operational guide instead of forcing it to infer choices from pixels or mutate the timeline blindly.

Next editing move:
- Use Episode 2 as the stress test for overlap ambiguity and source clip handling.
- Resolve several review points with the clip-preserving actions, then inspect whether Program Output and Source Grove stay aligned on the shared playhead.

## 2026-06-19 - Script Spine sidebar proof

Proved the text-awareness editing surface in the real Quipsly Studio app.

What changed:
- Normalized selected transcript word payloads so `selected.word` now includes `speaker` and `time`, matching the shape of `current.word` more closely.

Runtime proof:
- Built and launched with `./script/build_and_run.sh --verify`.
- Opened the Script workbench through the agent endpoint: `GET /left_workbench?mode=transcript`.
- Selected the transcript segment and word at the shared playhead with `GET /transcript_select?mode=at_playhead` and `GET /transcript_word?mode=current`.
- Verified `/state.scriptFollow` reports `currentWord = This`, `currentSpeaker = Charlie`, `selectedWord = This`, and `selectedSpeaker = Charlie`.
- Captured visual proof at `/tmp/quipsly-script-spine-sidebar-proof.png`.

Why it matters:
- Text awareness is now a real editing aid, not a detached note field. The Script workbench follows the same shared playhead as Program Output, Source Grove, and Episode Spine.
- This is the foundation for captions, transcript search, quote extraction, shorts hooks, accessibility review, and future edit-learning data.

## 2026-06-19 - Explainable overlap recommendation and first Episode 2 metadata edit

Dogfooding exposed a gap: Codex could see safe overlap choices, but not why one choice should be preferred. Added a read-only recommendation layer before doing any batch edits.

What changed:
- Added `programAmbiguityRecommendationPayload` to explain the recommended choice, confidence, features, safeguards, and endpoint.
- Exposed the recommendation in `/state.programAmbiguityOperator.recommendation`.
- Added a visible Codex suggestion card in the Program Hearth overlap review panel with confidence and an explicit `Apply + Next` button.
- Kept the action metadata-only: no source media is chopped, moved, exported, or published.

Runtime proof:
- Built and launched with `./script/build_and_run.sh --verify`.
- Mapped Episode 2 with `/program_ambiguity_report?sample_limit=500` and selected the first review point.
- Verified the first selected interval at 35.44s-36.84s recommended `first_clip` with 78% confidence because a source/title/reference clip was active and Charlie was the clearest named speaker/camera lane.
- Captured proof at `/tmp/quipsly-program-ambiguity-recommendation-proof.png`.
- Applied exactly one real metadata edit with `/program_ambiguity_resolve?choice=first_clip&advance=next`.
- Verified the review count dropped from 229 to 228, the app advanced to the next review point at 39.94s, and `sharedPlayheadContract.passing` remained true.
- Captured proof at `/tmp/quipsly-program-ambiguity-one-edit-proof.png`.

Lesson:
- Recommendation state should be explicit, inspectable, and conservative. `manual_review` is a valid productive output when the app lacks enough evidence.
- Future batch editing should be gated behind recommendation confidence, source availability, and a review receipt trail rather than raw endpoint repetition.

## 2026-06-19 - Guarded ambiguity batch operator

Added and proved the first bounded Codex editing batch operator for Episode 2.

What changed:
- Added `/program_ambiguity_batch?mode=preview|apply&max_count=<n>&min_confidence=<0-1>` to the AgentServer route table.
- Added `runProgramAmbiguityBatchOperator` in the native editor.
- Added `latestProgramDecisionAmbiguityBatchReceipt` and exposed it through `/state.programAmbiguityOperator.batchReceipt`.
- Added the route to the agent manual list so future operators can discover it.

Safety model:
- Preview mode maps current ambiguity examples and writes a receipt only. It does not mutate edit metadata.
- Apply mode remaps, selects the next review point, applies only recommendations whose confidence is at or above the threshold, and stops at `max_count` or the first low-confidence/manual-review point.
- All changes remain metadata-only SHOW/SKIP decisions over whole synced lanes. Source media and proxies are not chopped, moved, exported, or published.

Runtime proof:
- Built and launched with `./script/build_and_run.sh --verify`.
- Ran preview: `/program_ambiguity_batch?mode=preview&max_count=5&min_confidence=0.75`.
- Preview inspected 5 rows, found 4 eligible at 0.78 confidence, and marked the 5th as below threshold/manual review at 0.66 confidence.
- Applied a smaller bounded batch: `/program_ambiguity_batch?mode=apply&max_count=4&min_confidence=0.75`.
- Applied 4 high-confidence `first_clip` recommendations.
- Episode 2 ambiguity count dropped from 228 to 224.
- The operator stopped before the next weak 0.66 recommendation.
- `sharedPlayheadContract.passing` remained true.
- Captured proof at `/tmp/quipsly-program-ambiguity-batch-proof.png`.

Product lesson:
- Batch editing is acceptable only when the app can preview, explain, threshold, stop, and receipt it. This turns Codex from a pixel-clicking bot into an accountable editor assistant.

Next editing move:
- Review the weak 0.66 recommendation at the current playhead manually before allowing any lower-threshold batch behavior.
- Add an optional human/Codex note prompt around manual review points so corrections become useful training data instead of invisible hesitation.

## 2026-06-19 - Low-confidence manual review receipts

Added a durable review path for weak program-overlap recommendations.

What changed:
- Added `/program_ambiguity_manual_review?choice=<choice>&note=<why>&actor=<name>&actor_type=human|agent&apply=0|1`.
- Added `latestProgramDecisionAmbiguityManualReviewReceipt` and exposed it through `/state.programAmbiguityOperator.manualReviewReceipt`.
- Manual review captures selected overlap interval, choices, recommendation, chosen action, note, actor, before/after JSON, and whether a metadata edit was applied.
- Low-confidence UI suggestions now show `Receipt + Apply` instead of raw `Apply + Next`, so uncertain decisions leave inspectable training data.

Runtime proof:
- Built and launched through `./script/build_and_run.sh --verify`.
- Rebuilt Episode 2 overlap map and selected the first weak review point at 60.28s-63.96s.
- The recommendation was `first` / Charlie Camera at 66% confidence because the competing visual lane was unresolved imported media.
- Applied exactly one explicit Codex manual review with a note through `/program_ambiguity_manual_review&apply=1`.
- Review count dropped from 224 to 223, playhead advanced to 75.02s, and `sharedPlayheadContract.passing` remained true.

Why it matters:
- Manual review is now a productive state, not a failure. Low-confidence edits become durable examples for human review, agent improvement, future model training, and Mako/Charlie correction loops.
- The architecture remains whole-source-lane, proxy-first, and metadata-overlay only. No source media or proxies are chopped, moved, exported, or published.

Next editing move:
- Continue Episode 2 review with the same rule: high-confidence batches can run in small guarded groups; low-confidence points require receipts or human/Mako review.
- After Episode 2 exposes enough edge cases, return to Episode 1 for a second pass and apply the lessons as labeled second-pass changes.

## 2026-06-19 - Script Cursor read-along and agent parity

Improved the Script Spine so text awareness is useful to both human editors and Codex.

What changed:
- Added a highlighted read-along line inside the Script workbench above the word chips.
- The panel now shows the current speaker, current word timing, sentence context, and precise word chips together.
- Added `/state.scriptCursor` as a compact agent-facing cursor with speaker, current word, nearby word window, selected word, semantic commands, and truth text.
- Updated agent capability metadata so future agents discover `scriptCursor` instead of scraping the UI.

Runtime proof:
- Built and launched through `./script/build_and_run.sh --verify`.
- Opened the Script workbench with `/left_workbench?mode=transcript`.
- Selected the transcript segment and word at the shared playhead with `/transcript_select?mode=at_playhead` and `/transcript_word?mode=current`.
- Verified `/state.scriptCursor.status = word_ready`, speaker `Charlie`, word `This`, and `sharedPlayheadContract.passing = true`.
- Verified `/agent_capabilities` advertises `scriptCursor`, `script-aware-editing`, and `/transcript_word` commands.
- Captured visual proof at `/tmp/quipsly-script-cursor-ui-proof.png`.

Why it matters:
- This moves the editor toward transcript-aware editing without making the transcript a separate text editor yet.
- Humans can see who is speaking and what word is under the playhead; agents get the same concept as structured state.
- This is the bridge toward captions, pull quotes, shorts, transcript search, word-level cut suggestions, and edit-learning data.

Known follow-up:
- The highlighted line currently uses SwiftUI `Text + Text`, which builds but emits a macOS 26 deprecation warning. Replace it with a small tokenized view component during the next UI cleanup pass.
- Episode 2 still uses demo scaffold timing until real ASR/sidecar transcript timing is attached.

## 2026-06-19 - Transcript-to-short recipe action

Added a direct bridge from Script Spine awareness into the shorts workflow.

What changed:
- Added `Clip this moment` and `Make Short from Line` controls in the Script workbench.
- Added `/transcript_create_short?mode=current|selected|first|next|previous&padding_before=<seconds>&padding_after=<seconds>&title=<optional>`.
- Transcript-created shorts become normal `ShortClipCandidate` recipes with one sequence-time segment, caption draft, hook text, overlay text, review status, and notes.
- Added `/state.latestTranscriptToShortReceipt` so humans and agents can prove what transcript moment was turned into a short.
- Added a durable `script-to-short` edit action ledger entry when a transcript short is created.
- Updated agent capability metadata so `script-aware-editing` can discover and use the transcript-to-short path.

Safety model:
- This creates output recipes over sequence time. It does not cut source media, proxies, or whole synced lanes.
- Transcript text is copied into draft short metadata for review, not published automatically.
- The receipt records speaker, transcript range, recipe range, actor, and truth text.
- The edit action ledger persists the creation trail after relaunch.

Next proof:
- Build and launch QuipslyStudio, open the Script workbench, seed or import transcript timing, create a short from the current transcript line, and verify the short is selected in the Shorts workbench with `/state.latestTranscriptToShortReceipt.status = created`.

## 2026-06-19 - Agent control port discovery and transcript short wrapper

What changed:
- `script/agentctl.sh` now discovers the live Quipsly Studio AgentServer on local ports `8080`, `8765`, or `8766` unless `QUIPSLY_AGENT_URL` is explicitly set.
- Added `agent-url` so humans and agents can see the active semantic control surface before acting.
- Added `transcript-create-short` as a first-class CLI wrapper around `/transcript_create_short`, including mode, title, padding, actor, and actor type.

Proof:
- `bash -n script/agentctl.sh` passed.
- `script/agentctl.sh agent-url` discovered `http://127.0.0.1:8080`.
- `script/agentctl.sh health` returned `status: ok` on port `8080`.
- `script/agentctl.sh agent-capabilities` advertised `/transcript_create_short`, `scriptCursor`, and `script-aware-editing`.
- `script/agentctl.sh codex-act-save transcript-create-short current "Agentctl Port Discovery Proof Short" 0.5 1.5 Codex agent` created a new short recipe in `Episode 2 Premiere Rescue`.
- The proof state showed `shortClipQueueCount: 8`, selected short `Agentctl Port Discovery Proof Short`, `latestTranscriptToShortReceipt.status: created`, `latestEditActionLedgerEntry.actionId: transcript-create-short`, `latestEditActionLedgerEntry.category: script-to-short`, and `sharedPlayheadContract.passing: true`.

Lesson:
- Agent editing commands should discover the real app control surface and then use observe-act-review packets. A command response is not proof; the after-state and ledger entry are the proof.

Next dogfood target:
- Use the script-aware short creation flow while actually reviewing Episode 1 and Episode 2, then add real transcript attachment/import so highlighted words, speaker awareness, short recipes, and future auto-edit training all share one timeline spine.

## 2026-06-19 - Agent transcript word command wrapper proof

What changed:
- Added `script/agentctl.sh transcript-word current|next|previous|first|last [segment-id] [word-index]`.
- The wrapper calls the existing `/transcript_word` semantic endpoint instead of requiring agents to handcraft URLs.

Proof:
- `bash -n script/agentctl.sh` passed.
- `script/agentctl.sh codex-act-save transcript-word next` succeeded against the live app on `Episode 2 Premiere Rescue`.
- Review packet showed the selected word moved from `This` to `is`, `playhead` moved from `0` to `0.265`, source player expected times advanced, and `sharedPlayheadContract.playhead` advanced with the editor.
- `/state` reported `leftWorkbenchMode: transcript`, `selectedTranscriptWord.word: is`, `selectedTranscriptWord.speaker: Charlie`, `scriptCursor.status: word_ready`, and `sharedPlayheadContract.passing: true`.

Gospel:
- Word navigation is timeline navigation. The transcript is a synchronized lens on the episode spine, not a detached text editor.

WIP:
- Episode 2 is still using demo/estimated transcript timing in this proof. Real ASR or reviewed sidecar timing should replace demo timing before publication-grade caption or quote extraction.

## 2026-06-19 - Selected transcript word trust payload

What changed:
- `selectedTranscriptWord` now exposes `wordCount`, `wordStart`, `wordEnd`, `wordSource`, `timingModel`, and `truth` in `/state`.
- This brings intentionally selected words closer to the same trust contract as `currentTranscriptWord`.

Proof:
- `./script/build_and_run.sh --verify` passed and relaunched QuipslyStudio.
- `script/agentctl.sh transcript-word current` succeeded through the live AgentServer.
- `/state` reported `selectedTranscriptWord.word: This`, `selectedTranscriptWord.timingModel: demo_word_timing`, `selectedTranscriptWord.wordSource: demo-word-timing`, and `sharedPlayheadContract.passing: true`.

Why it matters:
- Selected words are now useful as edit evidence without pretending demo or estimated timing is publication-grade ASR truth.
- Future captions, short recipes, search hits, quote pulls, and agent edit suggestions can all inspect timing quality before acting.

## 2026-06-19 - Calmer Script read-along workbench

What changed:
- The Script workbench now treats the read-along text as the primary surface.
- The detailed clickable word cloud is folded into a `Word jump points` disclosure instead of duplicating the transcript loudly by default.
- The panel still supports word-level navigation, selected-word focus, and transcript-to-short creation without making the transcript a detached text editor.

Proof:
- `./script/build_and_run.sh --verify` passed and relaunched QuipslyStudio.
- Screenshot proof captured at `/tmp/quipsly-script-workbench-readalong.png`.
- `/state` on `Episode 2 Premiere Rescue` reported `leftWorkbenchMode: transcript`, `currentTranscriptWord.word: This`, `currentTranscriptWord.timingModel: demo_word_timing`, and `sharedPlayheadContract.passing: true`.
- After `script/agentctl.sh transcript-word current`, `/state` reported `selectedTranscriptWord.word: This`, `selectedTranscriptWord.timingModel: demo_word_timing`, and explicit selected-word truth text.

Gospel:
- The transcript surface is a synchronized lens over the one episode spine. It should reduce editing anxiety by showing who is speaking and where the word sits in time.

WIP:
- The visual language is improved but not final. Future passes should make the Script workbench feel more organic and reading-focused, then attach real ASR/sidecar transcript timing before publication-grade caption or quote work.

## 2026-06-19 - Agent edit-pass and correction-note wrappers

What changed:
- Added `script/agentctl.sh edit-pass "Label" Actor actor|human passNumber "Goal" status`.
- Added `script/agentctl.sh correction-note "Note" Actor actor|human category`.
- These wrap the existing `/edit_pass` and `/correction_note` semantic endpoints so agents do not need handwritten URLs for the learning loop.

Proof:
- `bash -n script/agentctl.sh` passed.
- `script/agentctl.sh codex-act-save edit-pass "Codex Episode 2 script-aware pass" Codex agent 2 "Use transcript-aware editing and source-grove proof to improve first cut and short candidates" active "Labeled overnight script-aware dogfood pass."` succeeded.
- `/state` reported `editPassContext.label: Codex Episode 2 script-aware pass`, `actor: Codex`, `actorType: agent`, `passNumber: 2`, `status: active`, and `latestEditActionLedgerEntry.actionId: edit-pass-context`.
- `script/agentctl.sh codex-act-save correction-note "Script-aware pass note: current transcript timing is demo scaffold; do not treat captions or quote pulls as publication-ready until real ASR/sidecar timing lands." Codex agent transcript-review` succeeded.
- `/state` reported `editCorrectionNoteCount: 2`, `latestEditCorrectionNote.category: transcript-review`, `latestEditCorrectionNote.actor: Codex`, and `sharedPlayheadContract.passing: true`.

Doctrine:
- Edit pass context labels the learning loop. It is not a quality gate and not bureaucracy.
- Correction notes are optional high-signal annotations. The action ledger should capture routine before/after deltas naturally so humans do not have to explain every small correction.

Episode loop reminder:
- Episode 1 remains the known-good proof lane.
- Episode 2 is currently the script-aware stress lane.
- Episode 3 should become the next transfer test once Episode 2 exposes enough rough edges.
- Return to Episode 1 for one deliberate second pass, applying lessons learned, but do not loop forever.

## 2026-06-19 - Transcript search becomes an edit-by-meaning control

What changed:
- Added a Script workbench search panel: `Find spoken moment`.
- Added `/transcript_search?query=<text>&mode=first|next|previous|current` to the AgentServer route map.
- Added `script/agentctl.sh transcript-search "phrase" first|next|previous|current`.
- Added `/state.latestTranscriptSearchReceipt` so human and agent proofs can inspect the last query, match count, selected speaker, selected segment, selected word index, and no-mutation truth.
- Updated `script-aware-editing` capability metadata and `/commands` so transcript search is discoverable by agents.

Proof:
- `bash -n script/agentctl.sh` passed.
- `./script/build_and_run.sh --verify` passed and relaunched QuipslyStudio.
- Initial proof found and fixed missing AgentServer route plumbing: `/transcript_search` returned 404 until the explicit route was added.
- `script/agentctl.sh transcript-search transcript first` returned `transcript_search_commanded`; `/state.latestTranscriptSearchReceipt.status` was `found`, with `matchCount: 4` and selected word `transcript`.
- `/commands` and `/agent_capabilities` now advertise `/transcript_search` and `latestTranscriptSearchReceipt`.
- Stricter proof: `script/agentctl.sh codex-act-save transcript-search captions first` moved the playhead from `0.795` to `2.915`, changed selected word from `transcript` to `captions,`, updated source player expected times, and kept `sharedPlayheadContract.passing: true`.
- Screenshot proof: `/tmp/quipsly-transcript-search-proof.png`.

Why it matters:
- This is the first small edit-by-meaning primitive. Humans and Codex can find a spoken phrase, jump the one shared playhead to it, and then create a short, caption, note, or edit decision from that context.
- The search is non-destructive: it does not mutate media, SHOW/SKIP decisions, exports, shorts, or publication state.

WIP:
- Current Episode 2 proof still uses demo transcript timing. This workflow becomes production-useful when real ASR/sidecar transcript timing lands for Episodes 1-3.

## 2026-06-19 - Text awareness becomes a visible editing lens

- Added a Script workbench Text Awareness lens in `apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift`.
- The lens shows the current speaker, the active spoken word, nearby context, timing-model status, and segment progress from the shared editor playhead.
- The transcript/read-along remains read-only metadata over the episode spine: it does not rewrite transcript text, cut source media, change SHOW/SKIP decisions, export media, or publish anything.
- Proved the real app path with `./script/build_and_run.sh --verify`, `script/agentctl.sh transcript-search captions current`, `/state`, and screenshot `/tmp/quipsly-text-awareness-proof.png`.
- Proof state: Episode 2 was open, Script mode was active, search found `captions`, selected word was `captions,`, current speaker was Charlie, current word was `become`, short queue remained 9, and the shared playhead contract was passing.
- WIP: current transcript timing is still demo/estimated in this proof lane. Production transcript import/generation needs word-level timing before publication-quality captions or edit-by-word accuracy.
- Second-pass loop note: after Episode 1 reaches a good first pass, repeat the editor+episode dogfood loop on Episodes 2 and 3, then return to Episode 1 with lessons learned. Record those as second-pass Codex edits rather than treating the first pass as sacred.

## 2026-06-19 - Transcript timing readiness is visible but non-blocking

- Added a timing readiness strip to the Script workbench in `apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift`.
- It distinguishes no transcript, line timing only, demo timing, mixed timing, and word-level timing in plain English.
- The strip is intentionally transparency-only: it does not gate editing, score the user, or create a quality bureaucracy.
- Proved the real app path with `./script/build_and_run.sh --verify`, `script/agentctl.sh transcript-search captions current`, `/state`, and screenshot `/tmp/quipsly-transcript-readiness-proof.png`.
- Proof state: Episode 2 was open, Script mode was active, 6 transcript lines were present, current timing model was `demo_word_timing`, selected word was `captions,`, current word was `become`, and the shared playhead contract was passing.
- Product rule: timing readiness is an honesty label. It should help humans and agents avoid false caption/edit precision claims without making creative work feel judged or blocked.

## 2026-06-19 - Transcript timing readiness exposed to agents

- Added `transcriptTimingReadiness` to `/state` as a top-level field and inside the nested `transcript.timingReadiness` payload.
- Added the readiness field to the script-aware editing capability surface and the agent training data contract.
- Proved with `./script/build_and_run.sh --verify` and `/state` that Episode 2 reports `demo_timing`, `publicationCaptionReady: false`, `agentCanObserve` includes `transcriptTimingReadiness`, and the shared playhead contract remains passing.
- This keeps Codex/agent editing honest: agents can use script timing while also knowing whether timing is demo, estimated, mixed, or publication-grade word-level data.

## 2026-06-19 - Search result can become a short from the visible workflow

- Added a `Clip found moment` button inside the Script workbench search result card.
- The button uses the selected transcript segment created by search and calls the existing transcript-to-short path with safe padding.
- Source media remains untouched; this creates a 9:16 short recipe over sequence time.
- Proved the build path with `./script/build_and_run.sh --verify` and state proof after `script/agentctl.sh transcript-search captions current`.
- Proof state: search status was `found`, selected word was `captions,`, transcript timing readiness was `demo_timing`, short queue remained stable until an explicit clip action, and the shared playhead contract was passing.
- WIP: screenshot `/tmp/quipsly-search-action-proof.png` shows the Script workbench after scrolling to Text Awareness, but not the search result card. The next UI proof should scroll the Script workbench to the search panel before screenshot if we need visual confirmation of this exact button.

## 2026-06-19 - YouTube word-timed transcripts plus honest speaker inference

What changed:
- Updated WebVTT parsing so YouTube-style inline word timestamps become `vtt-word-timing` word records instead of losing timing during VTT cleanup.
- Imported real YouTube auto-caption VTT sidecars for Episode 1 and Episode 3:
  - `artifacts/transcripts/youtube-captions/yt-dlp/episode-1.en.vtt`
  - `artifacts/transcripts/youtube-captions/yt-dlp/episode-3.en.vtt`
- Saved Episode 1 as `episode-1-codex-real-edit-v1-youtube-wordtimed`.
- Saved Episode 3 as `episode-3-premiere-rescue-youtube-wordtimed`.
- Added generic-speaker inference for the Script workbench and `/state`: if imported captions only say `Speaker`, Quipsly exposes `speakerDisplay`, `speakerSource`, `speakerDetail`, and `speakerLaneNames` from the active SHOW source at that sequence time.

Proof:
- `./script/build_and_run.sh --verify` passed and relaunched QuipslyStudio after the parser/speaker-inference changes.
- Episode 1 state reported `transcriptSegmentCount: 1278`, `wordLevelCount: 17354`, `estimatedCount: 559`, `demoCount: 0`, and `status: mixed_timing`.
- Episode 3 state reported `transcriptSegmentCount: 782`, `wordLevelCount: 10156`, `estimatedCount: 288`, `demoCount: 0`, and `status: mixed_timing`.
- `script/agentctl.sh transcript-search "different spot" first` found a word-timed Episode 1 segment, selected `different`, and `script/agentctl.sh transcript-create-short selected "Episode 1 Word-Timed Proof Short" 1 2 Codex agent` created a non-destructive 9:16 short recipe.
- After `script/agentctl.sh scrub 3` and `script/agentctl.sh transcript-word current`, `/state.currentTranscriptWord` reported `word: me`, `timingModel: word_level_timing`, `wordSource: vtt-word-timing`, `speakerDisplay: Charlie`, `speakerSource: program_source_inferred`, and `sharedPlayheadContract.passing: true`.

Gospel:
- Script/Text Awareness is a synchronized editing lens over the one episode spine. It is not a detached text editor.
- Transcript-created shorts are recipes over sequence time. They do not cut source media.
- Speaker inference is useful but must stay labeled as inference unless a transcript/ASR provider supplies real speaker data.

WIP:
- Episode 2 had no available YouTube English caption sidecar from `yt-dlp`; it still needs local ASR, manual transcript import, or another source transcript.
- Episode 1 and Episode 3 are still `mixed_timing`, not publication-caption-ready, because some caption spans remain estimated.
- The next proof loop should use Episode 1 as the known-good lane, then stress the transcript/edit loop on Episodes 2 and 3, then return to Episode 1 for a deliberate second Codex pass with lessons learned.

## 2026-06-19 - Repeatable Episode 1-3 script-spine readiness check

What changed:
- Added `apps/QuipslyStudio/script/prepare_episode_script_spines.py`.
- The script reports whether each proof episode has a source session, transcript sidecar, prepared script-aware session, and live `/state` validation.
- Default mode is report-only. `--apply` prepares missing sessions when a sidecar exists, `--apply --refresh` intentionally rebuilds prepared sessions, and `--fetch` attempts a caption sidecar fetch.
- Validation now selects the first transcript word before checking current-word state so success does not depend on the playhead accidentally starting inside a timed word.

Proof:
- `python3 -m py_compile script/prepare_episode_script_spines.py` passed.
- `python3 script/prepare_episode_script_spines.py --output /tmp/quipsly-script-spines-report.json` passed through the live AgentServer.
- Episode 1 loaded `episode-1-codex-real-edit-v1-youtube-wordtimed` and reported `currentWord: My`, `currentWordTimingModel: word_level_timing`, `currentSpeakerDisplay: Charlie`, `transcriptSegmentCount: 1278`, `wordLevelCount: 17354`, and `sharedPlayheadPassing: true`.
- Episode 2 reported `needs_transcript_sidecar_or_asr` with source session `episode-2-codex-overlap-review-v3` present and no VTT sidecar present.
- Episode 3 loaded `episode-3-premiere-rescue-youtube-wordtimed` and reported `currentWord: All`, `transcriptSegmentCount: 782`, `wordLevelCount: 10156`, and `sharedPlayheadPassing: true`.

Gospel:
- A prepared script spine is timed metadata over the one episode timeline.
- Prepared sessions must be proved through live `/state`, not assumed from file presence.
- Transcript timing readiness is transparency-only. It is not a creative quality gate.

WIP:
- Episode 2 needs local ASR or a reviewed sidecar before script-aware edit-by-word workflows can be trusted there.
- After Episode 1 has a good first Codex edit pass, use Episode 2 as the stress lane, Episode 3 as the transfer lane, then return to Episode 1 for one deliberate second Codex pass.

## 2026-06-19 - Local transcript provider bridge for Episode 2 ASR prep

What changed:
- Added `apps/QuipslyStudio/script/local_transcript_provider.py`.
- The provider command prints parseable transcript metadata to stdout for the existing `transcript_generate` AgentServer path.
- It supports reviewed sidecars beside media now, and can run Python `whisper` or `mlx_whisper` when those packages are installed in the active Python environment.
- `prepare_episode_script_spines.py` now includes a local transcriber doctor packet and reports whether missing transcript lanes can be generated locally yet.
- The Script workbench now has an optional local transcriber command path field plus a **Use repo provider** helper.
- `/state` now exposes `transcriptCommandPath`, `defaultLocalTranscriptProviderPath`, and `defaultLocalTranscriptProviderAvailable`.

Proof:
- `script/local_transcript_provider.py --doctor` reports provider readiness without touching media.
- `python3 -m py_compile script/local_transcript_provider.py script/prepare_episode_script_spines.py` passed.
- `script/local_transcript_provider.py` returned a neighboring `.srt` sidecar unchanged in a temp sidecar proof.
- `python3 script/prepare_episode_script_spines.py --output /tmp/quipsly-script-spines-report.json` passed and reported the local transcriber doctor inside the readiness packet.
- `./script/build_and_run.sh --verify` passed after the Script workbench UI/state changes.
- Final app state proof: Episode 1 was loaded in Script workbench mode, `/state.defaultLocalTranscriptProviderAvailable` was `true`, `/state.defaultLocalTranscriptProviderPath` pointed to `apps/QuipslyStudio/script/local_transcript_provider.py`, current word was `My`, timing model was `word_level_timing`, word source was `vtt-word-timing`, and shared playhead was passing.

Gospel:
- QuipslyStudio consumes timed transcript metadata. It should not be architecturally married to one ASR provider.
- Missing ASR must remain visible setup truth, not a fake transcript or silent fallback.
- Generated ASR is draft metadata. It can support search, read-along, and edit discovery, but publication captions and quotes still need review.

WIP:
- No local Whisper provider is currently installed in this Python environment. Episode 2 still needs provider setup or a reviewed sidecar before it can become a word-aware prepared session.

## 2026-06-19 - Episode 2 local ASR script spine landed

What changed:
- Added `apps/QuipslyStudio/script/setup_local_asr.sh` to make local ASR setup explicit and repeatable.
- Added `apps/QuipslyStudio/script/render_transcript_mixdown.py` to render a sequence-aligned audio spine from readable audio lanes without cutting media.
- Extended `apps/QuipslyStudio/script/local_transcript_provider.py` so the repo provider can use whisper.cpp (`whisper-cli`) with the Quipsly-managed default model at `~/Library/Application Support/QuipslyStudio/WhisperModels/ggml-base.en.bin`.
- Updated `apps/QuipslyStudio/script/prepare_episode_script_spines.py` so Episode 2 points at the local ASR SRT instead of a missing YouTube VTT sidecar.
- Split fast report mode from live prepared-session proof with `--validate-prepared` so dense session reports do not accidentally load every large episode.

Proof:
- `script/setup_local_asr.sh --install-brew --download-model` installed/proved `whisper-cli` and downloaded the default `ggml-base.en.bin` model.
- `script/local_transcript_provider.py --doctor` reported whisper.cpp CLI and model availability.
- A tiny local ASR proof generated SRT from a short `say`-generated audio file through the same provider.
- `script/render_transcript_mixdown.py --session episode-2-codex-overlap-review-v3` rendered `artifacts/transcripts/audio-mixdowns/episode-2-codex-overlap-review-v3-transcript-spine.wav` from two aligned audio lanes.
- `script/local_transcript_provider.py artifacts/transcripts/audio-mixdowns/episode-2-codex-overlap-review-v3-transcript-spine.wav` generated `artifacts/transcripts/local-asr/episode-2-codex-overlap-review-v3.whisper-cpp.srt`.
- Imported that SRT into the live app with `script/agentctl.sh transcript-import ... srt` and saved `episode-2-codex-overlap-review-v3-wordtimed`.
- Reloaded `episode-2-codex-overlap-review-v3-wordtimed` and `/state` reported `transcriptSegmentCount: 861`, `transcriptTimingReadiness.status: mixed_timing`, `wordCount: 8319`, `scriptCursor.status: word_ready`, `scriptFollow.status: following`, and `sharedPlayheadContract.passing: true`.
- Searched the prepared Episode 2 ASR transcript for `good morning`; `/state` reported `searchStatus: found`, playhead `0.84s`, selected/current word `good`, `scriptCursor.status: word_ready`, and `sharedPlayheadContract.passing: true`.

Gospel:
- The Script workbench is a synchronized text-awareness lens over the shared episode spine. It is not a detached text editor and it does not cut source media.
- Episode 2 ASR is useful for search, read-along, edit discovery, shorts candidates, and stress-testing the transcript/edit loop.
- Episode 2 ASR is still draft metadata. The SRT gives segment timing and Quipsly estimates word timing inside each segment; publication captions and quote pulls still need review or stronger word-level timing.

Next:
- Keep Episode 2 as the messy ASR stress lane.
- After Episode 2 and Episode 3 expose enough rough edges, return to Episode 1 for a deliberate second Codex pass and record those as second-pass changes.

## 2026-06-19 - Script speaker inference refuses unresolved filenames

What changed:
- Tightened Script/Text Awareness speaker inference in `apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift`.
- If a generic transcript speaker can only be tied to an unresolved media label like `temp_video_...mp4` or `video clip ...`, Quipsly now refuses to present that filename as the speaker.
- `/state` now exposes `speakerNeedsReview: true` alongside `speakerSource: unresolved_program_source` in transcript segment, current word, selected word, and script cursor payloads.

Why it matters:
- The editor should say "Unknown speaker, assign a lane role" instead of turning implementation debris into user-facing truth.
- This protects future edit-learning data. Speaker labels are training labels; bad labels are not harmless UI clutter.

Next:
- Add a low-friction lane role cleanup workflow for Episode 2 so unresolved sources can become Charlie, Homer, both-shot, or reference without mouse hunting.

## 2026-06-19 - Episode 2 working set: ignore blind lanes, keep Charlie/Homer moving

What changed:
- In the live app, restored `Homer Camera - video clip 235` from held/ignored back to production-visible.
- Held `Unresolved Camera V2 - temp_video_352730263597350912.MP4` for recovery instead of letting it hijack Script Now speaker inference or Play Edit truth.
- Saved the active session as `episode-2-codex-overlap-review-v3-wordtimed` after the working-set correction.

Proof:
- `/state` reported `Charlie Camera - CharlieVid1.MP4` and `Homer Camera - video clip 235` with `ignoreForProduction: false`.
- `/state` reported the blind unresolved lane with `ignoreForProduction: true`.
- `/state.transcript.segments` proved positive speaker inference still works: early Episode 2 transcript spans over `Charlie Camera - CharlieVid1.MP4` now report `speakerDisplay: Charlie`, `speakerSource: program_source_inferred`, and `speakerNeedsReview: false`.
- Gaps or held-blind-lane areas report `speakerDisplay: Unknown speaker` and `speakerNeedsReview: true` instead of inventing certainty.

Gospel:
- Do not burn editing time solving every inherited Premiere mystery. If Charlie/Homer/source clips are enough to edit, hold blind unresolved lanes as recovery context and continue.
- Unknown is a valid honest state. False speaker/source certainty is worse than missing metadata.

Next:
- Continue Episode 2 as the messy stress lane using Charlie, Homer, source clips, and ASR text awareness.
- If a blind lane later proves to contain real needed media, relink or unhold it deliberately; do not let it auto-own the program by accident.

## 2026-06-19 - Script lens now explains unknown speakers inline

What changed:
- The Script/Text Awareness lens now shows a small inline `Speaker needs review` explanation when the active transcript segment cannot be tied to a trusted Charlie/Homer/reference lane.
- The note includes the same detail that `/state` exposes for agents, so human and agent workflows see the same ambiguity instead of separate secret states.

Proof:
- `./script/build_and_run.sh --verify` passed after the SwiftUI change.

Gospel:
- Mystery should appear where the user is already looking, not as a detached warning panel.
- Agent accessibility and human accessibility should share the same semantic truth wherever possible.

## 2026-06-19 - Shorts now carry read-only transcript context

What changed:
- Short cards in the Shorts workbench now show a small `Transcript context` projection when the recipe overlaps timed transcript segments.
- `/state.shortClipQueue.clips[*].transcriptContext` now exposes the same derived context for agents: segment count, speaker summary, excerpt, status, and a truth note.
- This does not overwrite `hookText`, `captionDraft`, `primaryOverlayText`, review state, or publication copy.

Proof:
- `./script/build_and_run.sh --verify` passed after the Shorts UI/state projection change.
- Episode 2 `/state` reported 9 short candidates with transcript context available on the first five inspected candidates.
- Example: `Episode 2 Review Candidate 01 - 08:24` reported excerpt `- One job on this ship. - It's so good. - I, I often call it the best episode of Star Trek.`, speaker `Charlie`, and `truth: Read-only projection from timed transcript segments overlapping this short recipe...`.

Gospel:
- Short recipes stay canonical. Transcript context is a projection over sequence time, not a new detached text source.
- Review friction should drop without silently mutating publication copy.

Next:
- Use transcript context to review/refine Episode 2 short candidates faster.
- Later, add a deliberate `apply transcript excerpt to caption/hook` action that requires an explicit user or agent command.

### 2026-06-19 - Episode 2 working-set truth: stop chasing blind lanes
- Added `workingSetTruth` to the Quipsly Studio `/state` payload so agents and humans can distinguish primary camera readiness from generic usable source/reference media.
- Current Episode 2 proof reports one usable primary camera proxy (`Charlie Camera - CharlieVid1.MP4`), zero usable Homer camera proxies, four usable video proxies total, and one unresolved primary camera placeholder (`Homer Camera - video clip 235`).
- Product rule encoded: if Charlie + Homer are usable, unresolved placeholders are optional recovery and should not stall editing; if Homer is missing, continue transcript/short review but do not call the two-camera episode edit ready.
- Updated `script/export_short_review_decision_template.py` so generated short-review boards include transcript status, speaker hints, segment count, and excerpt context for each candidate.
- Validation: `python3 -m py_compile script/export_short_review_decision_template.py` passed; `./script/build_and_run.sh --verify` passed after Swift changes.

### 2026-06-19 - Episode 2 camera truth: duration-aware primary camera classification
- Tightened `workingSetTruth` so a tiny unresolved camera fragment no longer masquerades as a missing long primary host camera.
- Primary camera readiness now requires a plausible long synced camera lane, using a duration threshold derived from the episode duration.
- Current Episode 2 proof should be interpreted as: Charlie's long camera is ready; reference/source clips are ready; the unresolved `video clip 235` lane is a short placeholder/recovery note, not proof that a full Homer camera is attached.
- Added short-review guidance that transcript/short review can continue metadata-first even when the full two-camera episode edit is not ready.
- Validation: `./script/build_and_run.sh --verify` passed after the Swift change.

### 2026-06-19 - Working-set truth is now visible in the editor surface
- Added a compact `Working set` card beside the program/rough-cut status strip so humans can see the same truth agents read from `/state`.
- The card shows status, summary, next action, primary camera count, missing primary count, and parked short-placeholder camera count.
- Current Episode 2 UI semantics: one long primary camera is usable, zero plausible missing long primary camera lanes are detected, and one short placeholder camera lane is parked for later recovery.
- Validation: `./script/build_and_run.sh --verify` passed and `/state` exposes `workingSetTruth` plus `shortReviewCounts.reviewScopeGuidance`.

### 2026-06-19 - Working-set card moved into the live Program Hearth surface
- Visual inspection showed the first UI hook was in an older strip, while the active editor window uses the newer `Program Hearth` / `Source Grove` surface.
- Reused the same `workingSetStatusPanel` inside the visible Program Hearth side stack so there is still one semantic truth source and no duplicate readiness calculation.
- Validation: `./script/build_and_run.sh --verify` passed after moving the panel, and a screenshot was captured at `/tmp/quipslystudio-working-set-visible.png` for visual inspection.

## 2026-06-19 - Short review next-candidate loop

- Added a native `Next candidate` control to the Shorts review pipeline so humans can advance through queued social shorts without hunting through cards or preserving the whole camera-source mystery first.
- Added agent parity with `GET /shorts_review_next` and `script/agentctl.sh shorts-review-next [optional-status]`; the command selects the next reviewable short, opens the Shorts workbench, switches to the 9:16 review path, and scrubs the shared playhead to the candidate.
- Extended `shortReviewCounts` in `/state` with `nextReviewCandidate`, `nextReviewCommand`, and `nextReviewEndpoint` so agents can observe the next safe review action before acting.
- Validation: `./script/build_and_run.sh --verify` passed. Then `script/agentctl.sh shorts-review-next` selected `Episode 2 Review Candidate 01 - 08:24`, scrubbed to 504.4s, and exposed `Episode 2 Review Candidate 02 - 11:29` as the next candidate in `/state`.


## 2026-06-19 - Short review evidence, Mac workbench reliability, and mystery-lane discipline

- Added explicit short review evidence payloads for queued, selected, and next-review shorts: export path, file existence, contact sheet command, preview command, transcript context, source policy, and safe next action.
- Added a selected-short review evidence card in the Shorts workbench and moved selected-short editing above onboarding/batch controls so review decisions are visible before secondary controls.
- Dogfooded Episode 2 Candidate 01 by generating a contact sheet from the exported derivative only, then marked it `refine` with notes after visual review.
- Forced macOS to use the desktop editor layout and made the left workbench always visible in desktop mode for now; collapsing it can come back later only after it stops hiding primary editing controls.
- Reaffirmed the editor proof rule: if the usable Charlie/Homer camera sources are present, missing orphan lanes should be parked as evidence instead of becoming an open-ended mystery hunt.
- Validation: `./script/build_and_run.sh --verify` passed; `shorts-review-next` selected Candidate 02; `/state` reported Shorts open, Candidate 02 selected, and exported derivative evidence ready; screenshot proof saved at `/tmp/quipslystudio-workbench-evidence-20260619.png`.

## 2026-06-19 - Parked recovery lanes must not hijack Program Output

- Added Source Grove grouping so focused/usable lanes stay primary while missing placeholders, unresolved fragments, and recovery evidence are parked behind an explicit `parked sources` section.
- Updated Source Grove status language: moss = proxy-safe, honey = Program can show, lichen = preserved recovery evidence. This keeps recovery visible without making it the editor's main anxiety loop.
- Updated Program Output lane eligibility so parked recovery lanes do not drive Program truth. Old imported SHOW decisions on missing placeholder lanes now resolve as a Play Edit gap instead of a false blocker.
- Updated the agent state payload so `leftWorkbenchOpen` reports the effective visible Mac truth, not only the internal toggle. The screenshot and `/state` now agree.
- Current Episode 2 truth: Charlie is proxy-ready; the Homer item currently present is a missing short placeholder, not a long host camera. Episode 2 can continue transcript/short review, but should not be called two-camera edit-ready until the real Homer source is attached/proxied.
- Validation: `./script/build_and_run.sh --verify` passed after the Source Grove and Program Output patches. `/state` reports `leftWorkbenchOpen: true`, `workingSetTruth.status: single-camera-working-set`, `charlieReadyCount: 1`, `homerReadyCount: 0`, `mysteryLaneCount: 1`. Visual proof saved at `/tmp/quipslystudio-parked-sources-final-20260619.png`.

## 2026-06-19 - Edit target recommendation for Codex and human routing

- Added `editTargetRecommendation` to the agent `/state` payload so the editor does not merely report working-set truth; it also tells humans and Codex what this session is currently good for.
- Added `script/agentctl.sh edit-target` / `next-edit-target` as a read-only CLI surface for the same recommendation. It does not mutate media, sessions, edit decisions, or publication state.
- Current Episode 2 recommendation: use the session for transcript/short review, or switch to `episode-1-premiere-rescue` for true two-camera editing until the real long Homer camera source is attached/proxied.
- Validation: `./script/build_and_run.sh --verify` passed. `script/agentctl.sh edit-target` returned `recommendedPath: review-shorts-here-or-switch-for-two-camera`, `workingSetStatus: single-camera-working-set`, `charlieReadyCount: 1`, `homerReadyCount: 0`, and safe commands for shorts review or loading Episode 1.

## 2026-06-19 - Short overlay face-safety pass

- Fixed short contact-sheet generation so `script/shorts_contact_sheet.sh` resolves `FFMPEG_PATH`, `FFPROBE_PATH`, `/opt/homebrew/bin`, and `/usr/local/bin` before failing.
- Moved vertical 9:16 burned-in hook overlays onto a center seam rail instead of the face-heavy top third.
- Moved vertical burned-in caption overlays to a lower safe rail for intentional captions.
- Added `burnedInCaptionText(for:)` so rough/draft transcript strings are not burned into exported videos. Draft transcript text remains review metadata/sidecar material until a human or agent produces approved caption copy.
- Proved the change by rebuilding `QuipslyStudio`, re-exporting Episode 1 short `Learning Why, Not Just What`, and generating `/tmp/quipsly-episode1-review-short-03-contact-sheet-no-rough-caption.png` from the exported derivative.
- Product lesson: captions and hooks need placement contracts. If text is not approved publication copy, it should not be baked onto faces just because an export path has a text parameter.

## 2026-06-19 - Short text burn policy made explicit

- Added a `textBurnPolicy` payload to selected short review evidence so humans and agents can see whether hook/overlay text and caption drafts will be burned into the exported derivative.
- Updated short export success notes to report the actual burn-in behavior, not the raw draft fields. Rough transcript captions now log as preserved metadata instead of claiming `Text burn-in: caption`.
- Rebuilt and relaunched `QuipslyStudio` through `./script/build_and_run.sh --verify`.
- Re-exported Episode 1 short `Learning Why, Not Just What` after the policy patch.
- Generated `/tmp/quipsly-episode1-review-short-03-contact-sheet-policy-proof.png` from the latest derivative and confirmed visually that only the intentional hook remains; rough transcript text is no longer burned over faces.
- Current rule: rough/draft transcript text can inform review, caption sidecars, and copy drafting, but it cannot silently become public pixels.

## 2026-06-19 - Short readiness ladder separates export from publishability

- Added `publicationReadiness` to short review evidence so exported social clips do not look publication-ready just because an MP4 exists.
- The readiness ladder now separates: derivative export, visual/contact-sheet review, listen-through/audio sanity, caption/on-video text review, hook/platform copy, and post-publication receipt capture.
- The ladder is transparent, not a hard quality gate or score: its `truth` field explicitly says it separates artifact existence from publication readiness so humans stay in control.
- Verified on Episode 1 short `Learning Why, Not Just What` through the running app state after `./script/build_and_run.sh --verify`.
- Marked that short `refine` after contact-sheet review because rough transcript text is no longer burned into pixels, but the clip still needs listen-through and caption/copy rewrite before it can be kept or queued.

## 2026-06-19 - Short text overlays now require explicit burn-in approval

- Changed selected, batch, and proof short exports so `primaryOverlayText` no longer burns into pixels by default.
- Added a selected-short Text burn-in safety panel: overlay/caption text is shown as metadata unless an explicit `burn-in-ok` style note approves safe-zone burn-in.
- Updated text burn policy and readiness payloads so humans and agents see `burnedInPrimaryOverlayText`, `primaryOverlayDirective`, and `needs_text_review` instead of confusing raw text fields with exported pixels.
- Proved with `./script/build_and_run.sh --verify`, loaded `episode-1-premiere-rescue`, selected `Learning Why, Not Just What`, and confirmed `/state` reports overlay text present but `burnedInPrimaryOverlayText` empty until approved.

- Follow-up pixel proof: exported `/tmp/quipsly-burn-safety-proof/burn-safety-proof-9x16-short.mp4` after the approval-rule change and generated `/tmp/quipsly-burn-safety-proof/contact-sheet.png`; visual inspection showed no hook/caption text burned over Charlie or Homer.

## 2026-06-19 - Agent command for short text burn-in safety

- Added `script/agentctl.sh shorts-overlay-burn-in approve|hold [note]` so Codex can use the same selected-short burn-in safety workflow as a human editor.
- The command reads live `/state`, refuses to run without a selected short, appends an audit line to `publishNotes`, and lets the app policy compute whether `primaryOverlayText` is metadata-only or approved for export pixels.
- Proved `approve` changes `textBurnPolicy.primaryOverlayDirective` to `approved` and populates `burnedInPrimaryOverlayText`; then proved `hold` returns the selected short to `primaryOverlayDirective: held` with `burnedInPrimaryOverlayText: ""`.
- Product lesson: agent controls must target semantic product fields (`publishNotes`) rather than lookalike UI fields (`notes`), or the system becomes haunted by naming drift.

## 2026-06-19 - Short text burn-in safety promoted to the agent control plane

- Added a first-class `GET /shorts_overlay_burn_in?decision=approve|hold&note=<optional-review-note>` AgentServer route that queues the same selected-short text burn-in decision used by the UI.
- Refactored the selected-short UI buttons and `script/agentctl.sh shorts-overlay-burn-in approve|hold` to use the semantic burn-in decision path instead of duplicating `publishNotes` replacement logic.
- Exposed `selectedShortProof.textBurnPolicy` and `selectedShortProof.publicationReadiness` in `/state`, plus action-catalog, safe-action, and capability-parity entries for `short-text-burn-in-safety`.
- Validation: `./script/build_and_run.sh --verify` passed; Episode 1 short `Learning Why, Not Just What` was selected; approve was tested, then hold was applied again. Final `/state` reports `primaryOverlayDirective: held`, `primaryOverlayBurnedIn: false`, `burnedInPrimaryOverlayText: ""`, and rough transcript captions suppressed from burn-in.
- Product lesson: safety-critical publication controls should be semantic actions with observable proof fields, not hidden conventions inside freeform notes.

## 2026-06-19 - Selected short listen-through and text review became semantic proof actions

- Added selected-short review actions for `GET /shorts_listen_through?note=<optional-review-note>` and `GET /shorts_text_review?decision=approve|rewrite&note=<optional-review-note>` so audio sanity and caption/platform-copy review are explicit product actions instead of magic note phrases.
- Added matching human controls in the selected short Review Evidence card: `Listened`, `Text reviewed`, and `Needs rewrite`.
- Added CLI parity with `script/agentctl.sh shorts-listen-through [note]` and `script/agentctl.sh shorts-text-review approve|rewrite [note]`.
- Updated `selectedShortProof.publicationReadiness` so exported shorts can distinguish artifact existence, visual review, listen-through proof, text/copy review proof, and receipt capture without pretending any of those are moral scores or automatic publication approval.
- Validation: `./script/build_and_run.sh --verify` passed. On Episode 1 short `Learning Why, Not Just What`, Codex applied listen-through proof and text-review proof, then held burn-in as metadata-only. Final `/state` reports `requiredIncompleteCount: 0`, `requiredIncompleteStepIds: []`, `primaryOverlayDirective: held`, `burnedInPrimaryOverlayText: ""`, and `reviewStatus: refine`, so the short has evidence but still honestly needs refinement before publication.
- Product lesson: readiness ladders should expose missing evidence and safe next actions, not collapse complex review into one green/red judgment.

## 2026-06-19 - Text burn-in moved out of face territory

- Changed approved vertical short overlay placement in `ExportEngine` away from the center face band and into a lower safe rail.
- Confirmed selected short state now keeps hook and rough transcript text as metadata by default: `burnedInPrimaryOverlayText` and `burnedInCaptionText` are empty unless explicit burn-in approval exists.
- Updated the agent/human proof language so future review passes understand that rough transcript text is not automatically on-video text.
- Product lesson: Quipsly text is data first. Burn-in is a deliberate publishing decision, not a default side effect of having good notes.

## 2026-06-19 - Short review navigator became the batch proof surface

- Added `shortReviewCounts.reviewNavigator` to the live `/state` payload so humans and Codex can see the next short-review action, reason, command, and queue counts without manually parsing every short card.
- Navigator is intentionally transparent routing, not a creative quality score or publication approval gate.
- Added agent action catalog/current-safe-action entries pointing to the navigator.
- Tightened caption burn-in policy after the navigator exposed a legacy candidate that would have burned approved-looking caption copy automatically. Caption copy now stays metadata/sidecar/platform text unless an explicit `caption-burn-in-ok` style note exists.
- Product lesson: the best workflow safety here is not red/yellow/green judgment. It is a plain next-step lens that preserves agency and makes evidence gaps visible.

## 2026-06-19 - Short review navigator evidence loop

- Fixed the shorts review navigator so it separates the top editorial next step from the next safe mechanical evidence-prep step.
- Added `/shorts_visual_review` as an app-owned proof-recording action: generated contact sheets are recorded in the selected short's publish notes as visual evidence, without marking keep/refine/reject or approving publication.
- Updated `script/agentctl.sh shorts-contact-sheet` to generate the contact sheet, then best-effort record the proof path back into the running app state.
- Proved the Episode 1 visual review queue moved from `needsVisualReview=10` to `needsVisualReview=0`; the remaining queue is intentionally judgment work: `needsRefinement=2` and `needsListenThrough=10`.
- Confirmed text/caption burn-in remains metadata-only by default. Caption drafts and primary overlays do not burn into video pixels without explicit burn-in approval.

Lesson: generated files are not completed workflow state. If an agent creates a useful artifact, Quipsly must record the artifact path and what it proves, while keeping proof separate from approval.

## 2026-06-19 - Short listen-through audition lane

- Added `nextAuditionCandidate` to the short review navigator so listen-through work is visible separately from refinement and safe mechanical prep.
- Added `script/agentctl.sh shorts-review-cue-next`, which selects and previews the next short needing listen-through review without marking it complete.
- Proved the cue path in the running app: `Episode 1 Review Candidate 01 - 04:27` cued from sequence time `267.06s`; `needsListenThrough` stayed at `10`, so previewing did not spoof review proof.
- Current Episode 1 shorts queue after this pass: `needsExport=0`, `needsVisualReview=0`, `needsListenThrough=10`, `needsRefinement=2`.

Lesson: audition/cue commands should make review easier but must not mutate approval state. This keeps Codex helpful without turning evidence prep into fake editorial judgment.

## 2026-06-19 - Listen-through review guide

- Added a `listenThroughGuide` payload to the short review navigator so the next audition candidate has a calm checklist and exact commands.
- Added `script/agentctl.sh shorts-review-listen-guide` for operator/agent review without digging through raw JSON.
- Proved the guide against Episode 1: it points at `Episode 1 Review Candidate 01 - 04:27`, shows the exported derivative path, review checklist, preview command, mark-listened command, and keep/refine/reject decision commands.
- Counts remain honest after guide generation: `needsExport=0`, `needsVisualReview=0`, `needsListenThrough=10`, `needsRefinement=2`.

Lesson: review tooling should make judgment easier without performing the judgment. The app now separates preview/cue, listen-through proof, and final keep/refine/reject decisions.

## 2026-06-19 - Episode 1 shorts listen-review packet

- Added `script/generate_short_listen_review_packet.py` to turn the running app's shorts queue into a local HTML + JSON listen-through review packet.
- Added `script/agentctl.sh shorts-listen-review-packet /absolute/output/folder [basename]`.
- Generated `/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episode-1-listen-review/episode-1-shorts-listen-review.html` and matching JSON manifest.
- Packet proof: 12 total shorts, 10 actionable listen-through candidates, 2 refinement candidates, 11 clips needing copy/text review. The first candidate has both a derivative video URI and contact sheet URI.
- Corrected review hierarchy so `refine` status wins over `listen-through` missing steps. This matches editor behavior: do not ask someone to listen-through a short as if it is normal queue work when it is already known to need refinement.

Lesson: shaped review packets reduce systems anxiety. Counts must reflect operator action, not raw missing-step totals, or the UI starts lying in subtle ways.

## 2026-06-19 - Face-safe text burn-in correction

- Tightened selected-short text burn-in policy so generic `burn-in-ok` / `safe-zone approved` notes no longer burn text into exported pixels.
- New explicit approval phrase is `face-safe-burn-in-ok` for primary overlays and `caption-face-safe-burn-in-ok` for caption burn-in.
- Moved approved vertical hook overlays to the top canopy rail instead of the center/lower face band.
- Moved the in-editor Program Output crop-mode badge to the lower edge so the working UI is less likely to cover faces while framing.
- Updated human and agent-facing language to say face-safe review, not generic safe-zone review.
- WIP note: this patch still needs a real app relaunch/export proof before calling it production-proven.

### Proof update

- Rebuilt and relaunched Quipsly Studio through `./script/build_and_run.sh --verify` after the face-safe text patch.
- Selected `Test Short - Wednesday Rule moment` and confirmed the running `/state` payload reports:
  - `primaryOverlayBurnedIn: false`
  - `captionBurnedIn: false`
  - overlay burn-in requires `face-safe-burn-in-ok`
  - caption burn-in requires `caption-face-safe-burn-in-ok`
  - approved hook overlays use the top canopy rail and caption drafts stay metadata-only unless explicitly face-safe approved.
- Deterministic listen-review packet pointer reports `status: generated` at `/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episode-1-premiere-rescue-listen-review/episode-1-premiere-rescue-shorts-listen-review.html`.
- Remaining warnings are compiler/deprecation warnings, not launch blockers.
- Regenerated the Episode 1 listen-review packet after adding face-safe policy text to the packet generator.
- Verified the packet JSON and HTML now include the face-safe rule and explicit `face-safe-burn-in-ok` / `caption-face-safe-burn-in-ok` gates for every short card.
- Packet counts after regeneration: 12 shorts, 10 primary listen-through candidates, 11 listen-through including refinement, 2 refinement candidates, 11 needing text review.

## 2026-06-19 - Agent listen-through review JSON mode

- Added non-mutating JSON modes for `script/agentctl.sh shorts-review-listen-guide --json` and `script/agentctl.sh shorts-review-cue-next --json`.
- Verified `bash -n script/agentctl.sh` passes.
- Verified JSON mode returns the next listen-through candidate, safe preview command, review counts, and explicit truth that JSON mode does not cue playback, mark listen-through, approve text, or publish.
- Human text mode remains unchanged for operator-friendly review guidance.

### 2026-06-19 - Text burn-in face-safety hardening

- Tightened short text burn-in policy so generic `approve`/`face-safe-burn-in-ok` notes no longer authorize exported text over video.
- Primary short overlay burn-in now requires explicit positioned approval: `face-safe-top-canopy-burn-in-ok` / `approve_top_canopy`.
- Caption burn-in now requires explicit positioned approval: `caption-face-safe-lower-rail-burn-in-ok`; caption drafts remain metadata/sidecar/platform copy by default.
- Updated the Shorts UI and agent action language so `approve` means request review, not pixel burn-in.
- Moved Program Output crop/framing status chrome out of the video image so editor UI text does not sit on faces while framing.
- Updated `script/agentctl.sh` so old `approve` aliases map to `request_review`; top-canopy approval must be explicit and include a face-safe placement note.


### 2026-06-19 - Face-text policy proof in running app

- Built and relaunched the real QuipslyStudio app through `./script/build_and_run.sh --verify`; build succeeded with warning-only output.
- Regenerated the Episode 1 listen-review packet at `/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episode-1-premiere-rescue-listen-review/episode-1-premiere-rescue-shorts-listen-review.html`.
- Verified the packet HTML and JSON now say generic face-safe approvals are not enough; burned-in text needs a named rail.
- Added `textBurnPolicy` as a JSON alias for the existing `textBurnSummary` in listen-review packets so agents and live `/state` use the same concept name.
- Tested legacy CLI command `shorts-overlay-burn-in approve`; it now records review-needed metadata and leaves `primaryOverlayBurnedIn=false`, `burnedInPrimaryOverlayText=""`, `captionBurnedIn=false`.
- Tested `shorts-overlay-burn-in approve_top_canopy` with no note; CLI blocks with exit 2 and requires a face-safe placement note.
- Current selected short proof: overlay/caption remain metadata-only until explicit positioned approval.


### 2026-06-19 - Listen-review packet agent ergonomics and stale export warning

- Improved `generate_short_listen_review_packet.py` response shape with `jsonPath`, `manifestPath`, `clipCount`, and full `counts` so agents can consume the packet without guessing field names.
- Added `textBurnPolicy` as an alias for `textBurnSummary` in packet JSON to match live `/state` naming.
- Added `textExportFreshness` per short. Existing derivative files with text copy but current metadata-only policy are flagged as `verify_no_burned_text_or_reexport`.
- Regenerated the Episode 1 listen-review packet and verified 9 existing derivatives are flagged for text-burn freshness review/re-export.
- Updated `agentctl.sh` usage to show `request_review|approve_top_canopy|hold` instead of the old vague `approve|hold` wording.


### 2026-06-19 - First metadata-only short refresh loop

- Selected flagged Episode 1 short `Test Short - Wednesday Rule moment` (`FC28A75E-451B-4D74-9636-2E842805F106`) as the first full refresh proof loop.
- Re-exported it under current metadata-only text policy to `/tmp/quipslystudio-episodes-1-3-review-shorts/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-01-Test-Short-Wednesday-Rule-moment-9x16-short.mp4`.
- Verified audio sanity passed after export: duration ~8.13s, one audio stream, no issues/warnings.
- Generated and inspected contact sheet at `/tmp/quipslystudio-episodes-1-3-review-shorts/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-01-Test-Short-Wednesday-Rule-moment-9x16-contact-sheet.png`; no burned-in overlay/caption text visible on the face frames.
- Added export note proof marker `metadata-only-export-v1` and taught the listen-review packet to classify those exports as `fresh_metadata_only_export`.
- Marked the short as `refine`, not publishable: it needs real platform caption/copy and human listen-through. Audio sanity is preflight only.
- Current packet truth should show one fresh metadata-only export and remaining stale text-export warnings for older derivatives.


### 2026-06-19 - Real candidate refresh exposed listen-through false-positive bug

- Refreshed real Episode 1 short `Mutual Mentorship` (`B5387438-09BF-41BD-9BDA-4765C75C36E2`) under the current metadata-only text policy.
- Exported derivative: `/tmp/quipslystudio-episodes-1-3-review-shorts/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-04-Mutual-Mentorship-9x16-short.mp4`.
- Audio sanity returned `needs_human_attention` with warning `possible-clipping-risk`, but `safeForListenThrough=true`.
- Contact sheet visual inspection showed no burned-in text on faces. Composition is usable stacked 9:16, but Charlie's feed remains dark.
- Marked the candidate `refine`, not `keep`, because it needs real human listen-through and rewritten platform copy.
- Dogfooding exposed a readiness bug: a note saying "needs human listen-through" was being counted as listen-through proof because readiness used broad substring matching. Tightened `hasListenProof` to positive line prefixes such as `listen-through:` and `audio-review-ok:`.
- Rebuilt/relaunched and verified `Mutual Mentorship` now correctly lists both `listen-through` and `caption-copy` as incomplete.


## 2026-06-19 - Disabled MVP pixel text burn-in for face safety

- Hardened `ExportEngine.export` with an `allowPixelTextOverlays` default of `false`, so lower-level video export ignores overlay/caption strings unless a future caller explicitly opts into a real face-safe placement system.
- Updated selected-short burn policy in `WorkspaceView` so hooks, captions, and overlay ideas stay as editable metadata, SRT/platform copy, and review notes. Current MVP exports report `pixelTextBurnInEnabled: false`.
- Verified with `./script/build_and_run.sh --verify` and live AgentServer state after selecting `Test Short - Wednesday Rule moment`: overlay/caption metadata remained attached, while `primaryOverlayBurnedIn` and `captionBurnedIn` were both `false`.
- Product lesson: text/copy is useful editorial metadata, but unreviewed pixel burn-in is a face-safety hazard. Keep video frames clean until Quipsly has inspectable safe-region placement.

## 2026-06-19 - Agent short-review loop made less spooky

- Added top-level short export proof fields to `/state`: `lastExportedPath`, `lastExportExists`, expected export target fields, and ready-to-copy export/contact-sheet commands for each short recipe and selected short.
- Improved `script/agentctl.sh shorts-contact-sheet` so it returns stable aliases (`outputPath`, `imagePath`, `sourcePath`) plus `visualProofRecorded`, instead of forcing agents to scrape nested or partial output.
- Dogfooded the loop on the real Episode 1 candidate `Farm Work Teaches Stewardship`:
  - Re-exported a clean-frame 9:16 derivative under the current no-pixel-text MVP policy.
  - Generated a contact sheet and recorded visual proof back into app state.
  - Inspected the contact sheet: no burned-in text on faces; stacked 9:16 layout visible; Charlie remains dark and should be reviewed as an editorial/framing/color issue.
  - Ran audio sanity: passed objective preflight with one AAC stereo stream and no issue warnings.
  - Kept the short at `refine`, not `keep`, because it still needs human listen-through, platform copy review, and framing/light judgment.
- Refreshed the Episode 1 listen-review packet. Stale text-export count is now 6; fresh metadata-only count is now 3.
- Product lesson: proof fields should be first-class, not hidden in prose. If agents struggle to prove what happened, humans will feel the same systems anxiety later.

## 2026-06-19 - Face-safe text policy tightened

- Renamed the Program Output crop HUD to a face-safe status rail and kept crop/framing labels outside the video frame by default.
- Made selected-short export explicitly pass `allowPixelTextOverlays: false` so hooks/captions/overlay copy remain metadata, sidecars, and platform copy during MVP exports.
- Updated local-control docs so future agents do not resurrect first-pass burned-in text over faces.
- Product lesson: labels that help engineering should live in rails, inspectors, hover/debug modes, or sidecars; faces are primary content and must stay visually clear during edit review.

## 2026-06-19 - Record From Anywhere clean-frame refresh

- Built and relaunched QuipslyStudio through `./script/build_and_run.sh --verify`; the face-safe rail and explicit clean-frame export patch compiled and launched with warning-only output.
- Selected real Episode 1 short `Record From Anywhere` and verified live `/state` reports `pixel_text_disabled`, `pixelTextBurnInEnabled=false`, `primaryOverlayBurnedIn=false`, and `captionBurnedIn=false`.
- Re-exported the selected short as a fresh clean-frame derivative: `/tmp/quipslystudio-episodes-1-3-review-shorts/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-05-Record-From-Anywhere-cleanframe-9x16-short.mp4`.
- Generated and inspected the contact sheet: `/tmp/quipslystudio-episodes-1-3-review-shorts/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-05-Record-From-Anywhere-cleanframe-contact-sheet.png`. No text is visible on faces; stacked 9:16 framing is usable, while Charlie darkness remains an editorial/color/framing review issue.
- Ran audio sanity: exact 45.0s duration, one AAC stereo audio stream, no silence issues, `safeForListenThrough=true`, with warning `possible-clipping-risk`.
- Marked the short `refine`, not `keep`, because it still needs human listen-through and audio review before publication.
- Refreshed the Episode 1 listen-review packet. Stale text-export count dropped to 5 and fresh metadata-only count rose to 4.
- Patched `script/agentctl.sh wait-export` to emit a compact `quipsly-agent-export-receipt` instead of dumping the entire app state. This keeps agent proof loops fast and readable.

## 2026-06-19 - Nest / Studio / Tower product map captured

- Added `docs/quipsly/nest-studio-tower-product-map.md` to preserve the lifecycle metaphor without turning it into three disconnected truth systems.
- Product doctrine: Nest, Studio, and Tower are workflow lenses over shared Quipsly objects: captures, source assets, annotations, productions, outputs, publications, receipts, and analytics.
- Build strategy stays grounded in the High Ground Odyssey proof chain: Nest captures and organizes source truth, Studio edits Episodes 1-3 and produces shorts/podcast outputs, Tower prepares publication packets and receipt tracking.
- Product lesson: a good metaphor lowers user anxiety; a bad implementation of the metaphor creates duplicate databases and app sprawl. Use language for navigation, not schema.

## 2026-06-19 - Export review receipt hardening

- Rebuilt and relaunched QuipslyStudio through `apps/QuipslyStudio/script/build_and_run.sh --verify` after hardening the selected-short export/review loop.
- Fixed `script/agentctl.sh wait-export` so transient `stalled` health warnings do not falsely fail an export when the app later completes and the derivative exists. `wait-export` now emits compact receipt version `2026-06-19.compact-wait-export.v2`.
- Fixed `script/analyze_short_audio_sanity.py` to resolve `ffmpeg`/`ffprobe` from PATH, `FFMPEG_PATH`/`FFPROBE_PATH`, `/opt/homebrew/bin`, or `/usr/local/bin`.
- Changed agent `publishNotes` updates in `WorkspaceView.swift` to append by default so review notes do not erase export receipt lines. Explicit replacement remains available through `replacePublishNotes` / `replace_publish_notes`.
- Refreshed `Write Things Worth Reading` as a clean-frame Episode 1 short derivative. Contact sheet is face-safe; audio sanity shows exact 45.0s duration with audio/video present but flags long silence and possible clipping, so it remains `refine` pending listen-through.

Lesson: human notes and machine provenance should not share one fragile free-text field forever. Short-term append-by-default protects receipts. Longer-term, `ShortClipCandidate` needs first-class export receipt fields.

## 2026-06-19 - Nest context/write slice enters QuipslyStudio

- Added `NestDocument` and `NestBlock` to the native QuipslyStudio project model so the Studio can carry writing/context truth beside edit and publication state.
- Added a left-side Nest workbench for seeded episode context and working writing blocks.
- Seeded High Ground Odyssey Episodes 1-3 from local transcript/import artifacts first, with published YouTube/HighGroundOdyssey references preserved as fallback context. Seeded text is explicitly `needs-human-review`, not canonical manuscript truth.
- Added semantic agent routes and CLI commands: `nest-seed-context`, `nest-append-block`, and `left-workbench nest`.
- Added `nest` to `/state` plus `nest-writing-capture` to `agentCapabilityParity`, so agents can observe, act, and prove Nest writing/capture workflows without screen-coordinate guessing.
- Dogfooded the live app: seeding and adding a Codex working note produced 2 Nest documents, 8 blocks, seeded context available, and writing document available in `/state`.

Lesson: the Nest cannot be a separate future app that waits politely for Studio to finish. The creative loop needs writing/context, editing, and publication truth in the same observable session, even while each surface grows its own UI.

## 2026-06-19 - Episode Spine bridge plus Homer book-source seed

- Added an Episode Spine bridge in QuipslyStudio that exposes Nest context, Studio edit readiness, and Tower publication handoff as one inspectable production-loop state.
- Added `/episode_spine` to the local AgentServer and `script/agentctl.sh episode-spine` so humans and agents can ask one question instead of stitching together Nest, Studio, and Tower manually.
- Added the Episode Spine panel to the Publish workbench sidebar and registered the action/capability in the agent catalog.
- Extended High Ground Odyssey Nest seeding to include the local Homer chapter source folder at `apps/web/content/_inbox/HighGroundOdysseyBook` as review-labeled source excerpts, not canon manuscript text.
- Validation: `./script/build_and_run.sh --verify` passed; `script/agentctl.sh nest-seed-context` produced 37 Nest blocks; `script/agentctl.sh episode-spine` reported Nest seeded/writing, Studio render-ready, and Tower `needs-handoff-artifacts`.

Next production move: generate or refresh Tower handoff artifacts for Episode 1 so the same Episode Spine can move from `needs-tower-handoff` to platform-posting readiness without lying about publication receipts.

## 2026-06-19 - Episode 1 Tower handoff generated

- Ran full release prep for Episode 1 into `/Users/wall-e/Movies/QuipslyExports/Episode1Tower/2026-06-19-episode1-spine-release`.
- Generated local derivative artifacts: 16:9 master, 9:16 master, 12 9:16 short exports, podcast audio, social-ready zip, podcast-ready packet, upload bundle, publication cockpit, publish packet, and receipt log.
- Verified `/episode_spine`: Nest remains seeded/writing, Studio remains render-ready, and Tower advanced from `needs-tower-handoff` to `ready-for-platform-posting` with 3/3 lanes ready.
- Preserved receipt truth: publication is still incomplete, with missing receipt count reported by Tower. File existence is not publication proof.
- Added a `START-HERE-Episode-1-Tower-Handoff.md` operator note in the release folder so the handoff is calmer and less anxiety-inducing.

Next gap: watch/listen review the artifacts, choose the best shorts, then capture real platform receipts after manual posting or scheduling.

## 2026-06-19 - Tower receipt cockpit and agent-as-creative-partner doctrine

- Added a publication receipt cockpit to QuipslyStudio app state and the local agent server.
- New route and CLI command: `script/agentctl.sh publication-receipt-cockpit`.
- Verified receipt state for Episode 1: 52 expected receipt records, 52 ready for receipt capture, 0 captured, and `publicationComplete=false`.
- The next receipt is explicit and actionable: Apple Podcasts / podcast-audio-master, with a generated `publish-receipt-update` command template.
- Product rule reinforced: exported files, zips, and packets are release artifacts, not publication proof. Tower only becomes complete when platform receipts or scheduled/public URLs are captured.
- Updated AI drafting/assistant doctrine: Codex and Quipslys may be full creative partners that generate real publishable drafts and packets. The anti-black-box promise is visible authorship, provenance, review state, and reversibility, not a ban on agent writing.

Lesson: Quipsly should not wait passively for humans to supply every artifact needed to build the system. Agents can create serious working content, then the product must make the lineage and approval state legible.

## 2026-06-19 - Tower receipt cockpit made visible in the Publish workbench

- Added a visible `Tower receipt cockpit` panel to the QuipslyStudio Publish workbench.
- The panel shows receipt records, captured receipts, ready-to-capture receipts, waiting receipts, the next receipt target, and grouped family/platform receipt summaries.
- Added buttons to capture the next receipt, copy the next receipt command, copy cockpit JSON, and copy the full missing-receipts checklist.
- Kept it composed from the existing `PublishReceiptRecord` helpers and `/publication_receipt_cockpit` payload, avoiding a second publication truth model.
- Validation: `./script/build_and_run.sh --verify` passed with warnings only. `script/agentctl.sh publication-receipt-cockpit` still reports `ready-for-receipt-capture`, 52 records, 0 captured, 52 missing, 52 ready, and `publicationComplete=false`.

Lesson: receipt truth should be visible to humans at the same level it is visible to agents. JSON-only truth helps automation; UI-visible truth reduces systems anxiety.

## 2026-06-19 - Episode Spine Tower readiness stabilized after relaunch

- Fixed Episode Spine Tower readiness so it can derive prepared social and podcast lanes from durable `PublishReceiptRecord` ledger evidence, not only transient in-session packet path state.
- This prevents a relaunch from making `/episode_spine` regress to `needs-tower-handoff` when the ledger already proves prepared artifacts and platform copy exist.
- Validation: `./script/build_and_run.sh --verify` passed with warnings only.
- Verified `/episode_spine`: overall `ready-for-platform-posting`, Nest `seeded-and-writing`, Studio `render-ready`, Tower `ready-for-platform-posting`, 3/3 Tower lanes ready, 52 missing receipts.
- Verified `/publication_receipt_cockpit`: `ready-for-receipt-capture`, 52 records, 0 captured, 52 missing, 52 ready, next receipt `Apple Podcasts / podcast-audio-master`.

Lesson: cross-lens spine state should use durable project truth first and transient UI/session paths second. Otherwise Quipsly feels haunted after every relaunch.

## 2026-06-20 - Agent authorship/provenance enters the Nest loop

- Added `NestBlock.authorship` and `NestBlock.provenanceNote` so writing/context blocks can distinguish human-authored, agent-authored, mixed-authorship, source-context, and legacy unknown-authorship states.
- Added backward-compatible decoding for older Nest blocks. Legacy material is explicitly `unknown-authorship` with a provenance note instead of being silently normalized into human or agent work.
- Added a native Nest write/paste authorship picker: Human draft, Codex first pass, and Mixed draft.
- Added visible authorship/provenance chips to selected Nest block cards.
- Extended `nest_append_block` and `script/agentctl.sh nest-append-block` with authorship, provenance, and review-status parameters.
- Seeded source/context blocks now identify as `source-context` rather than pretending to be manuscript canon.
- Dogfooded the loop with a real agent-authored doctrine block. `/state.nest` now exposes authorship counts and selected-block provenance.

Current proof snapshot: 2 Nest documents, 38 blocks, 1 `agent-authored` block, 37 legacy `unknown-authorship` blocks, selected block review status `agent-first-pass`.

Lesson: Codex and Quipslys are allowed to create serious first-pass work. The product promise is not "AI never writes." The promise is that authorship, provenance, review state, and canon/publication state stay visible enough for humans and agents to revise deliberately.

## 2026-06-20 - Nest review-state actions become agent-safe

- Added selected-block review controls in the native Nest workbench: Reviewed, Canon, and Needs work.
- Added `/nest_mark_block` and `script/agentctl.sh nest-mark-block` so agents can advance a Nest block through review-state transitions without rewriting text.
- Fixed the route to accept explicit `block_id` values. This matters because selection-only commands are fragile after relaunch or sidebar focus changes.
- Extended `/state.nest.selectedDocument.blocks` with block IDs, authorship, review status, tags, episode slug, and text preview so agents can choose the exact block they mean.
- Fixed `/nest_append_block` route forwarding so authorship, provenance, and review status query params survive the AgentServer transport layer.
- Validation: `./script/build_and_run.sh --verify` passed with existing warnings only.
- Proof: `script/agentctl.sh nest-mark-block agent-reviewed "<note>" <block-id>` moved the agent-authored doctrine block to `agent-reviewed`; `/state.nest.reviewStatusCounts` reported `agent-reviewed: 1`.

Lesson: human buttons can safely depend on selected UI state, but agent tools need stable semantic identifiers. If Codex can only act on "whatever is selected," it is not yet a grown-up collaborator interface.

## 2026-06-20 - Nest structure tagging becomes durable and ID-addressable

- Added selected-block structure controls in the native Nest workbench: Chapter, Episode, and Writing.
- Added `nestSlug(from:fallback:)` so Chapter/Episode marker blocks can derive stable slugs from visible manuscript text without creating a separate hardcoded outline.
- Added `/nest_update_block` and `script/agentctl.sh nest-update-block` for explicit block-ID structure updates.
- Structure updates can set role, tags, episode slug, and chapter slug while preserving existing tags instead of replacing context.
- Extended `/state.nest.selectedDocument.blocks` with `chapterSlug` so agents can inspect both chapter and episode structure.
- Fixed Nest structure/review mutations to call `scheduleAutosave`. The first relaunch proof exposed that live state changed but review status did not survive; the fix makes these mutations durable session truth.
- Validation: `./script/build_and_run.sh --verify` passed with existing warnings only.
- Proof: explicit `nest-update-block` and `nest-mark-block` commands updated block `A7F1DFAF-E5E2-4C89-81E1-1E491F7EBD69` to `episodeSlug=episode-1`, role `writing`, tags including `durable-proof`, and review status `agent-reviewed`.
- Relaunch proof: after restarting the app, `/state.nest.selectedDocument.blocks` still showed the agent-authored block as `agent-reviewed` with the Episode 1 structure tags. The selected UI block changed after relaunch, but the block truth persisted.

Lesson: UI selection is not durable truth. Agent workflows must be able to address exact objects by ID, and every creative-state mutation must prove it survives relaunch before we build higher-level workflows on top of it.

## 2026-06-20 - Nest block selection becomes explicit for agents

- Added `/nest_select_block` and `script/agentctl.sh nest-select-block <block-id>`.
- Added a global `/state.nest.blocks` lookup with block ID, document ID/title/kind, role, authorship, review status, chapter slug, episode slug, tags, and text preview.
- Kept `/state.nest.selectedDocument.blocks` for local document context, but agents no longer need the right document to be selected before finding a target block.
- Validation: `./script/build_and_run.sh --verify` passed with existing warnings only.
- Proof: after relaunch selected UI state pointed at a legacy block, Codex found the agent-authored Episode 1 block through `/state.nest.blocks`, called `script/agentctl.sh nest-select-block A7F1DFAF-E5E2-4C89-81E1-1E491F7EBD69`, and `/state.nest.selectedBlock` then pointed to that exact `agent-authored`, `agent-reviewed`, `episode-1` block.

Lesson: agent collaboration needs discover, select, mutate, prove. If any one of those steps depends on incidental UI focus, the workflow is not yet sturdy enough for real creative work.

## 2026-06-20 - Nest outline becomes a derived projection

- Added `/state.nest.outline` as a derived lens over Nest block metadata.
- Added `script/agentctl.sh nest-outline` so agents can inspect Chapter/Episode navigation without inventing a second outline truth.
- Outline entries derive from blocks tagged `chapter` or `episode`, or roles `chapter-marker` / `episode-marker`.
- Outline entries include block ID, document ID/title, kind, title, chapter slug/title, episode slug, role, authorship, review status, tags, and a ready-to-run `nest-select-block` command.
- Normalized outline titles from the first logical line of block text, including escaped `\n` sequences from CLI/agent-created material.
- Dogfood proof: Codex created an `agent-authored` Episode 1 marker block for `Episode 1 - The Wednesday Rule`, advanced it to `agent-reviewed`, and verified it appears in `/state.nest.outline`.
- Validation: `./script/build_and_run.sh --verify` passed with existing warnings only.
- Proof snapshot: `/state.nest.outline` reported `entryCount=4`, `episodeCount=4`, and the agent-created marker `8CB1B64E-A2F1-4FE8-9F73-6DECA66F3BD3` with title `Episode 1 - The Wednesday Rule`, role `episode-marker`, authorship `agent-authored`, and review status `agent-reviewed`.

Lesson: the outline is not a separate manuscript database. It is a calm projection over the living Nest document. Agents may create real navigational structure, but the product must keep authorship, provenance, review state, and selection commands visible.

## 2026-06-20 - Derived Nest outline becomes visible in the native workbench

- Added a `Document outline` panel to the native Nest workbench.
- The panel uses the same derived outline helper as `/state.nest.outline`, so human navigation and agent navigation share one projection contract.
- Outline cards show title, Chapter/Episode kind, authorship label, review status, and parent chapter context when present.
- Clicking an outline card selects the exact underlying Nest document/block by ID. It does not create a second outline object or mutate the manuscript.
- Refactored outline derivation into `nestOutlineEntries()` and `normalizedNestOutlineTitle(for:)` so the UI and agent state cannot quietly drift.
- Validation: `./script/build_and_run.sh --verify` passed with existing warnings only.
- Agent proof: `script/agentctl.sh nest-outline` reported `entryCount=4`, `episodeCount=4`, and the agent-created Episode 1 marker still had title `Episode 1 - The Wednesday Rule` and review status `agent-reviewed`.
- Visual proof captured at `/tmp/quipsly-nest-outline-panel.png`: the left Nest workbench displayed the derived outline with seeded Episodes 1-3 and the agent-reviewed Episode 1 marker.

Lesson: if a structure tag matters, the user should see it immediately. A tag that only exists in JSON is not yet a workflow; a tag that changes navigation becomes part of the writing loop.

## 2026-06-20 - Nest selected-block revision loop becomes real

- Added a native `Revise selected block` panel below the selected Nest block.
- The panel can load a block into an editable `TextEditor`, save the revision with a note, or cancel without mutation.
- Added `nestEditingBlockId`, `nestEditingBody`, and `nestEditingNote` state for focused revision work instead of append-only capture.
- Added `replaceNestBlockText(...)` with exact block-ID targeting, empty-text protection, unchanged-text no-op behavior, provenance-note appending, autosave, and agent-state refresh.
- If a `canon-approved` block is text-edited without an explicit review status, it is reset to `authored-draft` so canon state never silently survives a content mutation.
- Added `/nest_replace_block_text` and `script/agentctl.sh nest-replace-block-text` so Codex can revise a durable Nest block through the same object model humans use.
- Validation: `./script/build_and_run.sh --verify` passed with existing warnings only after fixing an initial SwiftUI scope mistake.
- Proof: Codex revised exact block `8CB1B64E-A2F1-4FE8-9F73-6DECA66F3BD3` through `script/agentctl.sh nest-replace-block-text`. `/state.nest.selectedBlock` then showed the revised text prefix, `authorship=agent-authored`, `reviewStatus=agent-reviewed`, and preserved provenance. `/state.nest.outline` still derived the clean title `Episode 1 - The Wednesday Rule` from the first line.

Lesson: Nest is no longer append-only. Real writing requires revision, and real collaboration requires agents and humans to revise exact objects with provenance rather than leaving important text trapped in chat.

## 2026-06-20 - Nest structure markers become first-class writing actions

What changed:
- Added direct Chapter and Episode actions to the native Nest Write / Paste panel.
- Chapter and Episode are durable Nest blocks, not separate outline records.
- Marker titles derive from the block title/body first line, so the outline stays human-readable without duplicate title fields.
- Chapter markers assign a chapter slug; Episode markers assign an episode slug.
- Agent-created markers use authorship and review status instead of pretending to be user-authored canon.

Proof:
- `./script/build_and_run.sh --verify` passed.
- Created `Chapter 0 - The Ground Beneath the Story` through the agent-safe Nest block route.
- Created `Episode 1B - A Clean Test Boundary` through the agent-safe Nest block route.
- `./script/agentctl.sh nest-outline` returned both entries from the derived outline projection.

Lesson:
- Creating structure should be a direct authoring intent, not an after-the-fact metadata surgery step. The outline should be a projection over the living document, so humans and agents work on the same source of truth.

## 2026-06-20 - Quipslys are creative partners, not placeholder machines

Product doctrine:
- Codex and Quipsly assistants may create publishable drafts, research packets, episode notes, article copy, storyboard beats, captions, shorts metadata, and other creative artifacts when that helps the system move forward.
- Agent-authored work is not automatically placeholder work. It can be real work intended for publication, subject to human review and revision.
- The safeguard is not "AI may not write." The safeguard is visible provenance, inspectable source context, reversible changes, review state, and no silent mutation of human-approved canon.
- This lets Quipsly avoid black-box creativity without forcing humans to be the bottleneck for every usable piece of content.

Operational rule:
- When the product needs content to prove a workflow, the agent should create its best real version and label authorship/review state honestly. Humans can then approve, revise, reject, or learn from it.

## 2026-06-20 - Episode Spine becomes the Nest to Studio to Tower vertical slice

What changed:
- Added `vertical-slice`, `nest-studio-tower`, and `one-loop` aliases for the existing Episode Spine loop model.
- Added `script/agentctl.sh vertical-slice` so humans and agents do not need to remember that the vertical-slice contract was historically called Episode Spine.
- Added `verticalSlice` as a first-class `/state` key alongside the legacy `episodeSpine` key.
- Added the creative partner policy to the vertical-slice payload: Codex and Quipslys may create real publishable drafts and packets, with visible authorship/provenance/review/receipts as the safeguard.
- Updated the native Episode Spine bridge copy to say it is the vertical slice: Nest context -> Studio edit -> Tower handoff.

Proof:
- `./script/build_and_run.sh --verify` passed.
- `./script/agentctl.sh vertical-slice` returned `model: quipsly-episode-spine-loop` with aliases `vertical-slice`, `nest-studio-tower`, and `one-loop`.
- Current Episode 1 proof state reported:
  - Nest: `seeded-and-writing`
  - Studio: `render-ready`
  - Tower: `ready-for-platform-posting`
  - Next action: post or schedule the ready artifacts, then capture platform URL/provider receipts.

Lesson:
- Do not make tired humans or agents join three app surfaces in their heads. If Nest, Studio, and Tower are product lenses over one truth, expose one derived read model that says where the loop is and what the next safe action is. Naming matters because it changes whether the tool feels discoverable or like an archaeological dig.

## 2026-06-20 - Nest writing layer becomes explicit and inspectable

What changed:
- Added a native `Living manuscript layer` card to the Nest workbench.
- Added an `Open/Start writing layer` action that creates or selects the authored writing document without touching seeded/imported context.
- Added `script/agentctl.sh nest-ensure-writing-document` and the `/nest_ensure_writing_document` agent route.
- Added `nest.writingReadiness` to `/state`, including authored block counts, review counts, source-context counts, source policy, creative partner policy, and next action.

Proof:
- `./script/build_and_run.sh --verify` passed.
- `./script/agentctl.sh nest-ensure-writing-document` returned `nest_ensure_writing_document_commanded`.
- `/state.nest.writingReadiness` reported `model: quipsly-nest-writing-readiness-v1`, `writingDocumentCount: 1`, `authoredBlockCount: 4`, `agentAuthoredBlockCount: 4`, and `status: drafting-needs-review`.

Lesson:
- Fresh manuscript writing must be its own visible layer. Seeded transcripts, imported production metadata, public episode pages, and book-source excerpts can help us work, but they must not become manuscript truth just because they are nearby. The product should make the safer path easier than the anxious path.

## 2026-06-20 - Vertical slice becomes a portable handoff packet

What changed:
- Added a `verticalSlicePacket` state model to QuipslyStudio.
- Added `/vertical_slice_packet` and `/vertical_slice_packet_generate` to the native agent server.
- Added `script/agentctl.sh vertical-slice-packet` and `script/agentctl.sh vertical-slice-packet-generate` aliases.
- The generated packet snapshots Nest writing readiness, Studio delivery/edit proof state, Tower publication handoff state, agent-safe commands, source policy, and the creative-partner doctrine.
- The packet explicitly says it is a handoff artifact, not the source of truth. It does not mutate manuscript canon, timeline decisions, source media, exports, or platform publication state.

Proof:
- `./script/build_and_run.sh --verify` passed with existing warnings only.
- `./script/agentctl.sh vertical-slice-packet-generate "$TMPDIR/quipsly-vertical-slice-proof" episode-1-proof` generated `episode-1-proof-vertical-slice-packet.json`.
- JSON readback reported:
  - model: `quipsly-nest-studio-tower-vertical-slice-packet`
  - session: `episode-1-premiere-rescue`
  - sequence: `Episode 1 Premiere Rescue`
  - vertical slice: `ready-for-platform-posting`
  - Nest: `seeded-and-writing`
  - Studio: `render-ready`
  - Tower: `ready-for-platform-posting`
  - writing readiness: `drafting-needs-review`

Lesson:
- A serious creative OS needs portable truth packets. Humans, agents, and future apps should not have to reconstruct the Nest -> Studio -> Tower loop from scattered UI memory. The packet is the field notebook page: useful, inspectable, and portable, but never a replacement for the living source objects.

## 2026-06-20 - Vertical slice packet becomes visible in the native Tower workbench

What changed:
- Added a native `Portable loop packet` panel directly below the Episode Spine bridge in the Production Cockpit/Tower workbench.
- The panel explains the packet as a field-note snapshot for agents and collaborators: Nest writing context, Studio edit/export readiness, Tower publishing handoff, source policy, and creative-partner rules.
- Added human-visible actions to generate the packet, reveal it in Finder, and copy its path.
- Added status color/icon/label/detail helpers so the packet state is visible instead of hidden in `/state`.
- Added a dedicated reveal helper for the generated vertical-slice packet file.

Proof:
- `./script/build_and_run.sh --verify` passed with existing warnings only.
- `./script/agentctl.sh vertical-slice-packet-generate "$TMPDIR/quipsly-vertical-slice-proof" episode-1-visible-loop` generated `episode-1-visible-loop-vertical-slice-packet.json`.
- `./script/agentctl.sh vertical-slice-packet` reported `status: generated` and the generated output path.
- JSON readback proved the packet exists and carries Episode 1 truth: Nest `seeded-and-writing`, Studio `render-ready`, Tower `ready-for-platform-posting`, writing readiness `drafting-needs-review`, creative partner policy present, and agent commands present.

Lesson:
- Agent-readable truth should also be human-visible truth. The system is calmer when the same packet that lets Codex coordinate the loop is visible as a normal product action instead of a hidden developer trick.

## 2026-06-20 - Nest gets a visible writing next-action queue

What changed:
- Added a native `What should happen next?` panel to the Nest workbench.
- The panel shows a gentle writing queue for starting/opening the authored layer, seeding source context, selecting review blocks, preparing structure markers, and preparing the next draft beat.
- Added action handlers so queue rows can open the writing layer, seed context, select the next review block, or preload the write/paste panel without silently mutating manuscript canon.
- Added `nextActionQueue` to `nest.writingReadiness` so Codex and humans see the same next-work truth.

Proof:
- `./script/build_and_run.sh --verify` passed with existing warnings only.
- `/state.nest.writingReadiness.nextActionQueue` returned two actionable rows in the current Episode 1 vertical slice:
  - `Review the next draft block`
  - `Human-check agent first-pass writing`
- The first queue command pointed to `script/agentctl.sh nest-select-block 1CD91222-E574-42B2-B981-5A76A6361CD6`.
- Current writing state remained `drafting-needs-review` with one writing document and four authored blocks.

Lesson:
- The product should carry the anxious question, "what should I do next?" as visible state. This is not a phase gate and not a judgement system. It is a shared affordance: humans can ignore it, agents can act from it, and both can see why the next move is suggested.

## 2026-06-20 - Codex dogfoods Nest as a real writing partner

What changed:
- Used the Nest writing queue instead of bypassing it in chat.
- Added a serious `agent-authored` / `agent-first-pass` Episode 1 manuscript block titled `Episode 1 - Charlie first-pass reflection`.
- The draft is real working manuscript material, not placeholder text, and is explicitly review-labeled instead of canon-approved.
- Regenerated the Nest -> Studio -> Tower vertical-slice packet after writing so the handoff includes the updated Nest state.

Proof:
- Before writing, `/state.nest.writingReadiness` reported `authoredBlockCount: 4` and `agentAuthoredBlockCount: 4`.
- `script/agentctl.sh nest-append-block "Episode 1 - Charlie first-pass reflection" ... agent-authored ... agent-first-pass` returned `nest_append_block_commanded`.
- After writing, `/state.nest.selectedBlock` pointed to block `7E944A21-F588-4DFB-B6BD-ADCA2CDD7355` with role `writing`, authorship `agent-authored`, review status `agent-first-pass`, and episode `episode-1`.
- After writing, `/state.nest.writingReadiness` reported `authoredBlockCount: 5` and `agentAuthoredBlockCount: 5`.
- `script/agentctl.sh vertical-slice-packet-generate "$TMPDIR/quipsly-vertical-slice-proof" episode-1-writing-dogfood` generated `episode-1-writing-dogfood-vertical-slice-packet.json`.
- Packet readback showed the selected Nest block preview beginning `Episode 1 - The Wednesday Rule: Charlie first-pass reflection`, writing status `drafting-needs-review`, and the next-action queue still focused on review.

Lesson:
- A Quipsly creative partner must be able to create real work inside the product, not only advise from chat. The safety mechanism is provenance and review state, not paralysis. This is the first clean proof of Codex writing into the living Nest layer and then carrying that work into the vertical-slice packet.

## 2026-06-19 - Nest writing queue becomes agent-actionable without losing provenance

What changed:
- Added agent-facing Nest writing queue routes: `/nest_writing_queue` and `/nest_writing_next_action`.
- Added CLI aliases: `script/agentctl.sh nest-writing-queue` and `script/agentctl.sh nest-writing-next-action`.
- Wired `nest_writing_next_action` into the native Workspace command dispatcher so Codex can act from the same visible queue humans see.
- Fixed a provenance leak in `nestWritingNextActionRows`: the first implementation considered every block in the writing document, including legacy `unknown-authorship` working notes.
- The queue now uses the same authored-candidate filter as the readiness model and prioritizes real writing blocks before structural/context blocks.

Proof:
- `./script/build_and_run.sh --verify` passed with existing warnings only.
- `script/agentctl.sh nest-writing-queue` returned a first action pointing to block `7E944A21-F588-4DFB-B6BD-ADCA2CDD7355`.
- `script/agentctl.sh nest-writing-next-action 1` selected that block in app state.
- `/state.nest.selectedBlock` then reported role `writing`, authorship `agent-authored`, review status `agent-first-pass`, and episode `episode-1`.
- Generated `episode-1-nest-queue-control-vertical-slice-packet.json`; readback showed the selected agent-authored Episode 1 reflection in the portable Nest -> Studio -> Tower packet.

Lesson:
- Agent affordances must preserve the same provenance semantics as human affordances. A button that helps Codex act faster is only good if it keeps authorship, review state, and canon boundaries intact. Otherwise the tool becomes exactly the black-box mud puddle Quipsly is meant to drain.

Follow-up:
- The vertical-slice packet readback showed selected Nest block truth correctly, but one top-level `verticalSliceStatus` field was null in the packet shape. Clean that up deliberately in a packet-schema pass rather than patching it mid-proof.

## 2026-06-19 - Codex is explicitly a full content partner for dogfooding

What changed:
- Updated `docs/quipsly/quipsly-ai-drafting-policy.md` to state that Codex and other Quipslys are allowed to create real publishable-quality first-pass work, not only placeholders.
- Clarified that Quipsly's anti-black-box posture is about provenance, review state, source receipts, reversibility, canon boundaries, and publication receipts, not about forbidding AI-authored writing.

Operational rule:
- If the product loop needs content, Codex may create serious content and carry it through Nest, Studio, and Tower while labeling its state honestly. Humans can later revise, reject, approve, canonize, or publish it.

Lesson:
- Waiting for humans to supply every paragraph, article, caption, storyboard beat, or research packet would bottleneck Quipsly before it can prove itself. Treating agent work as real but inspectable lets the system move fast without collapsing into hidden authorship.

## 2026-06-19 - Vertical-slice packet exposes fast status and restart-safe selection proof

What changed:
- Added top-level `verticalSliceStatus` and `verticalSliceNextAction` to generated Nest -> Studio -> Tower packet JSON.
- The generated packet still keeps the full nested `verticalSlice` payload as the source model; the new fields are convenience handles for humans, agents, and handoff scripts.

Proof:
- `./script/build_and_run.sh --verify` passed with existing warnings only.
- Generated `episode-1-content-partner-proof-vertical-slice-packet.json`; readback showed `verticalSliceStatus: ready-for-platform-posting` and a concrete next action.
- That first post-rebuild packet also revealed a useful runtime truth: after app relaunch, the selected Nest block had fallen back to an older `unknown-authorship` working note.
- Re-ran `script/agentctl.sh nest-writing-next-action 1` to orient from the durable writing queue, then generated `episode-1-content-partner-selected-proof-vertical-slice-packet.json`.
- Final readback showed `verticalSliceStatus: ready-for-platform-posting`, `verticalSliceNextAction: Post or schedule the ready artifacts, then capture every platform URL/provider receipt.`, writing status `drafting-needs-review`, and selected block `7E944A21-F588-4DFB-B6BD-ADCA2CDD7355` with role `writing`, authorship `agent-authored`, and review status `agent-first-pass`.

Lesson:
- After rebuilds or relaunches, agent workflows should re-orient from durable queues/readiness models instead of assuming the previous visual selection is still meaningful. Stale selection is not canon; the queue and provenance state are the safer compass.

## 2026-06-19 - Nest writing packet gives authored work a portable handoff artifact

What changed:
- Added Nest writing packet state to the native app: `nestWritingPacket` in `/state`.
- Added agent routes: `/nest_writing_packet` and `/nest_writing_packet_generate`.
- Added CLI aliases: `script/agentctl.sh nest-writing-packet` and `script/agentctl.sh nest-writing-packet-generate`.
- Added a generated `quipsly-nest-writing-packet` JSON artifact carrying authored manuscript blocks, review queue, selected block, outline, writing readiness, source-context summaries, and safe agent commands.
- The packet treats agent-authored content as real reviewable work while preserving provenance, review state, and canon boundaries.

Proof:
- `./script/build_and_run.sh --verify` passed with existing warnings only.
- Ran `script/agentctl.sh nest-writing-next-action 1` before generation so the packet oriented from the durable writing queue rather than stale selection.
- Ran `script/agentctl.sh nest-writing-packet-generate "$TMPDIR/quipsly-nest-writing-proof" episode-1-nest-writing-proof`.
- `script/agentctl.sh nest-writing-packet` reported `status: generated` and output path `episode-1-nest-writing-proof-nest-writing-packet.json`.
- Packet readback reported:
  - model `quipsly-nest-writing-packet`
  - session `episode-1-premiere-rescue`
  - authored block count `5`
  - review queue count `5`
  - writing status `drafting-needs-review`
  - selected block `7E944A21-F588-4DFB-B6BD-ADCA2CDD7355`
  - selected authorship `agent-authored`
  - selected review status `agent-first-pass`

Lesson:
- A writing system becomes less scary when serious drafts, review state, and next actions can leave the UI as a portable packet. This is especially important for agents: Codex should not have to remember creative work from chat history, and humans should not have to trust invisible assistant memory.

Follow-up:
- Current packet proof showed `sourceContextSummaryCount: 0` in the running app state. That is acceptable truth for this packet, but the next Nest pass should make seeded source-context availability and recovery more obvious so authored work can sit beside the book/episode source material without confusion.

## 2026-06-19 - Nest writing packet explains missing source context without anxiety

What changed:
- Added `sourceContextStatus` and `sourceContextRecovery` to the generated Nest writing packet.
- When source context is not loaded, the packet now says so plainly, explains that authored writing is still valid, and gives the safe recovery command `script/agentctl.sh nest-seed-context`.
- Added fallback references for Episodes 1-3 and HighGroundOdyssey.com so a human or agent has a sane next path instead of a mystery gap.

Proof:
- `./script/build_and_run.sh --verify` passed with existing warnings only.
- Generated `episode-1-nest-writing-recovery-proof-nest-writing-packet.json`.
- Packet readback reported authored block count `5`, review queue count `5`, source context summary count `0`, source context status `not-loaded-in-current-session`, source recovery command `script/agentctl.sh nest-seed-context`, selected authorship `agent-authored`, and selected review status `agent-first-pass`.

Lesson:
- Missing context should not feel like failure. It should be explicit state plus a safe next action. This is one of the small product moves that turns Quipsly from a clever editor into a systems-anxiety reducer.

## 2026-06-19 - Nest source context can be recovered without stealing writing focus

What changed:
- Updated `seedHighGroundOdysseyNestContext()` so seeding or refreshing source context preserves the previously selected Nest block when it still exists.
- This keeps the writer or agent focused on the active authored draft while source scaffolding is added in the background.
- Regenerated a combined Nest writing packet with both authored work and source context.

Proof:
- `./script/build_and_run.sh --verify` passed with existing warnings only.
- Ran `script/agentctl.sh nest-writing-next-action 1`, then `script/agentctl.sh nest-seed-context`, then inspected `/state`.
- State showed source context available with authorship counts: `agent-authored: 5`, `source-context: 36`, `unknown-authorship: 1`.
- Selection remained on block `7E944A21-F588-4DFB-B6BD-ADCA2CDD7355` with role `writing`, authorship `agent-authored`, review status `agent-first-pass`, and episode `episode-1`.
- Generated `episode-1-nest-writing-focused-source-context-nest-writing-packet.json`.
- Packet readback showed authored block count `5`, review queue count `5`, source context summary count `20`, source context status `available`, and selected block still `agent-authored` / `agent-first-pass`.

Lesson:
- Add context without stealing focus. A creative system should enrich the workspace around the user's current thought, not yank their attention into the machinery. This is a small implementation detail that directly supports the larger Quipsly promise: less systems anxiety, more creative continuity.

## 2026-06-19 - Nest writing packet joins the visible vertical-slice handoff

What changed:
- Added a visible `Nest writing handoff` panel to the native Nest workbench.
- The panel shows authored draft count, source-context count, review count, packet status, and actions to generate, reveal, or copy the Nest writing packet path.
- Added a Finder reveal helper for generated Nest writing packets.
- Embedded `nestWritingPacket` state and `nestWritingSnapshot` into generated Nest -> Studio -> Tower vertical-slice packets.
- Added `generateNestWritingPacket` to the vertical-slice packet's agent commands so a future agent can refresh the manuscript packet from the same handoff folder.

Proof:
- `./script/build_and_run.sh --verify` passed with existing warnings only.
- Generated `episode-1-integrated-nest-writing-nest-writing-packet.json`.
- Generated `episode-1-integrated-loop-vertical-slice-packet.json`.
- Vertical-slice packet readback reported:
  - model `quipsly-nest-studio-tower-vertical-slice-packet`
  - vertical slice status `ready-for-platform-posting`
  - nested Nest writing packet status `generated`
  - nested Nest writing packet path `episode-1-integrated-nest-writing-nest-writing-packet.json`
  - snapshot model `quipsly-nest-writing-packet`
  - authored block count `5`
  - review queue count `5`
  - source context summary count `20`
  - source context status `available`
  - selected authorship `agent-authored`
  - selected review status `agent-first-pass`
  - `generateNestWritingPacket` command present

Lesson:
- Nest, Studio, and Tower become one product when handoffs carry the same truth the UI shows. A serious creative OS should not make collaborators ask, "where is the manuscript state?" The answer should be in the visible panel and in the portable packet.

## 2026-06-19 - Tower release prep now carries Nest writing context

What changed:
- Added a Tower-facing `Nest writing context` panel to the Production Cockpit.
- Added `nestWritingHandoffSummaryPayload()` so Tower can classify manuscript/content context as `ready-with-writing-packet`, `ready-needs-writing-packet`, `needs-source-context`, `needs-authored-work`, or `generating`.
- Embedded the Nest writing handoff summary into `publicationReadyHandoff` and `publicationMissionControl`.
- Added Nest writing context as a Mission Control deliverable beside the 16:9 episode master, social shorts, and podcast audio handoff.
- Kept the creative-partner doctrine explicit: agent-authored work can be serious publishable first-pass work, but Tower must carry authorship, source context, review status, and canon boundaries.

Proof:
- `./script/build_and_run.sh --verify` passed with existing warnings only.
- Ran `script/agentctl.sh nest-writing-next-action 1`, `script/agentctl.sh nest-seed-context`, `script/agentctl.sh nest-writing-packet-generate`, and `script/agentctl.sh vertical-slice-packet-generate`.
- `script/agentctl.sh publication-mission-control` reported `status: ready-for-platform-posting`, `summary.nestWritingStatus: ready-with-writing-packet`, `nestWriting.authoredBlockCount: 5`, and `nestWriting.sourceContextStatus: available`.
- `script/agentctl.sh publication-ready-handoff` reported `nestWriting.packetStatus: generated` with a concrete packet path.

Lesson:
- Tower should not only ask whether media artifacts are ready. It should also expose whether the release handoff includes manuscript/context/authorship truth. This lets Codex and other Quipslys create real content without making publication state opaque or spooky.

## 2026-06-19 - One command prepares the Nest -> Studio -> Tower handoff

What changed:
- Added `script/agentctl.sh vertical-slice-prepare [/absolute/output/folder] [optional-basename]`.
- Added aliases `one-loop-prepare` and `nest-studio-tower-prepare`.
- The command now performs the repeatable handoff recipe:
  - capture before-state
  - select the next Nest writing action
  - seed/refresh Nest source context
  - generate the Nest writing packet
  - generate the vertical-slice packet
  - read back Nest writing packet state, publication ready handoff, publication mission control, vertical-slice packet state, and after-state
  - write a manifest summarizing readiness, packet paths, authorship/source context counts, and safe follow-ups

Proof:
- `bash -n script/agentctl.sh` passed.
- Ran `./script/agentctl.sh vertical-slice-prepare "$TMPDIR/quipsly-vertical-slice-proof" episode-1-one-command-proof`.
- Manifest reported:
  - `status: ready-for-platform-posting`
  - `nestWritingStatus: ready-with-writing-packet`
  - `nestWritingPacketStatus: generated`
  - `verticalSlicePacketStatus: generated`
  - `authoredBlockCount: 5`
  - `reviewQueueCount: 5`
  - `sourceContextStatus: available`
- Ran a second proof with `episode-1-one-command-proof-2`; it repeated the same ready state and wrote a publication mission-control artifact.

Lesson:
- A product loop is not mature until the proof path is one memorable action. Humans need a visible panel; agents need an evidence folder. Both should describe the same truth: prepared handoffs are not canon approval, not upload, and not publication proof.

## 2026-06-19 - Vertical-slice proof folders now have a human START-HERE

What changed:
- `script/agentctl.sh vertical-slice-prepare` now writes a human-readable `START-HERE-<basename>.md` beside the JSON proof artifacts.
- The note summarizes Tower status, Nest writing status, packet readiness, source-context status, authored/review counts, ready publication lanes, and the next action.
- The note explicitly separates prepared handoff readiness from canon approval, upload, publication, and receipt proof.

Proof:
- `bash -n script/agentctl.sh` passed.
- Ran `./script/agentctl.sh vertical-slice-prepare "$TMPDIR/quipsly-vertical-slice-proof" episode-1-start-here-proof`.
- Manifest reported `status: ready-for-platform-posting`, `nestWritingStatus: ready-with-writing-packet`, and `verticalSlicePacketStatus: generated`.
- Generated `/var/folders/.../quipsly-vertical-slice-proof/START-HERE-episode-1-start-here-proof.md`.
- Readback confirmed the START-HERE file exists and contains the guardrail that prepared handoffs do not prove publication.

Lesson:
- Every serious handoff folder should have both machine truth and human orientation. JSON lets agents continue precisely; START-HERE lowers human systems anxiety and prevents overclaiming readiness as publication proof.

## 2026-06-19 - Vertical-slice folders now have stable latest handles

What changed:
- `script/agentctl.sh vertical-slice-prepare` now writes stable folder-level entrypoints:
  - `START-HERE.md`
  - `latest-vertical-slice-manifest.json`
- The command still preserves run-specific artifacts such as `START-HERE-<basename>.md` and `<basename>-manifest.json` for audit/history.
- Updated the agentctl usage notes so future agents know this command is the readable proof-folder path.

Proof:
- `bash -n script/agentctl.sh` passed.
- Ran `./script/agentctl.sh vertical-slice-prepare "$TMPDIR/quipsly-vertical-slice-proof" episode-1-latest-handles-proof`.
- Manifest reported `status: ready-for-platform-posting` and `nestWritingStatus: ready-with-writing-packet`.
- Readback confirmed:
  - stable `START-HERE.md` exists
  - stable `latest-vertical-slice-manifest.json` exists
  - run-specific START-HERE exists
  - run-specific manifest exists
  - latest manifest points to basename `episode-1-latest-handles-proof`

Lesson:
- Stable latest handles reduce anxiety and make collaboration faster. Run-specific artifacts preserve accountability. We should reuse this pattern for future edit, capture, publication, and analytics handoff folders.

## 2026-06-19 - Vertical-slice proof folders now have a quick review command

What changed:
- Added `script/agentctl.sh vertical-slice-review [/proof-folder-or-manifest.json] [--json]`.
- Added aliases `one-loop-review` and `nest-studio-tower-review`.
- The command reads `latest-vertical-slice-manifest.json` from a proof folder, or a manifest path directly.
- Text mode prints a concise status report: Tower status, Nest writing status, packet readiness, source-context state, authored/review counts, publication lane readiness, next action, key proof files, and the publication guardrail.
- JSON mode returns the full manifest unchanged for agents and scripts.

Proof:
- `bash -n script/agentctl.sh` passed.
- Ran `./script/agentctl.sh vertical-slice-review "$TMPDIR/quipsly-vertical-slice-proof"`.
- Text output contained `ready-for-platform-posting`, `ready-with-writing-packet`, and the guardrail that ready-for-platform-posting is not published.
- Ran `./script/agentctl.sh vertical-slice-review "$TMPDIR/quipsly-vertical-slice-proof" --json`.
- JSON output parsed as `quipslystudio-vertical-slice-prepare-manifest` with status `ready-for-platform-posting` and Nest writing status `ready-with-writing-packet`.

Lesson:
- Proof-producing commands should have paired review commands. Preparation creates evidence; review turns evidence into calm, repeatable situational awareness for humans and agents without mutating state.

## 2026-06-19 - Codex used Nest to add real Episode 1 writing, then clarified review counters

What changed:
- Used the Nest writing loop directly to add a serious `agent-authored` / `agent-first-pass` block titled `Codex first-pass: The Wednesday Rule as a practice`.
- The block is tied to `episode-1` with tags `book`, `episode-1`, `wednesday-rule`, `agent-first-pass`, and `systems-anxiety`.
- The block explicitly states it is Codex-authored first-pass manuscript/show reflection, not canon-approved text.
- Regenerated the Nest -> Studio -> Tower vertical-slice handoff after adding the block.
- Improved `vertical-slice-prepare` and `vertical-slice-review` so they distinguish:
  - `authoredBlockCount`
  - `authoredNeedsReviewCount`
  - `reviewQueueCount`
- This removes ambiguity between "how many authored blocks need human review?" and "how many packet review entries are traveling in the artifact?"

Proof:
- `script/agentctl.sh nest-append-block ...` returned `status: nest_append_block_commanded`, authorship `agent-authored`, episode `episode-1`, role `writing`, review status `agent-first-pass`.
- `script/agentctl.sh nest-writing-queue` then reported:
  - `authoredBlockCount: 6`
  - `agentAuthoredBlockCount: 6`
  - `authoredNeedsReviewCount: 4`
  - `sourceContextBlockCount: 36`
- Ran `./script/agentctl.sh vertical-slice-prepare "$TMPDIR/quipsly-vertical-slice-proof" episode-1-after-counter-clarity`.
- Manifest reported:
  - `status: ready-for-platform-posting`
  - `authoredBlockCount: 6`
  - `authoredNeedsReviewCount: 4`
  - `reviewQueueCount: 6`
- `vertical-slice-review` now prints both `authoredNeedsReview` and `packetReviewQueue`.
- `bash -n script/agentctl.sh` passed.

Lesson:
- Dogfooding with real agent-authored writing immediately exposed a language/data ambiguity. That is the point of this loop: create real work, let the product tell us where it becomes confusing, then fix the workflow instead of training ourselves to tolerate confusion.

## 2026-06-19 - Nest writing has a read-only review command

What changed:
- Added `script/agentctl.sh nest-writing-review [/proof-folder-or-packet.json] [--json]`.
- Added alias `nest-manuscript-review`.
- The command can read:
  - a vertical-slice proof folder containing `latest-vertical-slice-manifest.json`
  - a vertical-slice manifest
  - a Nest writing packet state file
  - a full Nest writing packet
- Text mode prints the packet path, drafting status, authored counts, authored-needs-review count, packet review queue count, source-context status, selected block, review queue previews, and safe select/review/canon commands.
- JSON mode returns a `quipsly-nest-writing-review` packet for agents/scripts.
- The command is read-only. It exposes next actions but does not mark anything reviewed, canonical, or published.

Proof:
- `bash -n script/agentctl.sh` passed.
- Ran `./script/agentctl.sh nest-writing-review "$TMPDIR/quipsly-vertical-slice-proof"`.
- Text output showed title `Quipsly Nest writing review`, the review queue, selected work, and the guardrail that reviewable writing is not canon approval.
- Ran `./script/agentctl.sh nest-writing-review "$TMPDIR/quipsly-vertical-slice-proof" --json`.
- JSON parsed as `quipsly-nest-writing-review` with:
  - `authoredBlockCount: 6`
  - `authoredNeedsReviewCount: 4`
  - `reviewQueueCount: 6`

Lesson:
- Every powerful creative action needs a paired read-only review path. Review commands should make the next mutation easy to understand without doing it automatically. That is how Quipsly can support serious agent-authored work without making canon feel slippery.

## 2026-06-19 - Vertical-slice handoffs now include a persistent Nest writing review page

What changed:
- `script/agentctl.sh vertical-slice-prepare` now writes:
  - stable `NEST-WRITING-REVIEW.md`
  - run-specific `NEST-WRITING-REVIEW-<basename>.md`
- The generated page summarizes writing status, authored counts, agent-authored count, authored-needs-review count, packet review queue entries, source-context status, selected work, review queue previews, and safe select/review/canon commands.
- The top-level `vertical-slice-review` output now points to the Nest writing review page.
- The generated manifest now includes `artifacts.nestWritingReview` and `artifacts.latestNestWritingReview`.

Proof:
- `bash -n script/agentctl.sh` passed.
- Ran `./script/agentctl.sh vertical-slice-prepare "$TMPDIR/quipsly-vertical-slice-proof" episode-1-nest-review-md-proof`.
- Readback confirmed:
  - stable `NEST-WRITING-REVIEW.md` exists
  - run-specific Nest writing review exists
  - manifest includes both Nest review artifact paths
  - stable review starts with `# Nest writing review:`
  - stable review contains the guardrail that the page does not canonize text
  - `vertical-slice-review` mentions the Nest writing review path
  - `nest-writing-review --json` still parses as `quipsly-nest-writing-review` with `authoredBlockCount: 6` and `authoredNeedsReviewCount: 4`

Lesson:
- Layer-specific review pages lower systems anxiety. START-HERE explains the whole loop; NEST-WRITING-REVIEW explains the manuscript/content layer. Both are generated views over packet truth, not new hand-edited truth.

## 2026-06-20 - Vertical-slice handoffs now include a Studio edit review page

What changed:
- `script/agentctl.sh vertical-slice-prepare` now writes:
  - stable `STUDIO-EDIT-REVIEW.md`
  - run-specific `STUDIO-EDIT-REVIEW-<basename>.md`
- The generated page summarizes Studio/edit state from existing proof truth: delivery readiness, editor proof snapshot, media recovery, source lane counts, proxy readiness, SHOW/SKIP decisions, export state, shorts queue state, source policy, and key proof files.
- The vertical-slice manifest now includes `artifacts.studioEditReview` and `artifacts.latestStudioEditReview`.
- `script/agentctl.sh vertical-slice-review` now points operators to the Studio edit review page beside START-HERE and Nest writing review.
- This is a generated read-only review layer. It does not mutate edit decisions, export media, approve content, publish, or capture receipts.

Proof:
- `bash -n script/agentctl.sh` passed.
- Ran `./script/agentctl.sh vertical-slice-prepare "$TMPDIR/quipsly-vertical-slice-proof" episode-1-studio-edit-review-proof`.
- Confirmed stable and run-specific Studio review pages exist.
- Confirmed `STUDIO-EDIT-REVIEW.md` starts with `# Studio edit review:` and contains both the read-only guardrail and source-policy invariant.
- Confirmed `script/agentctl.sh vertical-slice-review "$TMPDIR/quipsly-vertical-slice-proof"` prints the Studio edit review path.

Lesson:
- The vertical slice needs layer-specific review pages. START-HERE orients the whole loop, Nest writing review explains manuscript/context state, and Studio edit review explains edit/media state. These pages reduce systems anxiety by making each layer inspectable without creating another source of truth.

## 2026-06-20 - Vertical-slice handoffs now include a Tower publication review page

What changed:
- `script/agentctl.sh vertical-slice-prepare` now writes:
  - stable `TOWER-PUBLICATION-REVIEW.md`
  - run-specific `TOWER-PUBLICATION-REVIEW-<basename>.md`
- The generated page summarizes Tower/publication truth from existing app state: mission status, publication phase, lane readiness, publish ledger count, captured/missing receipts, next receipt target, lane readiness, family/platform receipt summaries, first missing receipts, operator steps, and proof files.
- The vertical-slice manifest now includes `artifacts.towerPublicationReview` and `artifacts.latestTowerPublicationReview`.
- `script/agentctl.sh vertical-slice-review` now points operators to the Tower publication review page alongside START-HERE, Nest writing review, and Studio edit review.
- This is a generated read-only review layer. It does not upload, schedule, publish, capture receipts, or mark publication complete.

Lesson:
- Tower must make the release-management boundary obvious: ready artifacts are not published artifacts. The review page should make the next publication receipt target visible without creating another source of truth or pretending integrations exist before they do.

## 2026-06-20 - Tower publication review proof passed

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- Ran `./script/agentctl.sh vertical-slice-prepare "$TMPDIR/quipsly-vertical-slice-proof" episode-1-tower-publication-review-proof`.
- Confirmed stable and run-specific Tower review pages exist:
  - `TOWER-PUBLICATION-REVIEW.md`
  - `TOWER-PUBLICATION-REVIEW-episode-1-tower-publication-review-proof.md`
- Confirmed `TOWER-PUBLICATION-REVIEW.md` starts with `# Tower publication review:`.
- Confirmed the page includes:
  - the guardrail `Ready artifacts are not published artifacts`
  - `## Next receipt target`
  - `## First missing receipts`
  - explicit language that the page does not upload, schedule, publish, or capture receipts
- Confirmed `script/agentctl.sh vertical-slice-review "$TMPDIR/quipsly-vertical-slice-proof"` now prints the Tower publication review path beside START-HERE, Nest writing review, and Studio edit review.
- Current proof status remains honest: `status=ready-for-platform-posting`, `publicationComplete=False`.

Lesson:
- The vertical-slice handoff now has a three-layer review stack: Nest writing review, Studio edit review, and Tower publication review. That is the right anti-anxiety shape: each layer has a readable proof page, but all pages remain projections over existing state rather than new sources of truth.

## 2026-06-20 - START-HERE now indexes the layer review stack

What changed:
- `script/agentctl.sh vertical-slice-prepare` now appends a `Layer review pages` section to generated `START-HERE.md`.
- The section points to:
  - `NEST-WRITING-REVIEW.md`
  - `STUDIO-EDIT-REVIEW.md`
  - `TOWER-PUBLICATION-REVIEW.md`
- The section states that these pages are generated projections over current state, not approval/export/publish/mutation actions.

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- Ran `./script/agentctl.sh vertical-slice-prepare "$TMPDIR/quipsly-vertical-slice-proof" episode-1-start-here-review-index-proof`.
- Confirmed `START-HERE.md` includes the layer review section, all three review page links, and projection guardrail language.

Lesson:
- A handoff folder should answer `what should I open first, second, and third?` without requiring the operator to know the internal packet structure. This is small UX, but it is also systems-anxiety prevention.

## 2026-06-20 - Native Episode Spine now shows the review stack

What changed:
- Added a native `Vertical slice review stack` card inside the Episode Spine bridge panel in `WorkspaceView.swift`.
- The card summarizes the same three review lenses now generated in the handoff folder:
  - Nest review: authored work and writing review queue.
  - Studio review: short/edit readiness and Studio status.
  - Tower review: captured versus missing publication receipts and the next receipt target.
- The card explicitly says generated START-HERE, Nest, Studio, and Tower review pages are projections over current state, not approval/export/publish/mutation actions.
- This keeps the app UI aligned with the generated proof-folder handoff without inventing a second source of truth or pretending the native app knows CLI-generated Markdown file paths.

Proof:
- `./script/build_and_run.sh --verify` passed for `apps/QuipslyStudio`.
- Existing warnings remain, mostly older Swift optional-to-Any and deprecated `onChange` warnings.
- Search confirmed the new accessibility identifier `quipsly.vertical-slice.review-stack` exists in `WorkspaceView.swift`.

Limitation:
- This pass validated the native build path but did not capture a fresh visual screenshot of the card in the running app. A later UI pass should visually inspect the Episode Spine panel for spacing and readability.

Lesson:
- Generated proof folders and native UI should expose the same truth at different depths. The folder gives portable artifacts; the app gives live state. Mixing those up would create theater. Aligning them gives humans and agents the same mental map.

## 2026-06-20 - Runbook now treats Codex as a creative operator

What changed:
- Added a `Codex as a creative operator` section to `docs/quipsly/quipslystudio-codex-production-runbook.md`.
- The runbook now explicitly says Codex and other Quipslys may create serious first-pass creative work when Nest, Studio, or Tower needs content to move forward.
- It distinguishes disposable placeholder material from serious agent-authored production material.
- It keeps the real boundary clear: the problem is hidden mutation, fake provenance, silent canon changes, or unproved publication, not the fact that an agent wrote, edited, researched, or packaged something.

Proof:
- Docs-only change. No build was run because the active change is operator doctrine, not Swift/runtime behavior.

Lesson:
- If Quipsly needs to prove a complete creative operating system, agents cannot wait for humans to supply every usable input. The durable safeguard is provenance, review state, reversibility, and canon/publication boundaries, not artificial paralysis.

## 2026-06-20 - Vertical-slice handoffs now carry the creative-partner rule

What changed:
- Updated `apps/QuipslyStudio/script/agentctl.sh` so `vertical-slice-prepare` writes creative-partner/provenance guidance directly into generated handoff Markdown.
- `START-HERE.md` now includes a `Creative partner rule` section and an `Agent creative work` section.
- `NEST-WRITING-REVIEW.md`, `STUDIO-EDIT-REVIEW.md`, and `TOWER-PUBLICATION-REVIEW.md` now each include a `Creative partner and provenance` section tailored to that lens.
- The generated language makes the product boundary explicit: Codex/Quipslys may create serious first-pass work; the safety boundary is hidden mutation, lost provenance, silent canon change, or fake publication proof.

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- Ran `./script/agentctl.sh vertical-slice-prepare "$TMPDIR/quipsly-vertical-slice-creative-partner-proof" episode-1-creative-partner-handoff-proof`.
- Confirmed generated stable and run-specific Markdown contains:
  - `Creative partner rule`
  - `Agent creative work`
  - `Creative partner and provenance`
  - serious first-pass work language for Nest, Studio, and Tower.

Lesson:
- Doctrine belongs at the point of use. A policy file can be ignored; a generated handoff folder teaches the operator and the next agent how to carry the loop forward without downgrading agent-authored content to fake placeholder work.

## 2026-06-20 - Native Ship workbench exposes creative-operator doctrine

What changed:
- Added a `Creative operator rule` strip inside the native `Vertical slice review stack` card in `WorkspaceView.swift`.
- The live Episode Spine now tells operators that Codex and Quipslys may create serious first-pass writing, edits, shorts, captions, and release copy.
- The UI repeats the correct boundary: hidden mutation is the risk, not agent authorship.
- Added accessibility identifier `quipsly.vertical-slice.creative-operator-rule`.

Proof:
- `./script/build_and_run.sh --verify` passed for `apps/QuipslyStudio`.
- `./script/agentctl.sh left-workbench publish` opened the Ship workbench in the running app.
- `/state` reported `leftWorkbenchMode=publish`, Episode Spine status `ready-for-platform-posting`, and next action `Post or schedule the ready artifacts, then capture every platform URL/provider receipt.`
- Captured and visually inspected `/tmp/quipsly-creative-operator-ui-proof.png`; the Episode Spine panel, vertical-slice review stack, and `Creative operator rule` strip are visible in the real app.

Residual risk:
- The Ship workbench is still dense. The doctrine is visible and correct, but the later nature/zen Quipsly redesign should make this panel calmer and less cramped.

Lesson:
- Native UI and generated handoff folders now teach the same collaboration model. That reduces the chance that future agents or humans accidentally regress into either "AI never writes" or "AI writes with no trail."

## 2026-06-20 - Vertical-slice handoff now includes an agent creative first-pass packet

What changed:
- Updated `apps/QuipslyStudio/script/agentctl.sh` so `vertical-slice-prepare` generates:
  - stable `AGENT-CREATIVE-FIRST-PASS.md`
  - run-specific `AGENT-CREATIVE-FIRST-PASS-<basename>.md`
- The packet includes serious `agent-authored` / `agent-first-pass` material for the current loop:
  - Nest writing seeds
  - episode page intro seed
  - Studio edit notes
  - YouTube title options
  - YouTube description draft
  - Patreon/support post draft
  - social post seeds
  - receipt target reminder
- `START-HERE.md`, the manifest artifacts, and `vertical-slice-review` now point operators to the packet.

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- Ran `./script/agentctl.sh vertical-slice-prepare "$TMPDIR/quipsly-agent-first-pass-proof" episode-1-agent-first-pass-proof`.
- Confirmed `AGENT-CREATIVE-FIRST-PASS.md` exists.
- Confirmed `vertical-slice-review` prints the Agent creative first pass path.
- Confirmed `START-HERE.md` links the packet.
- Confirmed manifest artifacts include `agentCreativeFirstPass` and `latestAgentCreativeFirstPass`.
- Inspected the generated packet excerpt and confirmed it contains provenance, Nest writing seeds, Studio notes, Tower copy candidates, and receipt boundaries.

Residual risk:
- The packet is generated from coarse current state, not a deep transcript-aware writing pass yet.
- The next stronger version should pull selected transcript/book/source excerpts and short candidates into the generated drafts so the copy becomes more source-specific.

Lesson:
- Generated content needs provenance the way generated code needs tests. A serious first-pass draft is useful only if the team can see where it came from, what state it is in, and what must happen before it becomes canon or published.

## 2026-06-20 - Agent creative first-pass packet is now source-aware

What changed:
- Updated `apps/QuipslyStudio/script/agentctl.sh` so `AGENT-CREATIVE-FIRST-PASS.md` pulls live context from current app state.
- The packet now includes:
  - current Nest writing readiness counts
  - selected Nest draft with authorship, review status, provenance, and preview text
  - source/context snippets used
  - authored draft snippets in play
  - short candidates from the current queue with ranges, durations, destinations, review status, captions, and expected export basenames
  - current Tower next receipt target
- This makes the generated first-pass packet anchored in the actual Episode 1 spine instead of being generic release copy.

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- Extracted and compiled the embedded `vertical_slice_prepare` Python body after fixing a missing closing parenthesis in the generated packet list construction.
- Ran `./script/agentctl.sh vertical-slice-prepare "$TMPDIR/quipsly-source-aware-first-pass-proof" episode-1-source-aware-first-pass-proof`.
- Confirmed `AGENT-CREATIVE-FIRST-PASS.md` contains:
  - `Current state anchors`
  - `Current selected Nest draft`
  - `Source/context snippets used`
  - `Authored draft snippets in play`
  - `Short candidates from current queue`
  - real Episode 1 material such as `Episode 1 - The Wednesday Rule`, the selected Charlie first-pass reflection, and the `Farm Work Teaches Stewardship` short candidate.

Residual risk:
- The generated prose is still mostly template-written around state snippets. It is source-aware, but not yet deeply transcript/book-excerpt-authored.
- The next stronger version should use richer transcript passages, contact-sheet summaries, and selected book excerpts to generate more specific episode-page copy, short hooks, and platform descriptions.

Lesson:
- Source-aware drafting is the product promise in miniature. The agent does not need to wait for a human to create every artifact, but its work becomes much more trustworthy when it carries the exact source snippets, short ranges, review states, and receipt boundaries that shaped it.

## 2026-06-20 - Agent creative packet now drafts platform copy for real short candidates

What changed:
- Updated `apps/QuipslyStudio/script/agentctl.sh` so `AGENT-CREATIVE-FIRST-PASS.md` includes a `Short platform copy first pass` section.
- For the first current short candidates, the packet now generates:
  - source range
  - review status
  - hook idea
  - YouTube Shorts title
  - YouTube Shorts caption
  - Instagram caption
  - Facebook caption
  - LinkedIn caption
  - receipt boundary
- Hashtag/copy choices are derived from each short title and caption seed, while still carrying the Tower receipt rule.

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- Extracted and compiled the embedded `vertical_slice_prepare` Python body.
- Ran `./script/agentctl.sh vertical-slice-prepare "$TMPDIR/quipsly-short-platform-copy-proof" episode-1-short-platform-copy-proof`.
- Confirmed generated `AGENT-CREATIVE-FIRST-PASS.md` includes `Short platform copy first pass`.
- Confirmed real Episode 1 short candidates such as `Farm Work Teaches Stewardship`, `Learning Why, Not Just What`, `Mutual Mentorship`, `Record From Anywhere`, and `Parkinson's Awareness Goal` have platform-specific caption drafts.
- Inspected the generated excerpt and confirmed every short copy block includes a receipt boundary.

Residual risk:
- The packet currently drafts copy for the first six queue items, including a `Test Short`/`refine` item. That is honest state, but a later Tower pass should distinguish `ready-for-human-review`, `keep`, `refine`, and `test` candidates more strongly so draft copy does not imply publish readiness.
- Captions are still template-assisted from rough caption seeds. Stronger copy should use transcript excerpts, contact-sheet summaries, and human/agent review notes.

Lesson:
- Tower needs destination-shaped drafts, not just assets. A short recipe becomes much less scary when the handoff already includes platform-specific copy and an explicit receipt boundary.

## 2026-06-20 - Short platform copy is now grouped by Tower readiness

What changed:
- Updated `apps/QuipslyStudio/script/agentctl.sh` so the `Short platform copy first pass` section groups short candidates by readiness instead of presenting every visible item as equally publishable.
- Groups now include:
  - `Ready / human-review candidates`
  - `Needs refinement before posting`
  - `Test or proof-only candidates`
  - `Other draft candidates`
- Each short copy block now includes a `Tower readiness` line in addition to source range, review status, platform copy, and receipt boundary.
- Test/proof-only candidates remain visible but explicitly say not to treat them as publish candidates unless deliberately promoted.

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- Extracted and compiled the embedded `vertical_slice_prepare` Python body.
- Ran `./script/agentctl.sh vertical-slice-prepare "$TMPDIR/quipsly-short-status-grouping-proof" episode-1-short-status-grouping-proof`.
- Confirmed generated `AGENT-CREATIVE-FIRST-PASS.md` contains:
  - `Ready / human-review candidates`
  - `Needs refinement before posting`
  - `Test or proof-only candidates`
  - `Tower readiness`
- Inspected the generated packet and confirmed ready items appear first, refine items are marked as needing refinement, and `Test Short - Wednesday Rule moment` is quarantined as proof-only while still visible.

Residual risk:
- Status mapping is intentionally simple and string-based. A later schema pass should make short publication readiness a first-class enum instead of inferred text.
- The copy itself remains first-pass and should be improved with richer transcript/contact-sheet context.

Lesson:
- Tower should make work available without accidentally endorsing it. Visibility reduces anxiety; readiness language prevents accidental publishing theater.

## 2026-06-20 - Shorts platform copy now has a dedicated Tower handoff file

What changed:
- Updated `apps/QuipslyStudio/script/agentctl.sh` so `vertical-slice-prepare` generates:
  - stable `SHORTS-PLATFORM-COPY.md`
  - run-specific `SHORTS-PLATFORM-COPY-<basename>.md`
- `START-HERE.md`, the manifest artifacts, and `vertical-slice-review` now point to the focused shorts copy handoff.
- The file includes:
  - readiness summary counts
  - operator rule
  - status language
  - grouped platform copy for ready/refine/test/other short candidates
  - provenance and receipt boundaries

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- Extracted and compiled the embedded `vertical_slice_prepare` Python body.
- Ran `./script/agentctl.sh vertical-slice-prepare "$TMPDIR/quipsly-shorts-platform-copy-file-proof" episode-1-shorts-platform-copy-file-proof`.
- Confirmed `SHORTS-PLATFORM-COPY.md` exists.
- Confirmed `vertical-slice-review` prints the Shorts platform copy path.
- Confirmed manifest artifacts include `shortsPlatformCopy` and `latestShortsPlatformCopy`.
- Inspected the generated file; it shows 3 ready/human-review candidates, 4 refine candidates, 1 test/proof-only candidate, and grouped platform copy with receipt boundaries.

Residual risk:
- This is still a Markdown handoff. The next product upgrade should surface the same focused shorts-copy view inside the native Ship/Tower workbench.
- Copy is still first-pass and should later be informed by transcript snippets, contact sheets, and platform-specific length/style rules.

Lesson:
- Focused handoff files are useful product discovery. If a Markdown packet proves the operator shape, promote it into native UI and durable data instead of trying to design the perfect Tower panel in the abstract.

## 2026-06-20 - Native Ship workbench now surfaces Shorts Platform Copy

What changed:
- Promoted the proven `SHORTS-PLATFORM-COPY.md` handoff shape into the native Ship/Tower workbench in `apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift`.
- Added a `Shorts Platform Copy` panel near the top of the Ship sidebar so short candidates are visible before deeper delivery matrices and receipt tooling.
- The panel groups short recipes by operator readiness:
  - `Ready / human-review candidates`
  - `Needs refinement before posting`
  - `Test or proof-only candidates`
  - `Other draft candidates`
- Each visible short card shows sequence range, review status, Tower readiness language, hook/caption seed, and platform copy previews for YouTube Shorts, Instagram, Facebook, and LinkedIn.
- Kept publication truth explicit: the panel prepares copy and review context, but publication is true only when platform receipts or provider IDs are captured.

Proof:
- Ran `./script/build_and_run.sh --verify` twice after the SwiftUI changes; both passed with existing warning debt only.
- Drove the app into the visible Ship workbench and captured `/tmp/quipsly-native-shorts-platform-copy-proof-3.png`.
- Confirmed the native panel appears in the Ship sidebar with ready/refine/test counts and platform copy previews.
- Confirmed agent state still reports `shortClipCount: 12` and `shortTruth: Cuts are output recipes over sequence time, not chopped media files.`

Residual risk:
- Readiness buckets are still inferred from text statuses. Promote publication readiness to a first-class enum when the short review workflow settles.
- The panel is intentionally read-only/operator-facing. Later passes should add safe selection/review/export actions without hiding receipt boundaries.
- Ship sidebar density is high; this panel is now visible, but the whole Tower workbench still needs a calmer information architecture pass.

Lesson:
- Promote proven artifacts into the UI only after the handoff shape works. The Markdown packet proved the operator model; the native panel makes it usable without turning handoff truth into another hidden folder ritual.

## 2026-06-20 - Ship shorts readiness is typed and more agent-addressable

What changed:
- Added a native `ShortPublicationReadinessBucket` model in `apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift` so Ship/Tower shorts readiness is no longer passed around as ad hoc string comparisons inside the panel.
- Rewired the native `Shorts Platform Copy` panel to use typed buckets for `ready`, `refine`, `test`, and `other` groups.
- Added safe per-short operator actions inside Ship cards:
  - `Review in Shorts` selects the short recipe and routes toward the Shorts workbench.
  - `Cue` selects the short and cues the shared playhead without publishing or mutating source media.
- Added stable accessibility identifiers for those buttons so future Agent Test Driver and UI automation can target them directly instead of relying on brittle screen coordinates.

Proof:
- Ran `./script/build_and_run.sh --verify`; build passed after fixing one Swift opaque-return helper that needed an explicit `return`.
- Captured `/tmp/quipsly-typed-short-readiness-proof.png` showing the Ship panel with readiness counts, grouped copy, and the new action buttons.
- Agent state confirms `shortClipCount: 12` and preserves the critical truth: `Cuts are output recipes over sequence time, not chopped media files.`

Honest caveat:
- A manual `cliclick` attempt did not give a clean proof that the `Review in Shorts` button visibly switched workbenches; it may have hit the nearby cue path instead. The button compiles and now has a stable accessibility identifier, but this still needs a sharper UI-driver proof or direct accessibility-tree driver.

Residual risk:
- The typed bucket is currently a native UI model, not yet persisted in session JSON. That is intentional until the short publication workflow stabilizes, but the durable model should eventually move closer to `ShortClipCandidate` or a publication-readiness record.
- Ship is still dense. This pass made the panel clearer and more actionable, but Tower needs a broader UX simplification pass after the vertical slice proves the next publication loop.

Lesson:
- Agent-friendly UI needs named handles, not pixel coordinates. If Codex is a real production operator, every important action should be discoverable, addressable, and reversible without pretending a screenshot click is the same as a product contract.

## 2026-06-20 - Ship short actions now have deterministic agent commands

What changed:
- Added `ship-short-review` and `ship-short-cue` to `apps/QuipslyStudio/script/agentctl.sh`.
- These commands compose the existing internal app endpoints for short selection, Shorts workbench routing, and short preview cueing.
- This gives Codex and future agent drivers a stable command path for the same operator actions exposed in the native Ship/Tower short cards, without relying on brittle pixel clicking.

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- `script/agentctl.sh help` now advertises `ship-short-review id|title|index` and `ship-short-cue id|title|index`.
- Ran both commands against the running app using short `FC28A75E-451B-4D74-9636-2E842805F106`.
- App state after `ship-short-review` showed `leftWorkbenchMode: shorts`, selected short `Test Short - Wednesday Rule moment`, and playhead `0`.
- App state after `ship-short-cue` showed `leftWorkbenchMode: shorts`, selected short `Test Short - Wednesday Rule moment`, and `lastMediaAction: Cued short recipe at 0.00s: Test Short - Wednesday Rule moment`.

Lesson:
- If an agent needs to operate a production workflow, expose a named command that shares the product action path. Pixel clicks are useful for visual smoke, but durable agent collaboration needs semantic controls.

## 2026-06-20 - Ship Map and Mission Control now have a read-only smoke gate

What changed:
- Added `script/agentctl.sh ship-map-smoke` in `apps/QuipslyStudio/script/agentctl.sh`.
- The command compares `/state` Tower handoff truth with the direct `/publication_mission_control` endpoint.
- It checks mission status, ready lane count, lane count, publication completion, missing receipt count, state/direct mission summary agreement, and required deliverable coverage.
- This is a semantic Tower consistency check, not a UI screenshot or pixel assertion.

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- `script/agentctl.sh help` lists `ship-map-smoke`.
- `script/agentctl.sh ship-map-smoke` returned `ok: true`.
- Current Tower truth: status `ready-for-platform-posting`, `readyLaneCount: 3`, `laneCount: 3`, `publicationComplete: false`, `missingReceiptCount: 52`, and 4 mission deliverables.

Lesson:
- Tower is allowed to say artifacts are ready, but it must keep receipt truth separate. A release system becomes trustworthy when every cockpit panel can be reconciled against one read-only mission model.

## 2026-06-20 - Vertical-slice handoffs now carry Ship Map smoke proof

What changed:
- `script/agentctl.sh vertical-slice-prepare` now runs `ship-map-smoke` as part of every Nest -> Studio -> Tower handoff.
- The generated proof folder now includes `*-08-ship-map-smoke.json` between publication mission control and vertical-slice packet readback.
- The manifest records `shipMapSmokeOk` and `shipMapSmokeStatus`.
- `START-HERE.md` now shows the Ship Map consistency smoke result.
- `script/agentctl.sh vertical-slice-review` now prints `shipMapSmoke` and lists the smoke artifact with the core proof files.

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- Ran `script/agentctl.sh vertical-slice-prepare /tmp/quipsly-vslice-ship-smoke-proof episode-1-ship-smoke-proof`.
- Ran `script/agentctl.sh vertical-slice-review /tmp/quipsly-vslice-ship-smoke-proof`.
- Readback confirmed manifest status `ready-for-platform-posting`, `shipMapSmokeOk: true`, smoke artifact exists, smoke model `quipsly-ship-map-smoke`, START-HERE mentions the smoke, and review output mentions `shipMapSmoke: True`.

Lesson:
- Cross-lens proof belongs in the handoff, not in a separate memory of what Codex happened to test. If Nest, Studio, and Tower are one product loop, every vertical-slice packet should carry the consistency checks that make the loop trustworthy.

## 2026-06-20 - Vertical-slice handoff gets a full read-only smoke command

What changed:
- Added `script/agentctl.sh vertical-slice-smoke [/proof-folder-or-manifest.json]`.
- The smoke reads a generated vertical-slice manifest and verifies the handoff folder itself, not just the live app.
- It checks required artifacts, Ship Map smoke, Nest writing packet readiness, vertical-slice packet readiness, Tower status, publication receipt boundary, mission deliverables, creative-partner truth, and JSON readability.

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- `script/agentctl.sh help` lists `vertical-slice-smoke`.
- Ran `script/agentctl.sh vertical-slice-smoke /tmp/quipsly-vslice-ship-smoke-proof`.
- Result: `ok: true`, status `ready-for-platform-posting`, Nest writing `ready-with-writing-packet`, `shipMapSmokeOk: true`, `publicationComplete: false`, 22 checks, 0 failed checks.

Lesson:
- Handoff quality should be testable after the fact. A future agent, Mako, Homer, or Charlie should be able to pick up a folder and run one command that says whether the packet carries the shared truth it claims to carry.

## 2026-06-20 - Nest writing/capture gets a live smoke command

What changed:
- Added `script/agentctl.sh nest-writing-smoke`.
- The smoke checks the live Nest writing layer for a writing document, loaded documents, blocks, authored work, visible review state, next review action queue, source/context availability, selected document/block visibility, semantic command surfaces, and generated writing packet truth.
- Strengthened `script/agentctl.sh vertical-slice-smoke` so generated handoff folders also prove captured Nest writing/capture state in `afterState`.
- Corrected the smoke contract to recognize the product's actual command surfaces: HTTP endpoints in `nest.agentCommands`, shell helper commands in `writingReadiness.commands`, and concrete review actions in `writingReadiness.nextActionQueue`.

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- `script/agentctl.sh nest-writing-smoke` returned `ok: true` with writing status `drafting-needs-review`, 2 documents, 43 blocks, 6 authored blocks, 4 authored blocks needing review, generated packet state, and 15 passing checks.
- `script/agentctl.sh vertical-slice-smoke /tmp/quipsly-vslice-ship-smoke-proof` returned `ok: true`, status `ready-for-platform-posting`, Nest writing `ready-with-writing-packet`, `shipMapSmokeOk: true`, `publicationComplete: false`, and 31 passing checks.

Lesson:
- Smoke tests should follow the product contract, not Codex's favorite wrapper names. The important truth is that Nest exposes safe semantic actions and next review steps; whether those appear as shell aliases or HTTP endpoints is an implementation detail.

## 2026-06-20 - Creative partner doctrine promoted to core product map

What changed:
- Strengthened `docs/quipsly/nest-studio-tower-product-map.md` with a Creative Partner Rule.
- Reinforced `docs/quipsly/live-nests-real-work.md` so agents are treated as creative operators, not only test-data generators.
- The policy now explicitly says Codex and Quipslys may create serious first-pass book sections, episode notes, article drafts, storyboard beats, captions, publishing packets, and edit decisions when that helps prove the full Nest -> Studio -> Tower loop.

Product truth:
- Quipsly's anti-black-box posture is not a ban on AI writing.
- The safeguard is visible authorship, provenance, intent, review state, canon/publication state, and reversibility.
- Agent-authored work is not automatically placeholder work. It can be disposable test material, serious reviewable work, or publication-support material depending on how it is labeled and carried through the workflow.

Lesson:
- A creative operating system cannot bottleneck itself by waiting for humans to supply every usable input. If agents are part of the production team, the product must let them create real work and preserve the receipts that make collaboration honest.

## 2026-06-20 - Studio edit smoke joins the vertical-slice proof folder

What changed:
- Added `script/agentctl.sh studio-edit-smoke` to `apps/QuipslyStudio/script/agentctl.sh`.
- The smoke reconciles `/state`, `/editor_snapshot`, `/delivery_readiness`, and `/shorts_queue` into one read-only Studio proof.
- `vertical-slice-prepare` now writes `*-09-studio-edit-smoke.json` and stores `studioEditSmokeOk` / `studioEditSmokeStatus` in the manifest.
- `vertical-slice-smoke` now requires the Studio edit smoke artifact and verifies it passed.

What it proves:
- The loaded Studio session is edit-ready.
- The editor still uses whole source lanes plus metadata decisions, not chopped source clips.
- Proxy-first preview is ready and raw originals remain protected.
- Source monitors and source players are synced to the shared sequence playhead.
- SHOW/SKIP decisions exist as visible edit metadata.
- Shorts are sequence-time recipes, not chopped media files.
- Agent-facing capabilities exist for monitor scrubbing, Play Edit/Play Through, visual-decision editing, source-window switching, timeline precision, and publish workbench handoff.

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- `script/agentctl.sh studio-edit-smoke` returned `ok: true`, `status: production_ready`, `sequenceTitle: Episode 1 Premiere Rescue`, 5 lanes, 3 video lanes, 2 audio lanes, 3 video proxies ready, 0 proxy-blocked lanes, 3 synced source players, 232 SHOW decisions, 122 SKIP decisions, 12 short recipes, 14 agent capabilities, and 15 passing checks.
- Fresh handoff generated at `/tmp/quipsly-vslice-studio-smoke-proof`.
- `script/agentctl.sh vertical-slice-smoke /tmp/quipsly-vslice-studio-smoke-proof` returned `ok: true`, `shipMapSmokeOk: true`, `studioEditSmokeOk: true`, 33 checks, and 0 failed checks.

Lesson:
- Studio proof belongs in the portable handoff, not only in live UI memory. If Nest, Studio, and Tower are one loop, the folder we hand to a human or future agent must prove the editor still obeys the source-lane, proxy-first, decision-overlay architecture before anyone trusts the publishing packet.

## 2026-06-20 - Delivery artifact smoke proves export truth without pretending publication

What changed:
- Added `script/agentctl.sh delivery-artifact-smoke` in `apps/QuipslyStudio/script/agentctl.sh`.
- The smoke reconciles `/state`, `/delivery_packet`, `/publication_ready_handoff`, `/publish_packet`, and `/podcast_packet`.
- `vertical-slice-prepare` now writes `*-10-delivery-artifact-smoke.json` and records `deliveryArtifactSmokeOk` / `deliveryArtifactSmokeStatus` in the manifest.
- `vertical-slice-smoke` now requires and verifies the delivery artifact smoke artifact.

What it proves:
- The 16:9 episode master, 9:16 vertical master, social shorts, and podcast audio artifact families are visible.
- Artifact family rows have explicit next actions and honest statuses such as `export-needed`.
- Render foundation and visual rough cut readiness are true.
- Direct platform publishing remains false until integrations and receipts exist.
- Publication remains receipt-bound: current proof reported `publicationComplete: false` and `receiptRemainingCount: 52`.
- A selected short has an exported proof derivative and preserves the recipe-over-source-lanes contract.
- Publish and podcast packet surfaces are discoverable, including receipt capture commands.
- Destination matrix includes the core targets: YouTube, Patreon, YouTube Shorts, Instagram, Facebook, LinkedIn, Spotify, and Apple Podcasts.

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- `script/agentctl.sh delivery-artifact-smoke` returned `ok: true`, `status: truthful-artifacts-ready-to-prepare`, `renderFoundationReady: true`, `readyForDirectPublishing: false`, `publicationComplete: false`, `receiptRemainingCount: 52`, four artifact families with `export-needed` statuses, and 14 passing checks.
- Fresh handoff generated at `/tmp/quipsly-vslice-delivery-smoke-proof`.
- `script/agentctl.sh vertical-slice-smoke /tmp/quipsly-vslice-delivery-smoke-proof` returned `ok: true`, `shipMapSmokeOk: true`, `studioEditSmokeOk: true`, `deliveryArtifactSmokeOk: true`, 35 checks, and 0 failed checks.

Lesson:
- Export readiness and publication proof are different jobs. Quipsly should be allowed to say `these outputs are ready to prepare/export`, but it must not imply `this is published` until destination receipts exist. This smoke keeps that boundary machine-checkable inside the handoff folder.

## 2026-06-20 - Release export prepare creates a verifiable local artifact folder

What changed:
- Added `script/agentctl.sh release-export-prepare [/output/folder] [basename] [proof-seconds|full] [wait-seconds]`.
- Added `script/agentctl.sh release-export-smoke [/proof-folder-or-manifest.json]`.
- The prepare command orchestrates the existing release export engine, waits for completion, refreshes delivery/publish/podcast packet surfaces, writes a manifest, and writes a `START-HERE` file.
- The smoke command reads the manifest later and verifies local derivative files, artifact families, packet paths, and the receipt boundary.

What it exports/proves:
- 16:9 episode master derivative.
- 9:16 vertical master derivative.
- 9:16 social short derivatives.
- Podcast audio derivative.
- Delivery, publish, and podcast packet surfaces.
- Publication is still not complete until receipts are captured.

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- Ran `script/agentctl.sh release-export-prepare /tmp/quipsly-release-command-proof2 episode1-command-proof2 2 90`.
- Ran `script/agentctl.sh release-export-smoke /tmp/quipsly-release-command-proof2`.
- Result: `ok: true`, export status `completed`, 15/15 artifacts ready, 0 missing artifacts, all known files existed, output kinds included `episode-master`, `vertical-master`, `social-short`, and `podcast-audio`.
- Packet paths were discovered for delivery, publish, and podcast packets.
- Receipt truth remained intact: `publicationComplete: false`, `receiptRemainingCount: 52`.

Lesson:
- This is the right operator shape for Tower: prepare local artifacts, prove they exist, refresh packet surfaces, and keep publication receipts separate. The app can now move from edit truth to release-folder truth without touching originals or pretending platform posting happened.
## 2026-06-20 - Agent authorship is core Quipsly doctrine

Added the full creative partner stance to the first-read runway and gospel register.

Why it matters:

- Quipsly rejects hidden black-box mutation, not AI authorship.
- Codex and other Quipslys must be allowed to create real first-pass content when the product loop needs material.
- Agent work may be serious, reviewable, and eventually publishable; it is not placeholder by default.
- The guardrails are provenance, authorship labels, review state, canon boundaries, publication receipts, and reversibility.

This keeps future agents from bottlenecking Nest, Studio, or Tower while waiting for humans to supply every paragraph, caption, storyboard beat, or publishing packet.

## 2026-06-20 - Vertical slice now carries a release-export handoff

Intent:
- Keep the Nest -> Studio -> Tower proof folder lightweight while making the next release-artifact step obvious.

Changed:
- Added `releaseExport` metadata to `vertical-slice-prepare` manifests.
- Added exact `release-export-prepare` and `release-export-smoke` commands to generated START-HERE handoffs.
- Added the release-export command summary to `vertical-slice-review`.
- Added a smoke check that the release-export path is visible but intentionally not auto-run.

Proof:
- Not run in this pass. This was a command/document handoff edit only; the next pass should run `vertical-slice-prepare` and `vertical-slice-smoke` when validation is desired.

Residual risk:
- Existing older vertical-slice manifests do not contain `releaseExport`, so this improvement appears after the next prepared handoff.
- Release export still creates local derivative files and should remain deliberate rather than part of every normal smoke.

Next move:
- Build the Tower receipt operator path around release-export manifests: review artifacts, choose destinations, capture external URLs/provider IDs, and distinguish scheduled/published/proved states without pretending integration work is complete.

## 2026-06-20 - Release export review bridges files to receipt work

Intent:
- Make exported local artifacts easier to review and publish without collapsing "file exists" into "published."

Changed:
- Added `script/agentctl.sh release-export-review [/proof-folder-or-manifest.json] [--json]`.
- The command reads a release-export manifest and writes:
  - `RELEASE-EXPORT-REVIEW-<basename>.md`
  - `RELEASE-EXPORT-REVIEW.md`
  - `<basename>-release-export-review.json`
  - `latest-release-export-review.json`
- The review groups artifacts into 16:9 episode master, 9:16 vertical master, 9:16 social shorts, and podcast audio.
- It lists destination families and receipt command templates without uploading, scheduling, publishing, mutating source media, or inventing receipts.
- Release-export START-HERE docs now point to the review command after the smoke command.

Proof:
- Not run in this pass. This was a command/document handoff edit; run the command against a current release-export folder when operator review is desired.

Residual risk:
- The receipt command templates are intentionally generic until the Tower receipt ledger can bind exact destination IDs to each exported file.
- The review proves file/destination/readiness truth, not creative approval of the exported content.

Next move:
- Bind exported artifact records to destination-specific receipt IDs so the checklist can generate exact one-click/one-command capture actions per YouTube, Patreon, social, and podcast destination.

## 2026-06-20 - Release export review prefers packet-derived receipt commands

Intent:
- Move the Tower checklist from generic receipt advice toward exact operator actions whenever generated packets already contain receipt commands.

Changed:
- `release-export-review` now loads the generated delivery, publish, and podcast packet files when present.
- It recursively extracts receipt-capture / publish-receipt command strings from those packet payloads.
- Generated review JSON now includes `packetReceiptCommandCount` and `packetReceiptCommands`.
- Generated review Markdown now shows a `Packet-derived receipt commands` section before generic destination-family templates.

Proof:
- Not run in this pass. This was a script capability edit; run `release-export-review` against a current release-export folder when operator proof is desired.

Residual risk:
- Command extraction is intentionally text-based and conservative. It finds receipt commands already exposed by packets; it does not yet bind every exported file to a first-class receipt row.
- Generic templates remain as fallback until the Tower ledger exposes exact receipt IDs per artifact/destination.

Next move:
- Promote receipt rows to a first-class release manifest surface: artifact path -> destination -> receipt ID -> exact capture command -> proof status.

## 2026-06-20 - Receipt targets become first-class Tower rows

Intent:
- Give Tower a durable row-shaped unit for publication proof instead of vague destination prose.

Changed:
- `release-export-review` now creates `receiptTargets` in its JSON output.
- Each receipt target includes:
  - target ID,
  - status,
  - family/kind,
  - platform,
  - artifact path,
  - evidence needed,
  - suggested capture command,
  - truth boundary.
- The generated Markdown now includes a `Receipt targets` section before generic destination-family guidance.

Proof:
- Not run in this pass. The next operator proof should run `release-export-review` against a current export folder and inspect `latest-release-export-review.json`.

Residual risk:
- Receipt targets are generated from local artifacts and destination families, not yet persisted into the app's durable publication ledger.
- Social receipt commands still use placeholder receipt IDs until Tower binds generated social queue receipt IDs directly to exported short files.

Next move:
- Persist or import these receipt target rows into the Tower/publication ledger so each target can move from `needs-external-receipt` to `scheduled`, `posted`, or `proved`.

## 2026-06-20 - Local release receipt ledger packet

Intent:
- Give Tower a usable local receipt ledger before the durable database-backed publication ledger is finished.

Changed:
- Added `script/agentctl.sh release-receipt-ledger-prepare [/release-review-folder-or-json] [optional-basename]`.
- The command reads `latest-release-export-review.json` or an explicit review JSON.
- It writes:
  - `<basename>-receipt-ledger.json`
  - `latest-release-receipt-ledger.json`
  - `RELEASE-RECEIPT-LEDGER-<basename>.md`
  - `RELEASE-RECEIPT-LEDGER.md`
- Ledger rows include receipt target ID, platform, artifact path, evidence needed, capture command, and empty proof fields such as `publicUrl`, `providerId`, `scheduledAt`, `postedAt`, and `provedAt`.

Proof:
- Not run in this pass. Run it after `release-export-review` has generated a current review JSON.

Residual risk:
- This is still a local packet, not durable app/database persistence.
- It does not yet support updating row status from a command, filling evidence, or importing back into the live app.

Next move:
- Add a receipt-ledger update command that can mark a local row as `scheduled`, `posted`, or `proved` with evidence, then later wire that into the durable Tower ledger.

## 2026-06-20 - Local receipt ledger rows can move with evidence

Intent:
- Let Tower receipt rows progress through explicit statuses instead of forcing humans or agents to hand-edit JSON.

Changed:
- Added `script/agentctl.sh release-receipt-ledger-update [/ledger-folder-or-json] RECEIPT_TARGET_ID scheduled|posted|proved <url-or-proof> [provider-id] [notes]`.
- The command updates a single local ledger row with:
  - status,
  - proof/public URL,
  - provider ID,
  - notes,
  - scheduled/posted/proved timestamps,
  - per-row history.
- It recomputes scheduled, posted, proved, remaining, and publication-complete counts.
- It regenerates `RELEASE-RECEIPT-LEDGER.md` and `latest-release-receipt-ledger.json`.

Proof:
- Not run in this pass. Run after `release-receipt-ledger-prepare` creates a current local ledger.

Residual risk:
- This does not verify URLs, platform IDs, screenshots, or provider state automatically.
- This is still local packet truth, not durable app-owned publication persistence.

Next move:
- Add `release-receipt-ledger-smoke` to prove local ledger integrity, then create the durable Tower import/persistence path.

## 2026-06-20 - Local receipt ledger smoke

Intent:
- Make the local Tower receipt ledger provable before building durable persistence or provider verification around it.

Changed:
- Added `script/agentctl.sh release-receipt-ledger-smoke [/ledger-folder-or-json]`.
- The smoke checks:
  - packet type,
  - row presence,
  - receipt target count,
  - unique row IDs,
  - valid statuses,
  - artifact paths,
  - capture commands,
  - evidence on scheduled/posted/proved rows,
  - proved timestamps,
  - scheduled/posted/proved/remaining header counts,
  - publication-complete flag consistency,
  - source review path.

Proof:
- Not run in this pass. Run it after a current ledger is prepared or updated.

Residual risk:
- This validates local ledger integrity only. It does not verify public URLs, scheduled posts, provider IDs, screenshots, or remote platform state.

Next move:
- Build the durable Tower import/persistence path or add a provider/screenshot proof adapter for one destination.

## 2026-06-20 - Local screenshot/proof artifact bridge

Intent:
- Let Tower receipt rows carry real-world proof artifacts before provider API verification exists.

Changed:
- `release-receipt-ledger-update` now classifies the supplied proof value as:
  - `local-file` when the value is an existing local path,
  - `url` when it starts with `http://` or `https://`,
  - `manual-reference` otherwise.
- Local-file proof records now include:
  - `proofArtifactPath`,
  - `proofArtifactExists`,
  - `proofArtifactBytes`,
  - `proofEvidenceType`.
- Row history also records proof evidence type and proof artifact fields.
- `release-receipt-ledger-smoke` now fails if a row claims `local-file` evidence but the proof artifact no longer exists.

Proof:
- Not run in this pass. Run `release-receipt-ledger-update` with a local screenshot/file path, then run `release-receipt-ledger-smoke`.

Residual risk:
- This proves a local proof file exists; it does not verify screenshot content or provider truth.
- Future provider adapters should add stronger evidence grades without discarding local proof artifacts.

Next move:
- Add evidence-grade language to Tower review UI/packets: manual reference, screenshot/file proof, URL proof, provider API verified.

## 2026-06-20 - Evidence grades are explicit in local Tower ledgers

Intent:
- Make proof strength inspectable instead of treating every receipt note, URL, screenshot, and future provider API result as equivalent.

Changed:
- Receipt ledger rows now initialize with:
  - `proofEvidenceType: none`
  - `proofEvidenceGrade: none`
  - `proofEvidenceGradeLabel: No external proof captured yet`
- `release-receipt-ledger-update` now assigns:
  - `manual-reference` for typed/manual proof references,
  - `url` for external URLs,
  - `local-file` for existing local screenshot/receipt files.
- Row history records the evidence grade and label.
- Generated receipt ledger Markdown shows evidence type, grade, and label per row.
- `release-receipt-ledger-smoke` validates evidence grades and requires moved rows to have a non-`none` grade.

Proof:
- Not run in this pass. Run against a prepared local ledger when the next Tower proof folder is selected.

Residual risk:
- `provider-verified` is reserved in the smoke vocabulary but no provider adapter sets it yet.
- Evidence grades make proof strength visible; they do not verify the content of screenshots or URLs.

Next move:
- Add a provider/screenshot proof adapter for one destination, or wire local receipt ledgers into durable Tower persistence.

## 2026-06-20 - Human-readable evidence ladder in Tower ledger packets

Intent:
- Make proof strength understandable in the generated Markdown, not only in JSON fields.

Changed:
- `RELEASE-RECEIPT-LEDGER.md` now includes an evidence-grade guide:
  - `none`,
  - `manual-reference`,
  - `url`,
  - `local-file`,
  - `provider-verified`.
- Local receipt ledgers now maintain `evidenceGradeCounts`.
- `release-receipt-ledger-update` recomputes evidence-grade counts after every row update.
- `release-receipt-ledger-smoke` verifies evidence-grade counts match row truth.

Proof:
- Not run in this pass. Run after preparing or updating a local receipt ledger.

Residual risk:
- This improves local packet clarity but does not create provider verification.
- Future UI still needs to render these grades visually instead of relying on Markdown.

Next move:
- Surface evidence-grade counts in the Tower/publication UI, or build the durable Tower import path for the local receipt ledger.

## 2026-06-20 - Release packets now link the local receipt workflow

Intent:
- Make the Tower operator path discoverable from generated release packets instead of relying on memory or chat history.

Changed:
- Release export START-HERE docs now include the next local receipt commands after export smoke and review:
  - `release-receipt-ledger-prepare`
  - `release-receipt-ledger-smoke`
- `release-export-review` JSON now includes:
  - `receiptLedgerPrepareCommand`
  - `receiptLedgerSmokeCommand`
  - `receiptLedgerUpdateCommandTemplate`
- `RELEASE-EXPORT-REVIEW.md` now includes a `Local receipt ledger next steps` section with exact commands.

Proof:
- Not run in this pass. The next generated release-export folder will include the updated command trail.

Residual risk:
- Existing older release folders will not have these hints until regenerated or reviewed again.
- This is still local packet workflow, not durable Tower persistence.

Next move:
- Generate a fresh Episode 1 release folder and run the full local Tower chain end to end when validation/export time is intentionally chosen.

## 2026-06-20 - Combined local Tower prepare command

Intent:
- Give operators one safe command for the normal post-export Tower prep path while preserving granular commands for inspection.

Changed:
- Added `script/agentctl.sh release-tower-local-prepare [/release-export-folder] [optional-basename]`.
- The command runs:
  - `release-export-review`,
  - `release-receipt-ledger-prepare`,
  - `release-receipt-ledger-smoke`.
- It writes:
  - `<basename>-20-release-export-review-command.json`,
  - `<basename>-21-release-receipt-ledger-prepare-command.json`,
  - `<basename>-22-release-receipt-ledger-smoke-command.json`,
  - `<basename>-tower-local-prepare-summary.json`,
  - `latest-tower-local-prepare-summary.json`.

Proof:
- Not run in this pass. Run against a current release-export folder after local export artifacts exist.

Residual risk:
- This command assumes a release-export manifest already exists. It does not export media.
- It does not capture receipts or verify provider state.

Next move:
- Run the full Episode 1 local Tower chain on a deliberate export folder, then review the generated Markdown packets as the first true operator proof.

## 2026-06-20 - Agent creative partner doctrine reinforced

Intent:
- Prevent future Quipsly/Nest/Studio/Tower work from regressing into "AI only makes placeholders" or "AI may not write" thinking.

Changed:
- Reinforced `docs/coordination/quipsly-care-ethic.md` so agent-created writing, packets, captions, notes, and articles can be serious first-pass work when provenance and review state stay visible.
- Reinforced `docs/coordination/quipsly-app-surface-doctrine.md` so writing/study and publishing surfaces explicitly support human-authored, agent-authored, and mixed-authorship material.
- Existing drafting doctrine already covers the detailed rule: Quipslys may draft boldly; the forbidden behavior is hidden mutation, fake provenance, silent canon changes, or receipt-less publication truth.

Proof:
- Documentation-only pass. No build or app validation was run.

Residual risk:
- UI/data models still need to keep authorship, provenance, review state, canon state, and publication state visible everywhere serious agent-created content flows.

Next move:
- When implementing Nest writing, Studio editing, Tower publishing, or assistant ledgers, use `agent-authored`, `agent-first-pass`, `mixed-authorship`, `human-reviewed`, `canon-approved`, and `publication-ready` as first-class states instead of treating generated content as generic placeholder text.

## 2026-06-20 - Tower packets carry creative-partner policy

Intent:
- Keep the Tower/local publication-prep path aligned with Quipsly's corrected AI drafting stance.

Changed:
- `release-export-review` now writes a `creativePartnerPolicy` into the JSON review packet.
- `RELEASE-EXPORT-REVIEW.md` now includes a creative partner/provenance rule.
- `release-receipt-ledger-prepare` carries that policy forward into the local receipt ledger.
- Receipt rows now clarify that destination publication proof does not require human-only authorship; upstream provenance/review state remains the safeguard.
- `release-tower-local-prepare` includes the policy in its combined local summary.

Proof:
- Not run in this pass. Regenerate release review/ledger packets after the next deliberate Episode 1 export.

Residual risk:
- Existing local Tower folders will not gain the new policy fields until regenerated.
- Durable Tower persistence still needs to import the same policy shape instead of only keeping it in local packets.

Next move:
- Carry the same authorship/provenance status into the durable Tower UI so platform copy can be `agent-first-pass`, `human-reviewed`, `scheduled`, `posted`, and `receipt-proved` without collapsing those states.

## 2026-06-20 - Tower local prep gets a START-HERE note

Intent:
- Make the combined local Tower prep command operator-friendly, not only JSON-friendly.

Changed:
- `release-tower-local-prepare` now writes:
  - `START-HERE-TOWER-LOCAL-PREP-<basename>.md`
  - `START-HERE-TOWER-LOCAL-PREP.md`
- The note points to the release review, receipt ledger, JSON summary, next actions, creative-partner policy, and receipt boundary.

Proof:
- Not run in this pass. The next `release-tower-local-prepare` run will generate the Markdown note.

Residual risk:
- Existing local prep folders will not have this note until the command is rerun.

Next move:
- Run the deliberate Episode 1 local release/Tower packet chain when export validation is intentionally chosen, then use the START-HERE note as the operator proof surface.

## 2026-06-20 - Tower receipt ledger gets a next-action command

Intent:
- Reduce Tower publication anxiety by turning a local receipt ledger into one obvious next action.

Changed:
- Added `script/agentctl.sh release-receipt-ledger-next [/ledger-folder-or-json]`.
- The command reads `latest-release-receipt-ledger.json` or an explicit ledger JSON path.
- It selects the next unresolved receipt row by status/index priority.
- It writes:
  - `NEXT-RECEIPT-<basename>.md`
  - `NEXT-RECEIPT.md`
- The generated note shows the row ID, platform, artifact, evidence needed, destination-specific capture command when available, and generic local ledger update command.

Proof:
- Not run in this pass. Run after `release-receipt-ledger-prepare` creates a current local ledger.

Residual risk:
- This is still local Tower packet workflow, not durable Tower persistence.
- It does not verify provider state or mutate the ledger.

Next move:
- In the deliberate Episode 1 Tower proof pass, run `release-receipt-ledger-next` after local prep and use `NEXT-RECEIPT.md` as the operator action card.

## 2026-06-20 - Combined Tower prep now emits next receipt card

Intent:
- Make `release-tower-local-prepare` a complete local operator prep step instead of stopping at a ledger wall.

Changed:
- `release-tower-local-prepare` now runs `release-receipt-ledger-next` after ledger smoke.
- It writes `<basename>-23-release-receipt-ledger-next-command.json`.
- The combined summary now points to `NEXT-RECEIPT.md` and records the next receipt row ID.
- `START-HERE-TOWER-LOCAL-PREP.md` now tells the operator to open the next receipt card after the review and ledger.

Proof:
- Not run in this pass. The next deliberate Episode 1 local Tower chain should generate the next receipt card automatically.

Residual risk:
- This improves local operator flow only. Durable Tower UI still needs the same next-action concept.

Next move:
- Mirror this next-receipt concept in the Tower UI/receipt cockpit so humans and agents can work receipts without reading raw JSON or Markdown.

## 2026-06-20 - Live Tower receipt cockpit gets next-action cards

Intent:
- Bring the local `NEXT-RECEIPT.md` workflow into the live app/agent state so humans and Codex can work one receipt at a time without reading a full ledger.

Changed:
- `publicationReceiptCockpitPayload` now includes `nextReceiptActionCard`.
- The action card includes receipt ID, platform, lane, artifact readiness, copy readiness, capture command, generic command, operator steps, proof rule, authorship rule, and boundary truth.
- The Tower receipt cockpit UI now has a `Copy card` button beside `Capture receipt` and `Copy command` for the current next receipt.

Proof:
- Not run in this pass. Next app validation should open the receipt cockpit, confirm the new Copy card button appears for a ready receipt, and inspect `/publication_receipt_cockpit` for `nextReceiptActionCard`.

Residual risk:
- This is a live-state/UI bridge, not durable provider verification.
- The durable Tower persistence layer still needs to store these receipt-action concepts instead of only generating them from current sequence state.

Next move:
- During the Episode 1 proof pass, use the next-action card as the receipt operator surface and record friction before building provider-specific upload/schedule integrations.

## 2026-06-20 - Live next receipt gets a direct agent endpoint

Intent:
- Make the Tower receipt workflow directly operable by Codex and humans without digging through the full receipt cockpit payload.

Changed:
- Added `GET /publication_next_receipt` to the local AgentServer.
- Added `script/agentctl.sh publication-next-receipt` with aliases:
  - `next-publication-receipt`
  - `next-tower-receipt`
- The endpoint returns the current live `nextReceiptActionCard` when available.
- If no next card exists, it returns a small status payload explaining whether publication is complete, no state exists, or no card is available.

Proof:
- Not run in this pass. Next app validation should call `script/agentctl.sh publication-next-receipt` after QuipslyStudio has a loaded session with publication receipts.

Residual risk:
- This depends on live app state. It does not read local release folders or durable Tower persistence.
- It does not mutate receipts, upload, schedule, publish, or verify providers.

Next move:
- Use `publication-next-receipt` as the first command in the receipt operator loop: observe next card, post/schedule externally, capture receipt, re-observe.

## 2026-06-20 - Next receipt endpoint advertised in agent catalogs

Intent:
- Make the live Tower next-receipt endpoint discoverable through the app's own agent capability surfaces.

Changed:
- Added `GET /publication_next_receipt` to the AgentServer endpoint list.
- Updated the `publish-workbench` capability so agents observe `publicationReceiptCockpit.nextReceiptActionCard` and can act/prove with `GET /publication_next_receipt`.

Proof:
- Not run in this pass. Next app validation should inspect `/state` agent capability parity and call `script/agentctl.sh publication-next-receipt`.

Residual risk:
- Catalog discoverability does not prove runtime behavior until the app is rebuilt/launched and a receipt-bearing session is loaded.

Next move:
- Run a focused QuipslyStudio build/app smoke when we intentionally enter validation mode, then use the direct endpoint in the Episode 1 Tower receipt proof loop.

## 2026-06-20 - Next Tower receipt appears in safe agent actions

Intent:
- Make the next receipt operator loop discoverable from `/state.agentCurrentSafeActions`, not only from endpoint catalogs.

Changed:
- Added `review-next-tower-receipt` to safe agent actions.
- The action points to `GET /publication_next_receipt` and is read-only.
- The explanation clarifies that it returns a single receipt action card and does not upload, schedule, publish, or mutate proof state.

Proof:
- Not run in this pass. Next app validation should inspect `/state.agentCurrentSafeActions` for `review-next-tower-receipt`.

Residual risk:
- This improves agent discoverability only after the app is rebuilt/launched with the updated Swift source.

Next move:
- Use `/state.agentCurrentSafeActions` -> `GET /publication_next_receipt` as the Tower receipt operator pattern during the Episode 1 proof pass.

## 2026-06-20 - Release observe and vertical-slice prep carry next receipt state

Intent:
- Make Codex release packets carry the same live next-receipt action that Tower exposes in the app.

Changed:
- `codex-release-observe` now includes:
  - `publicationReceiptCockpit`
  - `publicationNextReceipt`
- `vertical-slice-prepare` now saves:
  - `<basename>-08-publication-receipt-cockpit.json`
  - `<basename>-09-publication-next-receipt.json`
- The vertical-slice manifest now includes receipt cockpit status, next receipt ID, and next receipt label.
- `START-HERE-<basename>.md` now lists receipt cockpit status, next receipt, and the receipt JSON artifact paths.

Proof:
- Not run in this pass. Next validation should run `codex-release-observe` against a live app session and inspect the new fields.

Residual risk:
- This depends on the running app having loaded publication receipt state.
- It still does not upload, schedule, publish, capture receipts, or verify providers.

Next move:
- Use the saved `publication-next-receipt.json` in the Episode 1 Tower proof loop so the release folder always names the smallest next external receipt action.

## 2026-06-20 - Live Tower receipt cards carry creative-partner provenance and Markdown

Intent:
- Make the next Tower receipt handoff self-contained for both humans and agents.
- Preserve the corrected Quipsly doctrine: Codex/Quipslys may create serious publishable work, but publication truth still requires visible provenance, review state, reversibility, and external receipt evidence.

Changed:
- `publicationReceiptCockpitPayload` now exposes a top-level `creativePartnerPolicy` object.
- `publicationReceiptNextActionCardPayload` now includes the same `creativePartnerPolicy` plus a ready-to-copy Markdown handoff in `markdown`.
- The existing `/publication_next_receipt` endpoint should now return that self-contained card whenever the live app has a next receipt row available.

Proof:
- Not run in this pass. Next validation should rebuild/relaunch QuipslyStudio, load the Episode 1 session, and call `script/agentctl.sh publication-next-receipt`.
- Expected proof field: the returned JSON should include `markdown` and `creativePartnerPolicy`.

Residual risk:
- This is a Swift source change and has not been compiled in this pass.
- The endpoint still depends on live app state; it will return `no_state_yet` until QuipslyStudio has loaded a session with publication receipt state.

Next move:
- Validate the live next-receipt endpoint, then use that card as the first operator step for the Episode 1 Tower posting/receipt loop.

## 2026-06-20 - Next Tower receipt has a Markdown CLI view

Intent:
- Let a human operator ask for the next Tower receipt action without reading raw JSON.
- Keep the same source of truth as `/publication_next_receipt`; this is only a display-format affordance.

Changed:
- Added `script/agentctl.sh publication-next-receipt-markdown`.
- Added aliases: `next-publication-receipt-markdown`, `next-tower-receipt-markdown`.
- The command reads `/publication_next_receipt` and prints its `markdown` field when available, falling back to pretty JSON if no Markdown is present.

Proof:
- Not run in this pass. Next validation should rebuild/relaunch QuipslyStudio, load Episode 1, then run both:
  - `script/agentctl.sh publication-next-receipt`
  - `script/agentctl.sh publication-next-receipt-markdown`

Residual risk:
- This depends on the Swift endpoint card including `markdown`, which has not been compiled in this pass.

Next move:
- Use the Markdown command as the human-facing receipt checklist while the JSON endpoint remains the agent/API contract.

## 2026-06-20 - Live next Tower receipt can be saved as a portable handoff

Intent:
- Turn the live `/publication_next_receipt` state into a small folder artifact that a human, Codex, Mako, or another agent can pick up without keeping the UI in their head.
- Keep the Tower proof loop receipt-based: prepared files are useful, but not publication proof.

Changed:
- Added `script/agentctl.sh publication-next-receipt-save [/absolute/output/folder] [optional-basename]`.
- Added aliases: `next-publication-receipt-save`, `next-tower-receipt-save`.
- The command writes:
  - `<basename>-publication-next-receipt.json`
  - `<basename>-publication-next-receipt.md`
  - `latest-publication-next-receipt.json`
  - `NEXT-RECEIPT-LIVE.md`
- The Markdown comes from the live action card when available, with a fallback raw-state handoff if the running app does not yet expose Markdown.

Proof:
- Not run in this pass. Next validation should rebuild/relaunch QuipslyStudio, load Episode 1, then run:
  - `script/agentctl.sh publication-next-receipt-save /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-next-receipt-live`

Residual risk:
- This command depends on the running app endpoint. If QuipslyStudio is not launched or has no loaded receipt state, it will save the honest no-state/no-card response rather than a real receipt action.
- Shell syntax has not been validated in this pass.

Next move:
- Use the saved `NEXT-RECEIPT-LIVE.md` as the first Tower operator card during the Episode 1 posting/receipt proof loop.

## 2026-06-20 - Next Tower receipt save command is agent-discoverable

Intent:
- Make the portable next-receipt handoff command visible from the app's safe agent action list, not just from operator memory.
- Keep the action honest: it writes a handoff artifact but does not upload, schedule, publish, verify providers, or mutate receipt truth.

Changed:
- Added `save-next-tower-receipt-handoff` to `agentCurrentSafeActions`.
- The action points agents to:
  - `script/agentctl.sh publication-next-receipt-save /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-next-receipt-live`
- Risk is labeled `disk-handoff`.

Proof:
- Not run in this pass. Next validation should rebuild/relaunch QuipslyStudio, load Episode 1, then inspect `/state.agentCurrentSafeActions` for `save-next-tower-receipt-handoff`.

Residual risk:
- This Swift source change has not been compiled in this pass.
- The command path currently defaults to the Episode 1 Tower folder because Episode 1 is the active vertical-slice proof target.

Next move:
- Validate the safe action list and run the save command once the live app has receipt state loaded.

## 2026-06-20 - Tower next-receipt commands are advertised from cockpit and capability state

Intent:
- Keep the Tower receipt operator loop discoverable from every agent-facing surface, not just shell help or memory.
- Reduce drift between `/publication_receipt_cockpit`, `/state` capabilities, safe actions, and `agentctl` commands.

Changed:
- `publicationReceiptCockpitPayload.commands` now includes:
  - `next`: `script/agentctl.sh publication-next-receipt`
  - `nextMarkdown`: `script/agentctl.sh publication-next-receipt-markdown`
  - `saveNextHandoff`: `script/agentctl.sh publication-next-receipt-save /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-next-receipt-live`
- The `publish-workbench` capability now advertises the Markdown and save handoff CLI commands in `act`.
- The `publish-workbench` capability now includes the save handoff command in `prove`.

Proof:
- Not run in this pass. Next validation should rebuild/relaunch QuipslyStudio, load Episode 1, and inspect:
  - `/publication_receipt_cockpit.commands`
  - `/state.agentCapabilityCatalog.publish-workbench` or equivalent capability list
  - `script/agentctl.sh publication-next-receipt-save /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-next-receipt-live`

Residual risk:
- Swift source has not been compiled in this pass.
- The save path is still Episode 1 specific because Episode 1 remains the active honest vertical-slice target.

Next move:
- Run a focused app validation pass when validation mode is appropriate, then use `NEXT-RECEIPT-LIVE.md` as the first Tower operator artifact for real posting/receipt capture.

## 2026-06-20 - One-loop next-action handoff command added

Intent:
- Keep Nest, Studio, and Tower connected as one vertical slice instead of separate product silos.
- Give a tired human or agent one portable "start here" artifact that names the next writing/capture action, next editing action, and next publishing/receipt action.

Changed:
- Added `script/agentctl.sh vertical-slice-next-save [/absolute/output/folder] [optional-basename]`.
- Added aliases: `one-loop-next-save`, `nest-studio-tower-next-save`.
- The command captures live app state from:
  - `/state`
  - `/episode_spine`
  - `/publication_next_receipt`
- It writes:
  - `<basename>-state.json`
  - `<basename>-episode-spine.json`
  - `<basename>-publication-next-receipt.json`
  - `<basename>-one-loop-next.json`
  - `<basename>-one-loop-next.md`
  - `latest-one-loop-next.json`
  - `START-HERE-ONE-LOOP-NEXT.md`
- The Markdown handoff includes:
  - Nest next action
  - Studio next action
  - Tower next receipt/action
  - receipt capture command when available
  - focused Tower receipt save command
  - creative-partner and publication-proof boundaries

Proof:
- Not run in this pass. Next validation should rebuild/relaunch QuipslyStudio, load Episode 1, then run:
  - `script/agentctl.sh vertical-slice-next-save /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next`

Residual risk:
- Shell syntax has not been validated in this pass.
- The command depends on live app state; if QuipslyStudio is closed or a session has not been loaded, it should save the honest no-state/no-card response rather than real next actions.
- Some field names are intentionally tolerant because Nest/Studio/Tower state is still evolving.

Next move:
- Validate this command and make `START-HERE-ONE-LOOP-NEXT.md` the default operator checkpoint for Episode 1 before broadening to Episodes 2-3.

## 2026-06-20 - One-loop next handoff is agent-discoverable

Intent:
- Promote the new Nest-Studio-Tower next-action handoff from a hidden CLI command into an agent-discoverable product workflow.
- Keep the publish/Tower surface connected back to Nest writing/capture and Studio editing state.

Changed:
- Added `save-one-loop-next-handoff` to `agentCurrentSafeActions`.
- The safe action points to:
  - `script/agentctl.sh vertical-slice-next-save /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next`
- The `publish-workbench` capability now advertises the same command in `act` and `prove`.
- Risk is labeled `disk-handoff` because it writes portable JSON/Markdown handoff files but does not rewrite manuscript canon, upload, schedule, publish, verify providers, or mutate receipt truth.

Proof:
- Not run in this pass. Next validation should rebuild/relaunch QuipslyStudio, load Episode 1, then inspect:
  - `/state.agentCurrentSafeActions` for `save-one-loop-next-handoff`
  - `/state` capability catalog for the `vertical-slice-next-save` command under `publish-workbench`
  - generated `START-HERE-ONE-LOOP-NEXT.md` after running the command

Residual risk:
- Swift source has not been compiled in this pass.
- The command path remains Episode 1 specific because Episode 1 is the current honest vertical-slice proof lane.

Next move:
- Validate one-loop handoff generation, then use it as the default operator checkpoint before continuing Episode 1 publishing or broadening to Episodes 2-3.

## 2026-06-20 - One-loop next card has direct Markdown view

Intent:
- Add an immediate terminal-readable view of the current Nest-Studio-Tower next-action card.
- Keep durable handoff generation and quick orientation separate: `vertical-slice-next-save` leaves files, while `vertical-slice-next-markdown` prints the current card.

Changed:
- Added `script/agentctl.sh vertical-slice-next-markdown`.
- Added aliases: `one-loop-next-markdown`, `nest-studio-tower-next-markdown`.
- The command generates a temporary one-loop handoff from live state, prints `START-HERE-ONE-LOOP-NEXT.md`, then cleans up the temporary folder.
- Added safe action `review-one-loop-next-markdown`.
- Added `vertical-slice-next-markdown` to the `publish-workbench` capability `act` and `prove` lists.

Proof:
- Not run in this pass. Next validation should rebuild/relaunch QuipslyStudio, load Episode 1, then run:
  - `script/agentctl.sh vertical-slice-next-markdown`
  - `script/agentctl.sh vertical-slice-next-save /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next`

Residual risk:
- Shell syntax has not been validated in this pass.
- The command depends on live app endpoints and will honestly print no-state/no-card output if QuipslyStudio is closed or unloaded.

Next move:
- Use `vertical-slice-next-markdown` as the first orientation command for Codex/agent work sessions, and `vertical-slice-next-save` whenever a durable handoff folder is needed.

## 2026-06-20 - One-loop next handoff has an offline smoke verifier

Intent:
- Give the integrated Nest-Studio-Tower next-action handoff a cheap artifact-level proof check.
- Keep proof claims narrow: this validates the saved handoff structure and honesty boundary, not live app behavior, exports, publication, or external receipts.

Changed:
- Added `script/agentctl.sh vertical-slice-next-smoke [/handoff-folder-or-one-loop-next.json]`.
- Added aliases: `one-loop-next-smoke`, `nest-studio-tower-next-smoke`.
- The smoke validates:
  - packet type is `quipsly-one-loop-next-handoff`
  - Nest, Studio, and Tower each have a non-empty `nextAction`
  - linked artifact paths exist
  - truth boundary states the handoff does not publish or mutate receipt truth
  - creative partner policy remains visible
- Added the smoke command to the `publish-workbench` capability `prove` list.

Proof:
- Not run in this pass. Next validation should run:
  - `script/agentctl.sh vertical-slice-next-save /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next`
  - `script/agentctl.sh vertical-slice-next-smoke /Users/wall-e/Movies/QuipslyExports/Episode1Tower`

Residual risk:
- Shell syntax has not been validated in this pass.
- The smoke only checks saved handoff artifacts; it does not prove live editor playback, export correctness, platform publication, or receipt authenticity.

Next move:
- Use the save+smoke pair as the default Episode 1 operator checkpoint before any publishing run.

## 2026-06-20 - One-loop smoke verifier is agent-discoverable

Intent:
- Make the one-loop handoff verifier visible from the app's safe agent actions, not only from shell help and capability metadata.
- Preserve the make/read/prove operator pattern for portable Nest-Studio-Tower handoffs.

Changed:
- Added `smoke-one-loop-next-handoff` to `agentCurrentSafeActions`.
- The action points to:
  - `script/agentctl.sh vertical-slice-next-smoke /Users/wall-e/Movies/QuipslyExports/Episode1Tower`
- Risk is labeled `read-only`.
- The explanation explicitly says the smoke checks the saved handoff structure and honesty boundaries, but does not prove live app playback, exports, publishing, or external receipts.

Proof:
- Not run in this pass. Next validation should rebuild/relaunch QuipslyStudio, load Episode 1, then inspect `/state.agentCurrentSafeActions` for:
  - `save-one-loop-next-handoff`
  - `review-one-loop-next-markdown`
  - `smoke-one-loop-next-handoff`

Residual risk:
- Swift source has not been compiled in this pass.
- The smoke target path remains Episode 1 specific because Episode 1 is the current honest vertical-slice proof lane.

Next move:
- Run the focused save+smoke sequence and make `START-HERE-ONE-LOOP-NEXT.md` the default first artifact for the next Episode 1 operator pass.

## 2026-06-20 - One-loop next checkpoint command added

Intent:
- Provide one low-anxiety operator command that generates the current Nest-Studio-Tower next-action handoff and immediately smoke-checks the saved artifact.
- Keep lower-level commands available, but give humans and agents a preferred checkpoint path.

Changed:
- Added `script/agentctl.sh vertical-slice-next-checkpoint [/absolute/output/folder] [optional-basename]`.
- Added aliases: `one-loop-next-checkpoint`, `nest-studio-tower-next-checkpoint`.
- The checkpoint writes:
  - `<basename>-checkpoint-save.json`
  - `<basename>-checkpoint-smoke.json`
- It returns one pass/fail JSON packet with:
  - summary/Markdown paths
  - next Nest action
  - next Studio action
  - next Tower action
  - failed smoke checks, if any
- Added safe action `checkpoint-one-loop-next-handoff`.
- Added the checkpoint command to the `publish-workbench` capability `prove` list.

Proof:
- Not run in this pass. Next validation should run:
  - `script/agentctl.sh vertical-slice-next-checkpoint /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next`

Residual risk:
- Shell syntax has not been validated in this pass.
- The checkpoint depends on live app endpoints through the save step.
- The checkpoint proves only the saved one-loop handoff structure and boundaries. It does not prove live editor playback, exports, actual publication, external receipt authenticity, or canonical manuscript review.

Next move:
- Make `vertical-slice-next-checkpoint` the first orientation/proof command before continuing any Episode 1 Tower operator run.

## 2026-06-20 - One-loop checkpoint now persists its own result

Intent:
- Make the default Nest-Studio-Tower checkpoint durable enough for later humans or agents to inspect without relying on terminal scrollback.
- Keep the checkpoint as a true operator artifact, not just a transient command output.

Changed:
- `vertical-slice-next-checkpoint` now writes:
  - `<basename>-checkpoint.json`
  - `latest-one-loop-next-checkpoint.json`
- The checkpoint JSON includes:
  - pass/fail status
  - paths to save and smoke result files
  - summary/Markdown handoff paths
  - next Nest action
  - next Studio action
  - next Tower action
  - failed checks, if any
  - proof boundary text
- The terminal output also reports the checkpoint paths.

Proof:
- Not run in this pass. Next validation should run:
  - `script/agentctl.sh vertical-slice-next-checkpoint /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next`
- Expected new files:
  - `/Users/wall-e/Movies/QuipslyExports/Episode1Tower/episode1-one-loop-next-checkpoint.json`
  - `/Users/wall-e/Movies/QuipslyExports/Episode1Tower/latest-one-loop-next-checkpoint.json`

Residual risk:
- Shell syntax has not been validated in this pass.
- The checkpoint depends on live app endpoints through `vertical-slice-next-save`.

Next move:
- Run the focused checkpoint validation and inspect `latest-one-loop-next-checkpoint.json` before continuing the Episode 1 Tower operator pass.

## 2026-06-20 - One-loop checkpoint failure path now preserves diagnostics

Intent:
- Ensure the default Nest-Studio-Tower checkpoint leaves a durable failure report when the smoke verifier fails.
- Avoid `set -e` aborting the checkpoint before the operator gets a useful diagnostic artifact.

Changed:
- `vertical-slice-next-checkpoint` now captures the exit code from `vertical-slice-next-smoke` instead of letting shell `set -e` abort immediately.
- The checkpoint still writes:
  - `<basename>-checkpoint.json`
  - `latest-one-loop-next-checkpoint.json`
- The checkpoint JSON now includes `smokeExitCode`.
- The command still exits nonzero when the smoke fails, but only after writing the checkpoint report.

Proof:
- Not run in this pass. Next validation should include both a passing case and, eventually, a deliberate broken handoff case to confirm failure artifacts are preserved.

Residual risk:
- Shell syntax has not been validated in this pass.
- Save-step failures can still abort before checkpoint JSON exists, which is acceptable for now because no handoff exists to smoke-check if live endpoint capture fails entirely.

Next move:
- Run the focused checkpoint command when validation mode is appropriate, then inspect `latest-one-loop-next-checkpoint.json` whether it passes or fails.

## 2026-06-20 - One-loop checkpoint now writes human-readable Markdown

Intent:
- Make the default Nest-Studio-Tower checkpoint usable by humans as well as automation.
- Pair the durable JSON checkpoint with a `START-HERE` style Markdown file that explains status, next actions, files, failed checks, and proof boundaries.

Changed:
- `vertical-slice-next-checkpoint` now writes:
  - `<basename>-checkpoint.md`
  - `START-HERE-ONE-LOOP-CHECKPOINT.md`
- The checkpoint JSON now includes:
  - `checkpointMarkdownPath`
  - `latestCheckpointMarkdownPath`
- The Markdown includes:
  - checkpoint status
  - smoke exit code
  - Nest next action
  - Studio next action
  - Tower next action
  - handoff/save/smoke/checkpoint file paths
  - failed checks when present
  - explicit proof boundary language

Proof:
- Not run in this pass. Next validation should run:
  - `script/agentctl.sh vertical-slice-next-checkpoint /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next`
- Expected new files:
  - `/Users/wall-e/Movies/QuipslyExports/Episode1Tower/episode1-one-loop-next-checkpoint.md`
  - `/Users/wall-e/Movies/QuipslyExports/Episode1Tower/START-HERE-ONE-LOOP-CHECKPOINT.md`

Residual risk:
- Shell/Python syntax has not been validated in this pass.
- The Markdown failure-check formatting is intentionally simple and may need refinement after the first real failed checkpoint.

Next move:
- Run the focused checkpoint validation, then use `START-HERE-ONE-LOOP-CHECKPOINT.md` as the default operator entrypoint for the next Episode 1 vertical-slice pass.

## 2026-06-20 - One-loop checkpoint is both an action and proof in publish-workbench

Intent:
- Fix a capability-catalog consistency gap: the one-loop checkpoint writes files and proves the saved handoff, so agents should see it under both `act` and `prove`.

Changed:
- Added `script/agentctl.sh vertical-slice-next-checkpoint /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next` to the `publish-workbench` capability `act` list.
- It was already present in `prove`.

Proof:
- Not run in this pass. Next validation should rebuild/relaunch QuipslyStudio and inspect the `publish-workbench` capability from `/state`.

Residual risk:
- Swift source has not been compiled in this pass.

Next move:
- Run the focused checkpoint validation and confirm the command appears in both `act` and `prove` for the publish-workbench capability.

## 2026-06-20 - One-loop checkpoint runbook added

Intent:
- Give humans and agents a stable operator reference for the Nest-Studio-Tower checkpoint workflow.
- Keep the checkpoint proof boundary explicit so local handoffs are not mistaken for live playback, exports, publication, external receipts, or manuscript canon.

Changed:
- Added `docs/quipsly/quipsly-one-loop-checkpoint-runbook.md`.
- The runbook documents:
  - default checkpoint command
  - aliases
  - expected output files
  - `START-HERE` files
  - what the checkpoint proves
  - what it does not prove
  - pass/fail operator moves
  - quick Markdown/save/smoke subcommands
  - the product rule behind the checkpoint

Proof:
- Documentation-only pass. No command validation run.

Residual risk:
- The runbook describes intended command behavior from current source, but the command path still needs focused validation.

Next move:
- Run the checkpoint validation when appropriate, then update the runbook if the first real pass exposes naming, file, or operator wording changes.

## 2026-06-20 - Receipt cockpit points back to one-loop checkpoint and runbook

Intent:
- Keep Tower receipt work connected to the larger Nest-Studio-Tower vertical slice.
- Prevent the receipt cockpit from becoming a publishing-only silo by advertising the integrated checkpoint path directly from its command map.

Changed:
- `publicationReceiptCockpitPayload.commands` now includes:
  - `oneLoopNextMarkdown`: `script/agentctl.sh vertical-slice-next-markdown`
  - `oneLoopCheckpoint`: `script/agentctl.sh vertical-slice-next-checkpoint /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next`
  - `oneLoopCheckpointRunbook`: `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/quipsly-one-loop-checkpoint-runbook.md`

Proof:
- Not run in this pass. Next validation should rebuild/relaunch QuipslyStudio, load Episode 1, and inspect `/publication_receipt_cockpit.commands` for the new one-loop entries.

Residual risk:
- Swift source has not been compiled in this pass.
- The paths remain Episode 1 specific because Episode 1 is the current honest vertical-slice proof lane.

Next move:
- Run the focused one-loop checkpoint validation and confirm the receipt cockpit command map points to the same checkpoint/runbook used by safe actions and capabilities.

## 2026-06-20 - One-loop checkpoint runbook is agent-discoverable

Intent:
- Make the one-loop checkpoint runbook a first-class operator reference from app state, not only a file path mentioned in prior notes.
- Encourage agents to read the proof boundary before running checkpoint commands or interpreting their results.

Changed:
- Added safe action `review-one-loop-checkpoint-runbook`.
- The action points to:
  - `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/quipsly-one-loop-checkpoint-runbook.md`
- Added the same runbook file path to the `publish-workbench` capability `act` list.

Proof:
- Not run in this pass. Next validation should rebuild/relaunch QuipslyStudio and inspect `/state.agentCurrentSafeActions` plus the `publish-workbench` capability for the runbook entry.

Residual risk:
- Swift source has not been compiled in this pass.

Next move:
- Run the focused build/relaunch and one-loop checkpoint validation, then update the runbook if live behavior differs from the documented operator path.

## 2026-06-20 - Latest one-loop checkpoint Markdown reader added

Intent:
- Give humans and agents a direct way to read the latest human-readable one-loop checkpoint after it has been generated.
- Keep orientation separate from generation: checkpoint creates proof artifacts, checkpoint Markdown readback displays the latest operator summary.

Changed:
- Added `script/agentctl.sh vertical-slice-next-checkpoint-markdown [/handoff-folder]`.
- Added aliases: `one-loop-next-checkpoint-markdown`, `nest-studio-tower-next-checkpoint-markdown`.
- The command prints `START-HERE-ONE-LOOP-CHECKPOINT.md` from the target folder, defaulting to `.quipsly/vertical-slice-handoffs`.
- Added safe action `review-one-loop-checkpoint-markdown`.
- Added the command to the `publish-workbench` capability `act` and `prove` lists.

Proof:
- Not run in this pass. Next validation should run:
  - `script/agentctl.sh vertical-slice-next-checkpoint /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next`
  - `script/agentctl.sh vertical-slice-next-checkpoint-markdown /Users/wall-e/Movies/QuipslyExports/Episode1Tower`

Residual risk:
- Shell syntax has not been validated in this pass.
- Swift source has not been compiled in this pass.

Next move:
- Use checkpoint generation plus checkpoint Markdown readback as the default one-loop orientation/proof pair.

## 2026-06-20 - Receipt cockpit includes checkpoint Markdown reader

Intent:
- Complete the one-loop checkpoint command sequence in the live receipt cockpit command map.
- Make the Tower cockpit point to checkpoint generation, checkpoint Markdown readback, and the checkpoint runbook from one place.

Changed:
- `publicationReceiptCockpitPayload.commands` now includes:
  - `oneLoopCheckpointMarkdown`: `script/agentctl.sh vertical-slice-next-checkpoint-markdown /Users/wall-e/Movies/QuipslyExports/Episode1Tower`

Proof:
- Not run in this pass. Next validation should rebuild/relaunch QuipslyStudio, load Episode 1, and inspect `/publication_receipt_cockpit.commands` for:
  - `oneLoopNextMarkdown`
  - `oneLoopCheckpoint`
  - `oneLoopCheckpointMarkdown`
  - `oneLoopCheckpointRunbook`

Residual risk:
- Swift source has not been compiled in this pass.

Next move:
- Run the focused build/relaunch and one-loop checkpoint validation instead of adding more checkpoint scaffolding.

## 2026-06-20 - One-loop validation gate command added

Intent:
- Provide one focused validation command for the one-loop checkpoint path without broadening into full app/editor/export/publishing validation.
- Preserve diagnostics before exiting nonzero when a validation sub-step fails.

Changed:
- Added `script/agentctl.sh vertical-slice-next-validation-gate [/absolute/output/folder] [optional-basename]`.
- Added aliases: `one-loop-next-validation-gate`, `nest-studio-tower-next-validation-gate`.
- The gate checks:
  - `agentctl.sh` shell syntax
  - one-loop checkpoint generation and smoke
  - one-loop checkpoint Markdown readback
- It writes:
  - `<basename>-validation-shell-syntax.txt`
  - `<basename>-validation-checkpoint-run.json`
  - `<basename>-validation-checkpoint-readback.md`
  - `<basename>-validation-gate.json`
  - `<basename>-validation-gate.md`
  - `latest-one-loop-next-validation-gate.json`
  - `START-HERE-ONE-LOOP-VALIDATION-GATE.md`
- Updated `docs/quipsly/quipsly-one-loop-checkpoint-runbook.md` with the validation gate command and expected artifacts.

Proof:
- Not run in this pass. This pass added the validation gate but did not execute it.

Residual risk:
- Shell/Python syntax inside the new gate has not been validated.
- The gate still depends on live app endpoints through the checkpoint step.

Next move:
- Run `script/agentctl.sh vertical-slice-next-validation-gate /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next` when validation mode is appropriate.

## 2026-06-20 - One-loop validation gate is agent-discoverable

Intent:
- Make the focused one-loop validation gate discoverable from live app state, not only from the runbook and shell help.
- Give future agents a direct, bounded proof command for the checkpoint path.

Changed:
- Added safe action `run-one-loop-validation-gate`.
- Added `oneLoopValidationGate` to `publicationReceiptCockpitPayload.commands`.
- Added the validation gate command to `publish-workbench` capability `act` and `prove` lists.
- Command advertised:
  - `script/agentctl.sh vertical-slice-next-validation-gate /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next`

Proof:
- Not run in this pass. Next validation should rebuild/relaunch QuipslyStudio and inspect `/state.agentCurrentSafeActions`, `publish-workbench`, and `/publication_receipt_cockpit.commands` for the validation gate entry.

Residual risk:
- Swift source has not been compiled in this pass.
- The validation gate command itself has not yet been executed.

Next move:
- Stop adding checkpoint scaffolding and run the focused validation gate when runtime validation is appropriate.

## 2026-06-20 - Creative partner doctrine promoted to first-read runway

Intent:
- Prevent future agents from treating Codex/Quipsly-created content as merely placeholder work.
- Make the full-content-partner rule visible in the first-read coordination doc, not only in the deeper assistant drafting policy.

Changed:
- Added `Creative partner operating rule` to `docs/coordination/START-HERE-QUIPSLY.md`.
- The rule says agents may create serious first-pass material for review or publication when the Nest -> Studio -> Tower loop needs real content.
- It preserves the real safeguard: visible authorship, intent, provenance, review state, recoverability, canon boundaries, and publication receipts.

Proof:
- Documentation-only pass. No build or validation run.

Residual risk:
- Runtime assistant payloads and UI labels still need to reflect the doctrine everywhere important.

Next move:
- When touching Nest writing/capture state, expose authorship and intent fields clearly enough that agent-created work can move through the product without becoming invisible or mislabeled.

## 2026-06-20 - Nest writing readiness exposes serious agent-created work

Intent:
- Turn the creative-partner doctrine into usable Nest state, not just documentation.
- Make it easy for Codex and other Quipslys to see whether writing exists, what needs review, and how to create the next serious first-pass draft without treating agent work as fake placeholder content.

Changed:
- `nestWritingReadinessPayload()` now exposes:
  - human, agent, and mixed-authorship block counts
  - authored review-status counts
  - `seriousAgentWorkAllowed`
  - `placeholderPolicy`
  - `canonBoundary`
  - `nextReviewBlock` with select/review/canon commands
  - `nextDraftSuggestion` with authorship, review status, tags, truth language, and append command
- `nestPayload()` now includes `creativePartnerTruth` at the top level.
- The `nest-writing-capture` agent capability now advertises `nest.writingReadiness`, `nextReviewBlock`, `nextDraftSuggestion`, `/nest_writing_queue`, `/nest_writing_next_action`, and full agent-authored append parameters.

Proof:
- Not run in this pass. Runtime validation still needs QuipslyStudio build/relaunch and inspection of `/state`, `/nest_writing_queue`, and `agentCapabilities`.

Residual risk:
- Swift source has not been compiled in this pass.
- The Nest UI may still need clearer human-facing labels for these new fields.

Next move:
- When validation mode is appropriate, run the native app proof path and inspect that `/state.nest.writingReadiness` exposes the new fields without breaking the one-loop checkpoint flow.

## 2026-06-20 - Nest agent routes now teach creative-partner drafting policy

Intent:
- Make the Nest control API carry the same creative-partner doctrine as the UI/state payloads.
- Prevent agents from interpreting empty Nest packet state as a reason to wait for human-supplied content.

Changed:
- `/nest_writing_queue` no-state fallback now includes:
  - `seriousAgentWorkAllowed`
  - creative-partner truth
  - a safe next-draft suggestion
  - safe commands to run after a session is loaded
- `/nest_writing_packet` no-state fallback now explains that missing packet state means the app has not exposed current writing state yet, not that agents are forbidden to create content.
- `/nest_append_block` response now states that appended agent-authored work may be serious first-pass material and that the command does not canonize or publish it.
- `nestWritingReadinessPayload()` now exports authorship and review vocabularies.
- `nestWritingPacketPayload()` now exports authorship policy alongside source policy.

Proof:
- Not run in this pass. Runtime proof still needs app build/relaunch and route inspection.

Residual risk:
- Swift source has not been compiled in this pass.
- Route responses have not been exercised against a live AgentServer.

Next move:
- Runtime validation should inspect `/nest_writing_queue`, `/nest_writing_packet`, `/nest_append_block?...`, and `/state.nest.writingReadiness` once validation/build mode is appropriate.

## 2026-06-20 - Nest writing panel shows authorship and provenance truth

Intent:
- Bring the creative-partner drafting doctrine into the human-facing Nest UI, not only the agent API.
- Help Charlie, Codex, and future collaborators see whether writing is human-authored, agent-authored, mixed, source-context, draft, reviewed, or canon candidate before editing.

Changed:
- `nestWritingReadinessPanel` now shows human/agent/mixed authored block counts.
- Added a visible Creative partner rule explaining that agent-authored does not mean placeholder and that review state/provenance define the work state.
- `selectedNestBlockEditor` now shows selected block authorship, review status, and provenance note before revision.

Proof:
- Not run in this pass. Needs native app build/relaunch and visual inspection of the Nest workbench.

Residual risk:
- Swift source has not been compiled in this pass.
- The panel may need a later visual design pass so the additional truth does not become clutter.

Next move:
- Validate the Nest workbench in the running app, then add one serious agent-authored Episode 1 writing block through the route/UI to dogfood the new state.

## 2026-06-20 - Agentctl gets a serious Nest draft shortcut

Intent:
- Make serious agent-authored writing easy from the shell control surface.
- Avoid forcing Codex or other agents to remember the full raw `/nest_append_block` parameter list for common first-pass drafting.

Changed:
- Added `script/agentctl.sh nest-serious-draft "Title" "Draft text" [episode-slug] ["tag1,tag2"] ["why this draft exists"]`.
- Aliases: `nest-agent-draft`, `nest-first-pass`.
- The command appends a writing block with:
  - `authorship=agent-authored`
  - `review_status=agent-first-pass`
  - default Episode 1 writing tags
  - provenance text that says this is serious first-pass work for the Nest -> Studio -> Tower loop
- `nestWritingReadinessPayload()` and `nestWritingPacketPayload()` now advertise the shortcut command.
- `/nest_writing_queue` no-state fallback now includes the shortcut as `cliShortcut` in `nextDraftSuggestion`.

Proof:
- Not run in this pass. Needs shell syntax validation and live route exercise later.

Residual risk:
- `agentctl.sh` has not been syntax-checked in this pass.
- Swift source has not been compiled after the payload command additions.

Next move:
- When validation mode is appropriate, run shell syntax validation, launch QuipslyStudio, then use `script/agentctl.sh nest-serious-draft` against a loaded Episode 1 session and confirm `/state.nest.writingReadiness` reflects the new agent-authored block.

## 2026-06-20 - Serious draft shortcut is discoverable in agent command surfaces

Intent:
- Ensure the new `nest-serious-draft` golden path is visible to future agents from the app's command discovery surfaces, not only buried in `agentctl.sh`.

Changed:
- Added the serious-draft CLI shortcut to the AgentServer command/manual list.
- Added the serious-draft CLI shortcut to the `nest-writing-capture` capability `act` list.

Proof:
- Not run in this pass. Needs app build/relaunch and inspection of `agent-manual` / `agent-capabilities` output.

Residual risk:
- Swift source has not been compiled after command discovery changes.
- `agentctl.sh` has not been shell-syntax checked after adding the shortcut.

Next move:
- Validation pass should run shell syntax check, build/relaunch QuipslyStudio, inspect agent command discovery, then dogfood `nest-serious-draft` on the Episode 1 session.

## 2026-06-20 - Nest writing review handoff includes serious-draft path

Intent:
- Make generated Nest writing review artifacts carry the same creative-partner drafting workflow as the app UI/API/shell controls.
- Prevent review handoffs from implying agent-created material is placeholder by default.

Changed:
- `NEST-WRITING-REVIEW*.md` generation now includes a `Next serious draft` section with:
  - suggested title
  - authorship
  - review status
  - exact serious-draft shortcut command
- Added authorship/review vocabulary to the generated Markdown review so reviewers understand `agent-authored`, `mixed-authorship`, `source-context`, `agent-first-pass`, and `canon-approved`.
- `nest-writing-review --json` now includes:
  - `nextDraftSuggestion`
  - `authorshipPolicy`
  - `reviewVocabulary`
- Text output from `nest-writing-review` now prints the next serious draft shortcut.

Proof:
- Not run in this pass. Needs `bash -n script/agentctl.sh` and a generated Nest writing review against a live or saved packet.

Residual risk:
- The shell/Python helper has not been syntax-checked after these edits.
- The generated Markdown has not been rendered from a real packet after these edits.

Next move:
- Validation pass should run shell syntax check, generate/read a Nest writing review, and confirm the serious-draft section appears without breaking existing vertical-slice handoffs.

## 2026-06-20 - Episode 1 serious first-pass writing artifact added

Intent:
- Move beyond empty Nest plumbing by creating real reviewable content for the High Ground Odyssey vertical slice.
- Avoid forcing long manuscript drafts through fragile shell quoting.

Changed:
- Added `script/agentctl.sh nest-serious-draft-file "Title" /absolute/path/to/draft.md [episode-slug] ["tag1,tag2"] ["why this draft exists"]`.
- Aliases: `nest-agent-draft-file`, `nest-first-pass-file`.
- Added serious first-pass Episode 1 writing artifact:
  - `docs/quipsly/content-drafts/hgo-episode-1-the-wednesday-rule-agent-first-pass.md`
- The artifact is explicitly labeled:
  - `agent-authored first pass`
  - `agent-first-pass`
  - `not canon-approved`
  - intended for the Quipsly Nest -> Studio -> Tower dogfooding loop
- Nest readiness, packet payloads, AgentServer fallback, and AgentServer manual now advertise the file-based serious-draft path.
- Generated Nest writing review handoffs now prefer `fileCommand` when available.

Proof:
- Not run in this pass. The command has not been shell-syntax checked or executed against a live app session.

Residual risk:
- `agentctl.sh` has not been validated after adding file ingestion.
- Swift source has not been compiled after advertising the file command.
- The draft has not yet been inserted into a live Episode 1 Nest document.

Next move:
- Validation/dogfood pass should run shell syntax check, build/relaunch QuipslyStudio, load Episode 1, run `script/agentctl.sh nest-serious-draft-file "Episode 1 - The Wednesday Rule" /Users/wall-e/Dev/high-ground-studio/docs/quipsly/content-drafts/hgo-episode-1-the-wednesday-rule-agent-first-pass.md episode-1`, and confirm `/state.nest.writingReadiness` shows the new agent-authored first-pass block.

## 2026-06-20 - Episode 1 writing draft now has a Tower publication packet

Intent:
- Move the serious Episode 1 Nest writing artifact toward Tower instead of leaving it as isolated content.
- Prove the beginning of a writing -> publication preparation path without claiming anything has been published.

Changed:
- Added reviewable Tower preparation packet:
  - `docs/quipsly/publication-packets/hgo-episode-1-the-wednesday-rule-writing-publication-packet.md`
- Packet includes:
  - public page candidate title/subtitle/descriptions
  - HighGroundOdyssey.com copy candidate
  - YouTube description support copy
  - Patreon post draft
  - social post drafts
  - metadata candidates
  - review checklist
  - receipt expectations
  - explicit guardrail that the packet does not publish, schedule, canonize, or prove external receipts
- Nest readiness/packet commands now advertise the packet path.
- AgentServer no-state writing fallback now advertises the packet path.

Proof:
- Not run in this pass. This is a source/content artifact pass only.

Residual risk:
- Swift source has not been compiled after advertising the packet path.
- The packet has not been connected to a live Tower receipt row or publication cockpit state.
- The packet has not been human-reviewed or canon-approved.

Next move:
- Dogfood path: load Episode 1, ingest the serious draft file into Nest, generate a Nest writing packet, then use this Tower publication packet as the first writing-derived publication review artifact. Later connect it to actual receipt targets in Tower.

## 2026-06-20 - Writing publication packet made agent-discoverable from Tower

Intent:
- Make the serious Episode 1 writing draft visible from the same Tower-facing paths agents already use for publication and receipt work.
- Keep the creative-partner doctrine practical: Codex and Quipslys may create real reviewable content, but Tower still preserves review, canon, publication, and receipt truth separately.

Changed:
- `publicationReceiptCockpitPayload.commands` now exposes:
  - `writingPublicationPacket`
  - `writingPublicationPacketJson`
- The `publish-workbench` capability now advertises the writing packet CLI command in both `act` and `prove`.
- The agent HTTP/manual command list now names the writing packet command alongside receipt cockpit and mission-control commands.
- The packet remains explicitly not canonized, not scheduled, not published, and not receipt-proven.

Proof:
- Not run in this pass. Needs `script/agentctl.sh publication-writing-packet --json`, app rebuild/relaunch, and `/state` inspection for `publish-workbench`.

Next move:
- Dogfood the full writing path: ingest the Episode 1 serious draft file into Nest, generate a Nest writing review packet, inspect the Tower writing publication packet, then decide which parts should become canon/public copy.

## 2026-06-20 - Episode 1 writing vertical slice handoff added

Intent:
- Give humans and agents one plain-English map for the first serious writing dogfood loop.
- Keep the workflow honest about what exists, what it proves, what remains unvalidated, and what has not been published.

Changed:
- Added `docs/quipsly/episode-1-writing-vertical-slice-handoff.md`.
- Added the safer file-based serious-draft command to the `nest-writing-capture` capability actions.
- The handoff points to the source draft, Tower packet, Nest ingest command, and Tower packet review commands.

Proof:
- Not run in this pass. Needs app relaunch and command/API inspection before claiming the path works live.

Next move:
- Validate the handoff in the real app: ingest the draft into Nest, confirm it appears in `nest.writingReadiness`, inspect the publication writing packet JSON, then refine the draft or Tower packet based on review.

## 2026-06-20 - Episode 1 writing handoff promoted to command and review surfaces

Intent:
- Make the Episode 1 writing handoff reachable through the same CLI/app/agent surfaces as the Tower publication packet.
- Add a lightweight human/agent review checklist so serious agent-authored writing can move toward canon without becoming invisible black-box copy.

Changed:
- Added `script/agentctl.sh episode1-writing-handoff [--json]` with aliases `writing-vertical-slice-handoff` and `episode1-writing-vertical-slice-handoff`.
- Added the handoff command to `publicationReceiptCockpitPayload.commands`.
- Added the handoff command and file path to the `publish-workbench` capability actions/proofs.
- Added the handoff command to the AgentServer command manual.
- Added `docs/quipsly/episode-1-writing-review-checklist.md`.

Proof:
- Not run in this pass. No shell syntax check, app build, command execution, or live `/state` inspection was performed.

Next move:
- Run a focused proof pass when ready: shell-check `agentctl.sh`, inspect `episode1-writing-handoff --json`, ingest the draft into Nest, then use the review checklist before changing canon/publication state.

## 2026-06-20 - Episode 1 writing review checklist made callable

Intent:
- Make the writing review checklist an executable workflow entry point, not a loose Markdown reminder.
- Keep the creative-partner loop fast while preserving authorship, review, canon, publication, and receipt boundaries.

Changed:
- Added `script/agentctl.sh episode1-writing-review-checklist [--json]`.
- Added aliases: `writing-review-checklist` and `episode1-writing-checklist`.
- Added checklist commands to `publicationReceiptCockpitPayload.commands`.
- Added checklist command/file visibility to the `publish-workbench` capability actions and proof list.
- Added checklist commands to the AgentServer manual command list.

Proof:
- Not run in this pass. No shell syntax check, app build, command execution, or live `/state` inspection was performed.

Next move:
- In the next validation pass, run `script/agentctl.sh episode1-writing-review-checklist --json`, inspect the command output, then dogfood the draft -> handoff -> packet -> checklist sequence against live Nest/Tower state.

## 2026-06-20 - Episode 1 writing review bundle command added

Intent:
- Reduce artifact scatter in the Episode 1 writing dogfood path.
- Give humans and agents one command that explains the serious draft, handoff, checklist, Tower packet, next commands, review outcomes, and truth boundaries.

Changed:
- Added `script/agentctl.sh episode1-writing-review-bundle [--json]`.
- Added aliases: `writing-review-bundle` and `episode1-writing-bundle`.
- Bundle JSON includes paths for the source draft, handoff, checklist, and Tower packet.
- Bundle JSON/text includes the next commands for Nest ingest, handoff inspection, checklist inspection, and Tower packet inspection.
- Added bundle commands to `publicationReceiptCockpitPayload.commands`.
- Added bundle command visibility to the `publish-workbench` capability actions and proof list.
- Added bundle commands to the AgentServer command manual.

Proof:
- Not run in this pass. No shell syntax check, command execution, app build, or live `/state` inspection was performed.

Next move:
- Run `script/agentctl.sh episode1-writing-review-bundle --json` in a validation pass, then use it as the single operator entry point for the Episode 1 writing review loop.

## 2026-06-20 - Episode 1 writing review ledger command added

Intent:
- Add a small append-only review receipt layer for serious agent-authored writing.
- Let humans or agents record review outcomes without silently changing canon, publication, or receipt state.

Changed:
- Added `script/agentctl.sh episode1-writing-review-decision needs-agent-revision|needs-human-rewrite|mixed-authorship-ready|canon-approved|publication-ready [actor] [note]`.
- Added aliases: `writing-review-decision` and `episode1-writing-decision`.
- The command appends JSONL records to `docs/quipsly/review-ledgers/episode-1-writing-review-ledger.jsonl`.
- Added `docs/quipsly/review-ledgers/README.md`.
- Added the review decision command and ledger path to Tower command/capability surfaces and AgentServer command discovery.

Proof:
- Not run in this pass. No shell syntax check, command execution, app build, or live `/state` inspection was performed.

Next move:
- Validate with `script/agentctl.sh episode1-writing-review-decision needs-agent-revision Codex "test review receipt"`, inspect the ledger JSONL, and then decide whether to reset/remove the test row before real review use.

## 2026-06-20 - Episode 1 writing review ledger inspect command added

Intent:
- Add the read side of the Episode 1 writing review ledger so review decisions are not write-only memory attic records.
- Make the writing bundle show both how to record a decision and how to inspect existing decisions.

Changed:
- Added `script/agentctl.sh episode1-writing-review-ledger [--json]`.
- Added aliases: `writing-review-ledger` and `episode1-writing-ledger`.
- The ledger command summarizes record count, latest decision, and all JSONL records in JSON mode.
- The writing review bundle now includes `reviewLedger` path and `inspectReviewLedger` command.
- Added ledger inspect command to `publicationReceiptCockpitPayload.commands`, `publish-workbench` actions, and AgentServer command discovery.

Proof:
- Not run in this pass. No shell syntax check, command execution, app build, or live `/state` inspection was performed.

Next move:
- Validation should run `script/agentctl.sh episode1-writing-review-ledger --json`, then record a temporary review decision and inspect the ledger again before removing or replacing the test row with a real review receipt.

## 2026-06-20 - Episode 1 writing review ledger proof surface aligned

Intent:
- Clean up the recent writing/Tower command wiring so the review ledger is discoverable as both an action and proof source.
- Preserve the distinction between local review receipts and canon/publication/external receipt truth.

Changed:
- Inspected the recently edited `publicationReceiptCockpitPayload.commands`, `publish-workbench`, and `agentctl.sh` writing review command regions.
- Confirmed the receipt cockpit command payload shape includes the writing draft packet, handoff, checklist, bundle, ledger inspect, decision command, and ledger path.
- Added `CLI script/agentctl.sh episode1-writing-review-ledger --json` to the `publish-workbench` proof list.

Proof:
- Not run in this pass. This was source inspection plus a small source patch only. No shell syntax check, app build, command execution, or live `/state` inspection was performed.

Next move:
- A focused validation pass should run `bash -n script/agentctl.sh`, then inspect `episode1-writing-review-bundle --json`, `episode1-writing-review-ledger --json`, and `/state` publish-workbench command surfaces in the launched app.

## 2026-06-20 - Episode 1 writing review status command added

Intent:
- Make the Episode 1 writing/Tower loop easier to operate by exposing the current review status inferred from the writing review ledger.
- Keep Codex/Quipsly-authored content treated as real creative work while preserving provenance, review, canon, publication, and external receipt boundaries.

Changed:
- Added `script/agentctl.sh episode1-writing-review-status [--json]`.
- Added aliases: `writing-review-status` and `episode1-writing-status`.
- The status command reads the local Episode 1 writing review ledger and reports current status, latest outcome, latest actor, next action, and truth boundaries.
- Added status inspection to the writing review bundle command list.
- Added status commands to the publication receipt cockpit payload, publish-workbench action/proof lists, and AgentServer command discovery.

Truth boundaries:
- `needs-review-decision`, `needs-agent-revision`, `needs-human-rewrite`, `mixed-authorship-ready`, `canon-approved-not-publication-ready`, and `publication-ready-not-published` are workflow states, not publication receipts.
- This command does not mutate Nest canon text, approve publication, schedule posts, or create platform/provider receipts.

Proof:
- Not run in this pass. No shell syntax check, command execution, app build, or live `/state` inspection was performed.

Next move:
- Focused validation should run `bash -n script/agentctl.sh`, `script/agentctl.sh episode1-writing-review-status --json`, `script/agentctl.sh episode1-writing-review-bundle --json`, and then inspect the publish-workbench command surface in the launched app.

## 2026-06-20 - Content partner doctrine and Episode 1 provenance packet added

Intent:
- Encode the user's clarified doctrine that Codex and Quipslys are full creative partners who may create serious publishable-intent work, not merely placeholders.
- Preserve Quipsly's anti-black-box philosophy by making authorship, provenance, review state, canon state, publication state, and receipt truth explicit.

Changed:
- Added `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/quipsly-content-partner-doctrine.md`.
- Added `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/provenance-packets/episode-1-writing-provenance.json`.
- Added `script/agentctl.sh episode1-writing-provenance [--json]` with aliases `writing-provenance` and `episode1-writing-authorship`.
- Updated the Episode 1 writing review bundle so it includes provenance path, provenance JSON, and an `inspectProvenance` command.
- Added provenance commands and doctrine/provenance file references to the publish-workbench capability surface.
- Added provenance commands to AgentServer command discovery.
- Linked the focused doctrine and Episode 1 provenance packet from `docs/quipsly/nest-studio-tower-product-map.md`.

Product truth:
- Agent-created work is not placeholder work by default.
- Serious Codex/Quipsly-authored drafts can move through Nest, Studio, and Tower when provenance and review state stay visible.
- The Episode 1 draft and Tower packet remain not canon-approved, not published, and without external receipts until explicit review and Tower receipt capture prove otherwise.

Proof:
- Not run in this pass. No shell syntax check, command execution, app build, or live `/state` inspection was performed.

Next move:
- Focused validation should run `bash -n script/agentctl.sh`, then inspect `script/agentctl.sh episode1-writing-provenance --json`, `script/agentctl.sh episode1-writing-review-bundle --json`, and the launched app's publish-workbench capability payload.

## 2026-06-20 - Episode 1 second-pass writing draft added to the vertical slice

Intent:
- Move the Codex-as-content-partner doctrine from policy into real creative work.
- Create a stronger Episode 1 writing pass that can be reviewed, compared, revised, ingested into Nest, or used to update Tower publication copy later.

Changed:
- Added `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/content-drafts/hgo-episode-1-the-wednesday-rule-agent-second-pass.md`.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/provenance-packets/episode-1-writing-provenance.json` with the second-pass draft as an inspectable artifact.
- Added `script/agentctl.sh episode1-writing-draft-v2 [--json]` with aliases `writing-draft-v2` and `episode1-writing-second-pass`.
- Updated the Episode 1 writing review bundle with `draftV2`, `inspectSecondPass`, and `ingestSecondPassIntoNest` surfaces.
- Added second-pass commands/file references to the publish-workbench capability surface and AgentServer command discovery.
- Updated the Episode 1 Tower writing packet to name the second-pass draft and require comparing v1/v2 before publication copy advances.

Product truth:
- The second-pass draft is serious agent-authored creative work, not a placeholder.
- It is still not canon-approved, not published, and without external receipts.
- The existing Tower packet now knows the second-pass draft exists, but it has not been fully regenerated from v2.

Proof:
- Not run in this pass. No shell syntax check, command execution, app build, or live `/state` inspection was performed.

Next move:
- Focused validation should run `bash -n script/agentctl.sh`, `script/agentctl.sh episode1-writing-draft-v2 --json`, `script/agentctl.sh episode1-writing-provenance --json`, and `script/agentctl.sh episode1-writing-review-bundle --json` before claiming these command surfaces work.

## 2026-06-20 - Episode 1 comparison and v2 Tower writing packet added

Intent:
- Reduce review anxiety by turning Episode 1 v1/v2 writing drafts into an explicit comparison packet with a recommended next decision.
- Advance the Tower side of the vertical slice by preparing a v2-derived publication packet from the stronger second-pass draft.

Changed:
- Added `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/review-packets/episode-1-writing-v1-v2-comparison.md`.
- Added `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/publication-packets/hgo-episode-1-the-wednesday-rule-writing-publication-packet-v2.md`.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/provenance-packets/episode-1-writing-provenance.json` with the comparison packet and v2 Tower packet.
- Added `script/agentctl.sh episode1-writing-compare [--json]` with aliases `writing-compare` and `episode1-writing-v1-v2-comparison`.
- Added `script/agentctl.sh publication-writing-packet-v2 [--json]` with aliases `tower-writing-packet-v2` and `episode1-writing-publication-packet-v2`.
- Updated the Episode 1 writing review bundle with comparison and v2 Tower packet paths/markdown.
- Added comparison and v2 Tower packet commands to the publish-workbench capability surface and AgentServer command discovery.

Product truth:
- The comparison packet recommends v2 as the current working draft and suggests a `mixed-authorship-ready` review decision.
- The v2 Tower packet is serious publishable-intent preparation material.
- Neither artifact approves canon, mutates Nest, publishes, schedules, or captures external receipts.

Proof:
- Not run in this pass. No shell syntax check, command execution, app build, or live `/state` inspection was performed.

Next move:
- Focused validation should run `bash -n script/agentctl.sh`, then inspect `script/agentctl.sh episode1-writing-compare --json`, `script/agentctl.sh publication-writing-packet-v2 --json`, and `script/agentctl.sh episode1-writing-review-bundle --json`.

## 2026-06-20 - Episode 1 current writing candidate manifest added

Intent:
- Reduce operator/reviewer anxiety by making the next writing artifact obvious without pretending the recommendation is canon.
- Preserve the distinction between current recommended draft, review state, canon approval, Tower publication preparation, and external receipt truth.

Changed:
- Added `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episode-1-writing-current-candidate.json`.
- Added `script/agentctl.sh episode1-writing-current [--json]` with aliases `writing-current` and `episode1-writing-current-candidate`.
- Updated the Episode 1 writing review bundle with `currentCandidate` path/JSON and an `inspectCurrentCandidate` command.
- Added current-candidate commands/file references to the publish-workbench capability surface and AgentServer command discovery.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/provenance-packets/episode-1-writing-provenance.json` so the current-candidate recommendation is part of the inspectable artifact graph.

Product truth:
- v2 is now the recommended current working draft for Episode 1 review.
- That recommendation is an annotation/manifest, not canon approval.
- The current candidate remains agent-authored, needs human review, is not published, and has no external receipts.

Proof:
- Not run in this pass. No shell syntax check, command execution, app build, or live `/state` inspection was performed.

Next move:
- Focused validation should run `bash -n script/agentctl.sh`, `script/agentctl.sh episode1-writing-current --json`, `script/agentctl.sh episode1-writing-review-bundle --json`, and inspect the launched app's publish-workbench capability payload before claiming runtime proof.

## 2026-06-20 - Episode 1 Nest writing intake packet added

Intent:
- Move the Episode 1 writing vertical slice from "recommended draft exists" toward "safe Nest capture is explicit."
- Preserve the airlock between serious agent-authored draft work and the living Nest document so Codex can create real content without invisible canon mutation.

Changed:
- Added `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/nest-intake/episode-1-writing-v2-nest-intake.json`.
- Added `script/agentctl.sh episode1-writing-nest-intake [--json]` with aliases `writing-nest-intake` and `episode1-writing-intake`.
- Updated the Episode 1 writing review bundle with `nestIntake` path/JSON and an `inspectNestIntake` command.
- Added Nest intake commands/file references to the publish-workbench capability surface and AgentServer command discovery.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/provenance-packets/episode-1-writing-provenance.json` so Nest intake is part of the inspectable artifact graph.

Product truth:
- The Nest intake packet says how to capture the v2 draft in Nest as a reviewable authored block.
- The packet includes title, tags, episode, authorship, provenance, review status, canon status, publication status, and receipt status.
- The packet includes a safe ingest command, but does not prove that command has been run.
- Capturing this draft in Nest would still not canonize, publish, schedule, or receipt-confirm anything.

Proof:
- Not run in this pass. No shell syntax check, command execution, app build, or live `/state` inspection was performed.

Next move:
- Focused validation should run `bash -n script/agentctl.sh`, `script/agentctl.sh episode1-writing-nest-intake --json`, and `script/agentctl.sh episode1-writing-review-bundle --json`, then decide whether to run the safe ingest command against the live Nest writing queue.

## 2026-06-20 - Episode 1 agent review receipt and human handoff added

Intent:
- Turn the Episode 1 v2 writing recommendation into a real review event, while preserving the distinction between agent recommendation, human review, canon approval, Nest ingestion, publication, and external receipts.
- Make the next human step explicit instead of leaving Charlie/Homer to infer what should be reviewed.

Changed:
- Appended an agent review receipt to `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/review-ledgers/episode-1-writing-review-ledger.jsonl` with outcome `mixed-authorship-ready` for the v2 draft.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episode-1-writing-current-candidate.json` to reflect Codex's agent review receipt and continued human-review requirement.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/provenance-packets/episode-1-writing-provenance.json` with the latest review receipt and human handoff artifact.
- Added `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/review-packets/episode-1-human-writing-review-handoff.md`.
- Added `script/agentctl.sh episode1-writing-human-handoff [--json]` with aliases `writing-human-handoff` and `episode1-writing-human-review`.
- Updated the Episode 1 writing review bundle with `humanReviewHandoff` and an `inspectHumanReviewHandoff` command.
- Added human handoff commands/file references to the publish-workbench capability surface and AgentServer command discovery.

Product truth:
- Codex has recorded an agent review recommending v2 as `mixed-authorship-ready`.
- Human review is still required before canon approval.
- The review receipt does not mutate Nest, publish, schedule, or capture external receipts.
- The human handoff tells reviewers what to inspect next and which decisions they can record.

Proof:
- Not run in this pass. No shell syntax check, command execution, app build, or live `/state` inspection was performed.

Next move:
- Focused validation should run `bash -n script/agentctl.sh`, `script/agentctl.sh episode1-writing-review-ledger --json`, `script/agentctl.sh episode1-writing-human-handoff --json`, and `script/agentctl.sh episode1-writing-review-bundle --json`.

## 2026-06-20 - Episode 1 writing loop status surface added

Intent:
- Give humans and agents one calm status surface for the Episode 1 writing vertical slice.
- Reduce artifact pile anxiety by summarizing current draft, review, Nest intake, Tower packet, publication, and receipt state while pointing to authoritative files.

Changed:
- Added `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episode-1-writing-loop-status.json`.
- Added `script/agentctl.sh episode1-writing-loop-status [--json]` with aliases `writing-loop-status` and `episode1-writing-status-summary`.
- Updated the Episode 1 writing review bundle with `loopStatus` path/JSON and an `inspectLoopStatus` command.
- Added loop-status commands/file references to the publish-workbench capability surface and AgentServer command discovery.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/provenance-packets/episode-1-writing-provenance.json` so the loop status packet is part of the inspectable artifact graph.

Product truth:
- The loop status says v2 is the current agent-reviewed candidate and that human review is still required before canon approval.
- The loop status says Nest intake is planned but not proven ingested.
- The loop status says Tower v2 is review-ready but not publication-ready, not published, and has no receipts.
- This status packet summarizes and points; it is not itself proof of runtime behavior.

Proof:
- Not run in this pass. No shell syntax check, command execution, app build, or live `/state` inspection was performed.

Next move:
- Focused validation should run `bash -n script/agentctl.sh`, `script/agentctl.sh episode1-writing-loop-status --json`, and `script/agentctl.sh episode1-writing-review-bundle --json`, then decide whether to prove Nest intake in the live app.

## 2026-06-20 - Episode 1 writing Tower readiness and content-partner doctrine strengthened

Intent:
- Make Codex/Quipsly creative participation explicit enough that future agents do not wait for humans to supply every draft, packet, caption, article, or source artifact before exercising the product loop.
- Preserve the difference between "agent-created" and "placeholder" while keeping review, canon, publication, and receipt truth visible.
- Continue the Episode 1 writing vertical slice toward Tower readiness without claiming publication.

Changed:
- Strengthened `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/quipsly-content-partner-doctrine.md` with a clear "Codex as a working creator" section.
- Strengthened `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/nest-studio-tower-product-map.md` so agents may create serious publishable-intent artifacts when that helps the Nest -> Studio -> Tower loop move.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episode-1-writing-loop-status.json` so the loop protects the current v2 review target without freezing all future agent-created support work.
- Added content-partner policy language to `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/tower-readiness/episode-1-writing-tower-readiness.json`.
- Added the Tower readiness packet to `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/provenance-packets/episode-1-writing-provenance.json`.
- Exposed `script/agentctl.sh episode1-writing-tower-readiness` and `--json` in the AgentServer command surface.

Product truth:
- Codex and Quipslys may create serious first-pass book sections, articles, research packets, storyboards, social copy, publication packets, and other material worth reviewing.
- Serious agent-authored work is not placeholder work by default.
- Tower should block false publication claims, not block agent creation.
- The current Episode 1 v2 writing candidate remains not canon-approved, not proven ingested into Nest, not published, and not externally receipted.

Proof:
- Source-only update. No shell syntax check, command execution, app build, live app test, or runtime validation was performed in this pass.

Next move:
- Focused validation should run `bash -n script/agentctl.sh`, `script/agentctl.sh episode1-writing-tower-readiness --json`, `script/agentctl.sh episode1-writing-loop-status --json`, and `script/agentctl.sh episode1-writing-review-bundle --json`.
- After that, decide whether to prove Nest intake in the live app or continue using Codex-created serious artifacts to drive the next Nest -> Studio -> Tower loop.

## 2026-06-20 - Episode 1 v2 local Nest writing queue added

Intent:
- Move the Episode 1 writing vertical slice one step closer to real Nest capture without pretending live app ingestion has already happened.
- Give future Codex/Quipsly passes a durable, source-aware queue item that says exactly what draft should be appended, how it should be labeled, and what receipt would prove success.

Changed:
- Added `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/nest-queue/episode-1-writing-v2-queue.json`.
- Added `script/agentctl.sh episode1-writing-nest-queue [--json]` with aliases `writing-nest-queue-local` and `episode1-writing-local-queue`.
- Added the local Nest queue to the Episode 1 writing review bundle plumbing.
- Added local Nest queue commands to `WorkspaceView.swift` and `AgentServer.swift` command surfaces.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episode-1-writing-loop-status.json` with queue state and operator guidance.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/nest-intake/episode-1-writing-v2-nest-intake.json` to point to the local queue.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/provenance-packets/episode-1-writing-provenance.json` with the queue artifact.

Product truth:
- The local Nest queue is a durable handoff, not live Nest state.
- The queued action appends the Episode 1 v2 agent-authored draft as a reviewable writing block with explicit authorship, tags, provenance, and review state.
- Success still requires a live Nest receipt: app state or generated Nest writing packet must show the block exists with matching metadata.
- Queueing does not approve canon, publish, schedule, export media, or capture external receipts.

Proof:
- Source-only update. No shell syntax check, command execution, app build, live app test, or runtime validation was performed in this pass.

Next move:
- Focused validation should run `bash -n script/agentctl.sh`, `script/agentctl.sh episode1-writing-nest-queue --json`, and `script/agentctl.sh episode1-writing-review-bundle --json`.
- Then run the safe live Nest append command only when the app/session path is ready to produce a receipt.

## 2026-06-20 - Episode 1 destination copy packet added

Intent:
- Move Tower from broad publication readiness toward concrete destination-specific copy while keeping review, canon, media, publication, and receipt boundaries honest.
- Give humans and agents one place to inspect HGO page copy, YouTube description/title options, Patreon copy, social copy, LinkedIn copy, and short-caption seeds.

Changed:
- Added `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/publication-packets/hgo-episode-1-the-wednesday-rule-destination-copy-packet.md`.
- Added `script/agentctl.sh publication-destination-copy [--json]` with aliases `tower-destination-copy` and `episode1-writing-destination-copy`.
- Added destination-copy references to the Episode 1 writing review bundle plumbing.
- Added destination-copy commands to `WorkspaceView.swift` and `AgentServer.swift` command surfaces.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/tower-readiness/episode-1-writing-tower-readiness.json` so destination rows point to the destination copy packet where appropriate.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episode-1-writing-loop-status.json` with destination copy status and command.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/provenance-packets/episode-1-writing-provenance.json` with the destination copy artifact.

Product truth:
- This is serious agent-authored publishable-intent destination copy.
- It is not placeholder copy by default.
- It is still not canon-approved, not media/export-attached, not scheduled, not published, and not externally receipted.
- The packet should be reviewed before any destination post is created.

Proof:
- Source-only update. No shell syntax check, command execution, app build, live app test, or runtime validation was performed in this pass.

Next move:
- Focused validation should run `bash -n script/agentctl.sh`, `script/agentctl.sh publication-destination-copy --json`, `script/agentctl.sh episode1-writing-tower-readiness --json`, and `script/agentctl.sh episode1-writing-review-bundle --json`.
- Then either prove the live Nest append path or attach Studio export/shorts proof so Tower can move from copy readiness toward artifact readiness.

## 2026-06-20 - Episode 1 publication action queue added

Intent:
- Turn the Episode 1 Tower materials into an ordered operating queue instead of leaving humans or agents to infer the next step from scattered packets.
- Keep Nest review, live Nest append, Studio export proof, Tower copy review, HGO page creation, YouTube copy, and social/shorts publication connected in one cross-lane queue.

Changed:
- Added `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/tower-readiness/episode-1-publication-action-queue.json`.
- Added `script/agentctl.sh episode1-publication-action-queue [--json]` with aliases `publication-action-queue` and `tower-action-queue`.
- Added publication action queue commands to `WorkspaceView.swift` and `AgentServer.swift`.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/tower-readiness/episode-1-writing-tower-readiness.json` with the action queue path and command.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episode-1-writing-loop-status.json` with action queue status, path, command, and next-human-action guidance.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/provenance-packets/episode-1-writing-provenance.json` with the action queue artifact.

Product truth:
- The action queue says what should happen next; it does not perform the work.
- The queue intentionally spans Nest, Studio, and Tower so the vertical slice remains one product loop.
- The next currently honest actions are review, live Nest append proof, Studio export proof, destination-copy review, and then receipt-backed publication.

Proof:
- Source-only update. No shell syntax check, command execution, app build, live app test, or runtime validation was performed in this pass.

Next move:
- Focused validation should run `bash -n script/agentctl.sh`, `script/agentctl.sh episode1-publication-action-queue --json`, `script/agentctl.sh episode1-writing-loop-status --json`, and `script/agentctl.sh episode1-writing-review-bundle --json`.
- After validation, the strongest next product move is to prove either live Nest append or Studio export/shorts proof so Tower can advance from copy readiness toward artifact readiness.

## 2026-06-20 - Episode 1 Studio artifact proof requirements added

Intent:
- Define the exact Studio-side evidence Tower needs before Episode 1 can move from copy readiness toward artifact readiness.
- Avoid inventing another export system; point to the existing Episode Spine, publication-ready handoff, release export review, shorts export/contact sheet, social queue, podcast packet, and receipt cockpit command surfaces.

Changed:
- Added `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-studio-artifact-proof-requirements.json`.
- Added `script/agentctl.sh episode1-studio-artifact-proof-requirements [--json]` with aliases `studio-artifact-proof-requirements` and `episode1-studio-proof-requirements`.
- Added Studio proof requirement commands to `WorkspaceView.swift` and `AgentServer.swift`.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/tower-readiness/episode-1-publication-action-queue.json` so the Studio proof step points to the requirements packet.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/tower-readiness/episode-1-writing-tower-readiness.json` with the proof requirements path and command.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episode-1-writing-loop-status.json` with Studio proof status and command.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/provenance-packets/episode-1-writing-provenance.json` with the Studio proof requirements artifact.

Product truth:
- Studio proof requirements define needed evidence; they are not current export proof.
- Required artifact families are 16:9 episode master, 9:16 vertical master, selected social shorts, podcast audio, and Episode Spine/publication handoff state.
- Tower should not treat destination copy as media-ready until current artifact evidence is attached.
- Local artifacts and packets still do not equal platform publication receipts.

Proof:
- Source-only update. No shell syntax check, command execution, app build, live app test, runtime validation, or file-existence proof was performed in this pass.

Next move:
- Focused validation should run `bash -n script/agentctl.sh`, `script/agentctl.sh episode1-studio-artifact-proof-requirements --json`, and `script/agentctl.sh episode1-publication-action-queue --json`.
- After validation, the next high-value product move is to generate or inspect a current Episode 1 release/export review packet and attach its evidence to Tower.

## 2026-06-20 - Episode 1 Studio proof attachment queue added

Intent:
- Add a concrete place to attach current Studio export evidence once a release/export review is inspected.
- Preserve the distinction between historical export proof in the worklog and current proof that is strong enough to move Tower toward artifact readiness.

Changed:
- Added `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-studio-proof-attachment-queue.json`.
- Added `script/agentctl.sh episode1-studio-proof-attachment-queue [--json]` with aliases `studio-proof-attachment-queue` and `episode1-export-proof-queue`.
- Added Studio proof attachment queue commands to `WorkspaceView.swift` and `AgentServer.swift`.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-studio-artifact-proof-requirements.json` to point to the attachment queue.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/tower-readiness/episode-1-publication-action-queue.json` so the Studio export proof action points to the attachment queue.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/tower-readiness/episode-1-writing-tower-readiness.json` with the attachment queue path and command.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episode-1-writing-loop-status.json` with attachment queue status and next action.
- Updated `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/provenance-packets/episode-1-writing-provenance.json` with the attachment queue artifact.

Product truth:
- The queue has empty evidence slots for 16:9 master, 9:16 master, selected shorts, podcast audio, and Episode Spine/Receipt Cockpit state.
- The queue records the historical release folder mentioned in the worklog, but marks it as historical reference, not current proof.
- Nothing is artifact-ready from this queue alone.

Proof:
- Source-only update. No shell syntax check, command execution, app build, live app test, runtime validation, or current file-existence proof was performed in this pass.

Next move:
- Focused validation should run `bash -n script/agentctl.sh`, `script/agentctl.sh episode1-studio-proof-attachment-queue --json`, and `script/agentctl.sh episode1-publication-action-queue --json`.
- Then inspect or generate current Episode 1 release/export review evidence and fill the attachment queue from that proof.

## 2026-06-20 - Studio proof attachment generator source wiring

- Added `script/agentctl.sh episode1-studio-proof-attach /absolute/release-manifest-or-folder [/absolute/output.json]` as the operator bridge from current Studio export evidence into Tower proof attachment candidates.
- The command accepts a release/export manifest or folder, scans bounded candidate evidence, maps likely files/manifest fields into the existing Studio proof attachment slots, and emits a separate candidate packet instead of mutating the source queue.
- Updated Episode 1 Studio proof requirements, Studio proof attachment queue, publication action queue, writing loop status, and provenance packet to point operators and agents at the new generator.
- Exposed the command through the QuipslyStudio publication command dictionary, the agent command list, and the long publish workbench action list.
- Truth boundary: this pass did not run the generator, inspect current export files, validate media, publish, schedule, upload, or capture receipts. Candidate evidence remains candidate evidence until reviewed.
- Validation/build/tests: not run in this source-only wiring pass.

## 2026-06-20 - Latest Studio proof attachment rail

- Added `script/agentctl.sh episode1-studio-proof-attach-latest [/absolute/output.json]` so operators and agents can generate a Studio proof attachment packet from the latest known Episode 1 Tower export evidence without remembering the exact manifest path.
- Resolution order: `/Users/wall-e/Movies/QuipslyExports/Episode1Tower/latest-release-export-review.json`, then `latest-release-export-manifest.json`, then the newest plausible nested release review/manifest or artifact folder under the Episode 1 Tower export root.
- The latest command delegates to `episode1-studio-proof-attach`, so the proof packet shape and truth boundaries stay centralized.
- Updated Studio proof requirements, Studio proof attachment queue, Tower readiness, publication action queue, writing loop status, provenance, app command dictionary, agent command list, and publish workbench action list to expose both explicit and latest proof generation commands.
- Truth boundary: latest path convenience is not evidence approval. It creates candidate attachments only; it does not watch/listen, approve, upload, schedule, publish, or capture receipts.
- Validation/build/tests: not run in this source-only wiring pass.

## 2026-06-20 - Episode 1 vertical slice brief

- Added `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episode-1-vertical-slice-brief.json` as a single read-only coordination packet for the Episode 1 Nest -> Studio -> Tower dogfood loop.
- The brief names lane status, current evidence, next safe command, human-decision needs, and blocked claims for Nest writing/capture, Studio export proof, Tower publication readiness, and Codex/agent control.
- Added `script/agentctl.sh episode1-vertical-slice-brief [--json]` to inspect the brief from the CLI.
- Wired the brief into Episode 1 writing loop status, publication action queue, provenance, QuipslyStudio command dictionary, AgentServer command list, and the publish workbench action list.
- Truth boundary: this pass created a flight-board packet and command surface only. It did not ingest into Nest, generate exports, attach proof, approve canon, publish, schedule, validate runtime behavior, or capture receipts.
- Validation/build/tests: not run in this source-only coordination pass.

## 2026-06-20 - Generated vertical slice refresh command

- Added `script/agentctl.sh episode1-vertical-slice-refresh [/absolute/output.json]` so the Episode 1 vertical slice brief can be regenerated from current source packets instead of maintained only as a static snapshot.
- The refresh command reads the writing loop status, publication action queue, Studio proof attachment queue, and Tower readiness packet, then writes a generated `quipsly-episode-vertical-slice-brief` packet to the canonical brief path or an optional output path.
- Wired the refresh command into writing loop status, Tower readiness/action queues, Studio proof packets, provenance, QuipslyStudio command dictionary, AgentServer command list, and the publish workbench action list.
- Truth boundary: this pass did not run the refresh command. The command itself is designed to regenerate coordination state only; it does not ingest into Nest, export media, attach proof, approve canon, publish, schedule, validate runtime behavior, or capture receipts.
- Validation/build/tests: not run in this source-only coordination pass.

## 2026-06-20 - Vertical slice next-action rail

- Added `script/agentctl.sh episode1-vertical-slice-next [--json]` to turn the Episode 1 vertical-slice brief into a small operator next-action card.
- The command reads the current brief, recommends one immediate lane action, lists each lane's next command, and repeats blocked claims so operators do not confuse movement with completion.
- Wired the next-action command into the vertical-slice brief, writing loop status, Tower readiness/action queues, Studio proof packets, provenance, QuipslyStudio command dictionary, AgentServer command list, and the publish workbench action list.
- Product intent: reduce system anxiety by making the next safest move visible instead of forcing humans or agents to infer it from several coordination packets.
- Truth boundary: this pass did not run the command. The command only reads coordination state; it does not refresh state, ingest into Nest, export media, attach proof, approve canon, publish, schedule, validate runtime behavior, or capture receipts.
- Validation/build/tests: not run in this source-only coordination pass.

## 2026-06-20 - Content partner doctrine clarification

Updated core Quipsly doctrine to make Codex and other Quipslys explicit creative production partners, not merely test-data generators or placeholder machines.

Key clarification: agent-created content can be serious first-pass work intended for review, publication, or canonization. `placeholder` is now documented as an intentional disposable state, not the default status of anything created by an agent.

Operational consequence: Quipsly should not stall because a human has not supplied enough paragraphs, captions, storyboards, research packets, articles, or publication copy. Agents may create real material to move Nest, Studio, and Tower workflows forward, provided authorship, provenance, intent, review state, canon/publication boundaries, and reversibility remain visible.

No build, runtime validation, or deployment was run for this documentation-only doctrine pass.

## 2026-06-20 - Nest-first vertical slice command alignment

Aligned the Episode 1 vertical-slice coordination surfaces around the next honest product move: get the queued v2 writing candidate into live Nest state, then verify it with a Nest ingest receipt before claiming the writing/capture lane has moved.

Confirmed source discoverability for:
- `script/agentctl.sh episode1-writing-nest-ingest-receipt [--json]`
- `script/agentctl.sh episode1-vertical-slice-next [--json]`
- `script/agentctl.sh episode1-vertical-slice-refresh [/absolute/output.json]`

Patched one stale review-bundle helper command so the second-pass draft ingest carries the same lifecycle tags as the authoritative queue/intake packets: `book,writing,episode-1,agent-second-pass,needs-human-review,current-candidate`.

Truth boundary: this was a source-only alignment pass. The live Nest append command was not run, the ingest receipt checker was not run, Studio proof was not generated, no export was inspected, and no publication state changed.

## 2026-06-20 - Live Nest ingest receipt and content partner doctrine hardening

Confirmed the Episode 1 v2 writing candidate is now visible in live Nest state with a structured receipt check:

- Receipt: `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/nest-receipts/episode-1-writing-v2-nest-ingest-receipt.json`
- Status: `verified-live-nest-ingested`
- Matching live block count: `1`
- Correct live block id: `FD0BA71F-9C26-45C3-8208-522DA008E3FC`
- Review state: `needs-human-review`
- Authorship: `agent-authored`

Hardened the receipt path so the checker reports matching live block ids and a `nest-select-block` command instead of only string-presence proof. This is still a bridge until the live Nest writing packet exposes stable structured block receipts directly.

Fixed the `nest-serious-draft-file` wrapper so serious draft ingest can propagate `needs-human-review` instead of defaulting every file ingest to `agent-first-pass`.

Patched QuipslyStudio state publishing so future `/nest_writing_packet` state can expose the actual writing packet while preserving separate generation/file status under `nestWritingPacketState`. This source change needs a rebuild/relaunch before the running app reflects it cleanly.

Added `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/quipsly-content-partner-doctrine.md` and strengthened core doctrine docs to say Codex and Quipslys are full content partners, not placeholder machines. Agent-created content may be serious publishable-intent work, provided authorship, intent, provenance, review state, canon state, publication state, and reversibility remain explicit.

Truth boundary: no canon approval, no publication, no scheduling, no external platform receipt, no media export validation, no app rebuild, and no deploy were performed in this pass. There is also one earlier duplicate dogfood append from before the review-status fix; the receipt-backed candidate is the later `needs-human-review` block above.

## 2026-06-20 - Studio proof generator repaired and Tower readiness corrected

Repaired two embedded Python syntax errors in `apps/QuipslyStudio/script/agentctl.sh` that blocked `episode1-studio-proof-attach-latest` from running. `bash -n` was clean, but the actual command surfaced the embedded Python failures, so both levels of validation were needed.

Generated the latest Episode 1 Studio proof attachment candidate packet:

- `/Users/wall-e/Movies/QuipslyExports/Episode1Tower/episode1-latest-studio-proof-attachment-packet.json`

The generator found candidate evidence under:

- `/Users/wall-e/Movies/QuipslyExports/Episode1Tower/2026-06-19-episode1-spine-release`

Created a stronger current artifact proof review:

- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-current-studio-artifact-proof-review.json`

Important finding: macOS `mdls` metadata reports the current 16:9 master, 9:16 master, and podcast audio as about 8 seconds long. That means the release folder proves the Tower handoff can find candidate/test artifacts, but it does not prove current full-length Episode 1 publishable masters.

Updated coordination packets so they no longer overclaim:

- Nest v2 ingest remains verified with a live receipt.
- Studio proof status is now `test-export-evidence-found-full-episode-master-not-proven`.
- Tower queue is now `active-review-and-full-export-needed`.
- Full HGO/YouTube/Patreon/podcast readiness remains blocked until full-length export proof exists.
- Shorts candidates exist, but still need watch/listen review and receipt capture before posting claims.

Truth boundary: no media was published, uploaded, scheduled, canon-approved, or externally receipted. `mdls` is weaker than `ffprobe`; future proof should use the local engine/ffprobe when available.

## 2026-06-20 - Next-action rail now skips human-only blockers for agent work

Adjusted `script/agentctl.sh episode1-vertical-slice-next` so it does not recommend a lane that is explicitly waiting on human review when another agent-owned lane is actionable.

Before this change, the next-action packet kept pointing Codex at the Nest writing review lane even though that lane requires a human decision before canon approval. After the change, the recommended immediate action points to the Studio proof lane, where Codex can continue useful work by locating or generating full-length Episode 1 export proof.

Validation:

- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `script/agentctl.sh episode1-vertical-slice-next --json`

Truth boundary: this changes coordination behavior only. It does not approve the writing candidate, generate full-length media, publish, schedule, or capture external receipts.

## 2026-06-20 - Content partner doctrine and full-length Episode 1 proof correction

Strengthened the Quipsly content partner doctrine: Codex and Quipslys count as creative production participants in the workflow, not just helpers waiting on human-supplied material. Serious agent-created work is allowed and should be treated as real reviewable candidate material unless explicitly labeled placeholder.

Core boundary preserved: agent-created work must keep authorship, intent, provenance, review state, canon state, publication state, and reversibility visible. This is not permission for invisible authorship, fake provenance, silent canon mutation, hidden publishing, or receipt-free publication claims.

Repaired the `episode1-studio-proof-attach-latest` resolver so it no longer chooses the newest smoke export by recency alone. It now searches known Episode 1 export roots and prefers full-length artifact evidence for 16:9, 9:16, and podcast audio.

Generated a latest-fit Studio proof attachment packet from the full-length Episode 1 release folder:

- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-latest-fit-studio-proof-attachment-packet.json`
- source folder: `/Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-17-release-candidate`

Current best Studio proof review remains:

- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-full-release-artifact-proof-review.json`
- status: `full-length-artifact-metadata-present-needs-review`

Updated the Studio proof queue, Tower publication action queue, and writing loop status so they no longer say the full export is missing. New truthful state: full-length Episode 1 artifacts exist by macOS metadata and are ready for watch/listen review, not automatic publication.

Validation run:

- `bash -n /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh`
- `script/agentctl.sh episode1-studio-proof-attach-latest /Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-latest-fit-studio-proof-attachment-packet.json`

Truth boundary: no app rebuild, no media watch/listen approval, no canon approval, no upload, no schedule, no publication, and no external receipt capture happened in this pass.

## 2026-06-20 - Episode 1 artifact watch/listen review sheet

Added `script/agentctl.sh episode1-artifact-watch-review` to generate a practical watch/listen review worksheet from the current full-length Episode 1 artifact metadata proof.

Generated:

- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review.md`

Updated Studio/Tower coordination packets to point to that sheet as the next review surface before artifact-ready or publication-ready claims.

Truth boundary: the worksheet was generated but not completed. This does not approve the artifacts, publish, upload, schedule, or capture receipts.

## 2026-06-20 - Artifact review decision ledger

Added `script/agentctl.sh episode1-artifact-watch-review-decision pass|needs-review|needs-fix|reject [actor] [note]` so Episode 1 artifact review can move through explicit states instead of living only as a Markdown worksheet.

Created/updated:

- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review-ledger.jsonl`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review-current.json`

Recorded the current honest decision as `needs-review`, not `needs-fix`: metadata proves full-length local artifacts exist, but no real playback watch/listen review has been completed in this run.

Updated the vertical-slice generator so current next action points to completing artifact watch/listen review, not regenerating proof packets.

Validation run:

- `bash -n /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh`
- `script/agentctl.sh episode1-artifact-watch-review-decision needs-review Codex ...`
- `script/agentctl.sh episode1-vertical-slice-refresh && script/agentctl.sh episode1-vertical-slice-next --json`

Truth boundary: no artifact was approved, published, uploaded, scheduled, or receipted. The current state is intentionally still blocked on actual watch/listen review.

## 2026-06-20 - Watch/listen review sheet Markdown repair and visual observation

Fixed the artifact watch/listen worksheet generator after discovering it wrote literal `\\n` strings instead of real Markdown line breaks. Regenerated:

- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review.md`

Inspected the existing social publication contact sheet:

- `/Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-17-release-candidate/episode1-the-wednesday-rule-social-publication-queue/episode1-social-publication-contact-sheet.jpg`

Recorded a delegated visual observation in the worksheet: the contact sheet exists and shows vertical Charlie-centered Episode 1 frames; the frames are dark but readable. This supports `visual-candidates-exist`, not posting approval.

Truth boundary: full 16:9 playback review, full 9:16 playback review, podcast audio listen review, selected-short audio/visual review, and final platform copy review remain open.

## 2026-06-20 - Episode 1 artifact review assist packet

Added `script/agentctl.sh episode1-artifact-review-assist [/absolute/output.json]` to generate a review-assist packet from the current full-length Episode 1 artifact proof.

Generated:

- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-assist.json`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-assist.md`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-review-thumbnails/episode-16x9-master.png`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-review-thumbnails/episode-9x16-master.png`

Assist findings:

- `afinfo` exits successfully for the 16:9 master, 9:16 master, and podcast audio master.
- The standalone podcast audio reports AAC stereo at about `4443.695s`.
- The video masters include AAC stereo audio data, including one duration matching about `4443.695s` and a second shorter duration around `4238.420s`; this is review-worthy before publication claims.
- QuickLook thumbnails exist for both video masters.
- The 16:9 thumbnail shows a side-by-side moment with Charlie large and Homer partially cropped at the right edge; review before publication approval.
- The 9:16 thumbnail shows Charlie-centered vertical framing; dark but coherent.

Updated the watch/listen worksheet with the assist packet references.

Truth boundary: this is machine-assisted pre-review evidence, not full watch/listen review, approval, upload, schedule, publication, or receipt capture.

## 2026-06-20 - Episode 1 sampled contact sheet visual review

Inspected resized review previews for the full-length Episode 1 16:9 and 9:16 sampled contact sheets.

Observed:

- Both full-length video exports generated 12 sampled frames with zero extraction errors.
- The 16:9 sample sheet is visually coherent and episode-relevant, but many sampled frames show a composited/split layout with Charlie large and Homer partially visible/cropped at the right edge.
- The 9:16 sample sheet is visually coherent and consistently Charlie-centered.
- Frames are dark but readable.
- No sampled frame showed obvious decode failure, black-only corruption, or wrong-episode content.

Updated:

- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-sampled-contact-sheets.md`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review.md`

Truth boundary: visual sampling now has a delegated observation, but full playback, audio listen, pacing, start/end, selected shorts, and publication readiness remain unapproved.

## 2026-06-20 - Episode 1 artifact machine sanity review

Generated automated pre-review evidence for the full-length Episode 1 artifacts.

Checked:

- ffprobe container and stream metadata
- proof-duration versus ffprobe-duration drift
- expected video/audio stream presence
- short sampled-audio volume checks near the start, middle, and end where possible

Generated:

- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-machine-sanity-review.json`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-machine-sanity-review.md`

Result: `machine-sanity-review-generated-needs-watch-listen-review` with `0` blocking issues and `0` warnings.

Truth boundary: this is machine pre-review evidence, not full watch/listen review, artifact approval, upload, schedule, publication, or receipt capture.

## 2026-06-20 - Episode 1 artifact review samples

Generated short operator review samples from the full-length Episode 1 artifacts.

Generated:

- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-samples.json`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-samples.md`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-samples/episode-16x9-master-start.mp4`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-samples/episode-16x9-master-middle.mp4`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-samples/episode-16x9-master-tail-warning.mp4`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-samples/episode-9x16-master-start.mp4`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-samples/episode-9x16-master-middle.mp4`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-samples/episode-9x16-master-tail-warning.mp4`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-samples/podcast-audio-master-start.m4a`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-samples/podcast-audio-master-middle.m4a`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-samples/podcast-audio-master-tail-warning.m4a`

Result:

- `review-samples-generated-needs-watch-listen-review`
- `0` failed samples

Truth boundary: samples are review aids. They do not approve full playback, final pacing, selected shorts, upload, schedule, publication, or receipts.

## 2026-06-20 - Episode 1 flight board now points to review station

Adjusted the Episode 1 vertical-slice brief generator so the Studio lane recommends opening the local review station when it exists, instead of defaulting to the raw watch/listen worksheet.

Changed:

- `script/agentctl.sh episode1-vertical-slice-refresh` now prefers `currentArtifactReviewStationHtml` for `full-length-artifact-watch-listen-review-needed` state.
- The next operator sequence now says to open the review station, sample the start/middle/tail clips, then record the review decision.

Proof:

- `bash -n /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh`
- `script/agentctl.sh episode1-vertical-slice-refresh && script/agentctl.sh episode1-vertical-slice-next --json`

Result:

- Recommended immediate action now points to `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-station.html`.

Truth boundary:

- This improves review ergonomics only. It does not approve artifacts, publish, upload, schedule, or capture receipts.

## 2026-06-20 - Review station decision controls

Upgraded the Episode 1 local review station from a passive sample page into a small review cockpit.

Changed:

- Added persistent local checklist items for 16:9, 9:16, and podcast audio start/middle/tail samples.
- Added copyable decision commands for `needs-review`, `needs-fix`, `reject`, and `pass`.
- Kept the official review state tied to `episode1-artifact-watch-review-decision`; browser checkboxes are explicitly convenience state only.

Proof:

- `python3 -m py_compile /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/episode1_artifact_review_station.py`
- `script/agentctl.sh episode1-artifact-review-station`
- HTML check confirmed `data-review-check`, `Copy command`, `needs-fix`, `Pass artifact review`, `localStorage`, and sample clip references are present.
- `script/agentctl.sh episode1-vertical-slice-refresh && script/agentctl.sh episode1-vertical-slice-next --json` still points to the review station.

Truth boundary:

- The station makes review easier but does not itself approve artifacts or advance Tower readiness.

## 2026-06-20 - Episode 1 tail-audio diagnostic tightened

Strengthened the artifact sanity review and sample generation around the Episode 1 video-master tail-audio warning.

Changed:

- `episode1_artifact_sanity_review.py` now compares longest video-stream duration to longest audio-stream duration.
- The 16:9 and 9:16 masters now explicitly warn that video runs about `135.14s` longer than the longest audio stream.
- `episode1_artifact_review_samples.py` now generates an expected audio-end boundary sample for video masters when video extends beyond expected audio duration.
- The review station checklist now includes audio-end boundary checks for 16:9 and 9:16.

Generated:

- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-samples/episode-16x9-master-audio-end-boundary.mp4`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-samples/episode-9x16-master-audio-end-boundary.mp4`

Proof:

- `python3 -m py_compile /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/episode1_artifact_sanity_review.py`
- `script/agentctl.sh episode1-artifact-sanity-review`
- `python3 -m py_compile /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/episode1_artifact_review_samples.py`
- `script/agentctl.sh episode1-artifact-review-samples`
- `python3 -m py_compile /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/episode1_artifact_review_station.py`
- `script/agentctl.sh episode1-artifact-review-station`
- `script/agentctl.sh episode1-vertical-slice-refresh && script/agentctl.sh episode1-vertical-slice-next --json`

Truth boundary:

- This makes the tail issue more diagnosable. It does not decide whether the silence/padding is acceptable.

## 2026-06-20 - Episode 1 artifact machine sanity review

Generated automated pre-review evidence for the full-length Episode 1 artifacts.

Checked:

- ffprobe container and stream metadata
- proof-duration versus ffprobe-duration drift
- expected video/audio stream presence
- short sampled-audio volume checks near the start, middle, and end where possible

Generated:

- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-machine-sanity-review.json`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-machine-sanity-review.md`

Result: `machine-sanity-review-generated-with-warnings-needs-watch-listen-review` with `0` blocking issues and `2` warnings.

Truth boundary: this is machine pre-review evidence, not full watch/listen review, artifact approval, upload, schedule, publication, or receipt capture.

## 2026-06-20 - Episode 1 artifact machine sanity review

Generated automated pre-review evidence for the full-length Episode 1 artifacts.

Checked:

- ffprobe container and stream metadata
- proof-duration versus ffprobe-duration drift
- expected video/audio stream presence
- short sampled-audio volume checks near the start, middle, and end where possible

Generated:

- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-machine-sanity-review.json`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-machine-sanity-review.md`

Result: `machine-sanity-review-generated-with-warnings-needs-watch-listen-review` with `0` blocking issues and `4` warnings.

Truth boundary: this is machine pre-review evidence, not full watch/listen review, artifact approval, upload, schedule, publication, or receipt capture.

## 2026-06-20 - Episode 1 tail-trim candidate surfaced in review station

- Generated non-destructive Episode 1 tail-trim candidate artifacts under `/Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-20-tail-trim-candidate`.
- Confirmed the candidate trims the video masters from about `4578.833333s` down to about `4443.833333s`, matching the longest program audio boundary instead of leaving the original ~135s video tail unresolved.
- Updated the artifact review station generator so it loads `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-tail-trim-candidate.json` when present and displays the candidate artifacts directly in the review page.
- Updated the watch/listen worksheet with a tail-trim candidate section so the proposed Studio fix is visible in the durable review trail.
- Refreshed Studio/Tower/current-state packets so operators and agents can find the candidate through the same review station/action queue path.

Truth boundary: this is a proposed Studio fix, not a replacement approval. Tower remains blocked until the review station samples and candidate ending are reviewed and an explicit artifact decision is recorded.

Lesson: proposed fixes, accepted replacements, artifact approvals, and published receipts must remain separate states. Quipsly should make the next decision obvious without smuggling approval into file generation.

## 2026-06-20 - Tail-trim candidate review samples added

- Updated `episode1_tail_trim_candidate.py` so each non-destructive tail-trim candidate now carries a short ending review sample.
- Generated focused candidate-ending samples in `/Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-20-tail-trim-candidate/review-samples`:
  - `episode-16x9-master-candidate-ending-sample.mp4`
  - `episode-9x16-master-candidate-ending-sample.mp4`
  - `podcast-audio-master-candidate-ending-sample.m4a`
- Updated `episode1_artifact_review_station.py` so the local review station embeds those short ending samples instead of making the reviewer start from full-length replacement candidates.
- Regenerated the tail-trim candidate packet and review station. Current candidate state reports `failedArtifactCount=0` and `failedCandidateSampleCount=0`.
- Refreshed the Episode 1 vertical-slice flight board; the correct next action remains Studio watch/listen review before any Tower artifact-ready claim.

Truth boundary: candidate ending samples make review easier. They still do not approve the tail trim, replace originals, publish, schedule, upload, or create external receipts.

Lesson: the product should make review tasks small and concrete without hiding the larger artifact graph. This is how Quipsly reduces systems anxiety while preserving provenance.

## 2026-06-20 - Tail-trim candidate promotion path added without fake approval

- Added `script/episode1_tail_trim_promote.py` to record an explicit decision about whether the Episode 1 tail-trim candidate should become the selected artifact set for watch/listen review.
- Added `script/agentctl.sh episode1-tail-trim-promote promote-for-review|reject-candidate [actor] [note]`.
- Updated `episode1-artifact-watch-review-decision` so, if a promoted tail-trim artifact set exists, the review decision records the selected candidate paths instead of silently reviewing the old long-tail originals.
- Updated the artifact review station so the tail-trim candidate section exposes copyable commands to select the candidate for review or reject it.
- Regenerated the review station and refreshed the Episode 1 vertical-slice flight board.

Truth boundary: the promotion command exists but was not run in this pass. No candidate was selected, no final artifact review passed, no Tower artifact-ready claim was made, and no publication or receipt state changed.

Lesson: generation, selection, review pass, publication, and receipt capture are separate verbs. Quipsly should make those verbs easy to perform deliberately, but should not collapse them just to reduce the number of files.

## 2026-06-20 - Tail-trim candidate machine preflight added

- Added `script/episode1_tail_trim_candidate_sanity.py` to perform a non-mutating preflight over Episode 1 tail-trim candidate artifacts and their focused ending samples.
- Added `script/agentctl.sh episode1-tail-trim-candidate-sanity`.
- The preflight checks candidate existence, duration, stream presence, expected 16:9/9:16 dimensions, ending sample duration, and ending sample audio volume.
- Current result: `tail-trim-candidate-machine-sanity-ok`, `errorCount=0`, `warningCount=0`.
- Regenerated the artifact review station so the machine preflight appears next to the tail-trim candidate review samples.
- Refreshed the Episode 1 vertical-slice flight board; the correct next action remains watch/listen review, not Tower publication.

Truth boundary: this preflight means the tail-trim candidate is structurally sane enough to review. It does not approve artifacts, replace originals, publish, schedule, upload, or capture receipts.

Lesson: Quipsly should use machine checks to reduce dumb uncertainty, then keep the human/agent review decision explicit. Preflights calm the workflow; they do not become fake readiness.

## 2026-06-20 - Episode 1 artifact review status reader added

- Added `script/episode1_artifact_review_status.py` to aggregate the current Episode 1 artifact review state into one read-oriented packet.
- Added `script/agentctl.sh episode1-artifact-review-status [--json]`.
- The status reader joins the review station, tail-trim candidate, tail-trim sanity, optional promotion decision, current watch/listen review decision, and queue statuses into one current answer.
- Current status is `tail-candidate-sane-needs-ending-review`.
- Current recommended action is to open the review station, review the focused ending samples, then explicitly select or reject the candidate.
- Fixed `--json` output so it emits exactly one parseable JSON object instead of a human result plus machine payload.

Truth boundary: this is a status reader. It does not generate media, select candidates, approve artifacts, publish, schedule, upload, or capture receipts.

Lesson: when a workflow starts needing tribal memory to know the next step, add a state reader. Human mode can explain; machine mode must parse cleanly.

## 2026-06-20 - Artifact pass guardrail added for sane tail-trim candidates

- Updated `episode1-artifact-watch-review-decision pass` so it refuses to pass the old original artifact set while a sane tail-trim candidate exists but has not been selected or rejected.
- The pass command now exits with `blocked-tail-candidate-awaits-explicit-selection` unless one of these is true:
  - a tail-trim candidate has been explicitly promoted for watch/listen review, or
  - the pass note includes `accept-originals-with-tail-warning` to intentionally accept the original long-tail behavior.
- Updated the artifact review station copy and pass command label so the human-facing path says `Pass selected artifact review` instead of implying the original artifacts can be passed casually.
- Ran a negative guardrail test: a pass attempt without selected candidate exited `3`, printed safe commands, and did not append to `episode-1-artifact-watch-listen-review-ledger.jsonl`.

Truth boundary: this protects the review flow from accidental approval. It does not select the tail candidate, pass review, publish, schedule, upload, or capture receipts.

Lesson: once the system knows a sane fix candidate exists, approving the old path must require explicit intent. This is how Quipsly lowers anxiety without becoming bossy or brittle.

## 2026-06-20 - Tail-trim ending contact sheets added and visually inspected

- Updated `episode1_tail_trim_candidate_sanity.py` so video ending samples generate lightweight contact sheets during machine preflight.
- Updated `episode1_artifact_review_station.py` so those contact sheets are embedded in the Tail-trim machine preflight section.
- Regenerated the tail-trim candidate sanity packet and review station.
- Verified generated contact sheets exist for:
  - `/Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-20-tail-trim-candidate/review-samples/episode-16x9-master-candidate-ending-sample-contact-sheet.jpg`
  - `/Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-20-tail-trim-candidate/review-samples/episode-9x16-master-candidate-ending-sample-contact-sheet.jpg`
- Visual inspection note: both contact sheets are coherent and episode-relevant. They show Charlie in the dark studio near the candidate ending. The 9:16 crop is tight and readable. No black-frame, wrong-episode, or obvious visual corruption was visible in the sampled frames.

Truth boundary: this visual inspection helps review confidence, but it is not a full watch/listen pass. The current state remains `tail-candidate-sane-needs-ending-review`, and the candidate still needs explicit selection or rejection before artifact pass.

Lesson: review assistance should make evidence cheap to inspect without laundering it into approval. Contact sheets are an anxiety reducer, not a receipt.

## 2026-06-20 - Content partner doctrine sharpened

- Updated `docs/quipsly/quipsly-content-partner-doctrine.md` to make explicit that Codex and Quipslys occupy a human-equivalent creative seat for workflow purposes.
- Updated `docs/quipsly/quipsly-assistant-boundaries.md` so assistants are expected to create serious candidate content when the project needs material, not wait passively for every human first draft.
- Updated `docs/coordination/quipsly-app-surface-doctrine.md` so writing, study, marketing, and publishing surfaces treat agent-created work as real creative material when it has publishable intent.

Truth boundary: this does not make agents legal owners, account owners, source witnesses, final approvers, publishers, or receipt authorities. It removes the accidental product bottleneck where agent-created work was treated as placeholder by author type rather than by purpose.

Lesson: Quipsly's anti-black-box principle is not anti-AI-writing. It is anti-hidden-state, anti-fake-provenance, and anti-fake-finality. Agents can write, edit, research, and produce seriously; Quipsly must keep authorship, review, canon, publication, and receipts visible.

## 2026-06-20 - Episode 1 artifact review handoff bundle added

- Added `script/episode1_artifact_review_handoff.py` to generate a read-only handoff bundle for the current Episode 1 artifact-review state.
- Added `script/agentctl.sh episode1-artifact-review-handoff [--json]`.
- The handoff bundle gathers the refreshed artifact-review status, review station path, watch/listen worksheet, tail-trim candidate artifacts, ending samples, contact sheets, promotion state, current review decision, blocked claims, and safe next commands.
- Generated and validated:
  - `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-handoff.json`
  - `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-handoff.md`
- Validation run:
  - `python3 -m py_compile script/episode1_artifact_review_handoff.py script/episode1_artifact_review_status.py`
  - `bash -n script/agentctl.sh`
  - `script/agentctl.sh episode1-artifact-review-handoff --json | python3 -m json.tool`

Truth boundary: this handoff bundle is a coordination/read model. It does not generate media, select candidates, approve artifacts, publish, upload, schedule, or capture receipts. Current state remains `tail-candidate-sane-needs-ending-review`.

Lesson: when a workflow spans many files, add a safe status/handoff surface instead of relying on memory. Read models reduce systems anxiety without pretending decisions have been made.

## 2026-06-20 - Episode 1 artifact review launcher added

- Added `script/episode1_artifact_review_launcher.py` as a safe operator layer over the Episode 1 artifact-review handoff bundle.
- Added `script/agentctl.sh episode1-artifact-review-launch [--json|--open]`.
- The default/JSON path refreshes status and handoff truth, then writes:
  - `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-launch-plan.json`
  - `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-review-launch-plan.md`
- The optional `--open` mode opens the local review station and contact sheets, but still records no review decision.
- Validation run:
  - `python3 -m py_compile script/episode1_artifact_review_launcher.py script/episode1_artifact_review_handoff.py script/episode1_artifact_review_status.py`
  - `bash -n script/agentctl.sh`
  - `script/agentctl.sh episode1-artifact-review-launch --json | python3 -m json.tool`

Truth boundary: this launcher only lists or opens review evidence. It does not select candidates, approve artifacts, publish, upload, schedule, or capture receipts. Current state remains `tail-candidate-sane-needs-ending-review`.

Lesson: make the next operator action easy without making it automatic. Safe defaults plus explicit power modes reduce anxiety and prevent accidental finality.

## 2026-06-20 - Vertical-slice brief now points to artifact review handoff

- Updated `script/agentctl.sh episode1-vertical-slice-refresh` so the shared Episode 1 Nest -> Studio -> Tower brief reads the current artifact-review handoff and launch-plan packets when present.
- The Studio lane now reports `tail-candidate-sane-needs-ending-review` when the tail-trim candidate handoff is the controlling Studio truth.
- The Studio lane now points the next operator action to `script/agentctl.sh episode1-artifact-review-launch --open` instead of the older generic review station path.
- Added a `reviewState` object to the Studio lane with artifact handoff state, launch mode, focused ending sample count, contact sheet count, tail-trim sanity, and promotion path.
- Added a top-level `chosenLane` mirror to `episode1-vertical-slice-next --json` so agents can read the immediate lane/action without relying only on the nested `recommendedImmediateAction` shape.
- Validation run:
  - `bash -n script/agentctl.sh`
  - `script/agentctl.sh episode1-vertical-slice-refresh`
  - `script/agentctl.sh episode1-vertical-slice-brief --json | python3 -m json.tool`
  - `script/agentctl.sh episode1-vertical-slice-next --json | python3 -m json.tool`

Truth boundary: this update only improves read models and operator guidance. It does not select the tail-trim candidate, approve artifacts, ingest writing, approve canon, publish, upload, schedule, validate runtime playback, or capture external receipts. Current next action remains artifact ending review.

Lesson: keep one shared flight board, but let specialized lane packets carry detailed truth. A good read model points to evidence instead of becoming a second source of truth.

## 2026-06-20 - Tail-trim ending evidence packet added

- Added `script/episode1_tail_trim_ending_review.py` to inspect the focused Episode 1 tail-trim ending samples without promoting or approving them.
- Added `script/agentctl.sh episode1-tail-trim-ending-review [--json]`.
- The command reads the current artifact-review handoff, probes all focused ending samples, measures sample audio when present, and generates final-frame stills for video ending samples.
- Generated evidence outputs:
  - `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-tail-trim-ending-review-evidence.json`
  - `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-tail-trim-ending-review-evidence.md`
  - `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-tail-trim-ending-review-evidence/episode-16x9-master-ending-last-frame.jpg`
  - `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-tail-trim-ending-review-evidence/episode-9x16-master-ending-last-frame.jpg`
- Current evidence status: `ending-evidence-ready-needs-human-or-delegated-review` with `errorCount=0` and `warningCount=0`.
- Updated `episode1-vertical-slice-refresh` so the Studio lane exposes the tail-trim ending evidence status, warning count, and error count in the shared Nest -> Studio -> Tower flight board.
- Validation run:
  - `python3 -m py_compile script/episode1_tail_trim_ending_review.py script/episode1_artifact_review_handoff.py`
  - `bash -n script/agentctl.sh`
  - `script/agentctl.sh episode1-tail-trim-ending-review --json | python3 -m json.tool`
  - `script/agentctl.sh episode1-vertical-slice-refresh`

Truth boundary: this evidence packet strengthens review support, but it does not select the tail-trim candidate, approve artifacts, publish, upload, schedule, or capture receipts. Human or explicitly delegated creative review is still required before candidate promotion.

Lesson: review evidence should be cheap, concrete, and reusable. But evidence is not a decision; keep the decision command explicit.

## 2026-06-20 - Tail-trim candidate selected for full watch/listen review

- Visually inspected the generated Episode 1 tail-trim ending evidence:
  - `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-tail-trim-ending-review-evidence/episode-16x9-master-ending-last-frame.jpg`
  - `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-tail-trim-ending-review-evidence/episode-9x16-master-ending-last-frame.jpg`
  - `/Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-20-tail-trim-candidate/review-samples/episode-16x9-master-candidate-ending-sample-contact-sheet.jpg`
  - `/Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-20-tail-trim-candidate/review-samples/episode-9x16-master-candidate-ending-sample-contact-sheet.jpg`
- Visual evidence was coherent and episode-relevant: dark studio ending, Charlie visible, no obvious wrong-episode frame, black-frame corruption, or broken crop in the sampled evidence.
- Promoted the tail-trim candidate for full watch/listen review with:
  - `script/agentctl.sh episode1-tail-trim-promote promote-for-review Codex "Ending evidence reviewed by Codex from machine sanity, audio-volume summaries, contact sheets, and ending stills; select tail-trim candidate as the artifact set for full watch/listen review. This is not artifact approval or publication readiness."`
- Current artifact handoff state is now `tail-candidate-selected-needs-watch-listen-review` with three selected artifacts.
- Verified Tower remains blocked: publication action queue says artifact watch/listen review still has not passed and publication/published claims remain blocked.
- Fixed a vertical-slice read-model bug where the Studio lane status reflected the artifact handoff but an older fallback overwrote the next command with `episode1-studio-proof-attach-latest`.
- Revalidated:
  - `bash -n script/agentctl.sh`
  - `script/agentctl.sh episode1-artifact-review-handoff --json | python3 -m json.tool`
  - `script/agentctl.sh episode1-vertical-slice-refresh`
  - `script/agentctl.sh episode1-vertical-slice-next --json | python3 -m json.tool`

Truth boundary: this selected the tail-trim candidate as the artifact set for full watch/listen review. It did not approve final artifacts, approve writing canon, make Tower publication-ready, publish, upload, schedule, or capture receipts.

Lesson: selecting a candidate for review is a real state transition, but it is not final approval. After every state transition, refresh downstream read models to catch accidental overclaiming or stale fallback behavior.

## 2026-06-20 13:40 MDT - Selected artifact review station added

Intent:
- Make the post-promotion Episode 1 review step concrete and safe: selected tail-trim artifacts need full watch/listen review before any artifact-ready or Tower publication-readiness claim.

Changed:
- Added `script/episode1_selected_artifact_review_station.py`.
- Added `script/agentctl.sh episode1-selected-artifact-review-station [--json|--open]`.
- Updated the vertical-slice flight board so the Studio next action opens the selected artifact review station instead of presenting the pass command as the immediate move.
- Generated selected review station artifacts:
  - `docs/quipsly/studio-proof/episode-1-selected-artifact-review-station.html`
  - `docs/quipsly/studio-proof/episode-1-selected-artifact-review-station.json`
  - `docs/quipsly/studio-proof/episode-1-selected-artifact-review-station.md`

Proof:
- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_artifact_review_station.py` passed.
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- `apps/QuipslyStudio/script/agentctl.sh episode1-selected-artifact-review-station --json | python3 -m json.tool` passed with 3 selected artifacts and 0 missing selected artifacts.
- `apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-refresh && apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-next --json | python3 -m json.tool` now points Studio at `script/agentctl.sh episode1-selected-artifact-review-station --open`.

Residual risk:
- The selected artifacts still have not passed full human or explicitly delegated watch/listen review.
- The station is a review surface, not a runtime publication or upload proof.

Next move:
- Perform or delegate full watch/listen review on the selected 16:9, 9:16, and podcast-audio artifacts, then record pass/needs-fix/reject with `episode1-artifact-watch-review-decision`.

Follow-up proof:
- Refreshed the Episode 1 vertical-slice brief after adding the selected station to the evidence map.
- `episode1-vertical-slice-next --json` now recommends `script/agentctl.sh episode1-selected-artifact-review-station --open` and lists `episode-1-selected-artifact-review-station.html` in Studio current evidence/source packets.

## 2026-06-20 13:49-13:53 MDT - Selected artifact full-review assist added

Intent:
- Make the selected Episode 1 artifact watch/listen review less scary and harder to fake by adding full-artifact probes, checkpoint stills, and a structured review checklist.

Changed:
- Added `script/episode1_selected_artifact_review_assist.py`.
- Added `script/agentctl.sh episode1-selected-artifact-review-assist [--json]`.
- Generated selected artifact assist artifacts:
  - `docs/quipsly/studio-proof/episode-1-selected-artifact-review-assist.html`
  - `docs/quipsly/studio-proof/episode-1-selected-artifact-review-assist.json`
  - `docs/quipsly/studio-proof/episode-1-selected-artifact-review-assist.md`
  - `docs/quipsly/studio-proof/episode-1-selected-artifact-review-assist/` checkpoint stills.
- Added the assist HTML to the Episode 1 vertical-slice evidence map/source packets.
- Cleaned the FFmpeg still extraction command with `-update 1` so single-image generation produces less noisy output.

Proof:
- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_artifact_review_assist.py` passed.
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- `script/agentctl.sh episode1-selected-artifact-review-assist --json` passed with 3 artifacts, 0 warnings, 0 errors, 5 checkpoint stills for 16:9, 5 checkpoint stills for 9:16, and 0 stills for podcast audio.
- `script/agentctl.sh episode1-vertical-slice-refresh && script/agentctl.sh episode1-vertical-slice-next --json` includes `selectedArtifactReviewAssist` and keeps the next action on selected artifact watch/listen review.
- Visual spot-checks of opening and ending stills for 16:9 and 9:16 looked coherent: Homer outdoor opening source and Charlie dark-studio ending source/crop, with no obvious black-frame corruption in sampled frames.

Residual risk:
- This assist is not a full watch/listen review and does not approve artifacts.
- The 9:16 ending crop is usable in sampled frames but still needs human/creative review for taste.

Next move:
- Open the selected review station and assist together, perform/delegate full watch/listen review, then record `pass`, `needs-fix`, `needs-review`, or `reject` through `episode1-artifact-watch-review-decision`.

## 2026-06-20 14:00-14:03 MDT - Segmented Episode 1 selected artifact review ledger

Intent:
- Turn the selected Episode 1 watch/listen review from one huge binary chore into small, receipt-backed review chunks.
- Preserve the new content-partner doctrine in practice: Codex/Quipsly-created artifacts can be serious publication candidates, but still need explicit review progress and final approval before Tower claims.

Changed:
- Added `episode1_selected_watch_review_progress.py` to create a segmented review packet for the selected 16:9 master, 9:16 master, and podcast audio artifacts.
- Added `episode1-selected-watch-review-progress` and `episode1-selected-watch-review-mark` commands to `agentctl.sh`.
- Updated the Episode 1 vertical-slice board so Studio now points to the segmented progress ledger before any final watch/listen decision.

Proof:
- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_watch_review_progress.py` passed.
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- `apps/QuipslyStudio/script/agentctl.sh episode1-selected-watch-review-progress --json | python3 -m json.tool` generated 15 pending review items across 3 artifacts and 5 time segments.
- `apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-refresh && apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-next --json | python3 -m json.tool` now recommends `script/agentctl.sh episode1-selected-watch-review-progress --html`.

Residual risk:
- No segment has been marked reviewed yet; this is the review scaffold, not artifact approval.
- Browser media fragments on local files may not always jump to exact segment starts, so the timestamps remain the authoritative review guide.

Next move:
- Open the segmented ledger, review Episode 1 chunks honestly, record issues or reviewed segments, then only record the final artifact decision after all required items are complete.

## 2026-06-20 14:04-14:10 MDT - Selected segment evidence board

Intent:
- Make Episode 1 artifact review calmer and more concrete by generating segment-level evidence for the selected 16:9, 9:16, and podcast audio artifacts.
- Keep the boundary clear: automated evidence helps humans and agents review, but does not mark anything approved.

Changed:
- Added `episode1_selected_segment_evidence.py` to generate stills and segment evidence from the selected watch/listen progress packet.
- Added `episode1-selected-segment-evidence` to `agentctl.sh`.
- Updated the Episode 1 vertical-slice Studio evidence list so the segment evidence page is discoverable once generated.

Proof:
- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_segment_evidence.py` passed.
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- `apps/QuipslyStudio/script/agentctl.sh episode1-selected-segment-evidence --json | python3 -m json.tool` generated 10 video evidence items, 30 video checkpoint stills, 5 audio listen-review warnings, and 0 errors.
- `apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-refresh && apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-next --json | python3 -m json.tool` still points to the segmented watch/listen ledger as the next Studio action.
- Visual spot-checks confirmed generated 16:9 and 9:16 stills are real Episode 1 frames. The late 9:16 still is visibly dark, which is useful review evidence but not an automatic rejection.

Residual risk:
- Local browser media fragments may not jump exactly to segment boundaries for every media type.
- Audio evidence is still a listen-review requirement; the current board only records that audio exists and needs listening.
- Segment evidence should eventually be surfaced inside Quipsly Studio/Tower UI, not only as HTML/JSON artifacts.

Next move:
- Use the segment evidence board and progress ledger together: review chunks, mark real issues or reviewed segments, then record a final artifact decision only after required review items are complete.

## 2026-06-20 14:11-14:16 MDT - Unified Episode 1 selected review console

Intent:
- Reduce Episode 1 artifact-review anxiety by grouping 16:9 video, 9:16 video, and podcast audio into one segment-by-segment review cockpit.
- Make the next Studio action obvious from the vertical-slice board instead of scattering reviewers across progress JSON, still boards, and station pages.

Changed:
- Added `episode1_selected_review_console.py`.
- Added `episode1-selected-review-console` to `agentctl.sh`.
- Updated the vertical-slice Studio lane to recommend `script/agentctl.sh episode1-selected-review-console --html` while the selected tail-trim artifact set still needs watch/listen review.
- The generated console includes per-segment video/audio embeds, checkpoint stills, copy-ready mark-reviewed commands, copy-ready issue commands, and a visible non-approval boundary.

Proof:
- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_review_console.py` passed.
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- `apps/QuipslyStudio/script/agentctl.sh episode1-selected-review-console --json | python3 -m json.tool` generated 5 segment groups and 15 pending review items.
- `apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-refresh && apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-next --json | python3 -m json.tool` now recommends opening the review console.
- HTML structure check found 5 segment cards, 10 video players, 5 audio players, 20 copy-command buttons, and the truth boundary.

Residual risk:
- Browser behavior for `file://...#t=start,end` media fragments may vary; the console includes exact segment labels and commands so the review truth is not dependent on autoplay magic.
- The console is HTML/packet infrastructure; the same review UX should eventually move into the native Studio/Tower surfaces.
- No segment is reviewed yet. The console makes review easier but does not do it.

Next move:
- Open the review console, watch/listen segment by segment, mark real progress or issues, then only record the final artifact decision after all required review items are complete.

## 2026-06-20 14:19-14:25 MDT - Final artifact pass guardrail

Intent:
- Prevent Episode 1 from being accidentally marked as watch/listen `pass` while the selected segmented review ledger still has pending items or issues.
- Keep Quipsly's anti-anxiety promise: the system should make the honest next step obvious and block fake readiness claims before they mutate Tower state.

Changed:
- Hardened `episode1-artifact-watch-review-decision pass` in `agentctl.sh`.
- The pass path now ensures the selected watch/listen progress packet exists and refuses `pass` unless `summary.readyForFinalDecision` is true.
- Non-pass decisions such as `needs-review`, `needs-fix`, and `reject` remain available because they are honest states.
- Final decision records now include the selected watch/listen progress path and summary when present.

Proof:
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- Premature `pass` attempt exited with code `4` and returned `blocked-selected-watch-review-incomplete` with 15 pending items and safe commands to open the review console or progress ledger.
- The current decision packet did not mutate during the blocked pass attempt.
- `needs-review` decision still succeeds and keeps Tower blocked.
- `apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-refresh && apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-next --json | python3 -m json.tool` still recommends the selected review console.

Residual risk:
- The guardrail is currently in the `agentctl`/packet path. Native Studio/Tower UI controls should eventually call the same gate or equivalent shared validation rather than duplicating logic.
- The guard validates completion status, not subjective review quality; humans/agents still need to actually watch/listen before marking segments reviewed.

Next move:
- Review Episode 1 through `script/agentctl.sh episode1-selected-review-console --html`, record segment progress or issues, then let the pass gate open only when the ledger is genuinely complete.

## 2026-06-20 14:27-14:37 MDT - Machine quality scan for selected review console

Intent:
- Add machine triage to the Episode 1 selected review console so reviewers see likely visual/audio attention points before doing manual watch/listen review.
- Keep Quipsly's boundary clear: machine flags guide attention, but do not approve, reject, or mark review progress.

Changed:
- Added `episode1_selected_quality_scan.py`.
- Added `episode1-selected-quality-scan` to `agentctl.sh`.
- Updated `episode1_selected_review_console.py` so the review console can include quality flags alongside the actual media, stills, and copy-ready review commands.
- Hardened `episode1_selected_artifact_review_station.py` so optional generated evidence JSON with parse errors becomes a visible `_loadError` instead of blocking the selected artifact review station.

Proof:
- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_artifact_review_station.py apps/QuipslyStudio/script/episode1_selected_quality_scan.py apps/QuipslyStudio/script/episode1_selected_review_console.py` passed.
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- `apps/QuipslyStudio/script/agentctl.sh episode1-selected-quality-scan --json | python3 -m json.tool` generated 15 scanned items, 8 flagged items, and 15 total flags.
- `apps/QuipslyStudio/script/agentctl.sh episode1-selected-review-console --json | python3 -m json.tool` now reports 8 machine-flagged review items.
- HTML structure check found 5 segment cards, 10 video players, 5 audio players, 20 copy-command buttons, 23 quality-flag spans, 9 dark-frame mentions, and the truth boundary.
- `apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-refresh && apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-next --json | python3 -m json.tool` still recommends opening the selected review console.

Residual risk:
- Luma thresholds are heuristic. They should guide review attention, not decide artifact fate.
- Audio checks are short volume samples, not full listen review.
- One optional generated evidence packet contains malformed JSON; the station now degrades gracefully, but the producer should be repaired or the packet regenerated before relying on that older evidence.

Next move:
- Use the selected review console to perform actual segment review. Machine flags should make dark/low-audio risks more visible, but the review ledger remains the source of approval progress.

## 2026-06-20 14:38-14:43 MDT - Quality triage brief for selected Episode 1 review

Intent:
- Convert machine quality flags into an actionable, segment-prioritized triage brief without turning machine observations into approval or rejection.
- Give reviewers a calm "look here first" companion to the selected review console.

Changed:
- Added `episode1_selected_quality_triage.py`.
- Added `episode1-selected-quality-triage` to `agentctl.sh`.
- Added selected quality scan and selected quality triage paths to the Episode 1 vertical-slice Studio evidence board.

Proof:
- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_quality_triage.py` passed.
- `bash -n apps/QuipslyStudio/script/agentctl.sh` passed.
- `apps/QuipslyStudio/script/agentctl.sh episode1-selected-quality-triage --json | python3 -m json.tool` generated 5 segment groups, 5 flagged segments, 8 flagged items, and 15 total flags.
- Triage prioritized `segment-005` as `review-first`; the other segments are `needs-look`.
- HTML structure check found 5 segments, 13 copy buttons, dark-frame mentions, and the truth boundary.
- After refreshing the vertical-slice brief post-generation, Studio reviewState and sourcePackets now include both selected quality scan and selected quality triage paths.

Residual risk:
- Quality triage is heuristic attention guidance. It should not become a hidden scoring gate.
- The next-action command still points to the full review console, not the triage brief, because final review should happen in the console where media and progress commands live.

Next move:
- Use the triage brief to decide review order, then use the review console to watch/listen and mark real progress or issues.

## 2026-06-20 14:50-14:56 MDT - Selected review next-step planner

Added a read-only Episode 1 selected-artifact review planner that turns the segmented review ledger, quality triage, and review console into one immediate operator step. The current recommendation is `segment-005` (`1:00:00 - 1:14:04`) because it still has three pending selected review items and machine triage severity `review-first`.

Validation run:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_review_next.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `apps/QuipslyStudio/script/agentctl.sh episode1-selected-review-next --json | python3 -m json.tool`
- `apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-refresh && apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-next --json | python3 -m json.tool`
- Structural check confirmed the planner recommends `segment-005`, includes the mark-reviewed command only as a post-review action, and keeps final pass unavailable while review items remain pending.

Truth boundary: this planner routes attention only. It does not review media, approve artifacts, publish, upload, schedule, or capture receipts. The vertical-slice refresh now tolerates malformed optional evidence JSON by surfacing a load error instead of crashing the coordination packet.

## 2026-06-20 14:57-15:02 MDT - Content partner doctrine tightened

Updated `docs/quipsly/quipsly-content-partner-doctrine.md` and `docs/coordination/antigravity-agent-board.md` so future Codex/Quipsly/Antigravity lanes treat agent-created content as first-class creative work when it is serious and reviewable, not as automatic placeholder material.

Core rule preserved: Quipslys may create publishable-intent drafts, edits, packets, examples, research, shorts, storyboards, and publication copy when the workflow needs living material. The safeguard is not "AI cannot write"; the safeguard is visible authorship, provenance, review state, reversibility, canon separation, publication separation, and receipt truth.

No runtime validation needed; documentation-only doctrine update.

## 2026-06-20 15:03-15:10 MDT - Focused selected segment review pack

Added `apps/QuipslyStudio/script/episode1_selected_segment_review_pack.py` and wired `script/agentctl.sh episode1-selected-segment-review-pack [--json|--html]`.

The command reads the current selected-review planner and segmented review ledger, then creates derived review media for the currently recommended segment. Current target is `segment-005` (`1:00:00 - 1:14:04`) from the selected Episode 1 artifact set.

Generated outputs:

- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-selected-segment-review-pack.json`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-selected-segment-review-pack.html`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-selected-segment-review-pack.md`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-selected-segment-review-pack/episode-16x9-master-segment-005-review.mp4`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-selected-segment-review-pack/episode-9x16-master-segment-005-review.mp4`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-selected-segment-review-pack/podcast-audio-master-segment-005-review.m4a`

Validation run:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_segment_review_pack.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `apps/QuipslyStudio/script/agentctl.sh episode1-selected-segment-review-pack --json | python3 -m json.tool`
- `apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-refresh && apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-next --json | python3 -m json.tool`
- Structural check confirmed 3 derived review clips exist, all ready, with zero warnings, and the vertical-slice next action now points at the focused review pack.

Truth boundary: derived review clips are inspection artifacts only. They are not source edits, not approval, not publication, and not receipts. The review ledger still has pending items until an actual reviewer watches/listens and marks the segment reviewed or issue.

## 2026-06-20 15:12-15:17 MDT - Focused review pack assist evidence

Strengthened `episode1_selected_segment_review_pack.py` so the focused selected-segment review pack now includes derived contact sheets for video artifacts and an audio volume probe for the podcast-audio artifact.

Current `segment-005` pack status:

- 3 derived review clips exist and are ready.
- 2 video contact sheets exist and are ready.
- 1 audio probe exists and is ready (`mean_volume -22.2 dB`, `max_volume -0.0 dB`).
- 0 warnings.

Validation run:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_segment_review_pack.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `apps/QuipslyStudio/script/agentctl.sh episode1-selected-segment-review-pack --json | python3 -m json.tool`
- `apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-refresh && apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-next --json | python3 -m json.tool`
- Structural check confirmed derived clips, contact sheets, audio probe, and HTML review controls are present.

Truth boundary: contact sheets and volume probes are machine attention aids only. They make human/agent review easier, but they do not review media, approve artifacts, publish, upload, schedule, or capture receipts.

## 2026-06-20 15:18-15:21 MDT - Stable per-segment review pack outputs

Updated `episode1_selected_segment_review_pack.py` so focused review packs now write both a latest alias and stable per-segment files. Current `segment-005` outputs include:

- Latest alias: `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-selected-segment-review-pack.html`
- Stable HTML: `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-selected-segment-review-pack/segment-005-review-pack.html`
- Stable JSON: `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-selected-segment-review-pack/segment-005-review-pack.json`
- Stable Markdown: `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-selected-segment-review-pack/segment-005-review-pack.md`

Validation run:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_segment_review_pack.py`
- `apps/QuipslyStudio/script/agentctl.sh episode1-selected-segment-review-pack --json | python3 -m json.tool`
- File verification confirmed latest and stable outputs exist, match for current segment, and preserve `segment-005` as the segment id.
- `apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-refresh && apps/QuipslyStudio/script/agentctl.sh episode1-vertical-slice-next --json | python3 -m json.tool`

Truth boundary: stable review packs are durable evidence trays, not review decisions. The selected watch/listen ledger remains pending until a reviewer actually reviews and marks the segment.

## 2026-06-20 15:22-15:35 MDT - All selected segment review trays prepared

Expanded `episode1_selected_segment_review_pack.py` and `agentctl.sh` so focused review packs can be generated for an explicit segment id, not only the current recommendation. Added `script/agentctl.sh episode1-selected-all-segment-review-packs [--json]` to prepare durable trays for every selected Episode 1 review segment.

Generated and verified stable review packs for all five selected review segments:

- `segment-001` (`0:00 - 15:00`)
- `segment-002` (`15:00 - 30:00`)
- `segment-003` (`30:00 - 45:00`)
- `segment-004` (`45:00 - 1:00:00`)
- `segment-005` (`1:00:00 - 1:14:04`)

Each stable segment pack has 3 derived review clips, 2 video contact sheets, 1 audio probe, segment-specific mark-reviewed and issue commands, and 0 warnings at generation time.

Validation run:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_watch_review_progress.py apps/QuipslyStudio/script/episode1_selected_segment_review_pack.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `script/agentctl.sh episode1-selected-segment-review-pack segment-001 --json` with command assertions for `segment-001`
- `script/agentctl.sh episode1-selected-all-segment-review-packs --json`
- Structural verification over all five `segment-*-review-pack.json` files confirmed clips/contact sheets/audio probes and segment-specific ledger commands.

Fixes during pass:

- Hardened optional assist JSON loading in `episode1_selected_watch_review_progress.py` so malformed optional evidence does not crash the review ledger.
- Replaced macOS-incompatible `mapfile` usage in `agentctl.sh` with a while-read loop.
- Added progress output to the all-segment pack command because long silent media jobs are operator-hostile.

Truth boundary: all segment review trays are prepared, but no segment is reviewed yet. The selected watch/listen ledger remains the review truth.

## 2026-06-20 15:43-15:48 MDT - Selected review index

Added `apps/QuipslyStudio/script/episode1_selected_review_index.py` and `script/agentctl.sh episode1-selected-review-index [--json|--html]`.

The index links all five stable Episode 1 focused review trays and summarizes the selected watch/listen ledger. Current index status:

- 5 segment trays ready out of 5.
- 15 pending review items.
- 0 reviewed items.
- 0 issue items.
- Recommended next segment remains `segment-005`.

Validation run:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_review_index.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `script/agentctl.sh episode1-selected-review-index --json | python3 -m json.tool`
- Structural check confirmed 5 ready packs, 15 pending items, `segment-005` recommendation, existing pack links, and segment-specific mark-reviewed commands.

Truth boundary: the index is a map over review trays and ledger state. It does not review media, approve artifacts, publish, upload, schedule, or capture receipts.

## 2026-06-20 - Content partner doctrine clarified

Strengthened `docs/quipsly/quipsly-content-partner-doctrine.md` so future agents do not misread anti-black-box philosophy as an anti-writing or anti-agent-creation rule.

Key decision:

- Quipsly rejects invisible authorship, fake provenance, hidden review state, and false publication claims.
- Quipsly does not reject agent-authored writing, agent-led editing, serious drafts, article creation, storyboarding, packet preparation, or first-pass content generation.
- Codex and Quipslys may originate publishable-intent material when the work loop needs living content.
- The required safeguard is explicit state: authorship, provenance, intent, review state, canon state, publication state, and receipts.

Operational consequence:

Codex should create serious reviewable material when waiting for human-supplied content would block the Nest -> Studio -> Tower proof loop. `placeholder` is only for disposable fixtures, not for serious agent-created work.

## 2026-06-20 - Episode 1 selected review gate

Added a strict selected-artifact review gate for the Episode 1 Studio proof loop.

New command:

```bash
script/agentctl.sh episode1-selected-review-gate [--json|--html]
```

New artifacts:

- `docs/quipsly/studio-proof/episode-1-selected-review-gate.json`
- `docs/quipsly/studio-proof/episode-1-selected-review-gate.html`
- `docs/quipsly/studio-proof/episode-1-selected-review-gate.md`

Current gate result:

- `allowedToRecordFinalPass`: `false`
- Pending selected review items: `15`
- Reviewed selected review items: `0`
- Focused review trays ready: `5/5`
- Recommended next segment: `segment-005`

Truth boundary:

The gate reads ledger and review-tray evidence. It does not review media, mark ledger items, approve artifacts, publish, upload, schedule, or capture receipts.

Validation run:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_review_gate.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `script/agentctl.sh episode1-selected-review-gate --json | python3 -m json.tool`
- structural assertion that final pass remains blocked while 15 items are pending
- `script/agentctl.sh episode1-vertical-slice-refresh && script/agentctl.sh episode1-vertical-slice-next --json`
- structural assertion that the vertical-slice brief references `selectedReviewGate`

## 2026-06-20 - Episode 1 selected review cockpit

Added a fast operator cockpit for the selected Episode 1 review loop.

New command:

```bash
script/agentctl.sh episode1-selected-review-cockpit [--json|--html] [--refresh]
```

New artifacts:

- `docs/quipsly/studio-proof/episode-1-selected-review-cockpit.json`
- `docs/quipsly/studio-proof/episode-1-selected-review-cockpit.html`
- `docs/quipsly/studio-proof/episode-1-selected-review-cockpit.md`

Current cockpit state:

- Recommended segment: `segment-005` (`1:00:00 - 1:14:04`)
- Gate state: blocked, not ready for final artifact pass
- Pending selected review items: `15`
- Ready clips embedded: `3/3`
- Contact sheets embedded: `2`
- Audio probe count: `1`

Important command-contract correction:

The cockpit is cached-first by default so review opens quickly. Expensive media prep is explicit through `--refresh`. This avoids turning a normal review click into an ffmpeg-heavy regeneration step.

Validation run:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_review_cockpit.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `script/agentctl.sh episode1-selected-review-cockpit --json | python3 -m json.tool`
- structural assertion that cockpit embeds video, audio, `segment-005`, and the blocker language
- `script/agentctl.sh episode1-vertical-slice-refresh && script/agentctl.sh episode1-vertical-slice-next --json`
- structural assertion that the vertical-slice brief references `selectedReviewCockpit`

Truth boundary:

The cockpit gathers gate, next-step, index, and focused media evidence into one surface. It does not watch or listen for the reviewer, mark review complete, approve artifacts, publish, upload, schedule, or capture receipts.

## 2026-06-20 - Episode 1 selected review notes ledger

Added a non-decisional notes layer for the Episode 1 selected artifact review loop.

New commands:

```bash
script/agentctl.sh episode1-selected-review-notes [--json|--html]
script/agentctl.sh episode1-selected-review-note-add "Actor" "scope" "observation"
```

New artifacts:

- `docs/quipsly/studio-proof/episode-1-selected-review-notes.json`
- `docs/quipsly/studio-proof/episode-1-selected-review-notes.html`
- `docs/quipsly/studio-proof/episode-1-selected-review-notes.md`
- `docs/quipsly/studio-proof/episode-1-selected-review-notes-ledger.jsonl`

Current notes state:

- Current segment: `segment-005` (`1:00:00 - 1:14:04`)
- Current notes: `1`
- The first note is a tooling observation proving the notes ledger and cockpit link wiring; it explicitly says no media watch/listen review was performed.
- Selected review progress remains unchanged: `15` pending, `0` reviewed, `0` issues.

Product boundary:

Notes are observations. They do not mark review complete, approve artifacts, publish, upload, schedule, or capture receipts. This keeps frequent agent/human observations separate from official review state transitions.

Validation run:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_review_notes.py apps/QuipslyStudio/script/episode1_selected_review_cockpit.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `script/agentctl.sh episode1-selected-review-notes --json | python3 -m json.tool`
- `script/agentctl.sh episode1-selected-review-note-add ... | python3 -m json.tool`
- structural assertion that notes are current-segment scoped and non-decisional
- structural assertion that the cockpit exposes notes commands
- structural assertion that selected review progress remained `15` pending / `0` reviewed
- structural assertion that the vertical-slice brief references `selectedReviewNotes`

## 2026-06-20 - Segment 005 agent-visible observation pass

Used the selected review cockpit to inspect Segment 005 contact-sheet evidence and audio probe metadata, then recorded non-decisional observations.

Notes added through:

```bash
script/agentctl.sh episode1-selected-review-note-add "Codex" "scope" "observation"
```

New/updated artifacts:

- `docs/quipsly/studio-proof/episode-1-selected-review-notes-ledger.jsonl`
- `docs/quipsly/studio-proof/episode-1-selected-review-notes.json`
- `docs/quipsly/studio-proof/episode-1-selected-machine-review-summary.json`
- `docs/quipsly/studio-proof/episode-1-selected-machine-review-summary.html`
- `docs/quipsly/studio-proof/episode-1-selected-machine-review-summary.md`

Agent-visible observations:

- 16:9 contact sheet: dark but readable; speaker face, microphone, and framing are visible. Some early source/reference footage appears and needs full playback confirmation.
- 9:16 contact sheet: speaker face and microphone remain centered in sampled frames; crop is close and should be checked in real playback.
- Audio probe: mean `-22.2 dB`, max `-0.0 dB`; this is probe evidence only, not listening review.

Truth boundary:

Codex inspected contact sheets and audio metadata only. No full playback review or full audio listen was performed. The selected review ledger remains protected and unchanged: `15` pending, `0` reviewed, `0` issues.

Validation run:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_machine_review_summary.py`
- `script/agentctl.sh episode1-selected-machine-review-summary --json`
- structural assertion that machine summary says `didWatchFullPlayback=false` and `didListenFullAudio=false`
- structural assertion that selected review progress remained `15` pending / `0` reviewed / `0` issues
- structural assertion that the vertical-slice brief references `selectedMachineReviewSummary`

## 2026-06-20 - Cockpit now surfaces machine observations

Improved the Episode 1 selected review cockpit so it shows cached Codex machine observations directly inside the review page when a machine summary exists.

Updated artifact:

- `apps/QuipslyStudio/script/episode1_selected_review_cockpit.py`
- `docs/quipsly/studio-proof/episode-1-selected-review-cockpit.json`
- `docs/quipsly/studio-proof/episode-1-selected-review-cockpit.html`
- `docs/quipsly/studio-proof/episode-1-selected-review-cockpit.md`

Behavior:

- The cockpit remains cached-first and fast.
- It now exposes `Open machine summary` as a safe command.
- It embeds the latest machine observation summary if present, including agent limits such as `didWatchFullPlayback=false` and `didListenFullAudio=false`.
- It shows the human/playback questions next to the review media so the reviewer does not need to hunt through separate packets.

Validation run:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_review_cockpit.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `time script/agentctl.sh episode1-selected-review-cockpit --json`
- structural assertion that the cockpit includes machine summary, exact agent limit keys, human review questions, and no review ledger mutation

Current protected review ledger remains `15` pending and `0` reviewed.

## 2026-06-20 - Guided selected review session and content partner doctrine tightening

Tightened `docs/quipsly/quipsly-content-partner-doctrine.md` so Codex and Quipslys are treated as valid creative partners for workflow purposes, not placeholder-only helpers. The doctrine now explicitly says agent-created serious work should not be demoted to fake filler by author type; intent, authorship, review state, canon state, publication state, and receipt truth carry the safety boundary.

Added and validated an interactive local review session for Episode 1 `segment-005`.

New command:

```bash
script/agentctl.sh episode1-selected-review-session [--json|--html]
```

New artifacts:

- `docs/quipsly/studio-proof/episode-1-selected-review-session.json`
- `docs/quipsly/studio-proof/episode-1-selected-review-session.html`
- `docs/quipsly/studio-proof/episode-1-selected-review-session.md`

Behavior:

- embeds selected review media
- shows Codex observations and exact agent limit keys such as `didWatchFullPlayback=false`
- shows current non-decisional notes
- uses `localStorage` to track checklist state
- keeps “Copy reviewed command” disabled until checklist items are checked
- does not mutate the official review ledger

Validation:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_review_session.py apps/QuipslyStudio/script/episode1_selected_review_cockpit.py apps/QuipslyStudio/script/episode1_selected_machine_review_summary.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- structural session checks passed
- vertical-slice brief references `selectedReviewSession`
- protected review ledger remains `15` pending / `0` reviewed

Lesson: Quipsly should let agents create and review serious work, while making state transitions deliberate. The system should reduce bottlenecks without inventing fake approvals.

## 2026-06-20 - Vertical slice now routes to guided review session

Tightened the Episode 1 vertical-slice flight board so the Studio lane points at the guided selected review session instead of the older cockpit-only surface.

Updated file:

- `apps/QuipslyStudio/script/agentctl.sh`

Behavior change:

- `script/agentctl.sh episode1-vertical-slice-refresh` now sets the Studio next command to:

```bash
script/agentctl.sh episode1-selected-review-session --html
```

- The Studio lane evidence now includes the selected review cockpit, review notes, machine review summary, and guided review session.
- The vertical-slice `sourcePackets` now cites `docs/quipsly/quipsly-content-partner-doctrine.md`, so future agents can inspect the creative-partner doctrine from current-state truth instead of relying on chat memory.
- Removed a backwards dependency where cockpit refresh tried to generate the session that depends on the cockpit.

Validation:

- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `script/agentctl.sh episode1-selected-review-cockpit --json`
- `script/agentctl.sh episode1-selected-review-session --json`
- `script/agentctl.sh episode1-vertical-slice-refresh` followed by structural assertions that:
  - Studio next command is `script/agentctl.sh episode1-selected-review-session --html`
  - vertical-slice source packets cite the content-partner doctrine
  - selected review session, cockpit, notes, and machine summary references survive regeneration

Lesson: once a better operator surface exists, the product flight board should route to it immediately. Old doors create systems anxiety because people keep entering through a path that no longer represents the current workflow.

## 2026-06-20 - Durable draft responses for selected review session

Added a non-decisional draft response layer for the Episode 1 selected review session.

New file:

- `apps/QuipslyStudio/script/episode1_selected_review_session_draft.py`

New commands:

```bash
script/agentctl.sh episode1-selected-review-session-draft [--json|--html]
script/agentctl.sh episode1-selected-review-session-draft-add "Actor" check|answer|note|recommendation|issue "target" "response text"
```

New artifacts:

- `docs/quipsly/studio-proof/episode-1-selected-review-session-draft.json`
- `docs/quipsly/studio-proof/episode-1-selected-review-session-draft.html`
- `docs/quipsly/studio-proof/episode-1-selected-review-session-draft.md`
- `docs/quipsly/studio-proof/episode-1-selected-review-session-draft-ledger.jsonl`

Behavior:

- records draft review checks, answers, notes, issue observations, and recommendations before the protected official review ledger changes
- links back to the guided review session
- exposes the official ledger command but does not run it
- keeps the truth boundary explicit: draft responses do not approve artifacts, publish, upload, schedule, or capture receipts

Wiring:

- `episode1-selected-review-session` now advertises draft-response commands
- `episode1-vertical-slice-refresh` generates and references `selectedReviewSessionDraft`
- the Studio lane evidence and source packets now include the draft response surface

Validation:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_review_session.py apps/QuipslyStudio/script/episode1_selected_review_session_draft.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `script/agentctl.sh episode1-selected-review-session-draft --json`
- temporary-ledger add-path proof for `episode1_selected_review_session_draft.py --add`
- `script/agentctl.sh episode1-vertical-slice-refresh` structural check that `selectedReviewSessionDraft` survives regeneration
- protected review ledger remains `15` pending / `0` reviewed

Lesson: localStorage is useful for live UI comfort, but review work also needs durable, inspectable draft state before official state transitions. This gives humans and agents a place to write down what happened without smuggling approval into the ledger.

## 2026-06-20 - Guided review rows now create durable draft-response commands

Improved the Episode 1 guided selected review session so every checklist item now includes a copyable durable draft-response command.

Updated file:

- `apps/QuipslyStudio/script/episode1_selected_review_session.py`

Behavior:

- Each review checklist row now explains the two-layer behavior: browser checkbox for live comfort, durable draft-response command for persistent review evidence.
- Each row exposes a `script/agentctl.sh episode1-selected-review-session-draft-add ...` command tailored to that check or question.
- The guided session now includes commands to open durable draft responses and add a general draft response.
- The protected official review command remains disabled in the page until the local checklist is complete.

Validation:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_review_session.py apps/QuipslyStudio/script/episode1_selected_review_session_draft.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `script/agentctl.sh episode1-selected-review-session --json`
- structural assertion that all `8` checklist items have `Copy draft response` helpers
- `script/agentctl.sh episode1-selected-review-session-draft --json`
- `script/agentctl.sh episode1-vertical-slice-refresh` confirmed the Studio lane still points to the guided review session and includes `selectedReviewSessionDraft`
- protected review ledger remains `15` pending / `0` reviewed

Lesson: a checklist without a durable response path creates anxiety debt. The user can feel momentarily organized, but the system cannot learn or preserve what actually happened. Checkboxes are comfort; ledgers are memory.

## 2026-06-20 - Selected review handoff front door

Added a reviewer-facing handoff page for the current Episode 1 selected review segment.

New file:

- `apps/QuipslyStudio/script/episode1_selected_review_handoff.py`

New command:

```bash
script/agentctl.sh episode1-selected-review-handoff [--json|--html]
```

New artifacts:

- `docs/quipsly/studio-proof/episode-1-selected-review-handoff.json`
- `docs/quipsly/studio-proof/episode-1-selected-review-handoff.html`
- `docs/quipsly/studio-proof/episode-1-selected-review-handoff.md`

Behavior:

- The handoff is now the front door for the selected segment review.
- It summarizes official review progress, durable draft response progress, and blocked claims.
- It gives the reviewer a clear path: open guided session, watch/listen, record durable draft responses, answer questions, then only consider the official ledger command.
- It exposes safe commands for the guided session, draft responses, recommendations, vertical-slice refresh, and the official ledger command after actual review.
- It does not mark review complete, approve media, publish, upload, schedule, or capture receipts.

Wiring:

- `episode1-vertical-slice-refresh` now generates and references `selectedReviewHandoff`.
- `episode1-vertical-slice-next --json` now recommends:

```bash
script/agentctl.sh episode1-selected-review-handoff --html
```

Validation:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_review_handoff.py apps/QuipslyStudio/script/episode1_selected_review_session.py apps/QuipslyStudio/script/episode1_selected_review_session_draft.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `script/agentctl.sh episode1-selected-review-handoff --json`
- `script/agentctl.sh episode1-vertical-slice-refresh`
- `script/agentctl.sh episode1-vertical-slice-next --json`
- protected review ledger remains `15` pending / `0` reviewed

Lesson: when a workflow requires human or agent judgment, the product should make one honest handoff page rather than scattering review surfaces. A handoff page is not bureaucracy when it removes uncertainty and protects state truth.

## 2026-06-20 - Selected review worksheet

Added a fill-in reviewer worksheet for the current Episode 1 selected review segment.

New file:

- `apps/QuipslyStudio/script/episode1_selected_review_worksheet.py`

New command:

```bash
script/agentctl.sh episode1-selected-review-worksheet [--json|--html|--md]
```

New artifacts:

- `docs/quipsly/studio-proof/episode-1-selected-review-worksheet.json`
- `docs/quipsly/studio-proof/episode-1-selected-review-worksheet.html`
- `docs/quipsly/studio-proof/episode-1-selected-review-worksheet.md`

Behavior:

- Generates a human-friendly worksheet for Segment 005 with all 8 required review items.
- Includes blanks for notes, answers, and timestamps.
- Includes the exact durable draft-response command for each review item.
- Includes final recommendation and official ledger command sections with explicit warnings.
- Provides both HTML and Markdown forms so the worksheet can be opened locally, copied into chat, or sent to another reviewer.

Wiring:

- `episode1-selected-review-handoff` now exposes worksheet commands.
- `episode1-vertical-slice-refresh` now generates and references `selectedReviewWorksheet`.
- The Studio lane remains routed to the review handoff as the front door.

Validation:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_selected_review_worksheet.py apps/QuipslyStudio/script/episode1_selected_review_handoff.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `script/agentctl.sh episode1-selected-review-worksheet --json`
- `script/agentctl.sh episode1-selected-review-handoff --json`
- `script/agentctl.sh episode1-vertical-slice-refresh`
- protected review ledger remains `15` pending / `0` reviewed

Lesson: dashboards show state, but worksheets guide judgment. For review-heavy creative work, Quipsly needs both: a state board for truth and a worksheet for doing the actual thinking without losing the trail.

## 2026-06-20 - Fast current-next board for Episode 1 vertical slice

Added a cached current-next board so Codex, Charlie, or a reviewer can see the next honest Episode 1 action without running the slow full vertical-slice refresh.

New file:

- `apps/QuipslyStudio/script/episode1_current_next_fast.py`

New command:

```bash
script/agentctl.sh episode1-current-next [--json|--html|--md]
```

New artifacts:

- `docs/quipsly/current-state/episode-1-current-next-fast.json`
- `docs/quipsly/current-state/episode-1-current-next-fast.html`
- `docs/quipsly/current-state/episode-1-current-next-fast.md`

Behavior:

- Reads cached vertical-slice, selected review handoff, draft response, and official review progress packets.
- Shows source freshness so stale state is visible without automatically doing heavy regeneration.
- Recommends the current next honest action.
- Preserves the review truth: the current selected review remains `15` pending / `0` reviewed / `0` draft entries.
- Keeps the UX principle explicit: Mako edits, Quipsly remembers, Codex learns, Tower proves.
- Does not mutate review ledgers, approve media, canonize writing, publish, upload, schedule, or capture receipts.

Validation:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_current_next_fast.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `apps/QuipslyStudio/script/agentctl.sh episode1-current-next --json`
- `apps/QuipslyStudio/script/agentctl.sh episode1-current-next --md`
- Confirmed recommended action is `selected-segment-needs-real-review` with command `script/agentctl.sh episode1-selected-review-handoff --html`.

Lesson: Quipsly needs two speeds of truth. Fast boards should read cached state and orient the operator; full refreshes should regenerate evidence intentionally. Mixing those two makes every small decision feel like a deploy pipeline.

## 2026-06-20 - Mako-facing editor review brief

Added a Mako-facing review brief that translates the selected Episode 1 review state into editor language instead of ledger language.

New file:

- `apps/QuipslyStudio/script/episode1_mako_review_brief.py`

New command:

```bash
script/agentctl.sh episode1-mako-review-brief [--json|--html|--md]
```

New artifacts:

- `docs/quipsly/current-state/episode-1-mako-review-brief.json`
- `docs/quipsly/current-state/episode-1-mako-review-brief.html`
- `docs/quipsly/current-state/episode-1-mako-review-brief.md`

Behavior:

- Presents review as an editing pass: watch the segment, check vertical crop, listen for comfort, note friction, choose a plain-English outcome.
- Keeps the official state visible but not dominant: current selected review remains `15` pending / `0` reviewed / `0` draft entries.
- Exposes safe note/recommendation commands for Mako without asking her to think in ledger terms.
- Adds `openMakoReviewBrief` to the fast current-next board.
- Does not mutate the official review ledger, approve artifacts, publish, schedule, upload, or capture receipts.

Validation:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_mako_review_brief.py apps/QuipslyStudio/script/episode1_current_next_fast.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `apps/QuipslyStudio/script/agentctl.sh episode1-mako-review-brief --json`
- `apps/QuipslyStudio/script/agentctl.sh episode1-current-next --json`

Lesson: the review system can be robust without feeling convoluted if the human-facing surface says “editing pass” while the machine-facing layer records provenance, decisions, and receipts. Complexity belongs under the floorboards unless the reviewer asks to inspect it.

## 2026-06-20 - Structured Mako editor notes

Added a structured editor-note path for Mako-style review feedback without asking the reviewer to think in official ledger terms.

Updated files:

- `apps/QuipslyStudio/script/episode1_mako_review_brief.py`
- `apps/QuipslyStudio/script/episode1_current_next_fast.py`
- `apps/QuipslyStudio/script/agentctl.sh`

New command:

```bash
script/agentctl.sh episode1-mako-review-note [--dry-run] looks-good|needs-edit|blocked|note overall|cut|crop|audio|caption|pace|media|tool|other target "note text"
```

Behavior:

- Encodes editor notes as `mako:<outcome>:<category>:<target>` draft review rows.
- Supports outcomes: `looks-good`, `needs-edit`, `blocked`, `note`.
- Supports categories: `overall`, `cut`, `crop`, `audio`, `caption`, `pace`, `media`, `tool`, `other`.
- `--dry-run` proves the note shape without writing any draft ledger rows.
- The Mako review brief now displays captured Mako notes from the draft response packet.
- The fast current-next board now exposes an `addMakoEditorNote` example command.
- Official selected review state remains protected; this path does not mark anything reviewed, approve artifacts, publish, schedule, upload, or capture receipts.

Validation:

- `python3 -m py_compile apps/QuipslyStudio/script/episode1_mako_review_brief.py apps/QuipslyStudio/script/episode1_current_next_fast.py`
- `bash -n apps/QuipslyStudio/script/agentctl.sh`
- `script/agentctl.sh episode1-mako-review-note --dry-run needs-edit crop 01:02:30 "Face is too low in the vertical crop."`
- `script/agentctl.sh episode1-mako-review-brief --json`
- `script/agentctl.sh episode1-current-next --json`
- Confirmed official review state stayed `15` pending / `0` reviewed and real Mako note count stayed `0` after dry-run validation.

Lesson: a reviewer note should start as an editor-shaped sentence, then become structured data. If the human has to think like a database table before leaving feedback, the product is making the wrong creature do the translation.

## 2026-06-20 - Mako review UX contract

Added `docs/quipsly/mako-editor-review-ux-contract.md` to keep the review system pointed at the right human experience.

The contract states:

- Mako edits; Quipsly remembers; Codex learns; Tower proves.
- Mako notes are editorial signal, not official approval.
- Review must use editor language on the surface and keep ledger language underneath.
- The native app should expose outcome buttons, category chips, an auto-filled playhead/selection target, and a visible note list instead of shell commands.
- The latest executable script changes still need explicit validation before more script behavior is stacked on top.

No validation was run for this documentation pass.

## 2026-06-21 - Mako outcome-summary validation

Validated the Mako editor-note and outcome-summary bridge after explicit approval.

Validated commands:

```bash
python3 -m py_compile apps/QuipslyStudio/script/episode1_mako_review_brief.py apps/QuipslyStudio/script/episode1_current_next_fast.py
bash -n apps/QuipslyStudio/script/agentctl.sh
apps/QuipslyStudio/script/agentctl.sh episode1-mako-review-note --dry-run needs-edit crop 01:02:30 "Face is too low in the vertical crop."
apps/QuipslyStudio/script/agentctl.sh episode1-mako-review-brief --json
apps/QuipslyStudio/script/agentctl.sh episode1-current-next --json
```

Result:

- Python syntax passed.
- Bash syntax passed.
- Dry-run Mako note produced target `mako:needs-edit:crop:01:02:30` and did not write a ledger row.
- Mako review brief generated successfully.
- Fast current-next board generated successfully.
- Mako editor outcome currently reports `no-editor-outcome-yet` with `0` notes.
- Official selected review state remains `15` pending / `0` reviewed / `0` draft entries.

Lesson: this is the right level of validation after touching command plumbing: prove syntax, prove dry-run shape, prove generated state, and prove protected review truth did not move.

## 2026-06-21 - Shorts local export quality loop

Added a practical local-export board for Episode 1 short candidates so Studio can focus on output quality instead of approval-process theater.

Updated files:

- `apps/QuipslyStudio/script/shorts_local_export_board.py`
- `apps/QuipslyStudio/script/agentctl.sh`
- `docs/quipsly/shorts-local-export-quality-loop.md`

New command:

```bash
script/agentctl.sh shorts-local-export-board [--json|--html|--md] [/absolute/output/folder] [basename]
```

Behavior:

- Pulls the running app's `/shorts_queue` and `/state`.
- Writes JSON, HTML, and Markdown boards under `docs/quipsly/current-state` by default.
- Sorts shorts by practical next step: export locally, find missing export file, contact sheet, audio/listen review, text review, quality decision, or social queue handoff.
- Includes concrete commands for local export, contact sheet generation, audio sanity, listen-through note, keep, and refine.
- Does not approve, publish, schedule, upload, capture receipts, or mutate review state.

No validation was run for this pass. The next useful check is `python3 -m py_compile apps/QuipslyStudio/script/shorts_local_export_board.py` and `bash -n apps/QuipslyStudio/script/agentctl.sh`, followed by `script/agentctl.sh shorts-local-export-board --json` against the running Studio app.

## 2026-06-21 - Shorts growth-quality objective and scoring board

Shifted the active working target from "shorts process" to "shorts that can earn attention."

Added:

- `docs/quipsly/shorts-growth-goal.md`
- `docs/quipsly/shorts-growth-research-and-feature-list.md`
- `apps/QuipslyStudio/script/shorts_growth_quality_board.py`

Updated:

- `apps/QuipslyStudio/script/agentctl.sh`

New command:

```bash
script/agentctl.sh shorts-growth-quality-board [--json|--html|--md] [/absolute/output/folder] [basename]
```

Behavior:

- Pulls `/shorts_queue` and `/state` from the running Studio app.
- Ranks short candidates by a practical growth-quality heuristic.
- Scores hook strength, duration/pacing, platform packaging, visual readiness, audio readiness, and standalone clarity.
- Gives the next practical improvement command: export locally, write a sharper hook, generate a contact sheet, run audio sanity, or select the candidate.
- Does not promise views, mutate review state, publish, schedule, or upload.

Research direction captured:

- Riverside-style fast clip generation and social-ready customization.
- Descript-style layouts, captions, B-roll, and brand/template treatment.
- OpusClip-style virality dimensions and ranked candidate review.
- CapCut-style auto captions and subtitle/timing control.

No validation was run for this pass. The next useful check is `python3 -m py_compile apps/QuipslyStudio/script/shorts_growth_quality_board.py`, `bash -n apps/QuipslyStudio/script/agentctl.sh`, and `script/agentctl.sh shorts-growth-quality-board --json` against the running Studio app.

## 2026-06-21 - Shorts platform package board

Added the next shorts-goal feature: platform-aware packaging drafts for top short candidates.

Updated files:

- `apps/QuipslyStudio/script/shorts_platform_package_board.py`
- `apps/QuipslyStudio/script/agentctl.sh`
- `docs/quipsly/shorts-growth-research-and-feature-list.md`

New command:

```bash
script/agentctl.sh shorts-platform-package-board [--json|--html|--md] [/absolute/output/folder] [basename]
```

Behavior:

- Uses the growth-quality board as input.
- Drafts hook variants, YouTube Shorts titles/descriptions/hashtags, Instagram/Facebook captions, LinkedIn copy, Patreon notes, and improvement prompts.
- Keeps performance language honest: this is packaging assist, not a guarantee of views.
- Does not publish, schedule, upload, approve, or mutate review state.

Research basis:

- Riverside-style platform sizing/layout/caption workflow.
- Descript-style social templates, captions, B-roll, brand treatment, and aspect ratios.
- OpusClip-style candidate ranking and hook/flow/engagement/trend dimensions.
- CapCut-style auto captions plus manual caption correction/timing.

No validation was run for this pass. The next useful check is `python3 -m py_compile apps/QuipslyStudio/script/shorts_platform_package_board.py apps/QuipslyStudio/script/shorts_growth_quality_board.py apps/QuipslyStudio/script/shorts_local_export_board.py`, `bash -n apps/QuipslyStudio/script/agentctl.sh`, and `script/agentctl.sh shorts-platform-package-board --json` against the running Studio app.

## 2026-06-21 - Shorts improvement plan

Added the next shorts-goal feature: an actionable improvement plan that turns scoring and platform packaging into concrete edit/product tasks.

Updated files:

- `apps/QuipslyStudio/script/shorts_improvement_plan.py`
- `apps/QuipslyStudio/script/agentctl.sh`
- `docs/quipsly/shorts-automatic-quality-features.md`
- `docs/quipsly/shorts-growth-research-and-feature-list.md`

New command:

```bash
script/agentctl.sh shorts-improvement-plan [--json|--html|--md] [/absolute/output/folder] [basename]
```

Behavior:

- Uses the growth-quality and platform-package boards as input.
- Prioritizes concrete actions: export, sharpen hook, tighten/split timing, generate contact sheet, create caption plan, run audio sanity, or polish platform package.
- Sorts by blocker/high/medium/low/polish severity.
- Includes human checks so automation helps taste instead of pretending to replace it.
- Does not mutate Studio state, publish, schedule, upload, or approve.

No validation was run for this pass. The next useful check is `python3 -m py_compile apps/QuipslyStudio/script/shorts_improvement_plan.py apps/QuipslyStudio/script/shorts_platform_package_board.py apps/QuipslyStudio/script/shorts_growth_quality_board.py apps/QuipslyStudio/script/shorts_local_export_board.py`, `bash -n apps/QuipslyStudio/script/agentctl.sh`, and `script/agentctl.sh shorts-improvement-plan --json` against the running Studio app.

## 2026-06-21 - Shorts board refactor

Refactored the shorts board tooling before commit.

Updated files:

- `apps/QuipslyStudio/script/shorts_board_common.py`
- `apps/QuipslyStudio/script/shorts_local_export_board.py`
- `apps/QuipslyStudio/script/shorts_growth_quality_board.py`
- `apps/QuipslyStudio/script/shorts_platform_package_board.py`
- `apps/QuipslyStudio/script/shorts_improvement_plan.py`
- `apps/QuipslyStudio/script/agentctl.sh`

Cleanup:

- Moved shared JSON loading, HTML escaping, export-path detection, short queue extraction, duration parsing, shell quoting, short classification, and stage ranking into `shorts_board_common.py`.
- Updated all shorts board scripts to depend on the common module instead of importing helper functions from `shorts_local_export_board.py`.
- Collapsed repeated `agentctl.sh` board packet plumbing into `shorts_board_packet`.
- Removed obvious unused imports/constants from the new board scripts.

Validation run:

```bash
python3 -m py_compile apps/QuipslyStudio/script/shorts_board_common.py apps/QuipslyStudio/script/shorts_local_export_board.py apps/QuipslyStudio/script/shorts_growth_quality_board.py apps/QuipslyStudio/script/shorts_platform_package_board.py apps/QuipslyStudio/script/shorts_improvement_plan.py
bash -n apps/QuipslyStudio/script/agentctl.sh
```

Result: passed.

## 2026-06-21 - Active shorts-first goal captured

Added `docs/quipsly/active-goal-shorts-first.md` as the current paste-ready steering goal while the formal goal tool remains tied to the older broad/blocked goal.

Recall trigger:

- "current shorts goal"
- "replacement goal"
- "active goal"

The goal narrows the active work to creating excellent short-form output from Episode 1, with research-informed features, local exports, caption/crop quality, platform packaging, and agent/human editing loops.

## 2026-06-21 - Shorts tooling decoupled from agentctl

Added `apps/QuipslyStudio/script/shortsctl.sh` as a small focused wrapper for the shorts board tooling.

Why:

- `agentctl.sh` currently contains a large pre-existing uncommitted command-surface expansion.
- The shorts-quality scripts should be commit-ready without depending on a 13k-line dirty wrapper.
- `shortsctl.sh` fetches `/shorts_queue` and `/state` from the running Studio agent server and runs the board scripts directly.

Preferred clean commands:

```bash
script/shortsctl.sh local-export-board --html
script/shortsctl.sh growth-quality-board --html
script/shortsctl.sh platform-package-board --html
script/shortsctl.sh improvement-plan --html
```

The existing `agentctl.sh` routes can still exist in the dirty working tree, but the shorts commit no longer needs to include them.
