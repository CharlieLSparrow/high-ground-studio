# Quipsly Studio Editor Learning Loop

Status: WIP product doctrine and implementation target.
Last updated: 2026-06-19.

## Why this exists

Quipsly Studio is not only a video editor. It is an annotation surface for learning how a human editor makes decisions.

The working loop should become:

1. Codex/Quipsly creates a first-pass edit from source media, transcript, prior episode style, and existing edit metadata.
2. A human editor, initially Mako, reviews and corrects the edit inside Quipsly Studio.
3. The editor can add notes where useful, but is never forced to justify every small trim.
4. Quipsly captures the correction data as structured, queryable edit deltas.
5. Codex uses those corrections to improve future first passes.
6. Later, the same data can support a trained model, a retrieval-assisted edit planner, or a hybrid editor assistant.

The point is not to make the human document every thought. The point is to make the normal editing workflow generate useful learning data by default.

## Base framing tool

We need a first-class **Base Framing** tool for every source lane.

Current technical truth:

- Program crop metadata already exists as reversible edit intent over whole source lanes.
- Baseline crop fixes the whole lane for an output format.
- Keyframes can override the baseline over time.
- This should remain metadata-first; source media stays untouched.

Product requirement:

- Humans should not have to think in `panX`, `panY`, and `zoom` first.
- The UI should expose semantic composition actions: `upper-third centered`, `vertical solo`, `hide desk`, `stack top`, `stack bottom`, `wide solo safe`, and similar editor-language presets.
- Base Framing should make it easy for Charlie or Mako to set the default composition for each video track before detailed cutting.
- Keyframe editing should start from that base, not fight it.

Implementation target:

- Add a Base Framing section per selected source lane.
- Show separate base values for `16:9` and `9:16`.
- Show whether timed keyframes exist and whether they override the current frame.
- Add simple reset controls: reset current format, reset keyframes, copy 16:9 base to 9:16 as a starting point, copy 9:16 base to 16:9 as a starting point.
- Add semantic presets that map to crop metadata, then let humans fine-tune.

## Keyframe transitions

Assumption to verify in-app: crop keyframes should transition gradually by default. The code currently has interpolation concepts, and linear interpolation appears to be the right MVP behavior.

Product requirement:

- A keyframe should not feel like a hard jump unless the editor asks for a hard jump.
- MVP: linear interpolation is acceptable.
- Later: add hold/ease-in/ease-out/ease-in-out choices.
- The UI must make the transition behavior visible enough that humans are not surprised.

## Mako correction data model

Corrections should be captured as structured edit events, not only as final session state.

Examples:

- switched camera from Charlie to Homer for a span
- shortened a visible span
- extended a quiet gap
- changed a base framing preset
- added a crop keyframe
- rejected a Codex short candidate
- kept a short but changed hook/caption/platform note
- marked a segment as good pacing, too slow, too dark, too repetitive, wrong speaker, bad cut, or great moment

Minimum fields:

- `id`
- `sessionId`
- `episodeSlug`
- `actorType`: `codex`, `human`, `assistant`, `importer`
- `actorNameOrEmail`
- `actionType`
- `targetType`: lane, decision, short, crop, transcript, export, note
- `targetId`
- `beforeJson`
- `afterJson`
- `reasonCode`
- `noteText`
- `createdAt`
- `source`: keyboard, mouse, agent command, import, review panel

## Notes without burden

Mako likes Premiere notes. We should learn from that, but adapt it to Quipsly.

Rules:

- Notes must be quick, optional, and attached to exact context.
- Notes can attach to sequence time, a lane, a decision, a short recipe, an export, or the whole episode.
- Notes should support plain language first, tags second.
- One shortcut should create a note at the playhead.
- A correction can exist without a note.
- A note can exist without a correction.

Useful note prompts:

- `Why this cut?`
- `What should Codex learn?`
- `Pacing issue`
- `Camera choice`
- `Framing issue`
- `Audio issue`
- `Potential short`
- `Great moment`

## Optional editor interview

After a review session, Codex can interview Mako or Charlie about high-signal changes.

This should be opt-in and short:

- Ask about clusters, not every tiny edit.
- Example: `You changed 14 Charlie spans to Homer in the first 10 minutes. Was that because Charlie was dark, because Homer was speaking, or because pacing felt better?`
- Store answers as session learning notes.

## Training paths

There are at least two viable futures:

1. Retrieval-assisted Codex first cut.
   - Store edit examples and correction patterns.
   - Codex uses them as context for future edits.
   - Lower infrastructure burden, useful sooner.

2. Train or fine-tune an edit-decision model.
   - Requires cleaner labeled data and more examples.
   - Potentially powerful later.
   - Do not overbuild this before the human workflow is strong.

Current recommendation:

Build the correction ledger and note capture now. Use retrieval-assisted Codex first. Keep the schema clean enough that a trained model is possible later.

## Product principle

The editor should improve because editing with it teaches it. The human should feel like they are doing normal creative work, not filling out homework for a machine.

## 2026-06-18: First semantic correction-note proof

The first working slice of the dogfood learning loop is now in QuipslyStudio:

1. Codex can observe the loaded episode state through `/state`.
2. Codex can select a whole source lane with `/select_lane`.
3. Codex can set a whole-lane base frame with `/program_crop` or `/program_crop_preset`.
4. Codex can record a non-mutating review/correction note with `/correction_note`.
5. The note returns through `/state` as `latestEditCorrectionNote` and `editCorrectionNotes`.

Proof command used on Episode 1:

```bash
curl -sG 'http://127.0.0.1:8080/program_crop_preset' \
  --data-urlencode 'lane_id=96C2D842-7E32-43B9-AB49-0D1185436E4D' \
  --data-urlencode 'format=16:9' \
  --data-urlencode 'preset=upper-third' \
  --data-urlencode 'mode=baseline'

curl -sG 'http://127.0.0.1:8080/correction_note' \
  --data-urlencode 'note=Codex proof note: upper-third base framing applied to Charlie so the dark wide shot reads closer and calmer before Mako review.' \
  --data-urlencode 'actor=Codex' \
  --data-urlencode 'actor_type=agent' \
  --data-urlencode 'category=framing' \
  --data-urlencode 'lane_id=96C2D842-7E32-43B9-AB49-0D1185436E4D'
```

Current limitation: this captures optional human/agent notes, but it does not yet automatically capture before/after state deltas for every edit action. The next stronger version should add a lightweight action ledger around key edit mutations so Mako can make corrections naturally while Quipsly stores enough structured evidence to improve later first cuts.

## 2026-06-19: Action ledger and script-awareness proof

QuipslyStudio now has the first automatic edit-action ledger slice alongside optional correction notes.

What changed:

1. `MediaSequence.editActionLedger` stores inspectable before/after records for meaningful edit mutations.
2. Program crop actions now append ledger entries for base-frame changes, preset application, timed keyframes, and keyframe clearing.
3. `/state` exposes `editActionLedgerCount`, `latestEditActionLedgerEntry`, and recent `editActionLedger` records.
4. Agent capability parity now treats the ledger as part of base-frame/keyframe reframing and the human-correction learning loop.

Proof on Episode 1:

- Active session: `episode-1-codex-real-edit-v1`.
- Command: `GET /program_crop_preset?lane_id=96C2D842-7E32-43B9-AB49-0D1185436E4D&format=16:9&preset=upper-third&mode=baseline`.
- Result: `/state` reported `editActionLedgerCount: 1` with `actionId: program-crop-preset-base-frame` and before/after crop JSON.

Script/text awareness also gained a first scaffold:

1. The Script sidebar now includes a `Script Now` panel.
2. `/state` exposes `currentTranscriptSegment` and `currentTranscriptWord`.
3. Current word timing is estimated from segment duration for now; this must be replaced with true word-level timestamps once transcription returns word timings.

Proof on Episode 1:

- Command: `GET /transcript_seed_demo`.
- Result: `/state` reported `transcriptSegmentCount: 6`, `currentTranscriptSegment.speaker: Charlie`, and `currentTranscriptWord.word: This` at playhead `0`.

Important product truth:

Text awareness is not a separate editor. It is another synchronized lens over the same shared timeline. Captions, quotes, shorts, search, notes, and AI edit suggestions should derive from that spine instead of drifting into detached text boxes.

## Proposed episode learning cadence

Once Episode 1 reaches a solid first pass:

1. Move to Episode 2 and continue building/editing in the same dogfood loop.
2. Move to Episode 3 and repeat with a different media/stress profile.
3. Return to Episode 1 for a deliberate second pass.
4. Mark second-pass Codex changes in the ledger or note metadata so we can distinguish first-pass instincts from lessons learned after seeing other episodes.

Do not loop forever. The goal is a useful second pass that proves transfer learning across episodes, not endless self-editing purgatory with better branding.

## 2026-06-19: Word-level transcript timing seam

The transcript spine now supports optional per-word timing while preserving the segment-level fallback.

What changed:

1. `TranscriptSegment` now has additive `words: [TranscriptWordTiming]` with decode-default compatibility for older sessions.
2. `TranscriptWordTiming` stores `word`, `startTime`, `endTime`, optional `confidence`, and `source`.
3. SRT/VTT imports still work and receive honest `segment-estimated` word timings.
4. JSON transcript imports can carry real word timing through `segments[].words[]` or `segments[].wordTimings[]`.
5. `/state.currentTranscriptWord` reports `wordStart`, `wordEnd`, `wordSource`, and one of:
   - `demo_word_timing`
   - `estimated_from_segment_duration`
   - `word_level_timing`

Proofs:

- Build proof: `./script/build_and_run.sh --verify` passed.
- Demo proof: `GET /transcript_seed_demo` returned `currentTranscriptWord.timingModel = demo_word_timing`.
- JSON proof: importing `/tmp/quipsly-word-timing-proof.json` and scrubbing to `1.2s` returned `currentTranscriptWord.word = gamma` with `timingModel = word_level_timing` and `wordSource = json-word-timing`.
- The active Episode 1 session was restored to demo transcript scaffold after the JSON proof.

Product truth:

Word-level transcript timing is a spine feature, not a caption-only feature. It should eventually drive jump-to-word, caption review, short extraction, quote capture, edit suggestions, and accessibility. Keep labels honest: demo timing is not ASR truth, estimated timing is not word truth, and imported word timing should remain traceable to provider/source.

## 2026-06-19 - Transcript word navigation becomes an editor control

The Script Spine now supports word-level navigation as a first-class editor action, not just passive text display.

What changed:

1. Words in the Script Now panel can be selected directly.
2. `/transcript_word` lets agents jump to `current`, `next`, `previous`, `first`, `last`, or an explicit `segment_id + index`.
3. `/state` now exposes both `currentTranscriptWord` and `selectedTranscriptWord`.
4. Transcript imports, generation, seeding, and clearing reset selected-word state so stale word selections do not drift across transcript swaps.
5. The `script-aware-editing` capability advertises the correct semantic commands for word navigation.

Proof:

- Build proof: `./script/build_and_run.sh --verify` passed.
- Runtime proof: `GET /transcript_seed_demo`, then `GET /transcript_word?mode=first`, then `GET /transcript_word?mode=next` moved the shared playhead to `0.50s`.
- `/state` reported `currentTranscriptWord.word = is` and `selectedTranscriptWord.word = is` with `timingModel = demo_word_timing`.
- Screenshot proof: `/tmp/quipsly-transcript-wordnav-proof.png`.

Product truth:

Transcript awareness is now becoming an editable navigation surface. The timeline remains the source of truth; the text is a synchronized lens that can drive cuts, captions, quotes, shorts, accessibility, and agent edit decisions.

## 2026-06-19 - Script Now human controls

The Script Now panel now exposes word navigation as visible human controls, not only as agent endpoints.

What changed:

1. Added `Prev word`, `Next word`, and `At playhead` controls to the Script Now panel.
2. The controls use the same `selectTranscriptWordForAgent` pathway as the semantic endpoint, keeping human UI and agent UI on one behavior path.
3. Re-ran build and runtime proof after relaunch.

Proof:

- Build proof: `./script/build_and_run.sh --verify` passed after the UI change.
- Runtime proof: seeded demo transcript and advanced two words; `/state` reported playhead `1.00s`, `currentTranscriptWord.word = the`, and `selectedTranscriptWord.word = the`.
- Screenshot proof: `/tmp/quipsly-transcript-wordnav-ui-proof.png`.

UX follow-up:

The current chip grid proves the workflow, but it is visually cramped. A future pass should turn Script awareness into a calmer reading pane with clear speaker blocks, transcript search, caption review, and optional larger word highlighting for active editing.

## 2026-06-19 - Editing pass context for cross-episode learning

QuipslyStudio now has a lightweight sequence-level `EditPassContext` so dogfood editing can name the loop it is in without becoming bureaucracy.

What changed:

1. `MediaSequence.editPassContext` stores `label`, `actor`, `actorType`, `passNumber`, `goal`, `status`, `startedAt`, and `updatedAt`.
2. `/edit_pass` lets a human or agent mark the current pass context.
3. `/state.editPassContext` exposes the active pass context.
4. Setting an edit pass creates an `edit-pass-context` entry in the action ledger with before/after JSON.

Proof:

- Build proof: `./script/build_and_run.sh --verify` passed.
- Runtime proof: `GET /edit_pass?label=Codex Episode 1 dogfood pass&actor=Codex&actor_type=agent&pass_number=1...` updated `/state.editPassContext` and wrote a ledger entry.

Recommended cadence:

1. Episode 1: Codex dogfood first pass, focused on making the editor usable and honest.
2. Episode 2: Codex dogfood first pass, focused on more complex gap/sync stress.
3. Episode 3: Codex dogfood first pass, focused on transfer across a different episode profile.
4. Episode 1: Codex second pass, explicitly marked as pass 2, applying lessons learned from Episodes 2 and 3.
5. Mako/human review passes: mark separate pass context before review, but do not force notes on every small correction.

Product truth:

The editing pass label is process metadata. It should reduce anxiety and improve handoff clarity; it should not become a phase gate, grade, compliance score, or reason to slow down creative editing.

## 2026-06-19 - Episode 2 cautious handoff and program ambiguity signal

Episode 2 is now usable as the next dogfood lane, but inherited Premiere decisions need review before being treated as Quipsly-native program truth.

What changed:

1. Loaded native session `episode-2-native-proof` after saving Episode 1.
2. Marked `Codex Episode 2 dogfood pass` with `/edit_pass`.
3. Added `/state.programDecisionAmbiguity` as a playhead-local, non-destructive review signal.
4. The ambiguity signal names active visual lanes, active speaker lanes, active source clips, and plain-English review guidance.

Proof:

- Episode 2 loaded as `Episode 2 Premiere Rescue` with 9 lanes, 5 video proxies ready, 0 blocked video lanes, 0 blocked audio lanes, and 5 queued short recipes.
- Scrub proof at 20s, 420s, 900s, and 1800s kept the source wall synced with max deltas around a millisecond.
- Build proof after ambiguity signal: `./script/build_and_run.sh --verify` passed.
- Runtime proof at 20s: `/state.programDecisionAmbiguity.status = needs_program_decision_review`, `activeVisualLaneCount = 3`, `activeSpeakerLaneCount = 2`, and `sourceSyncProof.status = synced`.

Product truth:

This is not a quality grade. It is an inherited-session truth signal: multiple SHOW decisions may be intentional, but Quipsly should make the overlap obvious before Codex, Mako, or Charlie treats it as final edit truth.

## 2026-06-19 - On-demand program ambiguity report

QuipslyStudio now has an explicit analysis command for inherited Premiere-style overlaps.

What changed:

1. Added `GET /program_ambiguity_report?sample_limit=<optional-count>`.
2. The report samples intervals between decision boundaries instead of recomputing during every state refresh.
3. `/state.programDecisionAmbiguityReport` stores the latest report.
4. The report includes review counts, examples, max active visual lanes, max active speaker lanes, and plain-English guidance.

Proof on Episode 2:

- Build proof: `./script/build_and_run.sh --verify` passed.
- Runtime command: `GET /program_ambiguity_report?sample_limit=500`.
- Result: `reviewPointCount = 232`, `sampledIntervalCount = 273`, `sourceIntervalCount = 546`, `maxActiveVisualLaneCount = 3`, `maxActiveSpeakerLaneCount = 2`.
- Status: `needs_program_decision_review`.

Product truth:

This gives the editor a map of imported ambiguity without judging the edit or mutating anything. The next Episode 2 editing pass should convert these inherited overlapping SHOW regions into intentional Quipsly-native program choices: Charlie, Homer, clip, Charlie+clip, Homer+clip, both, or skip.

## 2026-06-19 - Program ambiguity review navigation

Episode 2 exposed the correct next stress test: imported Premiere evidence can leave multiple speaker/video lanes marked SHOW at the same sequence time. Quipsly should not silently guess in that situation. The editor now treats this as a review queue:

- `/program_ambiguity_report?sample_limit=500` builds a bounded, non-destructive map of sampled overlap points.
- `/program_ambiguity_review?mode=first|previous|next|last|nearest` navigates to a sampled review point and scrubs the shared playhead there.
- `/state` now exposes `selectedProgramDecisionAmbiguityExample` so agents can prove where they are in the review queue.
- The Program Hearth card shows review count, selected review point, and Prev/Next controls.

Proof from the running app: Episode 2 reported 232 review points from 273 sampled intervals. Navigation moved from review point 1 at 7.30s to point 2 at 16.02s and back, with Program Output and Source Grove following the shared playhead. This remains metadata-only: no media, decisions, exports, or publication state are mutated by the review navigation itself.

Product lesson: analysis is not a feature until it gives the editor a calm next action. A scary number becomes usable when it is paired with semantic navigation.

## 2026-06-19 - First overlap resolved as explicit Quipsly metadata

Episode 2 dogfood proof now closes the loop from detection to action:

1. Map overlaps with `/program_ambiguity_report?sample_limit=500`.
2. Jump to a sampled review point with `/program_ambiguity_review?mode=first`.
3. Resolve the selected interval with `/program_ambiguity_resolve?choice=first|second|third|skip|<lane-id-or-name>`.
4. Remap overlaps to refresh the report.

Proof from the running app:

- Before: at 7.30s, Program was showing two speaker/video lanes.
- Selected interval: 5.72s-8.88s.
- Action: resolved as `Charlie Camera - CharlieVid1.MP4`.
- After: Program showed one visual/speaker lane and the playhead ambiguity status became `clear_at_playhead`.
- Remap: review count dropped from 232 to 231.

This is the desired Quipsly editing loop: imported evidence can be messy, but cleanup happens as explicit SHOW/SKIP metadata over whole synced lanes. No raw media, proxy media, or source lane is chopped.

## 2026-06-19 - Resolve and advance loop

The overlap review queue now supports a faster agent/human pass-through:

- `/program_ambiguity_resolve?choice=first&advance=next` resolves the selected sampled interval, remaps overlaps, and advances to the next unresolved point.
- The Program Hearth card exposes `Use 1 + Next` for the same loop.

Proof from the running app:

- Started from `episode-2-codex-overlap-review-v1` with 231 review points.
- Resolved the selected interval 14.44s-17.60s as Charlie.
- Remapped automatically.
- Review count dropped 231 -> 230.
- Playhead advanced to the next unresolved point at 23.80s.

New product nuance discovered in proof: some review points include a speaker lane plus a source/title/reference lane. A blunt `Use 1` can be correct for speaker-only ambiguity but may remove a legitimate clip overlay. The next resolution affordance should support `Use 1 + Clip` / `Use 2 + Clip`, preserving source/reference lanes while choosing the speaker lane.

## 2026-06-19 - Clip-preserving overlap resolution

The Episode 2 review queue revealed a critical editing distinction: some ambiguity points are not simply `speaker A vs speaker B`; they are `speaker A vs speaker B plus source/title/reference overlay`. The editor now supports clip-preserving resolution choices:

- `choice=first_clip`
- `choice=second_clip`
- visible `1 + Clip` and `2 + Clip` buttons

Proof from the running app:

- Before: at 23.80s, Program had 3 active visual lanes, 2 active speaker lanes, and 1 active source/title clip lane.
- Action: `/program_ambiguity_resolve?choice=first_clip`.
- After: Program had 2 active visual lanes, 1 speaker lane, and 1 source clip lane.
- The playhead ambiguity status became clear while preserving the title/source lane.
- Remap dropped review count 230 -> 229.

This keeps the old prototype intent alive in the native architecture: Charlie, Homer, Both, Skip, Charlie+Clip, and Homer+Clip are decision recipes over whole synced lanes, not chopped clips.

## 2026-06-19 - Script awareness as editor training data

The transcript surface is now treated as a read-along spine during editing, not a separate text editor.

Current state:
- The Script workbench follows the shared sequence playhead.
- The active speaker and active word are visible during editing.
- Words are selectable jump points through both UI controls and `/transcript_word` semantic commands.
- Keyboard shortcuts now support word review (`Option+Comma`, `Option+Period`, `Option+S`) and Episode 2 ambiguity cleanup (`Option+R`, `Option+[`, `Option+]`, `Option+1/2/4/5/6`).

Why it matters:
- This connects spoken text, visual decisions, short extraction, captions, quotes, and later human correction notes into one inspectable learning loop.
- It supports the product thesis that Quipsly is an annotation-and-creation system: editing work should create useful training/context data as a side effect, without forcing the human editor to write notes for every tiny correction.

Next transfer-learning pass:
1. Finish an Episode 2 first-pass cleanup using the overlap review queue.
2. Move to Episode 3 and let its different messiness reveal new editor friction.
3. Return to Episode 1 for a deliberate Codex second pass marked as pass 2, applying lessons learned from Episodes 2 and 3.
4. Stop after the useful second pass. The goal is learning transfer, not endless polish purgatory in a tasteful moss cardigan.

## 2026-06-19 - Second-pass loop note

The transcript/script follow panel should become a first-class editing aid, not a side document. The target loop is:
1. Codex makes a first-pass episode edit using the shared playhead, source wall, script follow, and ambiguity operator.
2. Human/Mako reviews the edit in the same app, adding notes or correcting decisions without needing to explain every tiny change.
3. Codex reviews those changes as training data: what changed, where, why if noted, and whether the correction was speaker selection, source-clip preservation, pacing, framing, or short extraction.
4. After Episodes 1, 2, and 3 each get a pass, return to Episode 1 for a second-pass refinement using lessons learned from the messier episodes.

Working rule:
- Second-pass changes should be labeled as second-pass Codex or human/Mako adjustments where practical, but the tool should not make note-taking feel mandatory. Capture useful data naturally from edit deltas first, then enrich with notes when the human has something worth saying.
