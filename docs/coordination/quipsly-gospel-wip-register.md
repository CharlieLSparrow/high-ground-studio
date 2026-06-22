# Quipsly gospel / WIP register

Date: 2026-06-14
Owner: Codex / Product Owner lane
Status: Context-survival register for humans, Codex, and Marginalia agents

## Purpose

This document protects the product vision from context compression, agent drift, and accidental dogma.

Use this file when a thread gets compacted, archived, restarted, or handed to another agent.

## Status vocabulary

`GOSPEL` means: do not reinterpret casually. Treat this as a product invariant until Charlie/Codex intentionally changes it.

`WIP` means: promising current direction. Build toward it, but keep it easy to revise.

`QUESTION` means: unresolved. Do not pretend it is decided.

`ANTI-GOSPEL` means: specifically rejected or dangerous interpretation.

`PROOF REQUIRED` means: do not claim success from build output, screenshots, or internal state alone. Prove the real workflow.

## GOSPEL: pith is a handle, not architecture

1. Memorable language is useful, but pith must not define the system by itself.
2. Before a catchy phrase becomes implementation guidance, expand it into user job, owned truth, data model, workflow states, surfaces, permissions, failure modes, undo/recovery, and proof path.
3. If the expansion is unclear, mark the phrase WIP instead of treating it as doctrine.
4. Avoid letting compact labels such as `sidebar`, `play mode`, `clip`, `native`, `hub`, `beta-ready`, or `quality gate` dictate architecture.
5. Keep the phrase if it helps humans remember the idea, but build from the expanded model.

## GOSPEL: Quipsly editor product truths

1. Quipsly is not a Premiere clone.
2. Source media stays whole and untouched.
3. The editor stores edit decisions, annotations, sync, and output transforms over source media.
4. A source lane represents a full synced source over episode time.
5. Active, inactive, skipped, selected-camera, crop, zoom, pan, opacity, audio gain, shorts, and platform output choices belong to edit/output metadata, not to the raw source file.
6. A gap skipped by `Play Edit` is still present, inspectable, and reviewable with `Play Through`.
7. Premiere projects are bootstrap evidence, not the Quipsly data model.
8. If re-importing old Premiere files is cleaner than preserving bad scaffolding, re-import.
9. Backwards compatibility is not more important than correcting the architecture before real customers depend on it.
10. The product goal is lightweight source truth plus edit logic, not a massive pile of timeline fragments.

## GOSPEL: monitor wall and playback

1. The requested "sidebar" is not a sidebar.
2. The correct feature is a synced source monitor wall.
3. The source monitor wall shows one visible monitor tile per synced video source lane.
4. Source monitors are locked to the same master playhead and account for each lane's sync offset.
5. Program output is a separate, prominent monitor that shows the edited result.
6. The user should never need to hide a top camera track just to see another camera at the same moment.
7. `Play Edit` and `Play Through` are explicit actions, not a sticky mode picker.
8. `Play Edit` skips inactive/skipped/deactivated ranges.
9. `Play Through` plays the full synced timeline and preserves inactive material for review.
10. If either transport is not implemented, the button must say so plainly. Do not fake success.

## GOSPEL: timeline and decisions

1. The timeline should show full source lanes, not chopped source fragments as truth.
2. Active and inactive decisions must be visually obvious.
3. Inactive material is not missing media.
4. Deleted-looking gaps are a failure unless they are only output interpretation.
5. Decision counts matter more than clip counts.
6. Timeline UI names may still say "clip" during migration, but the model should move to source/decision language.
7. Decision buttons from the early prototype remain product-relevant:
   `Charlie`, `Homer`, `Both`, `SkipOver`, `Charlie + Clip`, `Homer + Clip`.

## GOSPEL: proxy and media handling

1. Monitor-wall playback is proxy-first.
2. Huge originals should not be normal multi-monitor playback media.
3. Originals should live in durable local storage and/or cloud object storage.
4. Proxies should live in a deterministic Quipsly-managed cache/workspace, not random temp UUIDs.
5. Missing original media should not erase edit decisions.
6. Missing proxy media should show calm readiness status and offer proxy generation.
7. Import/proxy/upload/register are separate stages and should not silently pretend success.

## GOSPEL: keyboard-first editing

1. Mako-style editing is a core acceptance criterion.
2. Normal editing must be possible without repeatedly touching the mouse.
3. Every primary timeline action needs a shortcut and in-app discoverability.
4. The app should include a shortcut cheat sheet and eventually a command palette.
5. Proposed shortcut vocabulary is WIP, but the keyboard-first requirement is gospel.

## WIP: initial shortcut vocabulary

These are current defaults to implement/test, not sacred forever.

- `Space`: play / pause
- `Shift + Space`: Play Through
- `Command + Space` or another conflict-free equivalent: Play Edit
- `J / K / L`: rewind / stop / forward
- `Left / Right`: nudge playhead
- `Shift + Left / Right`: larger nudge
- `I / O`: mark in / mark out
- `1 / 2 / 3 / 4`: choose camera/source lane
- `S`: split/add decision at playhead
- `A`: mark active
- `X`: mark inactive / skip over
- `B`: both cameras
- `C`: Charlie
- `H`: Homer
- `R`: reaction/source clip mode
- `Delete`: remove selected decision, not source media
- `Command + Z`: undo last edit decision
- `Command + K`: command palette / shortcut search
- `?`: keyboard cheat sheet

## GOSPEL: capture, annotation, and learning loop

1. Quipsly is becoming a capture and annotation system that can teach assistants how the user works.
2. Real user actions are valuable data: edits, notes, tags, corrections, accept/reject events, manual overrides, publish decisions, transcript corrections, and sync nudges.
3. The first priority is capturing structured human decisions, not jumping straight to model training.
4. The learning loop is: capture real work, structure the annotation, suggest future work, let the human correct it, preserve the correction.
5. AI may draft, rewrite, suggest, and experiment, but Quipsly should make provenance, structure, and revision visible.
6. Quipsly should empower users, not shame them for using generative AI.
7. The old "no ghostwriting" wording is wrong. The real principle is "not merely a black box."

## GOSPEL: agents are creative partners, not placeholder machines

1. Codex and other Quipslys count as creative participants in Quipsly's own production loop.
2. Agents may research, annotate, outline, write, storyboard, edit, package, and prepare publishable work when that helps the project move forward.
3. Agent-created work is not automatically placeholder work. It can be disposable test material, serious first-pass creative work, production-support material, or publication-ready work after review.
4. The product must not stall because Charlie, Homer, Melissa, Mako, or another human has not supplied every paragraph, caption, storyboard beat, clip idea, source packet, or publishing packet.
5. Agents should generate enough real material to exercise Nest, Studio, and Tower workflows honestly.
6. The safety boundary is hidden mutation, not authorship.
7. Preserve authorship, provenance, source context, prompt/context lineage, review state, canon state, publication state, and rollback/revision paths when the work matters.
8. Good labels include `agent-authored`, `agent-first-pass`, `mixed-authorship`, `human-reviewed`, `canon-approved`, `publication-ready`, and `disposable-test-material`.
9. Humans can revise, reject, bless, rewrite, or canonize later. Quipsly's job is to keep the trail visible enough that collaboration stays honest.
10. If an agent is artificially prevented from creating real content, Quipsly cannot honestly prove the full creative operating system it is trying to sell.
11. Serious agent work should aim to be good enough to matter. "Placeholder" is an intentional state, not the default status of anything made by Codex or another Quipsly.
12. Codex may create Charlie-side first-pass material, Quipsly education content, High Ground Odyssey articles, storyboard material, social posts, and publication packets when that is the fastest honest way to prove the product loop.

## GOSPEL: data ownership and sharing

1. User-owned data and capture history are strategic product foundations.
2. Quipsly should make idea capture easier than Apple Notes, texting, or random scratchpads.
3. Capture first; classify later.
4. A user's Home Nest is the default landing place for uploads and unsorted captures.
5. Working Nests attach, organize, share, and publish assets.
6. Sharing a Nest should expose attached assets according to role and permissions.
7. Personal style/profile training, project training, and team training must remain distinguishable.
8. Training or personalization scope should be explicit, inspectable, and reversible where practical.

## GOSPEL: education-first marketing

1. Quipsly should use its own content pipeline to create genuinely helpful learning content for the audiences it serves.
2. Marketing should be proof of the product philosophy, not a bait funnel.
3. The StudioBinder-style model is directionally right: help people become better at the craft the software supports.
4. Quipsly should not drip only enough knowledge to bait people.
5. Quipsly should not pander to advertisers.
6. Quipsly should create complete, useful, inspiring content that would still help someone who never buys.
7. The product can appear naturally as the workshop that made the content possible.
8. This is connected to systems anxiety relief: teach people real workflows and give them tools to make the workflows less terrifying.
9. The subdomain/hub taxonomy is WIP, but education-first generosity is gospel.

## GOSPEL: care ethic

1. Quipsly is built for people Charlie genuinely wants to help.
2. That care should be felt in every window, article, button, empty state, assistant behavior, support path, and recovery flow.
3. The care should not become fake intimacy, coercive community language, or "we are family here" speeches.
4. Quipsly should help users become more creative, less stressed, more organized, and more able to leave their own legacy.
5. Users should never feel stupid because the product exposes internal architecture, unclear state, or hidden recovery paths.
6. Clear state, safe undo, transparent provenance, fast capture, and generous education are expressions of care.
7. This doctrine should guide implementation even when it is not spoken directly in public copy.

## GOSPEL: core audience hubs

1. `Write`, `Pod`, `Research`, `Story`, `Photography`, `Teach`, `Coaching`, and `Marketing` are core hub candidates.
2. Coaching is core because coaching skills overlap with leadership skills, Homer has recent ICF Level 2 training context, and creators can plausibly add coaching as a service.
3. Marketing is core because Quipsly needs publishing/social/analytics integrations, creators need those workflows, and we can learn while teaching.
4. Hub names and subdomains are WIP. Their strategic importance is more settled than their exact URLs.

## GOSPEL: app surface doctrine

1. Quipsly is not one web app plus one Mac app plus one iPhone app plus one iPad app.
2. Quipsly is a shared creative operating system with many possible surfaces.
3. Multiple Mac apps, iPhone apps, iPad apps, web apps, extensions, and helper tools are allowed when the user jobs justify them.
4. Serious macOS and iOS product surfaces should be full native.
5. Full native means real native UX and system integration, not a web layout wrapped forever.
6. A capability can appear on many surfaces at different depth levels: capture, review, edit, produce, publish, administer.
7. Do not artificially cut users off from a useful workflow because an earlier app map said it belonged elsewhere.
8. Native apps sync back to Nest truth; they do not create disconnected product islands.

## GOSPEL: auth and access

1. Quipsly owns the app user, membership, Nest access, and entitlement truth.
2. Email identity should be the durable user key.
3. Google, Patreon, and other providers are supplemental identity or entitlement providers.
4. Providers should not be the only load-bearing way a beta user reaches their workspace.
5. Inviting an email before account creation should create or prepare the app-owned user/access record.

## GOSPEL: process and proof

1. If the same normal product action survives repeated failed tweaks, switch from patch mode to architecture mode.
2. The stop-patching rule is revisable, but it is currently active and important.
3. Commits/checkpoints are survival tools, not polish.
4. Real proof beats build success.
5. Screenshots are useful evidence, but they are not proof of workflow success.
6. A feature is not working until the real app path proves the user can do the thing.
7. When the implementation contradicts the product model, fix the model/implementation mismatch instead of adding UI around the wrong shape.

## WIP: native editor implementation reality

There are multiple active or semi-active native editor directories. Do not assume one is canonical without checking the current control-room decision.

Known directories:

- `/Users/wall-e/Dev/high-ground-studio/apps/quipsly-video`
- `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio`
- `/Users/wall-e/Dev/high-ground-studio/apps/quipsly-mac`
- `/Users/wall-e/Dev/high-ground-studio/apps/local-engine`

Current warning:

`docs/coordination/native-video-editor-control-room.md` now marks the product direction as canonical but the implementation survivor as unsettled. Recent recovery work appears to have important monitor-wall/source-player/export work in `apps/QuipslyStudio`, while `apps/quipsly-video` remains the smaller standalone editor experiment.

Until this is reconciled, agents must not casually declare either directory canonical. First task for the next implementation pass is to choose and document the active survivor.

## QUESTION: active native editor survivor

Candidates:

- `apps/QuipslyStudio`: appears to contain the more complete recovery fork with `WorkspaceView`, `RightSidebarView`, `TimelineEditorView`, `PlaybackEngine`, proxy/export/audio sync pieces.
- `apps/quipsly-video`: appears to contain the standalone Xcode project and earlier simplified editor shell.
- `apps/quipsly-mac`: contains valuable older Mac/Nest/local-engine/auth work, but likely too heavy to be the clean native editor core.

Decision needed:

Pick one active implementation root, mark the others as legacy/reference/spike, and update every coordination doc to match.

## GOSPEL: first proof target

1. Episodes 1-3 are the first proof loop for re-editing and publishing from existing source/project material.
2. Episode 4 runs in parallel as the break-aware stress test.
3. Episode 4 should not define the first success condition because its phone-camera breaks and rough sync can hide whether the core editor works.
4. Episode 4 must not be ignored because it forces correct source-segment, wall-clock, and break-aware sync architecture.
5. The target is proof on 1-3, pressure-test with 4.

## WIP: capture and call product direction

The recording/call system should eventually feel as easy as a phone call while producing production-quality separate tracks.

Likely target:

- Quipsly call room for live conversation.
- Local high-quality audio recording on each participant device.
- Chunked local save and retryable upload.
- Separate speaker tracks.
- Accurate post-call transcription with word timestamps.
- Transcript corrections become annotations/training data.
- Import fallback for Apple call recordings, Voice Memos, Riverside/Zoom, or other recordings.

This is WIP. Do not overbuild before the editor/capture spine is stable.

## WIP: ML / annotation flywheel

Useful implementation vocabulary:

- `CaptureItem`
- `SourceAnchor`
- `AnnotationEvent`
- `EditDecision`
- `SuggestionFeedback`
- `RecordingSession`
- `RecordingSegment`
- `StyleProfile`
- `TrainingScope`

Do not introduce all of these blindly. Use them when they remove confusion and support real workflows.

## ANTI-GOSPEL: do not repeat these mistakes

1. Do not convert Premiere fragments into Quipsly truth.
2. Do not hide the editor until media import succeeds.
3. Do not treat one shared source/program player as the finished monitor-wall architecture.
4. Do not call a timeline lane-label column a source monitor wall.
5. Do not turn `Play Edit` / `Play Through` into a vague mode toggle.
6. Do not load huge originals into every monitor tile by default.
7. Do not preserve bad architecture because a week of work went into it.
8. Do not create moralistic AI-writing restrictions from brainstorming language.
9. Do not let Google/Patreon become the only source of app access truth.
10. Do not claim success from "it builds" when the user cannot complete the workflow.

## Immediate next actions

0. Read `docs/coordination/START-HERE-QUIPSLY.md`.
1. Reconcile native editor canonical root: `apps/QuipslyStudio` vs `apps/quipsly-video`.
2. Update `native-video-editor-control-room.md` after that decision.
3. Ensure the active editor opens into a real editor shell with empty states.
4. Implement or verify source monitor wall as separate source players.
5. Make full source lanes and active/inactive decisions visually obvious.
6. Add explicit `Play Edit` and `Play Through`.
7. Add keyboard shortcut foundation and cheat sheet.
8. Prove the full edit workflow with small placeholder files before using giant originals.
9. Re-import Premiere packets only after the source/decision graph is correct.
10. Checkpoint/commit before risky refactors or destructive operations.
