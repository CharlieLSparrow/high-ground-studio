# Quipsly Audio Production Workflow

Last updated: 2026-07-11

## Product rule

Original audio and video files are evidence. Quipsly does not destructively edit them.

Every cleanup, isolation, repair, mix, master, or loudness step must produce a derived artifact with a manifest that records:

- source files used
- sync offsets used
- processing chain
- tool versions when available
- output path
- intended use
- whether it is approved for publication

This keeps the source timeline stable. Audio treatments must not alter source lengths unless the manifest explicitly declares a time-warp repair and downstream sync is rebuilt from that repair.

## AAA Audio Workbench direction

Quipsly's audio ambition is not just acceptable podcast cleanup. The goal is to make imperfect, disjointed, real-world recordings feel like a calm studio production while staying transparent enough for Codex, Charlie, Mako, or Homer to understand what happened.

The Audio Workbench should optimize for:

- source-aware cleanup before mastering
- stem-level visibility before magic-box enhancement
- speaker-aware activity detection for speech, laughter, reactions, and useful overlap
- controlled suppression of phone-call echo, mic bleed, park noise, handling noise, and background voices
- proof-window iteration before expensive full renders
- normal stereo WAV/M4A handoffs for real editing tools
- diagnostic maps, source reports, and restoration candidates that make failures easy to locate

Research-backed practical principles:

- multitrack source cleanup beats post-mix rescue whenever separated sources exist
- loudness targets are delivery constraints, not a substitute for good dialogue balance
- restoration tools such as dxRevive, Adobe Enhance Speech, iZotope RX, Descript Studio Sound, or Auphonic-style leveling are candidates inside a controlled chain, not the chain itself
- aggressive gates can remove echo and also murder laughter, breath, and humanity; release times, room-tone floors, and proof windows matter
- a mastered spine that sounds good but hides its source decisions is not good enough for Quipsly

The grown-up loop is:

1. diagnose source health
2. align every stem to sequence time
3. create speaker/source activity maps
4. render short proof-window treatment variants
5. promote the best profile into a new conformed baseline version
6. export a normal stereo handoff plus diagnostics
7. make long-form and shorts branches inherit that baseline

## Human approval preflight

The current Episode 4 v006 workflow now includes a stable human approval preflight. This is the compact guardrail between "there are many review artifacts" and "a human can safely route the decision."

- Script: `apps/QuipslyStudio/script/audio_workbench_human_approval_preflight.py`
- Stable Markdown: `HUMAN_APPROVAL_PREFLIGHT.md`
- Stable HTML: `HUMAN_APPROVAL_PREFLIGHT.html`
- Stable launcher: `OPEN_HUMAN_APPROVAL_PREFLIGHT.command`

The preflight checks the master WAV/M4A handoffs, stable review entry points, technical audition snippet readiness, review gate status, branch lock truth, notes inbox state, dxRevive fallback state, handoff index state, and goal-audit counts. It may register review artifacts in the baseline manifest, but it must not approve audio, unlock branch inheritance, render branches, upload, publish, or mutate original media.

Current v006 result: `ready-for-human-listen-notes`. That means the package is ready for a real human listen-note pass, while `approvalStatus=machine-candidate-needs-human-listen-proof`, `branchInheritanceReady=false`, and `branchRenderReady=false` remain the correct locked state.

## Unresolved requirement review

The current Episode 4 v006 workflow also includes a stable unresolved requirement review. This is the honest edge of the goal: every partial or locked requirement from the goal completion audit becomes a direct action lane with the artifacts needed to judge it.

- Script: `apps/QuipslyStudio/script/audio_workbench_unresolved_requirement_review.py`
- Stable Markdown: `UNRESOLVED_REQUIREMENT_REVIEW.md`
- Stable HTML: `UNRESOLVED_REQUIREMENT_REVIEW.html`
- Stable launcher: `OPEN_UNRESOLVED_REQUIREMENT_REVIEW.command`

The workbench distinguishes `partial` from `locked`. Partial means "review/listen/validate this evidence." Locked means "do not unlock this here; record the required human listen decision or branch gate proof first." It may register review artifacts in the baseline manifest, but it must not approve audio, unlock branch inheritance, render branches, upload, publish, or mutate original media.

Current v006 result: `ready`, unresolved `6`, partial `4`, locked `2`, and missing linked artifacts `0`. The workbench now maps each lane to concrete proof surfaces such as speaker cleanup/preservation, branch inheritance gates, branch render proof, dxRevive fallback, reusable noisy/outdoor intake, and the grown-up workflow surfaces.

Agent/readback convention: stable review reports should expose a generic top-level `status` field in addition to any domain-specific field such as `preflightStatus`, `reviewStatus`, or `commandCenterStatus`. This keeps automation simple without removing the more precise human-readable state.

<!-- audio-master-source-balance-checkpoint:start -->
## Latest Episode 4 audio checkpoint: master/source balance audit

Generated on 2026-07-10 for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`.

- Latest audit: `audio-master-source-balance-audit-v006-candidate-homer-preserving-clean-20260710-152914.md`.
- Latest listen-priority queue: `audio-listen-priority-queue-v006-candidate-homer-preserving-clean-20260710-153127.json`.
- Latest listen-priority snippet pack: `audio-listen-priority-snippet-pack-v006-candidate-homer-preserving-clean-20260710-153128.json`.
- Latest listen-priority review reel: `audio-listen-priority-review-reel-v006-candidate-homer-preserving-clean-20260710-153153.md`.
- Latest review-reel notes smoke: `audio-listen-priority-review-reel-notes-smoke-v006-candidate-homer-preserving-clean-20260710-153214.md`.
- Latest source-balance listen companion: `audio-source-balance-listen-companion-v006-candidate-homer-preserving-clean-20260710-153214.md`.
- Latest speaker activity review board: `audio-speaker-activity-review-board-v006-candidate-homer-preserving-clean-20260710-180516.md` / `audio-speaker-activity-review-board-v006-candidate-homer-preserving-clean-20260710-180516.html`, with `15` focus windows, `40` listen-priority queue items, joined source activity/automation/listen-question evidence, and no approval/branch/render/source mutation.
- Latest speaker cleanup proof pack: `speaker-cleanup-proof-pack-v006-candidate-homer-preserving-clean-20260710-195648/speaker-cleanup-proof-pack.md` / `speaker-cleanup-proof-pack-v006-candidate-homer-preserving-clean-20260710-195648/speaker-cleanup-proof-pack.html`, with `15` focus windows, `90` rendered A/B snippets, `0` render failures, and no approval, branch, or source mutation. It compares mastered spine, raw aligned stems, and gated contribution stems so reviewers can judge over-gating, remaining echo, and park-noise cleanup quickly.
- Latest audio spine listen sanity check: `audio-spine-listen-sanity-v006-candidate-homer-preserving-clean-20260710-194609/audio-spine-listen-sanity.md`, with status `machine-sane-human-listen-required`, `passed=true`, Charlie active `3189.943s`, Homer active `1164.0s`, master audible during active windows `100.0%` for both, quiet active windows `0` for both, and no approval, branch, render, or source mutation.
- Latest reusable audio production profile: `audio-reusable-production-profile-v006-candidate-homer-preserving-clean-20260710-182708.md` plus stable `REUSABLE_AUDIO_PRODUCTION_PROFILE.md`, capturing the Episode 4 source-aware cleanup pattern as a reusable starting preset for future noisy/outdoor Homer recordings while keeping human-listen proof required before production-default use.
- Latest reusable audio production profile smoke: `audio-reusable-profile-smoke-v006-candidate-homer-preserving-clean-20260710-193200/audio-reusable-profile-smoke.md`, with `passed=true`, `6` scenarios, `0` failures, duplicated synthetic fixture stems only, and no approval, branch, or source mutation. It proves the exported profile can run outside Episode 4 paths while preserving speech, reducing quiet wrong-mic bleed, reducing outdoor gap noise, and preserving reference audio.
- Latest dxRevive manual bounce packet: `dxrevive-manual-bounce-packet-v006-candidate-homer-preserving-clean-20260710-184122/dxrevive-bounce-packet.md`, with `3` derived treatment stems, `3` reference stems, symlinked inputs, and no huge media copy, approval, branch, render, or source mutation.
- Latest dxRevive bounce validation: `dxrevive-bounce-validation-v006-candidate-homer-preserving-clean-20260710-184127.md`, with status `waiting-for-bounces`, `3` expected bounces, `0` present, `0` validated, `3` missing, and `0` errors.
- Latest dxRevive bounce validator smoke: `dxrevive-bounce-validator-smoke-v006-candidate-homer-preserving-clean-20260710-185501.md`, with `passed=true`, `5` scenarios, `0` failures, and no approval, branch, render, or source mutation. It proves missing bounces, valid bounces, duration mismatches, sample-rate mismatches, and channel mismatches route correctly before returned restoration files can influence a candidate.
- Latest dxRevive proof candidate planner: `dxrevive-proof-candidate-plan-v006-candidate-homer-preserving-clean-20260710-191659/dxrevive-proof-candidate-plan.md`, with status `waiting-for-validated-dxrevive-bounces`, proof rendering refused, no approval/branch/render/source mutation, and the future A/B proof-candidate bridge ready once returned bounces validate.
- Latest dxRevive proof candidate planner smoke: `dxrevive-proof-candidate-planner-smoke-v006-candidate-homer-preserving-clean-20260710-191657.md`, with `passed=true`, `3` scenarios, `0` failures, `4` sandbox proof snippets rendered, and real approval/branch/source truth preserved.
- Latest source-balance repair workorder: `audio-source-balance-repair-workorder-v006-candidate-homer-preserving-clean-20260710-155529.md`, with `3` conditional repair actions and no render/approval/source mutation.
- Latest source-balance repair preflight: `source-balance-repair-preflight-v006-candidate-homer-preserving-clean-20260710-161150/source-balance-repair-preflight.md`, with `3` proof-window plans, `safeToRender=true` only because the explicit proof-only override was used, `renderAttempted=true`, `renderSuccessCount=6`, and `renderFailureCount=0`.
- Latest source-balance proof comparison audit: `source-balance-repair-preflight-v006-candidate-homer-preserving-clean-20260710-161150/source-balance-repair-preflight-audit-20260710-161621.md`, with `3` proof pairs, `6` snippet results, `0` errors, and `0` warnings.
- Latest source-balance proof comparison playlist: `source-balance-repair-preflight-v006-candidate-homer-preserving-clean-20260710-161150/source-balance-proof-comparison-20260710-161621.m3u`.
- Latest human listen control room: `audio-human-listen-control-room-v006-candidate-homer-preserving-clean-20260710-173541.md` / `audio-human-listen-control-room-v006-candidate-homer-preserving-clean-20260710-173541/human-listen-control-room.html`, with `40` review-reel chapters, `3` source-balance A/B proof pairs, and `0` missing files. It exports local notes only and now points reviewers to `PROCESS_EPISODE_4_AUDIO_REVIEW_NOTES.command` for post-listen routing; it does not approve, render, or mutate source media.
- Latest human listen decision brief: `audio-human-listen-decision-brief-v006-candidate-homer-preserving-clean-20260710-164632.md`. This is the plain-English pass/fail/needs-proof reviewer clipboard for the review reel and source-balance A/B snippets; it does not change approval or branch state.
- Latest listen-priority/control-room notes inbox smoke: `audio-listen-priority-notes-inbox-smoke-v006-candidate-homer-preserving-clean-20260710-170506.md`, with `8` scenarios passed across listen-priority notes, human-listen control-room notes, and wrong-baseline routing.
- Latest listen-priority/control-room notes inbox: `audio-listen-priority-notes-inbox-v006-candidate-homer-preserving-clean-20260710-170512.md`, with `0` matching exported human candidates and no approval/branch/render/source mutation.
- Latest listen-notes repair planner smoke: `audio-listen-notes-repair-planner-smoke-v006-candidate-homer-preserving-clean-20260710-171603.md`, with `7` scenarios passed across listen-priority, marker, control-room, and wrong-baseline routing.
- Latest listen-notes repair planner: `audio-listen-notes-repair-planner-v006-candidate-homer-preserving-clean-20260710-171604.md`, with `0` valid notes packets and no approval/branch/render/source mutation.
- Latest post-human-listen notes roundtrip: `audio-post-human-listen-notes-roundtrip-v006-candidate-homer-preserving-clean-20260710-174340.md` and stable command `PROCESS_EPISODE_4_AUDIO_REVIEW_NOTES.command`, with all steps OK and no approval/branch/render/source mutation.
- Latest post-human-listen notes roundtrip smoke: `audio-post-human-listen-notes-roundtrip-smoke-v006-candidate-homer-preserving-clean-20260710-174910.md`, with `passed=true`, artifact table complete `true`, post-listen router registered `true`, approval/branch truth preserved, and no render/source mutation.
- Latest goal completion audit: `audio-goal-completion-audit-v006-candidate-homer-preserving-clean-20260710-195700.md`.
- Latest handoff index: `audio-review-handoff-index-v006-candidate-homer-preserving-clean-20260710-195700.md`, with `105` linked artifacts and `0` missing artifacts.
- Machine warning context: `346` windows where the master is loud with aligned source but no contribution-gated source above threshold, and `725` windows where the master is loud without aligned/contribution source above the current threshold. These are listen-priority/threshold-modeling warnings, not automatic approval or failure.
- Focus-row coverage: the current source-balance companion reports representative focus rows across all full-audit warning families: `charlie_homer_overlap_present=1`, `master_loud_with_aligned_source_but_no_contribution=1`, and `master_loud_without_registered_source=38`. Full-audit counts remain `185`, `346`, and `725` respectively.
- Listen-priority integration: the current queue shows `40` review moments from `96` pre-dedupe candidates and `79` clustered moments. `17` shown queue items come directly from the master/source balance audit. Source-balance queue coverage includes `master-source-unexplained-energy=16`, `master-source-threshold-mismatch=1`, and `master-source-balance-context=1`, so human review samples every source-balance warning family instead of only the highest-severity class.
- Review media regenerated: the current review reel includes `40` snippets, `0` missing snippets, and duration `1472.032s`; review-reel notes smoke passed all-pass, needs-proof, needs-repair, and wrong-baseline routing without changing real approval or branch truth.
- Completion ledger: the refreshed goal completion audit reports `5` proved, `4` partial, `2` locked, and `0` missing requirements. Source-balance flag coverage is `true`, source-balance queue item count is `17`, speaker activity review board is present, speaker cleanup proof pack rendered `90` / `90` snippets, audio spine listen sanity passed `true`, reusable audio production profile and reusable profile smoke are present, reusable profile smoke passed `true`, dxRevive manual bounce packet and validator are present, dxRevive validator smoke passed `true`, dxRevive proof candidate planner status is `waiting-for-validated-dxrevive-bounces`, dxRevive proof candidate planner smoke passed `true`, human listen control room is present, review reel completeness is `true`, review-reel notes smoke passed `true`, listen-priority/control-room notes inbox smoke passed `true`, and post-human-listen notes roundtrip smoke passed `true`.
- Guardrails held: approval state changed `false`; branch state changed `false`; original media mutated `false`. Derived review snippets/reel, conditional repair workorders, preflight commands, and proof-only comparison snippets are review/control artifacts only and do not approve the spine.
- Current truth remains: `approvalStatus=machine-candidate-needs-human-listen-proof`, `packageReadyForHumanListen=true`, `branchInheritanceReady=false`, `branchRenderReady=false`.

This checkpoint closes the earlier Homer-disappeared failure mode at the machine-evidence level and makes the review path less biased: active Homer contribution windows survive into the master, every source-balance warning family now has a representative path into the human listen materials, every warning family has a scoped conditional v007 repair path, and each path now has exact proof-window snippets ready for A/B listening. Branch inheritance remains locked until real human listen proof.
<!-- human-listen-decision-rehearsal-checkpoint:start -->
## Latest v006 human-listen decision rehearsal checkpoint

Generated on 2026-07-10 for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`.

- Human-listen decision rehearsal: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/human-listen-decision-rehearsal-v006-candidate-homer-preserving-clean-20260710-211228/human-listen-decision-rehearsal.md`.
- Human-listen decision rehearsal open command: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/human-listen-decision-rehearsal-v006-candidate-homer-preserving-clean-20260710-211228/open-human-listen-decision-rehearsal.command`.
- Rehearsal status: `passed=true`; approval dry-run OK `true`; failure dry-run OK `true`; needs-focused-proof dry-run OK `true`; dry-run manifest unchanged `true`.
- Post-human-listen roundtrip smoke: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-post-human-listen-notes-roundtrip-smoke-v006-candidate-homer-preserving-clean-20260710-211227.md` with `passed=true`, artifact table complete `true`, rehearsal registered `true`, rehearsal step OK `true`, rehearsal passed `true`, rehearsal manifest unchanged `true`, approval/branch truth preserved `true`, render attempted `false`, and original media mutated `false`.
- Latest post-human-listen notes roundtrip: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-post-human-listen-notes-roundtrip-v006-candidate-homer-preserving-clean-20260710-211228.md`, with `allStepsOk=true`, approval state changed `false`, branch state changed `false`, render attempted `false`, and original media mutated `false`.
- Stable START_HERE: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/START_HERE_EPISODE_4_AUDIO_REVIEW.md` exposes the rehearsal alongside the listen-priority console, human-listen control room, decision brief, proof pack, and notes inboxes.
- Latest goal completion audit: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-goal-completion-audit-v006-candidate-homer-preserving-clean-20260710-211229.md` with status counts `5 proved`, `4 partial`, `2 locked`, `0 missing`.
- Latest handoff index: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-review-handoff-index-v006-candidate-homer-preserving-clean-20260710-211229.md` with `0` missing linked artifacts.
- Current truth remains: `approvalStatus=machine-candidate-needs-human-listen-proof`, `packageReadyForHumanListen=true`, `branchInheritanceReady=false`, `branchRenderReady=false`.
- Meaning: the final human decision path is rehearsed, smoke-covered, goal-audited, and visible, but v006 is still not approved until a real human listen records a non-dry-run decision.
<!-- human-listen-decision-rehearsal-checkpoint:end -->
<!-- audio-master-source-balance-checkpoint:end -->

## Current Episode 4 candidate

The current machine-rendered candidate is:

- baseline id: `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`
- parent baseline: `episode-4-conformed-production-baseline-v005`
- folder: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310`
- handoff WAV: `episode4-mastered-audio-spine-v006.wav`
- listening M4A: `episode4-mastered-audio-spine-v006.m4a`
- editor handoff packet: `audio-editor-handoff-packet-v006-candidate-homer-preserving-clean-20260710-092634.md`
- editor handoff packet status: WAV/M4A duration `6799.886` seconds, WAV codec `pcm_s16le`, M4A codec `aac`, SHA-256 recorded for both, human listen still required `true`, approval state changed `false`, huge media copied `false`
- editor marker packet: `audio-editor-marker-packet-v006-candidate-homer-preserving-clean-20260710-094057.md`
- editor marker CSV: `audio-editor-marker-packet-v006-candidate-homer-preserving-clean-20260710-094057.csv`
- editor marker playlist: `audio-editor-marker-packet-v006-candidate-homer-preserving-clean-20260710-094057.m3u`
- editor marker packet status: `8` markers total; `1` approval-gate, `1` edit-advisory, `5` critical-listen, `1` bleed-check; includes the long silence marker at `00:29:20.001`, proof-window listen markers at `00:34:22`, `01:09:40`, and `01:35:10`, and keeps human listen still required `true` with approval/branch state unchanged
- marker review console: `audio-marker-review-console-v006-candidate-homer-preserving-clean-20260710-095010/marker-review-console.html`
- marker review console notes template: `audio-marker-review-console-v006-candidate-homer-preserving-clean-20260710-095010/marker-review-notes-template.json`
- marker review console open command: `audio-marker-review-console-v006-candidate-homer-preserving-clean-20260710-095010/open-marker-review-console.command`
- marker review console status: `8` marker jump targets, local M4A player, per-marker pass/needs-repair notes UI, notes JSON export, human listen still required `true`, approval state changed `false`, branch state changed `false`, huge media copied `false`
- marker review command packet: `audio-marker-review-command-packet-v006-candidate-homer-preserving-clean-20260710-101317.md`
- marker review command packet status: generated from the registered marker-review notes template; suggested decision remains `pending-human-listen`; 8 marker command paths documented; approval state changed `false`; branch state changed `false`; render attempted `false`; original media mutated `false`
- marker review notes inbox: `audio-marker-review-notes-inbox-v006-candidate-homer-preserving-clean-20260710-103157.md`
- marker review notes inbox status: scanned common export locations for marker-review notes; matching exported candidates `0`; selected candidate `null`; approval state changed `false`; branch state changed `false`; render attempted `false`; original media mutated `false`
- marker review notes inbox smoke: `audio-marker-review-notes-inbox-smoke-v006-candidate-homer-preserving-clean-20260710-104010.md`
- marker review notes inbox smoke status: passed `true`; real approval state preserved `true`; no-notes state OK `true`; all-pass notes dry-routed OK `true`; needs-repair notes dry-routed OK `true`; wrong-baseline notes ignored OK `true`; approval state changed `false`; branch state changed `false`; render attempted `false`; original media mutated `false`
- stable review start-here: `START_HERE_EPISODE_4_AUDIO_REVIEW.md`
- stable review open command: `OPEN_EPISODE_4_AUDIO_REVIEW.command`
- stable review start-here status: regenerated after the `20260710-142624` audio listen-priority review reel notes smoke in the v006 baseline folder as the non-timestamped reviewer front door; it now opens the listen-priority console first, then the listen-priority snippet pack, then the listen-priority review reel, then the audio master visual overview, then the marker review console, lists the review reel, review-reel notes template, review-reel notes smoke, snippet-pack audit, and speaker bleed/gap proof audit, documents both listen-priority and marker-review inbox return paths, and exposes the repair planner for notes that need v007/focused-proof routing; approval state changed `false`; branch state changed `false`; render attempted `false`; original media mutated `false`
- audio review status board: `audio-review-status-board-v006-candidate-homer-preserving-clean-20260710-110335.md`
- stable audio review status board: `EPISODE_4_AUDIO_REVIEW_STATUS.md`
- audio review status check command: `CHECK_EPISODE_4_AUDIO_REVIEW_STATUS.command`
- audio review status board status: review state `waiting-for-human-notes`; matching exported notes `0`; selected candidate `null`; approval state changed `false`; branch state changed `false`; render attempted `false`; original media mutated `false`
- audio review status board smoke: `audio-review-status-board-smoke-v006-candidate-homer-preserving-clean-20260710-111247.md`
- audio review status board smoke status: passed `true`; scenarios `5`; real approval state preserved `true`; tested no-notes, all-pass notes, needs-repair notes, needs-proof notes, and wrong-baseline notes without approval, branch, render, or source-media mutation
- audio review gate audit: `audio-review-gate-audit-v006-candidate-homer-preserving-clean-20260710-112430.md`
- audio review gate audit status: passed `true`; errors `0`; warnings `0`; package ready for human listen `true`; branch inheritance/render remain locked; approval state changed `false`; branch state changed `false`; render attempted `false`; original media mutated `false`
- audio review gate audit smoke: `audio-review-gate-audit-smoke-v006-candidate-homer-preserving-clean-20260710-113655.md`
- audio review gate audit smoke status: passed `true`; scenarios `5`; real approval/branch/render state preserved `true`; tested happy pending locked, missing master WAV, unsafe branch inheritance, unsafe branch render, and missing status-board-smoke evidence without approval, branch, render, or source-media mutation
- audio master visual overview: `audio-master-visual-overview-v006-candidate-homer-preserving-clean-20260710-114726/audio-master-visual-overview-v006-candidate-homer-preserving-clean-20260710-114726.md`
- audio master visual overview HTML: `audio-master-visual-overview-v006-candidate-homer-preserving-clean-20260710-114726/audio-master-visual-overview.html`
- audio master visual overview status: passed `true`; full waveform rendered `true`; proof-window waveforms `4`; silence scan found `111` silence spans at `-45dB` for at least `2s`; longest detected silence is `00:29:20` to `00:29:43` (`23.577s`); approval state changed `false`; branch state changed `false`; render attempted `false`; original media mutated `false`
- audio master smoothness audit: `audio-master-smoothness-audit-v006-candidate-homer-preserving-clean-20260710-120521.md`
- audio master smoothness audit status: passed `true`; scanned `27200` 250ms windows and `27199` transitions; hard-silence-edge listen checks `1622`; large-level-jump listen checks `1483`; moderate level jumps `1146`; longest low-level span is the known `00:29:20` to `00:29:43` review point; approval state changed `false`; branch state changed `false`; render attempted `false`; original media mutated `false`
- audio listen-priority queue: `audio-listen-priority-queue-v006-candidate-homer-preserving-clean-20260710-122355.md`
- audio listen-priority queue status: generated `2` queue artifacts total, with the first ranking draft superseded by the current queue; current queue consolidates `56` machine/reviewer signals into `48` clustered listen moments and `40` shown queue items; first four review targets are `00:29:20`, `00:34:22`, `01:09:40`, and `01:35:10`; approval state changed `false`; branch state changed `false`; render attempted `false`; original media mutated `false`
- audio listen-priority console: `audio-listen-priority-console-v006-candidate-homer-preserving-clean-20260710-124003/listen-priority-console.html`
- audio listen-priority console status: generated `1` console artifact set from the current queue; it provides a local M4A player, jump buttons for all `40` queue items, pass/needs-repair/needs-proof local decisions, and notes JSON export; approval state changed `false`; branch state changed `false`; render attempted `false`; original media mutated `false`
- audio listen-priority snippet pack: `audio-listen-priority-snippet-pack-v006-candidate-homer-preserving-clean-20260710-132706.md`
- audio listen-priority snippet pack status: rendered `40` short M4A review clips from the mastered listening copy around the current listen-priority queue, with `0` render failures; generated HTML, playlist, JSON, Markdown, and open-command review surfaces; approval state changed `false`; branch state changed `false`; render attempted `true` for derived review snippets only; original media mutated `false`
- audio listen-priority snippet-pack audit: `audio-listen-priority-snippet-pack-audit-v006-candidate-homer-preserving-clean-20260710-133704.md`
- audio listen-priority snippet-pack audit status: passed `true`; audited `40` queue-window snippets; errors `0`; warnings `0`; approval state changed `false`; branch state changed `false`; render attempted `false`; original media mutated `false`
- audio listen-priority review reel: `audio-listen-priority-review-reel-v006-candidate-homer-preserving-clean-20260710-142116.md`
- audio listen-priority review reel status: rendered a one-play 24.5-minute review reel from all `40` listen-priority snippets with `0` missing snippets; generated M4A, HTML jump console, local pass/needs-proof/needs-repair notes export UI, notes template, chapter CSV, FFmetadata, Markdown, JSON, and open-command surfaces; approval state changed `false`; branch state changed `false`; render attempted `true` for derived review media only; original media mutated `false`.
- audio listen-priority review reel notes smoke: `audio-listen-priority-review-reel-notes-smoke-v006-candidate-homer-preserving-clean-20260710-142624.md`
- audio listen-priority review reel notes smoke status: passed `true`; synthetic all-pass, needs-proof, needs-repair, and wrong-baseline review-reel notes route through the shared listen-priority inbox contract; approval state changed `false`; branch state changed `false`; render attempted `false`; original media mutated `false`.
- audio listen-priority/control-room notes inbox: `audio-listen-priority-notes-inbox-v006-candidate-homer-preserving-clean-20260710-170512.md`
- audio listen-priority/control-room notes inbox status: scanned common export locations for listen-priority notes and human-listen control-room notes; matching exported human candidates `0`; selected candidate `null`; ignored files `30`; approval state changed `false`; branch state changed `false`; render attempted `false`; original media mutated `false`
- speaker bleed/gap proof audit: `audio-speaker-bleed-gap-proof-audit-v006-candidate-homer-preserving-clean-20260710-134808.md`
- speaker bleed/gap proof audit status: scanned `1550` source-activity rows and selected `15` focused proof windows for the cleanup promise; flag counts include `183` Charlie echo-under-Homer checks, `131` Homer noise-under-Charlie checks, `24` Charlie over-gate checks, `412` Homer over-gate checks, `185` preserved-overlap checks, and `895` dead-air/between-source windows; approval state changed `false`; branch state changed `false`; render attempted `false`; original media mutated `false`
- audio goal completion audit: `audio-goal-completion-audit-v006-candidate-homer-preserving-clean-20260710-171604.md`
- audio goal completion audit status: proved `5`, partial `3`, locked `2`, missing `0`; source-balance flag coverage `true`; source-balance queue item count `17`; source-balance repair action count `3`; source-balance repair preflight plan count `3`; source-balance proof pair count `3`; source-balance proof audit errors `0`; source-balance proof audit warnings `0`; human listen control room present `true`; human listen decision brief present `true`; review reel complete `true`; review-reel notes smoke passed `true`; approval state changed `false`; branch state changed `false`; render attempted `false`; original media mutated `false`; it confirms v006 is package/review ready, while human listen proof still locks branch inheritance and real branch renders.
- audio listen-priority/control-room notes inbox smoke: `audio-listen-priority-notes-inbox-smoke-v006-candidate-homer-preserving-clean-20260710-170506.md`
- audio listen-priority/control-room notes inbox smoke status: passed `true`; scenarios `8`; real approval state preserved `true`; real branch state preserved `true`; tested no-notes, listen-priority all-pass, listen-priority needs-repair, listen-priority needs-proof, control-room all-pass, control-room needs-repair, control-room needs-proof, and wrong-baseline routing without approval, branch, render, or source-media mutation
- audio listen-notes repair planner: `audio-listen-notes-repair-planner-v006-candidate-homer-preserving-clean-20260710-171604.md`
- audio listen-notes repair planner status: valid notes packets `0`; repair actions `0`; focused proof actions `0`; pass/context items `0`; approval state changed `false`; branch state changed `false`; render attempted `false`; original media mutated `false`
- audio listen-notes repair planner smoke: `audio-listen-notes-repair-planner-smoke-v006-candidate-homer-preserving-clean-20260710-171603.md`
- audio listen-notes repair planner smoke status: passed `true`; scenarios `7`; real approval state preserved `true`; real branch state preserved `true`; tested no-notes, listen-priority needs-repair, listen-priority needs-proof, marker needs-repair, control-room needs-repair, control-room needs-proof, and wrong-baseline routing without approval, branch, render, or source-media mutation
- review packet: `audio-listen-review-packet-v006-candidate-homer-preserving-clean.md`
- QC packet: `audio-workbench-qc-v006-candidate-homer-preserving-clean.md`
- source activity: `audio-workbench-source-activity-v006-candidate-homer-preserving-clean.md`
- listen-proof bundle: `listen-proof-bundle-v006-candidate-homer-preserving-clean-20260710-034749`
- listen-proof page: `listen-proof.html`
- listen-proof playlist: `listen-proof.m3u`
- listen-review packet now links the listen-proof bundle, source activity report, quality report, source contribution report, stage board, and reviewer checklist from one place
- proof-window comparison: `audio-proof-window-comparison-v006-candidate-homer-preserving-clean.md`
- proof-window listen workorder: `audio-proof-window-listen-workorder-v006-candidate-homer-preserving-clean.md`
- audio review cockpit: `audio-review-cockpit-v006-candidate-homer-preserving-clean.html`
- visual proof-window QC: `audio-proof-window-visual-qc-v006-candidate-homer-preserving-clean-20260710-055226.md`
- visual proof-window QC HTML: `visual-proof-windows-v006-candidate-homer-preserving-clean-20260710-055226/audio-proof-window-visual-qc-v006-candidate-homer-preserving-clean.html`
- human review bundle: `human-review-bundle-v006-candidate-homer-preserving-clean-20260710-064849`
- human review bundle README: `human-review-bundle-v006-candidate-homer-preserving-clean-20260710-064849/README.md`
- human review bundle status: ready, `34` symlinked review/control artifacts, `0` missing links
- bleed management audit: `audio-bleed-management-audit-v006-candidate-homer-preserving-clean-20260710-071205.md`
- bleed management audit status: `3` proof windows audited, `1` listen-priority warning, original media mutated `false`, timeline preserved `true`; warning is `charlie-overgate-listen-check` in the camera-assistant overlap proof window, which is a human-listen focus point rather than an automatic failure
- bleed repair workorder: `audio-bleed-repair-workorder-v006-candidate-homer-preserving-clean-20260710-071837.md`
- bleed repair workorder status: `1` scoped repair action for `charlie-overgate-listen-check` in the camera-assistant overlap proof window; conditional only, for v007/timestamped proof-window repair if human listening confirms the warning
- bleed repair preflight: `bleed-repair-preflight-v006-candidate-homer-preserving-clean-20260710-072509/bleed-repair-preflight.md`
- bleed repair preflight status: locked; safeToRender `false`; renderAttempted `false`; prepares the `v007-charlie-natural-overlap-proof` command path for the camera-assistant overlap warning without rendering until human listen failure or an explicit proof-only override
- bleed repair executor: `audio-bleed-repair-executor-v006-candidate-homer-preserving-clean-20260710-090327.md`
- bleed repair executor status: `blocked-waiting-for-human-listen-failure`; render attempted `false`; render succeeded `false`; original media mutated `false`; timeline preserved `true`; real repair allowed `false`
- bleed repair executor smoke: `audio-bleed-repair-executor-smoke-v006-candidate-homer-preserving-clean-20260710-090844.md`
- bleed repair executor smoke status: passed `true`; real approval state preserved `true`; tested pending refusal, failed-listen readiness, and unapproved proof-only override readiness without rendering media
- listen decision matrix: `audio-listen-decision-matrix-v006-candidate-homer-preserving-clean-20260710-073915.md`
- listen decision matrix status: ready; `3` proof windows, `3` critical-listen windows, approval state unchanged; converts proof-window warnings, bleed-audit warnings, and conditional repair actions into explicit pass/fail criteria and guarded command paths
- proof-window audio lab: `audio-proof-window-audio-lab-v006-candidate-homer-preserving-clean-20260710-074943.md`
- proof-window audio lab status: ready; `3` windows, `12` proof audio file slots, `0` missing files, `0` duration mismatches, `0` near-digital-peak warnings, `0` machine warnings; this is objective proof-snippet evidence only, not human approval
- reviewer notes template: `audio-reviewer-notes-template-v006-candidate-homer-preserving-clean-20260710-083535.md`
- reviewer notes template status: ready; `3` proof windows, `3` undecided, suggested decision `pending-human-listen`; gives exported browser notes a durable manifest-backed import path and includes guarded dry-run/confirmed decision commands for imported notes packets, without changing approval truth
- audio reviewer console: `audio-reviewer-console-v006-candidate-homer-preserving-clean-20260710-083536/audio-reviewer-console.html`
- audio reviewer console status: ready; local static HTML control room with full M4A/WAV players, per-window proof players, machine lab stats, warning context, local reviewer notes, reviewer notes template link, guarded command paths, a round-trip import command for downloaded notes JSON, and explicit handoff to the notes-to-decision bridge; it does not approve, fail, render, upload, or mutate media
- human listen session: `human-listen-session-v006-candidate-homer-preserving-clean-20260710-083536`
- human listen session README: `human-listen-session-v006-candidate-homer-preserving-clean-20260710-083536/README.md`
- human listen session HTML: `human-listen-session-v006-candidate-homer-preserving-clean-20260710-083536/listen-session.html`
- human listen session status: ready, `33` linked review/control/proof-window/audit/workorder/preflight/matrix/audio-lab/reviewer-console/notes-template artifacts, `0` missing links, with a guided local HTML reviewer page, audio reviewer console with notes round-trip import command, durable reviewer notes template with notes-to-decision bridge commands, listen decision matrix, proof-window audio lab, bleed management audit, conditional repair workorder, locked repair preflight, and guarded approve/fail command files that require typed `I LISTENED` confirmation before changing manifest state
- reviewer notes decision bridge smoke: `audio-reviewer-notes-decision-bridge-smoke-v006-candidate-homer-preserving-clean-20260710-100039.md`
- reviewer notes decision bridge smoke status: passed; `8` dry-run bridge scenarios passed. Synthetic reviewer-window needs-proof and all-pass packets dry-run through the notes-to-decision bridge; all-pass without `--confirm-human-listened` is blocked; wrong-baseline packet is blocked. Synthetic marker-console notes also dry-run through the same bridge: marker needs-repair succeeds as guarded failure evidence, marker approval without `--confirm-human-listened` is blocked, marker approval with confirmation dry-runs successfully, marker wrong-baseline packet is blocked, and the real manifest approval/branch state remains preserved
- post-listen outcome router: `audio-post-listen-outcome-router-v006-candidate-homer-preserving-clean-20260710-090328.md`
- post-listen outcome router status: `waiting-for-human-listen`; approval state preserved `true`, render attempted `false`, original media mutated `false`, real branch render commands exposed `false`
- post-listen outcome router smoke: `audio-post-listen-outcome-router-smoke-v006-candidate-homer-preserving-clean-20260710-091710.md`
- post-listen outcome router smoke status: passed `true`; real approval state preserved `true`; tested pending, failed, approved-needs-preflight, and approved-ready routes in temporary manifests
- latest review handoff index: `audio-review-handoff-index-v006-candidate-homer-preserving-clean-20260710-171604.md`
- latest review handoff index status: current index lists `90` artifacts with `0` missing; approval remains `machine-candidate-needs-human-listen-proof`; branch inheritance/render remain locked
- review readiness verification: `audio-review-readiness-verification-v006-candidate-homer-preserving-clean-20260710-102139.md`
- post-listen next-actions plan: `audio-post-listen-next-actions-v006-candidate-homer-preserving-clean-20260710-061223.md`
- listen-decision command verification: `audio-listen-decision-command-verification-v006-candidate-homer-preserving-clean-20260710-062106.md`
- approved branch-render executor: `audio-approved-branch-render-executor-v006-candidate-homer-preserving-clean-20260710-063224.md`
- approval-path sandbox smoke: `audio-approval-path-smoke-v006-candidate-homer-preserving-clean-20260710-064013.md`
- branch-render preflight: `audio-branch-render-preflight-v006-candidate-homer-preserving-clean.md`
- branch-render proof evidence: `audio-workbench-branch-render-evidence-main-45-60-20260710-053048.md`
- latest listen-decision template: `audio-listen-decision-v006-candidate-homer-preserving-clean-20260710-050143.md`
- latest branch-inheritance gate: `audio-branch-inheritance-gate-v006-candidate-homer-preserving-clean-20260710-050143.md`
- listen decision recorder: `apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py`

Machine QC result:

- ready for human listen proof: `true`

## 2026-07-11 checkpoint: audio transformation lineage ledger

The Episode 4 v006 audio workbench now has a stable transformation lineage ledger. It answers the practical production question: what changed the sound, what evidence proves it, what knobs own future repairs, and what gates are still locked.

Stable artifacts:

- `AUDIO_TRANSFORMATION_LINEAGE_LEDGER.json`
- `AUDIO_TRANSFORMATION_LINEAGE_LEDGER.md`
- `AUDIO_TRANSFORMATION_LINEAGE_LEDGER.html`
- `OPEN_AUDIO_TRANSFORMATION_LINEAGE_LEDGER.command`

Latest generated ledger:

- `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/AUDIO_TRANSFORMATION_LINEAGE_LEDGER.html`

Validation:

- Python compile passed for `audio_workbench_transformation_lineage_ledger.py`.
- The ledger generated against `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`.
- Lineage status: `ready-for-review-locked-before-branch-render`.
- Stage count: `8`.
- Missing evidence links: `0`.

The ledger does not approve v006, render branches, upload files, publish, or mutate source media. It exists to make future v007 repair work deliberate: raw source, sync/conform, speaker activity, source-aware cleanup, optional restoration, mix/master, review routing, and branch inheritance now each have explicit evidence, controls, repair knobs, risks, and gates.

The stable Producer Command Center now includes this ledger as a primary artifact and review card. Latest validation after wiring:

- Producer Command Center status: `ready-for-human-listen`.
- Primary artifacts: `17`.
- Review cards: `16`.
- Missing primary artifacts: `0`.
- Human-listen session links: `72`.
- Human-listen session missing links: `0`.
- Review gate audit: `passed=true`, errors `0`, warnings `0`.
- Goal audit: `11` proved, `4` partial, `2` locked, `0` missing.
- Handoff index missing artifacts: `0`.
- Approval, branch, render, upload, publication, and original-media safety truth stayed unchanged.
- warnings: none
- advisory: the full synchronized spine contains a long silence around `1760.0s`; final edit branches should review or skip that gap
- loudness: about `-16.0 LUFS`
- WAV true peak: about `-1.8 dBFS`
- M4A true peak: about `-1.1 dBFS`
- listen-proof bundle validation: `14` symlinked review items, `0` broken links
- proof-window comparison warning count: `5`; these are listen-priority warnings, not automatic failures
- proof-window listen workorder item count: `5`; each item includes what to listen for, pass/fail criteria, and the safest repair action if it fails
- audio review cockpit: generated and linked from the review packet and listen-decision template
- visual proof-window QC: generated for `3` proof windows, with failed waveform count: `0`
- human review bundle count: `1`; ready `true`; missing linked artifacts `0`
- bleed management audit count: `1`; warning count `1`; timeline preserved `true`; original media mutated `false`
- bleed repair workorder count: `1`; action count `1`
- bleed repair preflight count: `1`; safeToRender `false`; renderAttempted `false`
- bleed repair executor count: `1`; status `blocked-waiting-for-human-listen-failure`; render attempted `false`; render succeeded `false`; original media mutated `false`; timeline preserved `true`; real repair allowed `false`
- bleed repair executor smoke count: `1`; passed `true`; real approval state preserved `true`
- listen decision matrix count: `1`; critical-listen windows `3`
- proof-window audio lab count: `1`; warnings `0`; missing files `0`
- reviewer notes template count: `2`
- audio reviewer console count: `4`
- human listen session count: `11`; ready `true`; missing linked artifacts `0`
- reviewer notes decision bridge smoke count: `2`; passed `true`; real approval state preserved `true`
- post-listen outcome router count: `2`; status `waiting-for-human-listen`; approval state preserved `true`; render attempted `false`; original media mutated `false`; real branch render commands exposed `false`
- post-listen outcome router smoke count: `1`; passed `true`; real approval state preserved `true`
- editor handoff packet count: `1`; human listen still required `true`; approval state changed `false`; huge media copied `false`
- editor marker packet count: `1`; marker count `8`; human listen still required `true`; approval state changed `false`; branch state changed `false`; huge media copied `false`
- marker review console count: `1`; marker count `8`; human listen still required `true`; approval state changed `false`; branch state changed `false`; huge media copied `false`
- marker review command packet count: `2`; latest packet is `20260710-101317`, generated from the registered marker-review notes template and intentionally leaves the decision at `pending-human-listen`
- marker review notes inbox count: `1`; latest inbox is `20260710-103157`, with `0` matching exported notes candidates found and no approval/branch/render/source mutation side effects
- marker review notes inbox smoke count: `1`; latest smoke is `20260710-104010`, passed all synthetic routing cases and preserved real approval state
- stable review start-here count: `1`; latest stable entry point is the non-timestamped `START_HERE_EPISODE_4_AUDIO_REVIEW.md` and `OPEN_EPISODE_4_AUDIO_REVIEW.command` in the v006 baseline folder, refreshed after the `20260710-135927` audio goal completion audit so the command opens the console first, then the snippet pack, then the audio master visual overview, then the marker review console, and lists the snippet-pack and speaker bleed/gap audits in important artifacts
- audio review status board count: `1`; latest status board is `20260710-110335`, stable status board is `EPISODE_4_AUDIO_REVIEW_STATUS.md`, and stable status refresh command is `CHECK_EPISODE_4_AUDIO_REVIEW_STATUS.command`
- audio review status board smoke count: `1`; latest smoke is `20260710-111247`, passed `5` routing scenarios, and preserved real approval/branch/render/source-media truth
- audio review gate audit count: `1`; latest audit is `20260710-112430`, passed with `0` errors and `0` warnings, and confirms the review package control plane agrees while branch rendering remains locked pending human listen proof
- audio review gate audit smoke count: `1`; latest smoke is `20260710-113655`, passed `5` gate-audit scenarios, and proves the auditor accepts the current locked package while rejecting missing master WAV, unsafe branch inheritance, unsafe branch render, and missing status-board-smoke evidence
- audio master visual overview count: `1`; latest overview is `20260710-114726`, passed, rendered a full-spine waveform and `4` proof-window waveforms, and confirms the known long silence at about `00:29:20` is visible in the mastered spine
- audio master smoothness audit count: `2`; latest audit is `20260710-120521`, passed, scanned `27200` 250ms RMS windows, ranked the largest envelope changes for listen-priority review, and preserved approval/branch/render/source-media truth
- audio listen-priority queue count: `2`; use the latest `20260710-122355` queue, which supersedes the first ranking draft and starts with the four human-critical targets `00:29:20`, `00:34:22`, `01:09:40`, and `01:35:10`
- audio listen-priority console count: `1`; use the latest `20260710-124003` console as the first human-review surface because it can jump the mastered M4A to queue items, collect local pass/needs-repair/needs-proof decisions, and export notes without changing manifest truth
- audio listen-priority snippet pack count: `1`; use the latest `20260710-132706` pack when reviewers need short clips instead of full-master scrubbing. It rendered `40` queue-window M4A snippets, `0` failures, and keeps approval/branch truth unchanged while giving HTML, playlist, Markdown, JSON, and open-command entry points.
- audio listen-priority snippet-pack audit count: `1`; use the latest `20260710-133704` audit as proof the snippet pack is mechanically reviewable: `40` clips audited, `0` errors, `0` warnings, and approval/branch truth unchanged.
- audio listen-priority review reel count: `2`; use the latest `20260710-142116` reel as the easiest first listen; it includes all `40` priority snippets, local notes export, and a notes template.
- audio listen-priority review reel notes smoke count: `1`; use the latest `20260710-142624` smoke as proof exported review-reel notes route correctly through all-pass, needs-proof, needs-repair, and wrong-baseline cases without changing approval or branch truth.
- audio listen-priority/control-room notes inbox count: `6`; use the latest `20260710-170512` inbox for real exported notes; it accepts both listen-priority console notes and human-listen control-room notes, currently finds `0` human notes candidates, ignores `30` non-note/generated files, and makes no approval, branch, render, or source-media changes.
- speaker bleed/gap proof audit count: `1`; use the latest `20260710-134808` audit as the compact map of source-aware cleanup risk. It scanned `1550` source-activity rows, selected `15` first-pass focus windows, and keeps v006 locked pending actual human listening.
- audio listen-priority/control-room notes inbox smoke count: `2`; use the latest `20260710-170506` smoke, which passed no-notes, listen-priority all-pass, listen-priority needs-repair, listen-priority needs-proof, control-room all-pass, control-room needs-repair, control-room needs-proof, and wrong-baseline notes routing while preserving real approval and branch state
- audio listen-notes repair planner count: `3`; use the latest `20260710-171604` planner, which found `0` valid exported notes packets on the real baseline, made no repair/proof actions, and made no approval, branch, render, or source-media changes
- audio listen-notes repair planner smoke count: `2`; use the latest `20260710-171603` smoke, which passed no-notes, listen-priority needs-repair, listen-priority needs-proof, marker needs-repair, control-room needs-repair, control-room needs-proof, and wrong-baseline routing while preserving real approval and branch state
- review handoff index count: `71`; use the latest `20260710-171604` index. It has `90` linked artifact entries, `0` missing linked artifacts, and includes listen-priority/control-room notes routing, repair planning, branch gates, and approval-path smoke evidence while keeping branch inheritance locked until actual human listen proof.
- review readiness verification count: `2`
- package ready for human listen: `true`; review readiness verification has `0` errors and `0` warnings
- human listen still required: `true`
- branch inheritance safely locked: `true`
- post-listen next-actions count: `1`
- post-listen next-actions status: `waiting-for-human-listen`
- post-listen next-actions approved render commands exposed: `false`
- post-listen outcome router count: `2`
- post-listen outcome router status: `waiting-for-human-listen`
- post-listen outcome router approval state preserved: `true`
- post-listen outcome router render attempted: `false`
- post-listen outcome router original media mutated: `false`
- post-listen outcome router real branch render commands exposed: `false`
- listen-decision command verification count: `1`
- listen-decision commands valid: `true`
- listen-decision dry-runs left manifest unchanged: `true`
- listen-decision approval dry-run OK: `true`
- listen-decision failure dry-run OK: `true`
- approved branch-render executor count: `2`
- approved branch-render executor status: `blocked-waiting-for-human-listen`
- approved branch-render executor commands exposed: `false`
- approval-path sandbox smoke count: `1`
- approval-path sandbox smoke passed: `true`
- approval-path sandbox preserved real manifest approval state: `true`
- approval-path sandbox branch inheritance ready: `true`
- approval-path sandbox branch render ready: `true`
- approval-path sandbox executor commands exposed: `true`
- branch-render preflight: generated for `tight-30-45`, `main-45-60`, and `extended-60-80`; currently blocked before branch render because human listen proof is still pending
- branch-render proof count: `1`; a `60` second `main-45-60` proof render inherited v006 using the explicit proof-only unapproved override. Video/audio files exist and QC media validity passes, but the evidence status is `proof-render-media-valid-but-unapproved`
- latest listen-decision status: `pending-human-listen`, with `8` checklist items and `3` proof windows
- branch inheritance ready: `false`; blocker is `human listen proof pending: decisionStatus=pending-human-listen`
- approval recorder dry-run validated: approval plan can be generated without changing manifest truth

This candidate is not human-approved and not publication-approved. The next decision is human listen proof against the review packet or listen-proof bundle. If it passes, long-form and shorts branches may inherit this v006 candidate as their audio spine. If it fails, tune the failing stage and render a new v007 or timestamped candidate rather than overwriting this one.

To record a real branch-inheritance approval after a human listen pass:

```bash
OUT="/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310"
python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \
  --baseline-dir "$OUT" \
  --status human-approved-for-branch-inheritance \
  --reviewer "Charlie or Mako" \
  --notes "Human listened to v006 bundle and approved it for edit branch inheritance." \
  --confirm-human-listened
python3 apps/QuipslyStudio/script/audio_workbench_branch_gate.py --baseline-dir "$OUT"
```

To record a failed listen proof, use `--status failed-human-listen` with `--issue` or `--notes`. Do not overwrite v006; render v007 or a timestamped replacement candidate.

The proof-window comparison flags five critical-listen clues:

- `post-wall-e-missing-clip-echo-check`: master level changed sharply from source-aware mix
- `meetings-section-park-noise-check`: master level changed sharply from source-aware mix
- `meetings-section-park-noise-check`: speaker split diagnostic is heavily one-sided
- `camera-assistant-section-overlap-check`: master level changed sharply from source-aware mix
- `camera-assistant-section-overlap-check`: speaker split diagnostic is heavily one-sided

These do not automatically reject v006. They tell the reviewer where to listen carefully before branch inheritance.

The generated listen workorder converts these warnings into concrete review tasks. The audio review cockpit collects the full handoff players, evidence links, workorder players, and decision commands in one local HTML page. It should be opened before approval so the reviewer can decide whether each warning is harmless in context or whether a new v007/timestamped repair candidate is needed.

Branch renders must not silently fall back to older mixed audio once a conformed baseline exists. `episode4_full_sync_export.py` now accepts `--conformed-baseline-dir` and refuses to inherit that audio unless the branch-inheritance gate passes. A proof-only override exists for tiny internal renders, but it marks the baseline as unapproved and must not be used as publication truth.

One `60` second `main-45-60` proof render has been created with that proof-only override and registered back to the v006 baseline manifest as branch-render evidence. This proves the renderer can inherit the v006 conformed audio spine, but it does not clear human listen proof, branch inheritance, publication approval, or full branch render readiness.

## Layer model

### 1. Raw source layer

Purpose: immutable evidence.

Examples:

- camera audio
- computer recording
- DJI mic parts
- call recording
- reference clip audio

Rules:

- never overwrite
- never normalize in place
- never trim in place
- never use as publication output directly unless explicitly approved

### 2. Sync stem layer

Purpose: full-length aligned stems that preserve episode sequence time.

Examples:

- `charlie-aligned.wav`
- `homer-dji-aligned.wav`
- `reference-aligned.wav`

Rules:

- length and offset are part of the sync truth
- silence is acceptable where that source is absent
- stems can be regenerated from source plus manifest
- stems are branch-independent

### 3. Source-treatment layer

Purpose: repair each aligned source without changing sync.

Possible treatments:

- high-pass / rumble cleanup
- broadband denoise
- sidechain ducking for mic bleed
- gate/expander for room noise
- dxRevive or similar dialogue restoration on duplicated stems
- de-click, de-clip, de-reverb

Rules:

- treatments operate on duplicate derived stems, not originals
- treatment output must preserve duration and sample rate unless declared otherwise
- aggressive treatment should be A/B proofed before becoming the default
- restoration is a tool, not a moral victory: if it sounds fake, back it off
- speaker gaps are production decisions, not source edits: mute/duck only derived aligned stems and keep inspectable automation metadata

### 4. Dialogue bus layer

Purpose: combine treated speaker stems into a clean conversation bed.

Current Episode 4 approach:

- build full-length Charlie stem
- build full-length Homer DJI stem
- build full-length reference stem
- duplicate speaker stems into contribution-gated stems
- keep each person when they are speaking, laughing, reacting, or adding useful presence
- duck or mute non-contributing gaps to reduce phone-call echo, mic bleed, park noise, background voices, handling noise, and silence
- use Homer as the sidechain key to duck Charlie when Homer is carrying speech
- use Charlie as a gentler sidechain key to duck Homer when Charlie is carrying speech
- mix the cleaned stems into one source-aware episode bed

Why this belongs here:

- the echo problem exists before any story branch
- fixing it per edit would duplicate work and create inconsistent results
- every long cut, short, and alternate take should inherit the same clean sync bed

### 5. Conformed production baseline

Purpose: create the branch-independent audio truth every edit inherits.

Outputs:

- conformed dialogue bed
- mastered full-length WAV spine
- compressed delivery copy
- proof snippets
- quality report
- speaker-gap automation JSON

Rules:

- preserve episode timeline duration
- do not shorten, stretch, or shift the source timing unless a new sync/conform version is declared
- document included production sources and excluded evidence-only sources
- document speaker-gap automation so thresholds and release times can be adjusted later
- do not proceed to expensive branch renders until proof snippets and duration checks look sane

### 6. Edit branch layer

Purpose: story decisions.

Examples:

- main public cut
- teaching-forward cut
- warm extended cut
- individual shorts

Rules:

- branches choose sequence ranges, visual sources, pacing, inserts, and framing
- branches should not duplicate audio repair logic
- branches may request a different audio treatment profile, but the profile still lives under the source-treatment/sync-layer model

### 7. Mastering layer

Purpose: publication loudness and final polish.

Typical chain:

- final bus compression
- transparent limiter
- loudness target
- format-specific export

Targets to consider:

- podcast audio: around -16 LUFS integrated for stereo, true peak below about -1 dBTP
- YouTube/video: target intelligibility and avoid clipping; YouTube will normalize playback
- shorts/social: voice-forward, slightly denser loudness, avoid harshness on phones

## dxRevive policy

dxRevive is useful as a source-treatment tool, especially for damaged dialogue, reverb, codec artifacts, noisy calls, or thin recordings.

It should not be the first or only audio process.

Recommended order:

1. align raw source stems
2. remove obvious bleed/echo relationships with source-aware ducking or gating
3. run dxRevive on duplicated treated stems if the source still needs restoration
4. A/B proof conservative and aggressive settings
5. mix speaker stems
6. master the final bus

Why not put dxRevive after the final mix by default:

- it can blur speaker identity if both voices are already mixed together
- it may revive or emphasize bleed/reverb that should have been managed per source
- it makes it harder to inspect which source caused a problem

When post-mix dxRevive may be acceptable:

- emergency rescue when separated stems are unavailable
- one-off proof export
- old archival audio where no source separation exists

## dxRevive automation status

Local inspection on 2026-07-09 found dxRevive installed as AU/VST3/AAX plug-ins, not as a normal command-line executable.

Observed local paths include:

- `/Library/Audio/Plug-Ins/VST3/Accentize-dxRevive.vst3`
- `/Library/Audio/Plug-Ins/VST3/Accentize-dxRevivePro.vst3`
- `/Library/Audio/Plug-Ins/Components/Accentize-dxRevive.component`
- `/Library/Audio/Plug-Ins/Components/Accentize-dxRevivePro.component`

Near-term integration:

- treat dxRevive as a manual/offline bounce stage if needed
- export aligned/treated duplicate stems for opening in Logic or another plug-in host
- re-import bounced stems with exact duration checks
- reject the bounce if duration/sample rate changed unexpectedly
- start conservative: 30-50% mix for normal podcast cleanup, 70-80% only for rescue/aggressive profiles after proof listening

Future integration:

- investigate a scriptable plug-in host or offline render host
- create Quipsly audio treatment presets
- render dxRevive passes into versioned derived stems
- store preset/mix values in the treatment manifest

## Episode 4 current state

The old continuous mix was stopped because Charlie's track carried audible Homer
bleed/echo during Charlie's non-speaking gaps. Episode 4 now uses a conformed
production baseline so every long-form branch and short can inherit the same
speaker-aware cleanup instead of repeating manual audio surgery per edit.

Current active baseline:

- run: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059`
- baseline id: `episode-4-conformed-production-baseline-v005`
- expected timeline duration: `6799.943` seconds
- stage board: `work/conformed-production-baseline/audio-spine-stage-board-v005.md`
- source contribution report: `work/conformed-production-baseline/source-contribution-report-v005.md`
- automation metadata: `work/conformed-production-baseline/speaker-gap-automation-v005.json`

Why v005 exists:

- v002 failed human listen proof because the mastered spine appeared to lose Homer in places.
- v004 proved the normal stereo handoff direction and source contribution checks, but v005 supersedes it with clearer stage receipts and lower pre-filter gain before EQ/compression.
- the v005 package is still `machine-generated-needs-listen-proof`, not publication-approved.

The v005 direction is:

- preserve original audio files untouched
- build branch-independent aligned stems
- create derived contribution-gated stems for Charlie, Homer, and reference audio
- use source-aware sidechain ducking to reduce Homer bleed in Charlie's track
- protect Homer's DJI mic from being ducked by Charlie's echo-contaminated track
- use gentler gating and denoise to reduce park/background noise in Homer's downspaces
- export a mastered full-length audio spine as a first-class artifact
- keep that conformed production baseline reusable for every Episode 4 producer take
- use proof snippets, source contribution reports, and the stage board to prove inheritance before trusting exports

Handoff rule:

- The Premiere and Quipsly handoff artifact is the normal stereo mastered WAV.
- Speaker-split files are diagnostic-only proof tools. They should not be imported as the production spine unless a specific diagnostic task asks for them.
- A compressed M4A is also produced for quick listening and sharing, but the WAV is the editing handoff.

Current conformed baseline outputs:

- `work/conformed-production-baseline/episode4-conformed-dialogue-bed-v005.wav`
- `work/conformed-production-baseline/episode4-mastered-audio-spine-v005.wav`
- `work/conformed-production-baseline/episode4-mastered-audio-spine-v005.m4a`
- `work/conformed-production-baseline/audio-listen-review-packet-v005.json`
- `work/conformed-production-baseline/audio-listen-review-packet-v005.md`
- `work/conformed-production-baseline/audio-workbench-qc-v005.json`
- `work/conformed-production-baseline/audio-workbench-qc-v005.md`
- `work/conformed-production-baseline/audio-workbench-source-activity-v005.json`
- `work/conformed-production-baseline/audio-workbench-source-activity-v005.md`
- `work/conformed-production-baseline/audio-workbench-source-activity-v005.csv`
- `work/conformed-production-baseline/quality-report-v005.json`
- `work/conformed-production-baseline/speaker-gap-automation-v005.json`
- `work/conformed-production-baseline/source-contribution-report-v005.json`
- `work/conformed-production-baseline/source-contribution-report-v005.md`
- `work/conformed-production-baseline/audio-spine-stage-board-v005.json`
- `work/conformed-production-baseline/audio-spine-stage-board-v005.md`

Current proof snippets:

- `work/conformed-production-baseline/proof-snippets/raw-aligned-proof-2062s.m4a`
- `work/conformed-production-baseline/proof-snippets/source-aware-contribution-mix-2062s.m4a`
- `work/conformed-production-baseline/proof-snippets/conformed-master-spine-2062s.m4a`
- `work/conformed-production-baseline/proof-snippets/speaker-split-charlie-left-homer-right-2062s.m4a`
- `work/conformed-production-baseline/proof-snippets/raw-aligned-proof-4180s.m4a`
- `work/conformed-production-baseline/proof-snippets/source-aware-contribution-mix-4180s.m4a`
- `work/conformed-production-baseline/proof-snippets/conformed-master-spine-4180s.m4a`
- `work/conformed-production-baseline/proof-snippets/speaker-split-charlie-left-homer-right-4180s.m4a`
- `work/conformed-production-baseline/proof-snippets/raw-aligned-proof-5710s.m4a`
- `work/conformed-production-baseline/proof-snippets/source-aware-contribution-mix-5710s.m4a`
- `work/conformed-production-baseline/proof-snippets/conformed-master-spine-5710s.m4a`
- `work/conformed-production-baseline/proof-snippets/speaker-split-charlie-left-homer-right-5710s.m4a`

Current machine status:

- aligned stems and contribution stems preserve the `6799.943` second episode timeline
- mastered WAV/M4A spines exist at about `6799.886` seconds, within the current duration tolerance
- quality report shows max volume about `-1.5 dB` and mean volume about `-20.1 dB`
- Audio Workbench QC reports the mastered WAV at about `-15.8 LUFS` integrated with about `-1.5 dBFS` true peak
- source contribution report currently reports no machine warnings
- proof windows show Homer present in both aligned and contribution stems at Homer-heavy windows
- full-spine silence analysis reports one advisory: a `23.576` second silence around sequence `1760.003` seconds. This is not a baseline blocker because the audio spine preserves the full sync timeline, but final edit branches should review or skip it.
- current machine verdict: ready for human listen proof, not publication-approved
- branch renders should use v005 or later, not the old v002 mastered spine
- `take-a-main-public` has a v005/v008 render that inherits this baseline:
  - video: `take-a-main-public/episode-4-take-a-main-public-16x9-v008.mp4`
  - podcast audio: `take-a-main-public/episode-4-take-a-main-public-podcast-audio-v008.m4a`
  - branch QC: `take-a-main-public/audio-workbench-branch-qc.md`

Current caution:

- machine checks prove file existence, duration sanity, branch inheritance, and manifest linkage
- machine checks do not prove the cleanup sounds natural
- proof snippets still need listening review against the raw aligned versions and against the normal stereo WAV in Premiere
- render diagnostics are now captured in branch manifests and the audio review packet; keep warning-free render diagnostics as a platform-readiness gate
- silence advisories should guide edits, not cause panic. A full synchronized spine is allowed to contain gaps that a final episode branch later skips.

Critical acceptance:

- Charlie Ep4.wav should no longer carry distracting Homer echo during Charlie's non-speaking gaps.
- Homer DJI recordings should reduce park/background noise during Homer's non-speaking gaps.
- The conversation must not sound unnaturally chopped; smooth fades, release times, and noise floors matter.
- Speaker-gap decisions must live in editable metadata, not hidden one-off manual cuts.

## AAA Audio Workbench direction

Quipsly should become unusually good at turning messy but usable field recordings into polished podcast audio. The target is not "one magic enhance button." The target is a visible workbench that gives Codex and humans enough control to make the sound excellent without losing trust.

### Product promise

- keep raw evidence untouched
- separate sync, repair, mix, master, and delivery stages
- make each stage auditionable with A/B proof snippets
- expose conservative, balanced, and aggressive treatment profiles
- preserve a clean normal stereo handoff file for Premiere, Quipsly Studio, and podcast/video exports
- keep source-split and speaker-split artifacts as diagnostics, not as the default human handoff

### Research-backed shape

Professional podcast cleanup generally follows a staged chain:

1. source diagnosis
2. sync and duration preservation
3. per-source repair
4. speaker-aware bleed/noise management
5. dialogue bus balancing
6. compression, limiting, and loudness normalization
7. proof listening and delivery exports

This lines up with the tools we are studying:

- FFmpeg gives repeatable loudness normalization, filtering, compression, limiting, silence detection, waveform rendering, and manifests.
- dxRevive and similar restoration tools are valuable source-treatment stages, especially on duplicated stems, but should not become an uninspected post-mix mystery box.
- Descript-style studio sound is useful as a product benchmark because it makes rough speech feel more studio-like, but Quipsly needs richer source receipts and stage control.
- iZotope RX-style repair is useful as a feature map: de-click, de-hum, de-reverb, dialogue isolation, spectral repair, and module-level auditioning.

### Workbench modules to build

- Source Inspector: duration, sample rate, clipping, silence, noise floor, hum, reverb, harshness, echo risk, and channel layout.
- Sync Inspector: alignment offsets, confidence, reference source, drift risk, and proof windows.
- Speaker Activity Map: where each speaker is likely talking, laughing, reacting, silent, or contaminated by bleed.
- Treatment Rack: per-source treatment chain with adjustable parameters and named presets.
- A/B Proof Board: raw aligned, treated stem, source-aware mix, mastered spine, and diagnostic speaker split for the same time windows.
- Loudness Console: integrated loudness, true peak, dynamic range, platform profile, and warning thresholds.
- Human Listen Queue: short windows that must be heard before declaring a master candidate ready.
- Agent Control Surface: commands for Codex to inspect stage state, generate proof windows, adjust profiles, rerender only the affected stage, and report the exact reason for each change.

### Current workbench command

Generate or refresh a listen-review packet for any conformed production baseline:

```bash
python3 apps/QuipslyStudio/script/audio_workbench_review_packet.py \
  --baseline-dir "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline"
```

The packet is not an export and not an approval. It is a stage-aware listening map that tells humans and agents:

- which normal stereo WAV to use in Premiere and Quipsly
- which raw/source-aware/master proof snippets to compare
- which diagnostic speaker-split snippets prove voice presence
- which stage probably failed when a symptom appears
- what targeted adjustment is safer than rerunning the whole chain blindly

Generate machine QC for the same baseline:

```bash
python3 apps/QuipslyStudio/script/audio_workbench_qc.py \
  --baseline-dir "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline" \
  --full
```

The QC packet checks the handoff artifacts for media integrity, duration, sample rate, channels, level, loudness, true peak, and long silence risk. It is a gate into human listen proof, not a replacement for listening.

Validate that a rendered branch inherited the conformed baseline:

```bash
python3 apps/QuipslyStudio/script/audio_workbench_branch_qc.py \
  --manifest "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/take-a-main-public/manifest.json"
```

This proves the branch points back to the conformed baseline and that its MP4/M4A outputs are structurally usable. It still does not prove the edit is good.

### Quality ladder

- Bronze: synced and audible, no missing speaker, no clipping, usable for emergency publication.
- Silver: balanced speech, reduced noise and echo, proof snippets pass basic listen review.
- Gold: natural conversational flow, no obviously chopped gates, phone-call echo controlled, park noise controlled, loudness ready for podcast and video.
- Platinum: source-specific repair profiles, transcript-aware and speaker-aware automix, excellent mobile playback, taste-approved by human review.

### Near-term Episode 4 sprint

1. Use v005 as the current machine-valid candidate.
2. Listen to the normal stereo WAV in Premiere and mark exact windows where the cleanup fails.
3. If Homer sounds missing, inspect source contribution before touching the edit.
4. If echo remains, adjust Charlie gap/sidechain treatment only on derived stems.
5. If Homer sounds chopped, relax Homer gate/release while preserving park-noise reduction.
6. If the master is too dense or unnatural, back off bus compression before changing source sync.
7. Render a v006 only after the failure is tied to a stage.

Current source-activity finding:

- Source map: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/audio-workbench-source-activity-v005.md`
- Profile variants: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-variants-v005-20260710-024506/audio-workbench-profile-variants-v005.md`
- Profile QC board: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-variants-v005-20260710-024506/audio-workbench-profile-variant-qc.md`
- Listen playlist: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-variants-v005-20260710-024506/audio-workbench-profile-variant-listen-proof.m3u`
- Charlie retained about `0.6826` of aligned energy (`-1.66 dB`) with `24` dropped-active risk windows.
- Homer retained about `0.5248` of aligned energy (`-2.8 dB`) with `412` dropped-active risk windows.
- Reference retained about `0.7162` of aligned energy (`-1.45 dB`) with `1` dropped-active risk window.
- Interpretation: this does not prove the v005 master is bad, but it strongly suggests the next v006 work should test Homer-preserving treatment variants on proof windows before any new full-length render.
- Current variant packet contains `30` proof clips across `6` source-activity windows: current source-aware, current master, conservative-human, Homer-preserving-clean, and aggressive-rescue.
- The corrected `20260710-024506` packet is structurally clean for the three candidate profiles: `48 kHz`, no profile warnings, max true peak about `-1.7` to `-1.8 dBFS`.
- Machine QC prefers `homer-preserving-clean` for first human listen because the source-activity map flagged Homer retention risk.
- The stale `20260710-023312` packet had `96 kHz` proof outputs and true-peak warnings on two profiles; do not promote it.
- Next move: listen to the corrected variant packet, choose the winning profile behavior, then promote only that behavior into a new full baseline.

## Tooling roadmap

### MVP

- source-aware sync-layer mix generation
- speaker-aware contribution-gated stems
- conformed production baseline manifest
- mastered full-length audio spine
- A/B proof snippets before full render
- manifest for every stem and treatment
- duration/sample-rate validation
- branch renders reuse conformed baseline audio
- source-activity map comparing aligned stems against contribution-gated stems

### Next

- audio treatment profiles:
  - natural
  - bleed reduced
  - aggressive cleanup
  - voice isolation proof
  - publish master
- per-speaker loudness reports
- profile-variant proof-window renderer before new full-spine versions
- profile-variant QC board and listen playlist
- speech/music/reference ducking
- waveform and transcript-linked audio diagnostics in Quipsly Studio
- one-click “export stems for restoration”
- one-click “import restored stems and validate duration”

### Later

- integrated offline plug-in render host if reliable
- speaker-aware automix from diarization/VAD
- room-tone reconstruction
- model-assisted detection of echo, bleed, clipping, reverb, harshness, and dead air
- Mako/Charlie review notes tied to exact audio treatment decisions

## References

- Apple Podcasts audio requirements: https://podcasters.apple.com/support/893-audio-requirements
- FFmpeg loudnorm filter documentation: https://ffmpeg.org/ffmpeg-filters.html#loudnorm
- Descript Studio Sound documentation: https://help.descript.com/hc/en-us/articles/10327603613837-Studio-Sound
- Descript Dolby Mastering documentation: https://help.descript.com/hc/en-us/articles/23106200875149-Enhance-SquadCast-recordings-with-Dolby-Mastering
- iZotope RX Advanced product/module map: https://www.izotope.com/products/rx-advanced
- iZotope RX module availability: https://support.izotope.com/hc/en-us/articles/6658241597073-Where-to-find-and-use-individual-RX-modules
- Accentize dxRevive: https://www.accentize.com/product/dxrevive/
- Accentize dxRevive manual: https://www.accentize.com/products/dxReviveManual.pdf
- Accentize dxRevive Pro manual: https://www.accentize.com/products/dxReviveProManual.pdf
- Accentize dxSplit: https://www.accentize.com/product/dxsplit/
- Accentize dxSplit manual: https://www.accentize.com/products/dxSplitUserManual.pdf
- Accentize dxRevive Pro tutorial: https://www.accentize.com/2024/03/12/getting-started-with-dxrevive-pro/
- Modern acoustic echo-cancellation research separates echo cancellation from residual noise/echo removal to reduce speech distortion during double-talk.

## Latest checkpoint: speaker cleanup proof pack audit (2026-07-10 20:10 UTC)

- Added and ran `apps/QuipslyStudio/script/audio_workbench_speaker_cleanup_proof_pack_audit.py` against the current v006 candidate.
- Speaker cleanup proof pack audit: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/speaker-cleanup-proof-pack-audit-v006-candidate-homer-preserving-clean-20260710-201049/speaker-cleanup-proof-pack-audit.md`.
- Audit result: `passed=true`, focus windows `15`, snippets audited `90`, errors `0`, warnings `0`.
- Regenerated stable review front door: `START_HERE_EPISODE_4_AUDIO_REVIEW.md` now links the proof-pack audit alongside the proof pack.
- Latest goal completion audit: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-goal-completion-audit-v006-candidate-homer-preserving-clean-20260710-201052.md` with status counts `5 proved`, `4 partial`, `2 locked`, `0 missing`.
- Latest review handoff index: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-review-handoff-index-v006-candidate-homer-preserving-clean-20260710-201052.md` with `106` linked artifacts and `0` missing artifacts.
- Current truth remains unchanged: `approvalStatus=machine-candidate-needs-human-listen-proof`, `packageReadyForHumanListen=true`, `branchInheritanceReady=false`, `branchRenderReady=false`, and no original media mutation.
- Meaning: the A/B speaker-cleanup proof pack is now mechanically audited and reviewer-ready, but branch inheritance and real episode/short branch renders are still locked until human listen proof.

## Latest checkpoint: speaker cleanup listen map (2026-07-10 20:23 UTC)

- Added and ran `apps/QuipslyStudio/script/audio_workbench_speaker_cleanup_listen_map.py` for the current v006 candidate.
- Latest speaker cleanup proof pack audit: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/speaker-cleanup-proof-pack-audit-v006-candidate-homer-preserving-clean-20260710-202313/speaker-cleanup-proof-pack-audit.md` with `passed=true`, focus windows `15`, snippets audited `90`, errors `0`, warnings `0`.
- Latest speaker cleanup listen map: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/speaker-cleanup-listen-map-v006-candidate-homer-preserving-clean-20260710-202319/speaker-cleanup-listen-map.md` / `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/speaker-cleanup-listen-map-v006-candidate-homer-preserving-clean-20260710-202319/speaker-cleanup-listen-map.html` with `15` decision windows and proof-pack audit linked `true`.
- `START_HERE_EPISODE_4_AUDIO_REVIEW.md` now opens/routes the speaker cleanup proof-pack audit and listen map as first-class reviewer artifacts.
- Latest goal completion audit: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-goal-completion-audit-v006-candidate-homer-preserving-clean-20260710-202320.md` with status counts `5 proved`, `4 partial`, `2 locked`, `0 missing`.
- Latest review handoff index: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-review-handoff-index-v006-candidate-homer-preserving-clean-20260710-202320.md` with `109` linked artifacts and `0` missing artifacts.
- Current truth remains unchanged: `approvalStatus=machine-candidate-needs-human-listen-proof`, `packageReadyForHumanListen=true`, `branchInheritanceReady=false`, `branchRenderReady=false`, and no original media mutation.
- Meaning: the 15-window speaker-cleanup review path now has rendered A/B snippets, an independent mechanical audit, and a human-readable pass/fail listen map. It still requires actual human listening before branch inheritance or real episode/short renders unlock.

## Latest checkpoint: speaker cleanup notes inbox (2026-07-10 20:37 UTC)

- Added `apps/QuipslyStudio/script/audio_workbench_speaker_cleanup_listen_map_notes_inbox.py` so exported notes from the 15-window speaker cleanup listen map have a safe route back into the review control plane.
- Added `apps/QuipslyStudio/script/audio_workbench_speaker_cleanup_listen_map_notes_inbox_smoke.py` covering no-notes, focused all-pass, needs-proof, needs-repair, and wrong-baseline notes.
- Latest speaker cleanup listen-map notes inbox: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/speaker-cleanup-listen-map-notes-inbox-v006-candidate-homer-preserving-clean-20260710-203705.md` with matching human candidates `0`, approval/branch/render/source mutation all `false`.
- Latest speaker cleanup listen-map notes inbox smoke: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/speaker-cleanup-listen-map-notes-inbox-smoke-v006-candidate-homer-preserving-clean-20260710-203620.md` with `passed=true`, scenarios `5`, real approval state preserved `true`, real branch state preserved `true`.
- Latest post-human-listen notes roundtrip: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-post-human-listen-notes-roundtrip-v006-candidate-homer-preserving-clean-20260710-203704.md` with `allStepsOk=true`, approval/branch/render/source mutation all `false`; the roundtrip now includes the speaker-cleanup listen-map notes inbox.
- Latest goal completion audit: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-goal-completion-audit-v006-candidate-homer-preserving-clean-20260710-203705.md` with status counts `5 proved`, `4 partial`, `2 locked`, `0 missing`.
- Latest review handoff index: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-review-handoff-index-v006-candidate-homer-preserving-clean-20260710-203706.md` with `111` linked artifacts and `0` missing artifacts.
- Current truth remains unchanged: `approvalStatus=machine-candidate-needs-human-listen-proof`, `packageReadyForHumanListen=true`, `branchInheritanceReady=false`, `branchRenderReady=false`, and no original media mutation.
- Meaning: the new human listen-map UI now has the proper three-part support system: exportable notes, an inbox that validates/routes them, and a smoke test proving safe behavior before any real reviewer notes exist.

<!-- reusable-audio-profile-intake-checkpoint:start -->
## Latest reusable audio profile intake checkpoint

Generated on 2026-07-10 for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`.

- Reusable intake packet: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-reusable-profile-intake-packet-v006-candidate-homer-preserving-clean-20260710-212534/reusable-profile-intake-packet.md`.
- Reusable intake packet open command: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-reusable-profile-intake-packet-v006-candidate-homer-preserving-clean-20260710-212534/open-reusable-profile-intake-packet.command`.
- Reusable intake readiness: `intake-ready-profile-not-production-default`.
- Reusable intake coverage: `6` source mapping rows, `7` stage checklist rows, `5` required input groups.
- Reusable intake smoke: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-reusable-profile-intake-packet-smoke-v006-candidate-homer-preserving-clean-20260710-212535.md` with `passed=true`, scenarios `2`, failed scenarios `0`.
- Latest goal completion audit: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-goal-completion-audit-v006-candidate-homer-preserving-clean-20260710-212858.md` with status counts `5 proved`, `4 partial`, `2 locked`, `0 missing`.
- Latest handoff index: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-review-handoff-index-v006-candidate-homer-preserving-clean-20260710-212858.md` with `0` missing linked artifacts after wiring the intake packet into the artifact list.
- Current truth remains unchanged: `approvalStatus=machine-candidate-needs-human-listen-proof`, `packageReadyForHumanListen=true`, `branchInheritanceReady=false`, `branchRenderReady=false`, and no original media mutation.
- Meaning: the Episode 4 audio workbench now has a tested next-episode intake contract for noisy/outdoor Homer-style recordings. It is still not production-default until applied to another real episode and human-listened there.
<!-- reusable-audio-profile-intake-checkpoint:end -->

<!-- audio-stage-control-surface-checkpoint:start -->
## Latest audio workbench stage control surface checkpoint

Generated on 2026-07-10 for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`.

- Stage control surface: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-workbench-stage-control-surface-v006-candidate-homer-preserving-clean-20260710-214249/audio-workbench-stage-control-surface.md`.
- Stage control surface HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-workbench-stage-control-surface-v006-candidate-homer-preserving-clean-20260710-214249/audio-workbench-stage-control-surface.html`.
- Stage control surface open command: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-workbench-stage-control-surface-v006-candidate-homer-preserving-clean-20260710-214249/open-audio-workbench-stage-control-surface.command`.
- Stage coverage: `8` stages, `0` missing linked stage artifacts, `1` locked stage.
- START_HERE refreshed: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/START_HERE_EPISODE_4_AUDIO_REVIEW.md` now opens the stage control surface before the listen-priority console.
- Latest goal completion audit: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-goal-completion-audit-v006-candidate-homer-preserving-clean-20260710-214249.md` with status counts `5 proved`, `4 partial`, `2 locked`, `0 missing`.
- Latest handoff index: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-review-handoff-index-v006-candidate-homer-preserving-clean-20260710-214249.md` with `0` missing linked artifacts.
- Current truth remains unchanged: `approvalStatus=machine-candidate-needs-human-listen-proof`, `packageReadyForHumanListen=true`, `branchInheritanceReady=false`, `branchRenderReady=false`, `renderAttempted=false`, and no original media mutation.
- Meaning: the workbench now has a single studio-console map for raw sources, sync, speaker activity, cleanup, restoration, mix/master, human listen, and branch inheritance. This improves visibility and agent/human control without replacing the human listen gate.
<!-- audio-stage-control-surface-checkpoint:end -->


<!-- repair-tuning-console-checkpoint:start -->
## Latest Episode 4 checkpoint: repair/tuning console

Generated on 2026-07-10 for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`.

- Added `audio_workbench_repair_tuning_console.py` as the symptom-to-stage router for human listen failures.
- Added `audio_workbench_repair_tuning_console_smoke.py` to prove the console preserves approval state, branch state, render state, and original media safety.
- The console maps likely failures such as Homer missing, Charlie echo under Homer, Homer park noise under Charlie, robotic gating, fake restoration, long structural gaps, wrong source/sync, harsh/unbalanced master, and premature branch rendering.
- The intended use is post-listen repair planning: pick the symptom, inspect the evidence, tune the owning stage, and create a timestamped proof candidate rather than rerunning a whole magic-box pipeline.
- This checkpoint does not approve v006 and does not unlock branch inheritance or publication renders.
<!-- repair-tuning-console-checkpoint:end -->


<!-- parameter-control-ledger-checkpoint:start -->
## Latest Episode 4 checkpoint: parameter control ledger

Generated on 2026-07-10 for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`.

- Added `audio_workbench_parameter_control_ledger.py` as the stage-specific audio knob registry for post-listen repair work.
- Added `audio_workbench_parameter_control_ledger_smoke.py` to prove the ledger preserves approval state, branch state, render state, and original media safety.
- The ledger names controls such as Charlie-under-Homer duck depth, Homer-under-Charlie duck depth, Homer/Charlie pre-bus gain, speaker activity threshold, cleanup crossfade, dxRevive restoration strength, compression, limiter ceiling, and structural gap policy.
- Each control has symptoms, evidence links, safe adjustment language, danger notes, and proof requirements.
- This checkpoint improves controllability but does not approve v006 or unlock branch inheritance/rendering.
<!-- parameter-control-ledger-checkpoint:end -->


<!-- parameter-sweep-proof-plan-checkpoint:start -->
## Latest Episode 4 checkpoint: parameter sweep proof plan

Generated on 2026-07-10 for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`.

- Added `audio_workbench_parameter_sweep_proof_plan.py` to convert parameter controls into conservative, standard, and aggressive proof-only repair recipes.
- Added `audio_workbench_parameter_sweep_proof_plan_smoke.py` to prove required plans and variants are generated without approval, branch, render, or original-media side effects.
- Current plans cover Charlie echo under Homer, Homer park noise under Charlie, Homer presence/balance, natural gating, dxRevive duplicated-stem restoration, and structural gap branch policy.
- This is still a proof-plan layer. It does not render v007, approve v006, or unlock branch inheritance; it makes the eventual focused repair loop less magical and more testable.
<!-- parameter-sweep-proof-plan-checkpoint:end -->

<!-- parameter-sweep-proof-snippet-pack-checkpoint:start -->
## Latest v006 parameter sweep proof snippet pack checkpoint

Generated on 2026-07-10 for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`.

- Added a parameter sweep proof snippet pack so the safest sweep variants can be auditioned as short A/B clips before any full v007 baseline repair is attempted.
- Rendered `32` derived proof snippets from existing speaker-cleanup proof-pack stems with `0` render failures.
- Held `6` routes as unavailable instead of faking them because dxRevive returned bounces and structural branch-policy renders need their own real renderers.
- The snippet pack compares current v006 controls against conservative/standard/aggressive sweep auditions for Charlie echo under Homer, Homer park noise under Charlie, Homer presence/balance, and natural-gating safety blends.
- The smoke confirms required snippets exist, playlist/open surfaces are present, branch render was not attempted, approval/branch state stayed unchanged, and original media stayed untouched.
- Current truth remains: `approvalStatus=machine-candidate-needs-human-listen-proof`, `packageReadyForHumanListen=true`, `branchInheritanceReady=false`, and `branchRenderReady=false` until a real human listen decision is recorded.
<!-- parameter-sweep-proof-snippet-pack-checkpoint:end -->

<!-- parameter-sweep-notes-inbox-checkpoint:start -->
## Latest v006 parameter sweep notes inbox checkpoint

Generated on 2026-07-10 for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`.

- Added `apps/QuipslyStudio/script/audio_workbench_parameter_sweep_notes_inbox.py` so exported notes from the parameter sweep proof snippets have a safe route back into the audio workbench.
- Added `apps/QuipslyStudio/script/audio_workbench_parameter_sweep_notes_inbox_smoke.py` covering no-notes, winner, needs-proof, needs-repair, and wrong-baseline cases.
- Latest parameter sweep notes inbox: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/parameter-sweep-proof-snippet-notes-inbox-v006-candidate-homer-preserving-clean-20260710-225740.md` with matching human candidates `0`, repair actions `0`, focused proof actions `0`, approval/branch/render/source mutation all `false`.
- Latest parameter sweep notes inbox smoke: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/parameter-sweep-proof-snippet-notes-inbox-smoke-v006-candidate-homer-preserving-clean-20260710-225740.md` with `passed=true`, scenarios `5`, approval/branch state preserved, render attempted `false`, and original media mutated `false`.
- The post-human-listen notes roundtrip now includes the parameter sweep notes inbox alongside listen-priority, speaker-cleanup, marker-review, repair-planner, status, audit, router, START_HERE, and handoff refresh steps.
- START_HERE now explains the parameter sweep notes route before the broader listen-priority review path.
- Latest goal completion audit: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-goal-completion-audit-v006-candidate-homer-preserving-clean-20260710-225742.md` with status counts `9 proved`, `4 partial`, `2 locked`, `0 missing`. This audit also fixes the prior late-requirement counting bug.
- Latest review handoff index: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-review-handoff-index-v006-candidate-homer-preserving-clean-20260710-225742.md` with `0` missing linked artifacts.
- Current truth remains unchanged: `approvalStatus=machine-candidate-needs-human-listen-proof`, `packageReadyForHumanListen=true`, `branchInheritanceReady=false`, `branchRenderReady=false`, and no original media mutation.
- Meaning: parameter sweep A/B listening now has a complete feedback loop: proof snippets, exported reviewer notes, safe inbox routing, smoke coverage, START_HERE visibility, roundtrip inclusion, audit evidence, and handoff indexing. It still cannot approve v006 or unlock branch renders without actual human listen proof.
<!-- parameter-sweep-notes-inbox-checkpoint:end -->

<!-- producer-grade-audit-checkpoint:start -->
## Latest v006 producer-grade audio audit checkpoint

Generated on 2026-07-10 for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`.

- Added `apps/QuipslyStudio/script/audio_workbench_producer_grade_audit.py` to consolidate existing machine evidence into a producer-readiness review surface: speaker preservation, smoothness risk, source-balance warnings, reviewability, strengths, risks, and listen-first moments.
- Added `apps/QuipslyStudio/script/audio_workbench_producer_grade_audit_smoke.py` to prove the audit can run against a synthetic baseline while preserving real approval/branch truth.
- Latest producer-grade audit: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-producer-grade-audit-v006-candidate-homer-preserving-clean-20260710-231608/producer-grade-audio-audit.md`.
- Latest producer-grade audit HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-producer-grade-audit-v006-candidate-homer-preserving-clean-20260710-231608/producer-grade-audio-audit.html`.
- Producer audit status: `machine-producer-review-ready-human-listen-required`, score `82/100`, risk `high-review-risk`, producer listen moments `39`, approval/branch/render/source mutation all `false`.
- Producer audit smoke: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-producer-grade-audit-smoke-v006-candidate-homer-preserving-clean.md` with `passed=true`.
- START_HERE now opens/routes the producer-grade audit immediately after the audio workbench stage control surface.
- The post-human-listen notes roundtrip now regenerates the producer-grade audit, so notes routing and producer-readiness evidence stay synchronized.
- Latest goal completion audit: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-goal-completion-audit-v006-candidate-homer-preserving-clean-20260710-231609.md` with status counts `10 proved`, `4 partial`, `2 locked`, `0 missing`.
- Latest review handoff index: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-review-handoff-index-v006-candidate-homer-preserving-clean-20260710-231609.md` with `0` missing linked artifacts.
- Current truth remains unchanged: `approvalStatus=machine-candidate-needs-human-listen-proof`, `packageReadyForHumanListen=true`, `branchInheritanceReady=false`, `branchRenderReady=false`, and no original media mutation.
- Meaning: v006 now has a producer-facing machine review board that helps humans know where to listen first without pretending math can approve taste, naturalness, or publication readiness.
<!-- producer-grade-audit-checkpoint:end -->

<!-- producer-grade-notes-inbox-checkpoint:start -->
## Latest v006 producer-grade notes inbox checkpoint

Generated on 2026-07-10 for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`.

- Added `apps/QuipslyStudio/script/audio_workbench_producer_grade_notes_inbox.py` so exported notes from the producer-grade audio audit have a safe route back into the workbench.
- Added `apps/QuipslyStudio/script/audio_workbench_producer_grade_notes_inbox_smoke.py` covering no-notes, all-pass, needs-proof, needs-repair, and wrong-baseline cases.
- The producer-grade audit HTML now includes pass / needs-proof / needs-repair controls, reviewer notes fields, an export button, and a blank notes template.
- Latest producer-grade audit: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-producer-grade-audit-v006-candidate-homer-preserving-clean-20260710-234619/producer-grade-audio-audit.md`.
- Latest producer-grade audit HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-producer-grade-audit-v006-candidate-homer-preserving-clean-20260710-234619/producer-grade-audio-audit.html`.
- Latest producer-grade notes template: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-producer-grade-audit-v006-candidate-homer-preserving-clean-20260710-234619/producer-grade-notes-template.json`.
- Latest producer-grade notes inbox: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/producer-grade-notes-inbox-v006-candidate-homer-preserving-clean-20260710-234619.md` with matching human candidates `0`, repair actions `0`, focused proof actions `0`, pass context `0`, approval/branch/render/source mutation all `false`.
- Latest producer-grade notes inbox smoke: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/producer-grade-notes-inbox-smoke-v006-candidate-homer-preserving-clean-20260710-234446.md` with `passed=true` and `5` scenarios.
- The post-human-listen notes roundtrip now includes the producer-grade notes inbox alongside listen-priority, speaker-cleanup, parameter-sweep, marker-review, repair-planner, status, audit, router, START_HERE, goal-audit, and handoff refresh steps.
- Latest post-human-listen notes roundtrip: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-post-human-listen-notes-roundtrip-v006-candidate-homer-preserving-clean-20260710-234618.md` with `allStepsOk=true`, approval state changed `false`, branch state changed `false`, render attempted `false`, and original media mutated `false`.
- Latest goal completion audit: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-goal-completion-audit-v006-candidate-homer-preserving-clean-20260710-234620.md` with status counts `10 proved`, `4 partial`, `2 locked`, `0 missing`.
- Latest review handoff index: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-review-handoff-index-v006-candidate-homer-preserving-clean-20260710-234620.md` with `0` missing linked artifacts.
- Current truth remains unchanged: `approvalStatus=machine-candidate-needs-human-listen-proof`, `packageReadyForHumanListen=true`, `branchInheritanceReady=false`, `branchRenderReady=false`, and no original media mutation.
- Meaning: the producer-grade machine audit now has a complete feedback loop: jump-listen audit, local reviewer notes export, notes template, safe inbox routing, smoke coverage, START_HERE visibility, roundtrip inclusion, audit evidence, and handoff indexing. It still cannot approve v006 or unlock branch renders without actual human listen proof.
<!-- producer-grade-notes-inbox-checkpoint:end -->

<!-- post-review-action-queue-checkpoint:start -->
## Latest v006 post-review action queue checkpoint

Generated on 2026-07-11 for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`.

- Added `apps/QuipslyStudio/script/audio_workbench_post_review_action_queue.py` so every exported-notes path has one shared after-review board instead of leaving producer, marker, speaker-cleanup, parameter-sweep, and listen-priority notes stranded in separate inboxes.
- Added `apps/QuipslyStudio/script/audio_workbench_post_review_action_queue_smoke.py` covering no-notes and mixed repair/proof/pass-context routing while preserving approval, branch, render, and source-media truth.
- Latest post-review action queue: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-post-review-action-queue-v006-candidate-homer-preserving-clean-20260711-001101.md`.
- Queue status: sources scanned `6`, sources with notes candidates `0`, repair actions `0`, focused proof actions `0`, pass/context actions `0`. This means the current package is still waiting for actual exported human notes; it is not approval.
- The post-human-listen notes roundtrip now runs the post-review action queue after the individual inboxes and legacy repair planner.
- START_HERE now exposes the post-review action queue before the repair/tuning console so reviewers see what the notes mean before touching knobs.
- Latest goal completion audit: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-goal-completion-audit-v006-candidate-homer-preserving-clean-20260711-001344.md` with status counts `11 proved`, `4 partial`, `2 locked`, `0 missing`.
- Latest review handoff index: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-review-handoff-index-v006-candidate-homer-preserving-clean-20260711-001344.md` with `0` missing linked artifacts.
- Current truth remains unchanged: `approvalStatus=machine-candidate-needs-human-listen-proof`, `packageReadyForHumanListen=true`, `branchInheritanceReady=false`, `branchRenderReady=false`, and no original media mutation.
- Meaning: v006 now has a single after-notes action queue. Human notes can become repair/proof/pass-context work without unlocking branch inheritance, rendering branches, or pretending machine evidence equals human approval.
<!-- post-review-action-queue-checkpoint:end -->

<!-- refreshed-human-listen-session-checkpoint:start -->
## Latest v006 refreshed human-listen session checkpoint

Generated on 2026-07-11 for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`.

- The guided human-listen session now links the current review surfaces: START_HERE, human-listen control room, review-reel M4A, post-review action queue, producer-grade audit, speaker-cleanup proof surfaces, parameter-sweep proof snippets, dxRevive bounce validation, M4A listening copy, and WAV handoff master.
- Latest session README: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/human-listen-session-v006-candidate-homer-preserving-clean-20260711-002306/README.md`.
- Latest session HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/human-listen-session-v006-candidate-homer-preserving-clean-20260711-002306/listen-session.html`.
- Latest session JSON reports `47` linked artifacts with `0` missing.
- Validation passed: script compile, session regeneration, handoff index refresh, and goal audit refresh.
- Safety truth remains locked: no approval, no branch unlock, no branch render, no upload, and no original media mutation.
<!-- refreshed-human-listen-session-checkpoint:end -->

## 2026-07-11: Speaker contribution ledger checkpoint

Episode 4 v006 now includes a speaker contribution ledger as part of the professional audio workbench. The ledger is a non-destructive review surface that answers a specific production question: did the candidate master preserve Charlie, Homer, and reference contributions while applying speaker-aware silence, bleed, and cleanup logic?

Current behavior:
- The ledger reads the existing source-activity, source-balance, speaker-activity, bleed-gap, and spine sanity reports.
- It emits Markdown, HTML, JSON, and a review-marker CSV.
- It ranks suspect windows for human listening rather than approving the master automatically.
- It updates the manifest so review start-here, human listen sessions, handoff indexes, and goal-completion audits can point at the same evidence.

Guardrail:
The ledger is evidence, not approval. It must not change approval status, branch state, render readiness, or original media. Human listen proof is still required before v006 can become a branch-inheritance baseline.

Current v006 ledger:
- /Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-speaker-contribution-ledger-v006-candidate-homer-preserving-clean-20260711-003619/speaker-contribution-ledger.md

## 2026-07-11: Speaker preservation proof pack

The audio workbench now includes a speaker preservation proof pack for Episode 4 v006. This pack turns the speaker contribution ledger into playable A/B evidence: a short mastered-v006 snippet beside the aligned raw speaker source at mix gain for high-risk Charlie/Homer preservation moments.

Why it exists:
- The contribution ledger can identify suspect windows, but humans need fast audio evidence to judge whether a voice was actually swallowed, over-gated, left echo-heavy, or preserved naturally.
- Full-length review is too cognitively expensive for first-pass diagnosis.
- Short proof clips make the review loop more humane and make agent/human feedback more precise.

Current behavior:
- Selects ranked Charlie/Homer preservation-risk markers from the current speaker contribution ledger.
- Renders derived review snippets only.
- Writes JSON, Markdown, HTML, M3U playlist, and an open command.
- Registers itself in the manifest and appears in START_HERE, human-listen sessions, handoff indexes, and goal-completion audits.

Guardrail:
This pack is not an approval mechanism. It may render derived review snippets, but it must not change approval status, branch inheritance, branch render readiness, or original media.

Current v006 proof pack:
- /Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-speaker-preservation-proof-pack-v006-candidate-homer-preserving-clean-20260711-010642/speaker-preservation-proof-pack.md

## 2026-07-11: Speaker preservation notes return path

The speaker preservation proof pack now has a reviewer notes return path. This closes the loop between evidence and action.

Current behavior:
- The proof pack HTML exposes per-moment decision controls: pass, needs focused proof, or needs scoped repair.
- Exported notes use schema `quipsly.audio.speaker-preservation-proof-notes.v1`.
- The preservation notes inbox validates exported notes against the active baseline and converts them into pass-context, focused-proof, or repair actions.
- The post-review action queue includes preservation notes alongside listen-priority, speaker-cleanup, parameter-sweep, marker-review, producer-grade, and repair-planner outputs.
- The post-human-listen notes roundtrip now runs the preservation notes inbox automatically.

Guardrail:
All-pass preservation notes do not approve the full v006 audio spine. They only clear this focused preservation proof slice. Full approval still requires an explicit human listen decision.

Current v006 notes inbox:
- /Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/speaker-preservation-proof-notes-inbox-v006-candidate-homer-preserving-clean-20260711-012902.md

## 2026-07-11: Speaker preservation evidence promoted into completion audit

The v006 completion audit now treats the speaker-preservation proof path as official evidence, not a side artifact.

Current behavior:
- The `Speaker-aware silence/bleed cleanup is inspectable` requirement reports speaker-preservation proof pack item/snippet/failure counts.
- The same requirement reports preservation notes inbox candidate/action counts.
- The post-review action queue smoke test covers speaker-preservation notes as a first-class source.

Guardrail:
This still does not approve v006. It only makes the preservation evidence visible in the formal goal audit. Full branch inheritance and branch rendering remain locked until a human listen decision is recorded.

Current v006 audit:
- /Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-goal-completion-audit-v006-candidate-homer-preserving-clean-20260711-014207.md

## 2026-07-11: Final-listen fast pass

The v006 Episode 4 audio workflow now includes a compact final-listen fast-pass route. This is the shortest sane review path through the current evidence: one master player, ranked jump checks, local notes export, and standard notes routing.

Current behavior:
- The fast-pass generator creates Markdown, HTML, JSON, a notes template, and an open command.
- The fast-pass notes inbox validates exported notes against the active baseline and turns decisions into pass-context, focused-proof, or repair actions.
- The post-review action queue scans the fast-pass inbox as a first-class source.
- The post-human-listen roundtrip runs the fast-pass inbox automatically.
- START_HERE, human-listen sessions, handoff indexes, and completion audits expose the fast-pass route.

Guardrail:
The fast pass is not approval. All-pass fast-pass notes only become context. Branch inheritance and branch rendering remain locked until a real human listen decision is recorded.

Current v006 fast pass:
- /Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-final-listen-fast-pass-episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean-20260711-021011/final-listen-fast-pass.html

<!-- platform-loudness-audit-checkpoint:start -->
## 2026-07-11 checkpoint: platform loudness audit added

Added a platform loudness delivery-readiness audit for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`.

Latest artifacts:
- Platform loudness audit JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-platform-loudness-audit-v006-candidate-homer-preserving-clean-20260711-024038/platform-loudness-audit.json`
- Platform loudness audit Markdown: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-platform-loudness-audit-v006-candidate-homer-preserving-clean-20260711-024038/platform-loudness-audit.md`
- Platform loudness audit HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-platform-loudness-audit-v006-candidate-homer-preserving-clean-20260711-024038/platform-loudness-audit.html`
- Open command: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-platform-loudness-audit-v006-candidate-homer-preserving-clean-20260711-024038/open-platform-loudness-audit.command`

Machine result:
- Hard-gate attention count: `0`.
- Advisory attention count: `0`.
- Podcast profiles machine-ready: `true`.
- The current WAV/M4A both measure `-16.0 LUFS`; true peak is approximately `-1.8 dBFS` for WAV and `-1.1 dBFS` for M4A.

Workflow wiring:
- START_HERE now links the platform loudness audit.
- The human-listen session now links the platform loudness audit and open command.
- The handoff index now lists the platform loudness audit artifacts.
- The goal completion audit now reports platform loudness machine-readiness inside the grown-up workflow requirement.

Safety truth remains unchanged:
- approvalStatus remains machine-candidate-needs-human-listen-proof.
- packageReadyForHumanListen remains true.
- branchInheritanceReady remains false.
- branchRenderReady remains false.
- no approval state change.
- no branch state change.
- no branch render attempt.
- no original media mutation.

Meaning:
The current v006 audio master has measurable platform delivery evidence for podcast and social/video reference profiles, but still requires human listening before branch inheritance, publication, or use as the final Episode 4 spine.
<!-- platform-loudness-audit-checkpoint:end -->

<!-- broadcast-polish-scorecard-checkpoint:start -->
## 2026-07-11 checkpoint: broadcast polish scorecard added

Added a broadcast polish scorecard for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean` so v006 has one producer-facing machine summary across delivery loudness, smoothness/dynamics, source preservation, review readiness, and restoration-control risk.

Latest artifacts:
- Broadcast polish scorecard JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-broadcast-polish-scorecard-v006-candidate-homer-preserving-clean-20260711-030440/broadcast-polish-scorecard.json`
- Broadcast polish scorecard Markdown: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-broadcast-polish-scorecard-v006-candidate-homer-preserving-clean-20260711-030440/broadcast-polish-scorecard.md`
- Broadcast polish scorecard HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-broadcast-polish-scorecard-v006-candidate-homer-preserving-clean-20260711-030440/broadcast-polish-scorecard.html`
- Open command: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-broadcast-polish-scorecard-v006-candidate-homer-preserving-clean-20260711-030440/open-broadcast-polish-scorecard.command`

Machine result:
- Overall score: `90.4`.
- Overall status: `needs-focused-proof-or-repair`.
- Delivery loudness: `100`, strong.
- Smoothness/dynamics: `70`, needs focused proof. The smoothness audit itself passes, but the master still has dense hard-edge and large-jump listen-check markers plus long low-level spans that should be sampled by ear before approval.
- Source preservation: `100`, strong.
- Review readiness: `100`, strong.
- Restoration control: `82`, usable with listen proof. dxRevive remains a guarded derived-stem lane and has not secretly entered v006.

Workflow wiring:
- START_HERE now opens and links the broadcast polish scorecard.
- The human-listen session now includes the broadcast polish scorecard and open command.
- The handoff index now lists the broadcast polish scorecard artifacts.
- The goal completion audit now reports the broadcast polish scorecard inside the grown-up workflow requirement.

Validation:
- Python compile passed for the broadcast polish scorecard, smoke, START_HERE, handoff index, human-listen session, and goal audit scripts.
- `audio_workbench_broadcast_polish_scorecard_smoke.py` passed.
- Real v006 scorecard generated successfully.
- START_HERE refreshed without approval, branch, render, upload, or source mutation.
- Human-listen session refreshed with `60` links and `0` missing.
- Goal completion audit remains `11` proved, `4` partial, `2` locked, `0` missing.
- Handoff index reports `0` missing linked artifacts.

Safety truth remains unchanged:
- approvalStatus remains machine-candidate-needs-human-listen-proof.
- packageReadyForHumanListen remains true.
- branchInheritanceReady remains false.
- branchRenderReady remains false.
- no approval state change.
- no branch state change.
- no branch render attempt.
- no original media mutation.

Meaning:
The v006 audio master has a calmer producer-level quality map now, but the smoothness/listen-check density means the next responsible move is focused human/agent listening, not branch inheritance or rendering.
<!-- broadcast-polish-scorecard-checkpoint:end -->

<!-- smoothness-proof-pack-checkpoint:start -->
## 2026-07-11 checkpoint: smoothness proof pack added

Added a focused smoothness proof pack for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean` so the broadcast-polish warning about dense smoothness/listen-check markers now has a direct ears-on proof path.

Latest artifacts:
- Smoothness proof pack JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-smoothness-proof-pack-v006-candidate-homer-preserving-clean-20260711-032309/smoothness-proof-pack.json`
- Smoothness proof pack Markdown: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-smoothness-proof-pack-v006-candidate-homer-preserving-clean-20260711-032309/smoothness-proof-pack.md`
- Smoothness proof pack HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-smoothness-proof-pack-v006-candidate-homer-preserving-clean-20260711-032309/smoothness-proof-pack.html`
- Smoothness proof playlist: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-smoothness-proof-pack-v006-candidate-homer-preserving-clean-20260711-032309/smoothness-proof-snippets.m3u`
- Smoothness proof notes template: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-smoothness-proof-pack-v006-candidate-homer-preserving-clean-20260711-032309/smoothness-proof-notes-template.json`
- Open command: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-smoothness-proof-pack-v006-candidate-homer-preserving-clean-20260711-032309/open-smoothness-proof-pack.command`

Machine result:
- Moments selected: `26`.
- Snippets rendered: `26`.
- Render failures: `0`.
- The pack samples top hard-edge/large-jump transitions and long low-level spans from the smoothness audit.
- The HTML includes local decision controls and exports notes using schema `quipsly.audio-workbench.smoothness-proof-notes.v1`.

Workflow wiring:
- START_HERE now opens and links the smoothness proof pack.
- The human-listen session now includes the smoothness proof pack, open command, and notes template.
- The handoff index now lists the smoothness proof pack artifacts.
- The goal completion audit now reports smoothness proof snippet and failure counts inside the grown-up workflow requirement.

Validation:
- Python compile passed for the smoothness proof pack, smoke, START_HERE, handoff index, human-listen session, and goal audit scripts.
- `audio_workbench_smoothness_proof_pack_smoke.py` passed.
- Real v006 smoothness proof pack generated `26` snippets with `0` failures.
- START_HERE refreshed without approval, branch, upload, publication, or source mutation.
- Human-listen session refreshed with `63` links and `0` missing.
- Goal completion audit remains `11` proved, `4` partial, `2` locked, `0` missing.
- Handoff index reports `0` missing linked artifacts.

Safety truth remains unchanged:
- approvalStatus remains machine-candidate-needs-human-listen-proof.
- packageReadyForHumanListen remains true.
- branchInheritanceReady remains false.
- branchRenderReady remains false.
- no approval state change.
- no branch state change.
- no branch render attempt.
- no upload, publication, or original media mutation.

Meaning:
The current v006 smoothness concern is no longer abstract. A reviewer can open the proof pack, listen to the exact edge/jump/pause moments, export structured notes, and decide whether the issue is pass-context, focused proof, or scoped v007 repair.
<!-- smoothness-proof-pack-checkpoint:end -->

## 2026-07-11 checkpoint: smoothness proof notes inbox added

The Episode 4 v006 smoothness proof pack now has a return path for exported reviewer notes.

Added:
- `apps/QuipslyStudio/script/audio_workbench_smoothness_proof_notes_inbox.py` consumes `quipsly.audio-workbench.smoothness-proof-notes.v1` exports from the smoothness proof pack.
- `apps/QuipslyStudio/script/audio_workbench_smoothness_proof_notes_inbox_smoke.py` proves pass, focused-proof, and repair notes route without changing approval, branch, render, or source-media truth.
- The post-human-listen notes roundtrip now runs the smoothness notes inbox.
- The post-review action queue now treats smoothness proof notes as a first-class source.
- START_HERE, the human-listen session, the handoff index, and the goal completion audit now expose the smoothness notes inbox.

Current v006 artifacts:
- Smoothness proof notes inbox: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/smoothness-proof-notes-inbox-episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean-20260711-033806.md`
- Latest post-human-listen roundtrip: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-post-human-listen-notes-roundtrip-v006-candidate-homer-preserving-clean-20260711-033806.md`
- Latest human-listen session: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/human-listen-session-v006-candidate-homer-preserving-clean-20260711-033807/README.md`
- Latest goal audit: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-goal-completion-audit-v006-candidate-homer-preserving-clean-20260711-033807.md`
- Latest handoff index: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-review-handoff-index-v006-candidate-homer-preserving-clean-20260711-033807.md`

Validation:
- Python compile passed for the new inbox, smoke, START_HERE, human session, handoff index, post-human-listen roundtrip, post-review action queue, queue smoke, and goal audit scripts.
- `audio_workbench_smoothness_proof_notes_inbox_smoke.py` passed.
- `audio_workbench_post_review_action_queue_smoke.py` passed and explicitly covered `smoothnessSourceCovered=true`.
- Real v006 smoothness notes inbox currently finds `0` matching exported notes, expected until a human exports notes.
- Real post-human-listen roundtrip passed with `allStepsOk=true`.
- Latest human-listen session reports `64` links and `0` missing.
- Latest goal audit remains `11` proved, `4` partial, `2` locked, `0` missing.
- Latest handoff index reports `0` missing linked artifacts.

Safety truth remains unchanged:
- `approvalStatus=machine-candidate-needs-human-listen-proof`.
- `packageReadyForHumanListen=true`.
- `branchInheritanceReady=false`.
- `branchRenderReady=false`.
- no approval state change.
- no branch state change.
- no branch render attempt.
- no original media mutation.

Meaning:
The smoothness review loop is now inspectable end to end: proof snippets can be heard, exported notes can be ingested, and repair/proof/pass decisions can land in the unified post-review action queue. The remaining lock is still intentionally human: v006 needs an actual listen decision before approval or branch inheritance.

## 2026-07-11 reusable intake packet contract checkpoint

The reusable audio profile intake packet now writes packet-level evidence counts directly into `reusable-profile-intake-packet.json`: `sourceMappingRowCount`, `stageChecklistCount`, and `requiredInputGroupCount`. The goal-completion audit also falls back to counting the canonical worksheet arrays if an older packet lacks those count fields.

Latest validated Episode 4 v006 candidate evidence:

- Intake packet: `6` source mapping rows, `7` stage checklist rows, `5` required future-episode input groups.
- Reusable intake smoke: passed with `0` failed scenarios and preserved approval/branch state.
- Goal audit: `11` proved, `4` partial, `2` locked, `0` missing.
- Safety: original media unchanged; approval remains `machine-candidate-needs-human-listen-proof`; branch inheritance/render remain locked until human listen approval.

Meaning: the future noisy/outdoor Homer workflow is more inspectable now. This still is not production-default proof for another episode; it is the intake contract and evidence trail for starting the next episode without bespoke surgery.


## 2026-07-11 checkpoint: producer command center added

Added a producer command center for the active Episode 4 v006 candidate so the audio review runway has one calm, current-state front door instead of only a long ledger of artifacts.

Current command center:
- JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-producer-command-center-v006-candidate-homer-preserving-clean-20260711-040502/producer-command-center.json`
- Markdown: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-producer-command-center-v006-candidate-homer-preserving-clean-20260711-040502/producer-command-center.md`
- HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-producer-command-center-v006-candidate-homer-preserving-clean-20260711-040502/producer-command-center.html`
- Open command: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-producer-command-center-v006-candidate-homer-preserving-clean-20260711-040502/open-producer-command-center.command`

Machine result:
- Status: `ready-for-human-listen`.
- Review cards: `10`.
- Primary artifacts: `10`.
- Missing primary artifacts: `0`.

Validation:
- Python compile passed for the producer command center, goal audit, and handoff index scripts.
- Real v006 command center generated successfully.
- Latest goal audit remains `11` proved, `4` partial, `2` locked, `0` missing, and now reports the command center in the workflow requirement evidence.
- Latest handoff index reports `0` missing linked artifacts.

Safety truth remains unchanged:
- approvalStatus remains `machine-candidate-needs-human-listen-proof`.
- packageReadyForHumanListen remains `true`.
- branchInheritanceReady remains `false`.
- branchRenderReady remains `false`.
- no approval state change, branch state change, branch render, upload, publication, or original media mutation.

Meaning:
A reviewer can now start from a producer-facing command center that names the current candidate, the shortest listen path, smoothness/preservation/source-balance proof surfaces, dxRevive fallback state, action queue, and the exact next safe actions. This improves review usability but still does not replace real human listening.

## 2026-07-11 checkpoint: START_HERE opens the Producer Command Center first

The Episode 4 v006 audio review runway now treats the Producer Command Center as the stable first reviewer surface, not a buried artifact.

Changed:
- `audio_workbench_review_start_here.py` now registers the producer command center Markdown, HTML, JSON, and open command from the baseline manifest outputs.
- `START_HERE_EPISODE_4_AUDIO_REVIEW.md` now puts the Producer Command Center at the top of `Do this first`.
- `OPEN_EPISODE_4_AUDIO_REVIEW.command` now opens the Producer Command Center before the stage control surface.

Validated on `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`:
- Python compile passed for START_HERE, human-listen session, goal audit, and handoff index scripts.
- START_HERE regenerated without approval, branch, render, upload, or source-media mutation.
- Human-listen session regenerated with 64 links and 0 missing.
- Goal completion audit remained 11 proved, 4 partial, 2 locked, 0 missing.
- Handoff index reported 0 missing linked artifacts.
- Readback proved the stable launcher's first `open` target is `open-producer-command-center.command`.

Safety truth remains unchanged: v006 is ready for human listening, but not approved; branch inheritance and branch rendering stay locked until a real human listen decision is recorded.

## 2026-07-11 checkpoint: START_HERE front-door invariant is smoke-tested

The Episode 4 v006 audio review runway now has a tested front-door invariant: START_HERE must put the Producer Command Center before the broader stage-control surface, and the stable launcher must open the Producer Command Center first.

Changed:
- Added `audio_workbench_review_start_here_smoke.py` to test the stable START_HERE generator against a synthetic manifest without touching real Episode 4 media.
- Updated `audio_workbench_goal_completion_audit.py` so the `Next safe action is unambiguous` requirement proves the Producer Command Center ordering instead of repeating the older listen-priority-first wording.
- Updated the audit `nextSafestStep` to begin at the Producer Command Center.

Validated:
- Python compile passed for START_HERE, START_HERE smoke, goal audit, human-listen session, and handoff index scripts.
- `audio_workbench_review_start_here_smoke.py` passed and proved the first launcher `open` target is `open-producer-command-center.command`.
- Real v006 goal audit regenerated with `11` proved, `4` partial, `2` locked, `0` missing.
- Real v006 audit now says START_HERE opens the Producer Command Center before the stage-control surface.
- Human-listen session regenerated with `64` links and `0` missing.
- Handoff index regenerated with `0` missing linked artifacts.

Safety truth remains unchanged: v006 is ready for human listening, not approved; branch inheritance and branch rendering remain locked; no original media was mutated.

## 2026-07-11 checkpoint: Producer Command Center has stable aliases and gate-visible launcher proof

The Episode 4 v006 review runway now has a stable Producer Command Center front door while still preserving timestamped command-center history.

Changed:
- `audio_workbench_producer_command_center.py` now writes stable root-level aliases:
  - `PRODUCER_COMMAND_CENTER.json`
  - `PRODUCER_COMMAND_CENTER.md`
  - `PRODUCER_COMMAND_CENTER.html`
  - `OPEN_PRODUCER_COMMAND_CENTER.command`
- Timestamped producer command-center folders are still written and registered as versioned history.
- The Producer Command Center now surfaces review-gate status, review-gate smoke status, registered launcher integrity, baseline `.command` integrity, and stable START_HERE first-open proof.
- `audio_workbench_review_gate_audit.py` now accepts the stable producer launcher name while still requiring START_HERE to open the Producer Command Center before the stage-control surface.

Validated on v006:
- Python compile passed for producer command center, START_HERE, review gate audit, review gate smoke, goal audit, human-listen session, and handoff index scripts.
- Review gate smoke passed.
- Real review gate audit passed with `0` errors and `0` warnings.
- Producer Command Center status is `ready-for-human-listen`.
- Producer Command Center stable path: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/PRODUCER_COMMAND_CENTER.html`.
- Producer Command Center versioned path: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-producer-command-center-v006-candidate-homer-preserving-clean-20260711-050912/producer-command-center.html`.
- Registered review launchers: `30`; missing or non-executable: `0`.
- Baseline `.command` files: `177`; non-executable: `0`.
- START_HERE first-open target is `OPEN_PRODUCER_COMMAND_CENTER.command`.
- Goal completion audit remains `11` proved, `4` partial, `2` locked, `0` missing.
- Human-listen session remains ready with `64` links and `0` missing.
- Handoff index reports `0` missing linked artifacts.

Safety truth remains unchanged:
- approvalStatus remains `machine-candidate-needs-human-listen-proof`.
- packageReadyForHumanListen remains `true`.
- branchInheritanceReady remains `false`.
- branchRenderReady remains `false`.
- no approval state change, branch state change, branch render, upload, publication, or original media mutation.

Meaning:
The reviewer no longer has to chase timestamped command-center artifacts. The stable START_HERE launcher opens the stable Producer Command Center, while the gate still proves executable launchers, artifact integrity, locked branch state, and honest human-listen requirements.

## 2026-07-11 checkpoint: Producer Command Center now surfaces unresolved requirements

The Episode 4 v006 Producer Command Center now exposes the current goal audit's partial and locked requirements directly in the reviewer front door.

Changed:
- `audio_workbench_producer_command_center.py` now reads the latest goal audit requirements.
- The generated JSON now includes `unresolvedRequirementCount` and `unresolvedRequirements`.
- The generated Markdown and HTML now include a `Still partial or locked` section.
- Each unresolved item shows status, artifact counts, short evidence, and the next safe action.

Validated on v006:
- Python compile passed for producer command center, START_HERE, review gate audit, review gate smoke, goal audit, human-listen session, and handoff index scripts.
- Review gate smoke passed.
- Real review gate audit passed with `0` errors and `0` warnings.
- Producer Command Center status is `ready-for-human-listen`.
- Producer Command Center has `12` primary artifacts, `12` review cards, `0` missing primary artifacts, and `6` unresolved requirements.
- The unresolved items are:
  - `partial`: Speaker-aware silence/bleed cleanup is inspectable.
  - `locked`: Edit branches inherit one clean production baseline.
  - `locked`: At least one Episode 4 long-form render uses the conformed baseline.
  - `partial`: dxRevive/manual restoration fallback is inspectable.
  - `partial`: Reusable for future noisy/outdoor Homer recordings.
  - `partial`: Workflow feels like a grown-up audio production pipeline.
- Human-listen session remains ready with `64` links and `0` missing.
- Handoff index reports `0` missing linked artifacts.

Safety truth remains unchanged:
- approvalStatus remains `machine-candidate-needs-human-listen-proof`.
- packageReadyForHumanListen remains `true`.
- branchInheritanceReady remains `false`.
- branchRenderReady remains `false`.
- no approval state change, branch state change, branch render, upload, publication, or original media mutation.

Meaning:
The front door no longer hides the edge of the system behind a separate audit file. Reviewers can see exactly what is ready, what is still partial, what is intentionally locked, and what action is safe next.

## 2026-07-11 checkpoint: unresolved requirement review workbench added

The Episode 4 v006 review runway now has a stable unresolved-requirement workbench that turns the goal audit's partial and locked items into direct reviewer action lanes.

Changed:
- Added `audio_workbench_unresolved_requirement_review.py`.
- The workbench writes stable root-level aliases:
  - `UNRESOLVED_REQUIREMENT_REVIEW.json`
  - `UNRESOLVED_REQUIREMENT_REVIEW.md`
  - `UNRESOLVED_REQUIREMENT_REVIEW.html`
  - `OPEN_UNRESOLVED_REQUIREMENT_REVIEW.command`
- Timestamped workbench folders are preserved as versioned history.
- Producer Command Center now links the unresolved workbench as a primary artifact and review card.
- START_HERE now exposes the unresolved workbench immediately after Producer Command Center.
- `OPEN_EPISODE_4_AUDIO_REVIEW.command` now opens Producer Command Center first, Unresolved Requirement Review second, then the broader stage-control surface.
- Review gate audit now requires the unresolved workbench Markdown, HTML, and open command.

Validated on v006:
- Python compile passed for unresolved workbench, producer command center, START_HERE, review gate audit, review gate smoke, goal audit, human-listen session, and handoff index scripts.
- Unresolved workbench status is `ready`.
- Unresolved workbench reports `6` unresolved requirements: `4` partial and `2` locked.
- Missing unresolved-workbench linked artifacts: `0`.
- Producer Command Center status is `ready-for-human-listen` with `13` primary artifacts, `13` review cards, and `0` missing primary artifacts.
- Review gate audit passed with `0` errors and `0` warnings.
- START_HERE stable launcher order is proven:
  - Producer Command Center index: `371`.
  - Unresolved Requirement Review index: `708`.
  - Stage Control index: `1151`.
- Human-listen session remains ready with `64` links and `0` missing.
- Handoff index reports `0` missing linked artifacts.

Safety truth remains unchanged:
- approvalStatus remains `machine-candidate-needs-human-listen-proof`.
- packageReadyForHumanListen remains `true`.
- branchInheritanceReady remains `false`.
- branchRenderReady remains `false`.
- no approval state change, branch state change, branch render, upload, publication, or original media mutation.

Meaning:
The reviewer path is now less abstract. START_HERE opens current truth first, unfinished work second, and machinery third. That keeps partial work visible without treating it as failure or approval.

## 2026-07-11 checkpoint: review launcher integrity added to gate audit

The Episode 4 v006 review gate now checks that reviewer launchers are actually usable, not just listed.

Changed:
- `audio_workbench_review_gate_audit.py` now checks manifest-registered `.command` launchers for existence and executable permission.
- The gate also checks all `.command` files under the review baseline for non-executable strays as supporting evidence.
- The gate now verifies START_HERE puts the Producer Command Center before the stage-control surface and that the stable START_HERE launcher opens `open-producer-command-center.command` first.
- `audio_workbench_review_gate_audit_smoke.py` still proves the gate accepts the safe locked package and rejects unsafe/missing states.

Validated on v006:
- Review gate smoke passed.
- Real review gate audit passed with `0` errors and `0` warnings.
- Registered review launchers: `29`; missing/non-executable: `0`.
- Baseline `.command` files: `152`; non-executable: `0`.
- START_HERE Producer Command Center ordering check passed.
- Stable START_HERE first-open target is `open-producer-command-center.command`.
- Goal completion audit remains `11` proved, `4` partial, `2` locked, `0` missing.
- Human-listen session remains ready with `64` links and `0` missing.
- Handoff index reports `0` missing linked artifacts.

Safety truth remains unchanged: v006 is ready for human listening, not approved; branch inheritance and branch rendering remain locked; no original media was mutated.

## 2026-07-11 checkpoint: audio production doctrine added

The Episode 4 v006 audio workbench now has a stable production-doctrine surface that turns the current rescue workflow into a reusable operating manual for future noisy/outdoor recordings.

Changed:
- Added `audio_workbench_production_doctrine.py`.
- The doctrine writes stable root-level aliases:
  - `AUDIO_PRODUCTION_DOCTRINE.json`
  - `AUDIO_PRODUCTION_DOCTRINE.md`
  - `AUDIO_PRODUCTION_DOCTRINE.html`
  - `OPEN_AUDIO_PRODUCTION_DOCTRINE.command`
- Timestamped doctrine folders remain versioned history.
- Producer Command Center now includes the doctrine as a primary artifact and review card.
- START_HERE now opens the review ladder in this order: Producer Command Center, Unresolved Requirement Review, Audio Production Doctrine, Stage Control Surface.
- Review gate audit now requires the doctrine Markdown, HTML, and open command.
- Goal completion audit now treats the doctrine as evidence for dxRevive fallback, reusable noisy/outdoor recording workflow, and grown-up pipeline readiness.

Validated on v006:
- Python compile passed for the touched scripts.
- Audio production doctrine status is `ready-with-human-listen-lock`.
- Doctrine stages: `6`; missing stage artifacts: `0`.
- Producer Command Center status is `ready-for-human-listen` with `14` primary artifacts, `14` review cards, and `0` missing primary artifacts.
- Review gate audit passed with `0` errors and `0` warnings.
- START_HERE stable order is proven:
  - Producer Command Center index: `593`.
  - Unresolved Requirement Review index: `1150`.
  - Audio Production Doctrine index: `1678`.
  - Stage Control Surface index: `2229`.
- Goal completion audit remains honest: `11` proved, `4` partial, `2` locked, `0` missing.
- Human-listen session remains ready with `64` links and `0` missing.
- Handoff index reports `0` missing linked artifacts.

Safety truth remains unchanged:
- approvalStatus remains `machine-candidate-needs-human-listen-proof`.
- packageReadyForHumanListen remains `true`.
- branchInheritanceReady remains `false`.
- branchRenderReady remains `false`.
- no approval state change, branch state change, branch render, upload, publication, or original media mutation.

Meaning:
The audio workflow now has a reusable doctrine instead of only a pile of artifacts. Future noisy/outdoor Homer recordings can start from a named professional chain: source inventory, sync truth, speaker-aware cleanup, dxRevive/manual restoration fallback, mix/master, human listen, and branch inheritance. The doctrine reduces future bespoke rescue work without pretending v006 has passed human ears.

## 2026-07-11 checkpoint: doctrine is part of the human review handoff

The Episode 4 v006 audio production doctrine is now included in both the human-listen session and the review handoff index. This keeps the reusable noisy/outdoor audio workflow visible at the same layer where a human reviewer decides whether the candidate is ready.

Validated state:
- Human-listen session: 68 links, 0 missing, 2 doctrine links.
- Handoff index: 187 artifacts, 0 missing, 3 doctrine artifacts.
- Review gate: passed with 0 errors and 0 warnings.
- Goal audit: 11 proved, 4 partial, 2 locked, 0 missing.

Locked truth remains unchanged: v006 is machine-candidate ready for human listen, not approved, and branch rendering remains locked.

## 2026-07-11 checkpoint: speaker cleanup decision matrix

Episode 4 v006 now includes a stable Speaker Cleanup Decision Matrix at the review layer. It joins cleanup windows, A/B proof snippets, speaker contribution markers, preservation proof, pass/fail bars, and scoped repair actions into one surface.

Validated state:
- Matrix status: ready-for-human-listen.
- Windows/snippets/missing snippets: 15 / 90 / 0.
- Related evidence: 22 contribution markers and 1 preservation item.
- Producer Command Center: 15 primary artifacts, 15 review cards, 0 missing.
- Human-listen session: 70 links, 0 missing, matrix links present.
- Handoff index: 190 artifacts, 0 missing, 3 matrix artifacts.
- Review gate: passed with 0 errors and 0 warnings.

Locked truth remains unchanged: v006 is machine-candidate ready for human listen, not approved, and branch rendering remains locked.

## 2026-07-11 checkpoint: dxRevive return workbench added

The Episode 4 v006 audio review runway now has a stable dxRevive Return Workbench. It consolidates the manual bounce packet, return folder, bounce validation, validator smoke, proof candidate planner, and planner smoke into one reviewer/agent surface.

Changed:
- Added `audio_workbench_dxrevive_return_workbench.py`.
- Stable aliases now exist at the v006 root:
  - `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/DXREVIVE_RETURN_WORKBENCH.json`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/DXREVIVE_RETURN_WORKBENCH.md`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/DXREVIVE_RETURN_WORKBENCH.html`
  - `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/OPEN_DXREVIVE_RETURN_WORKBENCH.command`
- Producer Command Center now includes the return workbench as a primary artifact and review card input.
- START_HERE now links the return workbench between the manual bounce packet and the raw validation/planner reports.
- Human-listen session now carries return workbench HTML and open-command links.
- Handoff index now carries return workbench Markdown, HTML, and open-command artifacts.
- Goal audit now includes return workbench evidence in the dxRevive/manual fallback requirement.

Current dxRevive truth:
- Return workbench status: `waiting-for-bounces`.
- Expected returned bounces: `3`.
- Validated returned bounces: `0`.
- Missing returned bounces: `3`.
- This is correct and honest: no dxRevive-returned audio has entered v006.

Validation:
- Python compile passed for all touched scripts.
- Return workbench generated and registered.
- Producer Command Center reports ready-for-human-listen with no missing primary artifacts.
- Human-listen session and handoff index report no missing linked artifacts.
- Review gate audit passes with `0` errors and `0` warnings.
- Goal completion audit remains honest: `11` proved, `4` partial, `2` locked, `0` missing.

Current truth remains unchanged:
- approvalStatus: `machine-candidate-needs-human-listen-proof`.
- packageReadyForHumanListen: `true`.
- branchInheritanceReady: `false`.
- branchRenderReady: `false`.
- no approval state change, branch state change, branch render, upload, publication, or original media mutation.

Meaning:
The dxRevive/manual restoration fallback is now easier to reason about without turning it into hidden magic. A reviewer can see exactly which returned bounces are expected, where they go, why none are currently validated, and what must happen before any restored stem can influence a proof candidate.

## Technical audition layer

Episode 4 v006 now includes a non-destructive `Audio Technical Audition Audit` before branch inheritance. It reads the mastered audio spine and produces a producer-facing section map for:

- channel balance drift,
- quiet-floor behavior,
- sustained loudness or fatigue-risk sections,
- long quiet or muted stretches,
- first listen-priority sections.

Primary artifact:
`AUDIO_TECHNICAL_AUDITION_AUDIT.html`

The audit is registered in `manifest.json` and surfaced in the Producer Command Center. It is a visibility and targeting tool, not an approval system. A human listen pass or explicit future review standard is still required before branch inheritance and render unlock.

### Technical audition snippets

The technical audition layer now has a playable proof surface:

`AUDIO_TECHNICAL_AUDITION_SNIPPET_PACK.html`

This pack renders short derived M4A snippets from the technical audition's highest-priority listen sections. It exists so reviewers and agents do not have to scrub the full master to evaluate channel balance, quiet-floor behavior, fatigue-risk sections, or underpowered speech candidates.

Safety rule: these snippets are review media only. They do not approve the master, unlock branch inheritance, render edit branches, upload, publish, or mutate source media.

### Technical audition notes roundtrip

The technical audition snippet pack now supports inline review notes and JSON export. Exported notes use:

`quipsly.audio-workbench.technical-audition-snippet-notes.v1`

The return path is:

1. Open `AUDIO_TECHNICAL_AUDITION_SNIPPET_PACK.html`.
2. Mark each clip as pass, needs focused proof, or needs repair.
3. Export technical audition notes JSON.
4. Run `audio_workbench_technical_audition_notes_inbox.py` or the standard `PROCESS_EPISODE_4_AUDIO_REVIEW_NOTES.command`.
5. Inspect the unified post-review action queue before any repair work.

Safety rule: technical audition notes can create pass context, focused-proof actions, or scoped repair actions. They cannot approve the full master, unlock branch inheritance, render edit branches, upload, publish, or mutate original media.

## Audio runway state readback

The stable audio review runway now has a single non-mutating current-state report:

- Script: `apps/QuipslyStudio/script/audio_workbench_runway_state.py`
- Stable JSON: `AUDIO_RUNWAY_STATE.json`
- Stable Markdown: `AUDIO_RUNWAY_STATE.md`
- Stable HTML: `AUDIO_RUNWAY_STATE.html`
- Stable launcher: `OPEN_AUDIO_RUNWAY_STATE.command`

The runway state rolls up approval status, package readiness, review gate status, human approval preflight, unresolved requirement review, producer command center health, handoff health, goal-audit counts, post-review queue counts, required artifacts, blockers, and the next safe action.

For Episode 4 v006 on 2026-07-11, the current generated status was `ready-for-human-listen-notes`: review gate passed with zero errors, required runway artifacts existed, package review stayed ready, branch inheritance stayed locked, branch render stayed locked, and original media mutation remained false.

This report is a readback surface only. It must never approve audio, fail audio, unlock branches, render branches, upload files, publish externally, change approval state, change branch state, or mutate original media.

## Listen proof coverage map checkpoint

Episode 4 v006 now has a stable listen-proof coverage map for the human review runway.

- Generator: `apps/QuipslyStudio/script/audio_workbench_listen_proof_coverage_map.py`
- Stable artifacts: `LISTEN_PROOF_COVERAGE_MAP.json`, `LISTEN_PROOF_COVERAGE_MAP.md`, `LISTEN_PROOF_COVERAGE_MAP.html`, and `OPEN_LISTEN_PROOF_COVERAGE_MAP.command` in the v006 baseline folder.
- Purpose: map the remaining partial/locked goal-audit requirements to the exact proof surfaces a reviewer should open before writing listen notes.
- Current validation: `ready-for-human-listen-proof`, four minimum listen steps, six remaining requirement mappings, and zero missing artifacts.
- Safety: this does not approve audio, fail audio, unlock branch inheritance, render branches, upload, publish, or mutate original media.
- Operating rule: human listen proof remains the next gate. If it passes, branch inheritance/render work can proceed. If it fails, create a scoped v007 repair candidate instead of overwriting v006.

## Reviewer notes packet front-door checkpoint

Episode 4 v006 now exposes the reviewer-notes packet as a first-class review artifact instead of a hidden Markdown utility.

- Generator: `apps/QuipslyStudio/script/audio_workbench_reviewer_notes_packet.py`
- Stable artifacts: `REVIEWER_NOTES_TEMPLATE.json`, `REVIEWER_NOTES_TEMPLATE.md`, `REVIEWER_NOTES_TEMPLATE.html`, and `OPEN_REVIEWER_NOTES_TEMPLATE.command` in the v006 baseline folder.
- Purpose: give a human reviewer one durable place to capture or import listen notes before any guarded pass/fail/needs-proof decision is recorded.
- Front-door wiring: Producer Command Center, START_HERE, human-listen session, handoff index, review gate audit, and goal-completion audit workflow evidence now include the reviewer-notes template.
- Current validation: Producer Command Center `ready-for-human-listen` with 24 primary artifacts, 23 review cards, and zero missing primary artifacts; review gate passed with zero errors and zero warnings.
- Safety: the notes packet does not approve audio, fail audio, unlock branches, render branches, upload, publish, or mutate original media.

Operating rule: after a real listen, route exported notes through the existing guarded decision/import scripts. Do not treat the presence of the notes template as human approval.

## Branch inheritance gate front-door checkpoint

Episode 4 v006 now exposes branch inheritance as a stable review artifact instead of only a timestamped technical report.

- Generator: `apps/QuipslyStudio/script/audio_workbench_branch_gate.py`
- Stable artifacts: `BRANCH_INHERITANCE_GATE.json`, `BRANCH_INHERITANCE_GATE.md`, `BRANCH_INHERITANCE_GATE.html`, and `OPEN_BRANCH_INHERITANCE_GATE.command` in the v006 baseline folder.
- Current status: `blocked-waiting-for-human-listen-proof`.
- Purpose: prove whether long-form and shorts edit branches may inherit the mastered audio spine. Before human approval, this gate should stay blocked.
- Front-door wiring: Producer Command Center, START_HERE, human-listen session, handoff index, review gate audit, and goal-completion audit now include the stable branch gate.
- Current validation: Producer Command Center `ready-for-human-listen` with 25 primary artifacts, 24 review cards, and zero missing primary artifacts; review gate passed with zero errors and zero warnings.
- Safety: the gate does not render, upload, publish, or mutate original media. In the current pending-listen state it also leaves `branchInheritanceReady=false`.

Operating rule: after a real human listen approval is recorded through the guarded decision path, regenerate this gate before rendering long-form or shorts branches. Do not hand-edit branch readiness.

## Branch render preflight front-door checkpoint

Episode 4 v006 now exposes branch-render readiness as a stable front-door artifact before any production render is allowed.

- Generator: `apps/QuipslyStudio/script/audio_workbench_branch_render_preflight.py`
- Stable artifacts: `BRANCH_RENDER_PREFLIGHT.json`, `BRANCH_RENDER_PREFLIGHT.md`, `BRANCH_RENDER_PREFLIGHT.html`, and `OPEN_BRANCH_RENDER_PREFLIGHT.command` in the v006 baseline folder.
- Current status: `blocked-before-branch-render`.
- Current blockers: `3`.
- Current render truth: `canRenderBranches=false`, `branchRenderReady=false`, and `branchInheritanceReady=false`.
- Purpose: show the exact post-approval render route for long-form and shorts branches without allowing real branch renders before human listen proof and branch inheritance approval.
- Front-door wiring: Producer Command Center, START_HERE, human-listen session, handoff index, review gate audit, and goal-completion audit now include the stable branch-render preflight.
- Current validation: Producer Command Center `ready-for-human-listen` with `26` primary artifacts, `25` review cards, and `0` missing primary artifacts; review gate passed with `0` errors and `0` warnings; goal audit remains `11` proved, `4` partial, `2` locked, and `0` missing.
- Safety: this checkpoint does not approve audio, fail audio, unlock branch inheritance, render branches, upload, publish, or mutate original media.

Operating rule: after a real human listen approval is recorded and the branch inheritance gate regenerates cleanly, rerun this preflight before any render executor is allowed to produce long-form or shorts branch media. Do not hand-edit branch render readiness.

## Human listen decision front-door checkpoint

Episode 4 v006 now has a stable decision-routing surface for the exact moment after a real human listen.

- Generator: `apps/QuipslyStudio/script/audio_workbench_human_listen_decision_front_door.py`
- Stable artifacts: `HUMAN_LISTEN_DECISION_FRONT_DOOR.json`, `HUMAN_LISTEN_DECISION_FRONT_DOOR.md`, `HUMAN_LISTEN_DECISION_FRONT_DOOR.html`, and `OPEN_HUMAN_LISTEN_DECISION_FRONT_DOOR.command` in the v006 baseline folder.
- Current status: `ready-for-human-listen-decision`.
- Missing required decision artifacts: `0`.
- Purpose: gather the human listen path, reviewer notes route, dry-run decision bridge, guarded approve/fail/needs-proof commands, and post-decision gate refresh commands into one durable surface.
- Front-door wiring: Producer Command Center, START_HERE, human-listen session, handoff index, review gate audit, and goal-completion audit now include this decision front door.
- Current validation: Producer Command Center `ready-for-human-listen` with `27` primary artifacts, `26` review cards, and `0` missing primary artifacts; human-listen session `92` links with `0` missing; review gate passed with `0` errors and `0` warnings; goal audit remains `11` proved, `4` partial, `2` locked, and `0` missing.
- Safety: this front door does not approve audio, fail audio, unlock branch inheritance, render branches, upload, publish, or mutate original media.

Operating rule: use this page only after listening. Dry-run imported notes first. Record a real decision only with the guarded `--confirm-human-listened` path. If approval is recorded, regenerate branch inheritance and branch-render preflight before any render. If the listen fails, preserve v006 and create a scoped v007 repair candidate.

## Human listen decision front-door smoke checkpoint

Episode 4 v006 now has a smoke test for the stable human-listen decision front door.

- Smoke script: `apps/QuipslyStudio/script/audio_workbench_human_listen_decision_front_door_smoke.py`
- Purpose: prove the front door is linked, has required commands, dry-runs imported notes through the guarded decision bridge, rejects approval without `--confirm-human-listened`, and preserves the real baseline's approval/branch truth.
- Output artifacts are registered as `latestHumanListenDecisionFrontDoorSmoke` and `latestHumanListenDecisionFrontDoorSmokeMarkdown`.
- Front-door wiring: Producer Command Center, START_HERE, human-listen session, handoff index, review gate audit, and goal-completion audit now include the smoke result.
- Safety: this smoke does not approve audio, fail audio, unlock branch inheritance, render branches, upload, publish, or mutate original media.

Operating rule: treat a passing smoke as route confidence only. It is not human approval. Branch inheritance and branch rendering remain locked until a real human listen decision is recorded.

## Approval-path sandbox smoke checkpoint

Episode 4 v006 now exposes the post-approval branch route as a stable sandbox smoke instead of a timestamp-only artifact.

- Smoke script: `apps/QuipslyStudio/script/audio_workbench_approval_path_smoke.py`
- Stable artifacts: `APPROVAL_PATH_SMOKE.json`, `APPROVAL_PATH_SMOKE.md`, and `OPEN_APPROVAL_PATH_SMOKE.command` in the v006 baseline folder.
- Purpose: copy the manifest into a sandbox, record approval only there, refresh branch inheritance and branch-render preflight only there, prove approved render commands would be exposed there, and verify the real v006 manifest stays locked.
- Front-door wiring: Producer Command Center, START_HERE, human-listen session, handoff index, review gate audit, and goal-completion audit now include the stable smoke.
- Safety: this smoke does not approve the real audio, unlock real branch inheritance, unlock real branch rendering, render branches, upload, publish, or mutate original media.

Operating rule: after a real human listen pass, use the guarded decision route on the real baseline, regenerate branch inheritance and branch-render preflight, then use the approved branch-render executor. Until then, the sandbox smoke proves route readiness only.

<!-- audio-transformation-lineage-ledger-smoke-checkpoint:start -->
## Latest v006 transformation lineage ledger smoke checkpoint

Generated on 2026-07-11 for `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`.

- Stable transformation lineage ledger: `AUDIO_TRANSFORMATION_LINEAGE_LEDGER.md` / `AUDIO_TRANSFORMATION_LINEAGE_LEDGER.html`.
- Stable transformation lineage smoke: `AUDIO_TRANSFORMATION_LINEAGE_LEDGER_SMOKE.md`.
- Smoke status: `passed=true`, scenarios `2`, failures `0`.
- Scenario coverage: a complete synthetic lineage baseline stays complete with `8` stages and `0` missing evidence; a missing-evidence synthetic baseline keeps the missing proof visible instead of pretending the chain is complete.
- Real v006 guardrails held: approval status remained `machine-candidate-needs-human-listen-proof`, `branchInheritanceReady=false`, `branchRenderReady=false`, no branch render/upload/publication attempt, and original media mutation stayed `false`.
- Front-door wiring refreshed: Producer Command Center, START_HERE, human-listen session, handoff index, review gate audit, and goal completion audit now expose or require the lineage ledger and its smoke evidence.

This checkpoint makes the audio chain more agent-transparent: before a future repair, Codex should use the lineage ledger to route the symptom to the owning stage instead of rerunning the whole audio pipeline by superstition.
<!-- audio-transformation-lineage-ledger-smoke-checkpoint:end -->

## 2026-07-11 review gate manifest readback checkpoint

The Episode 4 v006 audio review gate now writes stable latest-state readback fields directly into `manifest.json`, so future agents and tools do not need to chase timestamped audit files to answer the basic gate question.

Changed script:

- `apps/QuipslyStudio/script/audio_workbench_review_gate_audit.py`

Validated current state:

- `audioReviewGateAuditLatestStatus=passed`
- `audioReviewGateAuditLatestPassed=true`
- `audioReviewGateAuditLatestErrorCount=0`
- `audioReviewGateAuditLatestWarningCount=0`
- Latest review gate markdown is registered in `audioReviewGateAuditLatestMarkdown`.
- Goal audit remains honest: `11` proved, `4` partial, `2` locked, `0` missing.

Guardrails remain unchanged:

- `approvalStatus=machine-candidate-needs-human-listen-proof`
- `packageReadyForHumanListen=true`
- `branchInheritanceReady=false`
- `branchRenderReady=false`
- no branch render, upload, publication, or original media mutation

Meaning: the current package is machine-coherent and ready for human listen proof, but the branch/render locks stay closed until the human approval path records a real listen decision.

## 2026-07-11 front-door manifest health readback checkpoint

The Episode 4 v006 audio front-door surfaces now write stable health counts directly into `manifest.json`.

Changed scripts:

- `apps/QuipslyStudio/script/audio_workbench_producer_command_center.py`
- `apps/QuipslyStudio/script/audio_workbench_human_listen_session.py`
- `apps/QuipslyStudio/script/audio_workbench_review_handoff_index.py`

Validated current state:

- `audioCommandCenterLatestStatus=ready-for-human-listen`
- `audioCommandCenterPrimaryArtifactCount=30`
- `audioCommandCenterMissingPrimaryArtifactCount=0`
- `humanListenSessionLatestStatus=ready`
- `humanListenSessionLinkCount=99`
- `humanListenSessionMissingLinkCount=0`
- `reviewHandoffIndexLatestStatus=complete`
- `reviewHandoffIndexArtifactCount=224`
- `reviewHandoffIndexMissingArtifactCount=0`
- Review gate remains `passed`, errors `0`, warnings `0`.
- Goal audit remains `11` proved, `4` partial, `2` locked, `0` missing.

Guardrails remain unchanged:

- `approvalStatus=machine-candidate-needs-human-listen-proof`
- `packageReadyForHumanListen=true`
- `branchInheritanceReady=false`
- `branchRenderReady=false`
- no branch render, upload, publication, or original media mutation

Meaning: future agents can now inspect the manifest for the current reviewer front-door health without parsing nested command-center entries or timestamped handoff/session reports.

## 2026-07-11 unresolved and runway manifest readback checkpoint

The Episode 4 v006 unresolved requirement review and audio runway state now write stable top-level readback fields into `manifest.json`.

Changed scripts:

- `apps/QuipslyStudio/script/audio_workbench_unresolved_requirement_review.py`
- `apps/QuipslyStudio/script/audio_workbench_runway_state.py`

Validated current state:

- `audioUnresolvedRequirementReviewLatestStatus=ready`
- `audioUnresolvedRequirementReviewUnresolvedCount=6`
- `audioUnresolvedRequirementReviewPartialCount=4`
- `audioUnresolvedRequirementReviewLockedCount=2`
- `audioUnresolvedRequirementReviewMissingArtifactCount=0`
- `audioRunwayStateLatestStatus=ready-for-human-listen-notes`
- `audioRunwayStateReviewGatePassed=true`
- `audioRunwayStateReadyForHumanDecision=true`
- `audioRunwayStateUnresolvedRequirementCount=6`
- `audioRunwayStatePartialRequirementCount=4`
- `audioRunwayStateLockedRequirementCount=2`
- `audioRunwayStateUnresolvedMissingArtifactCount=0`
- `audioRunwayStateHandoffMissingLinkedArtifactCount=0`
- Review gate remains `passed`, errors `0`, warnings `0`.
- Goal audit remains `11` proved, `4` partial, `2` locked, `0` missing.

Guardrails remain unchanged:

- `approvalStatus=machine-candidate-needs-human-listen-proof`
- `packageReadyForHumanListen=true`
- `branchInheritanceReady=false`
- `branchRenderReady=false`
- no branch render, upload, publication, or original media mutation

Meaning: the honest edge of the goal is now visible from the manifest and runway state. The remaining partials are review/listen/reuse lanes, and the locked items are intentionally waiting for real human listen proof.

## 2026-07-11 - Manifest readback consistency smoke

Added a non-mutating `audio_workbench_manifest_readback_consistency_smoke.py` pass for the Episode 4 v006 candidate baseline. This smoke treats the baseline manifest as the control-plane API for humans and agents, then verifies its promoted top-level fields still agree with the latest command center, human listen session, handoff index, unresolved requirement review, runway state, review gate, goal audit, and transformation-lineage smoke reports.

Current validated result:

- Baseline: `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`
- Status: `passed`
- Checks: `42`
- Failures: `0`
- Review gate: `passed`, `0` errors, `0` warnings
- Goal audit: `11` proved, `4` partial, `2` locked, `0` missing
- Package ready for human listen: `true`
- Approval status remains `machine-candidate-needs-human-listen-proof`
- Branch inheritance remains `false`
- Branch render remains `false`

Safety result: this smoke did not approve audio, unlock branches, render media, upload, publish, or mutate original media. Its purpose is control-plane truth: if a reviewer page says ready, the manifest readback fields and source reports must say the same thing.

Stable artifacts:

- `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/AUDIO_MANIFEST_READBACK_CONSISTENCY_SMOKE.md`
- `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/AUDIO_MANIFEST_READBACK_CONSISTENCY_SMOKE.html`
- `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/OPEN_AUDIO_MANIFEST_READBACK_CONSISTENCY_SMOKE.command`


## 2026-07-11 - Speaker cleanup triage board

Added a symptom-first review board for the Episode 4 v006 candidate speaker cleanup lane. This does not replace the speaker cleanup decision matrix or proof pack; it sits on top of them as the fast human/agent review cockpit for deciding whether v006 passes, needs focused proof, or needs a scoped v007 repair.

Current validated result:

- Baseline: `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`
- Triage status: `ready-for-human-triage`
- Review windows: `15`
- Must-listen windows: `15`
- Missing snippets: `0`
- Missing evidence: `0`
- Review gate: `passed`, `0` errors, `0` warnings
- Manifest readback consistency smoke: `passed`, `42` checks, `0` failures
- Goal audit: `11` proved, `4` partial, `2` locked, `0` missing
- Approval status remains `machine-candidate-needs-human-listen-proof`
- Branch inheritance remains `false`
- Branch render remains `false`

Stable artifacts:

- `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/SPEAKER_CLEANUP_TRIAGE_BOARD.md`
- `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/SPEAKER_CLEANUP_TRIAGE_BOARD.html`
- `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/SPEAKER_CLEANUP_TRIAGE_NOTES_TEMPLATE.json`
- `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/OPEN_SPEAKER_CLEANUP_TRIAGE_BOARD.command`

Safety result: this board did not render audio, approve audio, unlock branches, upload, publish, or mutate original media. It only joins existing proof snippets and evidence into a clearer pass/fail review surface.


## 2026-07-11 checkpoint: speaker-cleanup triage notes inbox

Added a safe return path for exported speaker-cleanup triage-board notes:

- `audio_workbench_speaker_cleanup_triage_notes_inbox.py` finds exported triage notes for the current baseline, classifies them as pending, proof-needed, scoped repair, or focused pass, and dry-runs the guarded listen-decision route.
- `audio_workbench_speaker_cleanup_triage_notes_inbox_smoke.py` proves the inbox against no-notes, all-pass, proof-needed, repair-needed, and wrong-baseline packets.
- The producer command center now lists the triage notes inbox and smoke artifacts.
- The review gate now requires the triage notes inbox and smoke artifact, verifies smoke success, and verifies that the inbox did not approve, unlock, render, upload, publish, or mutate original media.
- The goal completion audit now includes the triage notes inbox and smoke in its evidence set.

Validation on the current Episode 4 v006 candidate:

- Review gate: passed, 0 errors, 0 warnings.
- Manifest readback consistency smoke: passed, 42 checks, 0 failures.
- Goal audit remains honest: 11 proved, 4 partial, 2 locked, 0 missing.
- v006 remains `machine-candidate-needs-human-listen-proof`; branch inheritance and branch render remain locked.

This creates a cleaner reviewer loop without pretending focused speaker-cleanup notes are full audio approval.

## 2026-07-11 checkpoint: Studio Sound Control Room

Added a review-only audio microscope for the Episode 4 v006 candidate:

- `audio_workbench_studio_sound_control_room.py` creates a stable `STUDIO_SOUND_CONTROL_ROOM.html`, JSON, Markdown, and open command.
- It samples priority windows from the speaker cleanup triage board, technical audition audit, and whole-master anchor points.
- For each window it records local metrics: RMS dBFS, peak dBFS, crest factor, left-right RMS delta, active ratio, quiet ratio, and risk flags.
- For each window it renders derived review-only M4A snippets, waveform SVGs, and spectrogram PNGs.
- The Producer Command Center now surfaces the Studio Sound Control Room as a primary artifact and review card.
- The Review Gate now requires the control room and verifies it is present, populated, and non-mutating.
- The Goal Completion Audit now includes it as part of the current evidence ledger.

Research basis used for this direction:

- Apple Podcasts emphasizes audible speech, consistent levels, and avoiding distortion in podcast audio requirements.
- Spotify documents playback loudness normalization around `-14 dB LUFS` using ITU 1770 measurement.
- EBU R 128 is a broadcast loudness reference point built around integrated loudness and true-peak discipline.
- Descript Studio Sound, Adobe Enhance Speech, Riverside noise reduction, and Auphonic all point toward a modern workflow where AI cleanup is useful, but should be paired with visible review, level management, multitrack awareness, and proof listening.

Validation on the current Episode 4 v006 candidate:

- Studio Sound Control Room: `ready-for-studio-sound-review`.
- Window count: `24`.
- Snippets rendered: `24`.
- Spectrograms rendered: `24`.
- Machine-risk windows: `1`.
- Producer Command Center: ready for human listen, `35` primary artifacts, `0` missing.
- Review gate: passed, `0` errors, `0` warnings.
- Manifest readback consistency smoke: passed, `42` checks, `0` failures.
- Goal audit remains honest: `11` proved, `4` partial, `2` locked, `0` missing.

Safety remains intact:

- v006 approval status is still `machine-candidate-needs-human-listen-proof`.
- `branchInheritanceReady=false`.
- `branchRenderReady=false`.
- No approval, branch unlock, branch render, upload, publication, or original-media mutation happened.

This makes the current master more transparent as sound, not just as a collection of files and gate reports. Next safe use is to listen to the control-room windows and route any real symptom to a scoped v007 repair at the owning audio stage.

## 2026-07-11 checkpoint: Studio Sound Repair Planner

Added a safe repair-planning layer on top of the Studio Sound Control Room:

- `audio_workbench_studio_sound_repair_planner.py` converts machine-visible sound flags into scoped, stage-owned next actions.
- `audio_workbench_studio_sound_repair_planner_smoke.py` proves planner routing for no flags, intro quiet, near-peak, channel imbalance, dense audio, and unknown flags.
- The Producer Command Center now surfaces the repair planner and smoke as primary artifacts/review cards.
- The Review Gate now requires the planner and smoke, and checks that both preserve approval, branch, render, upload, publication, and original-media safety.
- The Goal Completion Audit now includes the planner artifacts in the evidence ledger.

Validation on the current Episode 4 v006 candidate:

- Studio Sound Repair Planner status: `ready-for-scoped-sound-repair-triage`.
- Planned actions: `1`.
- Proof-window actions: `0`.
- Edit-boundary actions: `1`.
- Current machine flag routes to `intro-quiet-trim-or-fade-review`, not a full audio rerender.
- Planner smoke passed `6` scenarios with `0` failures.
- Producer Command Center: ready for human listen, `37` primary artifacts, `0` missing.
- Human listen session: `99` links, `0` missing.
- Review gate: passed, `0` errors, `0` warnings.
- Manifest readback consistency smoke: passed, `42` checks, `0` failures.
- Goal audit remains honest: `11` proved, `4` partial, `2` locked, `0` missing.

Safety remains intact:

- v006 approval status is still `machine-candidate-needs-human-listen-proof`.
- `branchInheritanceReady=false`.
- `branchRenderReady=false`.
- No approval, branch unlock, branch render, upload, publication, or original-media mutation happened.

Meaning: the first machine-visible sound issue is probably an opening edit/fade/trim question, not a mastering failure. Future confirmed symptoms can now be routed to the owning stage before any scoped v007 proof-window repair is attempted.

## 2026-07-11 checkpoint: Studio Sound manifest readback hardening

The manifest readback consistency smoke now covers the Studio Sound Control Room and Studio Sound Repair Planner surfaces.

What changed:

- `audio_workbench_manifest_readback_consistency_smoke.py` now verifies Control Room artifact presence, promoted window/snippet/spectrogram/risk counts, and non-mutating safety booleans.
- It also verifies Repair Planner artifact presence, planner action counts, planner smoke counts, and non-mutating safety booleans.
- The smoke is intentionally still a control-plane readback test. It does not approve audio, unlock branch inheritance, render episode media, upload, publish, or mutate originals.

Current Episode 4 v006 validation:

- Manifest readback consistency smoke: `passed`, `105` checks, `0` failures.
- Review gate audit: `passed`, `0` errors, `0` warnings.
- Goal completion audit: `11` proved, `4` partial, `2` locked, `0` missing.
- Approval status remains `machine-candidate-needs-human-listen-proof`.
- Branch inheritance and branch render remain locked until real human listen proof exists.

This closes a control-plane blind spot: the manifest now proves that the newer studio-sound inspection and repair-planning layers are current, present, and safe before a reviewer or agent trusts the runway.

## 2026-07-11 checkpoint: Studio Sound notes roundtrip

The Studio Sound Control Room now has a notes template and a safe notes inbox.

What changed:

- `audio_workbench_studio_sound_control_room.py` writes `STUDIO_SOUND_NOTES_TEMPLATE.json` alongside the control-room report.
- `audio_workbench_studio_sound_notes_inbox.py` finds exported Studio Sound notes, classifies pass/proof/repair/pending decisions, and emits safe `reviewActions` for the unified post-review queue.
- `audio_workbench_studio_sound_notes_inbox_smoke.py` proves no-notes, all-pass, needs-proof, needs-repair, and wrong-baseline behavior.
- The Producer Command Center, Review Gate Audit, Manifest Readback Consistency Smoke, Post-review Action Queue, and Goal Completion Audit now know about the Studio Sound notes path.

Current Episode 4 v006 validation:

- Studio Sound Notes Inbox: `notes-found`, `1` pending template candidate, `studio-sound-notes-incomplete`.
- Studio Sound Notes Inbox Smoke: passed `5` scenarios, `0` failures.
- Post-review action queue: `1` source with notes candidate, `0` repair actions, `0` focused-proof actions, `0` pass-context actions.
- Manifest readback consistency smoke: `passed`, `145` checks, `0` failures.
- Review gate audit: `passed`, `0` errors, `0` warnings.
- Goal completion audit: `11` proved, `4` partial, `2` locked, `0` missing.

Safety remains unchanged: no approval, branch unlock, branch render, upload, publication, or original-media mutation. Studio Sound notes are focused QA evidence, not full-spine approval.

## 2026-07-11 checkpoint: post-review queue is control-plane truth

The Episode 4 v006 workflow now treats the unified post-review action queue as a control-plane artifact, not merely a generated Markdown board.

Why this matters:

- All exported notes paths should converge into one board for repair actions, focused-proof actions, and pass/context notes.
- Future agents should not chase scattered notes inboxes first when deciding the next safe move.
- The manifest must expose whether the queue is current enough to trust.
- The review gate must fail if the queue or its required Mission Board/Reel inputs disappear.

Current contract:

- `audio_workbench_post_review_action_queue.py` promotes queue status, source-with-notes count, action counts, and safety flags into `manifest.json`.
- `audio_workbench_manifest_readback_consistency_smoke.py` verifies those promoted fields against the latest queue report.
- `audio_workbench_review_gate_audit.py` requires the Human Listen Mission Board, Human Listen Mission Reel, Mission Reel notes path, and post-review action queue artifacts.
- The same gate verifies the queue is `ready-for-review-actions` and non-mutating.

Current Episode 4 v006 validation:

- Real post-review queue: `sourceWithNotesCandidateCount=2`, `repairActionCount=0`, `focusedProofActionCount=0`, `passContextCount=0`.
- Manifest readback smoke: `243` checks, `0` failures.
- Review gate audit: `0` errors, `0` warnings.
- Producer Command Center: `45` primary artifacts, `36` review cards, `0` missing primary artifacts.
- Goal audit remains honest: `11` proved, `4` partial, `2` locked, `0` missing.

Safety remains unchanged: this queue does not approve audio, unlock branch inheritance, unlock branch rendering, render episode media, upload, publish, or mutate original media. Human listen proof is still the gate. If the listen passes, record the decision through the guarded human-listen route and regenerate branch gates. If the listen fails, use the post-review queue to choose the smallest scoped v007 repair or focused-proof path.

## 2026-07-11: Speaker cleanup acceptance board checkpoint

Episode 4 v006 now includes a speaker cleanup acceptance board. This is the bridge between machine proof and human listen approval: it says whether the speaker-aware cleanup evidence is complete enough to ask for ears, while keeping v006 unapproved and branch rendering locked.

Added:

- `apps/QuipslyStudio/script/audio_workbench_speaker_cleanup_acceptance_board.py`
- Stable artifacts in the v006 baseline folder:
  - `SPEAKER_CLEANUP_ACCEPTANCE_BOARD.json`
  - `SPEAKER_CLEANUP_ACCEPTANCE_BOARD.md`
  - `SPEAKER_CLEANUP_ACCEPTANCE_BOARD.html`
  - `OPEN_SPEAKER_CLEANUP_ACCEPTANCE_BOARD.command`

Latest result:

- Status: `machine-evidence-ready-human-listen-required`
- Machine checks: `9 / 9` passed
- Missing artifacts: `0`
- Missing snippets: `0`
- Must-listen cleanup windows: `15`
- Producer Command Center: `46` primary artifacts, `37` review cards, `0` missing primary artifacts
- Review gate audit: `0` errors, `0` warnings
- Manifest readback consistency smoke: `264` checks, `0` failures

Safety remains unchanged:

- `approvalStatus=machine-candidate-needs-human-listen-proof`
- `packageReadyForHumanListen=true`
- `branchInheritanceReady=false`
- `branchRenderReady=false`
- No branch inheritance, branch render, upload, publication, or original-media mutation happened.

Process lesson captured in the work: multiple scripts write to the same `manifest.json`, so manifest-writing refreshes should run sequentially unless we add locking or merge-safe writers. Parallel reads are fine; parallel manifest writers can race and temporarily stale the command-center counts.

## 2026-07-11: Sequential control-plane refresh is the safe default

The Episode 4 v006 audio workflow now has one safe command for refreshing manifest-writing proof surfaces in order:

```bash
python3 apps/QuipslyStudio/script/audio_workbench_sequential_control_plane_refresh.py \
  --baseline-dir "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310" \
  --goal-file "/Users/wall-e/.codex/attachments/b795ff40-20cd-4f54-b41d-4a54c4124952/goal-objective.md"
```

Why this exists:

- Several proof scripts write promoted status fields to `manifest.json`.
- Running those writers in parallel can briefly leave the Producer Command Center, Review Gate, and Manifest Readback Smoke looking at different timestamps.
- The sequential runner refreshes the speaker cleanup acceptance board, post-review action queue, goal audit, manifest smoke, review gate, command center, and final manifest smoke in a deterministic order.

Current v006 result:

- `AUDIO_CONTROL_PLANE_SEQUENTIAL_REFRESH.md`
- Status: `passed`
- Steps: `11`
- Step failures: `0`
- Post-check failures: `0`
- Producer Command Center: `ready-for-human-listen`, `46` primary artifacts, `37` review cards, `0` missing primary artifacts
- Review Gate: passed with `0` errors and `0` warnings
- Manifest Readback Smoke: passed with `264` checks and `0` failures
- Goal Audit: `11` proved, `4` partial, `2` locked, `0` missing

Safety remains unchanged: this runner does not approve audio, unlock branch inheritance, unlock branch rendering, render episode media, upload, publish, or mutate original media. Human listen proof is still the gate before branch inheritance or production renders.

### Review gate failures must be machine-readable

`audio_workbench_review_gate_audit.py` now writes explicit `errors` and `warnings` arrays in addition to `errorCount`, `warningCount`, and the full checks table. Future agents should read those arrays first when a gate fails, then inspect the checks table for broader context.

Latest v006 verification after this change:

- Review Gate: `errors=[]`, `warnings=[]`
- Sequential refresh: `passed`
- Manifest Readback Smoke: `264` checks, `0` failures
- Producer Command Center: `ready-for-human-listen`

## 2026-07-11: Sound Director scorecard added to the audio control plane

Episode 4 v006 now has a Sound Director scorecard that aggregates the scattered proof surfaces into one machine-confidence and review-routing readout. This is intentionally not an approval tool. It summarizes what the machine can prove, what still needs ears, and what the next safe action is.

Added:

- `apps/QuipslyStudio/script/audio_workbench_sound_director_scorecard.py`
- Stable v006 artifacts:
  - `AUDIO_SOUND_DIRECTOR_SCORECARD.json`
  - `AUDIO_SOUND_DIRECTOR_SCORECARD.md`
  - `AUDIO_SOUND_DIRECTOR_SCORECARD.html`
  - `OPEN_AUDIO_SOUND_DIRECTOR_SCORECARD.command`

Integrated into:

- `apps/QuipslyStudio/script/audio_workbench_producer_command_center.py`
- `apps/QuipslyStudio/script/audio_workbench_sequential_control_plane_refresh.py`
- `apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py`

Latest result:

- Status: `machine-sound-director-ready-human-listen-required`
- Machine confidence score: `93.7`
- Categories: `8`
- Hard stops: `0`
- Review risks: `6`
- Missing evidence: `0`
- Repair actions: `0`
- Focused-proof actions: `0`
- Human listen required: `true`
- Producer Command Center: `47` primary artifacts, `38` review cards, `0` missing primary artifacts
- Sequential refresh: `13` steps, `0` step failures, `0` post-check failures
- Manifest Readback Smoke: `289` checks, `0` failures

Safety remains unchanged:

- `approvalStatus=machine-candidate-needs-human-listen-proof`
- `packageReadyForHumanListen=true`
- `branchInheritanceReady=false`
- `branchRenderReady=false`
- No approval, branch inheritance, branch render, upload, publication, or original-media mutation happened.

Meaning: the audio workbench now has a single producer-readable confidence map across loudness, broadcast polish, producer-grade listen risk, speaker cleanup/source balance, smoothness/cadence, technical audition, and review-note routing. The next safe action remains human listen proof, not rendering.

## 2026-07-11: Morning publication-readiness packet added

Episode 4 v006 now has a morning publication-readiness packet for the tired-human handoff. It does not replace the Sound Director scorecard or the human-listen gate. It translates the current machine evidence into the practical question Charlie asked: what audio file can be reviewed or pulled into Premiere in the morning, what is machine-ready, and what still cannot be called published.

Added:

- `apps/QuipslyStudio/script/audio_workbench_morning_publication_readiness_packet.py`
- Stable v006 artifacts:
  - `AUDIO_MORNING_PUBLICATION_READINESS.json`
  - `AUDIO_MORNING_PUBLICATION_READINESS.md`
  - `AUDIO_MORNING_PUBLICATION_READINESS.html`
  - `OPEN_AUDIO_MORNING_PUBLICATION_READINESS.command`

Integrated into:

- `apps/QuipslyStudio/script/audio_workbench_sequential_control_plane_refresh.py`
- `apps/QuipslyStudio/script/audio_workbench_producer_command_center.py`
- `apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py`

Expected meaning:

- `morning-review-ready-human-listen-required` means the WAV/M4A and machine evidence are ready for morning review, but human listen proof is still required before branch inheritance, final episode rendering, upload, scheduling, or publication.
- `needs-audio-workbench-attention` means a hard-stop item must be fixed before Charlie uses the audio as a production spine.
- The packet points to the recommended WAV for Premiere/manual production work and the M4A for fast listening.
- It keeps podcast/RSS, YouTube long-form, and social/shorts packet readiness separate from actual publishing receipts.
- It does not approve audio, unlock branches, render, upload, publish, or mutate original media.

## 2026-07-11 10:02 MDT - Source-balance triage is now a control-plane artifact

Episode 4 v006 now has a repeatable source-balance triage surface generated by `apps/QuipslyStudio/script/audio_workbench_source_balance_triage.py` and refreshed by the sequential audio control plane.

Current verified meaning:
- The scary raw source-balance warning count is not itself a repair order.
- The v006 candidate currently reports 1071 source-balance warnings, but the triage condenses them into 14 representative listen windows and 17 queue-balance items.
- Charlie, Homer, and the reference/clip lane all have machine-proved survival in the master where their registered active windows exist.
- The artifact is a human-listen guide for threshold, room, overlap, and queue-balance checks. It does not approve audio, unlock branch inheritance, render, upload, publish, or mutate originals.

Required surfaces:
- `AUDIO_SOURCE_BALANCE_TRIAGE.json`
- `AUDIO_SOURCE_BALANCE_TRIAGE.md`
- `AUDIO_SOURCE_BALANCE_TRIAGE.html`
- `OPEN_AUDIO_SOURCE_BALANCE_TRIAGE.command`

Control-plane expectation:
- `audio_workbench_sequential_control_plane_refresh.py` regenerates source-balance triage before post-review queue, sound director, command center, and manifest smoke.
- `audio_workbench_manifest_readback_consistency_smoke.py` must prove the triage artifacts exist, manifest readback fields agree, and safety flags remain false.
- `audio_workbench_producer_command_center.py` and `audio_workbench_sound_director_scorecard.py` should route humans to the triage instead of treating the warning count as a mystery blocker.

Latest validation:
- Touched scripts compile with `python3 -m py_compile`.
- Sequential control plane passed with 0 step failures and 0 post-check failures.
- Manifest readback smoke passed with 311 checks and 0 failures.
- Producer Command Center remained `ready-for-human-listen` with 0 missing primary artifacts.
- Audio approval truth stayed locked: `approvalStatus=machine-candidate-needs-human-listen-proof`, `branchInheritanceReady=false`, `branchRenderReady=false`.

## 2026-07-11 10:09 MDT - Human listen decision front door now owns the review runway checklist

Episode 4 v006 now has a refreshed `HUMAN_LISTEN_DECISION_FRONT_DOOR` that includes the current Mission Board, Mission Reel, Source-Balance Triage, Speaker Cleanup Acceptance Board, Sound Director Scorecard, post-review queue, and guarded decision commands.

Current verified front-door truth:
- Status: `ready-for-human-listen-decision`
- Missing required decision artifacts: `0`
- Mission focus windows: `8`
- Mission Reel items: `8`
- Mission Reel duration: `96.535s`
- Source-balance warning count: `1071`
- Source-balance triage windows: `14`
- Source-balance queue items: `17`
- All registered speakers survive in master: `true`
- Speaker cleanup checks: `9/9`
- Speaker cleanup must-listen windows: `15`
- Sound Director score: `94.2`
- Sound Director review risks: `6`
- Post-review repair actions waiting: `0`
- Post-review focused-proof actions waiting: `0`

Control-plane changes:
- `audio_workbench_human_listen_decision_front_door.py` now exposes the review runway checklist instead of only generic decision artifacts.
- `audio_workbench_sequential_control_plane_refresh.py` now regenerates the decision front door before smoke/gate/command-center refresh.
- `audio_workbench_manifest_readback_consistency_smoke.py` now proves the decision front door JSON, Markdown, HTML, open command, checklist counts, and non-mutating safety flags.

Validation:
- Python compile passed for changed scripts.
- Sequential control plane passed with `0` step failures and `0` post-check failures.
- Manifest readback smoke passed with `334` checks and `0` failures.
- Producer Command Center remained `ready-for-human-listen` with `0` missing primary artifacts.
- Approval remained human-listen gated: `approvalStatus=machine-candidate-needs-human-listen-proof`, `branchInheritanceReady=false`, `branchRenderReady=false`.

Meaning: the reviewer no longer has to infer the required listen route from scattered boards. The front door now states the minimum human-listen checklist before any guarded approval can be meaningful.

## 2026-07-11 10:27 MDT - Decision front-door smoke now proves the current review runway

The Human Listen Decision Front Door smoke now checks the current v006 review runway instead of only proving that a generic front-door file exists.

Added/updated:
- `apps/QuipslyStudio/script/audio_workbench_human_listen_decision_front_door_smoke.py`
- `apps/QuipslyStudio/script/audio_workbench_sequential_control_plane_refresh.py`
- `apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py`

The smoke now verifies:
- Stable front-door JSON, Markdown, HTML, and launcher exist.
- Required guarded commands are present.
- Current runway artifacts are listed: Sound Director Scorecard, Mission Board, Mission Reel, Source-Balance Triage, Speaker Cleanup Acceptance Board, and Mission Reel Notes Inbox.
- Mission focus windows, Mission Reel items, source-balance triage windows, and speaker-cleanup must-listen windows are present.
- Registered speakers survive in the master.
- Post-review queue is ready.
- Synthetic approval can dry-run through the guarded bridge.
- Approval without `--confirm-human-listened` is rejected.
- The real v006 baseline remains locked and unmutated.

Latest validation:
- Front-door smoke: `passed`, 28 checks, 0 failures.
- Manifest readback smoke: `passed`, 350 checks, 0 failures.
- Sequential control plane: `passed`, 0 step failures, 0 post-check failures.
- Producer Command Center: `ready-for-human-listen`, 0 missing primary artifacts.
- Audio approval truth remains locked: `approvalStatus=machine-candidate-needs-human-listen-proof`, `branchInheritanceReady=false`, `branchRenderReady=false`.

Meaning: the human decision route is now smoke-tested against the actual current review checklist. This makes the first Charlie/Mako listen safer and calmer, but it still does not replace the human listen decision.



## 2026-07-11 16:44:32Z - Speaker cleanup listen reel added

- Added a compact speaker-cleanup listen reel to the Episode 4 v006 audio review runway.
- The reel renders the 15 speaker-cleanup naturalness windows into one derived M4A plus Markdown, HTML, playlist, chapter CSV, and launcher artifacts.
- This is review evidence only: it does not approve the candidate, unlock branch inheritance, render episode branches, upload, publish, or mutate original media.
- The front door, producer command center, manifest readback smoke, sequential refresh, and goal audit now treat the reel as part of the human-listen contract.

### 2026-07-11 checkpoint - Audio Defect Atlas notes inbox

Episode 4 v006 now has a scoped return path for human notes against the Audio Defect Atlas.

Added:
- `apps/QuipslyStudio/script/audio_workbench_defect_atlas_notes_inbox.py`
- `apps/QuipslyStudio/script/audio_workbench_defect_atlas_notes_inbox_smoke.py`

Stable artifacts in the v006 baseline directory:
- `AUDIO_DEFECT_ATLAS_NOTES_TEMPLATE.json`
- `AUDIO_DEFECT_ATLAS_NOTES_TEMPLATE.md`
- `AUDIO_DEFECT_ATLAS_NOTES_INBOX.json`
- `AUDIO_DEFECT_ATLAS_NOTES_INBOX.md`
- `AUDIO_DEFECT_ATLAS_NOTES_INBOX.html`
- `OPEN_AUDIO_DEFECT_ATLAS_NOTES_INBOX.command`
- `AUDIO_DEFECT_ATLAS_NOTES_INBOX_SMOKE.json`
- `AUDIO_DEFECT_ATLAS_NOTES_INBOX_SMOKE.md`

Current validated truth:
- Notes inbox status: `waiting-for-defect-atlas-notes`.
- Matching candidate notes packets: `0`.
- Repair actions: `0`.
- Focused-proof actions: `0`.
- Pass-context actions: `0`.
- Unknown atlas item notes: `0`.
- Notes inbox smoke passed with `7` scenarios and `0` failures.
- Manifest readback smoke passed with `443` checks and `0` failures.
- Human listen decision front door remains `ready-for-human-listen-decision` with `0` missing required artifacts.
- Producer Command Center remains `ready-for-human-listen` with `53` primary artifacts and `0` missing primary artifacts.

Guardrail preserved:
- The inbox converts exact-baseline, exact-atlas human notes into scoped repair/proof/pass-context actions only.
- It does not approve v006, fail v006, unlock branch inheritance, render branches, upload, publish, or mutate originals.
- Unknown atlas item IDs and wrong-baseline packets are rejected or held as incomplete rather than trusted.

### 2026-07-11 checkpoint - Defect Atlas notes feed the unified post-review queue

The Audio Defect Atlas notes inbox is now connected to the unified post-review action queue instead of living as a standalone return path.

Changed:
- `apps/QuipslyStudio/script/audio_workbench_post_review_action_queue.py`
- `apps/QuipslyStudio/script/audio_workbench_sequential_control_plane_refresh.py`
- `apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py`

Validated current truth:
- Post-review queue status: `ready-for-review-actions`.
- Post-review queue source count: `13`.
- Defect Atlas notes source registered: `true`.
- Sources with notes candidates: `2`.
- Repair actions: `0`.
- Focused-proof actions: `0`.
- Pass-context actions: `0`.
- Defect Atlas notes inbox status: `waiting-for-defect-atlas-notes`.
- Defect Atlas notes inbox smoke passed: `true`.
- Sequential control-plane refresh passed with `0` step failures and `0` post-check failures.
- Manifest readback smoke passed with `445` checks and `0` failures.
- Producer Command Center remains `ready-for-human-listen` with `53` primary artifacts and `0` missing primary artifacts.

Guardrail preserved:
- The queue can now route Defect Atlas notes into shared repair/proof/pass-context visibility after notes exist.
- It still does not approve v006, fail v006, unlock branch inheritance, render branches, upload, publish, or mutate originals.
- The queue now writes `audioPostReviewActionQueueLatestDefectAtlasNotesSourceRegistered=true`, and manifest smoke checks it so the lane cannot silently disappear.

## 2026-07-11 checkpoint - final listen mission packet is the calm reviewer front door

Status: in progress, not complete.

Added `audio_workbench_final_listen_mission_packet.py` to turn the many v006 review surfaces into one smallest-sufficient listen path. The packet is a routing surface only: it does not approve audio, unlock branch inheritance, render branches, upload, publish, or mutate original/source media.

Current stable artifacts in the v006 candidate folder:

- `AUDIO_FINAL_LISTEN_MISSION_PACKET.json`
- `AUDIO_FINAL_LISTEN_MISSION_PACKET.md`
- `AUDIO_FINAL_LISTEN_MISSION_PACKET.html`
- `OPEN_AUDIO_FINAL_LISTEN_MISSION_PACKET.command`

Control-plane integration:

- Sequential refresh now regenerates the final listen mission packet before goal audit and final smoke/gate/command-center passes.
- Manifest readback smoke verifies the mission packet status, step counts, missing-required count, and safety fields.
- Producer Command Center lists the mission packet as a primary artifact and review card.
- Goal completion audit includes the mission packet in the workflow and next-safe-action requirements.

Validated current truth:

- `audioFinalListenMissionPacketLatestStatus=ready-for-final-human-listen-mission`
- `audioFinalListenMissionPacketMissionStepCount=7`
- `audioFinalListenMissionPacketMissingRequiredArtifactCount=0`
- `audioFinalListenMissionPacketReadyForFinalHumanListen=true`
- `audioManifestReadbackConsistencySmokePassed=true`
- `audioManifestReadbackConsistencySmokeCheckCount=467`
- `audioManifestReadbackConsistencySmokeFailureCount=0`
- `audioControlPlaneSequentialRefreshLatestStatus=passed`
- `audioControlPlaneSequentialRefreshStepFailureCount=0`
- `audioControlPlaneSequentialRefreshPostCheckFailureCount=0`
- `audioProducerCommandCenterLatestStatus=ready-for-human-listen`
- `audioProducerCommandCenterPrimaryArtifactCount=54`
- `audioProducerCommandCenterMissingPrimaryArtifactCount=0`

Lock truth remains unchanged:

- `approvalStatus=machine-candidate-needs-human-listen-proof`
- `packageReadyForHumanListen=true`
- `branchInheritanceReady=false`
- `branchRenderReady=false`

Next safest action:

- Open `OPEN_AUDIO_FINAL_LISTEN_MISSION_PACKET.command`, listen through the Mission Reel and Speaker Cleanup Reel, inspect the Audio Defect Atlas for any questionable moments, return notes through the notes inbox/queue, then use the guarded Human Listen Decision Front Door only after actual listening.

## 2026-07-11 checkpoint - scoped v007 repair planning now has a safe runway

Status: in progress, not complete.

Added a scoped v007 repair-candidate planner downstream of the unified post-review action queue. The purpose is to prevent the next failed-listen note from becoming another broad magic-box rerun: returned repair/proof notes now have a stage-owned planning surface that preserves v006 as evidence and prepares exact proof-window candidate paths.

Changed:
- `apps/QuipslyStudio/script/audio_workbench_scoped_v007_repair_candidate_planner.py`
- `apps/QuipslyStudio/script/audio_workbench_sequential_control_plane_refresh.py`
- `apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py`
- `apps/QuipslyStudio/script/audio_workbench_final_listen_mission_packet.py`
- `apps/QuipslyStudio/script/audio_workbench_producer_command_center.py`
- `apps/QuipslyStudio/script/audio_workbench_goal_completion_audit.py`

Intended behavior:
- If no returned human notes exist, the planner reports `waiting-for-human-review-actions`.
- If repair/proof notes exist, it groups them by owning stage and prepares scoped v007 candidate plans.
- It does not approve v006, fail v006 by itself, unlock branch inheritance, render media, upload, publish, or mutate original/source media.
- The correct path remains: listen -> return exact notes -> post-review action queue -> scoped v007 planner -> proof-window candidate -> A/B listen -> only then consider promotion.

This keeps v006 locked until real human listen proof exists while making the first post-listen repair step much less spooky.

## 2026-07-11 checkpoint - scoped v007 planner smoke covers future notes

Status: in progress, not complete.

Added a smoke test for the scoped v007 repair-candidate planner. The live v006 baseline currently has no returned repair/proof notes, so the direct planner correctly waits. The smoke uses temporary manifests to prove future queue states before a reviewer depends on them.

Changed:
- `apps/QuipslyStudio/script/audio_workbench_scoped_v007_repair_candidate_planner_smoke.py`
- `apps/QuipslyStudio/script/audio_workbench_sequential_control_plane_refresh.py`
- `apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py`
- `apps/QuipslyStudio/script/audio_workbench_producer_command_center.py`
- `apps/QuipslyStudio/script/audio_workbench_goal_completion_audit.py`

Smoke coverage:
- missing post-review queue -> planner reports `needs-post-review-action-queue`
- no returned notes -> planner reports `waiting-for-human-review-actions`
- repair note -> planner creates a scoped repair plan
- focused-proof note -> planner creates a scoped proof plan
- mixed repair/proof/pass-context notes -> planner creates only repair/proof candidate plans while preserving pass context

The smoke preserves real approval/branch truth and does not render media, upload, publish, or mutate originals.

## 2026-07-11: Human-listen front door now exposes scoped v007 repair planning

The Episode 4 v006 human-listen decision front door now includes the scoped v007 repair-candidate plan and its smoke evidence as required reviewer artifacts. This keeps the final human-review route calm: if the listen passes, record the guarded decision and refresh branch gates; if the listen fails or needs focused proof, route exact notes into the scoped v007 planner instead of rerunning the whole audio chain.

Validated current truth after serialized refresh:

- `humanListenDecisionFrontDoorStatus=ready-for-human-listen-decision`
- `humanListenDecisionFrontDoorMissingRequiredArtifactCount=0`
- `humanListenDecisionFrontDoorScopedV007PlanStatus=waiting-for-human-review-actions`
- `humanListenDecisionFrontDoorScopedV007PlanQueueStatus=ready-for-review-actions`
- `humanListenDecisionFrontDoorScopedV007PlanSourceWithNotesCandidateCount=2`
- `humanListenDecisionFrontDoorScopedV007PlanRepairActionCount=0`
- `humanListenDecisionFrontDoorScopedV007PlanFocusedProofActionCount=0`
- `humanListenDecisionFrontDoorScopedV007PlanPlannedItemCount=0`
- `humanListenDecisionFrontDoorScopedV007PlanSmokePassed=true`
- `humanListenDecisionFrontDoorScopedV007PlanSmokeScenarioCount=5`
- `humanListenDecisionFrontDoorScopedV007PlanSmokeFailureCount=0`
- `audioManifestReadbackConsistencySmokeCheckCount=525`
- `audioManifestReadbackConsistencySmokeFailureCount=0`

Safety truth remains unchanged: no approval, branch unlock, branch render, upload, publication, or original/source media mutation happened.

## 2026-07-11: Episode 4 audio workbench blocked at honest human/external gates

The current v006 audio workbench is review-ready and machine-packaged, but not complete. The latest goal audit reports 12 proved, 4 partial, 2 locked, and 0 missing requirements. The unresolved requirements are not missing code paths: they require real human listening, optional returned dxRevive bounces, or applying the reusable profile to another messy episode.

Primary reviewer entry points:

- Final listen mission: 
- Episode audio review launcher: Opening Quipsly Episode 4 audio review...
Opening producer command center...
Opening human approval preflight...
Opening unresolved requirement review...
Opening audio production doctrine...
Opening audio transformation lineage ledger...
Opening audio transformation lineage ledger smoke...
Opening audio workbench stage control surface...
Opening final-listen fast pass...
Opening broadcast polish scorecard...
Opening smoothness proof pack...
Opening producer-grade audio audit...
Opening post-review action queue...
Opening listen-priority console...
Opening parameter sweep proof snippets...
Opening listen-priority snippet pack...
Opening listen-priority review reel...
Opening source-balance listen companion...
Opening audio master visual overview...
Opening marker review console...
Opening START_HERE markdown...
- Human-listen decision front door: 
- Scoped v007 repair planner: 
- dxRevive return workbench: 

Do not unlock branch inheritance or render publication branches until the guarded human-listen decision records a pass. If the listen fails or needs proof, preserve v006 and route exact notes into scoped v007 repair planning.

## 2026-07-12 checkpoint: quality methods matrix added

Added `audio_workbench_quality_methods_matrix.py` to keep the quality target explicit. The current proof target is the Episode 4 mastered audio spine. Final episode and shorts quality are downstream gates that add editorial pacing, visual edit decisions, clip integration, platform packages, and receipts.

Validated state after sequential refresh:
- Quality matrix status: `quality-methods-matrix-ready`
- Methods: `5`
- Implemented methods: `3`
- Recommended next methods: `1`
- Hard stops: `0`
- Review risks: `13`
- Manifest readback smoke: `572` checks, `0` failures
- Goal audit: `14 proved`, `4 partial`, `2 locked`, `0 missing`

The matrix is now linked through the manifest, Producer Command Center, manifest readback smoke, and goal-completion audit. It does not approve audio, unlock branches, render, upload, publish, or mutate originals.

## 2026-07-12 checkpoint: Episode 4 morning audio review launcher added

Added `audio_workbench_morning_audio_review_launcher.py` as the practical morning door for Episode 4 v006 review. The stable command is:

`/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/OPEN_EPISODE_4_MORNING_AUDIO_REVIEW.command`

It opens the review HTML, opens the listening M4A, reveals the WAV handoff for Premiere, and points back to the guarded review/decision flow. It is wired into sequential refresh, manifest readback smoke, Producer Command Center, and goal completion audit.

Validated state:
- Morning launcher: `ready-for-morning-audio-review`
- Hard stops: `0`
- Manifest smoke: `589` checks, `0` failures
- Goal audit: `15 proved`, `4 partial`, `2 locked`, `0 missing`

The launcher is a review handoff only. It does not approve audio, unlock branches, render branches, upload, publish, or mutate originals.

## 2026-07-12 checkpoint: Episode 4 post-listen episode runway added

Added `audio_workbench_post_listen_episode_runway.py` so the workbench now separates three gates cleanly:

- Audio-spine quality: v006 mastered audio must pass human listen proof first.
- Final episode quality: long-form video and audio-only podcast packages are downstream branch renders after the spine is approved.
- Shorts quality: 9:16 shorts add hook, pacing, caption, aspect, and platform checks after the shared spine is trusted.

The stable command is:

`/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/OPEN_EPISODE_4_POST_LISTEN_RUNWAY.command`

The runway exposes pass/fail/needs-proof routes: a pass uses the guarded human listen decision front door before branch gates refresh; a fail or needs-proof returns exact notes into scoped v007 repair/proof planning. It is wired into sequential refresh, manifest readback smoke, Producer Command Center, and goal completion audit.

It does not approve audio, unlock branches, render branches, upload, publish, or mutate originals.

<!-- episodes-1-6-audio-rollout-board:start -->
## 2026-07-12 checkpoint: Episodes 1-6 audio rollout board

Added a non-mutating rollout board that maps the Episode 4 audio workbench pattern to Episodes 1-6. The board keeps the current quality target explicit: Episode 4 v006 is the high-quality audio spine proof target, while final episode and shorts branches remain locked until the spine passes human listening. It inventories available external-drive review/media roots, identifies which episodes can enter reusable-profile intake, and records safety booleans proving no approval, branch, render, upload, publication, or original-media mutation occurred.

<!-- episodes-1-6-audio-rollout-board:end -->

<!-- audio-spine-quality-gate:start -->
## 2026-07-12 checkpoint: Audio spine quality gate

Added a top-level audio spine quality gate for Episode 4 v006. The gate aggregates file integrity, delivery loudness, broadcast polish, speaker survival/source balance, human/agent reviewability, and branch/publication truth. It records a machine-ready/human-listen-required state when objective checks pass but human naturalness approval is still pending. It does not approve audio, unlock branches, render, upload, publish, or mutate source media.

<!-- audio-spine-quality-gate:end -->

<!-- episodes-1-6-media-inventory-preflight:start -->
## 2026-07-12 checkpoint: Episodes 1-6 media inventory preflight

Added a non-mutating media inventory preflight for Episodes 1-6. The preflight scans known external-drive episode roots, probes bounded audio/video metadata with ffprobe, and identifies likely audio spine candidates so the Episode 4 source-aware cleanup workflow can be applied to other episodes without guessing, syncing, rendering, publishing, or mutating originals.

<!-- episodes-1-6-media-inventory-preflight:end -->


<!-- machine-listen-sentinel:start -->
## 2026-07-12 checkpoint: Machine listen sentinel

Added a machine-listen sentinel for the Episode 4 v006 audio spine. The sentinel directly measures the mastered WAV/M4A with ffprobe/FFmpeg and streamed PCM analysis, including file shape, loudnorm integrated loudness/true peak/LRA evidence, silence/gap behavior, channel balance, near-clip samples, active audio ratio, and inherited speaker-survival gate truth.

The sentinel is control-plane evidence only. It does not approve audio, unlock branches, render final episode or shorts branches, upload, publish, or mutate source media. Its purpose is to make the morning question sharper: is the current high-quality audio spine technically safe enough for Charlie's human listen and later branch inheritance after approval?
<!-- machine-listen-sentinel:end -->

## 2026-07-12 checkpoint: translation survival audit

Added a non-destructive delivery/device translation survival audit for the Episode 4 v006 mastered audio spine.

Purpose:
- Test whether bounded proof windows survive practical platform and listener transformations before final episode or shorts branches inherit the spine.
- Keep this separate from final branch renders, uploads, publication, and approval.

Current artifact:
- `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/AUDIO_TRANSLATION_SURVIVAL_AUDIT.html`

Latest result:
- Status: `translation-survival-audit-ready`
- Translation renders: `12`
- Hard stops: `0`
- Review risks: `0`
- Derived review media rendered: `true`
- Final branch render attempted: `false`
- Upload attempted: `false`
- Publication attempted: `false`
- Original media mutated: `false`

Research basis:
- Apple Podcasts points audio metering at ITU-R BS.1770/LKFS-style loudness and true-peak discipline.
- Spotify accepts MP3, M4A, and WAV audio episodes, so Quipsly auditions AAC/MP3 survival before branch inheritance.
- EBU R 128 and ITU-R BS.1770 are useful metering discipline, but do not replace human naturalness review.

Product meaning:
- The v006 spine has stronger machine evidence than before.
- The active gate remains Charlie's human listen decision.
- Final episode and shorts branches remain locked until that guarded listen passes.

## 2026-07-12 checkpoint: translation survival wired into control plane

The Episode 4 v006 translation survival audit is now part of the regular audio control plane instead of a one-off proof artifact.

Changed:
- `apps/QuipslyStudio/script/audio_workbench_sequential_control_plane_refresh.py`
- `apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py`
- `apps/QuipslyStudio/script/audio_workbench_producer_command_center.py`
- `apps/QuipslyStudio/script/audio_workbench_quality_methods_matrix.py`

Latest validation:
- Sequential refresh: `passed`
- Ordered steps: `53`
- Step failures: `0`
- Post-check failures: `0`
- Manifest readback: `805` checks, `0` failures
- Producer command center: `64` primary artifacts, `47` review cards, `0` missing primary artifacts
- Quality methods matrix implemented methods increased to `4`
- Translation survival: `translation-survival-audit-ready`, `12` derived proof renders, `0` hard stops, `0` review risks

Safety truth:
- `approvalStatus=machine-candidate-needs-human-listen-proof`
- `branchInheritanceReady=false`
- `branchRenderReady=false`
- Final branch render attempted: `false`
- Upload attempted: `false`
- Publication attempted: `false`
- Original media mutated: `false`

Product meaning:
- Future control-plane refreshes must keep the translation survival layer green before the audio spine can safely feed final episode and shorts branches.
- The current gate remains Charlie's human listen decision.

## 2026-07-12 checkpoint: morning listen path includes translation survival

The reviewer-facing Episode 4 morning listen path now exposes translation survival directly instead of leaving it only in the Producer Command Center.

Changed:
- `apps/QuipslyStudio/script/audio_workbench_morning_audio_review_launcher.py`
- `apps/QuipslyStudio/script/audio_workbench_post_listen_episode_runway.py`

What changed:
- Morning review launcher includes the translation survival audit link, status, hard-stop count, and review-risk count.
- The grave-shift fast path now includes a step to check translation survival before recording guarded approval.
- Post-listen runway includes translation survival in the pass route before branch inheritance/preflight/executor.

Validation:
- Sequential refresh: `passed`
- Ordered steps: `53`
- Step failures: `0`
- Post-check failures: `0`
- Manifest readback: `805` checks, `0` failures
- Producer command center: `64` primary artifacts, `47` review cards, `0` missing primary artifacts
- Morning launcher: `ready-for-morning-audio-review`, `0` hard stops, `4` critical checks
- Post-listen runway: `waiting-for-human-listen`, `0` hard stops, `3` routes
- Translation survival: `translation-survival-audit-ready`, `0` hard stops, `0` review risks

Lock truth remains unchanged:
- `approvalStatus=machine-candidate-needs-human-listen-proof`
- `packageReadyForHumanListen=true`
- `branchInheritanceReady=false`
- `branchRenderReady=false`

Meaning:
- Charlie's next listen path is calmer and more complete: listen to v006, check critical moments, check translation survival, then use guarded pass/fail/needs-proof.
- Final episode and shorts branches remain locked until the human listen pass is recorded.

## 2026-07-12 checkpoint: Episode 4 morning-publish quality gate

The current Episode 4 gate is the high-quality v006 mastered audio spine, not final episode or shorts renders. The morning-review launcher now round-trips translation-survival readiness/status/hard-stop/risk fields into the manifest, and the manifest readback smoke proves those fields alongside the standalone translation-survival audit. Branch inheritance and final renders remain locked until Charlie completes the guarded human listen pass.

Latest validated control-plane evidence:
- `audioControlPlaneSequentialRefreshLatestStatus=passed`
- `audioControlPlaneSequentialRefreshStepCount=53`
- `audioControlPlaneSequentialRefreshStepFailureCount=0`
- `audioControlPlaneSequentialRefreshPostCheckFailureCount=0`
- `audioManifestReadbackConsistencySmokePassed=True`
- `audioManifestReadbackConsistencySmokeCheckCount=810`
- `audioManifestReadbackConsistencySmokeFailureCount=0`
- `audioMorningAudioReviewLauncherTranslationSurvivalReady=True`
- `audioMorningAudioReviewLauncherTranslationSurvivalStatus=translation-survival-audit-ready`
- `audioMorningAudioReviewLauncherTranslationSurvivalHardStopCount=0`
- `audioMorningAudioReviewLauncherTranslationSurvivalReviewRiskCount=0`
- `approvalStatus=machine-candidate-needs-human-listen-proof`
- `packageReadyForHumanListen=True`
- `branchInheritanceReady=False`
- `branchRenderReady=False`

## 2026-07-12 checkpoint: spectral fatigue audit added

Added `apps/QuipslyStudio/script/audio_workbench_spectral_fatigue_audit.py` as a non-destructive Episode 4 v006 audio-spine quality method.

What it checks:
- Samples 7 bounded windows: the 4 critical proof windows plus broad early/middle/late episode samples.
- Measures 7 rough voice/sound bands with `ffmpeg` filters: sub/rumble, warmth, mud, body, presence/intelligibility, harshness, and air/hiss.
- Flags review risks for rumble competing with voice, muddy/boxy energy, thinness, harshness, hiss, and rough over-squash or uneven crest behavior.

Stable artifact:
- `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/AUDIO_SPECTRAL_FATIGUE_AUDIT.html`

Latest result:
- `audioSpectralFatigueAuditLatestStatus=spectral-fatigue-ready-with-review-risks`
- `audioSpectralFatigueAuditWindowCount=7`
- `audioSpectralFatigueAuditBandCount=7`
- `audioSpectralFatigueAuditMeasurementCount=49`
- `audioSpectralFatigueAuditFailedMeasurementCount=0`
- `audioSpectralFatigueAuditHardStopCount=0`
- `audioSpectralFatigueAuditReviewRiskCount=21`
- `audioSpectralFatigueAuditMachineReadyForHumanListen=true`
- render/upload/publication/original mutation flags remain false.

Control-plane validation:
- `audioControlPlaneSequentialRefreshLatestStatus=passed`
- `audioControlPlaneSequentialRefreshStepCount=56`
- `audioControlPlaneSequentialRefreshStepFailureCount=0`
- `audioControlPlaneSequentialRefreshPostCheckFailureCount=0`
- `audioManifestReadbackConsistencySmokePassed=true`
- `audioManifestReadbackConsistencySmokeCheckCount=838`
- `audioManifestReadbackConsistencySmokeFailureCount=0`
- `audioProducerCommandCenterPrimaryArtifactCount=65`
- `audioProducerCommandCenterReviewCardCount=48`
- `audioProducerCommandCenterMissingPrimaryArtifactCount=0`
- `audioQualityMethodsMatrixMethodCount=10`
- `audioQualityMethodsMatrixImplementedMethodCount=5`

Product meaning:
- The v006 audio spine now has a stronger listener-fatigue/voice-band warning layer.
- The 21 review risks are listen targets, not automatic repair orders.
- Final episode and shorts branches remain locked until Charlie records the guarded human listen decision.

## 2026-07-12 checkpoint: spectral fatigue surfaced in morning review and post-listen runway

The Episode 4 v006 review path now exposes the spectral fatigue audit in the morning audio review launcher and post-listen episode runway. The audit is a listen-target tool, not an automatic repair order: it highlights rumble, mud, thinness, harshness, hiss, and over-squash risks so Charlie can make a faster guarded human listen decision after grave shift.

Validation:
- `audioControlPlaneSequentialRefreshLatestStatus=passed`
- `audioControlPlaneSequentialRefreshStepCount=56`
- `audioControlPlaneSequentialRefreshStepFailureCount=0`
- `audioControlPlaneSequentialRefreshPostCheckFailureCount=0`
- `audioManifestReadbackConsistencySmokePassed=true`
- `audioManifestReadbackConsistencySmokeCheckCount=845`
- `audioManifestReadbackConsistencySmokeFailureCount=0`
- `audioMorningAudioReviewLauncherLatestStatus=ready-for-morning-audio-review`
- `audioMorningAudioReviewLauncherSpectralFatigueStatus=spectral-fatigue-ready-with-review-risks`
- `audioMorningAudioReviewLauncherSpectralFatigueHardStopCount=0`
- `audioMorningAudioReviewLauncherSpectralFatigueReviewRiskCount=21`
- `audioPostListenEpisodeRunwayLatestStatus=waiting-for-human-listen`
- `audioPostListenEpisodeRunwaySpectralFatigueStatus=spectral-fatigue-ready-with-review-risks`
- `audioPostListenEpisodeRunwaySpectralFatigueHardStopCount=0`
- `audioPostListenEpisodeRunwaySpectralFatigueReviewRiskCount=21`

Current lock truth remains intentional:
- `approvalStatus=machine-candidate-needs-human-listen-proof`
- `packageReadyForHumanListen=true`
- `branchInheritanceReady=false`
- `branchRenderReady=false`

Meaning: the goal is not blocked by automation. It is gated on Charlie's real human listen of the v006 spine. If the listen passes, branch inheritance and final Episode 4 episode/short rendering can unlock. If it fails, notes route into scoped v007 proof/repair without overwriting v006.

## 2026-07-12 checkpoint: master smoothness audit promoted into current control plane

The existing `audio_workbench_master_smoothness_audit.py` is now part of the sequential control-plane refresh instead of stale side evidence. This strengthens quality determination for Episode 4 v006 by keeping full-spine envelope contour evidence current alongside platform loudness, machine listen sentinel, spectral fatigue, and translation survival.

Changed:
- `apps/QuipslyStudio/script/audio_workbench_master_smoothness_audit.py`
- `apps/QuipslyStudio/script/audio_workbench_sequential_control_plane_refresh.py`
- `apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py`
- `apps/QuipslyStudio/script/audio_workbench_quality_methods_matrix.py`
- `apps/QuipslyStudio/script/audio_workbench_producer_command_center.py`

Updated behavior:
- Master smoothness now writes stable manifest fields for status, pass state, window count, transition count, listen-check count, review-target count, long silence count, contour classifications, and safety flags.
- Sequential refresh now reruns the smoothness audit before gate, after gate, and final.
- Manifest readback now verifies smoothness report presence, markdown presence, promoted summary fields, and non-mutating safety flags.
- Quality methods matrix now includes `Master envelope and smoothness contour` as an implemented method.
- Producer Command Center now exposes `Master smoothness audit` as a primary artifact.

Validation:
- `audioControlPlaneSequentialRefreshLatestStatus=passed`
- `audioControlPlaneSequentialRefreshStepCount=59`
- `audioControlPlaneSequentialRefreshStepFailureCount=0`
- `audioControlPlaneSequentialRefreshPostCheckFailureCount=0`
- `audioManifestReadbackConsistencySmokePassed=true`
- `audioManifestReadbackConsistencySmokeCheckCount=869`
- `audioManifestReadbackConsistencySmokeFailureCount=0`
- `audioMasterSmoothnessAuditLatestStatus=smoothness-audit-ready`
- `audioMasterSmoothnessAuditPassed=true`
- `audioMasterSmoothnessAuditWindowCount=27200`
- `audioMasterSmoothnessAuditTransitionCount=27199`
- `audioMasterSmoothnessAuditListenCheckCount=3165`
- `audioMasterSmoothnessAuditReviewRiskCount=60`
- `audioMasterSmoothnessAuditHardStopCount=0`
- `audioProducerCommandCenterLatestStatus=ready-for-human-listen`
- `audioProducerCommandCenterPrimaryArtifactCount=66`
- `audioProducerCommandCenterMissingPrimaryArtifactCount=0`
- `audioQualityMethodsMatrixMethodCount=11`
- `audioQualityMethodsMatrixImplementedMethodCount=6`

Current lock truth remains intentional:
- `approvalStatus=machine-candidate-needs-human-listen-proof`
- `packageReadyForHumanListen=true`
- `branchInheritanceReady=false`
- `branchRenderReady=false`

Meaning: the goal is still gated on Charlie's human listen of v006, not blocked by automation. The new smoothness evidence gives a stronger way to find listener-fatigue, hard-edge, and long-gap risks before final episode/short branches inherit the audio spine.
